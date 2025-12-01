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
    const clone = (value) => JSON.parse(JSON.stringify(value || {}));
    const punchDurations = { toWindup: 380, toStrike: 110, toRecoil: 200, toStance: 120 };

    const moves = {
      SaRaCA1: { name: 'Spear Rhythm A1', tags: ['combo', 'light', 'sarrarru'], durations: clone(punchDurations), poses: clone(window.PUNCH_MOVE_POSES || {}) },
      SaRaCA2: { name: 'Spear Rhythm A2', tags: ['combo', 'light', 'sarrarru'], durations: clone(punchDurations), poses: clone(window.PUNCH_MOVE_POSES || {}) },
      SaRaCA3: { name: 'Spear Rhythm A3', tags: ['combo', 'light', 'sarrarru'], durations: clone(punchDurations), poses: clone(window.PUNCH_MOVE_POSES || {}) },
      SaRaCA4: { name: 'Spear Rhythm A4', tags: ['combo', 'light', 'sarrarru'], durations: clone(punchDurations), poses: clone(window.PUNCH_MOVE_POSES || {}) }
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
