(function registerUnarmedComboLight() {
  if (typeof window.registerAbility !== 'function') return;

  const ability = {
    name: 'Unarmed Combo',
    type: 'light',
    trigger: 'combo',
    tags: ['combo', 'light', 'unarmed'],
    sequence: ['UnArCA1', 'UnArCA2', 'UnArCA3', 'UnArCA4'],
    defaultAttack: 'UnArCA1',
    comboWindowMs: 3000,
    onHit: window.abilityKnockback?.(8)
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

    const buildKickPoses = () => ({
      Stance: baseStancePose(),
      Windup: {
        torso: -10,
        lShoulder: -100,
        lElbow: -120,
        rShoulder: -80,
        rElbow: -100,
        lHip: 130,
        lKnee: 90,
        rHip: 100,
        rKnee: 90,
        rootMoveVel: { x: 0, y: 0 },
        impulseMag: 0,
        impulseDirDeg: 0,
        allowAiming: true,
        aimLegs: true,
        aimRightLegOnly: true,
        anim_events: []
      },
      Strike: {
        torso: 120,
        lShoulder: -27,
        lElbow: 0,
        rShoulder: 90,
        rElbow: 0,
        lHip: 180,
        lKnee: 0,
        rHip: 110,
        rKnee: 20,
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
        anim_events: []
      },
      Recoil: {
        torso: 80,
        lShoulder: -27,
        lElbow: 0,
        rShoulder: 90,
        rElbow: 0,
        lHip: 180,
        lKnee: 0,
        rHip: 110,
        rKnee: 20,
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
        anim_events: []
      }
    });

    const buildPunchBase = () => ({
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

    const buildComboPunchPoses = ({ overlayId, overlayPose, durMs, priority }) => {
      const base = buildPunchBase();
      base.Strike = {
        torso: 10,
        lShoulder: base.Stance.lShoulder,
        lElbow: base.Stance.lElbow,
        rShoulder: base.Stance.rShoulder,
        rElbow: base.Stance.rElbow,
        lHip: 110,
        lKnee: 40,
        rHip: 30,
        rKnee: 40,
        rootMoveVel: { x: 0, y: 0, flip: false },
        impulseMag: 0,
        impulseDirDeg: 0,
        allowAiming: true,
        aimLegs: false,
        anim_events: [],
        layerOverrides: [
          {
            id: overlayId,
            pose: overlayPose,
            mask: [],
            durMs,
            delayMs: 0,
            priority
          }
        ]
      };
      return base;
    };

    const moves = {
      ComboKICK_S: {
        name: 'Combo Kick - Side',
        tags: ['light', 'combo'],
        inherits: 'KICK',
        durations: { toWindup: 380, toStrike: 110, toRecoil: 680, toStance: 0 },
        knockbackBase: 360,
        cancelWindow: 0.6,
        poses: buildKickPoses()
      },
      ComboKICK_F: {
        name: 'Combo Kick - Front',
        tags: ['light', 'combo'],
        inherits: 'KICK',
        durations: { toWindup: 380, toStrike: 110, toRecoil: 680, toStance: 0 },
        knockbackBase: 420,
        cancelWindow: 0.6,
        poses: buildKickPoses()
      },
      ComboPUNCH_R: {
        name: 'Combo Punch - Right',
        tags: ['light', 'combo'],
        durations: { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 },
        knockbackBase: 140,
        cancelWindow: 0.7,
        poses: buildComboPunchPoses({ overlayId: 'combo-right', overlayPose: { rShoulder: -230, rElbow: 0 }, durMs: 110, priority: 140 })
      },
      ComboPUNCH_L: {
        name: 'Combo Punch - Left',
        tags: ['light', 'combo'],
        durations: { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 },
        knockbackBase: 140,
        cancelWindow: 0.7,
        poses: buildComboPunchPoses({ overlayId: 'combo-left', overlayPose: { lShoulder: -230, lElbow: 0 }, durMs: 220, priority: 150 })
      }
    };

    const attacks = {
      UnArCA1: {
        preset: 'ComboPUNCH_R',
        name: 'Unarmed Combo A1',
        tags: ['combo', 'light', 'unarmed'],
        sequence: [
          { move: 'ComboPUNCH_R', startMs: 0 }
        ],
        attackData: {
          damage: { health: 6 },
          staminaCost: 12,
          colliders: ['handR'],
          range: 60,
          dash: { impulse: 520, duration: 0.18 }
        }
      },
      UnArCA2: {
        preset: 'ComboKICK_S',
        name: 'Unarmed Combo A2',
        tags: ['combo', 'light', 'unarmed'],
        sequence: [
          { move: 'ComboKICK_S', startMs: 0 }
        ],
        attackData: {
          damage: { health: 7 },
          staminaCost: 14,
          colliders: ['footR'],
          range: 75,
          dash: { impulse: 540, duration: 0.2 }
        }
      },
      UnArCA3: {
        preset: 'ComboPUNCH_L',
        name: 'Unarmed Combo A3',
        tags: ['combo', 'light', 'unarmed'],
        sequence: [
          { move: 'ComboPUNCH_L', startMs: 0 },
          { move: 'ComboPUNCH_R', startMs: 160 }
        ],
        attackData: {
          damage: { health: 9 },
          staminaCost: 16,
          colliders: ['handL', 'handR'],
          range: 60,
          dash: { impulse: 560, duration: 0.18 }
        }
      },
      UnArCA4: {
        preset: 'ComboKICK_F',
        name: 'Unarmed Combo A4',
        tags: ['combo', 'light', 'unarmed'],
        sequence: [
          { move: 'ComboKICK_F', startMs: 0 }
        ],
        attackData: {
          damage: { health: 10 },
          staminaCost: 18,
          colliders: ['footL'],
          range: 75,
          dash: { impulse: 580, duration: 0.2 }
        }
      }
    };

    const weaponCombos = {
      unarmed: {
        weapon: 'unarmed',
        name: 'Unarmed Combo',
        sequence: ['UnArCA1', 'UnArCA2', 'UnArCA3', 'UnArCA4'],
        comboWindowMs: 3000,
        multipliers: { durations: 1 },
        onHit: window.abilityKnockback?.(8),
        type: 'blunt'
      }
    };

    return { moves, attacks, weaponCombos };
  };

  window.registerAbility('unarmed_combo_light', ability, buildContent);
})();
