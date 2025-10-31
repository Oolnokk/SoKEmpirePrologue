// combat.js — minimal attack stepper + movement using CONFIG
import { pushPoseOverride } from './animator.js?v=2';
import { consumeTaps } from './controls.js?v=6';

export function initCombat(){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  G.combat = makeCombat(G, C);
  console.log('[combat] ready');
}

function makeCombat(G, C){
  const state = { seq:null, stepIndex:0, timeLeft:0, label:'' };
  const P = ()=> G.FIGHTERS?.player;

  function startSequence(steps, label=''){
    if (!steps || !steps.length) return;
    state.seq = steps.slice(); state.stepIndex = 0; state.timeLeft = (steps[0].durMs||120); state.label = label;
    applyStep();
  }
  function applyStep(){
    const s = state.seq?.[state.stepIndex]; if (!s) return stopSequence();
    const poseDeg = buildPoseFromKey(C, s.poseKey || s.pose || s.poseKeyName);
    pushPoseOverride('player', poseDeg, s.durMs||120);
  }
  function nextStep(){
    state.stepIndex++;
    if (!state.seq || state.stepIndex>=state.seq.length) return stopSequence();
    state.timeLeft = (state.seq[state.stepIndex].durMs||120);
    applyStep();
  }
  function stopSequence(){ state.seq=null; state.stepIndex=0; state.timeLeft=0; state.label=''; }

  function handleInputAttacks(){
    const taps = consumeTaps();
    if (taps.button1Tap){
      const s = getKickQuick(C);
      if (s) startSequence(s, 'KICK');
    } else if (taps.button2Tap){
      const s = getHeavySlam(C);
      if (s) startSequence(s, 'SLAM');
    }
  }

  function tick(dt){
    // movement (A/D) → vel.x/pos.x
    const p = P(); if (p){
      const M = C.movement || {};
      const I = G.input || {};
      p.vel ||= {x:0,y:0}; p.pos ||= {x:0,y:0};
      const ax = M.accelX || 1200; const max = M.maxSpeedX || 420; const fr = M.friction || 8;
      if (I.left && !I.right) p.vel.x -= ax*dt; else if (I.right && !I.left) p.vel.x += ax*dt; else p.vel.x *= Math.max(0, 1 - fr*dt);
      p.vel.x = Math.max(-max, Math.min(max, p.vel.x));
      p.pos.x += p.vel.x * dt;
      // face (mirror across vertical): set facingSign; keep facingRad at 0 (unused for flip)
      if (Math.abs(p.vel.x)>1){ p.facingSign = (p.vel.x>=0? 1 : -1); p.facingRad = 0; }
    }

    handleInputAttacks();

    // attack stepper
    if (state.seq){
      state.timeLeft -= (dt*1000);
      if (state.timeLeft <= 0){ nextStep(); }
    }
  }

  return { tick, startSequence };
}

function getKickQuick(C){
  const slot = C.attacks?.slots?.[3];
  const quick = slot?.quick?.base;
  return quick ? quick.map(x=>({ poseKey:x.poseKey || x.poseKeyName, durMs:x.durMs })) : null;
}
function getHeavySlam(C){
  const slot = C.attacks?.slots?.[4] || C.attacks?.[2];
  const seq = slot?.sequence;
  return seq ? seq.map(x=>({ poseKey:x.poseKey, durMs:x.durMs })) : null;
}

function buildPoseFromKey(C, key){
  if (!key) return {};
  const lib = C.attacks?.library || {};
  const baseDef = lib[key];
  if (baseDef){
    const baseName = baseDef.base;
    const basePose = (C.poses && C.poses[baseName]) ? clone(C.poses[baseName]) : {};
    return Object.assign(basePose, clone(baseDef.overrides||{}));
  } else {
    // direct pose name in CONFIG.poses
    const pose = (C.poses && C.poses[key]) ? clone(C.poses[key]) : {};
    return pose;
  }
}
function clone(o){ return JSON.parse(JSON.stringify(o||{})); }
