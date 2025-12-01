// config-utils.js — Shared utility functions for accessing CONFIG data

/**
 * Get attack definition from CONFIG.abilitySystem.attacks
 * @param {string} attackId - The attack ID to look up
 * @returns {Object|null} The attack definition or null if not found
 */
export function getAttackDefFromConfig(attackId) {
  const C = window.CONFIG || {};
  const abilitySystem = C.abilitySystem || {};
  const attacks = abilitySystem.attacks || {};
  return attacks[attackId] || null;
}

/**
 * Get ability system thresholds from CONFIG
 * @returns {Object} The thresholds object with defaults
 */
export function getAbilityThresholds() {
  const C = window.CONFIG || {};
  const abilitySystem = C.abilitySystem || {};
  return {
    tapMaxMs: abilitySystem.thresholds?.tapMaxMs ?? 200,
    chargeStageMs: abilitySystem.thresholds?.chargeStageMs ?? 200,
  };
}

/**
 * Calculate minimum charge time from config thresholds.
 * This is computed as: (tapMaxMs + chargeStageMs) / 1000
 * - tapMaxMs: max duration for a tap input (before hold triggers)
 * - chargeStageMs: duration of one charge stage
 * @returns {number} Minimum charge time in seconds
 */
export function calculateMinChargeTime() {
  const thresholds = getAbilityThresholds();
  // Minimum charge = tap threshold + one stage (in seconds)
  return (thresholds.tapMaxMs + thresholds.chargeStageMs) / 1000;
}
