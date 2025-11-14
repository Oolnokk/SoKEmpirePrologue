/**
 * Browser-friendly runtime utilities for the docs demo. These copies mirror the
 * source modules under src/map so the docs build does not depend on unpublished
 * files when hosted statically (e.g. GitHub Pages).
 */

const FALLBACK_BOX_MIN_WIDTH = 18;

const clone = (value) => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

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

export class MapRegistryError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'MapRegistryError';
    if (details) {
      this.details = details;
    }
  }
}

export class MapRegistry {
  constructor({ logger = console } = {}) {
    this._logger = logger;
    this._areas = new Map();
    this._activeAreaId = null;
    this._listeners = new Map();
  }

  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new MapRegistryError('Event handler must be a function');
    }
    const listeners = this._listeners.get(event) || new Set();
    listeners.add(handler);
    this._listeners.set(event, listeners);
    return () => listeners.delete(handler);
  }

  _emit(event, payload) {
    const listeners = this._listeners.get(event);
    if (!listeners) return;
    for (const handler of listeners) {
      try {
        handler(payload);
      } catch (error) {
        this._logger.warn?.('[MapRegistry] listener error', error);
      }
    }
  }

  registerArea(areaId, descriptor) {
    if (!areaId || typeof areaId !== 'string') {
      throw new MapRegistryError('Area id must be a non-empty string');
    }
    if (!descriptor || typeof descriptor !== 'object') {
      throw new MapRegistryError('Area descriptor must be an object');
    }

    const { warnings, errors } = validateAreaDescriptor(descriptor);
    if (errors.length) {
      throw new MapRegistryError(`Invalid area descriptor for "${areaId}"`, {
        errors,
      });
    }

    warnings.forEach((w) => this._logger.warn?.(`[MapRegistry] ${w}`));

    const frozen = deepFreeze(clone({ ...descriptor, id: areaId }));
    this._areas.set(areaId, frozen);
    this._emit('area-registered', frozen);
    if (!this._activeAreaId) {
      this._activeAreaId = areaId;
      this._emit('active-area-changed', frozen);
    }
    return frozen;
  }

  registerAreas(areaMap) {
    if (!areaMap || typeof areaMap !== 'object') {
      throw new MapRegistryError('Area map must be an object');
    }
    const results = {};
    for (const [areaId, descriptor] of Object.entries(areaMap)) {
      results[areaId] = this.registerArea(areaId, descriptor);
    }
    return results;
  }

  removeArea(areaId) {
    if (!this._areas.has(areaId)) return false;
    this._areas.delete(areaId);
    this._emit('area-removed', areaId);
    if (this._activeAreaId === areaId) {
      this._activeAreaId = this._areas.size ? this._areas.keys().next().value : null;
      this._emit('active-area-changed', this.getActiveArea());
    }
    return true;
  }

  hasArea(areaId) {
    return this._areas.has(areaId);
  }

  getArea(areaId) {
    return this._areas.get(areaId) || null;
  }

  getActiveAreaId() {
    return this._activeAreaId;
  }

  getActiveArea() {
    return this._activeAreaId ? this.getArea(this._activeAreaId) : null;
  }

  setActiveArea(areaId) {
    if (areaId == null) {
      this._activeAreaId = null;
      this._emit('active-area-changed', null);
      return true;
    }
    if (!this._areas.has(areaId)) {
      return false;
    }
    if (this._activeAreaId === areaId) {
      return true;
    }
    this._activeAreaId = areaId;
    this._emit('active-area-changed', this.getActiveArea());
    return true;
  }

  toJSON() {
    const result = {};
    for (const [id, descriptor] of this._areas.entries()) {
      result[id] = clone(descriptor);
    }
    return result;
  }
}

function validateAreaDescriptor(descriptor) {
  const warnings = [];
  const errors = [];

  if (!Array.isArray(descriptor.layers)) {
    errors.push('"layers" must be an array');
  }
  if (descriptor.layers && descriptor.layers.length === 0) {
    warnings.push('Area declares no parallax layers');
  }
  if (!Array.isArray(descriptor.instances) && !Array.isArray(descriptor.props)) {
    warnings.push('Area declares neither "instances" nor "props" – runtime may need one');
  }

  return { warnings, errors };
}

function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

const SOURCE_ID = 'map-builder-layered-v15f';

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
    warnings,
    meta: area.meta ? safeClone(area.meta) : {},
  };
}

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

function safeClone(value) {
  if (!value || typeof value !== 'object') return value ?? null;
  try {
    return structuredClone(value);
  } catch (error) {
    return JSON.parse(JSON.stringify(value));
  }
}
