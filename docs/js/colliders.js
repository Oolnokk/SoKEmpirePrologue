// colliders.js — shared helpers for sampling limb collider positions without mutating bone data

import { basis as basisFor } from './math-utils.js?v=1';

const LIMB_SPECS = [
  { key: 'handL', boneKey: 'arm_L_lower' },
  { key: 'handR', boneKey: 'arm_R_lower' },
  { key: 'footL', boneKey: 'leg_L_lower' },
  { key: 'footR', boneKey: 'leg_R_lower' },
];

const DEFAULT_PERCEPTION = {
  visionRange: 220,
  visionSpreadRad: Math.PI * 0.6,
  hearingRadius: 180,
  visionOffsetY: -10,
};

function ensureStore() {
  const G = (typeof window !== 'undefined') ? (window.GAME ||= {}) : {};
  const store = (G.COLLIDERS ||= { perFighter: {} });
  store.perFighter ||= {};
  return store;
}

function clonePoint(point) {
  if (!point || typeof point !== 'object') return null;
  const x = Number.isFinite(point.x) ? point.x : 0;
  const y = Number.isFinite(point.y) ? point.y : 0;
  return { x, y };
}

function resolveBoneEnd(bone) {
  if (!bone) return null;
  if (Number.isFinite(bone.endX) && Number.isFinite(bone.endY)) {
    return { x: bone.endX, y: bone.endY };
  }
  if (!Number.isFinite(bone.x) || !Number.isFinite(bone.y)) {
    return null;
  }
  const len = Number.isFinite(bone.len) ? bone.len : 0;
  const ang = Number.isFinite(bone.ang) ? bone.ang : 0;
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
  if (point) {
    entry[key] = { x: point.x, y: point.y };
    entry[`${key}Radius`] = radius;
  } else {
    entry[key] = null;
    entry[`${key}Radius`] = null;
  }
}

function resolveActorScale(config = {}) {
  if (Number.isFinite(config.actor?.scale)) return config.actor.scale;
  if (Number.isFinite(config.scale)) return config.scale;
  return 1;
}

function resolveOrigin(point, offset = null) {
  const base = clonePoint(point) || { x: 0, y: 0 };
  if (!offset) return base;
  const dx = Number.isFinite(offset.x) ? offset.x : 0;
  const dy = Number.isFinite(offset.y) ? offset.y : 0;
  return { x: base.x + dx, y: base.y + dy };
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
    if (Number.isFinite(entry[`${spec.key}Radius`])) {
      clone[`${spec.key}Radius`] = entry[`${spec.key}Radius`];
    }
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

export function buildConeCollider({
  origin,
  facingRad = 0,
  range = DEFAULT_PERCEPTION.visionRange,
  spread = DEFAULT_PERCEPTION.visionSpreadRad,
  actorScale = 1,
  originOffset = null,
}) {
  const scaledRange = Math.max(0, range) * Math.max(actorScale, 0);
  const halfSpread = Math.max(0, spread) * 0.5;
  const pos = resolveOrigin(origin, originOffset);
  const angle = Number.isFinite(facingRad) ? (facingRad + Math.PI * 0.5) : 0;
  return {
    type: 'cone',
    origin: pos,
    angle,
    range: scaledRange,
    halfSpread,
  };
}

export function buildCircularCollider({
  center,
  radius = DEFAULT_PERCEPTION.hearingRadius,
  actorScale = 1,
  offset = null,
}) {
  const scaledRadius = Math.max(0, radius) * Math.max(actorScale, 0);
  return {
    type: 'circle',
    center: resolveOrigin(center, offset),
    radius: scaledRadius,
  };
}

export function resolveFighterPerceptionColliders(fighter, overrides = {}) {
  const config = { ...DEFAULT_PERCEPTION, ...overrides };
  const actorScale = resolveActorScale({ actor: fighter?.actor, scale: overrides.actorScale });
  const origin = fighter?.pos || fighter?.position || { x: 0, y: 0 };
  const facingRad = Number.isFinite(fighter?.facingRad) ? fighter.facingRad : 0;
  const vision = buildConeCollider({
    origin,
    facingRad,
    range: config.visionRange,
    spread: config.visionSpreadRad,
    actorScale,
    originOffset: { x: 0, y: config.visionOffsetY * actorScale },
  });
  const hearing = buildCircularCollider({
    center: origin,
    radius: config.hearingRadius,
    actorScale,
  });
  return { vision, hearing };
}

export function isPointInsideConeCollider(point, collider) {
  if (!point || !collider || collider.type !== 'cone') return false;
  const dx = point.x - (collider.origin?.x ?? 0);
  const dy = point.y - (collider.origin?.y ?? 0);
  const distanceSq = dx * dx + dy * dy;
  const rangeSq = (collider.range || 0) * (collider.range || 0);
  if (distanceSq > rangeSq) return false;
  const forward = basisFor(collider.angle || 0);
  const dot = (dx * forward.fx) + (dy * forward.fy);
  const len = Math.sqrt(distanceSq) || 1;
  const cosTheta = dot / len;
  const cosHalfSpread = Math.cos(collider.halfSpread || 0);
  return cosTheta >= cosHalfSpread;
}

export function isPointInsideCircularCollider(point, collider) {
  if (!point || !collider || collider.type !== 'circle') return false;
  const dx = point.x - (collider.center?.x ?? 0);
  const dy = point.y - (collider.center?.y ?? 0);
  const radius = Number.isFinite(collider.radius) ? collider.radius : 0;
  return dx * dx + dy * dy <= radius * radius;
}
