(function registerQuickLight() {
  if (typeof window.registerAbility !== 'function') return;
  window.registerAbility('quick_light', {
    name: 'Quick Kick',
    type: 'light',
    trigger: 'single',
    tags: ['quick', 'light'],
    variants: [
      { id: 'postCombo', attack: 'QuickKickCombo', require: { comboHitsGte: 4, comboActive: true } },
      { id: 'default', attack: 'QuickKick' }
    ],
    multipliers: { durations: 1 },
    onHit: window.abilityKnockback?.(10),
  });
})();
