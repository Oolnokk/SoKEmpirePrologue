import { composeStyleXformEntry } from './style-xform.js?v=1';

function toFiniteNumber(value){
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function normalizeXformSource(source){
  if (!source || typeof source !== 'object') return null;
  if (source.styleOverride && typeof source.styleOverride === 'object'){
    return source.styleOverride.xform || null;
  }
  if (source.xform && typeof source.xform === 'object') return source.xform;
  return source;
}

function mergeXformEntry(current, override){
  const baseScaleX = toFiniteNumber(current?.scaleMulX ?? current?.scaleX ?? 1);
  const baseScaleY = toFiniteNumber(current?.scaleMulY ?? current?.scaleY ?? 1);
  const baseAx = toFiniteNumber(current?.ax);
  const baseAy = toFiniteNumber(current?.ay);

  const base = {};
  if (baseScaleX != null) base.scaleX = baseScaleX;
  if (baseScaleY != null) base.scaleY = baseScaleY;
  if (baseAx != null) base.ax = baseAx;
  if (baseAy != null) base.ay = baseAy;

  const passthrough = ['rotDeg', 'rotRad', 'alignDeg', 'alignRad'];
  for (const key of passthrough){
    if (current?.[key] != null) base[key] = current[key];
  }

  const composed = composeStyleXformEntry(base, override);
  const next = {};
  const composedScaleX = toFiniteNumber(composed.scaleX);
  const composedScaleY = toFiniteNumber(composed.scaleY);
  const composedAx = toFiniteNumber(composed.ax);
  const composedAy = toFiniteNumber(composed.ay);

  if (composedScaleX != null) next.scaleMulX = composedScaleX;
  if (composedScaleY != null) next.scaleMulY = composedScaleY;
  if (composedAx != null) next.ax = composedAx;
  if (composedAy != null) next.ay = composedAy;

  for (const key of passthrough){
    if (composed?.[key] != null) next[key] = composed[key];
  }

  return next;
}

function applyXformSources(target, sources){
  for (const source of sources){
    const xform = normalizeXformSource(source);
    if (!xform || typeof xform !== 'object') continue;
    for (const [key, entry] of Object.entries(xform)){
      if (!entry || typeof entry !== 'object') continue;
      const prev = target[key] ? { ...target[key] } : {};
      const next = mergeXformEntry(prev, entry);
      if (Object.keys(next).length > 0){
        target[key] = next;
      }
    }
  }
}

export function composeStyleOverrides(baseTransforms, ...featureDeltas){
  const composedXform = {};
  const baseSources = Array.isArray(baseTransforms) ? baseTransforms : [baseTransforms];

  applyXformSources(composedXform, baseSources);
  applyXformSources(composedXform, featureDeltas);

  if (Object.keys(composedXform).length === 0) return null;

  return {
    xform: composedXform,
    composedFrom: {
      base: baseTransforms ?? null,
      deltas: featureDeltas.filter(Boolean)
    }
  };
}
