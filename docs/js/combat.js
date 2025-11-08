// combat.js — Full attack system matching reference HTML (tap/hold, charge, combo, queue)
import { pushPoseOverride } from './animator.js?v=2';
import { resetMirror, setMirrorForPart } from './sprites.js?v=8';

export function initCombat(){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  console.log('[combat] CONFIG.presets:', C.presets);
  console.log('[combat] CONFIG keys:', Object.keys(C));
  G.combat = makeCombat(G, C);
  console.log('[combat] ready');
}

function clearPoseOverride(fighterId){
  const G = window.GAME || {};
  const F = G.FIGHTERS?.[fighterId];
  if (!F || !F.anim) return;
  F.anim.override = null;
}

function makeCombat(G, C){
  const now = ()=> performance.now();
  const P = ()=> G.FIGHTERS?.player;
  
  const abilitySystem = normalizeAbilitySystem(C.abilitySystem || {});
  const ABILITY_THRESHOLDS = abilitySystem.thresholds;
  const ABILITY_DEFAULTS = abilitySystem.defaults;
  const ABILITY_ATTACKS = abilitySystem.attacks;
  const ABILITY_ABILITIES = abilitySystem.abilities;
  const ABILITY_SLOTS = abilitySystem.slots;

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
    pendingAbilityId: null
  };

  const CHARGE = {
    active: false,
    stage: 0,
    startTime: 0
  };

  const QUEUE = {
    pending: false,
    type: null,
    button: null,
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
    callback: null
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
    const I = G.input || {};
    const p = P();
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

  function cloneSequence(sequence){
    if (!Array.isArray(sequence)) return [];
    return sequence.map(step => (typeof step === 'string' || typeof step === 'number') ? step : { ...step });
  }

  function getEquippedWeaponKey(){
    return G.selectedWeapon || C.characters?.player?.weapon || C.knockback?.currentWeapon || 'unarmed';
  }

  function resolveComboAbilityForWeapon(baseAbility){
    if (!baseAbility?.comboFromWeapon) return baseAbility;
    const combos = C.weaponCombos || {};

    const build = (comboDef, key) => {
      if (!comboDef) return null;
      const merged = { ...baseAbility };
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
    TRANSITION.active = true;
    TRANSITION.target = label;
    TRANSITION.elapsed = 0;
    TRANSITION.duration = durMs;
    TRANSITION.callback = callback;
    TRANSITION.flipApplied = false;  // Track if flip has been applied
    TRANSITION.flipAt = targetPose.flipAt;  // Store flip timing
    TRANSITION.flipParts = targetPose.flipParts;  // Store parts to flip

    if (label){
      updatePlayerAttackState(label, { active: label !== 'Stance' || !!ATTACK.active, context: ATTACK.context });
      if (ATTACK.context?.onPhase){
        try { ATTACK.context.onPhase(label); } catch(err){ console.warn('[combat] onPhase handler error', err); }
      }
    }

    pushPoseOverride('player', targetPose, durMs);
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
    const player = P();
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
      character: player,
      player,
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

  function updatePlayerAttackState(label, { active = true, context = ATTACK.context } = {}){
    const p = P();
    if (!p) return;
    p.attack ||= {};
    p.attack.currentPhase = label || 'Stance';
    p.attack.active = !!active;
    p.attack.context = context || null;
    p.attack.handleHit = context?.onHit || null;
  }

  // Play quick attack
  function playQuickAttack(presetName, windupMs, context){
    console.log(`[playQuickAttack] presetName=${presetName}, checking C.presets...`);

    const preset = C.presets?.[presetName];
    const ctx = context || null;
    ATTACK.active = true;
    ATTACK.preset = presetName;
    ATTACK.context = ctx;

    if (ctx?.onExecute){
      try { ctx.onExecute(); } catch(err){ console.warn('[combat] onExecute error', err); }
    }

    const durs = computePresetDurationsWithContext(presetName, ctx);

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
              if (finishedContext?.onComplete){
                try { finishedContext.onComplete(); } catch(err){ console.warn('[combat] onComplete error', err); }
              }
              ATTACK.active = false;
              ATTACK.preset = null;
              ATTACK.context = null;
              updatePlayerAttackState('Stance', { active: false, context: null });
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
              if (finishedContext?.onComplete){
                try { finishedContext.onComplete(); } catch(err){ console.warn('[combat] onComplete error', err); }
              }
              ATTACK.active = false;
              ATTACK.preset = null;
              ATTACK.context = null;
              updatePlayerAttackState('Stance', { active: false, context: null });
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

    const durs = computePresetDurationsWithContext(context.preset, context);
    const strikePose = buildPoseFromKey(attackDef.strikePoseKey || ability.strikePoseKey || 'Strike');
    const recoilPose = buildPoseFromKey(attackDef.recoilPoseKey || ability.recoilPoseKey || 'Recoil');
    const stancePose = buildPoseFromKey(attackDef.stancePoseKey || ability.stancePoseKey || 'Stance');

    const strikeDur = applyDurationMultiplier(durs.toStrike, context, 'Strike');
    const recoilDur = applyDurationMultiplier(durs.toRecoil, context, 'Recoil');
    const stanceDur = applyDurationMultiplier(durs.toStance, context, 'Stance');

    console.log(`Heavy attack: ${context.preset} charge=${chargeStage}`);

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
          updatePlayerAttackState('Stance', { active: false, context: null });
        });
      });
    });
  }

  function triggerComboAbility(slotKey, abilityId){
    const abilityTemplate = getAbility(abilityId);
    if (!abilityTemplate) return;

    const ability = resolveComboAbilityForWeapon(abilityTemplate);
    const sequence = ability.sequence || [];
    if (sequence.length === 0){
      console.warn(`[combat] combo ability "${abilityId}" has no sequence`);
      return;
    }

    if (!canAttackNow()){
      console.log('Combo blocked - queueing');
      QUEUE.pending = true;
      QUEUE.type = 'light';
      QUEUE.button = slotKey;
      QUEUE.downTime = now();
      return;
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

    console.log(`[combo] ${abilityId} -> ${context.preset}`);

    playQuickAttack(context.preset, windupOverride, context);

    COMBO.sequenceIndex = (COMBO.sequenceIndex + 1) % sequence.length;
    COMBO.hits++;
    COMBO.timer = ability.comboWindowMs ?? ABILITY_DEFAULTS.comboWindowMs;
    COMBO.lastAbilityId = abilityId;
  }

  function triggerQuickAbility(slotKey, abilityId){
    const ability = getAbility(abilityId);
    if (!ability) return;

    if (!canAttackNow()){
      console.log('Quick attack blocked - queueing');
      QUEUE.pending = true;
      QUEUE.type = 'light';
      QUEUE.button = slotKey;
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

    console.log(`[quick] ${abilityId} variant=${variant?.id || 'default'} preset=${context.preset}`);

    const windup = variant?.windupMs ?? attackDef.windupMs ?? ability.windupMs ?? 0;
    playQuickAttack(context.preset, windup, context);
  }

  function slotDown(slotKey){
    const slot = getSlot(slotKey);
    if (!slot) return;

    neutralizeMovement();

    if (ATTACK.active || !canAttackNow()){
      console.log(`Button ${slotKey} queued`);
      if (!QUEUE.pending){
        QUEUE.pending = true;
        QUEUE.button = slotKey;
        QUEUE.downTime = now();
      }
      return;
    }

    console.log(`Button ${slotKey} pressed`);

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

    const heldMs = tUp - (ATTACK.downTime || tUp);
    const tap = heldMs <= ABILITY_THRESHOLDS.tapMaxMs;

    console.log(`Button ${slotKey} released: held=${heldMs}ms, tap=${tap}`);

    CHARGE.active = false;
    CHARGE.stage = 0;
    CHARGE.startTime = 0;

    if (tap){
      if (ATTACK.isCharging){
        ATTACK.active = false;
        ATTACK.isCharging = false;
        ATTACK.context = null;
        clearPoseOverride('player');
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
            console.log('Charge too short, canceled');
            ATTACK.active = false;
            ATTACK.preset = null;
            ATTACK.context = null;
            pushPoseOverride('player', buildPoseFromKey('Stance'), 200);
            updatePlayerAttackState('Stance', { active: false, context: null });
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
    
    console.log('Processing queued attack');
    const btn = QUEUE.button;
    QUEUE.pending = false;
    QUEUE.button = null;
    
    // Trigger the queued button as if just pressed
    slotDown(btn);
  }

  // Handle button state changes
  function handleButtons(){
    const I = G.input || {};
    
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
        pushPoseOverride('player', windupPose, ability.charge?.windupHoldMs || 10000);
        updatePlayerAttackState('Windup', { active: true, context: null });
        console.log('Charge mode started (hold detected)', ability.id);
      }
    }

    const ability = getAbilityForSlot(slotKey, 'heavy');
    if (!ability) return;
    const stageMs = ability.charge?.stageDurationMs ?? ABILITY_THRESHOLDS.chargeStageMs;
    const newStage = Math.floor(heldMs / stageMs);

    if (newStage !== CHARGE.stage){
      CHARGE.stage = newStage;
      console.log(`Charge stage: ${CHARGE.stage}`);
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
        console.log(`Applying flip at progress ${progress.toFixed(2)} (flipAt=${TRANSITION.flipAt})`);
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
        console.log('Combo reset');
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
    
    const M = C.movement || {};
    const I = G.input || {};
    
    p.vel ||= {x:0, y:0};
    p.pos ||= {x:0, y:0};
    
    const ax = M.accelX || 1200;
    const max = M.maxSpeedX || 420;
    const fr = M.friction || 8;
    
    // Don't move during attacks
    if (ATTACK.active){
      p.vel.x *= Math.max(0, 1 - fr*dt);
    } else {
      if (I.left && !I.right){
        p.vel.x -= ax*dt;
        p.facingRad = Math.PI;
        p.facingSign = -1;
      } else if (I.right && !I.left){
        p.vel.x += ax*dt;
        p.facingRad = 0;
        p.facingSign = 1;
      } else {
        p.vel.x *= Math.max(0, 1 - fr*dt);
      }
    }
    
    p.vel.x = Math.max(-max, Math.min(max, p.vel.x));
    p.pos.x += p.vel.x * dt;
  }

  function tick(dt){
    handleButtons();
    updateCharge(dt);
    updateTransitions(dt);
    updateCombo(dt);
    updateMovement(dt);
    processQueue();
  }

  return { tick, slotDown, slotUp };
}
