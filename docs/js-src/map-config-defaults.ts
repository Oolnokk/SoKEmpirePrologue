export const HARD_DEFAULT_LAYOUT_ID = 'defaultdistrict';
export const HARD_PREVIEW_STORAGE_PREFIX = 'sok-map-editor-preview:';

type MapConfig = Record<string, unknown> & {
  defaultLayoutId?: string;
  previewStoragePrefix?: string;
};

type LayoutLike = { id?: string | null } | null | undefined;

function coerceMapConfig(input?: MapConfig | null): MapConfig {
  if (input && typeof input === 'object') return input;
  if (typeof window !== 'undefined' && window.CONFIG && typeof window.CONFIG === 'object') {
    return (window.CONFIG as { map?: MapConfig }).map || {};
  }
  return {};
}

export function resolveDefaultLayoutId(mapConfig?: MapConfig | null): string {
  const safeConfig = coerceMapConfig(mapConfig);
  const preferred = typeof safeConfig.defaultLayoutId === 'string' && safeConfig.defaultLayoutId.trim()
    ? safeConfig.defaultLayoutId.trim()
    : null;
  return preferred || HARD_DEFAULT_LAYOUT_ID;
}

export function resolvePreviewStoragePrefix(mapConfig?: MapConfig | null): string {
  const safeConfig = coerceMapConfig(mapConfig);
  const preferred = typeof safeConfig.previewStoragePrefix === 'string' && safeConfig.previewStoragePrefix.trim()
    ? safeConfig.previewStoragePrefix.trim()
    : null;
  return preferred || HARD_PREVIEW_STORAGE_PREFIX;
}

export function pickDefaultLayoutEntry<T extends LayoutLike>(layouts: T[] | null | undefined, mapConfig?: MapConfig | null): T | null {
  if (!Array.isArray(layouts) || !layouts.length) return null;
  const preferredId = resolveDefaultLayoutId(mapConfig);
  const findById = (id: string | null | undefined) => (typeof id === 'string' && id)
    ? layouts.find((entry) => (entry as LayoutLike)?.id === id) ?? null
    : null;
  return findById(preferredId)
    || findById(HARD_DEFAULT_LAYOUT_ID)
    || layouts.find((entry) => !!(entry as LayoutLike)?.id) ?? null;
}

export const MAP_CONFIG_DEFAULTS = {
  defaultLayoutId: resolveDefaultLayoutId(),
  previewStoragePrefix: resolvePreviewStoragePrefix(),
};

if (typeof window !== 'undefined') {
  (window as typeof window & Record<string, unknown>).MAP_CONFIG_DEFAULTS = MAP_CONFIG_DEFAULTS;
  (window as typeof window & Record<string, unknown>).resolveDefaultLayoutId = resolveDefaultLayoutId;
  (window as typeof window & Record<string, unknown>).resolvePreviewStoragePrefix = resolvePreviewStoragePrefix;
  (window as typeof window & Record<string, unknown>).pickDefaultLayoutEntry = pickDefaultLayoutEntry;
}
