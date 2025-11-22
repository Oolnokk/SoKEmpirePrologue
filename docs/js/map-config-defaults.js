const HARD_DEFAULT_LAYOUT_ID = 'defaultdistrict';
const HARD_PREVIEW_STORAGE_PREFIX = 'sok-map-editor-preview:';

function coerceMapConfig(input){
  if (input && typeof input === 'object') return input;
  if (typeof window !== 'undefined' && window.CONFIG && typeof window.CONFIG === 'object') {
    return window.CONFIG.map || {};
  }
  return {};
}

function resolveDefaultLayoutId(mapConfig){
  const safeConfig = coerceMapConfig(mapConfig);
  const preferred = typeof safeConfig.defaultLayoutId === 'string' && safeConfig.defaultLayoutId.trim()
    ? safeConfig.defaultLayoutId.trim()
    : null;
  return preferred || HARD_DEFAULT_LAYOUT_ID;
}

function resolvePreviewStoragePrefix(mapConfig){
  const safeConfig = coerceMapConfig(mapConfig);
  const preferred = typeof safeConfig.previewStoragePrefix === 'string' && safeConfig.previewStoragePrefix.trim()
    ? safeConfig.previewStoragePrefix.trim()
    : null;
  return preferred || HARD_PREVIEW_STORAGE_PREFIX;
}

function pickDefaultLayoutEntry(layouts, mapConfig){
  if (!Array.isArray(layouts) || !layouts.length) return null;
  const preferredId = resolveDefaultLayoutId(mapConfig);
  const findById = (id) => typeof id === 'string' && id ? layouts.find((entry) => entry?.id === id) || null : null;
  return findById(preferredId)
    || findById(HARD_DEFAULT_LAYOUT_ID)
    || layouts.find((entry) => entry && entry.id) || null;
}

const MAP_CONFIG_DEFAULTS = {
  defaultLayoutId: resolveDefaultLayoutId(),
  previewStoragePrefix: resolvePreviewStoragePrefix(),
};

if (typeof window !== 'undefined') {
  window.MAP_CONFIG_DEFAULTS = MAP_CONFIG_DEFAULTS;
  window.resolveDefaultLayoutId = resolveDefaultLayoutId;
  window.resolvePreviewStoragePrefix = resolvePreviewStoragePrefix;
  window.pickDefaultLayoutEntry = pickDefaultLayoutEntry;
}

export {
  HARD_DEFAULT_LAYOUT_ID,
  HARD_PREVIEW_STORAGE_PREFIX,
  MAP_CONFIG_DEFAULTS,
  pickDefaultLayoutEntry,
  resolveDefaultLayoutId,
  resolvePreviewStoragePrefix,
};
