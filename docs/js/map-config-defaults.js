export const HARD_DEFAULT_LAYOUT_ID = 'defaultdistrict';
export const HARD_PREVIEW_STORAGE_PREFIX = 'sok-map-editor-preview:';
export const HARD_DEFAULT_CANVAS_HEIGHT = 460;
export const HARD_DEFAULT_GROUND_OFFSET = 140;
function getRootConfig() {
    if (typeof window !== 'undefined' && window.CONFIG && typeof window.CONFIG === 'object') {
        return window.CONFIG;
    }
    return null;
}
function coerceMapConfig(input) {
    if (input && typeof input === 'object')
        return input;
    const rootConfig = getRootConfig();
    if (rootConfig?.map && typeof rootConfig.map === 'object')
        return rootConfig.map;
    return {};
}
function coerceMapEditorConfig(mapConfig) {
    const editorFromMap = mapConfig && typeof mapConfig === 'object'
        ? mapConfig.editor
        : null;
    if (editorFromMap && typeof editorFromMap === 'object')
        return editorFromMap;
    const rootConfig = getRootConfig();
    const editorFromRoot = rootConfig?.mapEditor;
    if (editorFromRoot && typeof editorFromRoot === 'object')
        return editorFromRoot;
    const editorFromRootMap = rootConfig?.map && typeof rootConfig.map === 'object'
        ? rootConfig.map.editor
        : null;
    if (editorFromRootMap && typeof editorFromRootMap === 'object')
        return editorFromRootMap;
    return {};
}
function coerceCustomArea(config) {
    if (config && typeof config === 'object')
        return config;
    return {};
}
const HARD_DEFAULT_CUSTOM_AREA_ENTRY = {
    id: 'custom_area',
    label: 'Empty Layout',
    path: null,
    areaName: 'Custom Area',
};
function normalizeFinitePositive(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0)
        return num;
    return null;
}
function normalizeFiniteNonNegative(value) {
    const num = Number(value);
    if (Number.isFinite(num) && num >= 0)
        return num;
    return null;
}
function normalizeGroundRatio(value) {
    const ratio = Number(value);
    if (Number.isFinite(ratio) && ratio > 0 && ratio < 1)
        return ratio;
    return null;
}
export function resolveCanvasHeight(mapConfig) {
    const editorConfig = coerceMapEditorConfig(mapConfig);
    const rootConfig = getRootConfig();
    const fallbackCanvas = rootConfig?.canvas;
    const candidates = [
        editorConfig.canvas?.height,
        editorConfig.canvas?.h,
        fallbackCanvas?.height,
        fallbackCanvas?.h,
        mapConfig?.canvas?.height,
        mapConfig?.canvas?.h,
    ];
    const valid = candidates.map(normalizeFinitePositive).find((value) => value != null);
    return valid ?? HARD_DEFAULT_CANVAS_HEIGHT;
}
export function resolveGroundRatio(mapConfig, canvasHeight, groundOffset) {
    const editorConfig = coerceMapEditorConfig(mapConfig);
    const rootConfig = getRootConfig();
    const candidates = [
        editorConfig.ground?.ratio,
        rootConfig?.ground?.ratio,
        rootConfig?.groundRatio,
        mapConfig?.ground?.ratio,
    ];
    const valid = candidates.map(normalizeGroundRatio).find((value) => value != null);
    if (valid != null)
        return valid;
    const safeCanvasHeight = normalizeFinitePositive(canvasHeight) ?? resolveCanvasHeight(mapConfig);
    const safeOffset = normalizeFiniteNonNegative(groundOffset)
        ?? normalizeFiniteNonNegative(editorConfig.ground?.offset)
        ?? normalizeFiniteNonNegative(rootConfig?.ground?.offset);
    if (safeCanvasHeight > 0 && safeOffset != null) {
        const derived = (safeCanvasHeight - safeOffset) / safeCanvasHeight;
        return normalizeGroundRatio(derived);
    }
    return null;
}
export function resolveGroundOffset(mapConfig, canvasHeight) {
    const editorConfig = coerceMapEditorConfig(mapConfig);
    const rootConfig = getRootConfig();
    const offsetCandidates = [
        editorConfig.ground?.offset,
        rootConfig?.ground?.offset,
        mapConfig?.ground?.offset,
    ];
    const configured = offsetCandidates.map(normalizeFiniteNonNegative).find((value) => value != null);
    if (configured != null)
        return configured;
    const safeCanvasHeight = normalizeFinitePositive(canvasHeight) ?? resolveCanvasHeight(mapConfig);
    const ratio = resolveGroundRatio(mapConfig, safeCanvasHeight, null);
    if (ratio != null && safeCanvasHeight > 0) {
        return Math.max(0, Math.round(safeCanvasHeight * (1 - ratio)));
    }
    return HARD_DEFAULT_GROUND_OFFSET;
}
export function resolveCustomAreaEntry(mapConfig) {
    const editorConfig = coerceMapEditorConfig(mapConfig);
    const source = coerceCustomArea(editorConfig.customArea);
    const fallback = HARD_DEFAULT_CUSTOM_AREA_ENTRY;
    const id = typeof source.id === 'string' && source.id.trim() ? source.id.trim() : fallback.id;
    const label = typeof source.label === 'string' && source.label.trim() ? source.label.trim() : fallback.label;
    const areaName = typeof source.areaName === 'string' && source.areaName.trim()
        ? source.areaName.trim()
        : (label || fallback.areaName);
    const path = typeof source.path === 'string' && source.path.trim() ? source.path.trim() : null;
    return { id, label: label || fallback.label, areaName: areaName || fallback.areaName, path };
}
export function resolveMapEditorDefaults(mapConfig) {
    const canvasHeight = resolveCanvasHeight(mapConfig);
    const groundOffset = resolveGroundOffset(mapConfig, canvasHeight);
    const groundRatio = resolveGroundRatio(mapConfig, canvasHeight, groundOffset);
    const customArea = resolveCustomAreaEntry(mapConfig);
    return { canvasHeight, groundOffset, groundRatio, customArea };
}
export function resolveDefaultLayoutId(mapConfig) {
    const safeConfig = coerceMapConfig(mapConfig);
    const preferred = typeof safeConfig.defaultLayoutId === 'string' && safeConfig.defaultLayoutId.trim()
        ? safeConfig.defaultLayoutId.trim()
        : null;
    return preferred || HARD_DEFAULT_LAYOUT_ID;
}
export function resolvePreviewStoragePrefix(mapConfig) {
    const safeConfig = coerceMapConfig(mapConfig);
    const preferred = typeof safeConfig.previewStoragePrefix === 'string' && safeConfig.previewStoragePrefix.trim()
        ? safeConfig.previewStoragePrefix.trim()
        : null;
    return preferred || HARD_PREVIEW_STORAGE_PREFIX;
}
export function pickDefaultLayoutEntry(layouts, mapConfig) {
    if (!Array.isArray(layouts) || !layouts.length)
        return null;
    const preferredId = resolveDefaultLayoutId(mapConfig);
    const findById = (id) => (typeof id === 'string' && id)
        ? layouts.find((entry) => entry?.id === id) ?? null
        : null;
    return (findById(preferredId)
        || findById(HARD_DEFAULT_LAYOUT_ID)
        || layouts.find((entry) => !!entry?.id)) ?? null;
}
export const MAP_CONFIG_DEFAULTS = {
    defaultLayoutId: resolveDefaultLayoutId(),
    previewStoragePrefix: resolvePreviewStoragePrefix(),
    mapEditor: resolveMapEditorDefaults(),
};
if (typeof window !== 'undefined') {
    window.MAP_CONFIG_DEFAULTS = MAP_CONFIG_DEFAULTS;
    window.resolveDefaultLayoutId = resolveDefaultLayoutId;
    window.resolvePreviewStoragePrefix = resolvePreviewStoragePrefix;
    window.pickDefaultLayoutEntry = pickDefaultLayoutEntry;
    window.resolveCanvasHeight = resolveCanvasHeight;
    window.resolveGroundOffset = resolveGroundOffset;
    window.resolveGroundRatio = resolveGroundRatio;
    window.resolveCustomAreaEntry = resolveCustomAreaEntry;
    window.resolveMapEditorDefaults = resolveMapEditorDefaults;
}
