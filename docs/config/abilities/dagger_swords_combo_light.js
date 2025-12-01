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

    const buildPunchPoses = () => ({
      Stance: baseStancePose(),
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
        anim_events: []
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
        anim_events: []
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

    const RIGHT_ARM_MASK = ['rShoulder', 'rElbow', 'rWrist', 'rHand'];
    const LEFT_ARM_MASK = ['lShoulder', 'lElbow', 'lWrist', 'lHand'];

    const punchDurations = { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 };
    const slamDurations = { toWindup: 400, toStrike: 160, toRecoil: 200, toStance: 120 };

    const moves = {
      DaSwCA1: {
        name: 'Dual Blade Flow A1',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: { ...punchDurations },
        poses: buildPunchPoses()
      },
      DaSwCA2: {
        name: 'Dual Blade Flow A2',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: { ...slamDurations },
        poses: buildSlamPoses()
      },
      DaSwCA3: {
        name: 'Dual Blade Flow A3',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: { ...punchDurations },
        poses: buildPunchPoses()
      },
      DaSwCA4: {
        name: 'Dual Blade Flow A4',
        tags: ['combo', 'light', 'dagger-swords'],
        durations: { ...slamDurations },
        poses: buildSlamPoses()
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
