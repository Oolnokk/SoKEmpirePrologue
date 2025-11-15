// colliders.js — shared helpers for sampling limb collider positions without mutating bone data

import { basis as basisFor } from './math-utils.js?v=1';

const LIMB_SPECS = [
  { key: 'handL', boneKey: 'arm_L_lower' },
  { key: 'handR', boneKey: 'arm_R_lower' },
  { key: 'footL', boneKey: 'leg_L_lower' },
  { key: 'footR', boneKey: 'leg_R_lower' },
];

function ensureStore() {
  const G = (typeof window !== 'undefined') ? (window.GAME ||= {}) : {};
  const store = (G.COLLIDERS ||= { perFighter: {} });
  store.perFighter ||= {};
  return store;
}

function isValidPoint(point) {
  return !!point
    && typeof point === 'object'
    && Number.isFinite(point.x)
    && Number.isFinite(point.y);
}

function clonePoint(point) {
  if (!isValidPoint(point)) return null;
  return { x: point.x, y: point.y };
}

function resolveBoneEnd(bone) {
  if (!bone) return null;
  if (Number.isFinite(bone.endX) && Number.isFinite(bone.endY)) {
    return { x: bone.endX, y: bone.endY };
  }
  if (!Number.isFinite(bone.x) || !Number.isFinite(bone.y)) {
    return null;
  }
  if (!Number.isFinite(bone.len) || !Number.isFinite(bone.ang)) {
    return null;
  }
  const len = bone.len;
  const ang = bone.ang;
  const axis = basisFor(ang);
  return {
    x: bone.x + axis.fx * len,
    y: bone.y + axis.fy * len,
  };
}

function resolveRadius(key, config = {}) {
  const actorScale = Number.isFinite(config.actor?.scale) ? config.actor.scale : 1;
  const baseRadius = Math.max(4, 8 * actorScale);
  const handMult = Number.isFinite(config.colliders?.handMultiplier)
    ? config.colliders.handMultiplier
    : 2;
  const footMult = Number.isFinite(config.colliders?.footMultiplier)
    ? config.colliders.footMultiplier
    : 1;
  if (key === 'handL' || key === 'handR') {
    return baseRadius * handMult;
  }
  if (key === 'footL' || key === 'footR') {
    return baseRadius * footMult;
  }
  return baseRadius;
}

function writeCollider(entry, key, point, radius) {
  if (isValidPoint(point)) {
    entry[key] = { x: point.x, y: point.y };
    entry[`${key}Radius`] = Number.isFinite(radius) ? radius : null;
    return;
  }

  entry[key] = null;
  entry[`${key}Radius`] = null;
}

export function updateFighterColliders(fighterId, bones, options = {}) {
  if (!fighterId) return;
  const store = ensureStore();
  const entry = store.perFighter[fighterId] || (store.perFighter[fighterId] = {});
  const config = options.config || (typeof window !== 'undefined' ? window.CONFIG : {}) || {};
  const hitCenter = options.hitCenter || bones?.center || null;
  entry.hitCenter = hitCenter ? clonePoint(hitCenter) : null;
  for (const spec of LIMB_SPECS) {
    const bone = bones?.[spec.boneKey];
    const end = resolveBoneEnd(bone);
    const radius = end ? resolveRadius(spec.key, config) : null;
    writeCollider(entry, spec.key, end, radius);
  }
}

export function getFighterColliders(fighterId) {
  if (!fighterId) return null;
  const store = ensureStore();
  const entry = store.perFighter[fighterId];
  if (!entry) return null;
  const clone = { hitCenter: entry.hitCenter ? clonePoint(entry.hitCenter) : null };
  for (const spec of LIMB_SPECS) {
    clone[spec.key] = entry[spec.key] ? clonePoint(entry[spec.key]) : null;
    clone[`${spec.key}Radius`] = Number.isFinite(entry[`${spec.key}Radius`])
      ? entry[`${spec.key}Radius`]
      : null;
  }
  return clone;
}

export function pruneFighterColliders(activeIds = []) {
  const store = ensureStore();
  const keep = new Set(activeIds);
  Object.keys(store.perFighter).forEach((id) => {
    if (!keep.has(id)) {
      delete store.perFighter[id];
    }
  });
}
