(function registerLightGreatbladeCombo() {
  if (typeof window.registerAbility !== 'function') return;

  const ability = {
    name: 'Greatblade Cascade',
    type: 'light',
    trigger: 'combo',
    tags: ['combo', 'light', 'light-greatblade'],
    sequence: ['LiGrCA1', 'LiGrCA2', 'LiGrCA3', 'LiGrCA4'],
    defaultAttack: 'LiGrCA1',
    comboWindowMs: 4000
  };

  const buildContent = () => {
    const clone = (value) => JSON.parse(JSON.stringify(value || {}));
    const slamDurations = { toWindup: 400, toStrike: 160, toRecoil: 200, toStance: 120 };

    const moves = {
      LiGrCA1: { name: 'Greatblade Cascade A1', tags: ['combo', 'light', 'light-greatblade'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      LiGrCA2: { name: 'Greatblade Cascade A2', tags: ['combo', 'light', 'light-greatblade'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      LiGrCA3: { name: 'Greatblade Cascade A3', tags: ['combo', 'light', 'light-greatblade'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      LiGrCA4: { name: 'Greatblade Cascade A4', tags: ['combo', 'light', 'light-greatblade'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) }
    };

    const slamAttack = (id) => ({
      preset: id,
      tags: ['combo', 'light', 'light-greatblade'],
      sequence: [{ move: id }],
      multipliers: { durations: 1.1, knockback: 1.2 },
      attackData: {
        damage: { health: 22 },
        staminaCost: 28,
        colliders: ['handL', 'handR'],
        range: 75,
        dash: { velocity: 400, duration: 1.2 },
        useWeaponColliders: true
      }
    });

    const attacks = {
      LiGrCA1: slamAttack('LiGrCA1'),
      LiGrCA2: slamAttack('LiGrCA2'),
      LiGrCA3: slamAttack('LiGrCA3'),
      LiGrCA4: slamAttack('LiGrCA4')
    };

    const weaponCombos = {
      'light-greatblade': {
        weapon: 'light-greatblade',
        name: 'Greatblade Cascade',
        sequence: ['LiGrCA1', 'LiGrCA2', 'LiGrCA3', 'LiGrCA4'],
        comboWindowMs: 4000,
        type: 'sharp'
      }
    };

    return { moves, attacks, weaponCombos };
  };

  window.registerAbility('light_greatblade_combo_light', ability, buildContent);
})();
