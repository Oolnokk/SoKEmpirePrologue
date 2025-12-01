(function registerQuickPunch() {
  if (typeof window.registerAbility !== 'function') return;
  window.registerAbility('quick_punch', {
    name: 'Quick Punch',
    type: 'light',
    trigger: 'single',
    tags: ['quick', 'light'],
    variants: [
      { id: 'postCombo', attack: 'QuickPunchCombo', require: { comboHitsGte: 4, comboActive: true } },
      { id: 'default', attack: 'QuickPunch' }
    ],
    multipliers: { durations: 1 },
    onHit: window.abilityKnockback?.(10),
  });
})();
