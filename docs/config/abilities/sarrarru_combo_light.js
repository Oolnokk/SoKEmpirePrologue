(function registerSarrarruCombo() {
  if (typeof window.registerAbility !== 'function') return;

  const ability = {
    name: 'Spear Rhythm',
    type: 'light',
    trigger: 'combo',
    tags: ['combo', 'light', 'sarrarru'],
    sequence: ['SaRaCA1', 'SaRaCA2', 'SaRaCA3', 'SaRaCA4'],
    defaultAttack: 'SaRaCA1',
    comboWindowMs: 3500
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

    const punchDurations = { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 };

    const moves = {
      SaRaCA1: { name: 'Spear Rhythm A1', tags: ['combo', 'light', 'sarrarru'], durations: { ...punchDurations }, poses: buildPunchPoses() },
      SaRaCA2: { name: 'Spear Rhythm A2', tags: ['combo', 'light', 'sarrarru'], durations: { ...punchDurations }, poses: buildPunchPoses() },
      SaRaCA3: { name: 'Spear Rhythm A3', tags: ['combo', 'light', 'sarrarru'], durations: { ...punchDurations }, poses: buildPunchPoses() },
      SaRaCA4: { name: 'Spear Rhythm A4', tags: ['combo', 'light', 'sarrarru'], durations: { ...punchDurations }, poses: buildPunchPoses() }
    };

    const attacks = {
      SaRaCA1: {
        preset: 'SaRaCA1',
        tags: ['combo', 'light', 'sarrarru'],
        sequence: [{ move: 'SaRaCA1' }],
        attackData: {
          damage: { health: 18 },
          staminaCost: 16,
          useWeaponColliders: true,
          range: 95,
          dash: { impulse: 520, duration: 0.18 }
        }
      },
      SaRaCA2: {
        preset: 'SaRaCA2',
        tags: ['combo', 'light', 'sarrarru'],
        sequence: [{ move: 'SaRaCA2' }],
        attackData: {
          damage: { health: 20 },
          staminaCost: 18,
          useWeaponColliders: true,
          range: 100,
          dash: { impulse: 540, duration: 0.2 }
        }
      },
      SaRaCA3: {
        preset: 'SaRaCA3',
        tags: ['combo', 'light', 'sarrarru'],
        sequence: [{ move: 'SaRaCA3' }],
        attackData: {
          damage: { health: 22 },
          staminaCost: 20,
          useWeaponColliders: true,
          range: 105,
          dash: { impulse: 560, duration: 0.18 }
        }
      },
      SaRaCA4: {
        preset: 'SaRaCA4',
        tags: ['combo', 'light', 'sarrarru'],
        sequence: [{ move: 'SaRaCA4' }],
        attackData: {
          damage: { health: 24 },
          staminaCost: 22,
          useWeaponColliders: true,
          range: 110,
          dash: { impulse: 580, duration: 0.2 }
        }
      }
    };

    const weaponCombos = {
      sarrarru: {
        weapon: 'sarrarru',
        name: 'Spear Rhythm',
        sequence: ['SaRaCA1', 'SaRaCA2', 'SaRaCA3', 'SaRaCA4'],
        comboWindowMs: 3500,
        type: 'sharp'
      }
    };

    return { moves, attacks, weaponCombos };
  };

  window.registerAbility('sarrarru_combo_light', ability, buildContent);
})();
