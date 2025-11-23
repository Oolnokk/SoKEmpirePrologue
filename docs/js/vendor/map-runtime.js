/**
 * MapRegistry maintains a registry of map areas without leaking implementation
 * details to the rest of the runtime. The class is intentionally lightweight so
 * the map system can fail in isolation without cascading errors into other
 * toolchains.
 */

const clone = (value) => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

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

  /**
   * Subscribe to registry events. Returns an unsubscribe function.
   */
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

  /**
   * Register a single area descriptor.
   */
  registerArea(areaId, descriptor) {
    const { area, warnings } = this._prepareArea(areaId, descriptor);
    warnings.forEach((w) => this._logger.warn?.(`[MapRegistry] ${w}`));

    this._areas.set(areaId, area);
    this._emit('area-registered', area);
    if (!this._activeAreaId) {
      this._activeAreaId = areaId;
      this._emit('active-area-changed', area);
    }
    return area;
  }

  /**
   * Register multiple areas from an object map (compatible with CONFIG.areas).
   */
  registerAreas(areaMap) {
    if (!areaMap || typeof areaMap !== 'object') {
      throw new MapRegistryError('Area map must be an object');
    }
    const staged = [];
    for (const [areaId, descriptor] of Object.entries(areaMap)) {
      const record = this._prepareArea(areaId, descriptor);
      staged.push({ ...record, areaId });
    }
    const results = {};
    for (const { areaId, area, warnings } of staged) {
      warnings.forEach((w) => this._logger.warn?.(`[MapRegistry] ${w}`));
      this._areas.set(areaId, area);
      this._emit('area-registered', area);
      results[areaId] = area;
      if (!this._activeAreaId) {
        this._activeAreaId = areaId;
        this._emit('active-area-changed', area);
      }
    }
    return results;
  }

  _prepareArea(areaId, descriptor) {
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

    const area = deepFreeze(clone({ ...descriptor, id: areaId }));
    return { area, warnings };
  }

  /**
   * Remove a single area by id.
   */
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

  getInstance(areaId, instanceId) {
    if (!areaId || !instanceId) return null;
    const area = this.getArea(areaId);
    if (!area || typeof area !== 'object') return null;
    const lookup = area.instancesById || null;
    if (!lookup || typeof lookup !== 'object') return null;
    return lookup[instanceId] ?? null;
  }

  getActiveInstance(instanceId) {
    if (!instanceId) return null;
    const activeAreaId = this.getActiveAreaId();
    if (!activeAreaId) return null;
    return this.getInstance(activeAreaId, instanceId);
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

  let seenInstanceIds = null;
  if (Array.isArray(descriptor.instances)) {
    seenInstanceIds = new Set();
    descriptor.instances.forEach((inst, index) => {
      if (!inst || typeof inst !== 'object') {
        warnings.push(`Instance at index ${index} is not an object`);
        return;
      }
      const rawId = typeof inst.instanceId === 'string' ? inst.instanceId.trim() : '';
      if (!rawId) {
        errors.push(`Instance at index ${index} missing "instanceId"`);
        return;
      }
      if (seenInstanceIds.has(rawId)) {
        errors.push(`Duplicate instanceId "${rawId}"`);
      } else {
        seenInstanceIds.add(rawId);
      }
    });
  }

  if (descriptor.instancesById && typeof descriptor.instancesById === 'object') {
    const indexKeys = new Set(Object.keys(descriptor.instancesById));
    if (seenInstanceIds) {
      for (const id of seenInstanceIds) {
        if (!indexKeys.has(id)) {
          errors.push(`instancesById missing mapping for "${id}"`);
        }
      }
      for (const key of indexKeys) {
        if (!seenInstanceIds.has(key)) {
          warnings.push(`instancesById entry "${key}" has no matching instance`);
        }
      }
    } else {
      warnings.push('instancesById provided without instances array');
    }
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

export default MapRegistry;
const DEFAULT_SOURCE_ID = 'map-builder-layered-v15f';
const DEFAULT_FALLBACK_BOX_MIN_WIDTH = 18;
const DEFAULT_TAG_INSTANCE_ID_MAPPING = new Map([
  ['spawn:player', 'player_spawn'],
  ['spawn:npc', 'npc_spawn'],
]);

const cloneDefaultMapping = () => new Map(DEFAULT_TAG_INSTANCE_ID_MAPPING);

const normalizeSourceId = (value) => {
  if (typeof value === 'string') {
    const text = value.trim();
    if (text) return text;
  }
  return DEFAULT_SOURCE_ID;
};

const normalizeFallbackWidth = (value) => {
  const size = Number(value);
  if (Number.isFinite(size) && size > 0) {
    return Math.max(4, Math.floor(size));
  }
  return DEFAULT_FALLBACK_BOX_MIN_WIDTH;
};

const normalizeMapping = (rawMapping) => {
  const normalized = new Map();

  const addEntry = (tag, instanceId) => {
    const key = typeof tag === 'string' ? tag.trim() : '';
    const value = typeof instanceId === 'string' ? instanceId.trim() : '';
    if (key && value) {
      normalized.set(key, value);
    }
  };

  if (rawMapping instanceof Map) {
    rawMapping.forEach((value, key) => addEntry(key, value));
  } else if (Array.isArray(rawMapping)) {
    rawMapping.forEach(([key, value]) => addEntry(key, value));
  } else if (rawMapping && typeof rawMapping === 'object') {
    Object.entries(rawMapping).forEach(([key, value]) => addEntry(key, value));
  }

  return normalized.size ? normalized : cloneDefaultMapping();
};

const readRawConfig = () => {
  if (typeof globalThis !== 'undefined' && globalThis.CONFIG?.mapBuilder) {
    return globalThis.CONFIG.mapBuilder;
  }
  return null;
};

export const getDefaultMapBuilderConfig = () => ({
  sourceId: DEFAULT_SOURCE_ID,
  fallbackBoxMinWidth: DEFAULT_FALLBACK_BOX_MIN_WIDTH,
  tagInstanceIdMapping: cloneDefaultMapping(),
});

export const loadMapBuilderConfig = (rawConfig = readRawConfig()) => {
  const defaults = getDefaultMapBuilderConfig();
  const config = rawConfig && typeof rawConfig === 'object' ? rawConfig : {};

  return {
    sourceId: normalizeSourceId(config.sourceId ?? config.SOURCE_ID),
    fallbackBoxMinWidth: normalizeFallbackWidth(
      config.fallbackBoxMinWidth ?? config.FALLBACK_BOX_MIN_WIDTH,
    ),
    tagInstanceIdMapping: normalizeMapping(
      config.tagInstanceIdMapping ?? config.tagToInstanceIdMapping,
    ),
    defaults,
  };
};

export const mapBuilderConfig = loadMapBuilderConfig();

const {
  sourceId: SOURCE_ID,
  fallbackBoxMinWidth: FALLBACK_BOX_MIN_WIDTH,
  tagInstanceIdMapping: TAG_INSTANCE_ID_MAPPING,
} = mapBuilderConfig;

const PLAYABLE_BOUNDS_SOURCE = {
  LAYOUT: 'layout',
  COLLIDERS: 'colliders',
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

function sanitizeInstanceId(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  const normalized = text
    .replace(/[^A-Za-z0-9:_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || '';
}

function resolveInstanceIdFromTags(tags) {
  if (!Array.isArray(tags) || tags.length === 0) {
    return { id: '', source: null };
  }
  for (const tag of tags) {
    const normalized = typeof tag === 'string' ? tag.trim() : '';
    if (!normalized) continue;
    if (TAG_INSTANCE_ID_MAPPING.has(normalized)) {
      return { id: TAG_INSTANCE_ID_MAPPING.get(normalized), source: `tag:${normalized}` };
    }
    if (normalized.toLowerCase().startsWith('instance:')) {
      const direct = sanitizeInstanceId(normalized.slice('instance:'.length));
      if (direct) {
        return { id: direct, source: `tag:${normalized}` };
      }
    }
  }
  return { id: '', source: null };
}

function resolveInstanceId(rawInstance, context) {
  const {
    areaId = 'area',
    index = 0,
    tags = [],
    usedIds = new Set(),
  } = context || {};

  const attempts = [];

  attempts.push({ id: sanitizeInstanceId(rawInstance?.instanceId), source: 'instance.instanceId' });

  const tagResult = resolveInstanceIdFromTags(tags);
  if (tagResult.id) {
    attempts.push(tagResult);
  }

  attempts.push({ id: sanitizeInstanceId(rawInstance?.id), source: 'instance.id' });

  if (rawInstance?.prefabId) {
    attempts.push({ id: sanitizeInstanceId(rawInstance.prefabId), source: 'prefabId' });
  }

  const autoIdBase = sanitizeInstanceId(`${areaId || 'area'}_${index}`) || `instance_${index}`;
  attempts.push({ id: autoIdBase, source: 'auto.index' });

  let resolved = attempts.find((candidate) => candidate.id);
  if (!resolved) {
    resolved = { id: `instance_${index}`, source: 'auto.fallback' };
  }

  let { id: instanceId, source } = resolved;
  if (usedIds.has(instanceId)) {
    let suffix = 2;
    while (usedIds.has(`${instanceId}_${suffix}`)) {
      suffix += 1;
    }
    instanceId = `${instanceId}_${suffix}`;
    source = `${source}+dedupe`;
  }

  usedIds.add(instanceId);

  return { instanceId, source };
}

function computeColliderBounds(colliders) {
  if (!Array.isArray(colliders) || colliders.length === 0) {
    return null;
  }
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const col of colliders) {
    if (!col || typeof col !== 'object') continue;
    const left = Number(col.left);
    const width = Number(col.width);
    if (!Number.isFinite(left) || !Number.isFinite(width)) continue;
    const right = left + width;
    minLeft = Math.min(minLeft, Math.min(left, right));
    maxRight = Math.max(maxRight, Math.max(left, right));
  }
  if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight) || maxRight <= minLeft) {
    return null;
  }
  return { left: minLeft, right: maxRight };
}

function normalizePlayableBounds(rawBounds, colliders = [], warnings = null) {
  const addWarning = (message) => {
    if (Array.isArray(warnings)) warnings.push(message);
  };

  const safe = rawBounds && typeof rawBounds === 'object' ? rawBounds : null;
  const left = toNumber(safe?.left ?? safe?.min, NaN);
  const right = toNumber(safe?.right ?? safe?.max, NaN);

  if (Number.isFinite(left) && Number.isFinite(right) && right > left) {
    return { left, right, source: PLAYABLE_BOUNDS_SOURCE.LAYOUT };
  }

  if (safe) {
    addWarning('playableBounds provided but invalid – expected finite left/right');
  }

  const colliderBounds = computeColliderBounds(colliders);
  if (colliderBounds) {
    return { ...colliderBounds, source: PLAYABLE_BOUNDS_SOURCE.COLLIDERS };
  }

  if (Array.isArray(colliders) && colliders.length) {
    addWarning('playableBounds unavailable – no usable colliders to derive bounds');
  }
  return null;
}

function alignCollidersToPlayableBounds(colliders = [], playableBounds = null) {
  if (!Array.isArray(colliders) || colliders.length === 0) {
    return colliders;
  }

  const left = toNumber(playableBounds?.left, NaN);
  const right = toNumber(playableBounds?.right, NaN);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) {
    return colliders;
  }

  const width = right - left;

  return colliders.map((collider) => {
    if (!collider || typeof collider !== 'object') return collider;
    if (collider.meta?.autoAlignPlayableBounds === false) return collider;

    const currentLeft = toNumber(collider.left, NaN);
    const currentWidth = toNumber(collider.width, NaN);
    const currentRight =
      Number.isFinite(currentLeft) && Number.isFinite(currentWidth)
        ? currentLeft + currentWidth
        : NaN;

    const alreadyCovers = Number.isFinite(currentLeft)
      && Number.isFinite(currentRight)
      && currentLeft <= left
      && currentRight >= right;

    if (alreadyCovers && collider.meta?.autoAlignPlayableBounds !== true) {
      return collider;
    }

    return {
      ...collider,
      left,
      width,
    };
  });
}

function buildInstanceIndex(instances) {
  const index = {};
  for (const inst of instances) {
    if (!inst || typeof inst !== 'object') continue;
    const key = typeof inst.instanceId === 'string' ? inst.instanceId : null;
    if (key && !(key in index)) {
      index[key] = inst;
    }
  }
  return index;
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

  const safeResolver = typeof prefabResolver === 'function' ? prefabResolver : () => null;
  if (safeResolver !== prefabResolver && Array.isArray(warnings)) {
    warnings.push('prefabResolver must be a function – falling back to noop resolver');
  }

  const resolved = safeResolver(prefabId ?? null);
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

function resolveDrumSkinTexture(prefab = null) {
  const candidates = [];
  const addCandidate = (url, source) => {
    if (!url || typeof url !== 'string') return;
    const trimmed = url.trim();
    if (!trimmed) return;
    candidates.push({ url: trimmed, source });
  };

  const prefabMeta = typeof prefab?.meta === 'object' && prefab.meta ? prefab.meta : {};
  const drumMeta = typeof prefabMeta.drumSkin === 'object' && prefabMeta.drumSkin ? prefabMeta.drumSkin : {};
  addCandidate(prefabMeta.imageURL ?? prefabMeta.url ?? prefabMeta.texture, 'meta');
  addCandidate(drumMeta.imageURL ?? drumMeta.url ?? drumMeta.texture, 'meta.drumSkin');

  if (Array.isArray(prefab?.parts)) {
    for (const part of prefab.parts) {
      const url = part?.propTemplate?.url;
      addCandidate(url, part?.name ? `part:${part.name}` : 'part');
      if (prefab.isImage) break;
    }
  }

  return candidates[0] || { url: null, source: null };
}

function normalizeDrumSkinLayer(raw, index = 0, layerMap = new Map(), options = {}) {
  const { prefabResolver = null, warnings = null } = options;
  const safe = raw && typeof raw === 'object' ? raw : {};

  const parallaxLayers = Array.from(layerMap.values()).filter((layer) => layer?.type === 'parallax');
  const legacyLayerAId = typeof safe.layerA === 'string' && layerMap.has(safe.layerA)
    ? safe.layerA
    : (typeof safe.legacyLayerA === 'string' && layerMap.has(safe.legacyLayerA) ? safe.legacyLayerA : null);
  const legacyLayerBId = typeof safe.layerB === 'string' && layerMap.has(safe.layerB)
    ? safe.layerB
    : (typeof safe.legacyLayerB === 'string' && layerMap.has(safe.legacyLayerB) ? safe.legacyLayerB : legacyLayerAId);
  const fallbackTopLayer = legacyLayerAId ? layerMap.get(legacyLayerAId) : parallaxLayers[0];
  const fallbackBottomLayer = legacyLayerBId ? layerMap.get(legacyLayerBId) : (parallaxLayers[1] ?? fallbackTopLayer);

  const legacyHeightA = toNumber(safe.heightA ?? safe.offsetA ?? safe.yOffsetA, null);
  const legacyHeightB = toNumber(safe.heightB ?? safe.offsetB ?? safe.yOffsetB, null);

  const topParallax = toNumber(
    safe.topParallax ?? safe.parallaxTop ?? safe.parallaxA,
    fallbackTopLayer?.parallaxSpeed ?? 1,
  ) || 1;
  const bottomParallax = toNumber(
    safe.bottomParallax ?? safe.parallaxBottom ?? safe.parallaxB,
    fallbackBottomLayer?.parallaxSpeed ?? topParallax,
  ) || topParallax;

  const topScale = toNumber(
    safe.topScale ?? safe.scaleTop ?? safe.scaleA,
    fallbackTopLayer?.scale ?? 1,
  ) || 1;
  const bottomScale = toNumber(
    safe.bottomScale ?? safe.scaleBottom ?? safe.scaleB,
    fallbackBottomLayer?.scale ?? topScale,
  ) || topScale;

  const topYOffset = toNumber(
    safe.topYOffset
      ?? safe.topOffset
      ?? safe.offsetTop
      ?? (Number.isFinite(legacyHeightA)
        ? (fallbackTopLayer?.offsetY ?? 0) - legacyHeightA
        : null),
    fallbackTopLayer?.offsetY ?? 0,
  ) || 0;
  const bottomYOffset = toNumber(
    safe.bottomYOffset
      ?? safe.bottomOffset
      ?? safe.offsetBottom
      ?? (Number.isFinite(legacyHeightB)
        ? (fallbackBottomLayer?.offsetY ?? 0) - legacyHeightB
        : null),
    fallbackBottomLayer?.offsetY ?? fallbackTopLayer?.offsetY ?? topYOffset,
  ) || 0;

  const prefabId = typeof safe.prefabId === 'string' ? safe.prefabId.trim() : '';
  const textureId = typeof safe.textureId === 'string' ? safe.textureId.trim() : '';
  const prefabRef = prefabId || textureId;
  const explicitImageURL = typeof safe.imageURL === 'string' ? safe.imageURL.trim() : '';
  const tileScale = toNumber(safe.tileScale, 1) || 1;
  const visible = safe.visible !== false;
  const id = safe.id ?? safe.drumSkinId ?? index + 1;

  let resolvedPrefab = null;
  let resolvedPrefabTexture = { url: null, source: null };

  if (prefabRef && typeof prefabResolver === 'function') {
    const lookedUp = prefabResolver(prefabRef);
    if (lookedUp) {
      resolvedPrefab = safeClone(lookedUp);
      resolvedPrefabTexture = resolveDrumSkinTexture(resolvedPrefab);
    } else if (Array.isArray(warnings)) {
      warnings.push(`Drum skin ${id} references missing prefab "${prefabRef}"`);
    }
  }

  const finalImageURL = explicitImageURL || resolvedPrefabTexture.url || '';
  const textureSource = explicitImageURL
    ? 'explicit-url'
    : resolvedPrefabTexture.source || (prefabRef ? 'prefab' : 'explicit-url');

  if (!finalImageURL && Array.isArray(warnings)) {
    warnings.push(`Drum skin ${id} missing prefab/URL for texture`);
  }

  const meta = safe.meta && typeof safe.meta === 'object' ? safeClone(safe.meta) : {};
  meta.identity = {
    ...(meta.identity || {}),
    prefabId: prefabRef || null,
    textureId: prefabRef || null,
    source: meta.identity?.source || 'drum-skin',
  };
  meta.texture = {
    ...(meta.texture || {}),
    prefabId: prefabRef || null,
    textureId: prefabRef || null,
    url: finalImageURL,
    source: textureSource,
  };

  const descriptor = {
    id,
    topParallax,
    bottomParallax,
    topScale,
    bottomScale,
    topYOffset,
    bottomYOffset,
    prefabId: prefabRef || null,
    textureId: prefabRef || null,
    imageURL: finalImageURL,
    tileScale,
    visible,
    meta,
    legacyLayerA: legacyLayerAId,
    legacyLayerB: legacyLayerBId,
    layerA: legacyLayerAId,
    layerB: legacyLayerBId,
    heightA: legacyHeightA,
    heightB: legacyHeightB,
  };

  if (resolvedPrefab) {
    descriptor.prefab = resolvedPrefab;
  }

  return descriptor;
}

function normalizeAreaDescriptor(area, options = {}) {
  const {
    areaId = area.id || area.areaId || 'builder_area',
    areaName = area.name || area.areaName || areaId,
    layerImageResolver = () => null,
    prefabResolver = () => null,
    prefabErrorLookup = null,
  } = options;
  const proximityScale = clampScale(area.proximityScale ?? area.meta?.proximityScale, 1);

  const rawLayers = Array.isArray(area.layers) ? area.layers : [];
  const rawInstances = Array.isArray(area.instances)
    ? area.instances
    : Array.isArray(area.props)
      ? area.props
      : [];
  const rawColliders = Array.isArray(area.colliders) ? area.colliders : [];
  const rawDrumSkins = Array.isArray(area.drumSkins) ? area.drumSkins : [];

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

  const usedInstanceIds = new Set();
  const convertedInstances = rawInstances.map((inst, index) => {
    const tags = Array.isArray(inst.tags) ? inst.tags.map((tag) => String(tag)) : [];
    const meta = inst.meta ? safeClone(inst.meta) : {};
    const { instanceId, source: instanceIdSource } = resolveInstanceId(inst, {
      areaId,
      index,
      tags,
      usedIds: usedInstanceIds,
    });
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
    meta.identity = {
      ...(meta.identity || {}),
      instanceId,
      source: meta.identity?.source || instanceIdSource,
    };
    const rawPosition = {
      x: toNumber(inst.position?.x ?? inst.x ?? 0, 0),
      y: toNumber(inst.position?.y ?? inst.y ?? 0, 0),
    };
    const distanceToCamera = Math.hypot(rawPosition.x, rawPosition.y);
    const intraLayerDepth = Number.isFinite(distanceToCamera) ? -distanceToCamera : 0;
    const appliesProximityScale = !tags.some((tag) => tag === 'player'
      || tag === 'npc'
      || tag.startsWith('spawn:player')
      || tag.startsWith('spawn:npc'));

    return {
      instanceId,
      id: inst.id,
      prefabId: inst.prefabId ?? null,
      layerId: inst.layerId ?? null,
      position: rawPosition,
      scale: {
        x: toNumber(inst.scale?.x ?? inst.scaleX ?? 1, 1) * (appliesProximityScale ? proximityScale : 1),
        y: toNumber(inst.scale?.y ?? inst.scaleY ?? inst.scale?.x ?? inst.scaleX ?? 1, 1) * (appliesProximityScale ? proximityScale : 1),
      },
      rotationDeg: toNumber(inst.rotationDeg ?? inst.rot ?? 0, 0),
      locked: !!inst.locked,
      intraLayerDepth,
      prefab: resolvedPrefab,
      tags,
      meta: {
        ...meta,
        proximityScale: {
          applied: appliesProximityScale ? proximityScale : 1,
          inherited: proximityScale,
        },
      },
    };
  });

  const convertedColliders = rawColliders.map((col, index) => normalizeCollider(col, index));
  const playableBounds = normalizePlayableBounds(area.playableBounds, convertedColliders, warnings);
  const alignedColliders = alignCollidersToPlayableBounds(convertedColliders, playableBounds);
  const layerMap = new Map(rawLayers.map((layer) => [layer.id, layer]));
  const convertedDrumSkins = rawDrumSkins
    .map((drum, index) => normalizeDrumSkinLayer(drum, index, layerMap, {
      prefabResolver,
      warnings,
    }))
    .filter(Boolean);

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
    proximityScale,
    layers: convertedLayers,
    instances: convertedInstances,
    instancesById: buildInstanceIndex(convertedInstances),
    colliders: alignedColliders,
    drumSkins: convertedDrumSkins,
    playableBounds,
    warnings,
    meta: {
      ...(area.meta ? safeClone(area.meta) : {}),
      proximityScale,
    },
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
  const instances = Array.isArray(layout.instances)
    ? layout.instances
    : Array.isArray(layout.props)
      ? layout.props
      : [];
  const colliders = Array.isArray(layout.colliders) ? layout.colliders : [];
  const rawDrumSkins = Array.isArray(layout.drumSkins) ? layout.drumSkins : [];

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

  const usedInstanceIds = new Set();
  const convertedInstances = instances.map((inst, index) => {
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

    const { instanceId, source: instanceIdSource } = resolveInstanceId(inst, {
      areaId: resolvedAreaId,
      index,
      tags,
      usedIds: usedInstanceIds,
    });

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
    meta.identity = {
      ...(meta.identity || {}),
      instanceId,
      source: meta.identity?.source || instanceIdSource,
    };

    const rawPosition = {
      x: computedX,
      y: -toNumber(inst.offsetY, 0),
    };
    const distanceToCamera = Math.hypot(rawPosition.x, rawPosition.y);
    const intraLayerDepth = Number.isFinite(distanceToCamera) ? -distanceToCamera : 0;
    const appliesProximityScale = !tags.some((tag) => tag === 'player'
      || tag === 'npc'
      || tag.startsWith('spawn:player')
      || tag.startsWith('spawn:npc'));

    return {
      instanceId,
      id: inst.id,
      prefabId: inst.prefabId,
      layerId: inst.layerId,
      position: rawPosition,
      scale: {
        x: toNumber(inst.scaleX, 1) * (appliesProximityScale ? proximityScale : 1),
        y: toNumber(inst.scaleY, inst.scaleX ?? 1) * (appliesProximityScale ? proximityScale : 1),
      },
      rotationDeg: toNumber(inst.rot, 0),
      locked: !!inst.locked,
      intraLayerDepth,
      prefab,
      tags,
      meta: {
        ...meta,
        proximityScale: {
          applied: appliesProximityScale ? proximityScale : 1,
          inherited: proximityScale,
        },
      },
    };
  });

  const convertedColliders = colliders.map((col, index) => normalizeCollider(col, index));
  const playableBounds = normalizePlayableBounds(layout.playableBounds, convertedColliders, warnings);
  const alignedColliders = alignCollidersToPlayableBounds(convertedColliders, playableBounds);
  const convertedDrumSkins = rawDrumSkins
    .map((drum, index) => normalizeDrumSkinLayer(drum, index, layerMap, {
      prefabResolver,
      warnings,
    }))
    .filter(Boolean);
  const backgroundFromLayout = typeof layout.background === 'object' && layout.background
    ? safeClone(layout.background)
    : null;
  const backgroundFromMeta = typeof layout.meta?.background === 'object' && layout.meta.background
    ? safeClone(layout.meta.background)
    : null;
  const background = backgroundFromLayout || backgroundFromMeta || null;

  if (!Array.isArray(layout.layers)) {
    warnings.push('layout.layers missing – produced area has zero parallax layers');
  }
  if (!Array.isArray(layout.instances)) {
    if (Array.isArray(layout.props)) {
      warnings.push('layout.instances missing – using layout.props as instance fallback');
    } else {
      warnings.push('layout.instances missing – produced area has zero instances');
    }
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
    proximityScale,
    layers: convertedLayers,
    instances: convertedInstances,
    instancesById: buildInstanceIndex(convertedInstances),
    colliders: alignedColliders,
    drumSkins: convertedDrumSkins,
    playableBounds,
    warnings,
    background,
    meta: {
      exportedAt: layout.meta?.exportedAt || null,
      proximityScale,
      raw: includeRaw ? safeClone(layout) : undefined,
    },
  };
}

export function convertLayouts(layouts, options = {}) {
  if (!Array.isArray(layouts)) {
    throw new TypeError('layouts must be an array');
  }
  const areas = {};
  layouts.forEach((layout, index) => {
    const area = convertLayoutToArea(layout, options);
    if (Object.prototype.hasOwnProperty.call(areas, area.id)) {
      throw new Error(`Duplicate area id "${area.id}" at layout index ${index}`);
    }
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

function clampScale(value, fallback = 1) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(0.001, num);
}

function normalizeCollider(raw, fallbackIndex = 0) {
  const safe = raw && typeof raw === 'object' ? safeClone(raw) : {};
  const id = safe.id ?? safe.meta?.original?.id ?? fallbackIndex;
  const labelRaw = typeof safe.label === 'string' ? safe.label.trim() : '';
  const materialTypeRaw = typeof safe.materialType === 'string' ? safe.materialType.trim() : '';
  const metaMaterialType = typeof safe.meta?.materialType === 'string' ? safe.meta.materialType.trim() : '';
  const legacyStepSoundRaw = typeof safe.stepSound === 'string' ? safe.stepSound.trim() : '';
  const legacyMetaStepSound = typeof safe.meta?.stepSound === 'string' ? safe.meta.stepSound.trim() : '';
  const normalizedMaterialType = materialTypeRaw
    || metaMaterialType
    || legacyStepSoundRaw
    || legacyMetaStepSound
    || '';
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

  const typeCandidate = typeof safe.type === 'string' ? safe.type : typeof safe.shape === 'string' ? safe.shape : 'box';
  const normalizedType = typeCandidate ? typeCandidate.trim().toLowerCase() : '';

  return {
    id,
    label: labelRaw || `Collider ${id ?? fallbackIndex}`,
    type: normalizedType || 'box',
    left,
    width: Math.max(1, width),
    topOffset,
    height: Math.max(1, height),
    materialType: normalizedMaterialType || null,
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

