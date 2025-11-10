// animator.js — restore basic idle/walk posing; robust speed detection; override TTL required
import { degToRad, radToDegNum, angleFromDelta } from './math-utils.js?v=1';
import { setMirrorForPart, resetMirror } from './sprites.js?v=1';
import { pickFighterConfig, pickFighterName } from './fighter-utils.js?v=1';
import { getFaceLock } from './face-lock.js?v=1';

const ANG_KEYS = ['torso','head','lShoulder','lElbow','rShoulder','rElbow','lHip','lKnee','rHip','rKnee'];
// Convert pose object from degrees to radians using centralized utility
function degToRadPose(p){ const o={}; for(const k of ANG_KEYS){ if (p&&p[k]!=null) o[k]=degToRad(p[k]); } return o; }
// Add basePose to pose (matching reference HTML addAngles function)
function addAngles(base, delta){
  const out = {};
  for (const k of ANG_KEYS){
    out[k] = (base?.[k] ?? 0) + (delta?.[k] ?? 0);
  }
  return out;
}
// Common easing helpers (restored from reference)
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
// Custom Windup easing: quick bias into the windup (ease-in-ish) then slow hold
function easeWindup(t){
  // Make the first 60% ease-in steep, final 40% ease-out gently to hold the pose
  if (t < 0.6) return Math.pow(t / 0.6, 2.2) * 0.8; // scaled to avoid overshoot
  const u = (t - 0.6) / 0.4; // 0..1
  return 0.8 + (1 - Math.pow(1 - u, 2)) * 0.2;
}
function lerp(a,b,t){ return a + (b-a)*t; }
function damp(current, target, lambda, dt){ const t = 1 - Math.exp(-lambda*dt); return current + (target - current)*t; }

function ensureAnimState(F){
  F.walk ||= { phase:0, amp:1, t:0 };
  F.jointAngles ||= {};
  F.aim ||= { targetAngle: 0, currentAngle: 0, torsoOffset: 0, shoulderOffset: 0, hipOffset: 0, active: false, headWorldTarget: null };
  if (!F.anim){ F.anim = { last: performance.now()/1000, override:null }; }
}
function pickBase(C){ return (C.poses && C.poses.Stance) ? C.poses.Stance : { torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:190, lKnee:70, rHip:120, rKnee:40 }; }

function computeSpeed(F){ const dt=Math.max(1e-5,(F.anim?.dt||0)); const prevX = (F._prevX==null? F.pos?.x||0 : F._prevX); const curX = F.pos?.x||0; const v = (curX - prevX)/dt; F._prevX = curX; return Math.abs(Number.isFinite(F.vel?.x)? F.vel.x : v); }

function computeWalkPose(F, C){
  const W = C.walk || { enabled:true, baseHz:1.2, speedScale:1.0, minSpeed:60, amp:1.0, poses:{ A:{torso:30,lHip:0,lKnee:45,rHip:180,rKnee:90}, B:{torso:40,lHip:180,lKnee:90,rHip:0,rKnee:45} } };
  const speed = computeSpeed(F);
  const on = !!W.enabled && speed >= (W.minSpeed||60) && (F.onGround!==false);
  // compute frequency scaled by speed (clamped)
  const baseHzFactor = (W.baseHz||1.2) * (W.speedScale||1.0);
  const movementScale = (speed > 1) ? Math.min(3, 0.5 + speed / (C.movement?.maxSpeedX||300)) : 1;
  const baseHz = baseHzFactor * movementScale;

  // initialize walk state
  F.walk.phase = (F.walk.phase || 0);
  F.walk.amp = (F.walk.amp == null) ? (W.amp || 1.0) : F.walk.amp;

  // Smoothly approach target amplitude to avoid pops (use damp)
  const targetAmp = on ? (W.amp || 1.0) : 0;
  F.walk.amp = damp(F.walk.amp, targetAmp, 8, F.anim?.dt || 0);

  // Advance phase when there is amplitude (so we keep continuity even when stopping briefly)
  const dt = Math.max(1e-6, F.anim?.dt || 0);
  F.walk.phase += dt * baseHz * Math.PI * 2;
  // wrap phase to keep numeric stability
  if (F.walk.phase > Math.PI * 2) F.walk.phase %= (Math.PI * 2);

  // phase->s value (apply small smoothing via easeInOut to shape foot travel)
  const rawS = (Math.sin(F.walk.phase) + 1) / 2;
  const s = easeInOutCubic(rawS);

  const A = W.poses?.A || {}; const B = W.poses?.B || {};
  const pose = Object.assign({}, pickBase(C));
  // interpolate leg/torso angles and scale by smoothed amplitude
  pose.lHip = lerp(A.lHip||0, B.lHip||0, s) * F.walk.amp;
  pose.lKnee= lerp(A.lKnee||0,B.lKnee||0,s) * F.walk.amp;
  pose.rHip = lerp(A.rHip||0, B.rHip||0, s) * F.walk.amp;
  pose.rKnee= lerp(A.rKnee||0,B.rKnee||0,s) * F.walk.amp;
  pose.torso= lerp(A.torso||0,B.torso||0,s) * F.walk.amp;
  const base = pickBase(C); pose.lShoulder=base.lShoulder; pose.lElbow=base.lElbow; pose.rShoulder=base.rShoulder; pose.rElbow=base.rElbow;
  pose._active = on && F.walk.amp > 0.001;
  return pose;
}

function getOverride(F){ return (F.anim && F.anim.override) ? F.anim.override : null; }
function clearOverride(F){
  if (!F || !F.anim || !F.anim.override) return;
  const over = F.anim.override;
  // cleanup applied per-part flips
  try{
    if (over.__flipApplied && over.pose && Array.isArray(over.pose.flipParts)){
      for (const p of over.pose.flipParts){ setMirrorForPart(p, false); }
    }
    // Leave full-facing flips intact so attacks that intentionally flip the character keep the new facing
  }catch(_e){ /* best-effort cleanup */ }
  F.anim.override=null;
}

function primeAnimEventsFromPose(pose){
  // normalize event list
  const list = (pose && (pose.anim_events || pose.events)) ? (pose.anim_events || pose.events) : [];
  // clone and sort by time
  const clone = (list||[]).map(e=>Object.assign({}, e));
  clone.sort((a,b)=> (a.time||0) - (b.time||0));
  return clone;
}

function processAnimEventsForOverride(F, over){
  if (!over) return;
  const now = performance.now()/1000;
  const dur = over.__dur || (over.until ? Math.max(1e-6, over.until - (over.__start||now)) : 0);
  const k = dur > 0 ? Math.min(1, Math.max(0, (now - (over.__start||now)) / dur)) : 1;
  over.__k = k;
  // process scheduled events
  const events = over.__events || [];
  for (const ev of events){
    if (ev.__applied) continue;
    const t = Number.isFinite(ev.time) ? ev.time : 0;
    if (k >= t){
      ev.__applied = true;
      // velocity events
      if (Number.isFinite(ev.velocityX)){
        const vx = ev.localVel ? (ev.velocityX * (F.facingSign || 1)) : ev.velocityX;
        F.vel = F.vel || {x:0,y:0}; F.vel.x = vx;
      }
      if (Number.isFinite(ev.velocityY)){
        F.vel = F.vel || {x:0,y:0}; F.vel.y = ev.velocityY;
      }
      // impulse -> bump velocity
      if (Number.isFinite(ev.impulse)){
        const dir = (Number.isFinite(ev.impulse_angle) ? degToRad(ev.impulse_angle) : 0);
        const mag = ev.impulse || 0;
        F.vel = F.vel || {x:0,y:0};
        F.vel.x = (F.vel.x||0) + Math.cos(dir) * mag * (ev.localVel ? (F.facingSign || 1) : 1);
        F.vel.y = (F.vel.y||0) + Math.sin(dir) * mag;
      }
    }
  }

  // flip timing
  const P = over.pose || {};
  const flipAt = (typeof P.flipAt === 'number') ? Math.max(0, Math.min(1, P.flipAt)) : 0;
  if (P.flip && !over.__flipApplied && k >= flipAt){
    over.__flipApplied = true;
    const parts = P.flipParts || ['ALL'];
    for (const p of parts){ try{ setMirrorForPart(p, true); }catch(_e){} }
  }
  const fullFlipAt = (typeof P.fullFlipAt === 'number') ? Math.max(0, Math.min(1, P.fullFlipAt)) : flipAt;
  if (P.fullFlipFacing && !over.__fullFlipApplied && k >= fullFlipAt){
    over.__fullFlipApplied = true;

    const normAngle = (ang)=>{
      const TAU = Math.PI * 2;
      ang %= TAU;
      return (ang < 0) ? ang + TAU : ang;
    };

    const prevRad = (typeof F.facingRad === 'number')
      ? F.facingRad
      : ((F.facingSign || 1) < 0 ? Math.PI : 0);
    const newRad = normAngle(prevRad + Math.PI);

    F.facingRad = newRad;

    // Keep sign aligned with the new facing angle (fallback to simple toggle)
    const cos = Math.cos(newRad);
    if (Number.isFinite(cos) && Math.abs(cos) > 1e-6){
      F.facingSign = cos >= 0 ? 1 : -1;
    } else {
      F.facingSign = (F.facingSign || 1) * -1;
    }

    const G = window.GAME || {};
    if (G.FACE?.active && typeof G.FACE.rad === 'number'){
      G.FACE.rad = normAngle(G.FACE.rad + Math.PI);
    }

    if (F.attack && typeof F.attack.dirSign === 'number'){
      F.attack.dirSign *= -1;
    }
  }
}

// Helper to clamp values
function clamp(val, min, max){ return Math.min(max, Math.max(min, val)); }

function normalizeRad(angle){
  const TAU = Math.PI * 2;
  let a = angle % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function getHeadLimitsRad(C, fcfg){
  const limits = fcfg?.limits?.head || C.limits?.head || {};
  const relMin = normalizeRad(degToRad(limits.relMin ?? -75));
  const relMax = normalizeRad(degToRad(limits.relMax ?? 75));
  const min = Math.min(relMin, relMax);
  const max = Math.max(relMin, relMax);
  return { min, max };
}

function computeHeadTargetDeg(F, finalPoseDeg, fcfg){
  const C = window.CONFIG || {};
  const torsoDeg = finalPoseDeg?.torso ?? 0;
  const torsoRad = degToRad(torsoDeg);

  const faceLockRad = getFaceLock();
  let desiredWorld = null;

  if (typeof faceLockRad === 'number') {
    desiredWorld = faceLockRad;
  } else if (F.aim?.active && typeof F.aim.headWorldTarget === 'number') {
    desiredWorld = F.aim.headWorldTarget;
  }

  if (typeof desiredWorld !== 'number') {
    return torsoDeg;
  }

  const { min, max } = getHeadLimitsRad(C, fcfg);
  const relative = normalizeRad(desiredWorld - torsoRad);
  const clamped = clamp(relative, min, max);
  const fighterOffsetDeg = fcfg?.headTracking?.offsetDeg;
  const globalOffsetDeg = C.headTracking?.offsetDeg;
  const offsetDeg = Number.isFinite(fighterOffsetDeg)
    ? fighterOffsetDeg
    : (Number.isFinite(globalOffsetDeg) ? globalOffsetDeg : 0);
  const headRad = torsoRad + clamped + degToRad(offsetDeg);
  return radToDegNum(headRad);
}

// Update aiming offsets based on current pose
function updateAiming(F, currentPose, fighterId){
  const C = window.CONFIG || {};
  const G = window.GAME || {};
  
  if (!C.aiming?.enabled) {
    F.aim.active = false;
    F.aim.torsoOffset = 0;
    F.aim.shoulderOffset = 0;
    F.aim.hipOffset = 0;
    F.aim.headWorldTarget = null;
    return;
  }

  // Only aim if pose allows it
  if (!currentPose.allowAiming) {
    F.aim.active = false;
    F.aim.torsoOffset = 0;
    F.aim.shoulderOffset = 0;
    F.aim.hipOffset = 0;
    F.aim.headWorldTarget = null;
    return;
  }
  
  F.aim.active = true;
  
  let targetAngle;
  let aimSource = 'fallback';
  let mouseDX = 0;
  
  // Use joystick for aiming if active (mobile), otherwise use mouse (desktop)
  if (G.AIMING?.manualAim && G.JOYSTICK?.active) {
    // Joystick aiming - use joystick angle directly
    targetAngle = G.AIMING.targetAngle;
    aimSource = 'joystick';
  } else if (G.MOUSE) {
    // Mouse aiming - calculate angle from fighter to mouse position
    const dx = G.MOUSE.worldX - (F.pos?.x || 0);
    const dy = G.MOUSE.worldY - (F.pos?.y || 0);
    targetAngle = Math.atan2(dy, dx);
    aimSource = 'mouse';
    mouseDX = dx;
    
  } else {
    // Fallback to facingRad
    targetAngle = F.facingRad || 0;
  }
  
  const normAngle = (ang) => {
    const TAU = Math.PI * 2;
    let out = ang % TAU;
    if (out < 0) out += TAU;
    return out;
  };

  const applyFacing = (rad) => {
    const normalized = normAngle(rad);
    F.facingRad = normalized;
    const cos = Math.cos(normalized);
    if (Number.isFinite(cos) && Math.abs(cos) > 1e-6) {
      F.facingSign = cos >= 0 ? 1 : -1;
    }
  };

  const isDashing = !!(F?.stamina?.isDashing || G.STAMINA?.isDashing || G.FIGHTERS?.[fighterId]?.stamina?.isDashing);
  const initialFacing = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);

  if (!isDashing) {
    if (aimSource === 'joystick') {
      const joystickSide = Math.cos(targetAngle) >= 0 ? 0 : Math.PI;
      const currentSide = Math.cos(initialFacing) >= 0 ? 0 : Math.PI;
      if (joystickSide !== currentSide) {
        applyFacing(joystickSide);
      }
    } else if (aimSource === 'mouse') {
      const mouseSide = mouseDX >= 0 ? 0 : Math.PI;
      const currentSide = Math.cos(initialFacing) >= 0 ? 0 : Math.PI;
      if (G.MOUSE?.isDown && mouseSide !== currentSide) {
        applyFacing(mouseSide);
      }
    }
  }

  const facingRad = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);
  let relativeAngle = targetAngle - facingRad;
  // Normalize to -PI to PI range
  while (relativeAngle > Math.PI) relativeAngle -= Math.PI * 2;
  while (relativeAngle < -Math.PI) relativeAngle += Math.PI * 2;

  // Smooth the aim angle (simple exponential smoothing)
  const dt = F.anim?.dt || 0.016;
  const smoothing = 1 - Math.exp(-(C.aiming.smoothing || 8) * dt);
  const currentAngle = F.aim.currentAngle || 0;
  F.aim.currentAngle = currentAngle + (relativeAngle - currentAngle) * smoothing;

  // Calculate offsets based on aim angle
  const facingCos = Math.cos(facingRad);
  let aimDeg = radToDegNum(F.aim.currentAngle);
  if (Number.isFinite(facingCos)) {
    const orientationSign = Math.abs(facingCos) > 1e-4
      ? (facingCos >= 0 ? 1 : -1)
      : ((F.facingSign || 1) >= 0 ? 1 : -1);
    aimDeg *= orientationSign;
  }
  F.aim.torsoOffset = clamp(aimDeg * 0.5, -(C.aiming.maxTorsoAngle || 45), (C.aiming.maxTorsoAngle || 45));
  F.aim.shoulderOffset = clamp(aimDeg * 0.7, -(C.aiming.maxShoulderAngle || 60), (C.aiming.maxShoulderAngle || 60));

  // Apply leg aiming if pose allows it
  if (currentPose.aimLegs) {
    if (currentPose.aimRightLegOnly) {
      F.aim.hipOffset = clamp(aimDeg * 0.6, -50, 50); // Only right leg aims
    } else {
      F.aim.hipOffset = clamp(aimDeg * 0.4, -40, 40); // Both legs aim
    }
  } else {
    F.aim.hipOffset = 0;
  }

  const worldAimStandard = (F.aim.currentAngle || 0) + facingRad;
  if (Number.isFinite(worldAimStandard)) {
    F.aim.headWorldTarget = normalizeRad((Math.PI / 2) - worldAimStandard);
  } else {
    F.aim.headWorldTarget = null;
  }
}

// Apply aiming offsets to a pose
function applyAimingOffsets(poseDeg, F, currentPose){
  if (!F.aim.active) return poseDeg;
  
  const result = {...poseDeg};
  result.torso = (result.torso || 0) + F.aim.torsoOffset;
  result.lShoulder = (result.lShoulder || 0) + F.aim.shoulderOffset;
  result.rShoulder = (result.rShoulder || 0) + F.aim.shoulderOffset;
  
  // Apply leg aiming if present
  if (F.aim.hipOffset !== 0) {
    if (currentPose.aimRightLegOnly) {
      // Only right leg
      result.rHip = (result.rHip || 0) + F.aim.hipOffset;
    } else if (currentPose.aimLegs) {
      // Both legs
      result.lHip = (result.lHip || 0) + F.aim.hipOffset;
      result.rHip = (result.rHip || 0) + F.aim.hipOffset;
    }
  }
  
  return result;
}

export function updatePoses(){
  const G = window.GAME || {}; const C = window.CONFIG || {}; const now = performance.now()/1000; if (!G.FIGHTERS) return;
  // Check if joint angles are frozen (for debugging/manual pose editing)
  if (C.debug?.freezeAngles) return;
  const fighterName = pickFighterName(C);
  const fcfg = pickFighterConfig(C, fighterName);
  for (const id of ['player','npc']){ const F = G.FIGHTERS[id]; if(!F) continue; ensureAnimState(F); F.anim.dt = Math.max(0, now - F.anim.last); F.anim.last = now;
    let targetDeg = null; const over = getOverride(F);
    if (over){
      // process events / flips for active override (k-based)
      processAnimEventsForOverride(F, over);
      if (over.until && now < over.until){ targetDeg = over.pose; }
      else {
        F.anim.override = null;
        if (over.until == null) console.log('[anim] cleared timeless override');
      }
    }
    if (!targetDeg){ const walkPose = computeWalkPose(F,C); if (walkPose._active) targetDeg = walkPose; }
    if (!targetDeg) targetDeg = pickBase(C);
    
    // Update aiming system based on current pose
    updateAiming(F, targetDeg, id);
    
    // Add basePose to targetDeg (matching reference HTML behavior)
    const basePose = C.basePose || {};
    let finalDeg = addAngles(basePose, targetDeg);
    
    // Apply aiming offsets to pose
    finalDeg = applyAimingOffsets(finalDeg, F, targetDeg);

    const headDeg = computeHeadTargetDeg(F, finalDeg, fcfg);
    if (typeof headDeg === 'number') {
      finalDeg.head = headDeg;
    }

    // Debug: log once on first frame for player
    if (id === 'player' && F.anim.dt === 0 && !F.__debugLogged) {
      console.log('[animator] basePose:', basePose);
      console.log('[animator] targetDeg (Stance):', targetDeg);
      console.log('[animator] finalDeg (basePose + Stance):', finalDeg);
      console.log('[animator] Specifically legs:');
      console.log('  basePose.lHip =', basePose.lHip, ', Stance.lHip =', targetDeg.lHip, ', final =', finalDeg.lHip);
      console.log('  basePose.rHip =', basePose.rHip, ', Stance.rHip =', targetDeg.rHip, ', final =', finalDeg.rHip);
      F.__debugLogged = true;
    }
    
    const target = degToRadPose(finalDeg); const lambda = 10;
    for(const k of ANG_KEYS){ const cur = F.jointAngles[k] ?? 0; const tar = target[k] ?? cur; F.jointAngles[k] = damp(cur, tar, lambda, F.anim.dt); }
  }
}

export function pushPoseOverride(fighterId, poseDeg, durMs=300){
  const G = window.GAME || {};
  const F = G.FIGHTERS?.[fighterId];
  if(!F) return;
  ensureAnimState(F);
  const now = performance.now()/1000;
  const dur = (durMs == null) ? 0 : (durMs/1000);
  const over = {
    pose: poseDeg,
    until: dur > 0 ? now + dur : (dur === 0 ? now : null),
    __start: now,
    __dur: dur,
    __events: primeAnimEventsFromPose(poseDeg),
    __flipApplied: false,
    __fullFlipApplied: false,
    __k: 0
  };
  F.anim.override = over;
}
