(function registerHatchetsCombo() {
  if (typeof window.registerAbility !== 'function') return;

  const ability = {
    name: 'Hatchet Fury',
    type: 'light',
    trigger: 'combo',
    tags: ['combo', 'light', 'hatchets'],
    sequence: ['HaChCA1', 'HaChCA2', 'HaChCA3', 'HaChCA4'],
    defaultAttack: 'HaChCA1',
    comboWindowMs: 2800
  };

  const buildContent = () => {
    const clone = (value) => JSON.parse(JSON.stringify(value || {}));
    const slamDurations = { toWindup: 400, toStrike: 160, toRecoil: 200, toStance: 120 };
    const RIGHT_ARM_MASK = ['rShoulder', 'rElbow', 'rWrist', 'rHand'];
    const LEFT_ARM_MASK = ['lShoulder', 'lElbow', 'lWrist', 'lHand'];

    const moves = {
      HaChCA1: { name: 'Hatchet Fury A1', tags: ['combo', 'light', 'hatchets'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      HaChCA2: { name: 'Hatchet Fury A2', tags: ['combo', 'light', 'hatchets'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      HaChCA3: { name: 'Hatchet Fury A3', tags: ['combo', 'light', 'hatchets'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      HaChCA4: { name: 'Hatchet Fury A4', tags: ['combo', 'light', 'hatchets'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) }
    };

    const slamAttack = (id, mask, colliders) => ({
      preset: id,
      tags: ['combo', 'light', 'hatchets'],
      sequence: [{ move: id, mask }],
      multipliers: { durations: 1.1, knockback: 1.2 },
      attackData: {
        damage: { health: 22 },
        staminaCost: 28,
        colliders,
        range: 75,
        dash: { velocity: 400, duration: 1.2 },
        useWeaponColliders: true
      }
    });

    const attacks = {
      HaChCA1: slamAttack('HaChCA1', RIGHT_ARM_MASK, ['handR']),
      HaChCA2: slamAttack('HaChCA2', LEFT_ARM_MASK, ['handL']),
      HaChCA3: slamAttack('HaChCA3', RIGHT_ARM_MASK, ['handR']),
      HaChCA4: slamAttack('HaChCA4', LEFT_ARM_MASK, ['handL'])
    };

    const weaponCombos = {
      hatchets: {
        weapon: 'hatchets',
        name: 'Hatchet Fury',
        sequence: ['HaChCA1', 'HaChCA2', 'HaChCA3', 'HaChCA4'],
        comboWindowMs: 2800,
        type: 'sharp'
      }
    };

    return { moves, attacks, weaponCombos };
  };

  window.registerAbility('hatchets_combo_light', ability, buildContent);
})();
