// animator.js — restore basic idle/walk posing; robust speed detection; override TTL required
import { degToRad } from './math-utils.js?v=1';

const ANG_KEYS = ['torso','lShoulder','lElbow','rShoulder','rElbow','lHip','lKnee','rHip','rKnee'];
// Convert pose object from degrees to radians using centralized utility
function degToRadPose(p){ const o={}; for(const k of ANG_KEYS){ if (p&&p[k]!=null) o[k]=degToRad(p[k]); } return o; }
function lerp(a,b,t){ return a + (b-a)*t; }
function damp(current, target, lambda, dt){ const t = 1 - Math.exp(-lambda*dt); return current + (target - current)*t; }

function ensureAnimState(F){ F.walk ||= { phase:0, amp:1, t:0 }; F.jointAngles ||= {}; if (!F.anim){ F.anim = { last: performance.now()/1000, override:null }; } }
function pickBase(C){ return (C.poses && C.poses.Stance) ? C.poses.Stance : { torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:110, lKnee:40, rHip:30, rKnee:40 }; }

function computeSpeed(F){ const dt=Math.max(1e-5,(F.anim?.dt||0)); const prevX = (F._prevX==null? F.pos?.x||0 : F._prevX); const curX = F.pos?.x||0; const v = (curX - prevX)/dt; F._prevX = curX; return Math.abs(Number.isFinite(F.vel?.x)? F.vel.x : v); }

function computeWalkPose(F, C){
  const W = C.walk || { enabled:true, baseHz:1.2, speedScale:1.0, minSpeed:60, amp:1.0, poses:{ A:{torso:30,lHip:0,lKnee:45,rHip:180,rKnee:90}, B:{torso:40,lHip:180,lKnee:90,rHip:0,rKnee:45} } };
  const speed = computeSpeed(F);
  const on = !!W.enabled && speed >= (W.minSpeed||60) && (F.onGround!==false);
  const baseHz = (W.baseHz||1.2) * (W.speedScale||1.0) * (speed>1? (0.5 + speed/ (C.movement?.maxSpeedX||300)) : 1);
  F.walk.phase = (F.walk.phase || 0);
  F.walk.phase += (F.anim?.dt || 0) * baseHz * Math.PI*2;
  const s = (Math.sin(F.walk.phase)+1)/2;
  const A = W.poses?.A || {}; const B = W.poses?.B || {};
  const pose = Object.assign({}, pickBase(C));
  pose.lHip = lerp(A.lHip||0, B.lHip||0, s); pose.lKnee= lerp(A.lKnee||0,B.lKnee||0,s);
  pose.rHip = lerp(A.rHip||0, B.rHip||0, s); pose.rKnee= lerp(A.rKnee||0,B.rKnee||0,s);
  pose.torso= lerp(A.torso||0,B.torso||0,s);
  const base = pickBase(C); pose.lShoulder=base.lShoulder; pose.lElbow=base.lElbow; pose.rShoulder=base.rShoulder; pose.rElbow=base.rElbow;
  pose._active = on; return pose; }

function getOverride(F){ return (F.anim && F.anim.override) ? F.anim.override : null; }
function clearOverride(F){ if(F.anim) F.anim.override=null; }

export function updatePoses(){
  const G = window.GAME || {}; const C = window.CONFIG || {}; const now = performance.now()/1000; if (!G.FIGHTERS) return;
  // Check if joint angles are frozen (for debugging/manual pose editing)
  if (C.debug?.freezeAngles) return;
  for (const id of ['player','npc']){ const F = G.FIGHTERS[id]; if(!F) continue; ensureAnimState(F); F.anim.dt = Math.max(0, now - F.anim.last); F.anim.last = now;
    let targetDeg = null; const over = getOverride(F);
    if (over){ if (over.until && now < over.until){ targetDeg = over.pose; } else { clearOverride(F); if (over.until==null) console.log('[anim] cleared timeless override'); } }
    if (!targetDeg){ const walkPose = computeWalkPose(F,C); if (walkPose._active) targetDeg = walkPose; }
    if (!targetDeg) targetDeg = pickBase(C);
    const target = degToRadPose(targetDeg); const lambda = 10;
    for(const k of ANG_KEYS){ const cur = F.jointAngles[k] ?? 0; const tar = target[k] ?? cur; F.jointAngles[k] = damp(cur, tar, lambda, F.anim.dt); }
  }
}

export function pushPoseOverride(fighterId, poseDeg, durMs=300){ const G = window.GAME || {}; const F = G.FIGHTERS?.[fighterId]; if(!F) return; ensureAnimState(F); F.anim.override = { pose: poseDeg, until: performance.now()/1000 + (durMs/1000) }; }
