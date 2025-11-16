// combat.js — Full attack system matching reference HTML (tap/hold, charge, combo, queue)
import { pushPoseOverride, pushPoseLayerOverride } from './animator.js?v=5';
import { resetMirror, setMirrorForPart } from './sprites.js?v=8';
import { ensureFighterPhysics, updateFighterPhysics } from './physics.js?v=1';
import {
  applyHealthRegenFromStats,
  applyStaminaTick,
  buildStatContextMultipliers,
  getStatProfile,
} from './stat-hooks.js?v=1';

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
        slot.lightAbilityId = resolveAllowedAbilityId(slotKey, 'light', slotValues.light) || null;
      }
      if (slotValues.heavy !== undefined) {
        slot.heavyAbilityId = resolveAllowedAbilityId(slotKey, 'heavy', slotValues.heavy) || null;
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
    sequenceTimers: [],
    sequenceSteps: [],
    timelineState: null
    sequenceSteps: []
  };

  const CHARGE = {
    active: false,
    stage: 0,
    startTime: 0
  };

  const PRESS = {};
  const DEFENSE = {
    active: false,
    slot: null,
    abilityId: null,
    context: null,
    poseKey: null,
    poseHoldMs: 220,
    nextRefresh: 0,
    prevDrainRate: null
  };

  const SLOT_TO_BUTTON = { A: 'buttonA', B: 'buttonB', C: 'buttonC' };

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

  const collectWeaponColliderKeys = (fighter, options = {}) => {
    const state = fighter?.anim?.weapon?.state;
    if (!state?.bones) return [];
    const tagSet = new Set();
    const addTag = (value) => {
      if (value == null) return;
      const str = String(value).trim();
      if (str) tagSet.add(str.toUpperCase());
    };
    const defaultActivationTag = typeof options.defaultActivationTag === 'string'
      ? options.defaultActivationTag.trim().toUpperCase()
      : 'STRIKE';
    if (defaultActivationTag) addTag(defaultActivationTag);
    if (options.preset) addTag(options.preset);
    const allowedTags = options.allowedTags;
    if (allowedTags instanceof Set) {
      allowedTags.forEach(addTag);
    } else if (Array.isArray(allowedTags)) {
      allowedTags.forEach(addTag);
    } else if (allowedTags && typeof allowedTags === 'object') {
      Object.values(allowedTags).forEach(addTag);
    }
    const keys = [];
    const seenKeys = new Set();
    for (const bone of state.bones) {
      for (const collider of bone?.colliders || []) {
        if (!collider || !collider.id) continue;
        const id = String(collider.id).trim();
        if (!id) continue;
        const activations = Array.isArray(collider.activatesOn) ? collider.activatesOn : [];
        const normalizedActivations = activations
          .map((tag) => (typeof tag === 'string' ? tag.trim().toUpperCase() : ''))
          .filter(Boolean);
        if (normalizedActivations.length) {
          const matches = normalizedActivations.some((tag) => tagSet.has(tag));
          if (!matches) {
            if (!defaultActivationTag || !tagSet.has(defaultActivationTag)) {
              continue;
            }
          }
        }
        const key = `weapon:${id}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        keys.push(key);
      }
    }
    return keys;
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

  function resetDefensiveState(){
    DEFENSE.active = false;
    DEFENSE.slot = null;
    DEFENSE.abilityId = null;
    DEFENSE.context = null;
    DEFENSE.poseKey = null;
    DEFENSE.poseHoldMs = 220;
    DEFENSE.nextRefresh = 0;
    DEFENSE.prevDrainRate = null;
  }

  function stopDefensiveAbility(reason = 'manual'){
    if (!DEFENSE.active) return;
    const fighter = P();
    const stamina = fighter?.stamina || null;
    if (stamina){
      if (DEFENSE.prevDrainRate != null) stamina.drainRate = DEFENSE.prevDrainRate;
      stamina.isDashing = false;
    }
    const context = DEFENSE.context;
    if (context?.onComplete){
      try { context.onComplete({ reason }); } catch(err){ console.warn('[combat] defensive onComplete error', err); }
    }
    ATTACK.active = false;
    ATTACK.preset = null;
    ATTACK.context = null;
    ATTACK.slot = null;
    ATTACK.isHoldRelease = false;
    ATTACK.isCharging = false;
    ATTACK.pendingAbilityId = null;
    updateFighterAttackState('Stance', { active: false, context: null });
    cancelQueuedLayerOverrides();
    pushPoseOverride(poseTarget, buildPoseFromKey('Stance'), 220);
    resetDefensiveState();
  }

  function startDefensiveAbility(slotKey, ability){
    if (!ability || ability.trigger !== 'defensive') return false;
    const fighter = P();
    if (!fighter) return false;
    const stamina = fighter.stamina;
    if (!stamina) return false;

    const current = Number.isFinite(stamina.current) ? stamina.current : 0;
    const max = Number.isFinite(stamina.max) ? stamina.max : 0;
    const minToDash = Number.isFinite(stamina.minToDash) ? stamina.minToDash : 0;
    const minRatio = Number.isFinite(ability.defensive?.minStaminaRatio)
      ? Math.max(0, ability.defensive.minStaminaRatio)
      : null;
    const ratioRequirement = minRatio != null ? max * minRatio : 0;
    const required = Math.max(minToDash, ratioRequirement);
    if (required > 0 && current < required){
      console.log(logPrefix, `Defensive ability ${ability.id} blocked - stamina below threshold`);
      return false;
    }

    const abilityInstance = ability.__base ? ability : instantiateAbility(ability, fighter);
    if (!abilityInstance) return false;

    const attackId = abilityInstance.attack
      || abilityInstance.defaultAttack
      || abilityInstance.defensive?.attackId
      || abilityInstance.id;
    const fallbackPreset = abilityInstance.defensive?.poseKey
      || abilityInstance.preset
      || abilityInstance.stancePoseKey
      || 'Stance';
    const attackDef = getAttackDef(attackId) || { id: attackId, preset: fallbackPreset };

    const context = buildAttackContext({
      abilityId: abilityInstance.id,
      ability: abilityInstance,
      attackId,
      attack: attackDef,
      slotKey,
      type: 'defensive',
      comboHits: COMBO.hits
    });
    context.defensive = abilityInstance.defensive ? { ...abilityInstance.defensive } : null;

    if (context.onExecute){
      try { context.onExecute(); } catch(err){ console.warn('[combat] defensive onExecute error', err); }
    }

    logAbilityExecution(context, 'defensive');

    cancelQueuedLayerOverrides();

    ATTACK.active = true;
    ATTACK.preset = context.preset;
    ATTACK.context = context;
    ATTACK.slot = slotKey;
    ATTACK.isCharging = false;
    ATTACK.isHoldRelease = false;
    ATTACK.pendingAbilityId = null;
    ATTACK.chargeStage = 0;

    DEFENSE.active = true;
    DEFENSE.slot = slotKey;
    DEFENSE.abilityId = abilityInstance.id;
    DEFENSE.context = context;
    DEFENSE.poseKey = abilityInstance.defensive?.poseKey
      || attackDef.stancePoseKey
      || abilityInstance.stancePoseKey
      || fallbackPreset;
    const refreshMs = Number.isFinite(abilityInstance.defensive?.poseRefreshMs)
      ? abilityInstance.defensive.poseRefreshMs
      : 220;
    DEFENSE.poseHoldMs = Math.max(120, refreshMs);
    DEFENSE.nextRefresh = 0;
    DEFENSE.prevDrainRate = Number.isFinite(stamina.drainRate) ? stamina.drainRate : null;
    if (Number.isFinite(abilityInstance.defensive?.staminaDrainPerSecond)){
      stamina.drainRate = abilityInstance.defensive.staminaDrainPerSecond;
    }
    stamina.isDashing = true;

    CHARGE.active = false;
    CHARGE.stage = 0;
    CHARGE.startTime = now();

    updateFighterAttackState('Stance', { active: true, context });

    return true;
  }

  function canAttackNow(){
    return !ATTACK.active && !TRANSITION.active;
  }

  function captureFacingAtPress(){
    const p = P();
    return (typeof p?.facingRad === 'number') ? p.facingRad : 
           ((p?.facingSign||1) < 0 ? Math.PI : 0);
  }

  function neutralizeMovement(options = {}){
    if (!neutralizeInputMovement) return;
    const { preserveDirectional = false } = options || {};
    const I = resolveInput();
    const p = P();
    if (!I) return;
    if (!preserveDirectional && (I.left || I.right)){
      I.left = false;
      I.right = false;
    }
    if (p?.vel) p.vel.x = 0;
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

  function deepMergePose(basePose, extraPose){
    const base = (basePose && typeof basePose === 'object') ? clone(basePose) : {};
    const extra = (extraPose && typeof extraPose === 'object') ? extraPose : null;
    if (!extra) return base;
    Object.keys(extra).forEach((key)=>{
      const value = extra[key];
      if (value && typeof value === 'object' && !Array.isArray(value)){
        base[key] = deepMergePose(base[key], value);
      } else {
        base[key] = clone(value);
      }
    });
    return base;
  }

  function resolvePhaseBasePose(preset, phaseKey){
    const poseDef = preset?.poses?.[phaseKey];
    if (poseDef){
      const copy = clone(poseDef);
      if (Array.isArray(copy.segments)) delete copy.segments;
      return copy;
    }
    return buildPoseFromKey(phaseKey);
  }

  function collectTimelineSpecs(preset, phaseKey){
    const specs = [];
    if (Array.isArray(preset?.poseTimeline)){
      preset.poseTimeline.forEach((entry)=>{
        if (!entry || typeof entry !== 'object') return;
        const phase = keyToPhase(entry.phase || entry.stage || entry.key);
        if (phase && phase === phaseKey){
          specs.push(clone(entry));
        }
      });
    }
    const phasePose = preset?.poses?.[phaseKey];
    if (phasePose && Array.isArray(phasePose.segments) && phasePose.segments.length){
      phasePose.segments.forEach((entry)=>{
        if (!entry) return;
        specs.push(clone(entry));
      });
    }
    return specs;
  }

  function buildPoseForSegment(basePose, spec){
    const segment = spec && typeof spec === 'object' ? spec : {};
    let pose;
    if (segment.inheritBase === false){
      pose = {};
    } else {
      pose = deepMergePose({}, basePose || {});
    }
    if (segment.poseKey){
      pose = deepMergePose({}, buildPoseFromKey(segment.poseKey));
    }
    if (segment.pose && typeof segment.pose === 'object'){
      pose = deepMergePose(pose, segment.pose);
    }
    if (segment.overrides && typeof segment.overrides === 'object'){
      pose = deepMergePose(pose, segment.overrides);
    }
    if (segment.boneLengthScales && typeof segment.boneLengthScales === 'object'){
      pose.boneLengthScales = { ...(pose.boneLengthScales || {}), ...clone(segment.boneLengthScales) };
    }
    if (segment.lengthScales && typeof segment.lengthScales === 'object'){
      pose.boneLengthScales = { ...(pose.boneLengthScales || {}), ...clone(segment.lengthScales) };
    }
    if (segment.layerOverrides && Array.isArray(segment.layerOverrides)){
      pose.layerOverrides = clone(segment.layerOverrides);
    }
    if (segment.mask) pose.mask = clone(segment.mask);
    if (segment.joints) pose.joints = clone(segment.joints);
    return pose;
  }

  function buildAttackTimeline(presetName, stageDurations, context){
    const preset = C.presets?.[presetName];
    const phases = ['Windup', 'Strike', 'Recoil', 'Stance'];
    const segments = [];
    let currentTime = 0;
    phases.forEach((phaseKey)=>{
      const basePose = resolvePhaseBasePose(preset, phaseKey) || {};
      const specs = collectTimelineSpecs(preset, phaseKey);
      const segmentSpecs = specs.length ? specs : [null];
      const weights = segmentSpecs.map((spec)=>{
        if (!spec || typeof spec !== 'object') return 1;
        const weight = Number(spec.weight ?? spec.duration ?? spec.durationWeight);
        return Number.isFinite(weight) && weight > 0 ? weight : 1;
      });
      const totalWeight = weights.reduce((sum, value)=> sum + value, 0) || segmentSpecs.length || 1;
      const phaseDuration = Math.max(0, stageDurations?.[phaseKey] ?? 0);
      let remaining = phaseDuration;
      segmentSpecs.forEach((spec, index)=>{
        const weight = weights[index] || 1;
        let segmentDuration = phaseDuration ? Math.round((phaseDuration * weight) / totalWeight) : 0;
        if (segmentDuration > remaining) segmentDuration = remaining;
        const isLast = index === segmentSpecs.length - 1;
        if (isLast) segmentDuration = remaining;
        const pose = buildPoseForSegment(basePose, spec);
        const startTime = currentTime;
        const endTime = startTime + segmentDuration;
        segments.push({
          phase: phaseKey,
          pose,
          duration: segmentDuration,
          startTime,
          endTime,
          index,
          count: segmentSpecs.length,
          basePose,
          spec: spec ? clone(spec) : null
        });
        currentTime = endTime;
        remaining = Math.max(0, remaining - segmentDuration);
      });
    });
    return segments;
  }

    function runAttackTimeline({ segments, context, onComplete, resetMirrorBeforeStance=false, sequenceSteps=[] }){
      const ordered = Array.isArray(segments) ? segments.slice() : [];
      if (!ordered.length){
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      const steps = Array.isArray(sequenceSteps) ? sequenceSteps.slice() : [];
      steps.sort((a,b)=> (a.startMs || 0) - (b.startMs || 0));
      const timelineState = {
        ordered,
        steps,
        nextStepIndex: 0,
        elapsed: 0,
        totalDuration: ordered.length ? ordered[ordered.length - 1].endTime : 0,
        active: true
      };
      let stanceReset = false;

      const triggerStepsThrough = (timeMs) => {
        if (!timelineState.steps.length) return;
        while (timelineState.nextStepIndex < timelineState.steps.length){
          const step = timelineState.steps[timelineState.nextStepIndex];
          if (!step || !Number.isFinite(step.startMs)) {
            timelineState.nextStepIndex += 1;
            continue;
          }
          if (step.startMs > timeMs + 1e-3) break;
          timelineState.nextStepIndex += 1;
          playAttackSequenceStep(step, context);
        }
      };

      timelineState.triggerStepsThrough = triggerStepsThrough;
      ATTACK.timelineState = timelineState;
      triggerStepsThrough(0);

      const runSegmentAt = (idx) => {
        if (idx >= ordered.length){
          timelineState.active = false;
          ATTACK.timelineState = null;
          if (typeof onComplete === 'function') onComplete();
          return;
        }
        const segment = ordered[idx];
        if (resetMirrorBeforeStance && !stanceReset && segment.phase === 'Stance'){
          resetMirror();
          stanceReset = true;
        }
        triggerStepsThrough(segment.startTime);
        startTransition(segment.pose, segment.phase, segment.duration, ()=>{
          triggerStepsThrough(segment.endTime);
          runSegmentAt(idx + 1);
        });
      };

      runSegmentAt(0);
    }
  function runAttackTimeline({ segments, context, onComplete, resetMirrorBeforeStance=false, sequenceSteps=[] }){
    const ordered = Array.isArray(segments) ? segments.slice() : [];
    if (!ordered.length){
      if (typeof onComplete === 'function') onComplete();
      return;
    }
    const steps = Array.isArray(sequenceSteps) ? sequenceSteps.slice() : [];
    steps.sort((a,b)=> (a.startMs || 0) - (b.startMs || 0));
    let nextStepIndex = 0;
    let stanceReset = false;

    const triggerStepsThrough = (timeMs) => {
      if (!steps.length) return;
      while (nextStepIndex < steps.length){
        const step = steps[nextStepIndex];
        if (!step || !Number.isFinite(step.startMs)) {
          nextStepIndex += 1;
          continue;
        }
        if (step.startMs > timeMs + 1e-3) break;
        nextStepIndex += 1;
        playAttackSequenceStep(step, context);
      }
    };

    triggerStepsThrough(0);

    const runSegmentAt = (idx) => {
      if (idx >= ordered.length){
        if (typeof onComplete === 'function') onComplete();
        return;
      }
      const segment = ordered[idx];
      if (resetMirrorBeforeStance && !stanceReset && segment.phase === 'Stance'){
        resetMirror();
        stanceReset = true;
      }
      triggerStepsThrough(segment.startTime);
      startTransition(segment.pose, segment.phase, segment.duration, ()=>{
        triggerStepsThrough(segment.endTime);
        runSegmentAt(idx + 1);
      });
    };

    runSegmentAt(0);
  }

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
    ATTACK.sequenceSteps = [];
    ATTACK.timelineState = null;
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
    if (!context) {
      ATTACK.sequenceSteps = [];
      return [];
    }
    const normalized = normalizeAttackSequence(context.attack?.sequence);
    if (!normalized.length){
      ATTACK.sequenceSteps = [];
      return [];
    }
    const basePreset = context.preset;
    const applySequenceDuration = typeof context.applyDuration === 'function'
      ? (value) => context.applyDuration(value)
      : (value) => value;
    const prepared = [];
    normalized.forEach((step, index) => {
      const presetName = resolveSequenceStepPreset(step);
      if (!presetName) return;
      const rawStartMs = Number.isFinite(step.startMs) ? step.startMs : 0;
      const startMs = applySequenceDuration(rawStartMs);
      if (index === 0 && (!startMs || startMs <= 0) && presetName === basePreset) return;
      const preparedStep = { ...step, preset: presetName, startMs };
      if (rawStartMs !== startMs && !Number.isFinite(step.rawStartMs)) {
        preparedStep.rawStartMs = rawStartMs;
      }
      prepared.push(preparedStep);
    });
    ATTACK.sequenceSteps = prepared;
    return prepared;
  }

  function playAttackSequenceStep(step, context){
    const presetName = step.preset || step.move;
    if (!presetName) return;
    const preset = C.presets?.[presetName];
    if (!preset) return;
    if (step.attack && context){
      const attackDef = getAttackDef(step.attack) || { id: step.attack, preset: step.preset || step.move };
      const profile = computeAttackProfile(context.ability, attackDef, step.variant, context.fighter);
      if (profile?.colliders?.length){
        context.activeColliderKeys = profile.colliders.slice();
        updateFighterAttackState('Strike', { active: true, context });
      }
    }
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
    const key = G.selectedWeapon
      || C.characters?.[fighterKey]?.weapon
      || C.knockback?.currentWeapon
      || 'unarmed';
    if (C.knockback) {
      C.knockback.currentWeapon = key;
    }
    return key;
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
    const normalizeAllowance = (spec)=>{
      if (!spec) return null;
      const out = {};
      if (Array.isArray(spec.triggers)) out.triggers = spec.triggers.slice();
      if (Array.isArray(spec.types)) out.types = spec.types.slice();
      if (Array.isArray(spec.tags)) out.tags = spec.tags.slice();
      if (spec.classification != null){
        out.classification = Array.isArray(spec.classification)
          ? spec.classification.slice()
          : [spec.classification];
      }
      if (spec.allowNull != null) out.allowNull = !!spec.allowNull;
      return Object.keys(out).length ? out : null;
    };

    Object.entries(raw.slots || {}).forEach(([slotKey, slotDef])=>{
      slots[slotKey] = {
        key: slotKey,
        label: slotDef.label || slotKey,
        lightAbilityId: slotDef.light || null,
        heavyAbilityId: slotDef.heavy || null,
        allowed: {
          light: normalizeAllowance(slotDef.allowed?.light),
          heavy: normalizeAllowance(slotDef.allowed?.heavy)
        }
      };
    });
    return { thresholds, defaults, attacks, abilities, slots };
  }

  function getSlot(slotKey){ return ABILITY_SLOTS[slotKey] || null; }
  function getAbility(id){ return id ? (ABILITY_ABILITIES[id] || null) : null; }
  function getAttackDef(id){ return id ? (ABILITY_ATTACKS[id] || null) : null; }

  function abilityMatchesAllowance(allowance, ability){
    if (!allowance || !ability) return true;
    if (allowance.triggers && allowance.triggers.length){
      if (!ability.trigger || !allowance.triggers.includes(ability.trigger)) return false;
    }
    if (allowance.types && allowance.types.length){
      if (!ability.type || !allowance.types.includes(ability.type)) return false;
    }
    if (allowance.classification && allowance.classification.length){
      const cls = ability.classification || null;
      if (!cls || !allowance.classification.includes(cls)) return false;
    }
    if (allowance.tags && allowance.tags.length){
      const tags = Array.isArray(ability.tags) ? ability.tags : [];
      for (const tag of allowance.tags){
        if (!tags.includes(tag)) return false;
      }
    }
    return true;
  }

  function isAbilityAllowedForSlot(slotKey, weight, ability){
    const slot = getSlot(slotKey);
    if (!slot) return !!ability;
    const allowance = slot.allowed?.[weight] || null;
    return abilityMatchesAllowance(allowance, ability);
  }

  function resolveAllowedAbilityId(slotKey, weight, abilityId){
    if (!abilityId) return null;
    const ability = getAbility(abilityId);
    if (!ability) return null;
    return isAbilityAllowedForSlot(slotKey, weight, ability) ? abilityId : null;
  }

  function getAbilityForSlot(slotKey, type){
    const slot = getSlot(slotKey);
    if (!slot) return null;
    const id = type === 'heavy' ? slot.heavyAbilityId : slot.lightAbilityId;
    if (!id) return null;
    const ability = getAbility(id);
    if (!abilityMatchesAllowance(slot.allowed?.[type], ability)) return null;
    return ability;
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

  function normalizeColliderKeys(keys){
    if (!Array.isArray(keys)) return [];
    const mapped = [];
    const pushKey = (value) => {
      if (!value) return;
      if (mapped.includes(value)) return;
      mapped.push(value);
    };
    const aliases = {
      rightarm: ['handR'],
      righthand: ['handR'],
      rightfist: ['handR'],
      handr: ['handR'],
      leftarm: ['handL'],
      lefthand: ['handL'],
      leftfist: ['handL'],
      handl: ['handL'],
      rightleg: ['footR'],
      footr: ['footR'],
      leftleg: ['footL'],
      footl: ['footL'],
      botharms: ['handL', 'handR'],
      bothhands: ['handL', 'handR'],
      bothfeet: ['footL', 'footR'],
    };
    keys.forEach((entry) => {
      if (typeof entry !== 'string') return;
      const trimmed = entry.trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (aliases[lower]) {
        aliases[lower].forEach(pushKey);
      } else {
        const normalized = trimmed
          .replace(/[^a-z0-9]/gi, '')
          .replace(/^([a-z])/, (m) => m.toLowerCase());
        if (normalized === 'rightarm' || normalized === 'rhand') {
          pushKey('handR');
        } else if (normalized === 'leftarm' || normalized === 'lhand') {
          pushKey('handL');
        } else if (normalized === 'rightleg' || normalized === 'rfoot') {
          pushKey('footR');
        } else if (normalized === 'leftleg' || normalized === 'lfoot') {
          pushKey('footL');
        } else if (normalized) {
          pushKey(trimmed);
        }
      }
    });
    return mapped;
  }

  function applyAttackData(target, source){
    if (!source) return target;
    const data = typeof source === 'function' ? source(target) : source;
    if (!data) return target;
    if (data.damage && typeof data.damage === 'object'){
      target.damage = { ...(target.damage || {}) };
      Object.entries(data.damage).forEach(([key, value]) => {
        if (Number.isFinite(value)){
          target.damage[key] = value;
        }
      });
    }
    if (Number.isFinite(data.staminaCost)){
      target.staminaCost = data.staminaCost;
    } else if (data.staminaCost === 0){
      target.staminaCost = 0;
    }
    const colliderSources = [];
    if (data.colliders) colliderSources.push(data.colliders);
    if (data.limbMask) colliderSources.push(data.limbMask);
    if (data.colliderKeys) colliderSources.push(data.colliderKeys);
    if (colliderSources.length){
      const normalized = normalizeColliderKeys(colliderSources.flat());
      if (normalized.length) target.colliders = normalized;
    }
    if (data.useWeaponColliders === true) {
      target.useWeaponColliders = true;
    } else if (data.useWeaponColliders === false) {
      target.useWeaponColliders = false;
    }
    return target;
  }

  function collectAttackData(ability, attack, variant){
    let data = {};
    const apply = (value) => {
      data = applyAttackData(data, value);
    };
    const abilityAttackData = ability?.attackData;
    if (abilityAttackData){
      const hasDirect = ['damage', 'staminaCost', 'colliders', 'limbMask', 'colliderKeys']
        .some((key) => abilityAttackData[key] != null);
      if (hasDirect) apply(abilityAttackData);
      if (abilityAttackData.default) apply(abilityAttackData.default);
      if (attack?.id && abilityAttackData.perAttack?.[attack.id]){
        apply(abilityAttackData.perAttack[attack.id]);
      }
      if (attack?.id && abilityAttackData[attack.id]){
        apply(abilityAttackData[attack.id]);
      }
    }
    if (attack?.attackData){
      apply(attack.attackData);
    }
    if (variant?.attackData){
      apply(variant.attackData);
    }
    return data;
  }

  function computeAttackProfile(ability, attack, variant, fighter){
    const mergedData = collectAttackData(ability, attack, variant);
    const stats = fighter?.stats || ability?.stats || {};
    const statProfile = fighter ? getStatProfile(fighter) : getStatProfile(stats);
    const baseline = Number.isFinite(stats.baseline)
      ? stats.baseline
      : Number.isFinite(statProfile?.baseline)
        ? statProfile.baseline
        : 10;
    const strength = Number.isFinite(stats.strength) ? stats.strength : baseline;
    const agility = Number.isFinite(stats.agility) ? stats.agility : baseline;
    const strengthMultiplier = Number.isFinite(statProfile?.strengthMultiplier)
      ? statProfile.strengthMultiplier
      : 1 + (strength - baseline) * 0.05;
    const staminaMultiplier = Number.isFinite(statProfile?.staminaCostMultiplier)
      ? statProfile.staminaCostMultiplier
      : Math.min(1.75, Math.max(0.3, 1 - (agility - baseline) * 0.04));
    const damage = {};
    if (mergedData.damage){
      Object.entries(mergedData.damage).forEach(([type, baseValue]) => {
        if (Number.isFinite(baseValue)){
          damage[type] = Math.max(0, Math.round(baseValue * strengthMultiplier));
        }
      });
    }
    const baseStaminaCost = Number.isFinite(mergedData.staminaCost) ? mergedData.staminaCost : 0;
    const staminaCost = Math.max(0, Math.round(baseStaminaCost * staminaMultiplier));
    const colliders = Array.isArray(mergedData.colliders) ? mergedData.colliders.slice() : [];
    const useWeaponColliders = mergedData.useWeaponColliders === true;
    return {
      base: mergedData,
      damage,
      staminaCost,
      colliders,
      useWeaponColliders,
      strengthMultiplier,
      staminaMultiplier,
      statProfile,
    };
  }

  function instantiateAbility(baseAbility, fighter){
    if (!baseAbility) return null;
    const cloned = clone(baseAbility);
    if (!cloned) return null;
    if (fighter?.stats) cloned.stats = fighter.stats;
    cloned.__base = baseAbility;
    cloned.__fighter = fighter || null;
    return cloned;
  }

  function canPayAbilityCosts(context){
    if (!context) return false;
    const staminaCost = Number.isFinite(context.costs?.stamina) ? context.costs.stamina : 0;
    if (staminaCost > 0){
      const stamina = context.fighter?.stamina;
      if (!stamina) return false;
      const current = Number.isFinite(stamina.current) ? stamina.current : 0;
      return current >= staminaCost;
    }
    return true;
  }

  function applyAbilityCosts(context){
    if (!context) return;
    const staminaCost = Number.isFinite(context.costs?.stamina) ? context.costs.stamina : 0;
    if (staminaCost > 0){
      const stamina = context.fighter?.stamina;
      if (stamina){
        const current = Number.isFinite(stamina.current) ? stamina.current : 0;
        stamina.current = Math.max(0, current - staminaCost);
      }
    }
  }

  function ensureAbilityCosts(context){
    if (!canPayAbilityCosts(context)) return false;
    applyAbilityCosts(context);
    return true;
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
        const value = resolveAllowedAbilityId(slotKey, 'light', slotValues.light) || null;
        slot.lightAbilityId = value;
        state.light = value;
      }
      if ('heavy' in slotValues) {
        const value = resolveAllowedAbilityId(slotKey, 'heavy', slotValues.heavy) || null;
        slot.heavyAbilityId = value;
        state.heavy = value;
        if (DEFENSE.active && DEFENSE.slot === slotKey && DEFENSE.abilityId !== value) {
          stopDefensiveAbility('reassigned');
        }
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

  function applyContextDamage(target, context, _collisions){
    if (!target || !context) return;
    const attackProfile = context.attackProfile || {};
    const damage = context.damage || attackProfile.damage;
    if (!damage) return;
    const healthDamage = Number.isFinite(damage?.health) ? damage.health : null;
    if (healthDamage && target.health){
      const max = Number.isFinite(target.health.max) ? target.health.max : (Number.isFinite(target.health.current) ? target.health.current : 100);
      const current = Number.isFinite(target.health.current) ? target.health.current : max;
      target.health.current = Math.max(0, Math.round(current - healthDamage));
    }
  }

  function buildAttackContext({ abilityId, ability, attackId, attack, slotKey, type, variant, chargeStage=0, comboHits }){
    const fighter = P();
    const abilityInstance = ability && ability.__base ? ability : instantiateAbility(ability, fighter);
    const preset = resolveAttackPreset(attack, variant, abilityInstance, attackId);
    let multipliers = combineMultiplierSources(attack, abilityInstance, variant);
    const context = {
      abilityId,
      ability: abilityInstance,
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
      tags: [...new Set([...(abilityInstance?.tags || []), ...(attack?.tags || []), ...(variant?.tags || [])])]
    };
    if (Number.isFinite(chargeStage) && abilityInstance?.charge?.stageMultipliers){
      try {
        const stageMultipliers = abilityInstance.charge.stageMultipliers(chargeStage, context);
        multipliers = combineMultiplierSources(multipliers, stageMultipliers);
        context.multipliers = multipliers;
      } catch(err){
        console.warn('[combat] stageMultipliers error', err);
        context.multipliers = multipliers;
      }
    } else {
      context.multipliers = multipliers;
    }
    const attackProfile = computeAttackProfile(context.ability, attack, variant, fighter);
    const statProfile = attackProfile?.statProfile || (fighter ? getStatProfile(fighter) : null);
    if (statProfile) {
      const statMultipliers = buildStatContextMultipliers(statProfile);
      if (statMultipliers) {
        multipliers = combineMultiplierSources(multipliers, statMultipliers);
        context.multipliers = multipliers;
      }
      context.statProfile = statProfile;
    }
    context.attackProfile = attackProfile;
    context.damage = attackProfile.damage;
    context.staminaCost = attackProfile.staminaCost;
    context.costs = { stamina: attackProfile.staminaCost };
    const explicitColliders = Array.isArray(attackProfile.colliders) && attackProfile.colliders.length
      ? attackProfile.colliders.slice()
      : inferActiveCollidersForPreset(preset);
    context.activeColliderKeys = explicitColliders;
    context.invoke = (hook, ...args) => invokeHook(context, hook, ...args);
    context.onExecute = (...args) => invokeHook(context, 'onExecute', ...args);
    context.onHit = (opponent, collisions) => {
      applyContextDamage(opponent, context, collisions);
      invokeHook(context, 'onHit', opponent, collisions);
    };
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
      const explicitKeys = Array.isArray(context?.activeColliderKeys) && context.activeColliderKeys.length
        ? context.activeColliderKeys.slice()
        : inferActiveCollidersForPreset(attackState.preset || context?.preset);
      const allowWeaponColliders =
        context?.attackProfile?.useWeaponColliders === true
        || context?.attackProfile?.base?.useWeaponColliders === true
        || context?.attack?.useWeaponColliders === true
        || context?.attack?.attackData?.useWeaponColliders === true
        || context?.variant?.attackData?.useWeaponColliders === true
        || context?.ability?.attackData?.useWeaponColliders === true
        || CONFIG.presets?.[attackState.preset]?.useWeaponColliders === true;
      const allowedTags = new Set();
      const addAllowed = (value) => {
        if (value == null) return;
        const str = String(value).trim();
        if (str) allowedTags.add(str.toUpperCase());
      };
      addAllowed(attackState.preset || context?.preset);
      addAllowed(context?.attackId);
      addAllowed(context?.attack?.id);
      if (Array.isArray(context?.attack?.sequence)) {
        context.attack.sequence.forEach((entry) => {
          if (!entry) return;
          if (typeof entry === 'string') {
            addAllowed(entry);
          } else {
            addAllowed(entry.move || entry.id || entry.preset);
          }
        });
      }
      const weaponKeys = allowWeaponColliders
        ? collectWeaponColliderKeys(fighter, {
            allowedTags,
            preset: attackState.preset || context?.preset,
            defaultActivationTag: 'STRIKE'
          })
        : [];
      if (allowWeaponColliders && weaponKeys.length) {
        const merged = new Set(Array.isArray(explicitKeys) ? explicitKeys : []);
        for (const key of weaponKeys) merged.add(key);
        attackState.currentActiveKeys = Array.from(merged);
      } else {
        attackState.currentActiveKeys = Array.isArray(explicitKeys) ? explicitKeys : [];
      }
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

    const usePresetDurations = !!(preset && preset.poses);
    const baseWindup = windupMs ?? (usePresetDurations ? (durs.toWindup ?? 160) : (durs.toWindup ?? 0));
    const baseStrike = usePresetDurations ? (durs.toStrike ?? 110) : (durs.toStrike ?? 0);
    const baseRecoil = usePresetDurations ? (durs.toRecoil ?? 200) : (durs.toRecoil ?? 0);
    const baseStance = usePresetDurations ? (durs.toStance ?? 120) : (durs.toStance ?? 0);

    const actualWindup = applyDurationMultiplier(baseWindup, ctx, 'Windup');
    const strikeTime = applyDurationMultiplier(baseStrike, ctx, 'Strike');
    const recoilTime = applyDurationMultiplier(baseRecoil, ctx, 'Recoil');
    const stanceTime = applyDurationMultiplier(baseStance, ctx, 'Stance');

    const stageDurations = {
      Windup: actualWindup,
      Strike: strikeTime,
      Recoil: recoilTime,
      Stance: stanceTime
    };

    const sequenceSteps = scheduleAttackSequence(ctx);
    const stanceBasePose = resolvePhaseBasePose(preset, 'Stance') || {};
    const timeline = buildAttackTimeline(presetName, stageDurations, ctx);

    const handleComplete = () => {
      const finishedContext = ATTACK.context;
      clearAttackSequenceTimers();
      if (finishedContext?.onComplete){
        try { finishedContext.onComplete(); } catch(err){ console.warn('[combat] onComplete error', err); }
      }
      ATTACK.active = false;
      ATTACK.preset = null;
      ATTACK.context = null;
      updateFighterAttackState('Stance', { active: false, context: null });
    };

    runAttackTimeline({
      segments: timeline,
      context: ctx,
      resetMirrorBeforeStance: !!stanceBasePose.resetFlipsBefore,
      sequenceSteps,
      onComplete: handleComplete
    });
  }

  function executeHeavyAbility(slotKey, abilityId, chargeStage){
    const abilityTemplate = getAbility(abilityId);
    if (!abilityTemplate) return;

    const fighter = P();
    const ability = instantiateAbility(abilityTemplate, fighter);
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

    if (!ensureAbilityCosts(context)){
      console.log(logPrefix, `Heavy ability ${abilityId} blocked - not enough stamina`);
      ATTACK.pendingAbilityId = null;
      return;
    }

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

    const fighter = P();
    const abilityBase = resolveComboAbilityForWeapon(abilityTemplate);
    const ability = instantiateAbility(abilityBase, fighter);
    if (!ability) return;
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

    if (!ensureAbilityCosts(context)){
      console.log(logPrefix, `Combo ability ${abilityId} blocked - not enough stamina`);
      return;
    }

    logAbilityExecution(context, 'combo');

    playQuickAttack(context.preset, windupOverride, context);

    COMBO.sequenceIndex = (COMBO.sequenceIndex + 1) % sequence.length;
    COMBO.hits++;
    COMBO.timer = ability.comboWindowMs ?? ABILITY_DEFAULTS.comboWindowMs;
    COMBO.lastAbilityId = abilityId;
  }

  function triggerQuickAbility(slotKey, abilityId, { skipQueue = false } = {}){
    const abilityTemplate = getAbility(abilityId);
    if (!abilityTemplate) return;

    const fighter = P();
    const ability = instantiateAbility(abilityTemplate, fighter);
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

    if (!ensureAbilityCosts(context)){
      console.log(logPrefix, `Quick ability ${abilityId} blocked - not enough stamina`);
      return;
    }

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

    const heavyAbility = getAbilityForSlot(slotKey, 'heavy');
    const preserveDirectional = heavyAbility?.trigger === 'defensive';
    neutralizeMovement({ preserveDirectional });

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
      if (DEFENSE.active && DEFENSE.slot === slotKey){
        stopDefensiveAbility('released');
        return;
      }
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

    if (type === 'combo'){
      neutralizeMovement();
      triggerComboAbility(button, abilityId, { skipQueue: true });
      return;
    }

    if (type === 'quick'){
      neutralizeMovement();
      triggerQuickAbility(button, abilityId, { skipQueue: true });
      return;
    }

    if (type === 'heavy'){
      const ability = abilityId ? getAbility(abilityId) : getAbilityForSlot(button, 'heavy');
      const isDefensive = ability?.trigger === 'defensive';
      neutralizeMovement({ preserveDirectional: isDefensive, keepVelocity: isDefensive });
      if (abilityId){
        executeHeavyAbility(button, abilityId, chargeStage);
      } else if (ability){
        executeHeavyAbility(button, ability.id, chargeStage);
      }
      return;
    }

    neutralizeMovement();

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

    // Button C
    if (I.buttonC?.down && ATTACK.slot !== 'C'){
      slotDown('C');
    } else if (!I.buttonC?.down && ATTACK.slot === 'C'){
      slotUp('C');
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
      if (ability?.trigger === 'defensive'){
        if (!DEFENSE.active){
          startDefensiveAbility(slotKey, ability);
        }
      } else if (ability?.trigger === 'hold-release'){
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
    if (ability.trigger === 'defensive') return;
    const stageMs = ability.charge?.stageDurationMs ?? ABILITY_THRESHOLDS.chargeStageMs;
    const newStage = Math.floor(heldMs / stageMs);

    if (newStage !== CHARGE.stage){
      CHARGE.stage = newStage;
      console.log(logPrefix, `Charge stage: ${CHARGE.stage}`);
    }
  }

  function updateDefensive(dt){
    if (!DEFENSE.active) return;
    const slotKey = DEFENSE.slot;
    if (!slotKey){
      stopDefensiveAbility('no-slot');
      return;
    }
    const buttonKey = SLOT_TO_BUTTON[slotKey];
    const input = resolveInput();
    const button = buttonKey ? input?.[buttonKey] : null;
    if (!button?.down){
      stopDefensiveAbility('released');
      return;
    }
    const fighter = P();
    const stamina = fighter?.stamina;
    if (!fighter || !stamina || !DEFENSE.context){
      stopDefensiveAbility('no-fighter');
      return;
    }
    const current = Number.isFinite(stamina.current) ? stamina.current : 0;
    if (current <= 0){
      stopDefensiveAbility('stamina');
      return;
    }
    const ability = DEFENSE.context?.ability;
    const max = Number.isFinite(stamina.max) ? stamina.max : 0;
    const minToDash = Number.isFinite(stamina.minToDash) ? stamina.minToDash : 0;
    const ratio = Number.isFinite(ability?.defensive?.minStaminaRatio)
      ? Math.max(0, ability.defensive.minStaminaRatio)
      : null;
    const ratioRequirement = ratio != null ? max * ratio : 0;
    const required = Math.max(minToDash, ratioRequirement, 0);
    if (required > 0 && current < required){
      stopDefensiveAbility('stamina');
      return;
    }

    stamina.isDashing = true;

    const nowMs = now();
    if (nowMs >= DEFENSE.nextRefresh){
      const pose = buildPoseFromKey(DEFENSE.poseKey || 'Stance');
      pushPoseOverride(poseTarget, pose, DEFENSE.poseHoldMs);
      DEFENSE.nextRefresh = nowMs + DEFENSE.poseHoldMs;
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

  function updateAttackTimeline(dt){
    const state = ATTACK.timelineState;
    if (!state || !state.active) return;
    const deltaMs = Number.isFinite(dt) ? Math.max(0, dt * 1000) : 0;
    const nextElapsed = Math.min(
      Number.isFinite(state.totalDuration) ? state.totalDuration : Number.POSITIVE_INFINITY,
      state.elapsed + deltaMs
    );
    state.elapsed = nextElapsed;
    if (typeof state.triggerStepsThrough === 'function'){
      state.triggerStepsThrough(nextElapsed);
    }
    if (!Number.isFinite(state.totalDuration) || nextElapsed < state.totalDuration) return;
    if (!state.steps?.length || state.nextStepIndex >= state.steps.length){
      state.active = false;
      ATTACK.timelineState = null;
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

  function updateResources(dt){
    const fighter = P();
    if (!fighter || fighter.isDead) return;
    const profile = getStatProfile(fighter);
    applyStaminaTick(fighter, dt);
    applyHealthRegenFromStats(fighter, dt, profile);
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

    const effectiveInput = p.isDead ? null : input;
    const attackBlocksMovement = !p.isDead && ATTACK.active && ATTACK.context?.type !== 'defensive';
    updateFighterPhysics(p, C, dt, {
      input: effectiveInput,
      attackActive: attackBlocksMovement,
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

  function getComboState(){
    return {
      hits: COMBO.hits,
      sequenceIndex: COMBO.sequenceIndex,
      active: COMBO.timer > 0,
      timerMs: COMBO.timer,
      lastAbilityId: COMBO.lastAbilityId,
    };
  }

  function tick(dt){
    const fighter = P();
    if (!fighter) return;
    const isDead = !!fighter.isDead;
    if (autoProcessInput && !isDead) handleButtons();
    if (!isDead) {
      updateCharge(dt);
      updateDefensive(dt);
      updateTransitions(dt);
      updateAttackTimeline(dt);
      updateCombo(dt);
      updateResources(dt);
      updateMovement(dt);
      processQueue();
    } else {
      updateMovement(dt);
    }
  }

  return {
    tick,
    slotDown,
    slotUp,
    updateSlotAssignments,
    getAbilityForSlot,
    getComboState,
    isPlayerAttacking: isFighterAttacking,
    isPlayerCharging: isFighterCharging,
    isPlayerBusy: isFighterBusy,
    isFighterAttacking,
    isFighterCharging,
    isFighterBusy
  };
}
