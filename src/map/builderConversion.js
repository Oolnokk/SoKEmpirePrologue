const SOURCE_ID = 'map-builder-layered-v15f';

/**
 * Convert a builder layout export into a runtime-friendly area descriptor.
 * The descriptor remains independent from the rest of the runtime so failures
 * in the map pipeline do not prevent other systems from functioning.
 */
export function convertLayoutToArea(layout, options = {}) {
  if (!layout || typeof layout !== 'object') {
    throw new TypeError('layout must be an object');
  }
  const {
    areaId = layout.areaId || layout.id || 'builder_area',
    areaName = layout.areaName || layout.name || areaId,
    layerImageResolver = () => null,
    prefabResolver = () => null,
  } = options;

  const layers = Array.isArray(layout.layers) ? layout.layers : [];
  const instances = Array.isArray(layout.instances) ? layout.instances : [];

  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));
  const slotCenters = computeLayerSlotCenters(instances);

  const convertedLayers = layers.map((layer, index) => ({
    id: layer.id || `layer_${index}`,
    name: layer.name || `Layer ${index + 1}`,
    type: layer.type || 'gameplay',
    parallaxSpeed: toNumber(layer.parallax, 1),
    scale: toNumber(layer.scale, 1),
    offsetY: toNumber(layer.yOffset, 0),
    separation: toNumber(layer.sep, 0),
    source: layerImageResolver(layer) || null,
    meta: {
      original: safeClone(layer),
    },
  }));

  const convertedInstances = instances.map((inst) => {
    const layer = layerMap.get(inst.layerId) || null;
    const separation = layer ? toNumber(layer.sep, 0) : 0;
    const center = slotCenters.get(inst.layerId) ?? (inst.slot ?? 0);
    const nudge = toNumber(inst.nudgeX, 0);
    const computedX = Number.isFinite(inst.x)
      ? inst.x
      : (toNumber(inst.slot, 0) - center) * separation + nudge;

    const prefab = prefabResolver(inst.prefabId);

    return {
      id: inst.id,
      prefabId: inst.prefabId,
      layerId: inst.layerId,
      position: {
        x: computedX,
        y: -toNumber(inst.offsetY, 0),
      },
      scale: {
        x: toNumber(inst.scaleX, 1),
        y: toNumber(inst.scaleY, inst.scaleX ?? 1),
      },
      rotationDeg: toNumber(inst.rot, 0),
      locked: !!inst.locked,
      prefab,
      meta: {
        original: safeClone(inst),
      },
    };
  });

  const warnings = [];
  if (!Array.isArray(layout.layers)) {
    warnings.push('layout.layers missing – produced area has zero parallax layers');
  }
  if (!Array.isArray(layout.instances)) {
    warnings.push('layout.instances missing – produced area has zero instances');
  }

  return {
    id: areaId,
    name: areaName,
    source: SOURCE_ID,
    camera: {
      startX: toNumber(layout.cameraStartX, 0),
      startZoom: toNumber(layout.zoomStart, 1),
    },
    ground: {
      offset: toNumber(layout.groundOffset, 0),
    },
    layers: convertedLayers,
    instances: convertedInstances,
    warnings,
    meta: {
      exportedAt: layout.meta?.exportedAt || null,
      raw: options.includeRaw ? safeClone(layout) : undefined,
    },
  };
}

export function convertLayouts(layouts, options = {}) {
  if (!Array.isArray(layouts)) {
    throw new TypeError('layouts must be an array');
  }
  const areas = {};
  layouts.forEach((layout) => {
    const area = convertLayoutToArea(layout, options);
    areas[area.id] = area;
  });
  return areas;
}

function computeLayerSlotCenters(instances) {
  const stats = new Map();
  for (const inst of instances) {
    const layerId = inst.layerId ?? '__unassigned__';
    const slot = toNumber(inst.slot, 0);
    const s = stats.get(layerId) || { min: slot, max: slot };
    s.min = Math.min(s.min, slot);
    s.max = Math.max(s.max, slot);
    stats.set(layerId, s);
  }
  const centers = new Map();
  for (const [layerId, { min, max }] of stats.entries()) {
    centers.set(layerId, (min + max) / 2);
  }
  return centers;
}

function toNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function safeClone(value) {
  if (!value || typeof value !== 'object') return value ?? null;
  try {
    return structuredClone(value);
  } catch (error) {
    return JSON.parse(JSON.stringify(value));
  }
}

export default convertLayoutToArea;
