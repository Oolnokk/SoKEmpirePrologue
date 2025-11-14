// fighter-utils.js — Shared fighter type/config selection utilities
// Provides common functions for selecting and working with fighter type configurations

/**
 * Pick a fighter type configuration by name from CONFIG
 * Falls back to first available fighter type if name not found
 * @param {Object} C - CONFIG object
 * @param {string} name - Fighter type name
 * @returns {Object} Fighter type configuration object
 */
export function pickFighterTypeConfig(C, name) {
  const fighters = C.fighters || {};
  const fighter = fighters[name] || fighters[Object.keys(fighters)[0] || ''];
  return fighter || {};
}

/**
 * Pick the current fighter type name from GAME state or CONFIG
 * Priority: GAME.selectedFighter > TLETINGAN > first fighter type > 'default'
 * @param {Object} C - CONFIG object
 * @returns {string} Fighter type name
 */
export function pickFighterTypeName(C) {
  const G = window.GAME || {};

  // If selectedFighter is set and exists in config, use it
  if (G.selectedFighter && C.fighters?.[G.selectedFighter]) {
    return G.selectedFighter;
  }
  
  // Fallback to TLETINGAN if it exists
  if (C.fighters?.TLETINGAN) {
    return 'TLETINGAN';
  }

  // Fallback to first available fighter type
  const keys = Object.keys(C.fighters || {});
  return keys.length ? keys[0] : 'default';
}

/**
 * Get part lengths for a fighter type, applying scale factors
 * @param {Object} C - CONFIG object
 * @param {Object} fcfg - Fighter type-specific configuration
 * @returns {Object} Object with scaled part lengths
 */
export function lengths(C, fcfg) {
  const s = (C.actor?.scale ?? 1) * (fcfg.actor?.scale ?? 1);
  const P = C.parts || {};
  const Pf = fcfg.parts || {};
  
  return {
    torso: (Pf.torso?.len ?? P.torso?.len ?? 60) * s,
    armU: (Pf.arm?.upper ?? P.arm?.upper ?? 50) * s,
    armL: (Pf.arm?.lower ?? P.arm?.lower ?? 50) * s,
    legU: (Pf.leg?.upper ?? P.leg?.upper ?? 40) * s,
    legL: (Pf.leg?.lower ?? P.leg?.lower ?? 40) * s,
    hbW: (Pf.hitbox?.w ?? P.hitbox?.w ?? 120) * s,
    hbH: (Pf.hitbox?.h ?? P.hitbox?.h ?? 160) * s,
    hbR: (Pf.hitbox?.r ?? P.hitbox?.r ?? 60) * s,
    scale: s
  };
}

/**
 * Merge and pick offsets from config and fighter config
 * @param {Object} C - CONFIG object
 * @param {Object} fcfg - Fighter-specific configuration
 * @returns {Object} Merged offsets object
 */
export function pickOffsets(C, fcfg) {
  function deepMerge(a, b) {
    const o = {...(a || {})};
    for (const k in (b || {})) {
      o[k] = (typeof b[k] === 'object' && !Array.isArray(b[k])) 
        ? deepMerge(a?.[k], b[k]) 
        : b[k];
    }
    return o;
  }
  
  return deepMerge(C.offsets || {}, fcfg.offsets || {});
}
