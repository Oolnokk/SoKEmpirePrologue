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

