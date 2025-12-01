(function registerEvadeDefensive() {
  if (typeof window.registerAbility !== 'function') return;
  window.registerAbility('evade_defensive', {
    name: 'Evade',
    type: 'defensive',
    trigger: 'defensive',
    tags: ['defensive', 'mobility'],
    defensive: {
      poseKey: 'Stance',
      poseRefreshMs: 220,
      staminaDrainPerSecond: 40,
      minStaminaRatio: 0.6,
    },
  });
})();
