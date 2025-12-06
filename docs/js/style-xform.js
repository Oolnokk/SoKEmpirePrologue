// style-xform.js — Style transform composition utilities
//
// Provides composeStyleXformEntry for merging base and override xform specifications.
// Handles scale multipliers, absolute scales, and offset deltas with multiple alias support.
//
// Key semantics:
// - ax/ay values are preserved as-is (numeric or string)
// - Numeric values are "unitless" and interpreted based on xformUnits context
// - String values with units (e.g., "10px", "50%") carry explicit unit information
// - Empty or null overrides do not replace base values

function toFiniteNumber(value){
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function pickFirstFinite(values){
  if (!Array.isArray(values)) return null;
  for (const value of values){
    const num = toFiniteNumber(value);
    if (num != null) return num;
  }
  return null;
}

export function composeStyleXformEntry(baseEntry, overrideSpec){
  const base = (baseEntry && typeof baseEntry === 'object') ? { ...baseEntry } : {};
  if (!overrideSpec || typeof overrideSpec !== 'object') return base;

  const hasBaseScaleX = Number.isFinite(base.scaleX);
  const hasBaseScaleY = Number.isFinite(base.scaleY);
  let nextScaleX = hasBaseScaleX ? base.scaleX : 1;
  let nextScaleY = hasBaseScaleY ? base.scaleY : 1;
  let scaleChangedX = false;
  let scaleChangedY = false;

  const applyMultiplier = (value, axis) => {
    const mult = toFiniteNumber(value);
    if (mult == null) return;
    if (axis === 'x' || axis === 'both' || axis === 'xy'){
      nextScaleX *= mult;
      scaleChangedX = true;
    }
    if (axis === 'y' || axis === 'both' || axis === 'xy'){
      nextScaleY *= mult;
      scaleChangedY = true;
    }
  };

  applyMultiplier(overrideSpec.scaleMul ?? overrideSpec.mul ?? overrideSpec.scaleMultiplier, 'both');
  applyMultiplier(overrideSpec.scaleMulX ?? overrideSpec.scaleXMul ?? overrideSpec.scaleXMultiplier, 'x');
  applyMultiplier(overrideSpec.scaleMulY ?? overrideSpec.scaleYMul ?? overrideSpec.scaleYMultiplier, 'y');

  const overrideScaleX = toFiniteNumber(overrideSpec.scaleX);
  if (overrideScaleX != null){
    nextScaleX = overrideScaleX;
    scaleChangedX = true;
  }
  const overrideScaleY = toFiniteNumber(overrideSpec.scaleY);
  if (overrideScaleY != null){
    nextScaleY = overrideScaleY;
    scaleChangedY = true;
  }

  if (scaleChangedX){
    base.scaleX = nextScaleX;
  }
  if (scaleChangedY){
    base.scaleY = nextScaleY;
  }

  const baseAx = Number.isFinite(base.ax) ? base.ax : 0;
  const baseAy = Number.isFinite(base.ay) ? base.ay : 0;

  const axDelta = pickFirstFinite([
    overrideSpec.axDelta,
    overrideSpec.deltaAx,
    overrideSpec.axOffset,
    overrideSpec.offsetAx,
    overrideSpec.axAdd,
    overrideSpec.addAx,
    overrideSpec.axTranslate,
    overrideSpec.translateAx,
    overrideSpec.dx,
    overrideSpec.offset?.axDelta,
    overrideSpec.offset?.deltaAx,
    overrideSpec.offset?.axOffset,
    overrideSpec.offset?.dx,
  ]);
  if (axDelta != null){
    base.ax = baseAx + axDelta;
  } else {
    const absAx = toFiniteNumber(overrideSpec.ax ?? overrideSpec.offset?.ax ?? overrideSpec.offset?.x);
    if (absAx != null){
      base.ax = absAx;
    }
  }

  const ayDelta = pickFirstFinite([
    overrideSpec.ayDelta,
    overrideSpec.deltaAy,
    overrideSpec.ayOffset,
    overrideSpec.offsetAy,
    overrideSpec.ayAdd,
    overrideSpec.addAy,
    overrideSpec.ayTranslate,
    overrideSpec.translateAy,
    overrideSpec.dy,
    overrideSpec.offset?.ayDelta,
    overrideSpec.offset?.deltaAy,
    overrideSpec.offset?.ayOffset,
    overrideSpec.offset?.dy,
  ]);
  if (ayDelta != null){
    base.ay = baseAy + ayDelta;
  } else {
    const absAy = toFiniteNumber(overrideSpec.ay ?? overrideSpec.offset?.ay ?? overrideSpec.offset?.y);
    if (absAy != null){
      base.ay = absAy;
    }
  }

  const passthroughKeys = ['rotDeg', 'rotRad', 'alignDeg', 'alignRad'];
  for (const key of passthroughKeys){
    if (base[key] == null && overrideSpec[key] != null){
      base[key] = overrideSpec[key];
    }
  }

  return base;
}
