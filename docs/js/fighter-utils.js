// fighter-utils.js — Shared fighter/config selection utilities
// Provides common functions for selecting and working with fighter configurations

/**
 * Pick a fighter configuration by name from CONFIG
 * Falls back to first available fighter if name not found
 * @param {Object} C - CONFIG object
 * @param {string} name - Fighter name
 * @returns {Object} Fighter configuration object
 */
export function pickFighterConfig(C, name) {
  const fighters = C.fighters || {};
  const fighter = fighters[name] || fighters[Object.keys(fighters)[0] || ''];
  return fighter || {};
}

/**
 * Pick the current fighter name from GAME state or CONFIG
 * Priority: GAME.selectedFighter > TLETINGAN > first fighter > 'default'
 * @param {Object} C - CONFIG object
 * @returns {string} Fighter name
 */
export function pickFighterName(C) {
  const G = window.GAME || {};
  
  // If selectedFighter is set and exists in config, use it
  if (G.selectedFighter && C.fighters?.[G.selectedFighter]) {
    return G.selectedFighter;
  }
  
  // Fallback to TLETINGAN if it exists
  if (C.fighters?.TLETINGAN) {
    return 'TLETINGAN';
  }
  
  // Fallback to first available fighter
  const keys = Object.keys(C.fighters || {});
  return keys.length ? keys[0] : 'default';
}

export function normalizeBoneLengthKey(name) {
  if (name == null) return null;
  const raw = String(name).trim();
  if (!raw) return null;
  const colonIndex = raw.indexOf(':');
  if (colonIndex >= 0) {
    const prefix = raw.slice(0, colonIndex).replace(/[^a-z0-9]+/gi, '').toLowerCase();
    const suffix = raw.slice(colonIndex + 1).replace(/[^a-z0-9]+/gi, '').toLowerCase();
    if (!prefix && !suffix) return null;
    if (!prefix) return suffix ? `:${suffix}` : null;
    if (!suffix) return prefix;
    return `${prefix}:${suffix}`;
  }
  return raw
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .toLowerCase();
}

export function resolveBoneLengthScale(overrides, key, baseLength, fallbackKeys = []) {
  if (!overrides || typeof overrides !== 'object') return 1;
  
  // Avoid array allocations by checking key first, then fallbacks
  let entry = null;
  const normalizedKey = normalizeBoneLengthKey(key);
  if (normalizedKey && Object.prototype.hasOwnProperty.call(overrides, normalizedKey)) {
    entry = overrides[normalizedKey];
  }
  
  if (entry == null && fallbackKeys.length > 0) {
    for (let i = 0; i < fallbackKeys.length; i++) {
      const candidate = normalizeBoneLengthKey(fallbackKeys[i]);
      if (candidate && Object.prototype.hasOwnProperty.call(overrides, candidate)) {
        entry = overrides[candidate];
        break;
      }
    }
  }
  
  if (entry == null) return 1;

  if (typeof entry === 'number') {
    return Number.isFinite(entry) ? entry : 1;
  }
  if (!entry || typeof entry !== 'object') {
    return 1;
  }

  if (Number.isFinite(entry.scale)) {
    return entry.scale;
  }
  if (Number.isFinite(entry.multiplier)) {
    return entry.multiplier;
  }
  if (Number.isFinite(entry.value)) {
    return entry.value;
  }
  if (Number.isFinite(entry.length) || Number.isFinite(entry.len)) {
    const absolute = Number.isFinite(entry.length) ? entry.length : entry.len;
    if (!Number.isFinite(baseLength) || Math.abs(baseLength) < 1e-6) return 1;
    return absolute / baseLength;
  }
  return 1;
}

/**
 * Get part lengths for a fighter, applying scale factors
 * @param {Object} C - CONFIG object
 * @param {Object} fcfg - Fighter-specific configuration
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
