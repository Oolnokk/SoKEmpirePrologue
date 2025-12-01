(function registerHeavyHold() {
  if (typeof window.registerAbility !== 'function') return;
  window.registerAbility('heavy_hold', {
    name: 'Charged Slam',
    type: 'heavy',
    trigger: 'hold-release',
    tags: ['heavy', 'hold'],
    attack: 'Slam',
    charge: {
      minStage: 1,
      maxStage: 5,
      stageDurationMs: 200,
      stageMultipliers: (stage) => ({
        durations: 1 + stage * 0.05,
        knockback: 1 + stage * 0.25,
      }),
    },
    onHit: window.abilityKnockback?.(14),
  });
})();
