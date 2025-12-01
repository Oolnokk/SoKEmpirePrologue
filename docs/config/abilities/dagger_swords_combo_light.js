(function registerDaggerSwordsCombo() {
  if (typeof window.registerAbility !== 'function') return;

  const ability = {
    name: 'Dual Blade Flow',
    type: 'light',
    trigger: 'combo',
    tags: ['combo', 'light', 'dagger-swords'],
    sequence: ['DaSwCA1', 'DaSwCA2', 'DaSwCA3', 'DaSwCA4'],
    defaultAttack: 'DaSwCA1',
    comboWindowMs: 2500
  };

  const buildContent = () => {
    const clone = (value) => JSON.parse(JSON.stringify(value || {}));
    const RIGHT_ARM_MASK = ['rShoulder', 'rElbow', 'rWrist', 'rHand'];
    const LEFT_ARM_MASK = ['lShoulder', 'lElbow', 'lWrist', 'lHand'];

    const punchDurations = { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 };
    const slamDurations = { toWindup: 400, toStrike: 160, toRecoil: 200, toStance: 120 };

    const moves = {
      DaSwCA1: {
        name: 'Dual Blade Flow A1',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: clone(punchDurations),
        poses: clone(window.PUNCH_MOVE_POSES || {})
      },
      DaSwCA2: {
        name: 'Dual Blade Flow A2',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: clone(slamDurations),
        poses: clone(window.SLAM_MOVE_POSES || {})
      },
      DaSwCA3: {
        name: 'Dual Blade Flow A3',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: clone(punchDurations),
        poses: clone(window.PUNCH_MOVE_POSES || {})
      },
      DaSwCA4: {
        name: 'Dual Blade Flow A4',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: clone(slamDurations),
        poses: clone(window.SLAM_MOVE_POSES || {})
      }
    };

    const punchAttack = (id, mask, colliders) => ({
      preset: id,
      tags: ['combo', 'light', 'dagger-swords'],
      sequence: [{ move: id, mask }],
      attackData: {
        damage: { health: 9 },
        staminaCost: 10,
        colliders,
        range: 65,
        dash: { velocity: 240, duration: 0.18 },
        useWeaponColliders: true
      }
    });

    const slamAttack = (id, mask, colliders) => ({
      preset: id,
      tags: ['combo', 'light', 'dagger-swords'],
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
      DaSwCA1: punchAttack('DaSwCA1', RIGHT_ARM_MASK, ['handR']),
      DaSwCA2: slamAttack('DaSwCA2', LEFT_ARM_MASK, ['handL']),
      DaSwCA3: punchAttack('DaSwCA3', RIGHT_ARM_MASK, ['handR']),
      DaSwCA4: slamAttack('DaSwCA4', LEFT_ARM_MASK, ['handL'])
    };

    const weaponCombos = {
      'dagger-swords': {
        weapon: 'dagger-swords',
        name: 'Dual Blade Flow',
        sequence: ['DaSwCA1', 'DaSwCA2', 'DaSwCA3', 'DaSwCA4'],
        comboWindowMs: 2500,
        type: 'sharp'
      }
    };

    return { moves, attacks, weaponCombos };
  };

  window.registerAbility('dagger_swords_combo_light', ability, buildContent);
})();
