const manifestCache = new Map();
const prefabCache = new Map();

const NO_FETCH_ERROR = new Error('fetch is unavailable in this environment');

function clone(value) {
  return value == null ? null : JSON.parse(JSON.stringify(value));
}

function getFetchImplementation(customFetch) {
  if (typeof customFetch === 'function') return customFetch;
  if (typeof fetch === 'function') return fetch.bind(globalThis);
  throw NO_FETCH_ERROR;
}

async function fetchJson(url, fetchImpl) {
  const response = await fetchImpl(url, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
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
  normalizePrefabAssetUrls(sanitized, absoluteUrl);
  prefabCache.set(absoluteUrl, sanitized);
  return clone(sanitized);
}

export async function loadPrefabsFromManifests(manifestUrls, options = {}) {
  const fetchImpl = getFetchImplementation(options.fetch);
  const prefabs = new Map();
  const catalogs = [];
  const errors = [];

  const uniqueManifests = Array.from(new Set((manifestUrls || []).filter((url) => typeof url === 'string' && url.trim())));
  await Promise.all(uniqueManifests.map(async (manifestUrl) => {
    try {
      const { catalog, normalizedEntries } = await loadManifest(manifestUrl, fetchImpl);
      catalogs.push(catalog);
      await Promise.all(normalizedEntries.map(async ({ id, url }) => {
        try {
          if (prefabs.has(id)) {
            return;
          }
          const prefab = await loadPrefab(url, fetchImpl);
          prefabs.set(id, prefab);
        } catch (error) {
          errors.push({ type: 'prefab', id, url, error });
        }
      }));
    } catch (error) {
      errors.push({ type: 'manifest', url: manifestUrl, error });
    }
  }));

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

