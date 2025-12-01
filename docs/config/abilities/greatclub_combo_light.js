(function registerGreatclubCombo() {
  if (typeof window.registerAbility !== 'function') return;

  const ability = {
    name: 'Greatclub Crush',
    type: 'light',
    trigger: 'combo',
    tags: ['combo', 'light', 'greatclub'],
    sequence: ['GrClCA1', 'GrClCA2', 'GrClCA3', 'GrClCA4'],
    defaultAttack: 'GrClCA1',
    comboWindowMs: 3000
  };

  const buildContent = () => {
    const clone = (value) => JSON.parse(JSON.stringify(value || {}));
    const slamDurations = { toWindup: 400, toStrike: 160, toRecoil: 200, toStance: 120 };

    const moves = {
      GrClCA1: { name: 'Greatclub Crush A1', tags: ['combo', 'light', 'greatclub'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      GrClCA2: { name: 'Greatclub Crush A2', tags: ['combo', 'light', 'greatclub'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      GrClCA3: { name: 'Greatclub Crush A3', tags: ['combo', 'light', 'greatclub'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) },
      GrClCA4: { name: 'Greatclub Crush A4', tags: ['combo', 'light', 'greatclub'], durations: clone(slamDurations), poses: clone(window.SLAM_MOVE_POSES || {}) }
    };

    const slamAttack = (id) => ({
      preset: id,
      tags: ['combo', 'light', 'greatclub'],
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
      GrClCA1: slamAttack('GrClCA1'),
      GrClCA2: slamAttack('GrClCA2'),
      GrClCA3: slamAttack('GrClCA3'),
      GrClCA4: slamAttack('GrClCA4')
    };

    const weaponCombos = {
      greatclub: {
        weapon: 'greatclub',
        name: 'Greatclub Crush',
        sequence: ['GrClCA1', 'GrClCA2', 'GrClCA3', 'GrClCA4'],
        comboWindowMs: 3000,
        type: 'blunt'
      }
    };

    return { moves, attacks, weaponCombos };
  };

  window.registerAbility('greatclub_combo_light', ability, buildContent);
})();
