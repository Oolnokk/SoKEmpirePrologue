// khyunchained CONFIG with sprite anchor mapping (torso/start) & optional debug

const abilityKnockback = (base, { clamp } = {}) => {
  return (context, opponent) => {
    if (!opponent?.pos) return;
    const facing = context?.character?.facingRad ?? context?.character?.facing ?? 0;
    const dir = Math.cos(facing) >= 0 ? 1 : -1;
    const multiplier = context?.multipliers?.knockback ?? 1;
    let delta = base * multiplier * dir;
    if (Number.isFinite(clamp)) {
      delta = Math.max(-clamp, Math.min(clamp, delta));
    }
    opponent.pos.x += delta;
  };
};

const deepClone = (value) => JSON.parse(JSON.stringify(value || {}));

const BASE_POSES = {
  Stance: {
    torso: 10,
    lShoulder: -100,
    lElbow: -110,
    rShoulder: -40,
    rElbow: -110,
    lHip: 110,
    lKnee: 40,
    rHip: 30,
    rKnee: 40,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    resetFlipsBefore: true,
    allowAiming: true,
    aimLegs: false
  },
  Windup: {
    torso: -35,
    lShoulder: -360,
    lElbow: 0,
    rShoulder: -360,
    rElbow: 0,
    lHip: 130,
    lKnee: 90,
    rHip: 100,
    rKnee: 90,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false,
    anim_events: [
      { time: 0.00, velocityX: -15, velocityY: 0 },
      { time: 0.65, impulse: 320, impulse_angle: -90 }
    ]
  },
  Strike: {
    torso: 45,
    lShoulder: -45,
    lElbow: 0,
    rShoulder: -45,
    rElbow: 0,
    lHip: 180,
    lKnee: 0,
    rHip: 110,
    rKnee: 20,
    rootMoveVel: { x: 0, y: 0, flip: false },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false,
    anim_events: [
      { time: 0.00, impulse: 450, impulse_angle: -45 },
      { time: 0.05, velocityX: 280, velocityY: 120, localVel: true }
    ]
  },
  Recoil: {
    durMs: 200,
    phase: 'recoil',
    torso: -15,
    lShoulder: -45,
    lElbow: 0,
    rShoulder: -45,
    rElbow: 0,
    lHip: 110,
    lKnee: 70,
    rHip: 100,
    rKnee: 40,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: false,
    aimLegs: false,
    anim_events: [
      { time: 0.00, velocityX: 80, velocityY: -40 },
      { time: 0.30, impulse: 120, impulse_angle: 160 }
    ]
  },
  Jump: {
    torso: -10,
    lShoulder: -160,
    lElbow: -30,
    rShoulder: -160,
    rElbow: -30,
    lHip: 120,
    lKnee: 60,
    rHip: 120,
    rKnee: 60,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false
  },
  Walk: {
    torso: 20,
    lShoulder: -100,
    lElbow: -100,
    rShoulder: -100,
    rElbow: -100,
    lHip: 90,
    lKnee: 20,
    rHip: 90,
    rKnee: 20,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false
  }
};

// Pose angle summary used by tooling/tests to verify baseline corrections.
const POSE_ANGLE_SUMMARY = {
  Windup: { lHip:130, rHip:100 },
  Strike: { lHip:180, rHip:110 },
  Recoil: { lHip:110, rHip:100 }
};

const FIGHTER_TLETINGAN = 'TLETINGAN';
const FIGHTER_MAOAO_M = 'Mao-ao_M';

const COSMETIC_PROFILE_SOURCES = {
  [FIGHTER_TLETINGAN]: './config/fighter-offsets/TLETINGAN.json',
  [FIGHTER_MAOAO_M]: './config/fighter-offsets/Mao-ao_M.json'
};

const COSMETIC_LIBRARY_SOURCES = {
  basic_headband: './config/cosmetics/basic_headband.json',
  layered_travel_cloak: './config/cosmetics/layered_travel_cloak.json',
  simple_poncho: './config/cosmetics/simple_poncho.json',
  basic_pants: './config/cosmetics/basic_pants.json'
};

const KICK_MOVE_POSES = {
  Stance: {
    torso: 10,
    lShoulder: -120,
    lElbow: -120,
    rShoulder: -65,
    rElbow: -140,
    lHip: 110,
    lKnee: 30,
    rHip: 170,
    rKnee: 40,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    resetFlipsBefore: true,
    allowAiming: true,
    aimLegs: false
  },
  Windup: {
    torso: -10,
    lShoulder: -100,
    lElbow: -120,
    rShoulder: -80,
    rElbow: -100,
    lHip:130,
    lKnee:90,
    rHip:100,
    rKnee:90,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: true,
    aimRightLegOnly: true,
    anim_events: [
      
    ]
  },
  Strike: {
    torso: 90,
    lShoulder: -27,
    lElbow: 0,
    rShoulder: 90,
    rElbow: 0,
    lHip:180,
    lKnee:0,
    rHip:110,
    rKnee:20,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: false,
    aimLegs: true,
    aimRightLegOnly: true,
    flip: true,
    flipAt: 0.1,
    flipParts: ['ARM_R_UPPER', 'ARM_R_LOWER', 'LEG_R_UPPER', 'LEG_R_LOWER'],
    fullFlipFacing: true,
    fullFlipAt: 0.1,
    anim_events: [
    ]
  },
  Recoil: // Kick recoil pose definition
  {
    torso: 50,
    lShoulder: -27,
    lElbow: 0,
    rShoulder: 90,
    rElbow: 0,
    lHip:180,
    lKnee:0,
    rHip:110,
    rKnee:20,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: false,
    aimLegs: true,
    flip: true,
    flipAt: 0.9,
    flipParts: ['ARM_R_UPPER', 'ARM_R_LOWER', 'LEG_R_UPPER', 'LEG_R_LOWER'],
    fullFlipFacing: true,
    fullFlipAt: 0.9,
    anim_events: [
    ]
  }
};

const PUNCH_MOVE_POSES = {
  Stance: {
        torso: 10,
        lShoulder: -100,
        lElbow: -110,
        rShoulder: -40,
        rElbow: -110,
        lHip: 110,
        lKnee: 40,
        rHip: 30,
        rKnee: 40,
        rootMoveVel: { x: 0, y: 0 },
        impulseMag: 0,
        impulseDirDeg: 0,
        resetFlipsBefore: true,
        allowAiming: true,
        aimLegs: false
    },
  Windup: {
		torso: 10,
        lShoulder: 0,
        lElbow: 120,
        rShoulder: 0,
        rElbow: 120,
        lHip: 110,
        lKnee: 40,
        rHip: 30,
        rKnee: 40,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false,
    anim_events: [
    ]
  },
  Strike: {
		torso: 10,
        lShoulder: -230,
        lElbow: 0,
        rShoulder: -230,
        rElbow: 0,
        lHip: 110,
        lKnee: 40,
        rHip: 30,
        rKnee: 40,
    rootMoveVel: { x: 0, y: 0, flip: false },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false,
    anim_events: [
    ]
  },
  Recoil: {
		torso: 60,
        lShoulder: -100,
        lElbow: 0,
        rShoulder: -180,
        rElbow: 0,
        lHip: 110,
        lKnee: 40,
        rHip: 30,
        rKnee: 40,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: false,
    aimLegs: false,
    anim_events: [
    ]
  }
};

const SLAM_MOVE_POSES = {
  Stance: deepClone(PUNCH_MOVE_POSES.Stance),
  Windup: {
    torso: -35,
    lShoulder: -360,
    lElbow: 0,
    rShoulder: -360,
    rElbow: 0,
    lHip: 40,
    lKnee: 90,
    rHip: -90,
    rKnee: 90,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false,
    anim_events: [
    ]
  },
  Slam: deepClone(PUNCH_MOVE_POSES.Strike),
  Recoil: deepClone(PUNCH_MOVE_POSES.Recoil)
};

window.CONFIG = {
  actor: { scale: 0.70 },
  groundRatio: 0.70,
  canvas: { w: 720, h: 460, scale: 1 },
  groundY: 380,
  // Debug options are surfaced in the debug panel; freezeAngles lets animators hold joints for edits
  debug: {
    freezeAngles: false
  },
  basePose: {
    torso: 0,
    lShoulder: -90,
    lElbow: 0,
    rShoulder: -90,
    rElbow: 0,
    lHip: 90,
    lKnee: 0,
    rHip: 90,
    rKnee: 0
  },

  limits: {
    head: { relMin: -75, relMax: 75 }
  },

  headTracking: {
    offsetDeg: 0
  },

  poses: {
    Stance: deepClone(BASE_POSES.Stance),
    Windup: deepClone(BASE_POSES.Windup),
    Strike: deepClone(BASE_POSES.Strike),
    Recoil: deepClone(BASE_POSES.Recoil),
    Jump: deepClone(BASE_POSES.Jump),
    Walk: deepClone(BASE_POSES.Walk)
  },

  cosmetics: {
    profileSources: COSMETIC_PROFILE_SOURCES,
    librarySources: COSMETIC_LIBRARY_SOURCES
  },

  fighters: {
    TLETINGAN: {
        actor: { scale: 0.9 },
        parts: {
          hitbox: { w:80, h:110, r:60, torsoAttach: { nx:0.4, ny:0.6 } },
          torso: { len:40 },
          arm: { upper:30, lower:40 },
          leg: { upper:30, lower:30 },
          head: { neck:10, radius:12 }
        },
        hierarchy: { legsFollowTorsoRotation: false },
        ik: { calvesOnly: true },
        limits: {
          torso: { absMin:-45, absMax:90 },
          shoulder: { relMin:-360, relMax:-90 },
          elbow: { relMin:-170, relMax:0 },
          hip: { absMin:90, absMax:210 },
          knee: { relMin:0, relMax:170 },
          head: { relMin:75, relMax:100 }
        },
        headTracking: {
          offsetDeg: -90
        },
      offsets: {
        torso: { origin:{ax:0, ay:0}, shoulder:{ax:-8, ay:-5}, hip:{ax:0, ay:0}, neck:{ax:0, ay:0} },
        arm: { upper:{ origin:{ax:0, ay:0}, elbow:{ax:0, ay:0} }, lower:{ origin:{ax:0, ay:0} } },
        leg: { upper:{ origin:{ax:0, ay:0}, knee:{ax:0, ay:0}  }, lower:{ origin:{ax:0, ay:0} } },
        head:{ origin:{ax:-1, ay:6} }
      },
        sprites: {
          torso: { url: "https://i.imgur.com/YatjSyo.png" },
          head:  { url: "https://i.imgur.com/WsKQ2Eo.png" },
          arm_L_upper: { url: "https://i.imgur.com/CAmWLbf.png" },
          arm_L_lower: { url: "https://i.imgur.com/gOHujif.png" },
          arm_R_upper: { url: "https://i.imgur.com/CAmWLbf.png" },
          arm_R_lower: { url: "https://i.imgur.com/gOHujif.png" },
          leg_L_upper: { url: "https://i.imgur.com/qgcQTmx.png" },
          leg_L_lower: { url: "https://i.imgur.com/lZbF7j2.png" },
          leg_R_upper: { url: "https://i.imgur.com/qgcQTmx.png" },
          leg_R_lower: { url: "https://i.imgur.com/lZbF7j2.png" }
        },
      spriteStyle: {
          widthFactor: { torso:1.0, armUpper:1.0, armLower:1.0, legUpper:1.0, legLower:1.0, head:1.0 },
          xformUnits: "percent",
          xform: {
            torso:    { ax:-0.5,  ay:-0.2, scaleX:3.5, scaleY:4.50, rotDeg:180 },
            head:     { ax:-1.20, ay:-0.20, scaleX:4.2, scaleY:4.2, rotDeg:180 },
            armUpper: { ax:0.00,  ay:0.00,  scaleX:3.00, scaleY:3.00, rotDeg:0 },
            armLower: { ax:0.00,  ay:0.00,  scaleX:2.00, scaleY:2.00, rotDeg:0 },
            legUpper: { ax:-0.10, ay:0.10,  scaleX:2.0,  scaleY:2.0,  rotDeg:0 },
            legLower: { ax:-0.2,  ay:0.02,  scaleX:2,    scaleY:2.00, rotDeg:-10 }
          }
      },
      cosmetics: {}
    },
    'Mao-ao_M': {
      actor: { scale: 1 },
      parts: { hitbox:{ w:80, h:110, r:60, torsoAttach:{ nx:0.4, ny:0.6 } }, torso:{ len:55 }, arm:{ upper:35, lower:50 }, leg:{ upper:40, lower:40 }, head:{ neck:10, radius:12 } },
      hierarchy: { legsFollowTorsoRotation: false },
      ik: { calvesOnly: true },
      limits: { torso:{ absMin:-45, absMax:90 }, shoulder:{ relMin:-360, relMax:-90 }, elbow:{ relMin:-170, relMax:0 }, hip:{ absMin:90, absMax:210 }, knee:{ relMin:0, relMax:170 }, head:{ relMin:75, relMax:100 } },
      headTracking: {
        offsetDeg: -90
      },
      offsets: {
        torso: { origin:{ax:0, ay:0}, shoulder:{ax:-8, ay:-5}, hip:{ax:0, ay:0}, neck:{ax:0, ay:0} },
        arm: { upper:{ origin:{ax:0, ay:0}, elbow:{ax:0, ay:0} }, lower:{ origin:{ax:0, ay:0} } },
        leg: { upper:{ origin:{ax:0, ay:0}, knee:{ax:0, ay:0}  }, lower:{ origin:{ax:0, ay:0} } },
        head:{ origin:{ax:0, ay:0} }
      },
      sprites: {
        torso: { url: "./assets/fightersprites/mao-ao-m/torso.png" },
        head:  { url: "./assets/fightersprites/mao-ao-m/head.png" },
        arm_L_upper: { url: "./assets/fightersprites/mao-ao-m/arm-upper.png" },
        arm_L_lower: { url: "./assets/fightersprites/mao-ao-m/arm-lower.png" },
        arm_R_upper: { url: "./assets/fightersprites/mao-ao-m/arm-upper.png" },
        arm_R_lower: { url: "./assets/fightersprites/mao-ao-m/arm-lower.png" },
        leg_L_upper: { url: "./assets/fightersprites/mao-ao-m/leg-upper.png" },
        leg_L_lower: { url: "./assets/fightersprites/mao-ao-m/leg-lower.png" },
        leg_R_upper: { url: "./assets/fightersprites/mao-ao-m/leg-upper.png" },
        leg_R_lower: { url: "./assets/fightersprites/mao-ao-m/leg-lower.png" }
      },
      spriteStyle: {
          widthFactor: { torso:1.0, armUpper:1.0, armLower:1.0, legUpper:1.0, legLower:1.0, head:1.0 },
          xformUnits: "percent",
          xform: {
            torso:    { ax:0,  ay:-0.2, scaleX:1.4, scaleY:1.6, rotDeg:180 },
            head:     { ax:-0.1, ay:-0.0, scaleX:1, scaleY:1.2, rotDeg:180 },
            armUpper: { ax:-0.2,  ay:0.1,  scaleX:1.6, scaleY:2.8, rotDeg:-10 },
            armLower: { ax:0.35,  ay:0,  scaleX:1.7, scaleY:2.1, rotDeg:-3 },
            legUpper: { ax:-0.10, ay:0,  scaleX:1.7, scaleY:2.75,  rotDeg:-15 },
            legLower: { ax:-0.0,  ay:0.2,  scaleX:1.7, scaleY:2.1, rotDeg:-4 }
          }
      },
      cosmetics: {}
    }
  },

  movement: {
    authoredWeight:0.6, physicsWeight:0.4,
    gravity:2400, jumpImpulse:-650, accelX:1500, maxSpeedX:420, friction:8.0, restitution:0.0,
    dashSpeedMultiplier: 2.2,
    facingSmooth:10.0, attackPhases:['Windup','Strike'], lockFacingDuringAttack:true, rootVelRelative:true
  },
  
  // Mouse aiming configuration
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
      A:{ torso:30, lHip:0,   lKnee:45, rHip:180, rKnee:90 }, 
      B:{ torso:40, lHip:180, lKnee:90, rHip:0,   rKnee:45 } 
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

  moves: {
    KICK: {
      name: 'Quick Kick',
      tags: ['light', 'quick'],
      durations: { toWindup: 280, toStrike: 110, toRecoil: 680, toStance: 200 },
      knockbackBase: 180,
      cancelWindow: 0.6,
      poses: deepClone(KICK_MOVE_POSES)
    },
	PUNCH: {
      name: 'Punch',
      tags: ['light', 'quick'],
      durations: { toWindup: 180, toStrike: 110, toRecoil: 100, toStance: 120 },
      knockbackBase: 140,
      cancelWindow: 0.7,
      poses: deepClone(PUNCH_MOVE_POSES)
    },
    ComboKICK1: {
      name: 'Combo Kick 1',
      tags: ['light', 'combo'],
      inherits: 'KICK',
      durations: { toWindup: 180, toStrike: 110, toRecoil: 680, toStance: 0 },
      knockbackBase: 180,
      cancelWindow: 0.6,
      poses: deepClone(KICK_MOVE_POSES)
    },
    ComboKICK2: {
      name: 'Combo Kick 2',
      tags: ['light', 'combo'],
      inherits: 'KICK',
      durations: { toWindup: 180, toStrike: 110, toRecoil: 680, toStance: 0 },
      knockbackBase: 180,
      cancelWindow: 0.6,
      poses: deepClone(KICK_MOVE_POSES)
    },
    ComboPUNCH1: {
      name: 'Combo Punch 1',
      tags: ['light', 'combo'],
      durations: { toWindup: 180, toStrike: 110, toRecoil: 200, toStance: 120 },
      knockbackBase: 140,
      cancelWindow: 0.7,
      poses: deepClone(PUNCH_MOVE_POSES)
    },
    ComboPUNCH2: {
      name: 'Combo Punch 2',
      tags: ['light', 'combo'],
      durations: { toWindup: 180, toStrike: 110, toRecoil: 200, toStance: 120 },
      knockbackBase: 140,
      cancelWindow: 0.7,
      poses: deepClone(PUNCH_MOVE_POSES)
    },
    SLAM: {
      name: 'Charged Slam',
      tags: ['heavy'],
      durations: { toWindup: 480, toStrike: 160, toRecoil: 200, toStance: 120 },
      knockbackBase: 250,
      cancelWindow: 0.5,
      poses: deepClone(SLAM_MOVE_POSES),
      sequence: [
        { poseKey: 'Windup', durMs: 480 },
        { poseKey: 'Slam', durMs: 160, strike: {} },
        { poseKey: 'Recoil', durMs: 200 }
      ]
    }
  },

  // === NEW: weapon definitions (bones + selective colliders) ===
  // Used by drawSkeleton() and getActiveColliders()/drawAttackColliders()
  weapons: {
    // fallback
    unarmed: { bones: 0, boneOffsets: [], colliders: {} },

    // Dual short blades
    'dagger-swords': {
      bones: 2,
      boneOffsets: [
        { attach: 'rWrist', length: 40, x: 10, y: 0 }, // right blade length; used for weaponBone0
        { attach: 'lWrist', length: 40, x: 10, y: 0 }  // left blade length; used for weaponBone1
      ],
      colliders: {
        rightA: { shape:'rect', width:20, height:60, offset:{x:20,y:0},  activatesOn:['SLASH','STRIKE'] },
        rightB: { shape:'rect', width:16, height:44, offset:{x:10,y:-8}, activatesOn:['STAB'] },
        leftA:  { shape:'rect', width:20, height:60, offset:{x:20,y:0},  activatesOn:['SLASH','STRIKE'] },
        leftB:  { shape:'rect', width:16, height:44, offset:{x:10,y: 8}, activatesOn:['STAB'] }
      }
    },

    // Polearm (two-handed baseline)
    sarrarru: {
      bones: 2,
      boneOffsets: [
        { attach: 'rWrist', length: 90, x: 15, y: 0 }, // spear forward
        { attach: 'lWrist', length: 40, x: -8, y: 0 }  // rear hand butt
      ],
      colliders: {
        rightA: { shape:'rect', width:18, height:120, offset:{x:50,y:0}, activatesOn:['THRUST'] },
        rightB: { shape:'rect', width:26, height:140, offset:{x:35,y:0}, activatesOn:['SWEEP'] },
        leftA:  { shape:'rect', width:16, height:40,  offset:{x:-10,y:0}, activatesOn:['SWEEP'] }
      }
    },

    // Large sword, quick handling
    'light-greatblade': {
      bones: 2,
      boneOffsets: [
        { attach: 'rWrist', length: 80, x: 12, y: 0 },
        { attach: 'lWrist', length: 20, x:  6, y: 0 }
      ],
      colliders: {
        rightA: { shape:'rect',   width:22, height:110, offset:{x:45,y:0}, activatesOn:['SLASH','CHOP'] },
        rightB: { shape:'circle', radius:16,             offset:{x:60,y:0}, activatesOn:['STAB'] }
      }
    },

    // Big club
    greatclub: {
      bones: 2,
      boneOffsets: [
        { attach: 'rWrist', length: 70, x: 12, y: 0 },
        { attach: 'lWrist', length: 20, x:  6, y: 0 }
      ],
      colliders: {
        rightA: { shape:'rect', width:28, height:90,  offset:{x:40,y:0}, activatesOn:['SMASH'] },
        rightB: { shape:'rect', width:28, height:110, offset:{x:30,y:0}, activatesOn:['SWING'] }
      }
    },

    // Dual hatchets
    hatchets: {
      bones: 2,
      boneOffsets: [
        { attach: 'rWrist', length: 45, x: 10, y: 0 },
        { attach: 'lWrist', length: 45, x: 10, y: 0 }
      ],
      colliders: {
        rightA: { shape:'rect',   width:18, height:50, offset:{x:20,y:0},  activatesOn:['HACK'] },
        rightB: { shape:'circle', radius:18,           offset:{x:25,y:-5}, activatesOn:['TOSS'] },
        leftA:  { shape:'rect',   width:18, height:50, offset:{x:20,y:0},  activatesOn:['HACK'] },
        leftB:  { shape:'circle', radius:18,           offset:{x:25,y: 5}, activatesOn:['TOSS'] }
      }
    }
  },

  // === NEW: per-weapon combo tables (used by playComboAttack)

  // === NEW: Character system ===
  // Each character has fighter, weapon, slotted attacks, and appearance options
  characters: {
    player: {
      fighter: 'Mao-ao_M',
      weapon: 'unarmed',
      slottedAbilities: ['combo_light', 'heavy_hold', 'quick_light', 'heavy_hold'],
      clothes: 'default',
      hairstyle: 'short',
      beard: 'none',
      adornments: [],
      cosmetics: {
        slots: {
          hat: { id: 'basic_headband', hsv: { h: -20, s: 0.2, v: 0 } },
          legs: { id: 'basic_pants', hsv: { h: 40, s: 80, v: 2 } }
        }
      }
    },
    enemy1: {
      fighter: 'Mao-ao_M',
      weapon: 'unarmed',
      slottedAbilities: ['combo_light', 'heavy_hold', 'quick_punch', 'heavy_hold'],
      clothes: 'robe',
      hairstyle: 'long',
      beard: 'goatee',
      adornments: ['earring'],
      cosmetics: {
        slots: {
          hat: { id: 'basic_headband', hsv: { h: 12, s: 0.1, v: 0.05 } },
          overwear: { id: 'layered_travel_cloak', hsv: { h: -10, s: -0.15, v: 100 } },
          legs: { id: 'basic_pants', hsv: { h: -120, s: 100, v: 5 } }
        }
      }
    }
  },
  // Add more characters or pools for randomization as needed

  weaponCombos: {
    unarmed: {
      weapon: 'unarmed',
      name: 'Unarmed Combo',
      sequence: ['ComboKICK1', 'ComboPUNCH1', 'ComboKICK2', 'ComboPUNCH2'],
      comboWindowMs: 3000,
      multipliers: { durations: 1 },
      onHit: abilityKnockback(8),
      type: 'blunt'
    },
    'dagger-swords': {
      weapon: 'dagger-swords',
      name: 'Dual Blade Flow',
      sequence: ['SLASH', 'STAB', 'SLASH', 'STAB'],
      comboWindowMs: 2500,
      type: 'sharp'
    },
    sarrarru: {
      weapon: 'sarrarru',
      name: 'Spear Rhythm',
      sequence: ['THRUST', 'SWEEP', 'THRUST', 'SWEEP'],
      comboWindowMs: 3500,
      type: 'sharp'
    },
    'light-greatblade': {
      weapon: 'light-greatblade',
      name: 'Greatblade Cascade',
      sequence: ['CHOP', 'SLASH', 'CHOP', 'SLASH'],
      comboWindowMs: 4000,
      type: 'sharp'
    },
    greatclub: {
      weapon: 'greatclub',
      name: 'Greatclub Crush',
      sequence: ['SMASH', 'SWING', 'SMASH', 'SWING'],
      comboWindowMs: 3000,
      type: 'blunt'
    },
    hatchets: {
      weapon: 'hatchets',
      name: 'Hatchet Fury',
      sequence: ['HACK', 'HACK', 'HACK', 'TOSS'],
      comboWindowMs: 2800,
      type: 'sharp'
    }
  },

  abilitySystem: {
    thresholds: { tapMaxMs: 200, chargeStageMs: 200 },
    defaults: { comboWindowMs: 3000 },
    attacks: {
      ComboKICK1: { preset: 'ComboKICK1', tags: ['combo', 'light'] },
      ComboKICK2: { preset: 'ComboKICK2', tags: ['combo', 'light'] },
      ComboPUNCH1: { preset: 'ComboPUNCH1', tags: ['combo', 'light'] },
      ComboPUNCH2: { preset: 'ComboPUNCH2', tags: ['combo', 'light'] },
      QuickKick: { preset: 'KICK', tags: ['quick', 'light'] },
      QuickKickCombo: {
        preset: 'KICK',
        tags: ['quick', 'light', 'comboVariant'],
        multipliers: { durations: 0.85, knockback: 1.35 }
      },
	  QuickPunch: { preset: 'PUNCH', tags: ['quick', 'light'] },
      QuickPunchCombo: {
        preset: 'PUNCH',
        tags: ['quick', 'light', 'comboVariant'],
        multipliers: { durations: 0.85, knockback: 1.35 }
      },
      Slam: {
        preset: 'SLAM',
        tags: ['heavy'],
        multipliers: { durations: 1.1, knockback: 1.2 }
      }
    },
    abilities: {
      combo_light: {
        name: 'Weapon Combo',
        type: 'light',
        trigger: 'combo',
        tags: ['combo', 'light'],
        comboFromWeapon: true,
        fallbackWeapon: 'unarmed',
        multipliers: { durations: 1 },
        onHit: abilityKnockback(8)
      },
      quick_light: {
        name: 'Quick Kick',
        type: 'light',
        trigger: 'single',
        tags: ['quick', 'light'],
        variants: [
          { id: 'postCombo', attack: 'QuickKickCombo', require: { comboHitsGte: 4, comboActive: true } },
          { id: 'default', attack: 'QuickKick' }
        ],
        multipliers: { durations: 1 },
        onHit: abilityKnockback(10)
      },
	  quick_punch: {
        name: 'Quick Punch',
        type: 'light',
        trigger: 'single',
        tags: ['quick', 'light'],
        variants: [
          { id: 'postCombo', attack: 'QuickPunchCombo', require: { comboHitsGte: 4, comboActive: true } },
          { id: 'default', attack: 'QuickPunch' }
        ],
        multipliers: { durations: 1 },
        onHit: abilityKnockback(10)
      },
      heavy_hold: {
        name: 'Charged Slam',
        type: 'heavy',
        trigger: 'hold-release',
        tags: ['heavy', 'hold'],
        attack: 'Slam',
        charge: {
          minStage: 1,
          maxStage: 5,
          stageDurationMs: 200,
          stageMultipliers: (stage) => ({
            durations: 1 + stage * 0.05,
            knockback: 1 + stage * 0.25
          })
        },
        onHit: abilityKnockback(14)
      }
    },
    slots: {
      A: { label: 'Primary Attack', light: 'combo_light', heavy: 'heavy_hold' },
      B: { label: 'Secondary Attack', light: 'quick_light', heavy: 'heavy_hold' }
    }
  }
};

const toPascalCase = (value = '') => {
  return value
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([0-9]+)/g, ' $1 ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('');
};

const posePhaseInfo = (poseName) => {
  const normalized = toPascalCase(poseName);
  if (!normalized) return null;
  if (normalized === 'Slam') {
    return { suffix: 'Strike', phase: 'strike', poseSuffix: 'Slam' };
  }
  const phaseMap = {
    Stance: 'stance',
    Windup: 'windup',
    Strike: 'strike',
    Recoil: 'recoil'
  };
  const phase = phaseMap[normalized];
  if (!phase) return null;
  return { suffix: normalized, phase, poseSuffix: normalized };
};

const determineDefaultLimb = (moveId = '') => {
  if (/KICK/i.test(moveId)) return 'rightLeg';
  if (/PUNCH/i.test(moveId)) return 'rightArm';
  if (/SLAM/i.test(moveId)) return 'bothArms';
  return null;
};

const buildPoseLibraryV2 = (moves = {}) => {
  const library = {};
  Object.entries(moves).forEach(([moveId, moveDef]) => {
    const moveName = toPascalCase(moveId);
    Object.entries(moveDef.poses || {}).forEach(([poseName, poseValue]) => {
      const info = posePhaseInfo(poseName) || { poseSuffix: toPascalCase(poseName) };
      const poseKey = `${moveName}${info.poseSuffix || ''}`;
      if (!poseKey) return;
      if (!library[poseKey]) {
        library[poseKey] = deepClone(poseValue);
      }
    });
  });
  return library;
};

const PHASE_TO_DURATION_KEY = {
  stance: 'toStance',
  windup: 'toWindup',
  strike: 'toStrike',
  recoil: 'toRecoil'
};

const buildStageLibraryV2 = (moves = {}, poseLibrary = {}) => {
  const stages = {};
  Object.entries(moves).forEach(([moveId, moveDef]) => {
    const moveName = toPascalCase(moveId);
    const durations = moveDef.durations || {};
    Object.keys(moveDef.poses || {}).forEach((poseName) => {
      const info = posePhaseInfo(poseName);
      if (!info) return;
      const poseKey = `${moveName}${info.poseSuffix}`;
      if (!poseLibrary[poseKey]) return;
      const stageId = `${moveName}${info.suffix}`;
      if (!stages[stageId]) {
        stages[stageId] = {
          id: stageId,
          pose: poseKey,
          move: moveName,
          phase: info.phase,
          defaultDuration: durations[PHASE_TO_DURATION_KEY[info.phase]] ?? null
        };
      }
    });
  });
  return stages;
};

const PHASE_ORDER = ['stance', 'windup', 'strike', 'recoil'];

const buildMoveHierarchyV2 = (moves = {}, stageLibrary = {}, poseLibrary = {}) => {
  const hierarchy = {};
  Object.entries(moves).forEach(([moveId, moveDef]) => {
    const moveName = toPascalCase(moveId);
    const durations = moveDef.durations || {};
    const stageRefs = [];
    const extras = [];
    Object.entries(moveDef.poses || {}).forEach(([poseName]) => {
      const info = posePhaseInfo(poseName);
      const poseSuffix = toPascalCase(poseName);
      const poseKey = `${moveName}${poseSuffix}`;
      if (info) {
        const stageId = `${moveName}${info.suffix}`;
        if (stageLibrary[stageId]) {
          const durationKey = PHASE_TO_DURATION_KEY[info.phase];
          const ref = { stage: stageId, phase: info.phase };
          if (durationKey && Object.prototype.hasOwnProperty.call(durations, durationKey)) {
            ref.duration = durations[durationKey];
          }
          stageRefs.push(ref);
        }
      } else if (poseLibrary[poseKey]) {
        extras.push({ pose: poseKey, alias: poseSuffix });
      }
    });
    stageRefs.sort((a, b) => PHASE_ORDER.indexOf(a.phase) - PHASE_ORDER.indexOf(b.phase));
    const sequence = Array.isArray(moveDef.sequence)
      ? moveDef.sequence.map((step) => {
          const info = posePhaseInfo(step.poseKey);
          if (info) {
            const stageId = `${moveName}${info.suffix}`;
            const converted = {
              stage: stageId,
              duration: step.durMs
            };
            if (step.strike) converted.strike = deepClone(step.strike);
            if (step.phase) converted.phase = step.phase;
            return converted;
          }
          return { pose: step.poseKey, duration: step.durMs };
        })
      : undefined;
    hierarchy[moveName] = {
      id: moveName,
      legacyId: moveId,
      name: moveDef.name || moveName,
      tags: deepClone(moveDef.tags || []),
      knockbackBase: moveDef.knockbackBase ?? moveDef.knockback ?? null,
      cancelWindow: moveDef.cancelWindow ?? null,
      inheritsFrom: moveDef.inherits ? toPascalCase(moveDef.inherits) : null,
      limb: determineDefaultLimb(moveId),
      stages: stageRefs,
      extras: extras.length ? extras : undefined,
      sequence
    };
  });
  return hierarchy;
};

const buildAttackHierarchyV2 = (abilitySystem = {}, moveHierarchy = {}) => {
  const attacks = {};
  Object.entries(abilitySystem.attacks || {}).forEach(([attackId, def]) => {
    const canonicalId = toPascalCase(attackId);
    const presetId = def.preset || attackId;
    const moveName = toPascalCase(presetId);
    const attack = {
      id: canonicalId,
      legacyId: attackId,
      name: canonicalId,
      primaryMove: moveName,
      moves: [
        {
          move: moveName,
          limb: determineDefaultLimb(presetId),
          startMs: 0
        }
      ],
      tags: deepClone(def.tags || []),
      classification: (def.tags || []).includes('heavy')
        ? 'heavy'
        : (def.tags || []).includes('light') ? 'light' : null
    };
    if (def.multipliers) attack.multipliers = deepClone(def.multipliers);
    if (def.effects) attack.effects = deepClone(def.effects);
    attacks[canonicalId] = attack;
  });
  return attacks;
};

const TRIGGER_TO_TYPE = {
  combo: 'combo',
  single: 'quick',
  'hold-release': 'hold-release',
  flurry: 'flurry'
};

const buildAbilityHierarchyV2 = (abilitySystem = {}, attackHierarchy = {}) => {
  const abilities = {};
  Object.entries(abilitySystem.abilities || {}).forEach(([abilityId, def]) => {
    const ability = {
      id: abilityId,
      name: def.name || toPascalCase(abilityId),
      type: TRIGGER_TO_TYPE[def.trigger] || def.trigger || null,
      classification: def.type || null,
      trigger: def.trigger || null,
      tags: deepClone(def.tags || [])
    };
    if (def.attack) {
      ability.attack = toPascalCase(def.attack);
    }
    if (Array.isArray(def.sequence)) {
      ability.sequence = def.sequence.map((attackId) => toPascalCase(attackId));
    }
    if (Array.isArray(def.variants)) {
      ability.variants = def.variants.map((variant) => ({
        ...variant,
        require: variant.require ? deepClone(variant.require) : undefined,
        attack: toPascalCase(variant.attack)
      }));
    }
    if (def.multipliers) ability.multipliers = deepClone(def.multipliers);
    if (def.onHit) ability.onHit = def.onHit;
    if (def.comboFromWeapon) ability.comboFromWeapon = true;
    if (def.fallbackWeapon) ability.fallbackWeapon = def.fallbackWeapon;
    if (def.charge) ability.charge = deepClone(def.charge);
    abilities[abilityId] = ability;
  });
  return abilities;
};

const buildInputSlotHierarchyV2 = (slots = {}) => {
  const slotMap = {};
  Object.entries(slots).forEach(([slotKey, slotDef]) => {
    slotMap[slotKey] = {
      id: slotKey,
      label: slotDef.label || slotKey,
      assignments: {
        light: slotDef.light || null,
        heavy: slotDef.heavy || null
      }
    };
  });
  return slotMap;
};

const attachInputSlotsToAbilities = (abilities = {}, inputSlots = {}) => {
  Object.entries(inputSlots).forEach(([slotKey, slotDef]) => {
    ['light', 'heavy'].forEach((weight) => {
      const abilityId = slotDef.assignments?.[weight];
      if (abilityId && abilities[abilityId]) {
        const slots = abilities[abilityId].inputSlots || [];
        if (!slots.includes(slotKey)) {
          slots.push(slotKey);
        }
        abilities[abilityId].inputSlots = slots;
      }
    });
  });
};

const buildWeaponComboHierarchyV2 = (weaponCombos = {}) => {
  const combos = {};
  Object.entries(weaponCombos).forEach(([weaponKey, comboDef]) => {
    combos[weaponKey] = {
      ...comboDef,
      sequence: Array.isArray(comboDef.sequence)
        ? comboDef.sequence.map((step) => typeof step === 'string' ? toPascalCase(step) : step)
        : undefined
    };
  });
  return combos;
};

const attachHierarchy = () => {
  if (!window.CONFIG) return;
  const poseLibrary = buildPoseLibraryV2(CONFIG.moves || {});
  const stages = buildStageLibraryV2(CONFIG.moves || {}, poseLibrary);
  const moveHierarchy = buildMoveHierarchyV2(CONFIG.moves || {}, stages, poseLibrary);
  const attackHierarchy = buildAttackHierarchyV2(CONFIG.abilitySystem || {}, moveHierarchy);
  const abilityHierarchy = buildAbilityHierarchyV2(CONFIG.abilitySystem || {}, attackHierarchy);
  const inputSlots = buildInputSlotHierarchyV2(CONFIG.abilitySystem?.slots || {});
  attachInputSlotsToAbilities(abilityHierarchy, inputSlots);
  const weaponComboHierarchy = buildWeaponComboHierarchyV2(CONFIG.weaponCombos || {});

  CONFIG.poseLibrary = poseLibrary;
  CONFIG.stageLibrary = stages;
  CONFIG.moveLibrary = moveHierarchy;
  CONFIG.attackLibrary = attackHierarchy;
  CONFIG.abilityLibrary = abilityHierarchy;
  CONFIG.inputSlotLibrary = inputSlots;
  CONFIG.hierarchy = {
    poses: poseLibrary,
    stages,
    moves: moveHierarchy,
    attacks: attackHierarchy,
    abilities: abilityHierarchy,
    thresholds: deepClone(CONFIG.abilitySystem?.thresholds || {}),
    defaults: deepClone(CONFIG.abilitySystem?.defaults || {}),
    inputSlots,
    characters: deepClone(CONFIG.characters || {}),
    weapons: deepClone(CONFIG.weapons || {}),
    weaponCombos: weaponComboHierarchy
  };
};

attachHierarchy();


// ==== CONFIG.attacks (authoritative) ====
window.CONFIG = window.CONFIG || {};
(function initAttacks(){
  const D = CONFIG.durations || { toWindup:320, toStrike:160, toRecoil:180, toStance:120 };
  CONFIG.attacks = {
    inputs: {
      button1: { tapSlot: 1, holdSlot: 2, holdThresholdMs: 240 },
      button2: { tapSlot: 3, holdSlot: 4, holdThresholdMs: 240 }
    },
    defaults: {
      durations: { toWindup: D.toWindup ?? 320, toStrike: D.toStrike ?? 160, toRecoil: D.toRecoil ?? 180 },
      comboWindowMs: 700,
      heavyMaxHoldMs: 3000
    },
    slots: {
      1: {
        label: "Light Combo (4-hit)",
        type: "light",
        variety: "combo",
        combo: { steps: ['ComboKICK1', 'ComboPUNCH1', 'ComboKICK2', 'ComboPUNCH2'], interRecoil: { poseKey: 'Recoil', durMs: 120 } },
        quickAltAfterHits: 4
      },
      2: {
        label: "Heavy Hold (SLAM)",
        type: "heavy",
        variety: "hold_release",
        requiresWindup: true,
        knockbackBase: 250,
        cancelWindowRecoil: 0.5,
        sequence: [ { poseKey:"Windup", durMs:480 }, { poseKey:"Slam", durMs:160, strike:{} }, { poseKey:"Recoil", durMs:200 } ]
      },
      3: {
        label: "Quick (KICK)",
        type: "light",
        variety: "quick",
        knockbackBase: 180,
        cancelWindowRecoil: 0.6,
        quick: {
          base: [ { poseKey:"KICK_Windup", durMs:180 }, { poseKey:"KICK_Strike", durMs:110, strike:{} }, { poseKey:"KICK_Recoil", durMs:680 } ],
          altAfterComboHits: {
            hits: 4,
            sequence: [
              { poseKey:"KICK_Windup", durMs: 60 },
              { poseKey:"KICK_Strike", durMs: 37, strike:{} },
              { poseKey:"KICK_Recoil", durMs:680 }
            ]
          }
        }
      },
      4: {
        label: "Heavy (SLAM)",
        type: "heavy",
        variety: "hold_release",
        requiresWindup: true,
        knockbackBase: 250,
        cancelWindowRecoil: 0.5,
        sequence: [ { poseKey:"Windup", durMs:480 }, { poseKey:"Slam", durMs:160, strike:{} }, { poseKey:"Recoil", durMs:200 } ]
      }
    },
    library: {
      KICK_Windup: { base: 'Windup', overrides: deepClone(KICK_MOVE_POSES.Windup) },
      KICK_Strike: { base: 'Strike', overrides: deepClone(KICK_MOVE_POSES.Strike) },
      KICK_Recoil: { base: 'Recoil', overrides: deepClone(KICK_MOVE_POSES.Recoil) },
      SLAM_Windup: { base: 'Windup', overrides: deepClone(SLAM_MOVE_POSES.Windup) },
      SLAM_Strike: { base: 'Slam', overrides: deepClone(SLAM_MOVE_POSES.Slam) },
      SLAM_Recoil: { base: 'Recoil', overrides: deepClone(SLAM_MOVE_POSES.Recoil) }
    }
  };


// Back-compat: build CONFIG.presets from CONFIG.attacks
const buildPresets = () => {
  if (!window.CONFIG || !CONFIG.attacks) return;
  const clone = (o) => o ? JSON.parse(JSON.stringify(o)) : {};
  const moves = CONFIG.moves || {};

  const derivedPresets = {};
  Object.entries(moves).forEach(([id, move]) => {
    derivedPresets[id] = clone(move);
  });

  CONFIG.presets = Object.assign({}, CONFIG.presets || {}, derivedPresets);

  if (!CONFIG.attacks.presets) {
    CONFIG.attacks.presets = {};
  }
  Object.assign(CONFIG.attacks.presets, derivedPresets);

  // Ensure core weapon presets exist and opt-in to weapon colliders.
  const ensurePreset = (name, base = 'ComboPUNCH1') => {
    if (!CONFIG.presets[name]) CONFIG.presets[name] = clone(CONFIG.presets[base] || {});
    CONFIG.presets[name].useWeaponColliders = true;
  };
  ['SLASH','STAB','THRUST','SWEEP','CHOP','SMASH','SWING','HACK','TOSS'].forEach(n => ensurePreset(n));

  try { document.dispatchEvent(new Event('config:ready')); } catch(_){}
};

  buildPresets();
})();
