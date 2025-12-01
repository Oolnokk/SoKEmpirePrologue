(function registerComboLight() {
  if (typeof window.registerAbility !== 'function') return;
  window.registerAbility('combo_light', {
    name: 'Weapon Combo',
    type: 'light',
    trigger: 'combo',
    tags: ['combo', 'light'],
    comboFromWeapon: true,
    fallbackWeapon: 'unarmed',
    multipliers: { durations: 1 },
    onHit: window.abilityKnockback?.(8),
  });
})();
