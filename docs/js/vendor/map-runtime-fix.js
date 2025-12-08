// docs/js/vendor/map-runtime-fix.js
import * as _orig from './map-runtime.js';

// Re-export MapRegistry and any other named exports used by map-bootstrap
export const MapRegistry = _orig.MapRegistry;

export function convertLayoutToArea(layout = {}, options = {}) {
  try {
    if (typeof _orig.convertLayoutToArea === 'function') {
      return _orig.convertLayoutToArea(layout, options);
    }
  } catch (err) {
    console.warn('[map-runtime-fix] vendor convertLayoutToArea threw, falling back', err);
  }

  const areaId = options.areaId || layout.areaId || layout.id || 'fallback-area';
  const areaName = options.areaName || layout.areaName || layout.name || 'Fallback Area';

  // Determine playable bounds from layout.playableBounds or layout.distance
  let left, right;
  if (layout.playableBounds && Number.isFinite(Number(layout.playableBounds.left)) && Number.isFinite(Number(layout.playableBounds.right))) {
    left = Number(layout.playableBounds.left);
    right = Number(layout.playableBounds.right);
  } else if (Number.isFinite(Number(layout.distance))) {
    const half = Number(layout.distance) / 2;
    left = -half; right = half;
  } else {
    left = -600; right = 600;
  }

  const geometry = layout.geometry && typeof layout.geometry === 'object' && !Array.isArray(layout.geometry) ? layout.geometry : { layers: [], instances: [] };
  const instances = Array.isArray(geometry.instances) ? geometry.instances : [];

  // Colliders: include any provided colliders, and convert patrolPoints -> colliders
  const baseColliders = Array.isArray(layout.colliders) ? layout.colliders.slice() : [];
  if (Array.isArray(layout.patrolPoints)) {
    layout.patrolPoints.forEach((pt, idx) => {
      const id = pt.id || `patrol-${idx + 1}`;
      const width = Number.isFinite(Number(pt.width)) ? Number(pt.width) : 48;
      const x = Number.isFinite(Number(pt.x)) ? Number(pt.x) : (left + (right - left) * (idx + 1) / (layout.patrolPoints.length + 1));
      // topOffset is the vertical position of the collider (y coordinate from layout, or fallback to default ground level)
      const topOffset = Number.isFinite(Number(pt.y)) ? Number(pt.y) : (pt.topOffset ?? 420);
      baseColliders.push({
        id,
        label: pt.label || `Patrol ${idx + 1}`,
        left: x - width / 2,
        width,
        topOffset,
        height: Number.isFinite(Number(pt.height)) ? Number(pt.height) : 48,
        meta: Object.assign({}, pt.meta || {}, { patrol: true })
      });
    });
  }

  // Ensure a ground collider exists
  // Check for colliders marked as ground via meta.ground or label matching "ground"
  const hasGround = baseColliders.some(c => (c.label && /ground/i.test(c.label)) || (c.meta && c.meta.ground));
  if (!hasGround) {
    // Create a wide ground collider extending well beyond playable bounds
    // The multiplier of 4 ensures ground extends far enough for parallax layers
    const worldWidth = Math.max(Math.abs(left), Math.abs(right)) * 4;
    baseColliders.push({
      id: 'ground-1',
      label: 'Ground',
      left: left - worldWidth,
      width: worldWidth * 2,
      topOffset: layout.ground?.offset ?? 420,
      height: layout.ground?.height ?? 64,
      meta: { ground: true }
    });
  }

  const spawnPoints = Array.isArray(layout.spawnPoints) ? layout.spawnPoints.map((s, i) => ({
    id: s.id || `spawn-${i+1}`,
    x: Number.isFinite(Number(s.x)) ? Number(s.x) : (left + (right - left) * 0.5),
    y: Number.isFinite(Number(s.y)) ? Number(s.y) : (layout.ground?.offset ?? 420),
    prefab: s.prefab || s.type || s.prefabId || null,
    meta: s.meta || {}
  })) : [];

  const instancesOut = instances;
  const proximityScale = Number.isFinite(Number(layout.proximityScale)) ? Number(layout.proximityScale) : 1;

  const area = {
    id: areaId,
    name: areaName,
    source: layout.source || 'fallback-generated',
    meta: Object.assign({}, layout.meta || {}),
    playableBounds: { left, right },
    ground: Object.assign({}, layout.ground || { offset: 420 }),
    geometry: { layers: geometry.layers || [], instances: instancesOut },
    colliders: baseColliders,
    spawnPoints,
    proximityScale,
    warnings: [...(layout.warnings || []), 'Fallback area generated from minimal layout']
  };

  return area;
}
