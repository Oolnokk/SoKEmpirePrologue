import { GeometryService, MapRegistry, adaptLegacyLayoutGeometry, adaptSceneGeometry, convertLayoutToArea, } from './vendor/map-runtime.js';
import { loadPrefabsFromManifests, createPrefabResolver, summarizeLoadErrors } from './prefab-catalog.js';
const FALLBACK_LAYOUT_PATH = '../config/maps/gameplaymaps/defaultdistrict3d_gameplaymap.json';
const FALLBACK_AREA_ID = 'defaultdistrict3d';
const FALLBACK_AREA_NAME = 'DefaultDistrict3D';
const FALLBACK_PREVIEW_STORAGE_PREFIX = 'sok-map-editor-preview:';
const AREA_NAME_ELEMENT_ID = 'areaName';
const AREA_OVERLAY_UNSUB_KEY = '__sokAreaNameOverlayUnsub__';
const PLAYABLE_BOUNDS_UNSUB_KEY = '__sokPlayableBoundsSyncUnsub__';
function getAreaNameElement() {
    if (typeof document === 'undefined')
        return null;
    const element = document.getElementById(AREA_NAME_ELEMENT_ID);
    if (!element)
        return null;
    if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
        return element;
    }
    return element?.nodeType === 1 ? element : null;
}
function updateAreaNameOverlay(area) {
    const element = getAreaNameElement();
    if (!element)
        return;
    if (!area) {
        element.textContent = '';
        element.setAttribute('aria-hidden', 'true');
        if (element.style) {
            element.style.display = 'none';
        }
        if ('dataset' in element) {
            element.dataset.areaId = '';
            element.dataset.areaName = '';
        }
        return;
    }
    const resolvedName = typeof area.meta?.areaName === 'string' && area.meta.areaName.trim()
        ? area.meta.areaName.trim()
        : (area.name || area.id);
    element.textContent = resolvedName;
    element.setAttribute('aria-hidden', 'false');
    if (element.style) {
        element.style.display = '';
    }
    if ('dataset' in element) {
        element.dataset.areaId = area.id;
        element.dataset.areaName = resolvedName;
    }
}
function bindAreaNameOverlay(registry) {
    if (typeof window === 'undefined') {
        updateAreaNameOverlay(registry?.getActiveArea?.() ?? null);
        return;
    }
    const globalWindow = window;
    const previous = globalWindow[AREA_OVERLAY_UNSUB_KEY];
    if (typeof previous === 'function') {
        try {
            previous();
        }
        catch (error) {
            console.warn('[map-bootstrap] Failed to remove previous area overlay listener', error);
        }
        globalWindow[AREA_OVERLAY_UNSUB_KEY] = undefined;
    }
    if (typeof registry?.on === 'function') {
        const unsubscribe = registry.on('active-area-changed', (activeArea) => {
            updateAreaNameOverlay(activeArea);
        });
        globalWindow[AREA_OVERLAY_UNSUB_KEY] = unsubscribe;
    }
    updateAreaNameOverlay(registry?.getActiveArea?.() ?? null);
}
function bindPlayableBoundsSync(registry) {
    if (typeof window === 'undefined') {
        syncConfigPlayableBounds(registry?.getActiveArea?.() ?? null);
        return;
    }
    const globalWindow = window;
    const previous = globalWindow[PLAYABLE_BOUNDS_UNSUB_KEY];
    if (typeof previous === 'function') {
        try {
            previous();
        }
        catch (error) {
            console.warn('[map-bootstrap] Failed to remove previous playable bounds listener', error);
        }
        globalWindow[PLAYABLE_BOUNDS_UNSUB_KEY] = undefined;
    }
    if (typeof registry?.on === 'function') {
        const unsubscribe = registry.on('active-area-changed', (activeArea) => {
            syncConfigPlayableBounds(activeArea);
        });
        globalWindow[PLAYABLE_BOUNDS_UNSUB_KEY] = unsubscribe;
    }
    syncConfigPlayableBounds(registry?.getActiveArea?.() ?? null);
}
function resolveGameContainer() {
    if (typeof window !== 'undefined') {
        const GAME = window.GAME || {};
        window.GAME = GAME;
        return GAME;
    }
    const globalRef = globalThis;
    globalRef.GAME = globalRef.GAME || {};
    return globalRef.GAME;
}
function ensureGeometryService() {
    const GAME = resolveGameContainer();
    const existing = GAME.geometryService;
    if (existing instanceof GeometryService) {
        return existing;
    }
    const service = new GeometryService({ logger: console });
    GAME.geometryService = service;
    return service;
}
function registerAreaGeometry(area) {
    if (!area)
        return;
    const service = ensureGeometryService();
    try {
        const geometry = area.geometry
            ? adaptSceneGeometry(area.geometry)
            : adaptLegacyLayoutGeometry({
                playableBounds: area.playableBounds,
                colliders: area.colliders,
            }, area.warnings);
        service.registerGeometry(area.id, geometry, { allowDerivedPlayableBounds: true });
        service.setActiveArea(area.id);
    }
    catch (error) {
        console.warn('[map-bootstrap] Failed to register geometry for area', { id: area?.id, error });
    }
}
function bindGeometryService(registry) {
    const service = ensureGeometryService();
    if (typeof registry?.on === 'function') {
        registry.on('active-area-changed', (activeArea) => {
            const activeId = activeArea?.id ?? null;
            if (activeId && !service.getGeometry(activeId)) {
                registerAreaGeometry(activeArea);
            }
            service.setActiveArea(activeId);
        });
    }
    const activeArea = registry?.getActiveArea?.() ?? null;
    if (activeArea) {
        if (!service.getGeometry(activeArea.id)) {
            registerAreaGeometry(activeArea);
        }
        else {
            service.setActiveArea(activeArea.id);
        }
    }
}
function normalizeLayoutEntry(entry) {
    if (!entry || typeof entry !== 'object')
        return null;
    const record = entry;
    const path = typeof record.path === 'string' && record.path.trim() ? record.path.trim() : null;
    if (!path)
        return null;
    const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : null;
    const areaName = typeof record.areaName === 'string' && record.areaName.trim()
        ? record.areaName.trim()
        : label;
    const id = typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : typeof record.areaId === 'string' && record.areaId.trim()
            ? record.areaId.trim()
            : label || path.replace(/\.json$/i, '');
    return { id, path, areaName };
}
function resolveLayoutUrl(path, fallbackPath = FALLBACK_LAYOUT_PATH) {
    if (typeof path === 'string' && path.trim()) {
        try {
            const base = typeof window !== 'undefined' && window.location ? window.location.href : import.meta.url;
            return new URL(path, base);
        }
        catch (error) {
            console.warn('[map-bootstrap] Failed to resolve configured layout path', error);
        }
    }
    return new URL(fallbackPath, import.meta.url);
}
function resolveMapConfig() {
    const rawConfig = typeof window !== 'undefined'
        ? window.CONFIG
        : undefined;
    const mapConfig = rawConfig && typeof rawConfig === 'object' && rawConfig
        ? rawConfig.map
        : undefined;
    const mapConfigRecord = mapConfig && typeof mapConfig === 'object'
        ? mapConfig
        : {};
    const layouts = Array.isArray(mapConfigRecord.layouts)
        ? mapConfigRecord.layouts.map((entry) => normalizeLayoutEntry(entry)).filter((entry) => !!entry)
        : [];
    const preferredLayoutId = typeof mapConfigRecord.defaultLayoutId === 'string' && mapConfigRecord.defaultLayoutId.trim()
        ? mapConfigRecord.defaultLayoutId.trim()
        : FALLBACK_AREA_ID;
    const defaultLayoutEntry = layouts.find((entry) => entry.id === preferredLayoutId)
        || layouts.find((entry) => entry.id === FALLBACK_AREA_ID)
        || layouts[0]
        || null;
    const configuredLayoutPath = typeof mapConfigRecord.defaultLayoutPath === 'string' && mapConfigRecord.defaultLayoutPath.trim()
        ? mapConfigRecord.defaultLayoutPath.trim()
        : null;
    const defaultAreaId = typeof mapConfigRecord.defaultAreaId === 'string' && mapConfigRecord.defaultAreaId.trim()
        ? mapConfigRecord.defaultAreaId.trim()
        : defaultLayoutEntry?.id || FALLBACK_AREA_ID;
    const defaultAreaName = typeof mapConfigRecord.defaultAreaName === 'string' && mapConfigRecord.defaultAreaName.trim()
        ? mapConfigRecord.defaultAreaName.trim()
        : defaultLayoutEntry?.areaName || FALLBACK_AREA_NAME;
    const layoutUrl = resolveLayoutUrl(defaultLayoutEntry?.path || configuredLayoutPath, FALLBACK_LAYOUT_PATH);
    const previewStoragePrefix = typeof mapConfigRecord.previewStoragePrefix === 'string' && mapConfigRecord.previewStoragePrefix.trim()
        ? mapConfigRecord.previewStoragePrefix.trim()
        : FALLBACK_PREVIEW_STORAGE_PREFIX;
    const prefabManifests = Array.isArray(mapConfigRecord.prefabManifests)
        ? mapConfigRecord.prefabManifests.filter((entry) => typeof entry === 'string' && entry.trim())
        : [];
    return {
        mapConfig: mapConfigRecord,
        layouts,
        defaultLayoutEntry,
        defaultAreaId,
        defaultAreaName,
        layoutUrl,
        previewStoragePrefix,
        prefabManifests,
    };
}
const MAP_DEFAULTS = resolveMapConfig();
const MAP_CONFIG = MAP_DEFAULTS.mapConfig;
const CONFIG_LAYOUTS = MAP_DEFAULTS.layouts;
const DEFAULT_LAYOUT_ENTRY = MAP_DEFAULTS.defaultLayoutEntry;
const DEFAULT_AREA_ID = MAP_DEFAULTS.defaultAreaId;
const DEFAULT_AREA_NAME = MAP_DEFAULTS.defaultAreaName;
const layoutUrl = MAP_DEFAULTS.layoutUrl;
const PREVIEW_STORAGE_PREFIX = MAP_DEFAULTS.previewStoragePrefix;
const PREFAB_MANIFESTS = MAP_DEFAULTS.prefabManifests;
const prefabLibraryPromise = (async () => {
    if (!PREFAB_MANIFESTS.length) {
        return { prefabs: new Map(), errors: [] };
    }
    try {
        const result = await loadPrefabsFromManifests(PREFAB_MANIFESTS);
        if (result.errors?.length) {
            const summary = summarizeLoadErrors(result.errors);
            if (summary) {
                console.warn('[map-bootstrap] Some prefabs failed to load\n' + summary);
            }
        }
        return { prefabs: result.prefabs, errors: result.errors || [] };
    }
    catch (error) {
        console.error('[map-bootstrap] Failed to load prefab manifests', error);
        return { prefabs: new Map(), errors: [{ type: 'bootstrap', error }] };
    }
})();
function consumeEditorPreviewLayout(token) {
    if (!token)
        return null;
    try {
        if (typeof localStorage === 'undefined')
            return null;
        const key = PREVIEW_STORAGE_PREFIX + token;
        const raw = localStorage.getItem(key);
        if (!raw)
            return null;
        localStorage.removeItem(key);
        const payload = JSON.parse(raw);
        if (!payload || typeof payload !== 'object')
            return null;
        return { ...payload, token };
    }
    catch (error) {
        console.warn('[map-bootstrap] Unable to read preview payload', error);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.removeItem(PREVIEW_STORAGE_PREFIX + token);
            }
        }
        catch (_rmErr) {
            // ignore cleanup failures
        }
        return null;
    }
}
function normalizeAreaCollider(input, index) {
    const fallbackId = index + 1;
    const safe = (input && typeof input === 'object') ? input : {};
    const idRaw = safe.id;
    const id = typeof idRaw === 'number' && Number.isFinite(idRaw) ? idRaw : fallbackId;
    const labelRaw = safe.label;
    const label = typeof labelRaw === 'string' && labelRaw.trim() ? labelRaw.trim() : `Collider ${id}`;
    let left = Number(safe.left);
    if (!Number.isFinite(left)) {
        left = Number(safe.x);
    }
    if (!Number.isFinite(left)) {
        left = 0;
    }
    let width = Number(safe.width);
    const right = Number(safe.right);
    if (!Number.isFinite(width) && Number.isFinite(right)) {
        width = right - left;
    }
    if (!Number.isFinite(width)) {
        width = 120;
    }
    if (width < 0) {
        left += width;
        width = Math.abs(width);
    }
    let topOffset = Number(safe.topOffset);
    if (!Number.isFinite(topOffset)) {
        topOffset = Number(safe.top);
    }
    if (!Number.isFinite(topOffset)) {
        topOffset = Number(safe.y);
    }
    if (!Number.isFinite(topOffset)) {
        topOffset = 0;
    }
    let height = Number(safe.height);
    const bottomOffset = Number(safe.bottomOffset);
    const bottom = Number(safe.bottom);
    if (!Number.isFinite(height) && Number.isFinite(bottomOffset)) {
        height = bottomOffset - topOffset;
    }
    else if (!Number.isFinite(height) && Number.isFinite(bottom)) {
        height = bottom - topOffset;
    }
    if (!Number.isFinite(height)) {
        height = 40;
    }
    if (height < 0) {
        topOffset += height;
        height = Math.abs(height);
    }
    const meta = typeof safe.meta === 'object' && safe.meta
        ? { ...safe.meta }
        : undefined;
    return {
        id,
        label,
        type: 'box',
        left,
        width: Math.max(1, width),
        topOffset,
        height: Math.max(1, height),
        meta: meta ?? undefined,
    };
}
function isGroundRatioLocked(config) {
    if (!config || typeof config !== 'object')
        return false;
    const ground = config.ground;
    if (!ground || typeof ground !== 'object')
        return false;
    return ground.lockRatio === true;
}
function applyEditorPreviewSettings(area, { token = null, createdAt = null } = {}) {
    const GAME = (window.GAME = window.GAME || {});
    const CONFIG = (window.CONFIG = window.CONFIG || {});
    const preview = (GAME.editorPreview = {
        active: true,
        token,
        createdAt,
        areaId: area?.id || null,
        returnUrl: new URL('./map-editor.html', window.location.href).href,
    });
    if (area?.meta) {
        preview.areaMeta = { ...area.meta };
    }
    const canvasConfig = CONFIG.canvas || {};
    const canvasHeight = Number.isFinite(canvasConfig.h) ? canvasConfig.h : 460;
    const canvasWidth = Number.isFinite(canvasConfig.w) ? canvasConfig.w : 720;
    const scene = resolveSceneDescriptor(area);
    const groundOffset = Number(area?.ground?.offset);
    const normalizedColliders = Array.isArray(scene?.colliders)
        ? scene.colliders.map((col, index) => normalizeAreaCollider(col, index))
        : [];
    preview.platformColliders = normalizedColliders;
    const ratioLocked = isGroundRatioLocked(CONFIG);
    if (Number.isFinite(groundOffset) && canvasHeight > 0) {
        const ratioRaw = 1 - groundOffset / canvasHeight;
        const ratio = Math.max(0.1, Math.min(0.95, ratioRaw));
        const appliedRatio = ratioLocked
            ? (Number.isFinite(CONFIG.groundRatio) ? CONFIG.groundRatio : ratio)
            : ratio;
        if (!ratioLocked) {
            preview.previousGroundRatio = CONFIG.groundRatio;
            CONFIG.groundRatio = ratio;
        }
        preview.groundOffset = groundOffset;
        const groundY = canvasHeight * appliedRatio;
        const worldWidth = GAME?.CAMERA?.worldWidth || canvasWidth * 2;
        const colliderWidth = Math.max(worldWidth, canvasWidth * 2.5);
        const colliderHeight = Math.max(48, groundOffset + 32);
        const colliderLeft = -colliderWidth / 2;
        preview.groundCollider = {
            left: colliderLeft,
            top: groundY - 1,
            width: colliderWidth,
            height: colliderHeight,
        };
        preview.groundCollider.right = colliderLeft + colliderWidth;
        preview.groundCollider.bottom = preview.groundCollider.top + colliderHeight;
    }
}
function ensureParallaxContainer() {
    const parallax = (window.PARALLAX = window.PARALLAX || { layers: [], areas: {}, currentAreaId: null });
    parallax.areas = parallax.areas || {};
    parallax.layers = Array.isArray(parallax.layers) ? parallax.layers : [];
    return parallax;
}
function syncConfigGround(area) {
    const CONFIG = (window.CONFIG = window.CONFIG || {});
    const canvasConfig = CONFIG.canvas || {};
    const canvasHeight = Number.isFinite(canvasConfig.h) ? canvasConfig.h : 460;
    const rawOffset = Number(area?.ground?.offset);
    if (!Number.isFinite(rawOffset)) {
        return;
    }
    const offset = Math.max(0, rawOffset);
    const ratioLocked = isGroundRatioLocked(CONFIG);
    if (canvasHeight > 0) {
        const ratioRaw = 1 - offset / canvasHeight;
        const ratio = Math.max(0.1, Math.min(0.95, ratioRaw));
        const appliedRatio = ratioLocked
            ? (Number.isFinite(CONFIG.groundRatio) ? CONFIG.groundRatio : ratio)
            : ratio;
        if (!ratioLocked) {
            CONFIG.groundRatio = ratio;
        }
        CONFIG.groundY = Math.round(canvasHeight * appliedRatio);
    }
    CONFIG.ground = {
        ...(typeof CONFIG.ground === 'object' && CONFIG.ground ? CONFIG.ground : {}),
        offset,
    };
}
function syncConfigPlayableBounds(area) {
    const CONFIG = (window.CONFIG = window.CONFIG || {});
    const mapConfig = (CONFIG.map = typeof CONFIG.map === 'object' && CONFIG.map ? CONFIG.map : {});
    const initialBounds = (mapConfig.__initialPlayArea = mapConfig.__initialPlayArea || {
        minX: Number.isFinite(mapConfig.playAreaMinX) ? mapConfig.playAreaMinX : null,
        maxX: Number.isFinite(mapConfig.playAreaMaxX) ? mapConfig.playAreaMaxX : null,
    });
    const scene = resolveSceneDescriptor(area);
    const playable = scene?.playableBounds;
    const left = Number.isFinite(playable?.left) ? playable.left : null;
    const right = Number.isFinite(playable?.right) ? playable.right : null;
    if (left != null && right != null) {
        mapConfig.playableBounds = { ...playable, left, right };
        mapConfig.activePlayableBounds = mapConfig.playableBounds;
        mapConfig.playAreaMinX = left;
        mapConfig.playAreaMaxX = right;
        return;
    }
    mapConfig.playableBounds = null;
    mapConfig.activePlayableBounds = null;
    mapConfig.playAreaMinX = initialBounds.minX ?? null;
    mapConfig.playAreaMaxX = initialBounds.maxX ?? null;
}
function resolveSceneDescriptor(area) {
    if (!area) {
        return {
            geometry: { layers: [], instances: [] },
            colliders: [],
            spawnPoints: [],
            playableBounds: null,
        };
    }
    // Area objects already contain scene-like properties (geometry, colliders, spawnPoints, playableBounds)
    // This function provides a consistent interface for accessing them
    const areaRecord = area;
    return {
        geometry: areaRecord.geometry || { layers: [], instances: [] },
        colliders: areaRecord.colliders || [],
        spawnPoints: areaRecord.spawnPoints || [],
        playableBounds: areaRecord.playableBounds || null,
    };
}
function syncConfigPlatforming(area) {
    const CONFIG = (window.CONFIG = window.CONFIG || {});
    const scene = resolveSceneDescriptor(area);
    const normalized = Array.isArray(scene?.colliders)
        ? scene.colliders.map((col, index) => normalizeAreaCollider(col, index))
        : [];
    CONFIG.platformingColliders = normalized;
}
function adaptSceneToParallax(area) {
    const scene = resolveSceneDescriptor(area);
    return {
        id: area.id,
        name: area.name,
        source: area.source,
        camera: area.camera,
        ground: area.ground,
        background: area.background || area.meta?.background || null,
        layers: (scene.geometry?.layers || []).map((layer, index) => ({
            id: layer.id,
            name: layer.name,
            type: layer.type,
            parallax: layer.parallaxSpeed,
            scale: layer.scale,
            yOffset: layer.offsetY,
            sep: layer.separation,
            z: index,
            repeat: false,
            source: layer.source || null,
            meta: layer.meta || {},
        })),
        instances: scene.geometry?.instances || [],
        meta: area.meta,
    };
}
function applyArea(area) {
    const registry = (window.__MAP_REGISTRY__ instanceof MapRegistry)
        ? window.__MAP_REGISTRY__
        : new MapRegistry({ logger: console });
    registry.registerArea(area.id, area);
    registry.setActiveArea(area.id);
    window.__MAP_REGISTRY__ = registry;
    registerAreaGeometry(area);
    const parallax = ensureParallaxContainer();
    parallax.areas[area.id] = adaptSceneToParallax(area);
    parallax.currentAreaId = area.id;
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.areas = window.CONFIG.areas || {};
    window.CONFIG.areas[area.id] = parallax.areas[area.id];
    syncConfigGround(area);
    syncConfigPlatforming(area);
    window.GAME = window.GAME || {};
    window.GAME.mapRegistry = registry;
    window.GAME.currentAreaId = area.id;
    window.GAME.__onMapRegistryReadyForCamera?.(registry);
    bindAreaNameOverlay(registry);
    bindGeometryService(registry);
    bindPlayableBoundsSync(registry);
    console.info(`[map-bootstrap] Loaded area "${area.id}" (${area.source || 'unknown source'})`);
}
function applyPreviewLayout(descriptor, { previewToken = null, createdAt = null, prefabResolver, }) {
    if (!descriptor)
        return false;
    try {
        const record = (descriptor ?? {});
        const areaId = typeof record.areaId === 'string'
            ? record.areaId
            : typeof record.id === 'string'
                ? record.id
                : `editor_preview_${previewToken || 'area'}`;
        const areaName = typeof record.areaName === 'string'
            ? record.areaName
            : typeof record.name === 'string'
                ? record.name
                : 'Editor Preview';
        const area = convertLayoutToArea(descriptor, { areaId, areaName, prefabResolver });
        area.source = record.source || 'map-editor-preview';
        area.meta = {
            ...area.meta,
            editorPreview: true,
            previewToken: previewToken || null,
            previewCreatedAt: createdAt ?? null,
        };
        applyArea(area);
        applyEditorPreviewSettings(area, {
            token: previewToken || null,
            createdAt: createdAt ?? null,
        });
        console.info('[map-bootstrap] Loaded editor preview area');
        return true;
    }
    catch (error) {
        console.error('[map-bootstrap] Failed to apply editor preview layout', error);
        return false;
    }
}
function waitForPreviewMessage(previewToken, { timeoutMs = 3000 } = {}) {
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
        return Promise.resolve(null);
    }
    const expectedOrigin = window.location.origin;
    return new Promise((resolve) => {
        let settled = false;
        let timeoutId = null;
        const cleanup = () => {
            if (timeoutId != null) {
                window.clearTimeout(timeoutId);
                timeoutId = null;
            }
            window.removeEventListener('message', handleMessage);
        };
        const handleMessage = (event) => {
            const origin = event?.origin ?? '';
            if (expectedOrigin && expectedOrigin !== 'null' && origin && origin !== expectedOrigin) {
                return;
            }
            const data = event?.data;
            if (!data || data.type !== 'map-editor-preview')
                return;
            if (previewToken && data.token && data.token !== previewToken)
                return;
            settled = true;
            cleanup();
            const payload = data.payload || {};
            resolve({
                layout: payload?.layout || null,
                createdAt: payload?.createdAt ?? data.createdAt ?? null,
            });
        };
        window.addEventListener('message', handleMessage);
        if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
            timeoutId = window.setTimeout(() => {
                if (!settled) {
                    cleanup();
                    resolve(null);
                }
            }, timeoutMs);
        }
    });
}
async function loadStartingArea() {
    const params = new URLSearchParams(window.location.search);
    const configPreviewToken = typeof MAP_CONFIG.previewToken === 'string' ? MAP_CONFIG.previewToken : null;
    const previewToken = configPreviewToken || params.get('preview');
    const previewPayload = consumeEditorPreviewLayout(previewToken);
    const previewMessagePromise = (!previewPayload?.layout && previewToken)
        ? waitForPreviewMessage(previewToken)
        : Promise.resolve(null);
    const { prefabs: prefabMap } = await prefabLibraryPromise;
    const prefabResolver = createPrefabResolver(prefabMap);
    if (previewPayload?.layout) {
        const applied = applyPreviewLayout(previewPayload.layout, {
            previewToken,
            createdAt: previewPayload.createdAt ?? null,
            prefabResolver,
        });
        if (applied) {
            return;
        }
    }
    else if (previewToken) {
        console.warn('[map-bootstrap] Preview token requested but no payload was available in storage; waiting for direct preview message.');
        const messagePayload = await previewMessagePromise;
        if (messagePayload?.layout) {
            const applied = applyPreviewLayout(messagePayload.layout, {
                previewToken,
                createdAt: messagePayload.createdAt ?? null,
                prefabResolver,
            });
            if (applied) {
                return;
            }
        }
        console.warn('[map-bootstrap] Preview token requested but no payload was available');
    }
    if (typeof fetch !== 'function') {
        console.warn('[map-bootstrap] fetch is unavailable; skipping starting map load');
        return;
    }
    try {
        const response = await fetch(layoutUrl, { cache: 'no-cache' });
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const layout = await response.json();
        console.debug('[map-bootstrap] Loaded raw layout descriptor', {
            id: layout?.areaId || layout?.id || DEFAULT_AREA_ID,
            name: layout?.areaName || layout?.name || DEFAULT_AREA_NAME,
            source: layoutUrl.href,
            layout,
        });
        const area = convertLayoutToArea(layout, {
            areaId: layout?.areaId || layout?.id || DEFAULT_AREA_ID,
            areaName: layout?.areaName || layout?.name || DEFAULT_AREA_NAME,
            prefabResolver,
        });
        applyArea(area);
    }
    catch (error) {
        console.error('[map-bootstrap] Failed to load starting map', error);
        const fallbackArea = convertLayoutToArea({}, {
            areaId: DEFAULT_AREA_ID,
            areaName: 'Empty Area',
            prefabResolver,
        });
        fallbackArea.source = 'fallback-empty';
        fallbackArea.warnings = [...(fallbackArea.warnings || []), 'Fallback area generated due to load failure'];
        applyArea(fallbackArea);
    }
}
await loadStartingArea();
