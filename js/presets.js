// Defines CONFIG.presets and combo defaults. Extracted from the monolith.
export function initPresets(){
  const C = window.CONFIG;
  C.presets = C.presets || {};

  C.presets.SLAM = {
    poses: JSON.parse(JSON.stringify(C.poses)),
    durations: JSON.parse(JSON.stringify(C.durations)),
    knockbackBase: 250,
    cancelWindow: 0.5
  };

  C.presets.KICK = {
    durations: { toWindup:180, toStrike:110, toRecoil:680, toStance:0 },
    knockbackBase: 180,
    cancelWindow: 0.6,
    poses: {
      Stance: Object.assign(JSON.parse(JSON.stringify(C.poses.Stance || {})), { resetFlipsBefore: true }),
      Windup: {
        torso:-10, lShoulder:-100, lElbow:-120, rShoulder:-80, rElbow:-100,
        lHip:110, lKnee:30, rHip:170, rKnee:40,
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming: true, aimLegs: true, aimRightLegOnly: true,
        anim_events: [{ time: 0.00, velocityX: -80, velocityY: 0 }]
      },
      Strike: {
        torso:90, lShoulder:-27, lElbow:0, rShoulder:90, rElbow:0,
        lHip:87, lKnee:0, rHip:0, rKnee:0,
        rootMoveVel:{x:0,y:0}, impulseMag:120, impulseDirDeg:0,
        allowAiming: true, aimLegs: true, aimRightLegOnly: true,
        flip: true, flipAt: 0.1,
        flipParts: ['ARM_R_UPPER','ARM_R_LOWER','LEG_R_UPPER','LEG_R_LOWER'],
        fullFlipFacing: true,
        fullFlipAt: 0.1,
        anim_events: [
          { time: 0.00, impulse: 180, impulse_angle: 0 },
          { time: 0.05, velocityX: 0, velocityY: 0, localVel:true }
        ]
      },
      Recoil: {
        torso:-6, lShoulder:-100, lElbow:-120, rShoulder:-90, rElbow:-120,
        lHip:110, lKnee:40, rHip:30, rKnee:50,
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming: false, aimLegs: false,
        flip: true, flipAt: 0.9,
        flipParts: ['ARM_R_UPPER','ARM_R_LOWER','LEG_R_UPPER','LEG_R_LOWER'],
        fullFlipFacing: true,
        fullFlipAt: 0.9,
        anim_events: [{ time: 0.00, velocityX: 0, velocityY: 0 }]
      }
    }
  };

  // Alternate KICK preset (KICK_ALT) built from base KICK durations
  (function defineKickAlt(){
    const base = C.presets.KICK;
    const w0 = base.durations?.toWindup ?? 180;
    const s0 = base.durations?.toStrike ?? 110;
    const d1 = { w: Math.round(w0/3), s: Math.round(s0/3) };
    const d2 = { w: Math.round(w0/2), s: Math.round(s0/2) };
    const d3 = { w: Math.round(w0),   s: Math.round(s0)   };
    const d4 = { w: Math.round(w0*2), s: Math.round(s0*2) };
    C.presets.KICK_ALT = {
      durations: JSON.parse(JSON.stringify(base.durations)),
      poses: JSON.parse(JSON.stringify(base.poses)),
      sequence: [
        { pose:'Windup', durMs: d1.w }, { pose:'Strike', durMs: d1.s },
        { pose:'Windup', durMs: d2.w }, { pose:'Strike', durMs: d2.s },
        { pose:'Windup', durMs: d3.w }, { pose:'Strike', durMs: d3.s },
        { pose:'Windup', durMs: d4.w }, { pose:'Strike', durMs: d4.s },
        { pose:'Recoil', durKey:'toRecoil' }, { pose:'Stance', durKey:'toStance' }
      ]
    };
  })();

  // Double-strike quick attack
  C.presets.PUNCH = {
    durations: { toWindup1:180, toWindup2:180, toStrike1:110, toStrike2:110, toRecoil:200, toStance:120 },
    knockbackBase: 140,
    cancelWindow: 0.7,
    poses: {
      Stance: JSON.parse(JSON.stringify(C.poses.Stance || {})),
      Windup: JSON.parse(JSON.stringify(C.poses.Windup || {})),
      Strike: JSON.parse(JSON.stringify(C.poses.Strike || {})),
      Recoil: JSON.parse(JSON.stringify(C.poses.Recoil || {})),
      Strike1: Object.assign(JSON.parse(JSON.stringify(C.poses.Strike || {})), { durMs:110, phase:'strike', torso:45, rShoulder:-35, rootMoveVel:{x:30,y:0}, impulseMag:90, impulseDirDeg:0, anim_events:[{ time:0.00, velocityX:260, velocityY:0, localVel:true }] }),
      Strike2: Object.assign(JSON.parse(JSON.stringify(C.poses.Strike || {})), { durMs:130, phase:'strike', torso:50, rShoulder:-45, rootMoveVel:{x:40,y:0}, impulseMag:110, impulseDirDeg:0, anim_events:[{ time:0.00, velocityX:300, velocityY:0, localVel:true }] })
    },
    sequence: [
      { pose:'Stance', durKey:'toStance' },
      { pose:'Windup', durKey:'toWindup1' },
      { pose:'Strike1', durKey:'toStrike1' },
      { pose:'Windup', durKey:'toWindup2' },
      { pose:'Strike2', durKey:'toStrike2' },
      { pose:'Recoil', durKey:'toRecoil' },
      { pose:'Stance', durKey:'toStance' }
    ]
  };

  // Combo defaults
  window.CONFIG.combo = window.CONFIG.combo || {
    sequence: ['KICK','PUNCH','KICK','PUNCH'],
    altSequence: ['PUNCH','KICK','PUNCH','KICK'],
    timerDuration: 3000
  };
}

export function ensureAltSequenceUsesKickAlt(){
  const C = window.CONFIG;
  if (!C || !C.presets || !C.presets.KICK_ALT) return;
  if (!C.combo || !Array.isArray(C.combo.altSequence)) return;
  for (let i=0; i<C.combo.altSequence.length; i++){
    if (C.combo.altSequence[i] === 'KICK'){ C.combo.altSequence[i] = 'KICK_ALT'; }
  }
}
