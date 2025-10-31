// fighter.js — initialize fighters in STANCE, no forced Windup
const RAD = Math.PI/180;
function degPoseToRad(p){ if(!p) return {}; const o={}; for (const k of ['torso','lShoulder','lElbow','rShoulder','rElbow','lHip','lKnee','rHip','rKnee']){ if (p[k]!=null) o[k]=p[k]*RAD; } return o; }

export function initFighters(cv, cx){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  const W = C.canvas || { w: 720, h: 460, scale: 1 };
  const gy = Math.round((C.groundRatio||0.7) * (C.canvas?.h || W.h || 460));
  const stance = C.poses?.Stance || { torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:110, lKnee:40, rHip:30, rKnee:40 };
  const stanceRad = degPoseToRad(stance);

  function makeF(id, x){
    return {
      id, isPlayer: id==='player',
      pos:{ x, y: gy-1 }, vel:{ x:0, y:0 },
      onGround:true, prevOnGround:true, facingRad: (id==='player'? 0 : Math.PI),
      footing: 50, ragdoll:false, stamina:{ current:100, max:100, drainRate:40, regenRate:25, minToDash:10 },
      jointAngles: { ...stanceRad },
      walk:{ phase:0, amp:0 },
      attack:{ active:false, preset:null, slot:null },
      combo:{ active:false, sequenceIndex:0, attackDelay:0 }
    };
  }

  G.FIGHTERS = { player: makeF('player', (C.canvas?.w||720)*0.5 - 60), npc: makeF('npc', (C.canvas?.w||720)*0.5 + 60) };
  console.log('[initFighters] Fighters initialized', G.FIGHTERS);
}
