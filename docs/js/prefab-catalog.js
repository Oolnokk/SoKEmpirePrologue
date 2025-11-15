const manifestCache = new Map();
const prefabCache = new Map();

const NO_FETCH_ERROR = new Error('fetch is unavailable in this environment');

let customJsonImportLoader = null;
let nativeJsonImportAvailable = undefined;
let jsonImportWarningLogged = false;

export function __setJsonImportLoader(loader) {
  if (typeof loader === 'function') {
    customJsonImportLoader = loader;
  } else {
    customJsonImportLoader = null;
  }
}

function shouldUseJsonFallback(url) {
  if (typeof url !== 'string') return false;
  const normalized = url.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('file:')) {
    return true;
  }
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    return true;
  }
  return false;
}

async function importJsonWithFallback(url) {
  if (!shouldUseJsonFallback(url)) {
    return null;
  }

  const loader = customJsonImportLoader
    || (nativeJsonImportAvailable === false
      ? null
      : ((target) => import(/* webpackIgnore: true */ target, { assert: { type: 'json' } })));

  if (!loader) {
    const xhrResult = await loadJsonWithXhr(url);
    return xhrResult;
  }

  try {
    const module = await loader(url);
    if (!customJsonImportLoader) {
      nativeJsonImportAvailable = true;
    }
    const data = module && typeof module === 'object' && 'default' in module ? module.default : module;
    return data ?? null;
  } catch (error) {
    if (!customJsonImportLoader) {
      nativeJsonImportAvailable = false;
      if (!jsonImportWarningLogged && typeof console?.warn === 'function') {
        jsonImportWarningLogged = true;
        console.warn('[prefab-catalog] JSON module import fallback failed', { url, error });
      }
    }
    const xhrResult = await loadJsonWithXhr(url);
    if (xhrResult != null) {
      return xhrResult;
    }
    return null;
  }
}

async function loadJsonWithXhr(url) {
  if (typeof XMLHttpRequest !== 'function') {
    return null;
  }

  return new Promise((resolve) => {
    try {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      try {
        xhr.responseType = 'json';
      } catch (_err) {
        // Some environments do not allow setting responseType for local files.
      }
      if (typeof xhr.overrideMimeType === 'function') {
        xhr.overrideMimeType('application/json');
      }
      xhr.onload = () => {
        if (xhr.status && xhr.status !== 200) {
          resolve(null);
          return;
        }
        if (xhr.responseType === 'json' && xhr.response != null) {
          resolve(xhr.response);
          return;
        }
        try {
          const text = xhr.responseText ?? '';
          resolve(text ? JSON.parse(text) : null);
        } catch (_parseError) {
          resolve(null);
        }
      };
      xhr.onerror = () => resolve(null);
      xhr.send();
    } catch (_error) {
      resolve(null);
    }
  });
}

const PREFAB_TYPES = new Set(['structure', 'obstruction']);
const OBSTRUCTION_NEAR_PLANE = Object.freeze({
  id: 'obstruction:near',
  label: 'Obstruction Near Plane',
  priority: 10_000,
  locked: true,
});
const OBSTRUCTION_FAR_PLANE = Object.freeze({
  id: 'obstruction:far',
  label: 'Obstruction Far Plane',
  priority: -10_000,
  locked: true,
});

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function toFiniteNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizePrefabTags(rawTags, ensureObstructionTag = false) {
  const result = [];
  const seen = new Set();
  const source = Array.isArray(rawTags) ? rawTags : [];
  for (const entry of source) {
    const normalized = typeof entry === 'string' ? entry.trim() : String(entry ?? '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(normalized);
  }
  if (ensureObstructionTag && !seen.has('obstruction')) {
    result.push('obstruction');
  }
  return result;
}

function normalizeCollisionBox(raw = {}) {
  const box = typeof raw === 'object' && raw ? raw : {};
  let width = toFiniteNumber(box.width ?? box.w, 0);
  let height = toFiniteNumber(box.height ?? box.h, 0);
  let offsetX = toFiniteNumber(box.offsetX ?? box.x ?? box.left, 0);
  let offsetY = toFiniteNumber(box.offsetY ?? box.y ?? box.top, 0);

  if (!Number.isFinite(width)) width = 0;
  if (!Number.isFinite(height)) height = 0;
  if (!Number.isFinite(offsetX)) offsetX = 0;
  if (!Number.isFinite(offsetY)) offsetY = 0;

  if (width < 0) {
    width = Math.abs(width);
  }
  if (height < 0) {
    height = Math.abs(height);
  }

  return {
    width,
    height,
    offsetX,
    offsetY,
  };
}

function normalizeCollisionConfig(raw = {}) {
  const cfg = typeof raw === 'object' && raw ? raw : {};
  const enabled = !!(cfg.enabled ?? cfg.active ?? cfg.collides);
  const boxSource = typeof cfg.box === 'object' && cfg.box ? cfg.box : cfg;
  const box = normalizeCollisionBox(boxSource);
  return {
    enabled,
    box,
  };
}

function normalizePhysicsConfig(raw = {}) {
  const cfg = typeof raw === 'object' && raw ? raw : {};
  const enabled = !!(cfg.enabled ?? cfg.dynamic ?? cfg.movable);
  const dynamic = enabled ? !!(cfg.dynamic ?? cfg.mode === 'dynamic' ?? cfg.movable) : false;
  const mass = dynamic ? Math.max(0, toFiniteNumber(cfg.mass, 1)) : null;
  const drag = dynamic ? Math.max(0, toFiniteNumber(cfg.drag ?? cfg.damping, 0)) : null;
  return {
    enabled,
    dynamic,
    mass,
    drag,
  };
}

function clonePlane(plane) {
  return {
    id: plane.id,
    label: plane.label,
    priority: plane.priority,
    locked: plane.locked,
  };
}

function normalizeObstructionDetails(raw = {}) {
  const cfg = typeof raw === 'object' && raw ? raw : {};
  return {
    planes: {
      near: clonePlane(OBSTRUCTION_NEAR_PLANE),
      far: clonePlane(OBSTRUCTION_FAR_PLANE),
    },
    collision: normalizeCollisionConfig(cfg.collision),
    physics: normalizePhysicsConfig(cfg.physics),
  };
}

function lockObstructionParts(parts) {
  if (!Array.isArray(parts)) return;
  parts.forEach((part) => {
    if (!part || typeof part !== 'object') return;
    const plane = part.layer === 'far' ? 'far' : 'near';
    part.layer = plane;
    if (!part.meta || typeof part.meta !== 'object') {
      part.meta = {};
    }
    const obstructionMeta = typeof part.meta.obstruction === 'object' && part.meta.obstruction
      ? { ...part.meta.obstruction }
      : {};
    obstructionMeta.plane = plane;
    obstructionMeta.renderLayer = plane === 'near' ? OBSTRUCTION_NEAR_PLANE.id : OBSTRUCTION_FAR_PLANE.id;
    obstructionMeta.priority = plane === 'near' ? OBSTRUCTION_NEAR_PLANE.priority : OBSTRUCTION_FAR_PLANE.priority;
    obstructionMeta.locked = true;
    part.meta.obstruction = obstructionMeta;
  });
}

export function normalizePrefabDefinition(prefab) {
  if (!prefab || typeof prefab !== 'object') {
    return prefab;
  }

  const rawType = typeof prefab.type === 'string' ? prefab.type.trim().toLowerCase() : '';
  const type = PREFAB_TYPES.has(rawType) ? rawType : 'structure';
  prefab.type = type;

  if (type === 'obstruction') {
    prefab.tags = normalizePrefabTags(prefab.tags, true);
    prefab.obstruction = normalizeObstructionDetails(prefab.obstruction);
    lockObstructionParts(prefab.parts);
  } else {
    prefab.tags = normalizePrefabTags(prefab.tags, false);
  }

  return prefab;
}

function getFetchImplementation(customFetch) {
  if (typeof customFetch === 'function') return customFetch;
  if (typeof fetch === 'function') return fetch.bind(globalThis);
  throw NO_FETCH_ERROR;
}

async function fetchJson(url, fetchImpl) {
  try {
    const response = await fetchImpl(url, { cache: 'no-cache' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return response.json();
  } catch (error) {
    const fallback = await importJsonWithFallback(url);
    if (fallback != null) {
      return fallback;
    }
    throw error;
  }
}

const ABSOLUTE_URL_PATTERN = /^(?:[a-z][a-z\d+\-.]*:|\/\/)/i;

function resolveAssetUrl(url, prefabUrl) {
  if (typeof url !== 'string') return url;
  const trimmed = url.trim();
  if (!trimmed || ABSOLUTE_URL_PATTERN.test(trimmed) || trimmed.startsWith('data:')) {
    return trimmed;
  }

  const docBase = (typeof document !== 'undefined' && typeof document.baseURI === 'string' && document.baseURI)
    ? document.baseURI
    : null;

  if (docBase) {
    try {
      return new URL(trimmed, docBase).href;
    } catch (_err) {
      // fall through to prefab-relative resolution
    }
  }

  if (prefabUrl) {
    try {
      const baseUrl = new URL(prefabUrl);
      const path = baseUrl.pathname || '';
      const configIndex = path.indexOf('/config/');
      if (configIndex !== -1) {
        const rootPath = path.slice(0, configIndex + 1) || '/';
        const rootBase = new URL(rootPath, baseUrl.origin);
        return new URL(trimmed.replace(/^\.\//, ''), rootBase).href;
      }
    } catch (_err) {
      // fall through to direct prefab-relative resolution
    }

    try {
      return new URL(trimmed, prefabUrl).href;
    } catch (_err) {
      // ignore – we'll fall back to the raw trimmed string
    }
  }

  return trimmed;
}

function normalizePrefabAssetUrls(prefab, prefabUrl) {
  if (!prefab || typeof prefab !== 'object') return prefab;

  const normalizePart = (part) => {
    if (!part || typeof part !== 'object') return;
    const template = part.propTemplate && typeof part.propTemplate === 'object'
      ? part.propTemplate
      : null;
    if (!template) return;
    if (typeof template.url === 'string') {
      const resolved = resolveAssetUrl(template.url, prefabUrl);
      if (resolved) {
        template.url = resolved;
      }
    }
  };

  normalizePart(prefab.base);
  if (Array.isArray(prefab.parts)) {
    prefab.parts.forEach(normalizePart);
  }

  return prefab;
}

function normalizeManifest(manifest, manifestUrl) {
  const entries = Array.isArray(manifest?.entries) ? manifest.entries : [];
  const catalog = {
    id: manifest?.id || manifest?.catalogId || manifestUrl,
    label: manifest?.label || manifest?.name || manifest?.title || 'Prefabs',
    url: manifestUrl,
    entries: [],
  };

  const normalizedEntries = [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object') continue;
    const rawId = entry.structureId || entry.id || entry.prefabId || entry.slug || null;
    const rawPath = entry.path || entry.url || entry.href || entry.source || null;
    if (!rawId || !rawPath) continue;
    const id = String(rawId);
    const resolvedUrl = new URL(rawPath, manifestUrl).href;
    const label = entry.label || entry.name || id;
    catalog.entries.push({ id, label, url: resolvedUrl });
    normalizedEntries.push({ id, url: resolvedUrl });
  }

  return { catalog, normalizedEntries };
}

async function loadManifest(url, fetchImpl) {
  const absoluteUrl = new URL(url, document.baseURI).href;
  if (manifestCache.has(absoluteUrl)) {
    return manifestCache.get(absoluteUrl);
  }

  const promise = (async () => {
    const json = await fetchJson(absoluteUrl, fetchImpl);
    return normalizeManifest(json, absoluteUrl);
  })();

  manifestCache.set(absoluteUrl, promise);
  return promise;
}

async function loadPrefab(url, fetchImpl) {
  const absoluteUrl = new URL(url, document.baseURI).href;
  if (prefabCache.has(absoluteUrl)) {
    return clone(prefabCache.get(absoluteUrl));
  }

  const json = await fetchJson(absoluteUrl, fetchImpl);
  const structureId = json?.structureId || json?.id;
  if (!structureId) {
    throw new Error('Prefab missing structureId');
  }
  const sanitized = clone({ ...json, structureId: String(structureId) });
  normalizePrefabDefinition(sanitized);
  normalizePrefabAssetUrls(sanitized, absoluteUrl);
  prefabCache.set(absoluteUrl, sanitized);
  return clone(sanitized);
}

export async function loadPrefabsFromManifests(manifestUrls, options = {}) {
  let fetchImpl;
  try {
    fetchImpl = getFetchImplementation(options.fetch);
  } catch (error) {
    fetchImpl = async () => {
      throw error;
    };
  }
  const prefabs = new Map();
  const catalogs = [];
  const errors = [];

  const uniqueManifests = Array.from(new Set((manifestUrls || []).filter((url) => typeof url === 'string' && url.trim())));
  for (const manifestUrl of uniqueManifests) {
    try {
      const { catalog, normalizedEntries } = await loadManifest(manifestUrl, fetchImpl);
      catalogs.push(catalog);
      for (const { id, url } of normalizedEntries) {
        if (prefabs.has(id)) {
          continue;
        }
        try {
          const prefab = await loadPrefab(url, fetchImpl);
          prefabs.set(id, prefab);
        } catch (error) {
          errors.push({ type: 'prefab', id, url, error });
        }
      }
    } catch (error) {
      errors.push({ type: 'manifest', url: manifestUrl, error });
    }
  }

  return { prefabs, catalogs, errors };
}

export function createPrefabResolver(prefabMap) {
  if (!(prefabMap instanceof Map)) {
    return () => null;
  }
  return (prefabId) => {
    if (!prefabId) return null;
    const prefab = prefabMap.get(prefabId);
    return prefab ? clone(prefab) : null;
  };
}

export function summarizeLoadErrors(errors = []) {
  if (!Array.isArray(errors) || !errors.length) {
    return null;
  }
  const manifestErrors = errors.filter((entry) => entry?.type === 'manifest');
  const prefabErrors = errors.filter((entry) => entry?.type === 'prefab');
  const lines = [];
  if (manifestErrors.length) {
    lines.push('Manifest failures:');
    manifestErrors.forEach((entry) => {
      const reason = entry?.error?.message || 'unknown error';
      lines.push(` • ${entry.url} (${reason})`);
    });
  }
  if (prefabErrors.length) {
    lines.push('Prefab failures:');
    prefabErrors.forEach((entry) => {
      const reason = entry?.error?.message || 'unknown error';
      lines.push(` • ${entry.id || 'unknown'} from ${entry.url} (${reason})`);
    });
  }
  return lines.join('\n');
}

