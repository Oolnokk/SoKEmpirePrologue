// stat-hooks.js — shared helpers for deriving stat-driven gameplay adjustments

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function getStatEffectMultiplier(statKey) {
  if (typeof window === 'undefined') return 1;
  const statEffects = window.CONFIG?.balance?.statPointEffects;
  const value = statEffects?.[statKey];
  return Number.isFinite(value) ? Number(value) : 1;
}

function getStatEffectSignature() {
  if (typeof window === 'undefined') return 'default';
  const statEffects = window.CONFIG?.balance?.statPointEffects;
  if (!statEffects) return 'default';
  const strength = Number.isFinite(statEffects.strength) ? Number(statEffects.strength) : 1;
  const agility = Number.isFinite(statEffects.agility) ? Number(statEffects.agility) : 1;
  const endurance = Number.isFinite(statEffects.endurance) ? Number(statEffects.endurance) : 1;
  return `str:${strength}|agi:${agility}|end:${endurance}`;
}

function toNumber(value, fallback) {
  return Number.isFinite(value) ? Number(value) : fallback;
}

function cacheProfile(stats, profile) {
  if (!stats || typeof stats !== 'object') return profile;
  try {
    Object.defineProperty(stats, '__profileCache', {
      value: {
        baseline: toNumber(stats.baseline, 10),
        strength: toNumber(stats.strength, toNumber(stats.baseline, 10)),
        agility: toNumber(stats.agility, toNumber(stats.baseline, 10)),
        endurance: toNumber(stats.endurance, toNumber(stats.baseline, 10)),
        profile,
        signature: getStatEffectSignature(),
      },
      configurable: true,
      enumerable: false,
      writable: true,
    });
  } catch (_err) {
    // Ignore defineProperty failures (e.g., frozen objects)
  }
  return profile;
}

function reuseCachedProfile(stats) {
  if (!stats || typeof stats !== 'object') return null;
  const cached = stats.__profileCache;
  if (!cached) return null;
  const baseline = toNumber(stats.baseline, 10);
  const strength = toNumber(stats.strength, baseline);
  const agility = toNumber(stats.agility, baseline);
  const endurance = toNumber(stats.endurance, baseline);
  const signature = getStatEffectSignature();
  if (
    cached.baseline === baseline &&
    cached.strength === strength &&
    cached.agility === agility &&
    cached.endurance === endurance &&
    cached.signature === signature
  ) {
    return cached.profile;
  }
  return null;
}

export function computeStatProfile(rawStats = {}) {
  const baseline = toNumber(rawStats.baseline, 10);
  const strength = toNumber(rawStats.strength, baseline);
  const agility = toNumber(rawStats.agility, baseline);
  const endurance = toNumber(rawStats.endurance, baseline);

  const strengthDelta = (strength - baseline) * getStatEffectMultiplier('strength');
  const agilityDelta = (agility - baseline) * getStatEffectMultiplier('agility');
  const enduranceDelta = (endurance - baseline) * getStatEffectMultiplier('endurance');

  const strengthMultiplier = 1 + strengthDelta * 0.05;
  const staminaCostMultiplier = clamp(1 - agilityDelta * 0.04, 0.3, 1.75);

  const rawAnimationSpeed = clamp(1 + agilityDelta * 0.05, 0.6, 1.6);
  const animationSpeedMultiplier = rawAnimationSpeed;
  const animationDurationMultiplier = clamp(1 / rawAnimationSpeed, 0.6, 1.35);

  const movementSpeedMultiplier = clamp(1 + agilityDelta * 0.045, 0.55, 1.8);
  const dashSpeedMultiplier = clamp(1 + agilityDelta * 0.035, 0.6, 1.7);

  const enduranceMultiplier = 1 + enduranceDelta * 0.05;
  const staminaDrainRateMultiplier = 1 / Math.max(0.6, enduranceMultiplier);
  const staminaRegenRateMultiplier = Math.max(0.5, enduranceMultiplier);

  const agilityDashFactor = 1 + agilityDelta * 0.03;
  const dashStaminaThresholdMultiplier = 1 / Math.max(0.6, agilityDashFactor);

  const healthRegenPerSecond = clamp(2 + enduranceDelta * 0.6, 0, 12);

  const footingMitigationMultiplier = clamp(1 - enduranceDelta * 0.04, 0.4, 1.25);
  const footingRecoveryMultiplier = clamp(1 + enduranceDelta * 0.05, 0.5, 2);

  return {
    baseline,
    strength,
    agility,
    endurance,
    strengthMultiplier,
    staminaCostMultiplier,
    animationDurationMultiplier,
    animationSpeedMultiplier,
    movementSpeedMultiplier,
    dashSpeedMultiplier,
    staminaDrainRateMultiplier,
    staminaRegenRateMultiplier,
    dashStaminaThresholdMultiplier,
    healthRegenPerSecond,
    footingMitigationMultiplier,
    footingRecoveryMultiplier,
  };
}

export function getStatProfile(source) {
  if (!source) return computeStatProfile();
  if (source.statProfile) return source.statProfile;

  if (source.stats) {
    const cached = reuseCachedProfile(source.stats);
    if (cached) {
      source.statProfile ||= cached;
      return cached;
    }
    const profile = computeStatProfile(source.stats);
    if (source !== source.stats) source.statProfile = profile;
    cacheProfile(source.stats, profile);
    return profile;
  }

  if (source.baseline != null || source.strength != null || source.agility != null || source.endurance != null) {
    const cached = reuseCachedProfile(source);
    if (cached) return cached;
    const profile = computeStatProfile(source);
    cacheProfile(source, profile);
    return profile;
  }

  return computeStatProfile();
}

export function buildStatContextMultipliers(profile) {
  if (!profile) return null;
  const { animationDurationMultiplier } = profile;
  if (!Number.isFinite(animationDurationMultiplier) || Math.abs(animationDurationMultiplier - 1) < 0.001) {
    return null;
  }
  return {
    durations: animationDurationMultiplier,
    durationByPhase: {
      Windup: animationDurationMultiplier,
      Strike: animationDurationMultiplier,
      Recoil: animationDurationMultiplier,
    },
  };
}

export function getMovementMultipliers(profile) {
  if (!profile) return { accel: 1, maxSpeed: 1, dashSpeed: 1 };
  return {
    accel: Number.isFinite(profile.movementSpeedMultiplier) ? profile.movementSpeedMultiplier : 1,
    maxSpeed: Number.isFinite(profile.movementSpeedMultiplier) ? profile.movementSpeedMultiplier : 1,
    dashSpeed: Number.isFinite(profile.dashSpeedMultiplier) ? profile.dashSpeedMultiplier : 1,
  };
}

export function getFootingMitigation(profile) {
  if (!profile) return 1;
  return Number.isFinite(profile.footingMitigationMultiplier) ? profile.footingMitigationMultiplier : 1;
}

export function getFootingRecovery(profile) {
  if (!profile) return 1;
  return Number.isFinite(profile.footingRecoveryMultiplier) ? profile.footingRecoveryMultiplier : 1;
}

export function applyHealthRegenFromStats(fighter, dt, profile) {
  if (!fighter || !Number.isFinite(dt) || dt <= 0) return;
  const health = fighter.health;
  if (!health) return;
  const regenRate = Number.isFinite(health.regenRate)
    ? health.regenRate
    : Number.isFinite(profile?.healthRegenPerSecond)
      ? profile.healthRegenPerSecond
      : 0;
  if (regenRate <= 0) return;
  const max = Number.isFinite(health.max) ? health.max : Number.isFinite(health.current) ? health.current : 0;
  const current = Number.isFinite(health.current) ? health.current : max;
  if (current >= max) {
    health.current = Math.min(current, max);
    return;
  }
  const regenAmount = regenRate * dt;
  health.current = Math.min(max, current + regenAmount);
}

export function applyStaminaTick(fighter, dt) {
  if (!fighter || !Number.isFinite(dt) || dt <= 0) return;
  const stamina = fighter.stamina;
  if (!stamina) return;
  const max = Number.isFinite(stamina.max) ? stamina.max : 100;
  if (!Number.isFinite(stamina.min)) {
    stamina.min = -max;
  }
  const min = Number.isFinite(stamina.min) ? stamina.min : -max;
  const current = Number.isFinite(stamina.current) ? stamina.current : max;
  if (stamina.isDashing && current > min) {
    const drainRate = Number.isFinite(stamina.drainRate) ? stamina.drainRate : 40;
    const next = Math.max(min, current - drainRate * dt);
    stamina.current = next;
    if (next <= 0) {
      stamina.isDashing = false;
    }
  } else {
    const regenRate = Number.isFinite(stamina.regenRate) ? stamina.regenRate : 20;
    stamina.isDashing = false;
    if (current < 0) {
      const next = Math.min(0, current + regenRate * dt);
      stamina.current = next;
    } else {
      const next = Math.min(max, current + regenRate * dt);
      stamina.current = next;
    }
  }
  const exhausted = stamina.current < 0;
  stamina.exhausted = exhausted;
  const denom = Math.max(1, Math.abs(min));
  stamina.exhaustionRatio = exhausted ? Math.min(1, Math.abs(stamina.current) / denom) : 0;
}

function combineContributions(values = []) {
  let combined = 0;
  for (const raw of values) {
    if (!Number.isFinite(raw) || raw <= 0) continue;
    const value = clamp(raw, 0, 1);
    combined = combined + value - combined * value;
  }
  return clamp(combined, 0, 1);
}

function resolveStaminaBase(stamina) {
  if (!stamina) {
    return { base: 0, min: -100 };
  }
  const max = Number.isFinite(stamina.max) ? Math.max(1, stamina.max) : 100;
  const min = Number.isFinite(stamina.min) ? stamina.min : -max;
  const current = Number.isFinite(stamina.current) ? stamina.current : max;
  const exhaustedRatio = current < 0 ? Math.min(1, Math.abs(current) / Math.max(1, Math.abs(min))) : 0;
  return { base: clamp(exhaustedRatio, 0, 1), min };
}

export function computeRagdollBlendController(fighter, config) {
  if (!fighter) {
    return { ratio: 0, base: 0, contributions: {} };
  }

  const { base: exhaustionBase } = resolveStaminaBase(fighter.stamina);

  const contributions = {};

  const movementCfg = config?.movement || {};
  const maxSpeedX = Number.isFinite(movementCfg.maxSpeedX) ? Math.max(60, movementCfg.maxSpeedX) : 420;
  const velX = Number.isFinite(fighter.vel?.x) ? Math.abs(fighter.vel.x) : 0;
  const velRatio = maxSpeedX > 0 ? clamp(velX / (maxSpeedX * 1.2), 0, 1) : 0;
  const airBonus = fighter.onGround === false ? 0.2 : 0;
  contributions.movement = clamp(velRatio * 0.35 + airBonus, 0, 0.45);

  const attack = fighter.attack || null;
  if (attack?.active) {
    const phase = String(attack.currentPhase || '').toLowerCase();
    let weight = 0.25;
    if (phase.includes('strike')) {
      weight = 0.5;
    } else if (phase.includes('windup')) {
      weight = 0.35;
    } else if (phase.includes('recoil')) {
      weight = 0.32;
    }
    const pauseInfluence = Number.isFinite(attack.hitPause) ? clamp(attack.hitPause / 0.5, 0, 1) * 0.25 : 0;
    contributions.attack = clamp(weight + pauseInfluence, 0, 0.6);
  }

  const maxFooting = Number.isFinite(config?.knockback?.maxFooting) ? config.knockback.maxFooting : 100;
  if (maxFooting > 0) {
    const footing = Number.isFinite(fighter.footing) ? clamp(fighter.footing, 0, maxFooting) : maxFooting;
    const instability = 1 - footing / maxFooting;
    contributions.footing = clamp(instability * 0.5, 0, 0.5);
  }

  const combined = combineContributions(Object.values(contributions));
  const ratio = clamp(exhaustionBase + (1 - exhaustionBase) * combined, 0, 1);

  return { ratio, base: exhaustionBase, contributions };
}
