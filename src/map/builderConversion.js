const SOURCE_ID = 'map-builder-layered-v15f';

const FALLBACK_BOX_MIN_WIDTH = 18;

function normalizeErrorInfo(raw) {
  if (!raw) {
    return { code: null, message: null };
  }

  if (typeof raw === 'string') {
    const text = raw.trim();
    return { code: text || null, message: text || null };
  }

  if (raw instanceof Error) {
    const code = typeof raw.code === 'string' && raw.code.trim()
      ? raw.code.trim()
      : typeof raw.name === 'string' && raw.name.trim()
        ? raw.name.trim()
        : null;
    return {
      code,
      message: typeof raw.message === 'string' && raw.message.trim() ? raw.message.trim() : null,
    };
  }

  const record = typeof raw === 'object' ? raw : {};
  const innerError = record && typeof record.error === 'object' ? record.error : null;

  const codeCandidates = [
    record.code,
    record.errorCode,
    record.statusCode,
    record.status,
    record.type,
    innerError?.code,
    innerError?.status,
    innerError?.name,
  ];
  let code = null;
  for (const candidate of codeCandidates) {
    if (candidate == null) continue;
    const text = String(candidate).trim();
    if (text) {
      code = text.slice(0, 32);
      break;
    }
  }

  const messageCandidates = [
    record.message,
    record.errorMessage,
    record.reason,
    record.detail,
    record.details,
    innerError?.message,
  ];
  let message = null;
  for (const candidate of messageCandidates) {
    if (candidate == null) continue;
    const value = typeof candidate === 'string'
      ? candidate
      : candidate instanceof Error && typeof candidate.message === 'string'
        ? candidate.message
        : String(candidate);
    const text = value.trim();
    if (text) {
      message = text.slice(0, 140);
      break;
    }
  }

  return { code, message };
}

function sanitizeBoxLine(text) {
  if (text == null) return '';
  return String(text)
    .replace(/[\r\n]+/g, ' ')
    .replace(/[^\x20-\x7e]+/g, '?')
    .trim();
}

function createAsciiBox(lines) {
  const sanitized = lines.map((line) => sanitizeBoxLine(line));
  const innerWidth = Math.max(
    FALLBACK_BOX_MIN_WIDTH,
    ...sanitized.map((line) => line.length),
  );
  const horizontal = `+${'-'.repeat(innerWidth + 2)}+`;
  const body = sanitized.map((line) => {
    const padded = line.padEnd(innerWidth, ' ');
    return `| ${padded} |`;
  });
  return [horizontal, ...body, horizontal];
}

function createPrefabFallback(prefabId, errorInfo = {}) {
  const { code, message } = normalizeErrorInfo(errorInfo);
  const label = prefabId ? `Prefab ${prefabId}` : 'Prefab (unknown)';
  const headline = 'Prefab Missing';
  const codeLine = code ? `Code: ${code}` : 'Code: unavailable';
  const messageLine = message ? `Msg: ${message.slice(0, 70)}` : 'Msg: no details';
  const box = createAsciiBox([headline, codeLine, label, messageLine]);
  const asciiArt = box.join('\n');

  return {
    id: prefabId ?? 'missing_prefab',
    type: 'fallback-prefab',
    name: 'Missing Prefab',
    asciiArt,
    boxLines: box,
    isFallback: true,
    meta: {
      fallback: {
        reason: 'prefab-missing',
        prefabId: prefabId ?? null,
        errorCode: code,
        message: message ?? null,
      },
    },
  };
}

function lookupPrefabError(prefabId, lookup) {
  if (!prefabId || !lookup) return null;

  if (typeof lookup === 'function') {
    try {
      return lookup(prefabId) ?? null;
    } catch (error) {
      return { code: 'lookup-failed', error };
    }
  }

  if (lookup instanceof Map) {
    return lookup.get(prefabId) ?? null;
  }

  if (Array.isArray(lookup)) {
    for (const entry of lookup) {
      if (!entry || typeof entry !== 'object') continue;
      const id = entry.prefabId ?? entry.id ?? entry.slug ?? null;
      if (id === prefabId) {
        return entry;
      }
    }
    return null;
  }

  if (typeof lookup === 'object') {
    const direct = lookup[prefabId];
    if (direct != null) return direct;
  }

  return null;
}

function resolvePrefab(prefabId, providedPrefab, prefabResolver, prefabErrorLookup, warnings) {
  if (providedPrefab) {
    return { prefab: providedPrefab, fallback: null };
  }

  const resolved = prefabResolver(prefabId ?? null);
  if (resolved) {
    return { prefab: resolved, fallback: null };
  }

  const errorInfo = lookupPrefabError(prefabId, prefabErrorLookup);
  const fallbackPrefab = createPrefabFallback(prefabId, errorInfo);
  const codeNote = fallbackPrefab.meta?.fallback?.errorCode ? ` (code ${fallbackPrefab.meta.fallback.errorCode})` : '';
  if (Array.isArray(warnings)) {
    warnings.push(`Prefab "${prefabId ?? 'unknown'}" missing; generated ASCII fallback${codeNote}`);
  }
  return {
    prefab: fallbackPrefab,
    fallback: fallbackPrefab.meta?.fallback ?? {
      reason: 'prefab-missing',
      prefabId: prefabId ?? null,
    },
  };
}

function isAreaDescriptor(candidate) {
  if (!candidate || typeof candidate !== 'object') return false;
  if (candidate.camera || candidate.ground) return true;
  if (Array.isArray(candidate.instances)) {
    return candidate.instances.some((inst) => inst && typeof inst === 'object' && (inst.position || inst.scale));
  }
  if (Array.isArray(candidate.layers)) {
    return candidate.layers.some((layer) => layer && typeof layer === 'object' && ('parallaxSpeed' in layer || 'offsetY' in layer || 'separation' in layer));
  }
  return false;
}

function normalizeAreaDescriptor(area, options = {}) {
  const {
    areaId = area.id || area.areaId || 'builder_area',
    areaName = area.name || area.areaName || areaId,
    layerImageResolver = () => null,
    prefabResolver = () => null,
    prefabErrorLookup = null,
  } = options;

  const rawLayers = Array.isArray(area.layers) ? area.layers : [];
  const rawInstances = Array.isArray(area.instances)
    ? area.instances
    : Array.isArray(area.props)
      ? area.props
      : [];
  const rawColliders = Array.isArray(area.colliders) ? area.colliders : [];

  const warnings = Array.isArray(area.warnings) ? [...area.warnings] : [];
  if (!Array.isArray(area.layers)) {
    warnings.push('area.layers missing – produced area has zero parallax layers');
  }
  if (!Array.isArray(area.instances) && !Array.isArray(area.props)) {
    warnings.push('area.instances missing – produced area has zero instances');
  }

  const convertedLayers = rawLayers.map((layer, index) => ({
    id: layer.id || `layer_${index}`,
    name: layer.name || `Layer ${index + 1}`,
    type: layer.type || 'gameplay',
    parallaxSpeed: toNumber(layer.parallaxSpeed ?? layer.parallax, 1),
    scale: toNumber(layer.scale, 1),
    offsetY: toNumber(layer.offsetY ?? layer.yOffset, 0),
    separation: toNumber(layer.separation ?? layer.sep, 0),
    source: layer.source ?? layerImageResolver(layer) ?? null,
    meta: layer.meta ? safeClone(layer.meta) : {},
  }));

  const convertedInstances = rawInstances.map((inst) => {
    const tags = Array.isArray(inst.tags) ? inst.tags.map((tag) => String(tag)) : [];
    const meta = inst.meta ? safeClone(inst.meta) : {};
    const { prefab: resolvedPrefab, fallback } = resolvePrefab(
      inst.prefabId ?? null,
      inst.prefab ?? null,
      prefabResolver,
      prefabErrorLookup,
      warnings,
    );
    if (fallback) {
      meta.fallback = {
        ...(meta.fallback || {}),
        ...fallback,
      };
    }
    return {
      id: inst.id,
      prefabId: inst.prefabId ?? null,
      layerId: inst.layerId ?? null,
      position: {
        x: toNumber(inst.position?.x ?? inst.x ?? 0, 0),
        y: toNumber(inst.position?.y ?? inst.y ?? 0, 0),
      },
      scale: {
        x: toNumber(inst.scale?.x ?? inst.scaleX ?? 1, 1),
        y: toNumber(inst.scale?.y ?? inst.scaleY ?? inst.scale?.x ?? inst.scaleX ?? 1, 1),
      },
      rotationDeg: toNumber(inst.rotationDeg ?? inst.rot ?? 0, 0),
      locked: !!inst.locked,
      prefab: resolvedPrefab,
      tags,
      meta,
    };
  });

  const convertedColliders = rawColliders.map((col, index) => normalizeCollider(col, index));

  return {
    id: areaId,
    name: areaName,
    source: area.source ?? SOURCE_ID,
    camera: {
      startX: toNumber(area.camera?.startX ?? area.cameraStartX, 0),
      startZoom: toNumber(area.camera?.startZoom ?? area.zoomStart, 1),
    },
    ground: {
      offset: toNumber(area.ground?.offset ?? area.groundOffset, 0),
    },
    layers: convertedLayers,
    instances: convertedInstances,
    colliders: convertedColliders,
    warnings,
    meta: area.meta ? safeClone(area.meta) : {},
  };
}

/**
 * Convert a builder layout export into a runtime-friendly area descriptor.
 * The descriptor remains independent from the rest of the runtime so failures
 * in the map pipeline do not prevent other systems from functioning.
 */
export function convertLayoutToArea(layout, options = {}) {
  if (!layout || typeof layout !== 'object') {
    throw new TypeError('layout must be an object');
  }

  if (isAreaDescriptor(layout)) {
    return normalizeAreaDescriptor(layout, options);
  }

  const resolvedAreaId = options.areaId ?? layout.areaId ?? layout.id ?? 'builder_area';
  const resolvedAreaName = options.areaName ?? layout.areaName ?? layout.name ?? resolvedAreaId;
  const layerImageResolver = options.layerImageResolver ?? (() => null);
  const prefabResolver = options.prefabResolver ?? (() => null);
  const prefabErrorLookup = options.prefabErrorLookup ?? null;
  const includeRaw = options.includeRaw ?? false;

  const layers = Array.isArray(layout.layers) ? layout.layers : [];
  const instances = Array.isArray(layout.instances) ? layout.instances : [];
  const colliders = Array.isArray(layout.colliders) ? layout.colliders : [];

  const layerMap = new Map(layers.map((layer) => [layer.id, layer]));
  const slotCenters = computeLayerSlotCenters(instances);
  const warnings = [];

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

    const { prefab, fallback } = resolvePrefab(
      inst.prefabId ?? null,
      inst.prefab ?? null,
      prefabResolver,
      prefabErrorLookup,
      warnings,
    );
    const tags = Array.isArray(inst.tags) ? inst.tags.map((tag) => String(tag)) : [];

    const original = safeClone(inst);
    if (tags.length && !Array.isArray(original.tags)) {
      original.tags = [...tags];
    }

    const meta = {
      original,
    };
    if (fallback) {
      meta.fallback = {
        ...(meta.fallback || {}),
        ...fallback,
      };
    }

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
      tags,
      meta,
    };
  });

  const convertedColliders = colliders.map((col, index) => normalizeCollider(col, index));

  if (!Array.isArray(layout.layers)) {
    warnings.push('layout.layers missing – produced area has zero parallax layers');
  }
  if (!Array.isArray(layout.instances)) {
    warnings.push('layout.instances missing – produced area has zero instances');
  }

  return {
    id: resolvedAreaId,
    name: resolvedAreaName,
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
    colliders: convertedColliders,
    warnings,
    meta: {
      exportedAt: layout.meta?.exportedAt || null,
      raw: includeRaw ? safeClone(layout) : undefined,
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

function normalizeCollider(raw, fallbackIndex = 0) {
  const safe = raw && typeof raw === 'object' ? safeClone(raw) : {};
  const id = safe.id ?? safe.meta?.original?.id ?? fallbackIndex;
  const labelRaw = typeof safe.label === 'string' ? safe.label.trim() : '';
  let left = toNumber(safe.left ?? safe.x ?? safe.position?.x, 0);
  const rightRaw = safe.right ?? safe.meta?.original?.right;
  let width = toNumber(safe.width ?? safe.w, null);
  if (!Number.isFinite(width) && Number.isFinite(rightRaw)) {
    width = toNumber(rightRaw, left) - left;
  }
  if (!Number.isFinite(width)) width = 120;
  if (width < 0) {
    left += width;
    width = Math.abs(width);
  }

  let topOffset = toNumber(safe.topOffset ?? safe.top ?? safe.y ?? safe.offsetY, 0);
  const bottomRaw = safe.bottomOffset ?? safe.bottom ?? safe.meta?.bottomOffset;
  let height = toNumber(safe.height ?? safe.h, null);
  if (!Number.isFinite(height) && Number.isFinite(bottomRaw)) {
    height = toNumber(bottomRaw, 0) - topOffset;
  }
  if (!Number.isFinite(height)) height = 40;
  if (height < 0) {
    topOffset += height;
    height = Math.abs(height);
  }

  return {
    id,
    label: labelRaw || `Collider ${id ?? fallbackIndex}`,
    type: safe.type === 'box' || safe.shape === 'box' ? 'box' : 'box',
    left,
    width: Math.max(1, width),
    topOffset,
    height: Math.max(1, height),
    meta: safe.meta ? safeClone(safe.meta) : {},
  };
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
