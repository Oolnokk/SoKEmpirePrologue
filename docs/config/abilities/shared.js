(function initAbilityShared() {
  const abilityKnockback = window.abilityKnockback || function abilityKnockback(base, { clamp } = {}) {
    return (context, opponent) => {
      if (!opponent?.pos) return;
      const facing = context?.character?.facingRad ?? context?.character?.facing ?? 0;
      const dir = Math.cos(facing) >= 0 ? 1 : -1;
      const multiplier = context?.multipliers?.knockback ?? 1;
      let delta = base * multiplier * dir;
      if (Number.isFinite(clamp)) {
        delta = Math.max(-clamp, Math.min(clamp, delta));
      }
      opponent.pos.x += delta;
    };
  };

  window.abilityKnockback = abilityKnockback;
  window.ABILITY_LIBRARY = window.ABILITY_LIBRARY || {};
  window.ABILITY_MANIFESTS = window.ABILITY_MANIFESTS || [];

  window.registerAbility = function registerAbility(id, def, extras = {}) {
    if (id && def) {
      window.ABILITY_LIBRARY[id] = def;
    }

    const payload = typeof extras === 'function' ? extras : () => extras;
    window.ABILITY_MANIFESTS.push(payload);
  };
})();
