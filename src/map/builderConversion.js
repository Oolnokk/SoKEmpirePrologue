import { mapBuilderConfig } from './mapBuilderConfig.js';
import {
  attachGroupsToSpawners,
  mergeGroupLibraries,
  normalizeGroupLibrary,
} from './groupLibrary.js';

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

  if (playableBounds?.source === PLAYABLE_BOUNDS_SOURCE.COLLIDERS) {
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

function parsePathTargetTag(tags = []) {
  for (const raw of tags) {
    if (typeof raw !== 'string') continue;
    const normalized = raw.trim().toLowerCase();
    if (!normalized.startsWith('path:target:')) continue;
    const parts = normalized.split(':').slice(2);
    if (!parts.length) continue;
    const [namePart, orderPart] = parts;
    const name = namePart?.trim() || null;
    const order = Number.isFinite(Number(orderPart)) ? Number(orderPart) : null;
    if (name) {
      return { name, order, sourceTag: raw };
    }
  }
  return null;
}

function normalizePathTargetRecord(raw, warnings = [], context = {}) {
  const source = typeof context.source === 'string' ? context.source : 'pathTarget';
  const safe = raw && typeof raw === 'object' ? safeClone(raw) : {};
  const fallbackName = typeof context.fallbackName === 'string' ? context.fallbackName : null;
  const rawName = typeof safe.name === 'string'
    ? safe.name
    : typeof safe.id === 'string'
      ? safe.id
      : null;
  const name = rawName && rawName.trim() ? rawName.trim() : (fallbackName || null);
  if (!name) {
    warnings.push(`Ignored ${source} without name`);
    return null;
  }

  const orderCandidate = safe.order ?? safe.meta?.order ?? safe.meta?.pathOrder;
  const order = Number.isFinite(Number(orderCandidate)) ? Number(orderCandidate) : null;
  const position = {
    x: toNumber(safe.position?.x ?? safe.x ?? 0, 0),
    y: toNumber(safe.position?.y ?? safe.y ?? 0, 0),
  };
  const layerId = typeof safe.layerId === 'string' && safe.layerId.trim() ? safe.layerId.trim() : null;
  const instanceId = typeof safe.instanceId === 'string' && safe.instanceId.trim() ? safe.instanceId.trim() : null;
  const tags = Array.isArray(safe.tags)
    ? safe.tags.filter((tag) => typeof tag === 'string' && tag.trim()).map((tag) => tag.trim())
    : [];
  const meta = safe.meta && typeof safe.meta === 'object' ? safeClone(safe.meta) : {};
  meta.identity = {
    ...(meta.identity || {}),
    name,
    source,
  };

  return {
    name,
    order,
    instanceId,
    layerId,
    position,
    tags,
    meta,
    sourceTag: typeof safe.sourceTag === 'string' ? safe.sourceTag : null,
  };
}

function normalizePathTargetList(rawList = [], warnings = [], context = {}) {
  if (!Array.isArray(rawList)) return [];
  const normalized = [];
  rawList.forEach((raw, index) => {
    const target = normalizePathTargetRecord(raw, warnings, {
      ...context,
      fallbackName: context.fallbackName || `target_${index}`,
    });
    if (target) normalized.push(target);
  });
  return normalized;
}

function mergePathTargetLists(explicit = [], derived = [], warnings = []) {
  const merged = [];
  const seen = new Set();
  const keyForTarget = (target) => {
    const name = typeof target?.name === 'string' ? target.name.trim() : '';
    const instanceId = typeof target?.instanceId === 'string' ? target.instanceId.trim() : '';
    const layerId = typeof target?.layerId === 'string' ? target.layerId.trim() : '';
    const order = Number.isFinite(target?.order) ? target.order : 'null';
    const posX = Number.isFinite(target?.position?.x) ? target.position.x : 'null';
    const posY = Number.isFinite(target?.position?.y) ? target.position.y : 'null';
    const keyParts = [name || 'anon', instanceId || 'inst', layerId || 'layer', order, posX, posY];
    return keyParts.join('::');
  };

  const addTarget = (target) => {
    const key = keyForTarget(target);
    if (!key) return;
    if (seen.has(key)) {
      if (Array.isArray(warnings)) {
        const label = target?.name || target?.instanceId || 'path-target';
        warnings.push(`Deduplicated path target "${label}" with key ${key}`);
      }
      return;
    }
    seen.add(key);
    merged.push(target);
  };

  explicit.forEach(addTarget);
  derived.forEach(addTarget);

  return merged;
}

function resolvePathTargetInfo(inst, layerTypes = new Map(), warnings = null) {
  if (!inst || typeof inst !== 'object') return null;
  if (!Array.isArray(inst.tags) || inst.tags.length === 0) return null;

  const tagInfo = parsePathTargetTag(inst.tags);
  if (!tagInfo) return null;

  const layerType = layerTypes.get(inst.layerId) || null;
  if (layerType && layerType !== 'gameplay') {
    if (Array.isArray(warnings)) {
      warnings.push(`Ignoring path target "${tagInfo.name}" on non-gameplay layer "${inst.layerId}"`);
    }
    return null;
  }

  const pathTargetMeta = inst.meta?.pathTarget
    || inst.meta?.original?.meta?.pathTarget
    || inst.meta?.original?.pathTarget;
  const metaOrder = pathTargetMeta?.order ?? inst.meta?.pathOrder ?? inst.meta?.original?.pathOrder;
  const parsedOrder = Number.isFinite(Number(metaOrder)) ? Number(metaOrder) : tagInfo.order;

  return {
    name: tagInfo.name,
    order: Number.isFinite(parsedOrder) ? parsedOrder : null,
    instanceId: inst.instanceId ?? null,
    layerId: inst.layerId ?? null,
    position: inst.position ? { ...inst.position } : null,
    tags: [...inst.tags],
    meta: pathTargetMeta ? { ...pathTargetMeta } : {},
    sourceTag: tagInfo.sourceTag,
  };
}

function collectPathTargets(instances = [], layers = [], warnings = null) {
  if (!Array.isArray(instances) || instances.length === 0) return [];
  const layerTypes = new Map(layers.map((layer) => [layer.id, layer.type]));
  const targets = instances
    .map((inst) => resolvePathTargetInfo(inst, layerTypes, warnings))
    .filter(Boolean);

  return targets;
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

function normalizeAreaDescriptor(area, options = {}) {
  const {
    areaId = area.id || area.areaId || 'builder_area',
    areaName = area.name || area.areaName || areaId,
    layerImageResolver = () => null,
    prefabResolver = () => null,
    prefabErrorLookup = null,
  } = options;
  // Preserve the configured proximity scale for runtime zooming metadata, but do
  // not bake it into instance geometry so exported layouts stay in editor space.
  const proximityScale = clampScale(area.proximityScale ?? area.meta?.proximityScale, 1);

  const rawLayers = Array.isArray(area.layers) ? area.layers : [];
  const rawInstances = Array.isArray(area.instances)
    ? area.instances
    : Array.isArray(area.props)
      ? area.props
      : [];
  const rawColliders = Array.isArray(area.colliders) ? area.colliders : [];
  const rawTilers = Array.isArray(area.tilers) ? area.tilers : [];
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
    const position = rawPosition;
    const distanceToCamera = Math.hypot(position.x, position.y);
    const intraLayerDepth = Number.isFinite(distanceToCamera) ? -distanceToCamera : 0;

    return {
      instanceId,
      id: inst.id,
      prefabId: inst.prefabId ?? null,
      layerId: inst.layerId ?? null,
      position,
      scale: {
        x: toNumber(inst.scale?.x ?? inst.scaleX ?? 1, 1),
        y: toNumber(inst.scale?.y ?? inst.scaleY ?? inst.scale?.x ?? inst.scaleX ?? 1, 1),
      },
      rotationDeg: toNumber(inst.rotationDeg ?? inst.rot ?? 0, 0),
      locked: !!inst.locked,
      intraLayerDepth,
      prefab: resolvedPrefab,
      tags,
      meta: {
        ...meta,
        proximityScale: {
          applied: 1,
          inherited: 1,
          mode: 'zoom',
        },
      },
    };
  });

  const convertedColliders = rawColliders.map((col, index) => normalizeCollider(col, index));
  const playableBounds = normalizePlayableBounds(area.playableBounds, convertedColliders, warnings);
  const alignedColliders = alignCollidersToPlayableBounds(convertedColliders, playableBounds);
  const explicitTilers = rawTilers.map((tiler, index) => normalizeTiler(tiler, index));
  const colliderTilers = collectColliderTilers(alignedColliders, warnings, explicitTilers.length);
  const convertedTilers = [...explicitTilers, ...colliderTilers];
  const layerMap = new Map(rawLayers.map((layer) => [layer.id, layer]));
  const convertedDrumSkins = rawDrumSkins
    .map((drum, index) => normalizeDrumSkinLayer(drum, index, layerMap, {
      prefabResolver,
      warnings,
    }))
    .filter(Boolean);
  const explicitSpawners = normalizeSpawnerList(area.spawners, warnings, { source: 'area' });
  const derivedSpawners = collectNpcSpawners(convertedInstances, warnings);
  const spawners = mergeSpawnerLists(explicitSpawners, derivedSpawners, warnings);
  const optionGroupLibrary = normalizeGroupLibrary(options.groupLibrary, warnings, { source: 'options.groupLibrary' });
  const areaGroupLibrary = normalizeGroupLibrary(area.groupLibrary ?? area.groups, warnings, { source: 'area.groupLibrary' });
  const groupLibrary = mergeGroupLibraries(optionGroupLibrary, areaGroupLibrary);
  const spawnersWithGroups = attachGroupsToSpawners(spawners, groupLibrary, warnings);
  const explicitPathTargets = normalizePathTargetList(area.pathTargets, warnings, { source: 'area' });
  const derivedPathTargets = collectPathTargets(convertedInstances, convertedLayers, warnings);
  const pathTargets = mergePathTargetLists(explicitPathTargets, derivedPathTargets, warnings);

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
    pathTargets,
    spawners: spawnersWithGroups,
    spawnersById: buildSpawnerIndex(spawnersWithGroups),
    groupLibrary,
    colliders: alignedColliders,
    drumSkins: convertedDrumSkins,
    tilers: convertedTilers,
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
  // Preserve the configured proximity scale for runtime zooming metadata, but do
  // not bake it into instance geometry so exported layouts stay in editor space.
  const proximityScale = clampScale(layout.proximityScale ?? layout.meta?.proximityScale, 1);

  const layers = Array.isArray(layout.layers) ? layout.layers : [];
  const instances = Array.isArray(layout.instances)
    ? layout.instances
    : Array.isArray(layout.props)
      ? layout.props
      : [];
  const colliders = Array.isArray(layout.colliders) ? layout.colliders : [];
  const rawTilers = Array.isArray(layout.tilers) ? layout.tilers : [];
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
    const position = rawPosition;
    const distanceToCamera = Math.hypot(position.x, position.y);
    const intraLayerDepth = Number.isFinite(distanceToCamera) ? -distanceToCamera : 0;

    return {
      instanceId,
      id: inst.id,
      prefabId: inst.prefabId,
      layerId: inst.layerId,
      position,
      scale: {
        x: toNumber(inst.scaleX, 1),
        y: toNumber(inst.scaleY, inst.scaleX ?? 1),
      },
      rotationDeg: toNumber(inst.rot, 0),
      locked: !!inst.locked,
      intraLayerDepth,
      prefab,
      tags,
      meta: {
        ...meta,
        proximityScale: {
          applied: 1,
          inherited: 1,
          mode: 'zoom',
        },
      },
    };
  });

  const convertedColliders = colliders.map((col, index) => normalizeCollider(col, index));
  const playableBounds = normalizePlayableBounds(layout.playableBounds, convertedColliders, warnings);
  const alignedColliders = alignCollidersToPlayableBounds(convertedColliders, playableBounds);
  const explicitTilers = rawTilers.map((tiler, index) => normalizeTiler(tiler, index));
  const colliderTilers = collectColliderTilers(alignedColliders, warnings, explicitTilers.length);
  const convertedTilers = [...explicitTilers, ...colliderTilers];
  const convertedDrumSkins = rawDrumSkins
    .map((drum, index) => normalizeDrumSkinLayer(drum, index, layerMap, {
      prefabResolver,
      warnings,
    }))
    .filter(Boolean);
  const explicitSpawners = normalizeSpawnerList(layout.spawners, warnings, { source: 'layout' });
  const derivedSpawners = collectNpcSpawners(convertedInstances, warnings);
  const spawners = mergeSpawnerLists(explicitSpawners, derivedSpawners, warnings);
  const optionGroupLibrary = normalizeGroupLibrary(options.groupLibrary, warnings, { source: 'options.groupLibrary' });
  const layoutGroupLibrary = normalizeGroupLibrary(layout.groupLibrary ?? layout.groups, warnings, { source: 'layout.groupLibrary' });
  const groupLibrary = mergeGroupLibraries(optionGroupLibrary, layoutGroupLibrary);
  const spawnersWithGroups = attachGroupsToSpawners(spawners, groupLibrary, warnings);
  const explicitPathTargets = normalizePathTargetList(layout.pathTargets, warnings, { source: 'layout' });
  const derivedPathTargets = collectPathTargets(convertedInstances, convertedLayers, warnings);
  const pathTargets = mergePathTargetLists(explicitPathTargets, derivedPathTargets, warnings);

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
    pathTargets,
    spawners: spawnersWithGroups,
    spawnersById: buildSpawnerIndex(spawnersWithGroups),
    groupLibrary,
    colliders: alignedColliders,
    drumSkins: convertedDrumSkins,
    tilers: convertedTilers,
    playableBounds,
    warnings,
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

function mergeSpawnerLists(explicit = [], derived = [], warnings = []) {
  const merged = [];
  const seen = new Set();

  const addSpawner = (spawner, sourceLabel) => {
    if (!spawner || typeof spawner !== 'object') return;
    const id = typeof spawner.spawnerId === 'string' ? spawner.spawnerId : spawner.id;
    if (!id) return;
    if (seen.has(id)) {
      if (Array.isArray(warnings)) {
        warnings.push(`Duplicate spawner id "${id}" encountered from ${sourceLabel || 'unknown source'} – skipping`);
      }
      return;
    }
    seen.add(id);
    merged.push(spawner);
  };

  explicit.forEach((spawner) => addSpawner(spawner, 'explicit spawner list'));
  derived.forEach((spawner) => addSpawner(spawner, 'derived spawner list'));

  return merged;
}

function buildSpawnerIndex(spawners = []) {
  const index = {};
  for (const spawner of Array.isArray(spawners) ? spawners : []) {
    if (!spawner || typeof spawner !== 'object') continue;
    const id = typeof spawner.spawnerId === 'string'
      ? spawner.spawnerId
      : typeof spawner.id === 'string'
        ? spawner.id
        : null;
    if (!id) continue;
    index[id] = spawner;
  }
  return index;
}

function collectNpcSpawners(instances = [], warnings = []) {
  const spawners = [];
  for (const inst of Array.isArray(instances) ? instances : []) {
    if (!inst || typeof inst !== 'object') continue;
    const tags = Array.isArray(inst.tags) ? inst.tags : [];
    const prefabId = typeof inst.prefabId === 'string' ? inst.prefabId.trim().toLowerCase() : '';
    const metaSpawner = inst.meta?.spawner
      ?? inst.meta?.original?.spawner
      ?? inst.meta?.original?.meta?.spawner
      ?? inst.meta?.spawn
      ?? inst.meta?.original?.meta?.spawn;

    const hasSpawnerTag = tags.some((tag) => typeof tag === 'string'
      && tag.trim().toLowerCase().startsWith('spawner:npc'));
    const hasSpawnerPrefab = prefabId === 'npc_spawner' || prefabId === 'spawner_npc';
    const hasSpawnerMeta = metaSpawner && typeof metaSpawner === 'object'
      && ((typeof metaSpawner.type === 'string' && metaSpawner.type.toLowerCase() === 'npc')
        || (typeof metaSpawner.kind === 'string' && metaSpawner.kind.toLowerCase() === 'npc')
        || (typeof metaSpawner.role === 'string' && metaSpawner.role.toLowerCase() === 'npc'));

    if (!hasSpawnerTag && !hasSpawnerPrefab && !hasSpawnerMeta) {
      continue;
    }

    const baseSettings = normalizeSpawnerSettings(metaSpawner, warnings);
    const spawnerId = inst.instanceId || inst.meta?.identity?.instanceId || inst.id || null;
    if (!spawnerId) {
      warnings.push('Encountered NPC spawner instance without a usable id');
      continue;
    }

    const spawner = normalizeSpawnerRecord({
      spawnerId,
      type: 'npc',
      prefabId: inst.prefabId ?? null,
      layerId: inst.layerId ?? null,
      position: inst.position ?? { x: 0, y: 0 },
      tags: inst.tags ?? [],
      respawn: baseSettings.respawn,
      count: baseSettings.count,
      spawnRadius: baseSettings.spawnRadius,
      templateId: baseSettings.templateId,
      characterId: baseSettings.characterId,
      meta: {
        ...(inst.meta ? safeClone(inst.meta) : {}),
        spawner: baseSettings.meta,
        sourceInstanceId: spawnerId,
      },
    }, warnings, { fallbackId: spawnerId, source: 'instance' });

    if (spawner) {
      spawners.push(spawner);
    }
  }
  return spawners;
}

function normalizeSpawnerList(rawList = [], warnings = [], context = {}) {
  if (!Array.isArray(rawList)) return [];
  const normalized = [];
  const seen = new Set();
  rawList.forEach((raw, index) => {
    const spawner = normalizeSpawnerRecord(raw, warnings, {
      fallbackId: `spawner_${index}`,
      source: 'explicit',
      ...context,
    });
    if (!spawner) return;
    if (seen.has(spawner.spawnerId)) {
      warnings.push(`Duplicate spawner id "${spawner.spawnerId}"`);
      return;
    }
    seen.add(spawner.spawnerId);
    normalized.push(spawner);
  });
  return normalized;
}

function normalizeSpawnerRecord(raw, warnings = [], context = {}) {
  const source = typeof context.source === 'string' ? context.source : 'spawner';
  const safe = raw && typeof raw === 'object' ? safeClone(raw) : {};
  const rawId = typeof safe.spawnerId === 'string'
    ? safe.spawnerId
    : typeof safe.id === 'string'
      ? safe.id
      : null;
  const spawnerId = rawId && rawId.trim() ? rawId.trim() : (context.fallbackId || null);
  if (!spawnerId) {
    warnings.push(`Ignored ${source} without spawnerId`);
    return null;
  }

  const spawnRadius = clampNonNegativeNumber(
    safe.spawnRadius ?? safe.radius ?? safe.spawn?.radius ?? safe.meta?.spawnRadius,
    0,
  );
  const count = clampPositiveInteger(
    safe.count ?? safe.maxCount ?? safe.max ?? safe.quantity ?? safe.spawn?.count ?? safe.meta?.spawnCount,
    1,
  );
  const respawn = Boolean(safe.respawn ?? safe.autoRespawn ?? safe.spawn?.respawn ?? false);
  const templateId = pickNonEmptyString(
    safe.templateId
      ?? safe.characterTemplateId
      ?? safe.spawn?.templateId
      ?? safe.meta?.templateId,
  );
  const characterId = pickNonEmptyString(
    safe.characterId
      ?? safe.character
      ?? safe.spawn?.characterId
      ?? safe.meta?.characterId,
  );
  const groupId = pickNonEmptyString(safe.groupId, safe.group?.id, safe.meta?.groupId);
  const group = safe.group && typeof safe.group === 'object' ? safeClone(safe.group) : undefined;

  const position = {
    x: toNumber(safe.position?.x ?? safe.x ?? 0, 0),
    y: toNumber(safe.position?.y ?? safe.y ?? 0, 0),
  };

  const meta = safe.meta && typeof safe.meta === 'object' ? safeClone(safe.meta) : {};
  meta.identity = {
    ...(meta.identity || {}),
    spawnerId,
    source,
  };

  return {
    ...safe,
    spawnerId,
    id: spawnerId,
    type: safe.type || safe.kind || 'npc',
    position,
    spawnRadius,
    count,
    respawn,
    templateId,
    characterId,
    groupId,
    group,
    meta,
  };
}

function normalizeSpawnerSettings(rawSettings, warnings = []) {
  const safe = rawSettings && typeof rawSettings === 'object' ? rawSettings : {};
  const count = clampPositiveInteger(
    safe.count ?? safe.max ?? safe.quantity ?? safe.instances ?? safe.maxCount,
    1,
  );
  const spawnRadius = clampNonNegativeNumber(safe.spawnRadius ?? safe.radius ?? safe.range ?? safe.spread, 0);
  const templateId = pickNonEmptyString(safe.templateId ?? safe.characterTemplateId ?? safe.template ?? safe.character);
  const characterId = pickNonEmptyString(safe.characterId ?? safe.character);
  const respawn = Boolean(safe.respawn ?? safe.autoRespawn ?? safe.loop ?? safe.repeat);

  const allowedMetaKeys = new Set([
    'count', 'max', 'maxCount', 'quantity', 'instances',
    'spawnRadius', 'radius', 'range', 'spread',
    'templateId', 'characterTemplateId', 'template',
    'characterId', 'character',
    'respawn', 'autoRespawn', 'loop', 'repeat',
    'groupId', 'group', 'tags', 'position', 'x', 'y',
    'type', 'kind', 'role',
  ]);

  const sanitizedMeta = {};
  for (const key of Object.keys(safe)) {
    if (!allowedMetaKeys.has(key)) continue;
    const value = safe[key];
    sanitizedMeta[key] = (value && typeof value === 'object') ? safeClone(value) : value;
  }

  const unknownKeys = Object.keys(safe).filter((key) => !allowedMetaKeys.has(key));
  if (unknownKeys.length && Array.isArray(warnings)) {
    warnings.push(`Ignored unsupported spawner meta keys: ${unknownKeys.join(', ')}`);
  }

  return {
    count,
    spawnRadius,
    templateId,
    characterId,
    respawn,
    meta: sanitizedMeta,
  };
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

function clampPositiveInteger(value, fallback = 1, min = 1, max = 50) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= min) {
    const rounded = Math.round(num);
    if (Number.isFinite(rounded)) {
      return Math.min(Math.max(rounded, min), max);
    }
  }
  return fallback;
}

function clampNonNegativeNumber(value, fallback = 0, max = Infinity) {
  const num = Number(value);
  if (Number.isFinite(num) && num >= 0) {
    const clamped = Math.min(num, max);
    return Math.round(clamped * 1000) / 1000;
  }
  return fallback;
}

function pickNonEmptyString(...candidates) {
  for (const candidate of candidates) {
    if (candidate == null) continue;
    const text = String(candidate).trim();
    if (text) return text;
  }
  return null;
}

function collectColliderTilers(colliders, warnings = null, startIndex = 0) {
  if (!Array.isArray(colliders) || colliders.length === 0) {
    return [];
  }
  const tilers = [];
  colliders.forEach((collider, index) => {
    const tiler = createTilerFromCollider(collider, startIndex + index, warnings);
    if (tiler) {
      tilers.push(tiler);
    }
  });
  return tilers;
}

function resolveDrumSkinTexture(prefab) {
  if (!prefab || typeof prefab !== 'object') {
    return { url: null, source: null };
  }

  const candidates = [];
  const meta = typeof prefab.meta === 'object' && prefab.meta ? prefab.meta : {};
  const drumMeta = typeof meta.drumSkin === 'object' && meta.drumSkin ? meta.drumSkin : {};
  const addCandidate = (value, source) => {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) {
        candidates.push({ url: trimmed, source });
      }
    }
  };

  addCandidate(drumMeta.imageURL ?? drumMeta.url ?? drumMeta.texture, 'meta.drumSkin');
  addCandidate(prefab.imageURL ?? prefab.url, 'prefab');
  if (Array.isArray(prefab.parts) && prefab.parts.length) {
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

function createTilerFromCollider(collider, fallbackIndex = 0, warnings = null) {
  if (!collider || typeof collider !== 'object') {
    return null;
  }
  const source = collider.meta?.tiler ?? collider.meta?.visualTiler ?? collider.tiler ?? null;
  if (!source || typeof source !== 'object') {
    return null;
  }
  if (source.enabled === false) {
    return null;
  }
  const config = safeClone(source);
  config.left = config.left ?? config.x ?? collider.left ?? 0;
  config.width = config.width ?? config.w ?? collider.width ?? 0;
  const topCandidate = config.top ?? config.topOffset ?? config.y;
  config.top = topCandidate ?? collider.topOffset ?? 0;
  config.height = config.height ?? config.h ?? collider.height ?? 0;
  config.layerId = config.layerId ?? config.layer ?? collider.meta?.layerId ?? null;
  const colliderId = collider.id ?? collider.label ?? fallbackIndex;
  if (config.sourceColliderId == null && config.colliderId == null && colliderId != null) {
    config.sourceColliderId = String(colliderId);
  }
  const tiler = normalizeTiler(config, fallbackIndex);
  if (!tiler.textureId) {
    if (Array.isArray(warnings)) {
      warnings.push(`Collider "${colliderId}" tiler missing textureId – skipping visual tiler`);
    }
    return null;
  }
  if (!tiler.sourceColliderId && colliderId != null) {
    tiler.sourceColliderId = String(colliderId);
  }
  return tiler;
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

function normalizeTiler(raw, fallbackIndex = 0) {
  const safe = raw && typeof raw === 'object' ? safeClone(raw) : {};
  let idCandidate = safe.id ?? safe.name ?? safe.label ?? fallbackIndex;
  if (typeof idCandidate === 'number') {
    idCandidate = String(idCandidate);
  }
  if (typeof idCandidate !== 'string') {
    idCandidate = String(idCandidate ?? fallbackIndex);
  }
  const normalizedId = idCandidate.trim() || `tiler_${fallbackIndex}`;
  const labelRaw = typeof safe.label === 'string' ? safe.label.trim() : '';
  const nameRaw = typeof safe.name === 'string' ? safe.name.trim() : '';
  const label = labelRaw || nameRaw || `Tiler ${normalizedId}`;
  const textureId = resolveTextureIdCandidate(safe);
  const layerId = typeof safe.layerId === 'string' ? safe.layerId.trim() : null;
  const left = toNumber(safe.left ?? safe.x ?? safe.area?.left ?? 0, 0);
  const top = toNumber(safe.top ?? safe.y ?? safe.topOffset ?? safe.area?.top ?? 0, 0);
  let width = toNumber(safe.width ?? safe.w ?? safe.area?.width ?? safe.size?.width, NaN);
  if (!Number.isFinite(width)) width = 1;
  width = Math.max(1, width);
  let height = toNumber(safe.height ?? safe.h ?? safe.area?.height ?? safe.size?.height, NaN);
  if (!Number.isFinite(height)) height = 1;
  height = Math.max(1, height);
  let tileWidth = toNumber(safe.tileWidth ?? safe.tileSize?.width ?? safe.tile ?? safe.tileSize, NaN);
  if (!Number.isFinite(tileWidth)) tileWidth = width;
  tileWidth = Math.max(1, tileWidth);
  let tileHeight = toNumber(safe.tileHeight ?? safe.tileSize?.height ?? safe.tile ?? safe.tileSize, NaN);
  if (!Number.isFinite(tileHeight)) tileHeight = height;
  tileHeight = Math.max(1, tileHeight);
  const offsetX = toNumber(safe.offset?.x ?? safe.offsetX ?? 0, 0);
  const offsetY = toNumber(safe.offset?.y ?? safe.offsetY ?? 0, 0);
  const spacingX = toNumber(safe.spacing?.x ?? safe.spacingX ?? 0, 0);
  const spacingY = toNumber(safe.spacing?.y ?? safe.spacingY ?? 0, 0);
  const rotationDeg = toNumber(safe.rotationDeg ?? safe.rotation ?? 0, 0);
  const mode = typeof safe.mode === 'string' ? safe.mode.trim().toLowerCase() : 'repeat';
  const flipX = typeof safe.flip === 'object' ? !!safe.flip.x : !!safe.flipX;
  const flipY = typeof safe.flip === 'object' ? !!safe.flip.y : !!safe.flipY;
  let opacity = toNumber(safe.opacity, 1);
  if (!Number.isFinite(opacity)) opacity = 1;
  opacity = Math.min(1, Math.max(0, opacity));
  const colliderRef = safe.sourceColliderId ?? safe.colliderId ?? null;
  const sourceColliderId = colliderRef == null ? null : String(colliderRef);
  const meta = safe.meta ? safeClone(safe.meta) : {};

  return {
    id: normalizedId,
    label,
    textureId: textureId || null,
    layerId,
    mode: mode || 'repeat',
    area: {
      left,
      top,
      width,
      height,
    },
    tileSize: {
      width: tileWidth,
      height: tileHeight,
    },
    offset: {
      x: offsetX,
      y: offsetY,
    },
    spacing: {
      x: spacingX,
      y: spacingY,
    },
    rotationDeg,
    flip: {
      x: !!flipX,
      y: !!flipY,
    },
    opacity,
    sourceColliderId,
    meta,
  };
}

function resolveTextureIdCandidate(record) {
  const candidates = [
    record.textureId,
    record.texture,
    record.spriteId,
    record.sprite,
    record.imageId,
    record.image,
    record.sourceId,
    record.source,
    record.tilesetId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const text = candidate.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

function safeClone(value) {
  if (!value || typeof value !== 'object') return value ?? null;
  try {
    return structuredClone(value);
  } catch {
    return JSON.parse(JSON.stringify(value));
  }
}

export default convertLayoutToArea;
