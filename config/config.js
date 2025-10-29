const CONFIG = {
    actor: { scale: 0.70 },
    groundRatio: 0.70,
    canvas: { w: 720, h: 460, scale: 1 },
    groundY: 380,

    colors: { body:'#e5f0ff', left:'#86efac', right:'#93c5fd', guide:'#233044', hitbox:'#0ea5e9' },

    // Global fallback durations (SLAM uses these)
    durations: { toWindup:1600, toStrike:160, toRecoil:180, toStance:0 },

    parts: {
      hitbox:{ w:135, h:180, r:60, torsoAttach:{ nx:0.5, ny:0.7 } },
      torso:{ len:60 }, arm:{ upper:50, lower:50 }, leg:{ upper:40, lower:40 }, head:{ neck:14, radius:16 }
    },

    hierarchy: { legsFollowTorsoRotation: false },
    ik: { calvesOnly: true },

    basePose: { torso:0, lShoulder:-90, lElbow:0, rShoulder:-90, rElbow:0, lHip:90, lKnee:0, rHip:90, rKnee:0 },
    limits: {
      torso:{ absMin:-45, absMax:90 },
      shoulder:{ relMin:-360, relMax:-90 },
      elbow:{ relMin:-170, relMax:0 },
      hip:{ absMin:90, absMax:210 },
      knee:{ relMin:0, relMax:170 }
    },

    poses: {
      Stance:{ 
        torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:110, lKnee:40, rHip:30, rKnee:40, 
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0, resetFlipsBefore: true,
        allowAiming: true, aimLegs: false  // Allow upper body aiming in stance
      },
      Windup:{
        torso:-35, lShoulder:-360, lElbow:0, rShoulder:-360, rElbow:0, lHip:40, lKnee:90, rHip:-90, rKnee:90,
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming: true, aimLegs: false,  // Allow aiming during windup
        anim_events: [
          { time: 0.00, velocityX: -15, velocityY: 0 },
          { time: 0.65, impulse: 320, impulse_angle: -90 }
        ]
      },
      Strike:{
        torso:45, lShoulder:-45, lElbow:0, rShoulder:-45, rElbow:0, lHip:180, lKnee:0, rHip:90, rKnee:0,
        rootMoveVel:{x:0,y:0, flip: false }, impulseMag:0, impulseDirDeg:0,
        allowAiming: true, aimLegs: false,  // Allow aiming during strike
        anim_events: [
          { time: 0.00, impulse: 450, impulse_angle: -45 },
          { time: 0.05, velocityX: 280, velocityY: 120, localVel: true }
        ]
      },
      Recoil:{ durMs:200, phase:'recoil',
        torso:-15, lShoulder:-45, lElbow:0, rShoulder:-45, rElbow:0, lHip:0, lKnee:70, rHip:110, rKnee:0,
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming: false, aimLegs: false,  // No aiming during recoil
        anim_events: [
          { time: 0.00, velocityX: 80, velocityY: -40 },
          { time: 0.30, impulse: 120, impulse_angle: 160 }
        ]
      },
      Jump:{ 
        torso:-10, lShoulder:-160, lElbow:-30, rShoulder:-160, rElbow:-30, 
        lHip:120, lKnee:60, rHip:120, rKnee:60, 
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming: true, aimLegs: false  // Allow aiming while jumping
      },
      Walk:{ 
        torso:20, lShoulder:-100, lElbow:-100, rShoulder:-100, rElbow:-100,
        lHip:90, lKnee:20, rHip:90, rKnee:20,
        rootMoveVel:{x:0,y:0}, impulseMag:0, impulseDirDeg:0,
        allowAiming: true, aimLegs: false  // Allow aiming while walking
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
          arm: { upper:{ origin:{ax:0, ay:0}, elbow:{ax:0, ay:0} }, lower:{ origin:{ax:0, ay:0} },
          leg: { upper:{ origin:{ax:0, ay:0}, knee:{ax:0, ay:0}  }, lower:{ origin:{ax:0, ay:0} },
          head:{ origin:{ax:-1, ay:6} }
        },
        sprites: {
          torso: "https://i.imgur.com/YatjSyo.png",
          head:  "https://i.imgur.com/WsKQ2Eo.png",
          arm: { upper:"https://i.imgur.com/CAmWLbf.png", lower:"https://i.imgur.com/gOHujif.png" },
          leg: { upper:"https://i.imgur.com/qgcQTmx.png", lower:"https://i.imgur.com/lZbF7j2.png" },
          style: {
            widthFactor: { torso:1.0, armUpper:1.0, armLower:1.0, legUpper:1.0, legLower:1.0, head:1.0 },
            xformUnits: "percent",
            xform: {
              torso:    { ax:-0.5, ay:-0.00, scaleX:4.50, scaleY:4.50, rotDeg:180 },
              head:     { ax:-1.40, ay:-0.20, scaleX:4.50, scaleY:4.50, rotDeg:180 },
              armUpper: { ax:0.00, ay:0.00, scaleX:3.00, scaleY:3.00, rotDeg:0 },
              armLower: { ax:0.00, ay:0.00, scaleX:2.00, scaleY:2.00, rotDeg:0 },
              legUpper: { ax:-0.10, ay:0.10, scaleX:2.0, scaleY:2.0, rotDeg:0 },
              legLower: { ax:-0.2, ay:0.02, scaleX:2, scaleY:2.00, rotDeg:-10 }
            }
          }
        }
      }
    },

    movement: {
      authoredWeight:0.6, physicsWeight:0.4,
      gravity:2400, jumpImpulse:-650, accelX:1500, maxSpeedX:420, friction:8.0, restitution:0.0,
      dashSpeedMultiplier: 2.2,  // Speed multiplier when dashing
      facingSmooth:10.0, attackPhases:['Windup','Strike'], lockFacingDuringAttack:true, rootVelRelative:true
    },
    
    // Mouse aiming configuration
    aiming: {
      enabled: true,
      upperBodyOnly: true,  // Only rotate torso and arms, not legs
      smoothing: 8.0,       // How fast the aim follows mouse (higher = faster)
      maxTorsoAngle: 45,    // Max degrees torso can rotate from base
      maxShoulderAngle: 60, // Max degrees shoulders can rotate for aiming
      flipThreshold: 0.0    // Mouse passes character center to flip
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
      // Disable automatic calf ragdoll mid-air to prevent calves from
      // teleporting during jumps. Stiffness remains for other limbs.
      autoCalvesMidAir:false, stiffness:10.0,
      // Disable ragdoll on calves entirely. This keeps the legs stiff
      // in the air and avoids errant positions when jumping.
      limbs:{ lCalf:false, rCalf:false, lThigh:false, rThigh:false, lUpperArm:false, rUpperArm:false, lForearm:false, rForearm:false, torso:false, head:false }
    },
    
    // Collider configuration - multipliers for different body parts
    colliders: {
      handMultiplier: 2.0,  // Hands are 2x larger than base radius
      footMultiplier: 1.0   // Feet remain at base radius
    },
    
    // Knockback system configuration
    knockback: {
      // Maximum footing value before knockback has no multiplier
      maxFooting: 100,
      // Weapon type modifiers
      weaponTypes: {
        unarmed: { type: 'blunt', multiplier: 1.0 },
        blunt: { multiplier: 1.2 },
        sharp: { multiplier: 0.8 }
      },
      // Current weapon equipped (can be changed per fighter)
      currentWeapon: 'unarmed'
    }
  };