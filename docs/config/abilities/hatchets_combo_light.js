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
    const baseStancePose = () => ({
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
    });

    const buildSlamPoses = () => ({
      Stance: baseStancePose(),
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
          { time: 0.0, velocityY: -680 },
          { time: 0.0, gravityScale: 0.35, gravityScaleDurationMs: 1200 }
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
          { time: 0.0, resetGravityScale: true },
          { time: 0.0, impulse: 520, aimRelative: true }
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
        anim_events: []
      }
    });

    const slamDurations = { toWindup: 400, toStrike: 160, toRecoil: 200, toStance: 120 };
    const RIGHT_ARM_MASK = ['rShoulder', 'rElbow', 'rWrist', 'rHand'];
    const LEFT_ARM_MASK = ['lShoulder', 'lElbow', 'lWrist', 'lHand'];

    const moves = {
      HaChCA1: { name: 'Hatchet Fury A1', tags: ['combo', 'light', 'hatchets'], durations: { ...slamDurations }, poses: buildSlamPoses() },
      HaChCA2: { name: 'Hatchet Fury A2', tags: ['combo', 'light', 'hatchets'], durations: { ...slamDurations }, poses: buildSlamPoses() },
      HaChCA3: { name: 'Hatchet Fury A3', tags: ['combo', 'light', 'hatchets'], durations: { ...slamDurations }, poses: buildSlamPoses() },
      HaChCA4: { name: 'Hatchet Fury A4', tags: ['combo', 'light', 'hatchets'], durations: { ...slamDurations }, poses: buildSlamPoses() }
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
