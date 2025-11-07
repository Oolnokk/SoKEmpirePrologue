// combat.js — Full attack system matching reference HTML (tap/hold, charge, combo, queue)
import { pushPoseOverride } from './animator.js?v=2';

export function initCombat(){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  G.combat = makeCombat(G, C);
  console.log('[combat] ready');
}

function makeCombat(G, C){
  const now = ()=> performance.now();
  const P = ()=> G.FIGHTERS?.player;
  
  // Attack input config (matching reference)
  const ATTACK_INPUT = {
    thresholds: { 
      tapMaxMs: 200,        // Tap if released before this
      chargeStageMs: 200    // Time per charge stage (5 stages = 1000ms)
    },
    slots: {
      A: { 
        light: { type: 'combo' },  // Combo system
        heavy: { type: 'hold-release', preset: 'SLAM', maxChargeStages: 5, minChargeStages: 1 }
      },
      B: {
        light: { type: 'quick', preset: 'PUNCH', windupMs: 0 },
        heavy: { type: 'hold-release', preset: 'SLAM', maxChargeStages: 5, minChargeStages: 1 }
      }
    }
  };

  // Attack state
  const ATTACK = {
    active: false,
    preset: null,
    slot: null,
    downTime: 0,
    facingRadAtPress: 0,
    dirSign: 1,
    isCharging: false,
    isHoldRelease: false,
    chargeStage: 0
  };

  // Charge state
  const CHARGE = {
    active: false,
    stage: 0,
    startTime: 0
  };

  // Attack queue (stores 1 pending attack)
  const QUEUE = {
    pending: false,
    type: null,    // 'light' or 'heavy'
    button: null,  // 'A' or 'B'
    chargeStage: 0,
    downTime: 0
  };

  // Combo state
  const COMBO = {
    hits: 0,
    sequenceIndex: 0,
    timer: 0
  };

  // Transition state
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

  // Start transition with callback
  function startTransition(targetPose, label, durMs, callback){
    TRANSITION.active = true;
    TRANSITION.target = label;
    TRANSITION.elapsed = 0;
    TRANSITION.duration = durMs;
    TRANSITION.callback = callback;
    
    pushPoseOverride('player', targetPose, durMs);
  }

  // Play combo attack
  function playComboAttack(){
    if (!canAttackNow()){
      console.log('Combo blocked - queueing');
      QUEUE.pending = true;
      QUEUE.type = 'light';
      QUEUE.button = 'A';
      QUEUE.downTime = now();
      return;
    }

    const comboConfig = C.combo || {};
    const useAlt = (COMBO.hits >= 4 && COMBO.timer > 0);
    const seq = useAlt ? (comboConfig.altSequence || []) : (comboConfig.sequence || []);
    
    if (seq.length === 0) return;
    
    const presetName = seq[COMBO.sequenceIndex % seq.length];
    console.log(`Combo hit ${COMBO.hits+1}: ${presetName}`);
    
    playQuickAttack(presetName, 0);
    
    // Advance combo
    COMBO.sequenceIndex = (COMBO.sequenceIndex + 1) % seq.length;
    COMBO.hits++;
    COMBO.timer = comboConfig.timerDuration || 3000;
  }

  // Play quick attack
  function playQuickAttack(presetName, windupMs){
    ATTACK.active = true;
    ATTACK.preset = presetName;
    
    const durs = getPresetDurations(presetName);
    const windupPose = buildPoseFromKey('Windup');
    const strikePose = buildPoseFromKey('Strike');
    const recoilPose = buildPoseFromKey('Recoil');
    const stancePose = buildPoseFromKey('Stance');
    
    const actualWindup = windupMs || durs.toWindup;
    
    startTransition(windupPose, 'Windup', actualWindup, ()=>{
      startTransition(strikePose, 'Strike', durs.toStrike, ()=>{
        startTransition(recoilPose, 'Recoil', durs.toRecoil, ()=>{
          startTransition(stancePose, 'Stance', durs.toStance, ()=>{
            ATTACK.active = false;
            ATTACK.preset = null;
          });
        });
      });
    });
  }

  // Execute heavy attack
  function executeHeavyAttack(slotKey, chargeStage){
    const slot = ATTACK_INPUT.slots[slotKey];
    if (!slot || !slot.heavy) return;
    
    console.log(`Heavy attack: ${slot.heavy.preset} charge=${chargeStage}`);
    
    ATTACK.active = true;
    ATTACK.preset = slot.heavy.preset;
    ATTACK.isHoldRelease = true;
    ATTACK.chargeStage = chargeStage;
    
    const durs = getPresetDurations(slot.heavy.preset);
    const strikePose = buildPoseFromKey('Strike');
    const recoilPose = buildPoseFromKey('Recoil');
    const stancePose = buildPoseFromKey('Stance');
    
    // Go straight to strike (already in windup from charging)
    startTransition(strikePose, 'Strike', durs.toStrike, ()=>{
      startTransition(recoilPose, 'Recoil', durs.toRecoil, ()=>{
        startTransition(stancePose, 'Stance', durs.toStance, ()=>{
          ATTACK.active = false;
          ATTACK.preset = null;
          ATTACK.isHoldRelease = false;
        });
      });
    });
  }

  // Button down handler
  function slotDown(slotKey){
    const slot = ATTACK_INPUT.slots[slotKey];
    if (!slot) return;
    
    neutralizeMovement();
    
    // Queue if blocked
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
    ATTACK.facingRadAtPress = captureFacingAtPress();
    ATTACK.dirSign = (Math.cos(ATTACK.facingRadAtPress) >= 0) ? 1 : -1;
    ATTACK.downTime = now();
    
    // Start charge for hold-release
    CHARGE.active = true;
    CHARGE.stage = 0;
    CHARGE.startTime = now();
    
    if (slot.heavy && slot.heavy.type === 'hold-release'){
      ATTACK.active = true;
      ATTACK.isCharging = true;
      ATTACK.preset = slot.heavy.preset;
      
      const windupPose = buildPoseFromKey('Windup');
      pushPoseOverride('player', windupPose, 10000); // Long duration for charging
      
      console.log('Charge mode started');
    }
  }

  // Button up handler
  function slotUp(slotKey){
    const tUp = now();
    const slot = ATTACK_INPUT.slots[slotKey];
    if (!slot) return;
    
    const heldMs = tUp - (ATTACK.downTime || tUp);
    const tap = heldMs <= ATTACK_INPUT.thresholds.tapMaxMs;
    
    console.log(`Button ${slotKey} released: held=${heldMs}ms, tap=${tap}`);
    
    CHARGE.active = false;
    
    // TAP = LIGHT
    if (tap){
      console.log(`TAP: light attack`);
      
      // Cancel charge if active
      if (ATTACK.isCharging){
        ATTACK.active = false;
        ATTACK.isCharging = false;
        pushPoseOverride('player', buildPoseFromKey('Stance'), 200); // Quick return to stance
      }
      
      // Button A light = Combo
      if (slotKey === 'A' && slot.light.type === 'combo'){
        playComboAttack();
      }
      // Button B light = Quick
      else if (slotKey === 'B' && slot.light.type === 'quick'){
        if (canAttackNow()){
          playQuickAttack(slot.light.preset, slot.light.windupMs || 0);
        }
      }
    }
    // HOLD = HEAVY
    else {
      console.log(`HOLD: heavy attack`);
      
      if (ATTACK.isCharging){
        const chargeStage = Math.min(
          slot.heavy.maxChargeStages || 5,
          Math.floor(heldMs / ATTACK_INPUT.thresholds.chargeStageMs)
        );
        
        ATTACK.isCharging = false;
        
        if (chargeStage >= (slot.heavy.minChargeStages || 1)){
          executeHeavyAttack(slotKey, chargeStage);
        } else {
          console.log('Charge too short, canceled');
          ATTACK.active = false;
          pushPoseOverride('player', buildPoseFromKey('Stance'), 200);
        }
      }
    }
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

  // Update charge stage while holding
  function updateCharge(dt){
    if (!CHARGE.active) return;
    
    const heldMs = now() - CHARGE.startTime;
    const newStage = Math.floor(heldMs / ATTACK_INPUT.thresholds.chargeStageMs);
    
    if (newStage !== CHARGE.stage){
      CHARGE.stage = newStage;
      console.log(`Charge stage: ${CHARGE.stage}`);
    }
  }

  // Update transitions
  function updateTransitions(dt){
    if (!TRANSITION.active) return;
    
    TRANSITION.elapsed += dt * 1000;
    
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

  return { tick };
}
