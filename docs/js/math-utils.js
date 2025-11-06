// math-utils.js — Shared math utilities for bone/sprite calculations
// Provides common math functions used across render.js and sprites.js

// === COORDINATE SYSTEM & MATH BASIS ===
// This module uses a coordinate system where:
// - Zero angle (0 radians) points UP (negative Y direction in screen space)
// - Positive angles rotate CLOCKWISE
// - ALL joint angles MUST be in RADIANS

/**
 * Returns the zero angle convention used throughout the codebase
 * @returns {string} 'up' - indicating zero angle points upward
 */
export function angleZero() {
  return 'up';
}

/**
 * Computes basis vectors for a given angle
 * @param {number} ang - Angle in radians (0 = up, clockwise positive)
 * @returns {Object} Object with forward (fx, fy) and right (rx, ry) vectors
 */
export function basis(ang) {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return {
    fx: s,   // Forward X: sin(angle)
    fy: -c,  // Forward Y: -cos(angle)
    rx: c,   // Right X: cos(angle)
    ry: s    // Right Y: sin(angle)
  };
}

/**
 * Calculate segment end position given start point, length and angle
 * @param {number} x - Start X coordinate
 * @param {number} y - Start Y coordinate
 * @param {number} len - Segment length
 * @param {number} ang - Angle in radians
 * @returns {Array<number>} [endX, endY] coordinates
 */
export function segPos(x, y, len, ang) {
  const b = basis(ang);
  return [x + len * b.fx, y + len * b.fy];
}

/**
 * Apply anchor/axis offset to a position
 * @param {number} x - Base X coordinate
 * @param {number} y - Base Y coordinate
 * @param {number} ang - Angle in radians for local coordinate system
 * @param {number|Array|Object} ax - X offset (or offset object/array)
 * @param {number} ay - Y offset (if ax is a number)
 * @param {number|string} unitsLen - Length for percentage-based units
 * @returns {Array<number>} [x, y] adjusted coordinates
 */
export function withAX(x, y, ang, ax, ay, unitsLen) {
  // Handle different offset formats
  let axVal = 0;
  let ayVal = 0;
  let units = '';
  
  if (Array.isArray(ax)) {
    axVal = +ax[0] || 0;
    ayVal = +ax[1] || 0;
  } else if (typeof ax === 'object' && ax !== null) {
    axVal = +((ax.ax ?? ax.x) ?? 0) || 0;
    ayVal = +((ax.ay ?? ax.y) ?? 0) || 0;
    units = (ax.units || '').toString().toLowerCase();
  } else if (typeof ax === 'number') {
    axVal = ax || 0;
    ayVal = ay || 0;
    units = (typeof unitsLen === 'string') ? unitsLen.toLowerCase() : '';
  } else {
    return [x, y];
  }
  
  // Handle percentage-based units
  const L = (typeof unitsLen === 'number') ? Math.abs(unitsLen) : 1;
  if (units === 'percent' || units === '%' || units === 'pct') {
    axVal *= L;
    ayVal *= L;
  }
  
  // Apply offset in local coordinate system
  const b = basis(ang);
  const dx = axVal * b.fx + ayVal * b.rx;
  const dy = axVal * b.fy + ayVal * b.ry;
  
  return [x + dx, y + dy];
}

/**
 * Null-safe accessor for angle values, returns 0 if null/undefined
 * @param {number|null|undefined} v - Value to check
 * @returns {number} The value or 0 if null/undefined
 */
export function rad(v) {
  return v == null ? 0 : v;
}

/**
 * Calculate angle from delta coordinates (using "up" = 0 convention)
 * @param {number} dx - Delta X
 * @param {number} dy - Delta Y
 * @returns {number} Angle in radians
 */
export function angleFromDelta(dx, dy) {
  return Math.atan2(dx, -dy);
}

/**
 * Calculate distance between two points
 * @param {Array<number>} a - First point [x, y]
 * @param {Array<number>} b - Second point [x, y]
 * @returns {number} Distance
 */
export function dist(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Calculate angle between two points (using "up" = 0 convention)
 * @param {Array<number>} a - First point [x, y]
 * @param {Array<number>} b - Second point [x, y]
 * @returns {number} Angle in radians
 */
export function angle(a, b) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  return angleFromDelta(dx, dy);
}

/**
 * Convert degrees to radians
 * @param {number} deg - Angle in degrees
 * @returns {number} Angle in radians
 */
export function degToRad(deg) {
  return (deg || 0) * Math.PI / 180;
}

/**
 * Convert radians to degrees
 * @param {number} rad - Angle in radians
 * @returns {string} Angle in degrees, formatted to 2 decimal places
 */
export function radToDeg(rad) {
  return ((rad || 0) * 180 / Math.PI).toFixed(2);
}

// Export all functions to window for backwards compatibility
if (typeof window !== 'undefined') {
  window.ANGLE_ZERO = angleZero();
  window.BONE_BASIS = basis;
  window.BONE_SEG_POS = segPos;
  window.BONE_WITH_AX = withAX;
  window.BONE_ANGLE_FROM_DELTA = angleFromDelta;
}
