// combat.js — Full attack system matching reference HTML (tap/hold, charge, combo, queue)
import { pushPoseOverride, pushPoseLayerOverride } from './animator.js?v=5';
import { resetMirror, setMirrorForPart } from './sprites.js?v=8';
import { ensureFighterPhysics, updateFighterPhysics } from './physics.js?v=1';
import { updateFighterFootsteps } from './footstep-audio.js?v=1';
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
    timelineState: null,
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

// PATCH: Limb/layer overrides default to segment duration of their subphase
function queuePoseLayerOverrides(targetPose, label, stageDurMs, stageToken, segmentDurMs) {
  if (!targetPose) return;
  const overrides = Array.isArray(targetPose.layerOverrides) ? targetPose.layerOverrides : [];
  if (!overrides.length) return;
  // Use segment duration if provided, else fall back to stage duration
  const segDuration = Number.isFinite(segmentDurMs) ? segmentDurMs : stageDurMs;

  overrides.forEach((layerDef, index) => {
    if (!layerDef || layerDef.enabled === false) return;
    const pose = layerDef.pose || targetPose;
    const layerId = layerDef.layer || layerDef.id || `${label || 'layer'}-${index}`;
    const mask = layerDef.mask || layerDef.joints || pose.mask || pose.joints;
    const priority = layerDef.priority;
    const suppressWalk = layerDef.suppressWalk;
    const useAsBase = layerDef.useAsBase;
    const rawDelay = Number.isFinite(layerDef.delayMs) ? layerDef.delayMs : (Number.isFinite(layerDef.offsetMs) ? layerDef.offsetMs : 0);
    const delayMs = rawDelay > 0 ? rawDelay : 0;
    // PATCH: Duration is segment duration by default for limb overrides
    const durMs = Number.isFinite(layerDef.durMs) ? layerDef.durMs
      : Number.isFinite(layerDef.durationMs) ? layerDef.durationMs
      : Number.isFinite(layerDef.dur) ? layerDef.dur
      : segDuration;

    const guard = () => TRANSITION.active && TRANSITION.activeToken === stageToken && TRANSITION.target === label;
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

// PATCH: Pass segment.duration through from runAttackTimeline to queuePoseLayerOverrides
function runAttackTimeline({ segments, context, onComplete, resetMirrorBeforeStance=false, sequenceSteps=[] }){
  const ordered = Array.isArray(segments) ? segments.slice() : [];
  if (!ordered.length){
    if (typeof onComplete === 'function') onComplete();
    return;
  }
  const steps = normalizeSequenceStepTimings(sequenceSteps, context);
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
    }, segment.duration); // PATCH: Pass segment.duration
  };

  runSegmentAt(0);
}

// PATCH: startTransition—add final argument for segmentDurMs (optional)
function startTransition(targetPose, label, durMs, callback, segmentDurMs){
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
  queuePoseLayerOverrides(targetPose, label, durMs, stageToken, segmentDurMs); // PATCH: segmentDurMs passed through
}

// ...(rest of combat.js remains unchanged)...
