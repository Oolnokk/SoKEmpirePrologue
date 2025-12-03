// khyunchained CONFIG with sprite anchor mapping (torso/start) & optional debug

// UI Display Settings
window.CONFIG = window.CONFIG || {};
window.CONFIG.ui = window.CONFIG.ui || {};
window.CONFIG.ui.showClock = true; // Display the in-game time clock

// Heraldry & Material color palette
const MATERIALS = {
  city_heraldry_A: { h: 137, s: 0.85, v: -0.5 },        // Royal Purple
  city_heraldry_B: { h: 48,  s: 0.9,  v: 0.55 },        // TBD
  polished_bronze: { h: 32,  s: 0.42, v: 0.38 },        // Shiny bronze
  white_bronze:    { h: -12, s: 0.05, v: 0.08 },        // Pale alloy
  verdigris_bronze:{ h: 132, s: 0.42, v: 0.24 },        // Blue-green patina
  leather:         { h: 28,  s: 0.48, v: 0.22 },        // Leather brown
  mahogany:        { h: 12,  s: 0.54, v: 0.24 },        // Reddish wood
  bronzewood:      { h: 38,  s: 0.28, v: 0.28 }         // dark wood
};
window.CONFIG = window.CONFIG || {};
window.CONFIG.materials = MATERIALS;

const abilityKnockback = window.abilityKnockback || ((base, { clamp } = {}) => {
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
});
window.abilityKnockback = abilityKnockback;

const ensureAbilityLibrary = () => {
  const library = window.ABILITY_LIBRARY || {};
  if (Object.keys(library).length > 0) {
    return library;
  }

  const fallbackAbilities = {
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
    unarmed_combo_light: {
      name: 'Unarmed Combo',
      type: 'light',
      trigger: 'combo',
      tags: ['combo', 'light', 'unarmed'],
      sequence: ['UnArCA1', 'UnArCA2', 'UnArCA3', 'UnArCA4'],
      defaultAttack: 'UnArCA1',
      comboWindowMs: 3000,
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
    },
    evade_defensive: {
      name: 'Evade',
      type: 'defensive',
      trigger: 'defensive',
      tags: ['defensive', 'mobility'],
      defensive: {
        poseKey: 'Stance',
        poseRefreshMs: 220,
        staminaDrainPerSecond: 40,
        minStaminaRatio: 0.6
      }
    }
  };

  window.ABILITY_LIBRARY = fallbackAbilities;
  return fallbackAbilities;
};

const deepClone = (value) => JSON.parse(JSON.stringify(value || {}));

const mergeAbilityManifests = (config) => {
  if (!config) return;
  const manifests = window.ABILITY_MANIFESTS || [];
  manifests.forEach((entry) => {
    const manifest = typeof entry === 'function' ? entry() : entry;
    if (!manifest) return;
    const { poses = {}, stages = {}, moves = {}, attacks = {}, weaponCombos = {} } = manifest;

    if (Object.keys(poses).length) {
      config.poses = config.poses || {};
      Object.assign(config.poses, deepClone(poses));
    }

    if (Object.keys(stages).length) {
      config.stages = config.stages || {};
      Object.assign(config.stages, deepClone(stages));
    }

    if (Object.keys(moves).length) {
      config.moves = config.moves || {};
      Object.assign(config.moves, deepClone(moves));
    }

    if (Object.keys(attacks).length) {
      config.abilitySystem = config.abilitySystem || {};
      config.abilitySystem.attacks = config.abilitySystem.attacks || {};
      Object.assign(config.abilitySystem.attacks, deepClone(attacks));
    }

    if (Object.keys(weaponCombos).length) {
      config.weaponCombos = config.weaponCombos || {};
      Object.assign(config.weaponCombos, deepClone(weaponCombos));
    }
  });
};

const toPascalCase = (value = '') => {
  if (!value) return '';
  return String(value)
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

const NON_COMBAT_POSE = {
  weapon: 0,
  weaponGripPercents: { primary: 0, secondary: 0 },
  weaponJointPercent: 0,
  lengthScales: { weapon: 0 }
};

// === DEPRECATED: Legacy weapon stance system ===
// These are kept for backwards compatibility with buildWeaponStances()
// New code should use ARM_STANCES instead
const WEAPON_STANCE_TYPES = ['unarmed', 'dagger-swords', 'sarrarru', 'light-greatblade', 'greatclub', 'hatchets'];

const WEAPON_STANCE_DEFAULTS = {
  unarmed: {
    lShoulder: -120,
    lElbow: -120,
    rShoulder: -65,
    rElbow: -140,
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
  },

  'dagger-swords': {
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
    lShoulder: -85,
    lElbow: -95,
    rShoulder: -85,
    rElbow: -95,
  },

  sarrarru: {
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
    lShoulder: -70,
    lElbow: -120,
    rShoulder: -15,
    rElbow: 0,
  },

  'light-greatblade': {
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
    lShoulder: -75,
    lElbow: -110,
    rShoulder: -75,
    rElbow: -110,
  },

  greatclub: {
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
    lShoulder: -90,
    lElbow: -100,
    rShoulder: -90,
    rElbow: -100,
  },

  hatchets: {
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
    lShoulder: -85,
    lElbow: -105,
    rShoulder: -85,
    rElbow: -105,
  },
};

// DEPRECATED: Use ARM_STANCES instead. Kept for backwards compatibility only.
const buildWeaponUpperOverrides = (stowedPose = NON_COMBAT_POSE) => {
  const map = {};
  const ensureEntry = (key, overrides = {}) => {
    map[key] = {
      unstowed: deepClone(overrides),
      stowed: deepClone(stowedPose),
    };
  };

  ensureEntry('unarmed', WEAPON_STANCE_DEFAULTS.unarmed);
  for (const [key, overrides] of Object.entries(WEAPON_STANCE_DEFAULTS)) {
    if (key === 'unarmed') continue;
    ensureEntry(key, overrides);
  }

  return map;
};


const buildWeaponStances = (basePose) => {
  const map = {};
  for (const type of WEAPON_STANCE_TYPES) {
    const suffix = toPascalCase(type);
    if (!suffix) continue;
    map[`Stance${suffix}`] = deepClone(basePose);
    const overrides = WEAPON_STANCE_DEFAULTS[type];
    if (overrides) {
      Object.assign(map[`Stance${suffix}`], deepClone(overrides));
    }
  }
  return map;
};

const ensureWeaponStances = (config) => {
  if (!config?.poses) return;
  const base = config.poses.Stance || deepClone(MODE_BASE_POSES.combat);
  const ensure = (rawKey) => {
    const suffix = toPascalCase(rawKey);
    if (!suffix) return;
    const poseKey = `Stance${suffix}`;
    if (!config.poses[poseKey]) {
      config.poses[poseKey] = deepClone(base);
    }
  };

  ensure('unarmed');
  const weapons = config.weapons || {};
  Object.entries(weapons).forEach(([weaponKey, def]) => {
    ensure(weaponKey);
    if (def?.type) ensure(def.type);
  });
};

// === UPDATED: movement profiles now have idlePoses + idleAmp + optional armSwing ===
const MOVEMENT_PROFILES = {
  combat: {
    enabled: true,
    onlyTorsoLegs: true,
    baseHz: 1.3,
    speedScale: 1,
    minSpeed: 80,
    amp: 1.0,
    poses: {
      A: { lHip: 0,   lKnee: 45, rHip: 180, rKnee: 90 },
      B: { lHip: 180, lKnee: 90, rHip: 0,   rKnee: 45 }
    },
    idlePoses: {
      A: { lHip: 270, lKnee: 70, rHip: 110, rKnee: 70 },
      B: { lHip: 270, lKnee: 70, rHip: 110, rKnee: 70 },
    },
    idleAmp: 0.4,
    armSwing: {
      enabled: true,
      amp: 1.0,
      shoulderAmpDeg: 10,
      elbowAmpDeg: 6,
      phaseOffset: Math.PI / 6,
      elbowPhaseOffset: Math.PI / 4
    }
  },
  nonCombat: {
    enabled: true,
    onlyTorsoLegs: true,
    baseHz: 1.3,
    speedScale: 1,
    minSpeed: 60,
    amp: 1.0,
    poses: {
      A: { lHip: 0,   lKnee: 45, rHip: 150, rKnee: 90 },
      B: { lHip: 150, lKnee: 90, rHip: 0,   rKnee: 45 }
    },
    idlePoses: {
      A: { lHip: 200, lKnee: 70, rHip: 130, rKnee: 70 },
      B: { lHip: 200, lKnee: 70, rHip: 130, rKnee: 70 },
    },
    idleAmp: 0.5,
    armSwing: {
      enabled: true,
      amp: 0.7,
      shoulderAmpDeg: 8,
      elbowAmpDeg: 4
    }
  },
  sneak: {
    enabled: true,
    onlyTorsoLegs: true,
    baseHz: 1.05,
    speedScale: 0.8,
    minSpeed: 40,
    amp: 0.75,
    poses: {
      A: { lHip: 120,  lKnee: 65, rHip: 190, rKnee: 100 },
      B: { lHip: 185, lKnee: 100, rHip: 25, rKnee: 65 }
    },
    idlePoses: {
      A: { lHip: 270, lKnee: 70, rHip: 110, rKnee: 70 },
      B: { lHip: 270, lKnee: 70, rHip: 110, rKnee: 70 }
    },
    idleAmp: 0.35,
    armSwing: {
      enabled: true,
      amp: 0.5,
      shoulderAmpDeg: 6,
      elbowAmpDeg: 3
    }
  }
};

const MOVEMENT_SPEED_MULTIPLIERS = {
  combat: 1.25,
  nonCombat: 0.5,
  sneak: 0.3,
};

// === ARM STANCES: Unified arm position system ===
// PassiveArms is the default (relaxed arms), weapon stances integrate into this system
const ARM_STANCES = {
  PassiveArms: {
    lShoulder: 165,
    lElbow: -18,
    rShoulder: -165,
    rElbow: 18,
    weapon: 0,
    weaponGripPercents: { primary: 0, secondary: 0 },
  },

  unarmed: {
    lShoulder: -120,
    lElbow: -120,
    rShoulder: -65,
    rElbow: -140,
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
  },

  'dagger-swords': {
    // TEMP TEST: Arms way out to the sides
    lShoulder: 180,
    lElbow: 0,
    rShoulder: -180,
    rElbow: 0,
    weapon: 90,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
  },

  sarrarru: {
    // TEMP TEST: Arms straight up
    lShoulder: -180,
    lElbow: 0,
    rShoulder: -180,
    rElbow: 0,
    weapon: -90,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
  },

  'light-greatblade': {
    // TEMP TEST: Left up, right down
    lShoulder: -180,
    lElbow: -90,
    rShoulder: 0,
    rElbow: 90,
    weapon: 45,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
  },

  greatclub: {
    // TEMP TEST: Arms crossed in front
    lShoulder: -45,
    lElbow: -135,
    rShoulder: -45,
    rElbow: -135,
    weapon: 180,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
  },

  hatchets: {
    // TEMP TEST: Arms bent back
    lShoulder: -90,
    lElbow: 90,
    rShoulder: -90,
    rElbow: 90,
    weapon: -45,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
  },
};

const BASE_POSES = {
  Stance: {
        torso: 10,
    lShoulder: -90,
    lElbow: 0,
    rShoulder: -90,
    rElbow: 0,
    lHip: 100,
    lKnee: 70,
    rHip: 30,
    rKnee: 70,
    weapon: -20,
    weaponGripPercents: { primary: 0.28, secondary: 0.72 },
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
    weapon: -60,
    weaponGripPercents: { primary: 0.18, secondary: 0.52 },
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false,
    anim_events: [
      { time: 0.00, velocityX: -15, velocityY: 0 },
      { time: 0.10, grip: { action: 'attach', limb: 'right', gripId: 'primary' } },
      { time: 0.18, grip: { action: 'attach', limb: 'left', gripId: 'secondary' } },
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
    weapon: 10,
    weaponGripPercents: { primary: 0.42, secondary: 0.86 },
    rootMoveVel: { x: 0, y: 0, flip: false },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false,
    anim_events: [
      { time: 0.00, impulse: 850, impulse_angle: -45 },
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
    weapon: -40,
    weaponGripPercents: { primary: 0.25, secondary: 0.68 },
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: false,
    aimLegs: false,
    anim_events: [
      { time: 0.00, velocityX: 80, velocityY: -40 },
      { time: 0.25, grip: { action: 'detach', limb: 'left' } },
      { time: 0.30, impulse: 120, impulse_angle: 160 },
      { time: 0.45, grip: { action: 'detach', limb: 'right' } }
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
    weapon: -15,
    weaponGripPercents: { primary: 0.3, secondary: 0.7 },
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
    weapon: -10,
    weaponGripPercents: { primary: 0.3, secondary: 0.7 },
    lHip: -90,
    lKnee: 20,
    rHip: -90,
    rKnee: 20,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    allowAiming: true,
    aimLegs: false
  }
};


const makeSarrarruComboPoses = ({ windup = {}, strike = {}, recoil = {} } = {}) => {
  const poses = {
    Stance: { ...deepClone(BASE_POSES.Stance), resetFlip: true },
    Windup: { ...deepClone(BASE_POSES.Windup), ...windup },
    Strike: { ...deepClone(BASE_POSES.Strike), ...strike },
    Recoil: { ...deepClone(BASE_POSES.Recoil), ...recoil }
  };
  return poses;
};

// Pose angle summary used by tooling/tests to verify baseline corrections.
const POSE_ANGLE_SUMMARY = {
  Windup: { lHip:130, rHip:100 },
  Strike: { lHip:180, rHip:110 },
  Recoil: { lHip:110, rHip:100 }
};

const FIGHTER_TLETINGAN = 'TLETINGAN';
const FIGHTER_MAOAO_M = 'Mao-ao_M';
const FIGHTER_MAOAO_F = 'Mao-ao_F';

const COSMETIC_PROFILE_SOURCES = {
  [FIGHTER_TLETINGAN]: './config/fighter-offsets/TLETINGAN.json',
  [FIGHTER_MAOAO_M]: './config/fighter-offsets/Mao-ao_M.json',
  [FIGHTER_MAOAO_F]: './config/fighter-offsets/Mao-ao_F.json'
};

const COSMETIC_LIBRARY_SOURCES = {
  basic_headband: './config/cosmetics/basic_headband.json',
  citywatch_helmet: './config/cosmetics/citywatch_helmet.json',
  layered_travel_cloak: './config/cosmetics/layered_travel_cloak.json',
  simple_poncho: './config/cosmetics/simple_poncho.json',
  anuri_hood: './config/cosmetics/anuri_hood.json',
  anuri_poncho: './config/cosmetics/anuri_poncho.json',
  basic_pants: './config/cosmetics/basic_pants.json',
  'appearance::Mao-ao_M::mao-ao_circled_eyes': './config/cosmetics/appearance/mao-ao/circled_eyes.json',
  'appearance::Mao-ao_M::mao-ao_circled_eye_L': './config/cosmetics/appearance/mao-ao/circled_eye_L.json',
  'appearance::Mao-ao_M::mao-ao_smooth_striped': './config/cosmetics/appearance/mao-ao/smooth_striped.json',
  'appearance::Mao-ao_M::mao-ao_shoulder_length_drape': './config/cosmetics/appearance/mao-ao/shoulder_length_drape.json',
  'appearance::Mao-ao_M::mao-ao_tuft': './config/cosmetics/appearance/mao-ao/tuft.json',
  'appearance::Mao-ao_M::mao-ao_long_ponytail': './config/cosmetics/appearance/mao-ao/long_ponytail.json',
  'appearance::Mao-ao_F::mao-ao_circled_eyes': './config/cosmetics/appearance/mao-ao/circled_eyes.json',
  'appearance::Mao-ao_F::mao-ao_circled_eye_L': './config/cosmetics/appearance/mao-ao/circled_eye_L.json',
  'appearance::Mao-ao_F::mao-ao_smooth_striped': './config/cosmetics/appearance/mao-ao/smooth_striped.json',
  'appearance::Mao-ao_F::mao-ao_shoulder_length_drape': './config/cosmetics/appearance/mao-ao/shoulder_length_drape.json',
  'appearance::Mao-ao_F::mao-ao_tuft': './config/cosmetics/appearance/mao-ao/tuft.json',
  'appearance::Mao-ao_F::mao-ao_long_ponytail': './config/cosmetics/appearance/mao-ao/long_ponytail.json'
	
};

const KICK_MOVE_POSES = {
  Stance: {
    ...deepClone(BASE_POSES.Stance),
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
    torso: 120,
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
    torso: 80,
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
        ...deepClone(BASE_POSES.Stance),
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
      { time: 0.00, velocityY: -680 },
      { time: 0.00, gravityScale: 0.35, gravityScaleDurationMs: 1200 }
    ]
  },
  Charge: {
    torso: -45,
    lShoulder: -370,
    lElbow: -10,
    rShoulder: -370,
    rElbow: -10,
    lHip: 50,
    lKnee: 110,
    rHip: -100,
    rKnee: 110,
    rootMoveVel: { x: 0, y: 0 },
    impulseMag: 0,
    impulseDirDeg: 0,
    translate: { x: 75, y: 0, local: true },
    allowAiming: true,
    aimLegs: false
  },
  Slam: {
    ...deepClone(PUNCH_MOVE_POSES.Strike),
    anim_events: [
      { time: 0.00, resetGravityScale: true },
      { time: 0.00, impulse: 520, aimRelative: true }
    ]
  },
  Recoil: deepClone(PUNCH_MOVE_POSES.Recoil)
};

window.CONFIG = {
  basePose: deepClone(BASE_POSES.Stance),
  legsProfiles: MOVEMENT_PROFILES,
  armStances: ARM_STANCES,
  weaponUpperOverrides: buildWeaponUpperOverrides(),
  mapBuilder: {
    sourceId: 'map-builder-layered-v15f',
    fallbackBoxMinWidth: 18,
    tagInstanceIdMapping: {
      'spawn:player': 'player_spawn',
      'spawn:npc': 'npc_spawn',
      'spawner:npc': 'npc_spawner',
    },
  },
  entry: {
    skipKey: 'sok-entry-mode',
  },
  actor: { scale: 0.70 },
  groundRatio: 0.70,
  canvas: { w: 720, h: 460, scale: 1 },
  camera: {
    manualOffsetX: 0,
    awareness: {
      normalZoom: 1,
      scaleOffset: 0.25,
      minZoom: 0.6,
      maxZoom: 1.3,
      inactivitySeconds: 15,
      smoothing: 0.08
    }
  },
  hud: {
    bottomButtons: {
      width: 180,
      height: 100,
      edgeHeight: 47,
      apexHeight: 70,
      offsetY: 0,
      scale: 1,
      scaleWithActor: true,
      buttons: {
        jump: { left: 65, top: 45, rotateDeg: 0 },
        attackA: { left: 70, top: 50, rotateDeg: 0 },
        attackB: { left: 85, top: 65, rotateDeg: 0 },
        attackC: { left: 90, top: 70, rotateDeg: 0 },
      }
    },
    enemyIndicators: {
      width: 96,
      depth: 28,
      depthStep: 6,
      spacing: 8,
      topPadding: 4,
      offsetY: 6,
      strokeWidth: 2,
      scaleWithActor: true,
      showFooting: true,
      colors: {
        health: '#f87171',
        stamina: '#38bdf8',
        footing: '#facc15',
      }
    },
    arch: {
      enabled: true,
      arch: {
        radiusPx: 180,
        start: { x: 0.90, y: 0.25 },
        end: { x: 0.75, y: 0.10 },
        scale: 1,
        buttonSizePx: 45,
        defaultGapPx: 12,
        rotateWithArch: true,
        debug: false,
      },
      buttons: [
        { id: 'attackA', action: 'buttonA', order: 2, lengthPct: 0.25, gapPx: 12, sprite: 'img/ui/btn-light.png' },
        { id: 'attackB', action: 'buttonB', order: 3, lengthPct: 0.25, gapPx: 12, sprite: 'img/ui/btn-heavy.png' },
        { id: 'attackC', action: 'buttonC', order: 4, lengthPct: 0.25, gapPx: 12, sprite: 'img/ui/btn-special.png' },
        { id: 'jump', action: 'jump', order: 1, lengthPct: 0.25, gapPx: 12, sprite: 'img/ui/btn-jump.png' },
      ]
    }
  },
  map: {
  gridUnit: 30,
  spawnLayerId: 'gameplay',
  defaultLayoutId: 'defaultdistrict',
  previewStoragePrefix: 'sok-map-editor-preview:',
  prefabManifests: [
    './config/prefabs/structures/index.json',
    './config/prefabs/obstructions/index.json',
  ],
  layouts: [
    {
      id: 'defaultdistrict',
      label: 'DefaultDistrict',
      path: './config/maps/defaultdistrict.layout.json',
      areaName: 'DefaultDistrict',
    },
  ],
  playAreaMinX: -1160,
  playAreaMaxX: 1160,
  },
  mapEditor: {
    canvas: { height: 460 },
    ground: {
      offset: 140,
      ratio: 0.6956521739,
    },
    customArea: {
      id: 'custom_area',
      label: 'Empty Layout',
      path: null,
      areaName: 'Custom Area',
    },
  },
  ground: {
    offset: 140,
    // Set to true to keep the configured groundRatio instead of letting map layouts override it.
    lockRatio: false,
  },
  groundY: 0,
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
    StanceStowed: deepClone(NON_COMBAT_POSE),
    ...buildWeaponStances(BASE_POSES.Stance),
    NonCombatBase: deepClone(BASE_POSES.Stance),
    SneakBase: deepClone(BASE_POSES.Stance),

    // Unified legs pose (used across all movement modes)
    Legs: {
      lHip: -90,
      lKnee: 0,
      rHip: -90,
      rKnee: 0
    },

    Windup: deepClone(BASE_POSES.Windup),
    Strike: deepClone(BASE_POSES.Strike),
    Recoil: deepClone(BASE_POSES.Recoil),
    Jump: deepClone(BASE_POSES.Jump),
    Walk: deepClone(BASE_POSES.Walk),
    NonCombat: deepClone(NON_COMBAT_POSE)
  },

  nonCombatPose: deepClone(NON_COMBAT_POSE),

  weaponBackOffsets: {
    default: {
      slotA: { ax: -0.14, ay: -0.9, units: 'percent', angDeg: -12 },
      slotB: { ax: 0.14, ay: -0.82, units: 'percent', angDeg: 8 }
    },
    'dagger-swords': {
      slotA: { ax: -0.12, ay: -0.72, units: 'percent', angDeg: -20 },
      slotB: { ax: 0.12, ay: -0.64, units: 'percent', angDeg: 16 }
    },
    sarrarru: {
      slotA: { ax: 0, ay: 0.5, units: 'percent', angDeg: -45 },
      slotB: { ax: 0, ay: 0.5, units: 'percent', angDeg: 12 }
    },
    greatclub: {
      slotA: { ax: -0.22, ay: -1.1, units: 'percent', angDeg: -4 },
      slotB: { ax: 0.18, ay: -1.0, units: 'percent', angDeg: 10 }
    },
    hatchets: {
      slotA: { ax: -0.16, ay: -0.86, units: 'percent', angDeg: -22 },
      slotB: { ax: 0.16, ay: -0.78, units: 'percent', angDeg: 18 }
    },
    'light-greatblade': {
      slotA: { ax: -0.2, ay: -1.08, units: 'percent', angDeg: -8 },
      slotB: { ax: 0.16, ay: -0.98, units: 'percent', angDeg: 8 }
    }
  },

  cosmetics: {
    profileSources: COSMETIC_PROFILE_SOURCES,
    librarySources: COSMETIC_LIBRARY_SOURCES
  },

  fighters: {
    TLETINGAN: {
        actor: { scale: 0.85 },
        parts: {
          hitbox: { w:80, h:110, r:60, torsoAttach: { nx:0.4, ny:0.6 } },
          torso: { len:40 },
          arm: { upper:30, lower:40 },
          leg: { upper:30, lower:30 },
          head: { neck:10, radius:12 }
        },
        hierarchy: { legsFollowTorsoRotation: false },
        footsteps: {
          type: 'sloth-foot',
          strideScale: 0.1,
        },
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
        torso: { url: "./assets/fightersprites/tletingan/torso_mint.png", bodyColor: 'A' },
        head:  { url: "./assets/fightersprites/tletingan/head_mint.png", bodyColor: 'A' },
        arm_L_upper: { url: "./assets/fightersprites/tletingan/arm-upper_mint.png", bodyColor: 'A' },
        arm_L_lower: { url: "./assets/fightersprites/tletingan/arm-lower_mint.png", bodyColor: 'A' },
        arm_R_upper: { url: "./assets/fightersprites/tletingan/arm-upper_mint.png", bodyColor: 'A' },
        arm_R_lower: { url: "./assets/fightersprites/tletingan/arm-lower_mint.png", bodyColor: 'A' },
        leg_L_upper: { url: "./assets/fightersprites/tletingan/leg-upper_mint.png", bodyColor: 'A' },
        leg_L_lower: { url: "./assets/fightersprites/tletingan/leg-lower_mint.png", bodyColor: 'A' },
        leg_R_upper: { url: "./assets/fightersprites/tletingan/leg-upper_mint.png", bodyColor: 'A' },
        leg_R_lower: { url: "./assets/fightersprites/tletingan/leg-lower_mint.png", bodyColor: 'A' }
      },
      spriteStyle: {
          widthFactor: { torso:0.9, armUpper:0.9, armLower:0.9, legUpper:0.9, legLower:0.9, head:0.9 },
          xformUnits: "percent",
          xform: {
            torso:    { ax:-0.5,  ay:-0.2, scaleX:3.5, scaleY:4.50, rotDeg:180 },
            head:     { ax:-1.20, ay:-0.60, scaleX:1.5, scaleY:1.5, rotDeg:180 },
            armUpper: { ax:0.00,  ay:0.00,  scaleX:3.00, scaleY:3.00, rotDeg:0 },
            armLower: { ax:0.00,  ay:0.00,  scaleX:2.00, scaleY:2.00, rotDeg:0 },
            legUpper: { ax:-0.10, ay:0.10,  scaleX:2.0,  scaleY:2.0,  rotDeg:0 },
            legLower: { ax:-0.2,  ay:0.02,  scaleX:2,    scaleY:2.00, rotDeg:-10 }
          }
      },
      untintedOverlays: [
        {
          url: "./assets/fightersprites/tletingan/untinted_regions/ur-head.png",
          parts: ['head']
        },
        {
          url: "./assets/fightersprites/tletingan/untinted_regions/ur-arm-lower.png",
          parts: ['arm_L_lower', 'arm_R_lower']
        },
        {
          url: "./assets/fightersprites/tletingan/untinted_regions/ur-leg-lower.png",
          parts: ['leg_L_lower', 'leg_R_lower']
        }
      ],
      bodyColors: {
        A: { h: -90, s: 0.5, v: -0.2 },
        B: { h: -24, s: 0.18, v: 0.05 },
        C: { h: 96, s: 0.26, v: -0.06 }
      },
      cosmetics: {}
    },
    'Mao-ao_M': {
      actor: { scale: 1 },
      parts: { hitbox:{ w:80, h:110, r:60, torsoAttach:{ nx:0.4, ny:0.6 } }, torso:{ len:55 }, arm:{ upper:35, lower:50 }, leg:{ upper:40, lower:40 }, head:{ neck:10, radius:12 } },
      hierarchy: { legsFollowTorsoRotation: false },
      footsteps: {
        type: 'cat-foot',
        strideScale: 0.1,
      },
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
        torso: { url: "./assets/fightersprites/mao-ao-m/torso_mint.png", bodyColor: 'A' },
        head:  { url: "./assets/fightersprites/mao-ao-m/head_mint.png", bodyColor: 'A' },
        arm_L_upper: { url: "./assets/fightersprites/mao-ao-m/arm-upper_mint.png", bodyColor: 'A' },
        arm_L_lower: { url: "./assets/fightersprites/mao-ao-m/arm-lower_mint.png", bodyColor: 'A' },
        arm_R_upper: { url: "./assets/fightersprites/mao-ao-m/arm-upper_mint.png", bodyColor: 'A' },
        arm_R_lower: { url: "./assets/fightersprites/mao-ao-m/arm-lower_mint.png", bodyColor: 'A' },
        leg_L_upper: { url: "./assets/fightersprites/mao-ao-m/leg-upper_mint.png", bodyColor: 'A' },
        leg_L_lower: { url: "./assets/fightersprites/mao-ao-m/leg-lower_mint.png", bodyColor: 'A' },
        leg_R_upper: { url: "./assets/fightersprites/mao-ao-m/leg-upper_mint.png", bodyColor: 'A' },
        leg_R_lower: { url: "./assets/fightersprites/mao-ao-m/leg-lower_mint.png", bodyColor: 'A' }
      },
      spriteStyle: {
          widthFactor: { torso:1.0, armUpper:1.0, armLower:1.0, legUpper:1.0, legLower:1.0, head:1.0 },
          xformUnits: "percent",
          xform: {
            torso:    { ax:0.2,  ay:-0.1, scaleX:3, scaleY:3, rotDeg:180 },
            head:     { ax:-0.1, ay:0.1, scaleX:1, scaleY:1.2, rotDeg:180 },
            armUpper: { ax:-0.2,  ay:0.1,  scaleX:1.6, scaleY:2.8, rotDeg:-10 },
            armLower: { ax:0.35,  ay:0,  scaleX:1.7, scaleY:2.1, rotDeg:-3 },
            legUpper: { ax:-0.10, ay:0,  scaleX:1.7, scaleY:2.75,  rotDeg:-15 },
            legLower: { ax:-0.0,  ay:0.2,  scaleX:1.7, scaleY:2.1, rotDeg:-4 }
          }
      },
      untintedOverlays: [
        {
          url: "./assets/fightersprites/mao-ao-m/untinted_regions/ur-head.png",
          parts: ['head']
        }
      ],
      exposedParts: {
        ear: true,
      },
      bodyColors: {
        A: { h: -90, s: 0.5, v: -0.2 },
        B: { h: -24, s: 0.58, v: 0.05 },
        C: { h: 96, s: 0.26, v: -0.06 }
      },
      cosmetics: {}
    },
    'Mao-ao_F': {
      actor: { scale: 0.9 },
      parts: { hitbox:{ w:80, h:110, r:60, torsoAttach:{ nx:0.4, ny:0.6 } }, torso:{ len:50 }, arm:{ upper:30, lower:45 }, leg:{ upper:35, lower:35 }, head:{ neck:10, radius:12 } },
      hierarchy: { legsFollowTorsoRotation: false },
      footsteps: {
        type: 'cat-foot',
        strideScale: 0.1,
      },
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
        torso: { url: "./assets/fightersprites/mao-ao-f/torso.png", bodyColor: 'A' },
        head:  { url: "./assets/fightersprites/mao-ao-f/head.png", bodyColor: 'A' },
        arm_L_upper: { url: "./assets/fightersprites/mao-ao-f/arm-upper_mint.png", bodyColor: 'A' },
        arm_L_lower: { url: "./assets/fightersprites/mao-ao-f/arm-lower_mint.png", bodyColor: 'A' },
        arm_R_upper: { url: "./assets/fightersprites/mao-ao-f/arm-upper_mint.png", bodyColor: 'A' },
        arm_R_lower: { url: "./assets/fightersprites/mao-ao-f/arm-lower_mint.png", bodyColor: 'A' },
        leg_L_upper: { url: "./assets/fightersprites/mao-ao-f/leg-upper_mint.png", bodyColor: 'A' },
        leg_L_lower: { url: "./assets/fightersprites/mao-ao-f/leg-lower_mint.png", bodyColor: 'A' },
        leg_R_upper: { url: "./assets/fightersprites/mao-ao-f/leg-upper_mint.png", bodyColor: 'A' },
        leg_R_lower: { url: "./assets/fightersprites/mao-ao-f/leg-lower_mint.png", bodyColor: 'A' }
      },
      spriteStyle: {
          widthFactor: { torso:1, armUpper:0.8, armLower:0.8, legUpper:0.8, legLower:0.8, head:0.9 },
          xformUnits: "percent",
          xform: {
            torso:    { ax:0.2,  ay:-0.1, scaleX:3, scaleY:3, rotDeg:180 },
            head:     { ax:0.1, ay:0.1, scaleX:1, scaleY:1.2, rotDeg:180 },
            armUpper: { ax:-0.2,  ay:0.1,  scaleX:1.6, scaleY:2.8, rotDeg:-10 },
            armLower: { ax:0.35,  ay:0,  scaleX:1.7, scaleY:2.1, rotDeg:-3 },
            legUpper: { ax:-0.10, ay:0,  scaleX:1.7, scaleY:2.75,  rotDeg:-15 },
            legLower: { ax:-0.0,  ay:0.2,  scaleX:1.7, scaleY:2.1, rotDeg:-4 }
          }
      },
      untintedOverlays: [
        {
          url: "./assets/fightersprites/mao-ao-f/untinted_regions/ur-head.png",
          parts: ['head'],
                  url: "./assets/fightersprites/mao-ao-f/untinted_regions/ur-torso.png",
          parts: ['torso']
        }
      ],
      exposedParts: {
        ear: true,
      },
      bodyColors: {
        A: { h: -90, s: 0.5, v: -0.2 },
        B: { h: -24, s: 0.58, v: 0.05 },
        C: { h: 96, s: 0.26, v: -0.06 }
      },
      cosmetics: {}
    },
  },

  movement: {
    authoredWeight:1, physicsWeight:0,
    gravity:1200, jumpImpulse:-650, accelX:1500, maxSpeedX:420, friction:8.0, restitution:0.0,
    dashSpeedMultiplier: 1.8,
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

  movementProfiles: MOVEMENT_PROFILES,
  walkSpeedMultipliers: MOVEMENT_SPEED_MULTIPLIERS,
  walk: MOVEMENT_PROFILES.combat,
  ragdoll: {
    killAuthOnActive:true, enabled:true,
    autoCalvesMidAir:false, stiffness:10.0,
    limbs:{ lCalf:false, rCalf:false, lThigh:false, rThigh:false, lUpperArm:false, rUpperArm:false, lForearm:false, rForearm:false, torso:false, head:false }
  },

  // Optional manual pre-ragdoll arm angles (degrees, absolute, before physics noise is added)
  nonCombatRagdoll: {
    manualArmRotation: {
      lShoulder: 180, // set to override the left shoulder's resting target (e.g., 90 keeps the arm pointing down)
      rShoulder: 180, // set to override the right shoulder's resting target
      lElbow: 15,
      rElbow: 15,
    },
  },

  colliders: {
    handMultiplier: 2.0,
    footMultiplier: 1.0
  },

  balance: {
    footingDamage: 1.0,
    baseMovementSpeed: 0.25,
    baseRecoveryRate: 0.5,
    statPointEffects: {
      strength: 1.0,
      agility: 1.0,
      endurance: 1
    }
  },

  npc: {
    obstructionJump: {
      initialDelay: 10,
      blockedDuration: 0.9,
      cooldown: 3.2,
      minVelocity: 45,
      minProgress: 4,
      minDistance: 18
    }
  },

  knockback: {
    maxFooting: 100,
    airborneMultiplier: 5,
    weaponTypes: {
      unarmed: { type: 'blunt', multiplier: 1.0 },
      blunt: { multiplier: 2.4 },
      sharp: { multiplier: 1.6 },
      sarrarru: { type: 'sharp', multiplier: 1.6 }
    },
    currentWeapon: 'unarmed'
  },

  moves: {
    KICK: {
      name: 'Quick Kick',
      tags: ['light', 'quick'],
      durations: { toWindup: 480, toStrike: 210, toRecoil: 680, toStance: 200 },
      knockbackBase: 360,
      cancelWindow: 0.6,
      poses: deepClone(KICK_MOVE_POSES)
    },
	PUNCH: {
      name: 'Punch',
      tags: ['light', 'quick'],
      durations: { toWindup: 380, toStrike: 210, toRecoil: 200, toStance: 120 },
      knockbackBase: 140,
      cancelWindow: 0.7,
      poses: deepClone(PUNCH_MOVE_POSES)
    },
    SLAM: {
      name: 'Charged Slam',
      tags: ['heavy'],
      durations: { toWindup: 400, toCharge: 400, toStrike: 160, toRecoil: 200, toStance: 120 },
      knockbackBase: 250,
      cancelWindow: 0.5,
      poses: deepClone(SLAM_MOVE_POSES),
      sequence: [
        { poseKey: 'Windup', durMs: 400 },
        { poseKey: 'Charge', durMs: 400 },
        { poseKey: 'Slam', durMs: 160, strike: {} },
        { poseKey: 'Recoil', durMs: 200 }
      ]
    },
  },

  // === NEW: weapon definitions (bones + selective colliders) ===
  // Used by drawSkeleton() and getActiveColliders()/drawAttackColliders()
  weapons: {
    unarmed: {
      rig: {
        base: { anchor: 'rightWrist' },
        bones: [
          {
            id: 'weapon_0',
            length: 0, // zero length for unarmed
            angleOffsetDeg: 0,
            joint: { percent: 0.5 },
            haft: { start: 0.0, end: 0.0 },
            grips: [
              { id: 'primary', percent: 0.5, limb: 'right', offset: { ax: 0, ay: 0 } }
            ],
            colliders: []
          }
        ]
      },
      colliders: {},
      sprite: {
        url: '',
        anchorBone: 'weapon_0',
        anchorMode: 'start',
        alignDeg: 0,
        styleOverride: {}
      }
    },

    'dagger-swords': {
      rig: {
        base: { anchor: 'rightWrist' },
        bones: [
          {
            id: 'weapon_0',
            length: 42,
            angleOffsetDeg: -18,
            joint: { percent: 0.38 },
            haft: { start: 0.05, end: 0.45 },
            grips: [
              { id: 'primary', percent: 0.2, limb: 'right', offset: { ax: 0, ay: 0 } }
            ],
            colliders: [
              {
                id: 'colliderA',
                kind: 'box',
                width: 20,
                height: 60,
                from: 0.08,
                to: 1.0,
                activatesOn: ['STRIKE'],
                offset: { ax: 0.45, ay: 0, units: 'percent' }
              }
            ]
          },
          {
            id: 'weapon_1',
            length: 42,
            angleOffsetDeg: 18,
            joint: { percent: 0.38 },
            haft: { start: 0.05, end: 0.45 },
            anchor: 'leftWrist',
            limb: 'left',
            grips: [
              { id: 'secondary', percent: 0.2, limb: 'left', offset: { ax: 0, ay: 0 } }
            ],
            colliders: [
              {
                id: 'colliderB',
                kind: 'box',
                width: 20,
                height: 60,
                from: 0.08,
                to: 1.0,
                activatesOn: ['STRIKE'],
                offset: { ax: 0.45, ay: 0, units: 'percent' }
              }
            ]
          }
        ]
      },
      colliders: {
        colliderA: { shape: 'rect', width: 20, height: 60, offset: { x: 20, y: 0 }, activatesOn: ['STRIKE'] },
        colliderB: { shape: 'rect', width: 20, height: 60, offset: { x: 20, y: 0 }, activatesOn: ['STRIKE'] }
      }
    },

    sarrarru: {
      rig: {
        base: { anchor: 'rightWrist' },
        bones: [
          {
            id: 'weapon_0',
            length: 96,
            angleOffsetDeg: 0,
            joint: { percent: 0.22 },
            haft: { start: 0.0, end: 0.5 },
            grips: [
              { id: 'primary', percent: 0.75, limb: 'right', offset: { ax: 0, ay: 0 } },
              { id: 'secondary', percent: 0.35, limb: 'left', offset: { ax: 0, ay: 0 } }
            ],
            colliders: [
              {
                id: 'colliderA',
                kind: 'box',
                width: 26,
                height: 140,
                from: 0.08,
                to: 1.1,
                activatesOn: ['STRIKE'],
                offset: { ax: 0.9, ay: 0, units: 'percent' }
              }
            ]
          }
        ]
      },
      colliders: {
        colliderA: { shape: 'rect', width: 26, height: 140, offset: { x: 35, y: 0 }, activatesOn: ['STRIKE'] }
      },
      sprite: {
        url: './assets/weapons/sarrarru/citywatch_sarrarru.png',
        anchorBone: 'weapon_0',
        anchorMode: 'start',
        alignDeg: 270,
        styleOverride: {
          xformUnits: 'percent',
          widthFactor: { weapon_0: 1 },
          xform: {
            weapon_0: { ax: 0.25, ay: 0, scaleX: 0.25, scaleY: 0.15 }
          }
        }
      }
    },

    'light-greatblade': {
      rig: {
        base: { anchor: 'rightWrist' },
        bones: [
          {
            id: 'weapon_0',
            length: 88,
            angleOffsetDeg: 0,
            joint: { percent: 0.17 },
            haft: { start: 0.15, end: 0.75 },
            grips: [
              { id: 'primary', percent: 0.25, limb: 'right', offset: { ax: 0, ay: 0 } },
              { id: 'secondary', percent: 0.62, limb: 'left', offset: { ax: 0, ay: 0 } }
            ],
            colliders: [
              { id: 'blade', kind: 'box', width: 22, height: 110, from: 0.05, to: 1.0, activatesOn: ['SLASH', 'CHOP'], offset: { ax: 0.5, ay: 0, units: 'percent' } },
              { id: 'tip', kind: 'box', width: 18, height: 36, from: 0.8, to: 1.05, activatesOn: ['STAB'], offset: { ax: 0.9, ay: 0, units: 'percent' } }
            ]
          }
        ]
      },
      colliders: {
        rightA: { shape: 'rect', width: 22, height: 110, offset: { x: 45, y: 0 }, activatesOn: ['SLASH', 'CHOP'] },
        rightB: { shape: 'circle', radius: 16, offset: { x: 60, y: 0 }, activatesOn: ['STAB'] }
      }
    },

    greatclub: {
      rig: {
        base: { anchor: 'rightWrist' },
        bones: [
          {
            id: 'weapon_0',
            length: 82,
            angleOffsetDeg: 0,
            joint: { percent: 0.14 },
            haft: { start: 0.2, end: 0.78 },
            grips: [
              { id: 'primary', percent: 0.28, limb: 'right', offset: { ax: 0, ay: 0 } },
              { id: 'secondary', percent: 0.58, limb: 'left', offset: { ax: 0, ay: 0 } }
            ],
            colliders: [
              { id: 'clubA', kind: 'box', width: 28, height: 90, from: 0.2, to: 0.9, activatesOn: ['SMASH'], offset: { ax: 0.5, ay: 0, units: 'percent' } },
              { id: 'clubB', kind: 'box', width: 28, height: 110, from: 0.25, to: 1.0, activatesOn: ['SWING'], offset: { ax: 0.55, ay: 0, units: 'percent' } }
            ]
          }
        ]
      },
      colliders: {
        rightA: { shape: 'rect', width: 28, height: 90, offset: { x: 40, y: 0 }, activatesOn: ['SMASH'] },
        rightB: { shape: 'rect', width: 28, height: 110, offset: { x: 30, y: 0 }, activatesOn: ['SWING'] }
      }
    },

    hatchets: {
      rig: {
        base: { anchor: 'rightWrist' },
        bones: [
          {
            id: 'weapon_0',
            length: 46,
            angleOffsetDeg: -14,
            joint: { percent: 0.38 },
            haft: { start: 0.05, end: 0.45 },
            grips: [
              { id: 'primary', percent: 0.2, limb: 'right', offset: { ax: 0, ay: 0 } }
            ],
            colliders: [
              { id: 'rightA', kind: 'box', width: 18, height: 50, from: 0.1, to: 0.9, activatesOn: ['HACK'], offset: { ax: 0.45, ay: 0, units: 'percent' } },
              { id: 'rightB', kind: 'box', width: 20, height: 52, from: 0.55, to: 1.05, activatesOn: ['TOSS'], offset: { ax: 0.65, ay: -0.1, units: 'percent' } }
            ]
          },
          {
            id: 'weapon_1',
            length: 46,
            angleOffsetDeg: 14,
            joint: { percent: 0.38 },
            haft: { start: 0.05, end: 0.45 },
            anchor: 'leftWrist',
            limb: 'left',
            grips: [
              { id: 'secondary', percent: 0.2, limb: 'left', offset: { ax: 0, ay: 0 } }
            ],
            colliders: [
              { id: 'leftA', kind: 'box', width: 18, height: 50, from: 0.1, to: 0.9, activatesOn: ['HACK'], offset: { ax: 0.45, ay: 0, units: 'percent' } },
              { id: 'leftB', kind: 'box', width: 20, height: 52, from: 0.55, to: 1.05, activatesOn: ['TOSS'], offset: { ax: 0.65, ay: 0.1, units: 'percent' } }
            ]
          }
        ]
      },
      colliders: {
        rightA: { shape: 'rect', width: 18, height: 50, offset: { x: 20, y: 0 }, activatesOn: ['HACK'] },
        rightB: { shape: 'circle', radius: 18, offset: { x: 25, y: -5 }, activatesOn: ['TOSS'] },
        leftA: { shape: 'rect', width: 18, height: 50, offset: { x: 20, y: 0 }, activatesOn: ['HACK'] },
        leftB: { shape: 'circle', radius: 18, offset: { x: 25, y: 5 }, activatesOn: ['TOSS'] }
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
      slottedAbilities: ['combo_light', 'heavy_hold', 'quick_light', 'heavy_hold', 'quick_punch', 'evade_defensive'],
      stats: {
        strength: 12,
        agility: 11,
        endurance: 10,
        maxHealth: 110,
        maxStamina: 115
      },
      bodyColors: {
        A: { h: -40, s: -0.3, v: -0.5 },
        B: { h: -35, s: 0.2, v: 0 },
        C: { h: 32, s: 0.25, v: -0.05 }
      },
      appearance: {
        slots: {
          head_hair: {},
          facial_hair: {},
          eyes: { id: 'mao-ao_circled_eye_L', colors: ['B'] }
        }
      },
      cosmetics: {
        slots: {
          hat: { id: 'basic_headband', hsv: { h: -20, s: 0.2, v: 0 } },
          legs: { id: 'basic_pants', hsv: { h: 80, s: 1, v: 0.5 } }
        }
      }
    },
    enemy1: {
      fighter: 'Mao-ao_M',
      weapon: 'unarmed',
      slottedAbilities: ['combo_light', 'heavy_hold', 'quick_punch', 'heavy_hold', 'quick_light', 'evade_defensive'],
      stats: {
        strength: 5,
        agility: 4,
        endurance: 6,
        maxHealth: 120,
        maxStamina: 120
      },
      bodyColors: {
        A: { h: -90, s: -0.3, v: -0.3 },
        B: { h: -50, s: 0.2, v: 0.55 },
        C: { h: 72, s: 0.28, v: 0.12 }
      },
      appearance: {
        slots: {
          head_hair: { id: 'mao-ao_smooth_striped', colors: ['B'] },
          facial_hair: {},
          eyes: { id: 'mao-ao_circled_eyes', colors: ['B'] }
        }
      },
      cosmetics: {
        slots: {
          hat: { id: 'basic_headband', hsv: { h: 12, s: 0.1, v: 0.05 } },
          overwear: { id: 'layered_travel_cloak', hsv: { h: -10, s: -0.15, v: 100 } },
          legs: { id: 'basic_pants', hsv: { h: -120, s: 1, v: 0 } }
        }
      }
    },
    citywatch_sarrarru: {
      fighter: 'Mao-ao_M',
      weapon: 'sarrarru',
      slottedAbilities: ['combo_light', 'heavy_hold', 'quick_light', 'heavy_hold', 'quick_punch', 'evade_defensive'],
      stats: {
        strength: 8,
        agility: 6,
        endurance: 8,
        maxHealth: 140,
        maxStamina: 135
      },
      bodyColors: {
        A: { h: -82, s: -0.28, v: -0.28 },
        B: { h: -36, s: 0.22, v: 0.32 },
        C: { h: 64, s: 0.18, v: 0.08 }
      },
      appearance: {
        slots: {
          head_hair: { id: 'mao-ao_smooth_striped', colors: ['B'] },
          facial_hair: {},
          eyes: { id: 'mao-ao_circled_eye_L', colors: ['B'] }
        }
      },
      cosmetics: {
        slots: {
          hat: { id: 'citywatch_helmet', hsv: { ...MATERIALS.white_bronze } },
          overwear: { id: 'simple_poncho', hsv: { ...MATERIALS.city_heraldry_A } },
          legs: { id: 'basic_pants', hsv: { ...MATERIALS.city_heraldry_A } }
        }
      }
    },
    anuri: {
      fighter: 'Mao-ao_F',
      weapon: 'unarmed',
      slottedAbilities: ['combo_light', 'heavy_hold', 'quick_light', 'heavy_hold', 'quick_punch', 'evade_defensive'],
      stats: {
        strength: 11,
        agility: 11,
        endurance: 10,
        maxHealth: 115,
        maxStamina: 120
      },
      bodyColors: {
        A: { h: -40, s: -0.3, v: 0.25 },
        B: { h: -40, s: -0.3, v: -0.5 },
        C: { h: -6, s: 0.12, v: 0.05 }
      },
      appearance: {
        slots: {
          head_hair: { id: 'mao-ao_shoulder_length_drape', colors: ['A'] },
          facial_hair: {},
          eyes: { id: 'mao-ao_circled_eyes', colors: ['B'] }
        }
      },
      cosmetics: {
        slots: {
          hood: { id: 'anuri_hood', colors: ['A', 'B'] },
          overwear: { id: 'anuri_poncho', colors: ['A', 'B'] },
          legs: { id: 'basic_pants', hsl: { h: 150, s: 0.6, l: 0.28 } }
        }
      }
    }
  },

  characterTemplates: {
    citywatch_watchman: {
      label: 'City Watch Watchman',
      description: 'Standardized city watch guard template used for bounty spawns.',
      baseCharacter: 'citywatch_sarrarru',
      overrides: {
        fighter: { $kind: 'pool', items: ['Mao-ao_M'] },
        weapon: {
          $kind: 'pool',
          items: [
            { value: 'sarrarru', weight: 3 },
            { value: 'hatchets', weight: 1 },
            { value: 'greatclub', weight: 1 }
          ]
        },
        slottedAbilities: {
          $kind: 'pool',
          items: [
            ['combo_light', 'heavy_hold', 'quick_light', 'heavy_hold', 'quick_punch', 'evade_defensive'],
            ['combo_light', 'heavy_hold', 'quick_punch', 'heavy_hold', 'quick_light', 'evade_defensive'],
            ['combo_light', 'heavy_hold', 'quick_light', 'heavy_hold', 'quick_light', 'evade_defensive']
          ]
        },
        stats: {
          baseline: {
            $kind: 'rangePool',
            ranges: [
              { min: 9, max: 11, weight: 2, round: true },
              { min: 11, max: 12, weight: 1, round: true }
            ]
          },
          strength: {
            $kind: 'rangePool',
            ranges: [
              { min: 8, max: 11, weight: 2, round: true },
              { min: 11, max: 13, weight: 1, round: true }
            ]
          },
          agility: {
            $kind: 'rangePool',
            ranges: [
              { min: 6, max: 9, weight: 2, round: true },
              { min: 9, max: 11, weight: 1, round: true }
            ]
          },
          endurance: {
            $kind: 'rangePool',
            ranges: [
              { min: 7, max: 10, weight: 2, round: true },
              { min: 10, max: 12, weight: 1, round: true }
            ]
          }
        },
        bodyColors: {
          A: {
            $kind: 'playerBodyColor',
            channel: 'A',
            adjustments: {
              v: {
                $kind: 'rangePool',
                ranges: [
                  { min: -0.45, max: -0.25, weight: 2 },
                  { min: -0.25, max: -0.1, weight: 1 }
                ]
              }
            }
          },
          B: {
            $kind: 'playerBodyColor',
            channel: 'B',
            adjustments: {
              v: {
                $kind: 'rangePool',
                ranges: [
                  { min: -0.05, max: 0.2, weight: 2 },
                  { min: 0.2, max: 0.35, weight: 1 }
                ]
              }
            }
          }
        },
        cosmetics: {
          slots: {
            hat: { id: 'citywatch_helmet', hsv: { ...MATERIALS.white_bronze } },
            legs: {
              id: 'basic_pants',
              hsv: { ...MATERIALS.city_heraldry_A }
            },
            overwear: {
              $kind: 'pool',
              items: [
                { value: { id: 'simple_poncho', hsv: { ...MATERIALS.city_heraldry_A } }, weight: 2 },
                { value: { id: 'simple_poncho', hsv: { ...MATERIALS.city_heraldry_A } }, weight: 1 }
              ]
            }
          }
        }
      }
    }
  },

  // Add more characters or pools for randomization as needed

  weaponCombos: {},

  abilitySystem: {
    thresholds: { tapMaxMs: 200, chargeStageMs: 200 },
    defaults: { comboWindowMs: 3000 },
    attacks: {
      QuickKick: {
        preset: 'KICK',
        tags: ['quick', 'light'],
        sequence: ['KICK'],
        attackData: {
          damage: { health: 10 },
          staminaCost: 12,
          colliders: ['footR'],
          range: 80,
          dash: { velocity: 280, duration: 0.22 }
        }
      },
      QuickKickCombo: {
        preset: 'KICK',
        tags: ['quick', 'light', 'comboVariant'],
        sequence: ['KICK'],
        multipliers: { durations: 0.85, knockback: 1.35 },
        attackData: {
          damage: { health: 12 },
          staminaCost: 13,
          colliders: ['footR'],
          range: 80,
          dash: { velocity: 290, duration: 0.2 }
        }
      },
      QuickPunch: {
        preset: 'PUNCH',
        tags: ['quick', 'light'],
        sequence: ['PUNCH'],
        attackData: {
          damage: { health: 9 },
          staminaCost: 10,
          colliders: ['handR'],
          range: 65,
          dash: { velocity: 240, duration: 0.18 }
        }
      },
      QuickPunchCombo: {
        preset: 'PUNCH',
        tags: ['quick', 'light', 'comboVariant'],
        sequence: ['PUNCH'],
        multipliers: { durations: 0.85, knockback: 1.35 },
        attackData: {
          damage: { health: 11 },
          staminaCost: 11,
          colliders: ['handR'],
          range: 65,
          dash: { velocity: 250, duration: 0.16 }
        }
      },
      Slam: {
        preset: 'SLAM',
        tags: ['heavy'],
        sequence: ['SLAM'],
        multipliers: { durations: 1.1, knockback: 1.2 },
        attackData: {
          damage: { health: 22 },
          staminaCost: 28,
          colliders: ['handL', 'handR'],
          range: 75,
          dash: { velocity: 400, duration: 1.2 }
        }
      }
    },
    abilities: ensureAbilityLibrary(),
    slots: {
      A: {
        label: 'Primary Attack',
        light: 'combo_light',
        heavy: 'heavy_hold',
        allowed: {
          light: { triggers: ['combo', 'single'] },
          heavy: { triggers: ['hold-release', 'flurry'] }
        }
      },
      B: {
        label: 'Secondary Attack',
        light: 'quick_light',
        heavy: 'heavy_hold',
        allowed: {
          light: { triggers: ['single'] },
          heavy: { triggers: ['hold-release', 'flurry'] }
        }
      },
      C: {
        label: 'Utility',
        light: 'quick_punch',
        heavy: 'evade_defensive',
        allowed: {
          light: { triggers: ['single'] },
          heavy: { triggers: ['defensive'] }
        }
      }
    }
  }
}

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
    const sequence = Array.isArray(def.sequence) ? def.sequence : null;
    const normalizeEntry = (entry, index) => {
      let moveId = null;
      let limb = null;
      let startMs = null;
      let tags = null;
      let name = null;
      if (typeof entry === 'string') {
        moveId = entry;
      } else if (entry && typeof entry === 'object') {
        moveId = entry.move || entry.id || entry.preset || presetId;
        if (entry.limb) limb = entry.limb;
        if (Number.isFinite(entry.startMs)) startMs = entry.startMs;
        if (entry.tags) tags = deepClone(entry.tags);
        if (entry.name) name = entry.name;
      }
      if (!moveId) moveId = presetId;
      const normalizedMove = toPascalCase(moveId);
      const resolvedLimb = limb || determineDefaultLimb(moveId);
      const resolvedStart = Number.isFinite(startMs) ? startMs : index === 0 ? 0 : null;
      const result = {
        move: normalizedMove
      };
      if (resolvedLimb) result.limb = resolvedLimb;
      if (Number.isFinite(resolvedStart)) result.startMs = resolvedStart;
      if (tags) result.tags = tags;
      if (name) result.name = name;
      return result;
    };
    const moves = sequence && sequence.length > 0
      ? sequence.map((entry, index) => normalizeEntry(entry, index))
      : [normalizeEntry(presetId, 0)];
    const attack = {
      id: canonicalId,
      legacyId: attackId,
      name: canonicalId,
      primaryMove: moves[0]?.move || moveName,
      moves,
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
  flurry: 'flurry',
  defensive: 'defensive'
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
    if (def.defaultAttack) {
      ability.defaultAttack = toPascalCase(def.defaultAttack);
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
    if (def.defensive) ability.defensive = deepClone(def.defensive);
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
      },
      allowed: slotDef.allowed ? deepClone(slotDef.allowed) : null
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

  mergeAbilityManifests(window.CONFIG);
  ensureWeaponStances(window.CONFIG);
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
        combo: { steps: ['UnArCA1', 'UnArCA2', 'UnArCA3', 'UnArCA4'], interRecoil: { poseKey: 'Recoil', durMs: 120 } },
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

  try { document.dispatchEvent(new Event('config:ready')); } catch(_){}
};

// NPC Groups - Define spawn groups with multiple members
CONFIG.npcGroups = {
  city_guard_patrol: {
    name: 'City Watch Patrol',
    faction: 'citywatch',
    interests: ['patrol-point', 'gate', 'barracks'],
    exitTags: ['map-exit:left', 'map-exit:right'],
    exitWeights: { 'map-exit:left': 2, 'map-exit:right': 1 },
    members: [
      { templateId: 'citywatch_watchman', count: 3 }
    ],
    meta: { role: 'patrol' }
  }
};

  buildPresets();
})();
