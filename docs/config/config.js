// khyunchained CONFIG with sprite anchor mapping (torso/start) & optional debug
window.CONFIG = {
  actor: { scale: 0.70 },
  groundRatio: 0.70,
  canvas: { w: 720, h: 460, scale: 1 },
  groundY: 380,

  colors: { body:'#e5f0ff', left:'#86efac', right:'#93c5fd', guide:'#233044', hitbox:'#0ea5e9' },

  // Debug options
  debug: { freezeAngles: false },

  // Global fallback durations (SLAM uses these) -- monolith v2
  durations: { toWindup:1600, toStrike:160, toRecoil:180, toStance:0 },

  parts: {
    hitbox:{ w:135, h:180, r:60, torsoAttach:{ nx:0.5, ny:0.7 } },
    torso:{ len:60 }, arm:{ upper:50, lower:50 }, leg:{ upper:40, lower:40 }, head:{ neck:14, radius:16 }
  },

  hierarchy: { legsFollowTorsoRotation: false },
  ik: { calvesOnly: true },

  // basePose from monolith v2
  basePose: { torso:0, lShoulder:-90, lElbow:0, rShoulder:-90, rElbow:0, lHip:90, lKnee:0, rHip:90, rKnee:0 },
  limits: {
    torso:{ absMin:-45, absMax:90 },
    shoulder:{ relMin:-360, relMax:-90 },
    elbow:{ relMin:-170, relMax:0 },
    hip:{ absMin:90, absMax:210 },
    knee:{ relMin:0, relMax:170 }
  },

  // Visual animation poses, all numeric values from monolith v2
  poses: {
    Stance:{
      torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:110, lKnee:40, rHip:30, rKnee:40,
      rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0, resetFlipsBefore: true,
      allowAiming: true, aimLegs: false
    },
    Windup:{
      torso:-35, lShoulder:-360, lElbow:0, rShoulder:-360, rElbow:0, lHip:40, lKnee:90, rHip:-90, rKnee:90,
      rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
      allowAiming: true, aimLegs: false,
      anim_events: [
        { time: 0.00, velocityX: -15, velocityY: 0 },
        { time: 0.65, impulse: 320, impulse_angle: -90 }
      ]
    },
    Strike:{
      torso:45, lShoulder:-45, lElbow:0, rShoulder:-45, rElbow:0, lHip:180, lKnee:0, rHip:90, rKnee:0,
      rootMoveVel:{x:0,y:0, flip: false }, impulseMag:0, impulseDirDeg:0,
      allowAiming: true, aimLegs: false,
      anim_events: [
        { time: 0.00, impulse: 450, impulse_angle: -45 },
        { time: 0.05, velocityX: 280, velocityY: 120, localVel: true }
      ]
    },
    Recoil:{
      torso:-15, lShoulder:-45, lElbow:0, rShoulder:-45, rElbow:0, lHip:0, lKnee:70, rHip:110, rKnee:0,
      rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
      allowAiming: false, aimLegs: false,
      anim_events: [
        { time: 0.00, velocityX: 80, velocityY: -40 },
        { time: 0.30, impulse: 120, impulse_angle: 160 }
      ]
    },
    Jump:{
      torso:-10, lShoulder:-160, lElbow:-30, rShoulder:-160, rElbow:-30,
      lHip:120, lKnee:60, rHip:120, rKnee:60,
      rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
      allowAiming: true, aimLegs: false
    },
    Walk:{
      torso:20, lShoulder:-100, lElbow:-100, rShoulder:-100, rElbow:-100,
      lHip:90, lKnee:20, rHip:90, rKnee:20,
      rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
      allowAiming: true, aimLegs: false
    }
  },

  fighters: {
    TLETINGAN: {
      actor: { scale: 0.70 },
      parts: { hitbox:{ w:80, h:110, r:60, torsoAttach:{ nx:0.4, ny:0.6 } }, torso:{ len:40 }, arm:{ upper:30, lower:40 }, leg:{ upper:30, lower:30 }, head:{ neck:10, radius:12 } },
      hierarchy: { legsFollowTorsoRotation: false },
      ik: { calvesOnly: true },
      basePose: { torso:0, lShoulder:-90, lElbow:0, rShoulder:-90, rElbow:0, lHip:90, lKnee:0, rHip:90, rKnee:0 },
      limits: { torso:{ absMin:-45, absMax:90 }, shoulder:{ relMin:-360, relMax:-90 }, elbow:{ relMin:-170, relMax:0 }, hip:{ absMin:90, absMax:210 }, knee:{ relMin:0, relMax:170 } },
      offsets: {
        torso: { origin:{ax:0, ay:0}, shoulder:{ax:-8, ay:-5}, hip:{ax:0, ay:0}, neck:{ax:0, ay:0} },
        arm: { upper:{ origin:{ax:0, ay:0}, elbow:{ax:0, ay:0} }, lower:{ origin:{ax:0, ay:0} } },
        leg: { upper:{ origin:{ax:0, ay:0}, knee:{ax:0, ay:0}  }, lower:{ origin:{ax:0, ay:0} } },
        head:{ origin:{ax:-1, ay:6} }
      },
      sprites: {
        torso: { url: "./assets/fightersprites/tletingan/torso.png" },
        head:  { url: "./assets/fightersprites/tletingan/head.png" },
        arm_L_upper: { url: "./assets/fightersprites/tletingan/arm-upper.png" },
        arm_L_lower: { url: "./assets/fightersprites/tletingan/arm-lower.png" },
        arm_R_upper: { url: "./assets/fightersprites/tletingan/arm-upper.png" },
        arm_R_lower: { url: "./assets/fightersprites/tletingan/arm-lower.png" },
        leg_L_upper: { url: "./assets/fightersprites/tletingan/leg-upper.png" },
        leg_L_lower: { url: "./assets/fightersprites/tletingan/leg-lower.png" },
        leg_R_upper: { url: "./assets/fightersprites/tletingan/leg-upper.png" },
        leg_R_lower: { url: "./assets/fightersprites/tletingan/leg-lower.png" }
      },
      spriteStyle: {
        widthFactor: { torso:1.0, armUpper:1.0, armLower:1.0, legUpper:1.0, legLower:1.0, head:1.0 },
        xformUnits: "percent",
        anchor: {
          torso: "mid",
          head: "mid",
          armUpper: "start",
          armLower: "mid",
          legUpper: "start",
          legLower: "mid"
        },
        debug: { torso:true, head:false, armUpper:false, armLower:false, legUpper:false, legLower:false },
        xform: {
          torso:    { ax:-0.5,  ay:-0.00, scaleX:4.50, scaleY:4.50, rotDeg:180 },
          head:     { ax:-1.40, ay:-0.20, scaleX:4.50, scaleY:4.50, rotDeg:180 },
          armUpper: { ax:0.00,  ay:0.00,  scaleX:3.00, scaleY:3.00, rotDeg:0 },
          armLower: { ax:0.00,  ay:0.00,  scaleX:2.00, scaleY:2.00, rotDeg:0 },
          legUpper: { ax:-0.10, ay:0.10,  scaleX:2.0,  scaleY:2.0,  rotDeg:0 },
          legLower: { ax:-0.2,  ay:0.02,  scaleX:2,    scaleY:2.00, rotDeg:-10 }
        }
      }
    },
    // Other fighters are untouched for brevity
  },

  movement: {
    authoredWeight:0.6, physicsWeight:0.4,
    gravity:2400, jumpImpulse:-650, accelX:1500, maxSpeedX:420, friction:8.0, restitution:0.0,
    dashSpeedMultiplier: 2.2,
    facingSmooth:10.0, attackPhases:['Windup','Strike'], lockFacingDuringAttack:true, rootVelRelative:true
  },

  aiming: {
    enabled: true,
    upperBodyOnly: true,
    smoothing: 8.0,
    maxTorsoAngle: 45,
    maxShoulderAngle: 60,
    flipThreshold: 0.0
  },

  walk: {
    enabled:true, onlyTorsoLegs:true, baseHz:1.3, speedScale:1.0, minSpeed:80, amp:1.0,
    poses:{
      A:{ torso:30, lHip:0, lKnee:45, rHip:180, rKnee:90 },
      B:{ torso:40, lHip:180, lKnee:90, rHip:0, rKnee:45 }
    }
  },
  ragdoll: {
    killAuthOnActive:true, enabled:true,
    autoCalvesMidAir:false, stiffness:10.0,
    limbs:{ lCalf:false, rCalf:false, lThigh:false, rThigh:false, lUpperArm:false, rUpperArm:false, lForearm:false, rForearm:false, torso:false, head:false }
  },

  colliders: {
    handMultiplier: 2.0,
    footMultiplier: 1.0
  },

  knockback: {
    maxFooting: 100,
    weaponTypes: {
      unarmed: { type: 'blunt', multiplier: 1.0 },
      blunt: { multiplier: 1.2 },
      sharp: { multiplier: 0.8 }
    },
    currentWeapon: 'unarmed'
  },

  // Extend/leave weapons, combos, attacks untouched, to preserve newer features
};

// Combo from monolith v2
window.CONFIG.combo = {
  sequence: ['KICK','PUNCH','KICK','PUNCH'],
  altSequence: ['PUNCH','KICK','PUNCH','KICK'],
  timerDuration: 3000
};

// Presets: Numeric values from monolith v2. Non-numeric, asset fields preserved.
window.CONFIG.presets = {
  SLAM: {
    poses: JSON.parse(JSON.stringify(window.CONFIG.poses)),
    durations: JSON.parse(JSON.stringify(window.CONFIG.durations)),
    knockbackBase: 250,
    cancelWindow: 0.5
  },
  KICK: {
    durations: { toWindup:180, toStrike:110, toRecoil:680, toStance:0 },
    knockbackBase: 180,
    cancelWindow: 0.6,
    poses: {
      Stance: Object.assign(JSON.parse(JSON.stringify(window.CONFIG.poses.Stance)), { resetFlipsBefore: true }),
      Windup: {
        torso:-10, lShoulder:-100, lElbow:-120, rShoulder:-80, rElbow:-100,
        lHip:110, lKnee:30, rHip:170, rKnee:40,
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming:true, aimLegs:true, aimRightLegOnly:true,
        anim_events:[{ time:0.00, velocityX:-80, velocityY:0 }]
      },
      Strike: {
        torso:90, lShoulder:-27, lElbow:0, rShoulder:90, rElbow:0,
        lHip:87, lKnee:0, rHip:0, rKnee:0,
        rootMoveVel:{x:0,y:0}, impulseMag:120, impulseDirDeg:0,
        allowAiming:true, aimLegs:true, aimRightLegOnly:true,
        flip:true, flipAt: 0.1,
        flipParts:['ARM_R_UPPER','ARM_R_LOWER','LEG_R_UPPER','LEG_R_LOWER'],
        fullFlipFacing:true, fullFlipAt:0.1,
        anim_events:[
          { time:0.00, impulse:180, impulse_angle:0 },
          { time:0.05, velocityX:0, velocityY:0, localVel:true }
        ]
      },
      Recoil: {
        torso:-6, lShoulder:-100, lElbow:-120, rShoulder:-90, rElbow:-120,
        lHip:110, lKnee:40, rHip:30, rKnee:50,
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming:false, aimLegs:false,
        flip:true, flipAt:0.9,
        flipParts:['ARM_R_UPPER','ARM_R_LOWER','LEG_R_UPPER','LEG_R_LOWER'],
        fullFlipFacing:true, fullFlipAt:0.9,
        anim_events:[{ time:0.00, velocityX:0, velocityY:0 }]
      }
    }
  },
  PUNCH: {
    durations: { toWindup1:180, toWindup2:180, toStrike1:110, toStrike2:110, toRecoil:200, toStance:120 },
    knockbackBase: 140,
    cancelWindow: 0.7,
    poses: {
      Stance: JSON.parse(JSON.stringify(window.CONFIG.poses.Stance)),
      Windup: JSON.parse(JSON.stringify(window.CONFIG.poses.Windup)),
      Strike: JSON.parse(JSON.stringify(window.CONFIG.poses.Strike)),
      Recoil: JSON.parse(JSON.stringify(window.CONFIG.poses.Recoil)),
      Strike1: Object.assign(JSON.parse(JSON.stringify(window.CONFIG.poses.Strike)), { durMs:110, phase:'strike', torso:45, rShoulder:-35, rootMoveVel:{x:30,y:0}, impulseMag:90, impulseDirDeg:0, anim_events:[{ time:0.00, velocityX:260, velocityY:0, localVel:true }] }),
      Strike2: Object.assign(JSON.parse(JSON.stringify(window.CONFIG.poses.Strike)), { durMs:130, phase:'strike', torso:50, rShoulder:-45, rootMoveVel:{x:40,y:0}, impulseMag:110, impulseDirDeg:0, anim_events:[{ time:0.00, velocityX:300, velocityY:0, localVel:true }] })
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
  }
  // Weapon preset extension is left unchanged
};
