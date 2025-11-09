// fighter.js — initialize fighters in STANCE; set facingSign (player right, npc left)
import { degToRad } from './math-utils.js?v=1';

function degPoseToRad(p){ if(!p) return {}; const o={}; for (const k of ['torso','head','lShoulder','lElbow','rShoulder','rElbow','lHip','lKnee','rHip','rKnee']){ if (p[k]!=null) o[k]=degToRad(p[k]); } return o; }

export function initFighters(cv, cx){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  const W = C.canvas || { w: 720, h: 460, scale: 1 };
  const gy = Math.round((C.groundRatio||0.7) * (C.canvas?.h || W.h || 460));
  const stance = C.poses?.Stance || { torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:110, lKnee:40, rHip:30, rKnee:40 };
  const stanceRad = degPoseToRad(stance);
  if (stanceRad.head == null) stanceRad.head = stanceRad.torso ?? 0;

  function makeF(id, x, faceSign){
    const fighter = {
      id,
      isPlayer: id==='player',
      pos:{ x, y: gy-1 },
      vel:{ x:0, y:0 },
      onGround:true,
      prevOnGround:true,
      landedImpulse:0,
      facingRad: 0,
      facingSign: faceSign,
      footing: 50,
      ragdoll:false,
      ragdollTime:0,
      ragdollVel:{ x:0, y:0 },
      recovering:false,
      recoveryTime:0,
      recoveryDuration:0.8,
      recoveryStartAngles:{},
      recoveryStartY: gy-1,
      recoveryTargetY: gy-1,
      stamina:{ current:100, max:100, drainRate:40, regenRate:25, minToDash:10, isDashing:false },
      jointAngles: { ...stanceRad },
      gaze: { world: stanceRad.head ?? stanceRad.torso ?? 0, restOffsetRad: 0, aimOffsetRad: 0, source: 'pose', anchorRatio: 0.6 },
      walk:{ phase:0, amp:0 },
      attack:{ active:false, preset:null, slot:null },
      combo:{ active:false, sequenceIndex:0, attackDelay:0 },
      input:{ left:false, right:false, jump:false, dash:false },
      physics:{ offsets:{} }
    };
    fighter.move = fighter; // touch-controls legacy alias
    return fighter;
  }

  G.FIGHTERS = {
    player: makeF('player', (C.canvas?.w||720)*0.5 - 60, 1),
    npc:    makeF('npc',    (C.canvas?.w||720)*0.5 + 60, -1)
  };
  console.log('[initFighters] Fighters initialized', G.FIGHTERS);
}
