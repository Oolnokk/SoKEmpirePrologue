// combat.js — Full attack system matching reference HTML (tap/hold, charge, combo, queue)
import { pushPoseOverride, pushPoseLayerOverride } from './animator.js?v=3';
import { resetMirror, setMirrorForPart } from './sprites.js?v=8';
import { ensureFighterPhysics, updateFighterPhysics } from './physics.js?v=1';

export function initCombat(){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  console.log('[combat] CONFIG.presets:', C.presets);
  console.log('[combat] CONFIG keys:', Object.keys(C));
  G.combat = makeCombat(G, C, { fighterKey: 'player', poseTarget: 'player' });
  console.log('[combat] ready');
}

export function initCombatForFighter(fighterKey, options = {}){
  const G = (window.GAME ||= {});
  const C = window.CONFIG || {};
  const combat = makeCombat(G, C, {
    fighterKey,
    poseTarget: options.poseTarget || fighterKey,
    ...options,
  });
  const storeKey = options.storeKey || `${fighterKey}Combat`;
  G[storeKey] = combat;
  return combat;
}

export function makeCombat(G, C, options = {}){
  const {
    fighterKey = 'player',
    poseTarget = fighterKey,
    fighterLabel = fighterKey,
    getFighter,
    inputSource,
    inputKey,
    inputObject,
    autoProcessInput = true,
    neutralizeInputMovement = fighterKey === 'player',
    selectedAbilitiesKey = 'selectedAbilities',
    selectedAbilities,
  } = options || {};

  const resolveFighter = () => {
    if (typeof getFighter === 'function') {
      try {
        const value = getFighter(G, C);
        if (value) return value;
      } catch (err) {
        console.warn('[combat] getFighter error', err);
      }
    } else if (getFighter && typeof getFighter === 'object') {
      return getFighter;
    }
    return G.FIGHTERS?.[fighterKey];
  };

  let cachedInput = null;
  const resolveInput = () => {
    if (typeof inputSource === 'function') {
      const result = inputSource(G, C);
      if (result) return result;
      return {};
    }
    if (inputObject) {
      cachedInput = inputObject;
      return cachedInput;
    }
    if (cachedInput) return cachedInput;
    const key = inputKey || (fighterKey === 'player' ? 'input' : `${fighterKey}Input`);
    const source = (G[key] ||= {});
    cachedInput = source;
    return source;
  };

  const now = ()=> performance.now();
  const P = resolveFighter;
  const logPrefix = `[combat:${fighterLabel}]`;
  
  const abilitySystem = normalizeAbilitySystem(C.abilitySystem || {});
  const ABILITY_THRESHOLDS = abilitySystem.thresholds;
  const ABILITY_DEFAULTS = abilitySystem.defaults;
  const ABILITY_ATTACKS = abilitySystem.attacks;
  const ABILITY_ABILITIES = abilitySystem.abilities;
  const ABILITY_SLOTS = abilitySystem.slots;

  const applySelectedAbilitiesFromGame = () => {
    const selections = selectedAbilities || G[selectedAbilitiesKey] || {};
    Object.entries(selections).forEach(([slotKey, slotValues]) => {
      const slot = ABILITY_SLOTS[slotKey];
      if (!slot || !slotValues) return;
      if (slotValues.light !== undefined) {
        slot.lightAbilityId = slotValues.light || null;
      }
      if (slotValues.heavy !== undefined) {
        slot.heavyAbilityId = slotValues.heavy || null;
      }
    });
  };

  applySelectedAbilitiesFromGame();

  const ATTACK = {
    active: false,
    preset: null,
    slot: null,
    downTime: 0,
    facingRadAtPress: 0,
    dirSign: 1,
    isCharging: false,
    isHoldRelease: false,
    chargeStage: 0,
    context: null,
    pendingAbilityId: null,
    sequenceTimers: []
  };

  const CHARGE = {
    active: false,
    stage: 0,
    startTime: 0
  };

  const PRESS = {};

  function getPressState(slotKey){
    if (!slotKey) return null;
    if (!PRESS[slotKey]){
      PRESS[slotKey] = {
        id: 0,
        downTime: 0,
        tapHandled: true,
        holdHandled: true,
        active: false,
        lastTap: null
      };
    }
    return PRESS[slotKey];
  }

  const QUEUE = {
    pending: false,
    type: null,
    button: null,
    abilityId: null,
    chargeStage: 0,
    downTime: 0
  };

  const COMBO = {
    hits: 0,
    sequenceIndex: 0,
    timer: 0,
    lastAbilityId: null
  };

  const TRANSITION = {
    active: false,
    target: null,
    elapsed: 0,
    duration: 0,
    callback: null,
    layerHandles: [],
    tokenCounter: 0,
    activeToken: 0
  };

  const debugLog = (...args) => {
    if (console?.debug) {
      console.debug(logPrefix, ...args);
    } else {
      console.log(logPrefix, ...args);
    }
  };

  const inferActiveCollidersForPreset = (presetName) => {
    if (!presetName) return [];
    const upper = String(presetName).toUpperCase();
    if (upper.startsWith('KICK')) return ['footL', 'footR'];
    if (upper.startsWith('PUNCH')) return ['handL', 'handR'];
    if (upper.startsWith('SLAM')) return ['handL', 'handR', 'footL', 'footR'];
    return [];
  };

  function cancelQueuedLayerOverrides(){
    if (!Array.isArray(TRANSITION.layerHandles) || TRANSITION.layerHandles.length === 0) return;
    const handles = TRANSITION.layerHandles.splice(0, TRANSITION.layerHandles.length);
    handles.forEach(handle => {
      if (handle && typeof handle.cancel === 'function'){
        try { handle.cancel(); } catch(err){ console.warn('[combat] failed to cancel layer override', err); }
      }
    });
  }

  function registerTransitionLayerHandle(handle){
    if (!handle) return;
    const list = TRANSITION.layerHandles;
    list.push(handle);
    if (typeof handle.onSettle === 'function'){
      handle.onSettle(()=>{
        const idx = list.indexOf(handle);
        if (idx !== -1) list.splice(idx, 1);
      });
    }
  }

  const formatIdentifier = (value, fallback = 'Unknown') => {
    if (!value && value !== 0) return fallback;
    const result = String(value)
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
      .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
      .replace(/([0-9]+)/g, ' $1 ')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/\b\w/g, (char) => char.toUpperCase());
    return result || fallback;
  };

  const getAbilityDisplayName = (abilityId, ability) => {
    return ability?.name
      || ABILITY_ABILITIES[abilityId]?.name
      || formatIdentifier(abilityId, 'Unknown Ability');
  };

  const getAttackDisplayName = (attackId, attack) => {
    return attack?.name
      || ABILITY_ATTACKS[attackId]?.name
      || formatIdentifier(attackId, 'Unknown Attack');
  };

  const getMoveDisplayName = (context) => {
    const presetKey = context?.preset || context?.attack?.preset || context?.attackId;
    if (!presetKey) return 'Unknown Move';
    if (C.moves?.[presetKey]?.name) return C.moves[presetKey].name;
    if (typeof presetKey === 'string') {
      const upperKey = presetKey.toUpperCase();
      if (C.moves?.[upperKey]?.name) return C.moves[upperKey].name;
      const pascalKey = formatIdentifier(presetKey).replace(/\s+/g, '');
      if (C.moveLibrary?.[pascalKey]?.name) return C.moveLibrary[pascalKey].name;
    }
    return formatIdentifier(presetKey, 'Unknown Move');
  };

  const getVariantDisplayName = (variant) => {
    if (!variant) return null;
    return variant.name || (variant.id ? formatIdentifier(variant.id) : null);
  };

  const logAbilityExecution = (context, source) => {
    if (!context) return;
    const abilityName = getAbilityDisplayName(context.abilityId, context.ability);
    const attackName = getAttackDisplayName(context.attackId, context.attack);
    const moveName = getMoveDisplayName(context);
    const parts = [
      `[combat:${source}]`,
      `Ability: ${abilityName}`,
      `Attack: ${attackName}`,
      `Move: ${moveName}`
    ];
    const variantName = getVariantDisplayName(context.variant);
    if (variantName) parts.push(`Variant: ${variantName}`);
    if (Number.isFinite(context.chargeStage) && context.chargeStage > 0) {
      parts.push(`Charge Stage: ${context.chargeStage}`);
    }
    debugLog(parts.join(' | '));
  };

  const logStageTransition = (label) => {
    if (!label) return;
    const context = ATTACK.context;
    if (!context) return;
    const abilityName = getAbilityDisplayName(context.abilityId, context.ability);
    const attackName = getAttackDisplayName(context.attackId, context.attack);
    const moveName = getMoveDisplayName(context);
    debugLog(`[combat:stage] ${label} – ${moveName} (Ability: ${abilityName} | Attack: ${attackName})`);
  };

  function canAttackNow(){
    return !ATTACK.active && !TRANSITION.active;
  }

  function captureFacingAtPress(){
    const p = P();
    return (typeof p?.facingRad === 'number') ? p.facingRad : 
           ((p?.facingSign||1) < 0 ? Math.PI : 0);
  }

  function neutralizeMovement(){
    if (!neutralizeInputMovement) return;
    const I = resolveInput();
    const p = P();
    if (!I) return;
    if (I.left || I.right){
      I.left = false;
      I.right = false;
      if (p?.vel) p.vel.x = 0;
    }
  }

  // Get preset durations
  function getPresetDurations(presetName){
    const preset = C.attacks?.presets?.[presetName];
    if (!preset) return { toWindup:1600, toStrike:160, toRecoil:180, toStance:0 };
    return {
      toWindup: preset.toWindup ?? C.durations?.toWindup ?? 1600,
      toStrike: preset.toStrike ?? C.durations?.toStrike ?? 160,
      toRecoil: preset.toRecoil ?? C.durations?.toRecoil ?? 180,
      toStance: preset.toStance ?? C.durations?.toStance ?? 0
    };
  }

  // Build pose from library key
  function buildPoseFromKey(key){
    if (!key) return {};
    const lib = C.attacks?.library || {};
    const baseDef = lib[key];
    if (baseDef){
      const baseName = baseDef.base;
      const basePose = (C.poses?.[baseName]) ? clone(C.poses[baseName]) : {};
      return Object.assign(basePose, clone(baseDef.overrides||{}));
    } else {
      return (C.poses?.[key]) ? clone(C.poses[key]) : {};
    }
  }

  function clone(o){ return JSON.parse(JSON.stringify(o||{})); }

  function cloneAbilityForMerge(def){
    if (!def) return null;
    const copy = { ...def };
    if (Array.isArray(def.tags)) copy.tags = [...def.tags];
    if (Array.isArray(def.sequence)) copy.sequence = cloneSequence(def.sequence);
    if (def.multipliers && typeof def.multipliers === 'object') copy.multipliers = { ...def.multipliers };
    if (def.effects && typeof def.effects === 'object') copy.effects = { ...def.effects };
    if (def.variants) {
      copy.variants = def.variants.map((variant) => {
        const cloned = { ...variant };
        if (Array.isArray(variant.tags)) cloned.tags = [...variant.tags];
        if (variant.require && typeof variant.require === 'object') cloned.require = { ...variant.require };
        if (variant.multipliers && typeof variant.multipliers === 'object') cloned.multipliers = { ...variant.multipliers };
        return cloned;
      });
    }
    if (def.charge && typeof def.charge === 'object') copy.charge = { ...def.charge };
    return copy;
  }

  function cloneSequence(sequence){
    if (!Array.isArray(sequence)) return [];
    return sequence.map(step => (typeof step === 'string' || typeof step === 'number') ? step : { ...step });
  }

  let sequenceLayerCounter = 0;

  function clearAttackSequenceTimers(){
    const timers = ATTACK.sequenceTimers;
    if (Array.isArray(timers)){
      while (timers.length){
        const timer = timers.pop();
        try {
          clearTimeout(timer);
        } catch(err){
          console.warn('[combat] failed to clear sequence timer', err);
        }
      }
    }
    sequenceLayerCounter = 0;
  }

  function normalizeAttackSequence(sequence){
    if (!Array.isArray(sequence) || sequence.length === 0) return [];
    return sequence
      .map((entry) => {
        if (!entry && entry !== 0) return null;
        if (typeof entry === 'string' || typeof entry === 'number'){
          return { move: String(entry), startMs: 0 };
        }
        if (typeof entry === 'object'){
          const move = entry.move || entry.attack || entry.preset || entry.id;
          if (!move) return null;
          const start = Number.isFinite(entry.startMs) ? entry.startMs
            : Number.isFinite(entry.offsetMs) ? entry.offsetMs
            : 0;
          return { ...entry, move, startMs: start };
        }
        return null;
      })
      .filter(Boolean);
  }

  function resolveSequenceStepPreset(step){
    if (!step) return null;
    if (step.preset) return step.preset;
    const attackId = step.attack || step.move;
    const attack = getAttackDef && attackId ? getAttackDef(attackId) : null;
    if (attack?.preset) return attack.preset;
    if (typeof attackId === 'string' && C.presets?.[attackId]) return attackId;
    if (typeof step.move === 'string') return step.move;
    return null;
  }

  function scheduleAttackSequence(context){
    clearAttackSequenceTimers();
    if (!context) return;
    const normalized = normalizeAttackSequence(context.attack?.sequence);
    if (normalized.length === 0) return;
    const timers = ATTACK.sequenceTimers;
    const basePreset = context.preset;
    normalized.forEach((step, index) => {
      const presetName = resolveSequenceStepPreset(step);
      if (!presetName) return;
      const startMs = Number.isFinite(step.startMs) ? step.startMs : 0;
      if (index === 0 && (!startMs || startMs <= 0) && presetName === basePreset) return;
      const delayMs = Math.max(0, startMs);
      const scaledDelay = context?.applyDuration ? context.applyDuration(delayMs, 'Strike') : delayMs;
      const timer = setTimeout(() => {
        if (ATTACK.context !== context) return;
        playAttackSequenceStep({ ...step, preset: presetName }, context);
      }, scaledDelay);
      timers.push(timer);
    });
  }

  function playAttackSequenceStep(step, context){
    const presetName = step.preset || step.move;
    if (!presetName) return;
    const preset = C.presets?.[presetName];
    if (!preset) return;
    const strikePose = preset.poses?.Strike || buildPoseFromKey('Strike');
    const overrides = Array.isArray(strikePose.layerOverrides) ? strikePose.layerOverrides : [];
    const durations = computePresetDurationsWithContext(presetName, context);
    const strikeDur = applyDurationMultiplier(durations.toStrike ?? 110, context, 'Strike');
    const guard = () => ATTACK.context === context;
    const basePriority = Number.isFinite(step.priority) ? step.priority : undefined;

    if (overrides.length){
      overrides.forEach((layerDef, index) => {
        if (!layerDef || layerDef.enabled === false) return;
        const pose = layerDef.pose || strikePose;
        const layerId = layerDef.layer || layerDef.id || `${presetName}-seq-${index}-${sequenceLayerCounter++}`;
        const mask = step.mask || step.joints || layerDef.mask || layerDef.joints || pose.mask || pose.joints;
        const rawDelay = Number.isFinite(layerDef.delayMs) ? layerDef.delayMs
          : Number.isFinite(layerDef.offsetMs) ? layerDef.offsetMs
          : 0;
        const durMs = Number.isFinite(step.durMs) ? step.durMs
          : Number.isFinite(step.durationMs) ? step.durationMs
          : Number.isFinite(layerDef.durMs) ? layerDef.durMs
          : Number.isFinite(layerDef.durationMs) ? layerDef.durationMs
          : Number.isFinite(layerDef.dur) ? layerDef.dur
          : strikeDur;
        const handle = pushPoseLayerOverride(poseTarget, layerId, pose, {
          mask,
          priority: basePriority ?? layerDef.priority,
          suppressWalk: layerDef.suppressWalk,
          useAsBase: layerDef.useAsBase,
          durMs,
          delayMs: rawDelay > 0 ? rawDelay : 0,
          guard
        });
        registerTransitionLayerHandle(handle);
      });
    } else {
      const layerId = `${presetName}-seq-${sequenceLayerCounter++}`;
      const mask = step.mask || step.joints || strikePose.mask || strikePose.joints;
      const handle = pushPoseLayerOverride(poseTarget, layerId, strikePose, {
        mask,
        priority: basePriority,
        durMs: Number.isFinite(step.durMs) ? step.durMs
          : Number.isFinite(step.durationMs) ? step.durationMs
          : strikeDur,
        delayMs: 0,
        guard
      });
      registerTransitionLayerHandle(handle);
    }
  }

  function getEquippedWeaponKey(){
    return G.selectedWeapon
      || C.characters?.[fighterKey]?.weapon
      || C.knockback?.currentWeapon
      || 'unarmed';
  }

  function resolveComboAbilityForWeapon(baseAbility){
    if (!baseAbility?.comboFromWeapon) return baseAbility;
    const weaponKey = getEquippedWeaponKey();
    if (weaponKey === 'unarmed' && baseAbility?.id === 'combo_light') {
      const unarmedAbility = ABILITY_ABILITIES?.unarmed_combo_light;
      if (unarmedAbility) {
        const merged = { ...clone(baseAbility), ...clone(unarmedAbility) };
        merged.comboFromWeapon = false;
        merged.weaponSource = 'unarmed';
        merged.id = unarmedAbility.id || 'unarmed_combo_light';
        return merged;
      }
    }

    const combos = C.weaponCombos || {};

    const build = (comboDef, key) => {
      if (!comboDef) return null;
      const merged = { ...cloneAbilityForMerge(baseAbility) };
      merged.name = comboDef.name || baseAbility.name;
      merged.sequence = cloneSequence(comboDef.sequence || baseAbility.sequence || []);
      merged.comboWindowMs = comboDef.comboWindowMs ?? baseAbility.comboWindowMs;
      if (comboDef.multipliers) {
        merged.multipliers = combineMultiplierSources(baseAbility, { multipliers: comboDef.multipliers });
      } else if (baseAbility.multipliers) {
        merged.multipliers = clone(baseAbility.multipliers);
      }
      if (comboDef.tags) {
        merged.tags = [...new Set([...(baseAbility.tags || []), ...(comboDef.tags || [])])];
      }
      if (comboDef.effects) {
        merged.effects = { ...(baseAbility.effects || {}), ...comboDef.effects };
      }
      if (comboDef.onHit) {
        merged.onHit = comboDef.onHit;
      } else if (baseAbility.onHit) {
        merged.onHit = baseAbility.onHit;
      }
      merged.weaponSource = comboDef.weapon || key || merged.weaponSource || null;
      merged.comboFromWeapon = false;
      return merged;
    };

    return build(combos[getEquippedWeaponKey()], getEquippedWeaponKey())
        || build(combos[baseAbility.fallbackWeapon], baseAbility.fallbackWeapon)
        || baseAbility;
  }

  // Start transition with callback
  function startTransition(targetPose, label, durMs, callback){
    cancelQueuedLayerOverrides();
    TRANSITION.tokenCounter = (TRANSITION.tokenCounter + 1) || 1;
    const stageToken = TRANSITION.tokenCounter;
    TRANSITION.active = true;
    TRANSITION.target = label;
    TRANSITION.elapsed = 0;
    TRANSITION.duration = durMs;
    TRANSITION.callback = callback;
    TRANSITION.activeToken = stageToken;
    TRANSITION.flipApplied = false;  // Track if flip has been applied
    TRANSITION.flipAt = targetPose.flipAt;  // Store flip timing
    TRANSITION.flipParts = targetPose.flipParts;  // Store parts to flip

    if (label){
      logStageTransition(label);
      updateFighterAttackState(label, { active: label !== 'Stance' || !!ATTACK.active, context: ATTACK.context });
      if (ATTACK.context?.onPhase){
        try { ATTACK.context.onPhase(label); } catch(err){ console.warn('[combat] onPhase handler error', err); }
      }
    }

    pushPoseOverride(poseTarget, targetPose, durMs);
    queuePoseLayerOverrides(targetPose, label, durMs, stageToken);
  }

  function queuePoseLayerOverrides(targetPose, label, stageDurMs, stageToken){
    if (!targetPose) return;
    const overrides = Array.isArray(targetPose.layerOverrides) ? targetPose.layerOverrides : [];
    if (!overrides.length) return;
    overrides.forEach((layerDef, index)=>{
      if (!layerDef) return;
      if (layerDef.enabled === false) return;
      const pose = layerDef.pose || targetPose;
      const layerId = layerDef.layer || layerDef.id || `${label || 'layer'}-${index}`;
      const mask = layerDef.mask || layerDef.joints || pose.mask || pose.joints;
      const priority = layerDef.priority;
      const suppressWalk = layerDef.suppressWalk;
      const useAsBase = layerDef.useAsBase;
      const rawDelay = Number.isFinite(layerDef.delayMs) ? layerDef.delayMs : (Number.isFinite(layerDef.offsetMs) ? layerDef.offsetMs : 0);
      const delayMs = rawDelay > 0 ? rawDelay : 0;
      const stageDuration = Number.isFinite(stageDurMs) ? stageDurMs : 300;
      const durMs = Number.isFinite(layerDef.durMs) ? layerDef.durMs
        : Number.isFinite(layerDef.durationMs) ? layerDef.durationMs
        : Number.isFinite(layerDef.dur) ? layerDef.dur
        : stageDuration;
      const guard = ()=>{
        return TRANSITION.active && TRANSITION.activeToken === stageToken && TRANSITION.target === label;
      };
      const handle = pushPoseLayerOverride(poseTarget, layerId, pose, {
        mask,
        priority,
        suppressWalk,
        useAsBase,
        durMs,
        delayMs,
        guard
      });
      registerTransitionLayerHandle(handle);
    });
  }

  function normalizeAbilitySystem(raw){
    const thresholds = {
      tapMaxMs: raw.thresholds?.tapMaxMs ?? 200,
      chargeStageMs: raw.thresholds?.chargeStageMs ?? 200
    };
    const defaults = {
      comboWindowMs: raw.defaults?.comboWindowMs ?? raw.comboWindowMs ?? 3000
    };
    const attacks = {};
    Object.entries(raw.attacks || {}).forEach(([id, def])=>{
      attacks[id] = Object.assign({ id, preset: def.preset || id }, def);
    });
    const abilities = {};
    Object.entries(raw.abilities || {}).forEach(([id, def])=>{
      abilities[id] = Object.assign({ id }, def);
    });
    const slots = {};
    Object.entries(raw.slots || {}).forEach(([slotKey, slotDef])=>{
      slots[slotKey] = {
        key: slotKey,
        label: slotDef.label || slotKey,
        lightAbilityId: slotDef.light || null,
        heavyAbilityId: slotDef.heavy || null
      };
    });
    return { thresholds, defaults, attacks, abilities, slots };
  }

  function getSlot(slotKey){ return ABILITY_SLOTS[slotKey] || null; }
  function getAbility(id){ return id ? (ABILITY_ABILITIES[id] || null) : null; }
  function getAttackDef(id){ return id ? (ABILITY_ATTACKS[id] || null) : null; }
  function getAbilityForSlot(slotKey, type){
    const slot = getSlot(slotKey);
    if (!slot) return null;
    const id = type === 'heavy' ? slot.heavyAbilityId : slot.lightAbilityId;
    return id ? getAbility(id) : null;
  }

  function mergeMultipliers(target, source){
    if (!source) return target;
    const out = { ...(target || {}) };
    for (const [key, value] of Object.entries(source)){
      if (value == null) continue;
      if (typeof value === 'function') continue;
      if (typeof value === 'object' && !Array.isArray(value)){
        out[key] = mergeMultipliers(out[key] || {}, value);
      } else if (Number.isFinite(value)){
        out[key] = out[key] == null ? value : out[key] * value;
      }
    }
    return out;
  }

  function combineMultiplierSources(...sources){
    let result = {};
    for (const src of sources){
      if (!src) continue;
      const data = src.multipliers ? src.multipliers : src;
      if (!data) continue;
      result = mergeMultipliers(result, data);
    }
    return result;
  }

  function updateSlotAssignments(assignments = {}) {
    if (!assignments) return;
    G.selectedAbilities ||= {};
    Object.entries(assignments).forEach(([slotKey, slotValues]) => {
      if (!slotValues) return;
      const slot = ABILITY_SLOTS[slotKey];
      if (!slot) return;
      const state = (G.selectedAbilities[slotKey] ||= { light: null, heavy: null });
      if ('light' in slotValues) {
        const value = slotValues.light || null;
        slot.lightAbilityId = value;
        state.light = value;
      }
      if ('heavy' in slotValues) {
        const value = slotValues.heavy || null;
        slot.heavyAbilityId = value;
        state.heavy = value;
      }
    });
  }

  function keyToPhase(key){
    if (!key) return null;
    const lower = String(key).toLowerCase();
    if (lower.includes('windup')) return 'Windup';
    if (lower.includes('strike')) return 'Strike';
    if (lower.includes('recoil')) return 'Recoil';
    if (lower.includes('stance')) return 'Stance';
    return null;
  }

  function applyDurationMultiplier(baseValue, context, phaseKey){
    if (!Number.isFinite(baseValue)) return baseValue;
    let result = baseValue;
    if (context){
      const multipliers = context.multipliers || {};
      if (Number.isFinite(multipliers.durations)) result *= multipliers.durations;
      const perPhase = multipliers.durationByPhase;
      if (phaseKey && perPhase && Number.isFinite(perPhase[phaseKey])) result *= perPhase[phaseKey];
      const explicit = multipliers[`duration${phaseKey}`];
      if (Number.isFinite(explicit)) result *= explicit;
    }
    return Math.max(0, Math.round(result));
  }

  function computePresetDurationsWithContext(presetName, context){
    const base = getPresetDurations(presetName);
    const merged = { ...base };
    if (context?.attack?.durations) Object.assign(merged, context.attack.durations);
    if (context?.ability?.durations) Object.assign(merged, context.ability.durations);
    if (context?.variant?.durations) Object.assign(merged, context.variant.durations);
    const result = {};
    for (const [key, value] of Object.entries(merged)){
      result[key] = applyDurationMultiplier(value, context, keyToPhase(key));
    }
    return result;
  }

  function resolveAttackPreset(attack, variant, ability, fallback){
    if (variant?.preset) return variant.preset;
    if (attack?.preset) return attack.preset;
    if (ability?.preset) return ability.preset;
    return fallback;
  }

  function checkVariantRequirements(requirements, base){
    if (!requirements) return true;
    const hits = base.comboHits ?? 0;
    if (requirements.comboHitsGte != null && !(hits >= requirements.comboHitsGte)) return false;
    if (requirements.comboHitsLte != null && !(hits <= requirements.comboHitsLte)) return false;
    if (requirements.comboActive != null){
      const active = !!base.comboActive;
      if (requirements.comboActive !== active) return false;
    }
    if (requirements.lastComboAbility && base.lastComboAbilityId !== requirements.lastComboAbility) return false;
    return true;
  }

  function selectAbilityVariant(ability, base){
    const variants = ability?.variants;
    if (!Array.isArray(variants) || variants.length === 0) return null;
    for (let i = 0; i < variants.length; i++){
      const raw = variants[i];
      const variant = Object.assign({ id: raw.id || `${ability.id}-variant-${i}` }, raw);
      if (checkVariantRequirements(variant.require, base)){
        return variant;
      }
    }
    return null;
  }

  function invokeHook(context, hook, ...args){
    if (!context) return;
    const call = (source) => {
      if (!source) return;
      const direct = source[hook];
      if (typeof direct === 'function'){
        try { direct(context, ...args); } catch(err){ console.warn(`[combat] ${hook} handler error`, err); }
      }
      const effect = source.effects?.[hook];
      if (typeof effect === 'function'){
        try { effect(context, ...args); } catch(err){ console.warn(`[combat] ${hook} effects error`, err); }
      }
    };
    call(context.ability);
    call(context.attack);
    call(context.variant);
  }

  function buildAttackContext({ abilityId, ability, attackId, attack, slotKey, type, variant, chargeStage=0, comboHits }){
    const fighter = P();
    const preset = resolveAttackPreset(attack, variant, ability, attackId);
    let multipliers = combineMultiplierSources(attack, ability, variant);
    const context = {
      abilityId,
      ability,
      attackId,
      attack,
      slotKey,
      slot: getSlot(slotKey),
      type,
      variant,
      variantId: variant?.id || null,
      preset,
      character: fighter,
      fighter,
      comboHits: comboHits ?? COMBO.hits,
      comboActive: COMBO.timer > 0,
      chargeStage,
      startTime: now(),
      multipliers,
      tags: [...new Set([...(ability?.tags || []), ...(attack?.tags || []), ...(variant?.tags || [])])]
    };
    if (Number.isFinite(chargeStage) && ability?.charge?.stageMultipliers){
      try {
        const stageMultipliers = ability.charge.stageMultipliers(chargeStage, context);
        multipliers = combineMultiplierSources(multipliers, stageMultipliers);
        context.multipliers = multipliers;
      } catch(err){
        console.warn('[combat] stageMultipliers error', err);
        context.multipliers = multipliers;
      }
    } else {
      context.multipliers = multipliers;
    }
    context.invoke = (hook, ...args) => invokeHook(context, hook, ...args);
    context.onExecute = (...args) => invokeHook(context, 'onExecute', ...args);
    context.onHit = (opponent, collisions) => invokeHook(context, 'onHit', opponent, collisions);
    context.onPhase = (label) => invokeHook(context, 'onPhase', label);
    context.onComplete = (...args) => invokeHook(context, 'onComplete', ...args);
    context.applyDuration = (value, phase) => applyDurationMultiplier(value, context, phase);
    return context;
  }

  function updateFighterAttackState(label, { active = true, context = ATTACK.context } = {}){
    const fighter = P();
    if (!fighter) return;
    const attackState = (fighter.attack ||= {});
    attackState.currentPhase = label || 'Stance';
    attackState.active = !!active;
    attackState.context = context || null;
    attackState.handleHit = context?.onHit || null;
    attackState.preset = ATTACK.preset || context?.preset || attackState.preset || null;
    attackState.slot = ATTACK.slot || attackState.slot || null;
    attackState.isHoldRelease = !!ATTACK.isHoldRelease;
    attackState.chargeStage = ATTACK.chargeStage || 0;
    if (attackState.currentPhase && attackState.currentPhase.toLowerCase().includes('strike')) {
      attackState.currentActiveKeys = inferActiveCollidersForPreset(attackState.preset || context?.preset);
    } else if (!attackState.currentPhase || attackState.currentPhase === 'Stance') {
      attackState.currentActiveKeys = [];
    }
  }

  // Play quick attack
  function playQuickAttack(presetName, windupMs, context){
    const preset = C.presets?.[presetName];
    const ctx = context || null;
    clearAttackSequenceTimers();
    ATTACK.active = true;
    ATTACK.preset = presetName;
    ATTACK.context = ctx;

    if (ctx?.onExecute){
      try { ctx.onExecute(); } catch(err){ console.warn('[combat] onExecute error', err); }
    }

    const durs = computePresetDurationsWithContext(presetName, ctx);

    if (ctx?.attack?.sequence) {
      scheduleAttackSequence(ctx);
    }

    if (preset && preset.poses){
      const windupPose = preset.poses.Windup || buildPoseFromKey('Windup');
      const strikePose = preset.poses.Strike || buildPoseFromKey('Strike');
      const recoilPose = preset.poses.Recoil || buildPoseFromKey('Recoil');
      const stancePose = preset.poses.Stance || buildPoseFromKey('Stance');

      const actualWindup = applyDurationMultiplier(windupMs ?? durs.toWindup ?? 160, ctx, 'Windup');
      const strikeTime = applyDurationMultiplier(durs.toStrike ?? 110, ctx, 'Strike');
      const recoilTime = applyDurationMultiplier(durs.toRecoil ?? 200, ctx, 'Recoil');
      const stanceTime = applyDurationMultiplier(durs.toStance ?? 120, ctx, 'Stance');

      startTransition(windupPose, 'Windup', actualWindup, ()=>{
        startTransition(strikePose, 'Strike', strikeTime, ()=>{
          startTransition(recoilPose, 'Recoil', recoilTime, ()=>{
            if (stancePose.resetFlipsBefore) {
              resetMirror();
            }

            startTransition(stancePose, 'Stance', stanceTime, ()=>{
              const finishedContext = ATTACK.context;
              clearAttackSequenceTimers();
              if (finishedContext?.onComplete){
                try { finishedContext.onComplete(); } catch(err){ console.warn('[combat] onComplete error', err); }
              }
              ATTACK.active = false;
              ATTACK.preset = null;
              ATTACK.context = null;
              updateFighterAttackState('Stance', { active: false, context: null });
            });
          });
        });
      });
    } else {
      const windupPose = buildPoseFromKey('Windup');
      const strikePose = buildPoseFromKey('Strike');
      const recoilPose = buildPoseFromKey('Recoil');
      const stancePose = buildPoseFromKey('Stance');

      const actualWindup = applyDurationMultiplier(windupMs ?? durs.toWindup, ctx, 'Windup');
      const strikeTime = applyDurationMultiplier(durs.toStrike, ctx, 'Strike');
      const recoilTime = applyDurationMultiplier(durs.toRecoil, ctx, 'Recoil');
      const stanceTime = applyDurationMultiplier(durs.toStance, ctx, 'Stance');

      startTransition(windupPose, 'Windup', actualWindup, ()=>{
        startTransition(strikePose, 'Strike', strikeTime, ()=>{
          startTransition(recoilPose, 'Recoil', recoilTime, ()=>{
            startTransition(stancePose, 'Stance', stanceTime, ()=>{
              const finishedContext = ATTACK.context;
              clearAttackSequenceTimers();
              if (finishedContext?.onComplete){
                try { finishedContext.onComplete(); } catch(err){ console.warn('[combat] onComplete error', err); }
              }
              ATTACK.active = false;
              ATTACK.preset = null;
              ATTACK.context = null;
              updateFighterAttackState('Stance', { active: false, context: null });
            });
          });
        });
      });
    }
  }

  function executeHeavyAbility(slotKey, abilityId, chargeStage){
    const ability = getAbility(abilityId);
    if (!ability) return;

    const attackId = ability.attack || ability.defaultAttack || abilityId;
    const attackDef = getAttackDef(attackId) || { id: attackId, preset: attackId };
    const context = buildAttackContext({
      abilityId,
      ability,
      attackId,
      attack: attackDef,
      slotKey,
      type: 'heavy',
      chargeStage,
      comboHits: COMBO.hits
    });

    ATTACK.active = true;
    ATTACK.preset = context.preset;
    ATTACK.isHoldRelease = ability.trigger === 'hold-release';
    ATTACK.chargeStage = chargeStage;
    ATTACK.context = context;
    ATTACK.pendingAbilityId = null;

    if (context.onExecute){
      try { context.onExecute(); } catch(err){ console.warn('[combat] heavy onExecute error', err); }
    }

    logAbilityExecution(context, 'heavy');

    const durs = computePresetDurationsWithContext(context.preset, context);
    const strikePose = buildPoseFromKey(attackDef.strikePoseKey || ability.strikePoseKey || 'Strike');
    const recoilPose = buildPoseFromKey(attackDef.recoilPoseKey || ability.recoilPoseKey || 'Recoil');
    const stancePose = buildPoseFromKey(attackDef.stancePoseKey || ability.stancePoseKey || 'Stance');

    const strikeDur = applyDurationMultiplier(durs.toStrike, context, 'Strike');
    const recoilDur = applyDurationMultiplier(durs.toRecoil, context, 'Recoil');
    const stanceDur = applyDurationMultiplier(durs.toStance, context, 'Stance');

    startTransition(strikePose, 'Strike', strikeDur, ()=>{
      startTransition(recoilPose, 'Recoil', recoilDur, ()=>{
        startTransition(stancePose, 'Stance', stanceDur, ()=>{
          const finishedContext = ATTACK.context;
          if (finishedContext?.onComplete){
            try { finishedContext.onComplete(); } catch(err){ console.warn('[combat] heavy onComplete error', err); }
          }
          ATTACK.active = false;
          ATTACK.preset = null;
          ATTACK.isHoldRelease = false;
          ATTACK.context = null;
          updateFighterAttackState('Stance', { active: false, context: null });
        });
      });
    });
  }

  function triggerComboAbility(slotKey, abilityId, { skipQueue = false } = {}){
    const abilityTemplate = getAbility(abilityId);
    if (!abilityTemplate) return;

    const ability = resolveComboAbilityForWeapon(abilityTemplate);
    const sequence = ability.sequence || [];
    if (sequence.length === 0){
      console.warn(`[combat] combo ability "${abilityId}" has no sequence`);
      return;
    }

    if (!canAttackNow()){
      if (!skipQueue){
        console.log(logPrefix, 'Combo blocked - queueing');
      }
      QUEUE.pending = true;
      QUEUE.type = 'combo';
      QUEUE.button = slotKey;
      QUEUE.abilityId = abilityId;
      QUEUE.downTime = now();
      return;
    }

    if (COMBO.timer <= 0){
      COMBO.sequenceIndex = 0;
      COMBO.lastAbilityId = null;
      COMBO.hits = 0;
    }

    if (COMBO.lastAbilityId !== abilityId){
      COMBO.sequenceIndex = 0;
    }

    const step = sequence[COMBO.sequenceIndex % sequence.length];
    const attackId = typeof step === 'string' ? step : step.attack;
    const attackDef = getAttackDef(attackId) || { id: attackId, preset: attackId };
    const variant = (typeof step === 'object') ? step.variant : null;
    const windupOverride = (typeof step === 'object' && Number.isFinite(step.windupMs)) ? step.windupMs : (attackDef.windupMs ?? ability.windupMs ?? 0);

    const context = buildAttackContext({
      abilityId,
      ability,
      attackId,
      attack: attackDef,
      slotKey,
      type: 'light',
      variant,
      comboHits: COMBO.hits
    });

    logAbilityExecution(context, 'combo');

    playQuickAttack(context.preset, windupOverride, context);

    COMBO.sequenceIndex = (COMBO.sequenceIndex + 1) % sequence.length;
    COMBO.hits++;
    COMBO.timer = ability.comboWindowMs ?? ABILITY_DEFAULTS.comboWindowMs;
    COMBO.lastAbilityId = abilityId;
  }

  function triggerQuickAbility(slotKey, abilityId, { skipQueue = false } = {}){
    const ability = getAbility(abilityId);
    if (!ability) return;

    if (!canAttackNow()){
      if (!skipQueue){
        console.log(logPrefix, 'Quick attack blocked - queueing');
      }
      QUEUE.pending = true;
      QUEUE.type = 'quick';
      QUEUE.button = slotKey;
      QUEUE.abilityId = abilityId;
      QUEUE.downTime = now();
      return;
    }

    const base = {
      comboHits: COMBO.hits,
      comboActive: COMBO.timer > 0,
      lastComboAbilityId: COMBO.lastAbilityId
    };

    const variant = selectAbilityVariant(ability, base);
    let attackId;
    if (variant?.attack){
      attackId = variant.attack;
    } else if (ability.attack){
      attackId = ability.attack;
    } else if (ability.defaultAttack){
      attackId = ability.defaultAttack;
    } else if (variant?.preset){
      attackId = variant.id || `${ability.id}-variant`;
    } else {
      attackId = abilityId;
    }

    let attackDef = getAttackDef(attackId);
    if (!attackDef){
      attackDef = { id: attackId, preset: resolveAttackPreset(null, variant, ability, attackId) };
    }

    const context = buildAttackContext({
      abilityId,
      ability,
      attackId,
      attack: attackDef,
      slotKey,
      type: 'light',
      variant,
      comboHits: COMBO.hits
    });

    logAbilityExecution(context, 'quick');

    const windup = variant?.windupMs ?? attackDef.windupMs ?? ability.windupMs ?? 0;
    playQuickAttack(context.preset, windup, context);
  }

  function slotDown(slotKey){
    const slot = getSlot(slotKey);
    if (!slot) return;

    const press = getPressState(slotKey);
    if (press){
      if (!press.active){
        press.id += 1;
      }
      press.active = true;
      press.downTime = now();
      press.tapHandled = false;
      press.holdHandled = false;
      press.lastTap = null;
    }

    neutralizeMovement();

    if (ATTACK.active || !canAttackNow()){
    console.log(logPrefix, `Button ${slotKey} queued`);
      if (!QUEUE.pending){
        QUEUE.pending = true;
        QUEUE.button = slotKey;
        QUEUE.type = 'light';
        QUEUE.abilityId = null;
        QUEUE.downTime = now();
      }
      return;
    }

    console.log(logPrefix, `Button ${slotKey} pressed`);

    ATTACK.slot = slotKey;
    ATTACK.context = null;
    ATTACK.facingRadAtPress = captureFacingAtPress();
    ATTACK.dirSign = (Math.cos(ATTACK.facingRadAtPress) >= 0) ? 1 : -1;
    ATTACK.downTime = now();
    ATTACK.pendingAbilityId = null;

    CHARGE.active = true;
    CHARGE.stage = 0;
    CHARGE.startTime = now();
  }

  function slotUp(slotKey){
    const tUp = now();
    const slot = getSlot(slotKey);
    if (!slot) return;

    const press = getPressState(slotKey);
    if (press && !press.active && (press.tapHandled || press.holdHandled)){
      if (press.lastTap !== null){
        const prevTap = press.lastTap ? 'tap' : 'hold';
        console.log(logPrefix, `[combat] ignoring duplicate ${prevTap} release for button ${slotKey}`);
      }
      return;
    }

    const pressDownTime = ATTACK.downTime || press?.downTime || tUp;
    const heldMs = tUp - pressDownTime;
    const tap = heldMs <= ABILITY_THRESHOLDS.tapMaxMs;

    console.log(logPrefix, `Button ${slotKey} released: held=${heldMs}ms, tap=${tap}`);

    if (press){
      press.lastTap = tap;
      const alreadyHandled = tap ? press.tapHandled : press.holdHandled;
      if (alreadyHandled){
        return;
      }
      if (tap){
        press.tapHandled = true;
      } else {
        press.holdHandled = true;
      }
      press.active = false;
      press.downTime = 0;
    }

    if (ATTACK.slot === slotKey){
      ATTACK.slot = null;
    }

    CHARGE.active = false;
    CHARGE.stage = 0;
    CHARGE.startTime = 0;

    if (tap){
      if (ATTACK.isCharging){
        ATTACK.active = false;
        ATTACK.isCharging = false;
        ATTACK.context = null;
      }
      const ability = getAbilityForSlot(slotKey, 'light');
      if (ability){
        if (ability.trigger === 'combo'){
          triggerComboAbility(slotKey, ability.id);
        } else {
          triggerQuickAbility(slotKey, ability.id);
        }
      }
    } else {
      if (ATTACK.isCharging){
        const ability = getAbilityForSlot(slotKey, 'heavy');
        if (ability){
          const stageMs = ability.charge?.stageDurationMs ?? ABILITY_THRESHOLDS.chargeStageMs;
          const rawStage = Math.floor(heldMs / stageMs);
          const minStage = ability.charge?.minStage ?? ability.charge?.minChargeStages ?? 1;
          const maxStage = ability.charge?.maxStage ?? ability.charge?.maxChargeStages ?? 5;
          const clampedStage = Math.max(minStage, Math.min(maxStage, rawStage));
          ATTACK.isCharging = false;
          ATTACK.pendingAbilityId = null;
          if (rawStage >= minStage){
            executeHeavyAbility(slotKey, ability.id, clampedStage);
          } else {
            console.log(logPrefix, 'Charge too short, canceled');
            ATTACK.active = false;
            ATTACK.preset = null;
            ATTACK.context = null;
            cancelQueuedLayerOverrides();
            pushPoseOverride(poseTarget, buildPoseFromKey('Stance'), 200);
            updateFighterAttackState('Stance', { active: false, context: null });
          }
        }
      }
    }

    ATTACK.pendingAbilityId = null;
  }

  // Process queued attacks
  function processQueue(){
    if (!QUEUE.pending) return;
    if (!canAttackNow()) return;

    console.log(logPrefix, 'Processing queued attack');

    const { type, button, abilityId, chargeStage } = QUEUE;

    QUEUE.pending = false;
    QUEUE.type = null;
    QUEUE.button = null;
    QUEUE.abilityId = null;
    QUEUE.chargeStage = 0;
    QUEUE.downTime = 0;

    if (!button) return;

    neutralizeMovement();

    if (type === 'combo'){
      triggerComboAbility(button, abilityId, { skipQueue: true });
      return;
    }

    if (type === 'quick'){
      triggerQuickAbility(button, abilityId, { skipQueue: true });
      return;
    }

    if (type === 'heavy'){
      if (abilityId){
        executeHeavyAbility(button, abilityId, chargeStage);
      } else {
        const ability = getAbilityForSlot(button, 'heavy');
        if (ability){
          executeHeavyAbility(button, ability.id, chargeStage);
        }
      }
      return;
    }

    const lightAbility = getAbilityForSlot(button, 'light');
    if (!lightAbility) return;

    if (lightAbility.trigger === 'combo'){
      triggerComboAbility(button, lightAbility.id, { skipQueue: true });
    } else {
      triggerQuickAbility(button, lightAbility.id, { skipQueue: true });
    }
  }

  // Handle button state changes
  function handleButtons(){
    const I = resolveInput();

    // Button A
    if (I.buttonA?.down && ATTACK.slot !== 'A'){
      slotDown('A');
    } else if (!I.buttonA?.down && ATTACK.slot === 'A'){
      slotUp('A');
      ATTACK.slot = null;
    }
    
    // Button B
    if (I.buttonB?.down && ATTACK.slot !== 'B'){
      slotDown('B');
    } else if (!I.buttonB?.down && ATTACK.slot === 'B'){
      slotUp('B');
      ATTACK.slot = null;
    }
  }

  function updateCharge(dt){
    if (!CHARGE.active) return;
    const slotKey = ATTACK.slot;
    if (!slotKey) return;

    const heldMs = now() - CHARGE.startTime;

    if (heldMs > ABILITY_THRESHOLDS.tapMaxMs && !ATTACK.isCharging){
      const ability = getAbilityForSlot(slotKey, 'heavy');
      if (ability?.trigger === 'hold-release'){
        const attackId = ability.attack || ability.defaultAttack || ability.id;
        const attackDef = getAttackDef(attackId) || { id: attackId, preset: attackId };
        const windupPoseKey = ability.charge?.windupPoseKey || attackDef.windupPoseKey || 'Windup';
        const windupPose = buildPoseFromKey(windupPoseKey);
        ATTACK.active = true;
        ATTACK.isCharging = true;
        ATTACK.preset = attackDef.preset || ability.preset || attackId;
        ATTACK.pendingAbilityId = ability.id;
        cancelQueuedLayerOverrides();
        pushPoseOverride(poseTarget, windupPose, ability.charge?.windupHoldMs || 10000);
        updateFighterAttackState('Windup', { active: true, context: null });
        console.log(logPrefix, 'Charge mode started (hold detected)', ability.id);
      }
    }

    const ability = getAbilityForSlot(slotKey, 'heavy');
    if (!ability) return;
    const stageMs = ability.charge?.stageDurationMs ?? ABILITY_THRESHOLDS.chargeStageMs;
    const newStage = Math.floor(heldMs / stageMs);

    if (newStage !== CHARGE.stage){
      CHARGE.stage = newStage;
      console.log(logPrefix, `Charge stage: ${CHARGE.stage}`);
    }
  }

  // Update transitions
  function updateTransitions(dt){
    if (!TRANSITION.active) return;
    
    TRANSITION.elapsed += dt * 1000;
    
    // Apply flips at the specified progress point
    if (TRANSITION.flipAt !== null && !TRANSITION.flipApplied && TRANSITION.flipParts){
      const progress = TRANSITION.elapsed / TRANSITION.duration;
      if (progress >= TRANSITION.flipAt){
        console.log(logPrefix, `Applying flip at progress ${progress.toFixed(2)} (flipAt=${TRANSITION.flipAt})`);
        for (const part of TRANSITION.flipParts){
          setMirrorForPart(part, true);
        }
        TRANSITION.flipApplied = true;
      }
    }
    
    if (TRANSITION.elapsed >= TRANSITION.duration){
      TRANSITION.active = false;
      if (TRANSITION.callback){
        TRANSITION.callback();
      }
    }
  }

  // Update combo timer
  function updateCombo(dt){
    if (COMBO.timer > 0){
      COMBO.timer -= dt * 1000;
      if (COMBO.timer <= 0){
        console.log(logPrefix, 'Combo reset');
        COMBO.hits = 0;
        COMBO.sequenceIndex = 0;
        COMBO.lastAbilityId = null;
      }
    }
  }

  // Movement
  function updateMovement(dt){
    const p = P();
    if (!p) return;

    ensureFighterPhysics(p, C);
    const input = resolveInput();
    if (input && !p.input) {
      p.input = input;
    }

    updateFighterPhysics(p, C, dt, {
      input,
      attackActive: ATTACK.active,
    });
  }

  function isFighterAttacking(){
    return !!ATTACK.active;
  }

  function isFighterCharging(){
    return !!CHARGE.active;
  }

  function isFighterBusy(){
    return ATTACK.active || CHARGE.active;
  }

  function tick(dt){
    if (autoProcessInput) handleButtons();
    updateCharge(dt);
    updateTransitions(dt);
    updateCombo(dt);
    updateMovement(dt);
    processQueue();
  }

  return {
    tick,
    slotDown,
    slotUp,
    updateSlotAssignments,
    isPlayerAttacking: isFighterAttacking,
    isPlayerCharging: isFighterCharging,
    isPlayerBusy: isFighterBusy,
    isFighterAttacking,
    isFighterCharging,
    isFighterBusy
  };
}
