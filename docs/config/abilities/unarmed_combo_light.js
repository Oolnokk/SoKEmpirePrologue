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
    const clone = (value) => JSON.parse(JSON.stringify(value || {}));

    const moves = {
      ComboKICK_S: {
        name: 'Combo Kick - Side',
        tags: ['light', 'combo'],
        inherits: 'KICK',
        durations: { toWindup: 380, toStrike: 110, toRecoil: 680, toStance: 0 },
        knockbackBase: 360,
        cancelWindow: 0.6,
        poses: clone(window.KICK_MOVE_POSES || {})
      },
      ComboKICK_F: {
        name: 'Combo Kick - Front',
        tags: ['light', 'combo'],
        inherits: 'KICK',
        durations: { toWindup: 380, toStrike: 110, toRecoil: 680, toStance: 0 },
        knockbackBase: 420,
        cancelWindow: 0.6,
        poses: clone(window.KICK_MOVE_POSES || {})
      },
      ComboPUNCH_R: {
        name: 'Combo Punch - Right',
        tags: ['light', 'combo'],
        durations: { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 },
        knockbackBase: 140,
        cancelWindow: 0.7,
        poses: (() => {
          const base = clone(window.PUNCH_MOVE_POSES || {});
          const strikeBase = clone(window.PUNCH_MOVE_POSES?.Strike || {});
          const stanceArms = clone(window.PUNCH_MOVE_POSES?.Stance || {});
          strikeBase.lShoulder = stanceArms.lShoulder;
          strikeBase.lElbow = stanceArms.lElbow;
          strikeBase.rShoulder = stanceArms.rShoulder;
          strikeBase.rElbow = stanceArms.rElbow;
          strikeBase.layerOverrides = [
            {
              id: 'combo-right',
              pose: {
                rShoulder: window.PUNCH_MOVE_POSES?.Strike?.rShoulder,
                rElbow: window.PUNCH_MOVE_POSES?.Strike?.rElbow
              },
              mask: [],
              durMs: 110,
              delayMs: 0,
              priority: 140
            }
          ];
          base.Strike = strikeBase;
          return base;
        })()
      },
      ComboPUNCH_L: {
        name: 'Combo Punch - Left',
        tags: ['light', 'combo'],
        durations: { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 },
        knockbackBase: 140,
        cancelWindow: 0.7,
        poses: (() => {
          const base = clone(window.PUNCH_MOVE_POSES || {});
          const strikeBase = clone(window.PUNCH_MOVE_POSES?.Strike || {});
          const stanceArms = clone(window.PUNCH_MOVE_POSES?.Stance || {});
          strikeBase.lShoulder = stanceArms.lShoulder;
          strikeBase.lElbow = stanceArms.lElbow;
          strikeBase.rShoulder = stanceArms.rShoulder;
          strikeBase.rElbow = stanceArms.rElbow;
          strikeBase.layerOverrides = [
            {
              id: 'combo-left',
              pose: {
                lShoulder: window.PUNCH_MOVE_POSES?.Strike?.lShoulder,
                lElbow: window.PUNCH_MOVE_POSES?.Strike?.lElbow
              },
              mask: [],
              durMs: 220,
              delayMs: 0,
              priority: 150
            }
          ];
          base.Strike = strikeBase;
          return base;
        })()
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
