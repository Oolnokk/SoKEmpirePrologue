import { GeometryService, MapRegistry, adaptLegacyLayoutGeometry, adaptSceneGeometry, convertLayoutToArea, } from './vendor/map-runtime.js';
import { computeGroundY } from './ground-utils.js';
import { loadPrefabsFromManifests, createPrefabResolver, summarizeLoadErrors } from './prefab-catalog.js';
import { SpawnService, translateAreaToSpawnPayload } from './spawn-service.js';
import { initializeAreaEntities } from './entity-initialization.js';
// CRITICAL: These logs MUST appear if module executes
console.log('🔴🔴🔴 [MAP-BOOTSTRAP-TOP] MODULE EXECUTING - ALL IMPORTS COMPLETE 🔴🔴🔴');
console.log('[MAP-BOOTSTRAP-MODULE] 🟢 map-bootstrap.js module loaded and executing');
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
function ensureSpawnService() {
    const GAME = resolveGameContainer();
    const existing = GAME.spawnService;
    if (existing instanceof SpawnService) {
        return existing;
    }
    const service = new SpawnService({ logger: console });
    GAME.spawnService = service;
    return service;
}

function resolveGroupLibrary() {
    const globalConfig = (typeof window !== 'undefined' ? window.CONFIG : globalThis.CONFIG) || {};
    return globalConfig.npcGroups || {};
}
async function registerAreaSpawns(area) {
    console.log('🎮🎮🎮 [SPAWN-REGISTER] registerAreaSpawns() CALLED 🎮🎮🎮');
    console.log('[SPAWN-REGISTER] Area ID:', area?.id);
    if (!area) {
        console.log('⚠️⚠️⚠️ [SPAWN-REGISTER] NO AREA PROVIDED - RETURNING EARLY ⚠️⚠️⚠️');
        return;
    }
    console.log('[SPAWN-REGISTER] Area has spawners:', area.spawners?.length || 0);
    console.log('[SPAWN-REGISTER] Area has entities:', area.entities?.length || 0);
    console.log('[SPAWN-REGISTER] Area has pathTargets:', area.pathTargets?.length || 0);
    console.log('[SPAWN-REGISTER] Area has propSpawns:', area.propSpawns?.length || 0);

    const service = ensureSpawnService();
    console.log('[SPAWN-REGISTER] SpawnService ready:', !!service);
    const basePayload = translateAreaToSpawnPayload(area);
    console.log('[SPAWN-REGISTER] Base payload spawnPoints:', basePayload.spawnPoints?.length || 0);
    const areaRecord = area;
    const fallbackScene = areaRecord.scene || {};
    const fallbackSpawnPoints = Array.isArray(areaRecord.spawnPoints)
        ? areaRecord.spawnPoints
        : Array.isArray(fallbackScene.spawnPoints)
            ? fallbackScene.spawnPoints
            : [];
    const spawnPoints = basePayload.spawnPoints.length ? basePayload.spawnPoints : fallbackSpawnPoints;
    console.log('[SPAWN-REGISTER] Final spawnPoints count:', spawnPoints.length);
    const baseGroupLibrary = basePayload.groupLibrary;
    const fallbackGroupLibrary = areaRecord.groupLibrary || areaRecord.groups || fallbackScene.groupLibrary || fallbackScene.groups || {};
    const groupLibrary = Object.keys(baseGroupLibrary || {}).length ? baseGroupLibrary : fallbackGroupLibrary;
    const areaId = basePayload.areaId || area.id;
    if (!areaId)
        return;
    service.registerArea(areaId, spawnPoints, { groupLibrary });
    service.setActiveArea(areaId);

    // Make groupLibrary available globally for NPC spawner initialization
    if (Object.keys(groupLibrary || {}).length > 0) {
        window.CONFIG = window.CONFIG || {};
        window.CONFIG.npcGroups = { ...(window.CONFIG.npcGroups || {}), ...groupLibrary };
        console.log('[SPAWN-REGISTER] Set CONFIG.npcGroups with', Object.keys(groupLibrary).length, 'groups');
    }

    // Initialize ALL entities (NPCs, path targets, props, etc.) with proper async handling
    console.log('[SPAWN-REGISTER] Spawners registered, now initializing all entities...');
    try {
        const result = await initializeAreaEntities(area);
        console.log('[SPAWN-REGISTER] ✅ Entity initialization complete:', result);
    } catch (error) {
        console.error('[SPAWN-REGISTER] ❌ Entity initialization failed:', error);
    }
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
    const normalizedGroundOffset = Number.isFinite(groundOffset) ? Math.max(0, groundOffset) : null;
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
        preview.groundOffset = normalizedGroundOffset;
        const groundInputs = {
            ...CONFIG,
            groundRatio: appliedRatio,
            ground: {
                ...(typeof CONFIG.ground === 'object' && CONFIG.ground ? CONFIG.ground : {}),
                offset: ratioLocked ? undefined : normalizedGroundOffset,
            },
        };
        const groundY = computeGroundY(groundInputs, { canvasHeight });
        const worldWidth = GAME?.CAMERA?.worldWidth || canvasWidth * 2;
        const colliderWidth = Math.max(worldWidth, canvasWidth * 2.5);
        const colliderHeight = Math.max(48, (normalizedGroundOffset ?? 0) + 32);
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
/**
 * REMOVED: Legacy parallax container no longer used by runtime.
 * This function is a no-op to prevent errors if called by old code.
 * @deprecated The runtime no longer produces or consumes legacy 2D parallax structures.
 */
function ensureParallaxContainer() {
    // No-op: window.PARALLAX is no longer written to by the runtime
    return { layers: [], areas: {}, currentAreaId: null };
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
        const { groundY: _staleGroundY, ...configWithoutGroundY } = CONFIG;
        const groundInputs = {
            ...configWithoutGroundY,
            groundRatio: appliedRatio,
            ground: {
                ...(typeof CONFIG.ground === 'object' && CONFIG.ground ? CONFIG.ground : {}),
                offset: ratioLocked ? undefined : offset,
            },
        };
        CONFIG.groundY = computeGroundY(groundInputs, { canvasHeight });
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
/**
 * REMOVED: Legacy parallax adapter no longer used by runtime.
 * Renamed from adaptSceneToParallax to adaptSceneForLegacyParallax.
 * This function exists only for historical reference and is not called.
 * @deprecated The runtime no longer produces or consumes legacy 2D parallax structures.
 * @internal
 */
function adaptSceneForLegacyParallax(area) {
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
async function applyArea(area) {
    console.log('[APPLY-AREA] 🗺️ applyArea() called for area:', area?.id);
    console.log('[APPLY-AREA] Area has:', {
        spawners: area.spawners?.length || 0,
        entities: area.entities?.length || 0,
        pathTargets: area.pathTargets?.length || 0,
        propSpawns: area.propSpawns?.length || 0,
        visualsMap: !!area.visualsMap,
        scene3d: !!area.scene3d,
        groupLibrary: Object.keys(area.groupLibrary || {}).length
    });
    const registry = (window.__MAP_REGISTRY__ instanceof MapRegistry)
        ? window.__MAP_REGISTRY__
        : new MapRegistry({ logger: console });
    console.log('[APPLY-AREA] Registry exists:', registry instanceof MapRegistry);
    registry.registerArea(area.id, area);
    console.log('[APPLY-AREA] Area registered in registry');
    registry.setActiveArea(area.id);
    console.log('[APPLY-AREA] Active area set to:', area.id);
    window.__MAP_REGISTRY__ = registry;
    registerAreaGeometry(area);
    // REMOVED: Legacy PARALLAX writes - the runtime no longer populates window.PARALLAX
    // Previously: ensureParallaxContainer(), parallax.areas[area.id] = adaptSceneToParallax(area), etc.
    if (typeof window !== 'undefined' && !window.__PARALLAX_REMOVAL_LOGGED) {
        console.info('[map-bootstrap] Legacy 2D parallax pipeline removed — window.PARALLAX no longer populated. Areas are registered in MapRegistry and CONFIG.areas.');
        window.__PARALLAX_REMOVAL_LOGGED = true;
    }
    // Keep CONFIG.areas registration for backwards compatibility with other modules
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.areas = window.CONFIG.areas || {};
    // Store the normalized area descriptor directly in CONFIG.areas (not the legacy parallax structure)
    window.CONFIG.areas[area.id] = area;
    syncConfigGround(area);
    syncConfigPlatforming(area);
    window.GAME = window.GAME || {};
    window.GAME.mapRegistry = registry;
    window.GAME.currentAreaId = area.id;

    // CRITICAL: Set up event listener BEFORE calling __onMapRegistryReadyForCamera
    // This ensures the listener is ready when visualsMap loading is triggered
    console.log('[APPLY-AREA] ⏳ Setting up visualsmap-ready event listener BEFORE triggering 3D load...');

    const entityPopulationPromise = new Promise((resolve) => {
        let hasPopulated = false;

        const populateEntities = async (event) => {
            if (hasPopulated) return;
            hasPopulated = true;

            const eventArea = event?.detail?.area;
            console.log('[APPLY-AREA] 📥 visualsmap-ready event received for area:', eventArea?.id);
            console.log('[APPLY-AREA] 🎬 Starting entity population (NPCs, props, etc.)...');

            await registerAreaSpawns(area);

            console.log('[APPLY-AREA] ✅ Entity population complete');
            resolve();
        };

        // Listen for visualsmap-ready event
        window.addEventListener('visualsmap-ready', populateEntities, { once: true });

        // Timeout fallback - populate entities anyway after 10 seconds
        setTimeout(() => {
            if (!hasPopulated) {
                console.warn('[APPLY-AREA] ⚠️ Timeout waiting for visualsmap-ready - populating entities anyway');
                populateEntities({});
            }
        }, 10000);
    });

    // Don't await here - let the event handler trigger entity population
    // This allows applyArea to complete and the visualsMap to start loading
    entityPopulationPromise.then(() => {
        console.log('[APPLY-AREA] 🎉 Map fully loaded with entities');
    });

    // NOW trigger 3D loading - event listener is ready to catch the visualsmap-ready event
    console.log('[APPLY-AREA] 🚀 Triggering 3D load via __onMapRegistryReadyForCamera...');
    window.GAME.__onMapRegistryReadyForCamera?.(registry);

    bindAreaNameOverlay(registry);
    bindGeometryService(registry);
    bindPlayableBoundsSync(registry);
    console.info(`[map-bootstrap] ✅ Area geometry and config loaded "${area.id}" (entities pending visualsMap)`);
}
async function applyPreviewLayout(descriptor, { previewToken = null, createdAt = null, prefabResolver, }) {
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
        const area = convertLayoutToArea(descriptor, { areaId, areaName, prefabResolver, groupLibrary: resolveGroupLibrary() });
        area.source = record.source || 'map-editor-preview';
        area.meta = {
            ...area.meta,
            editorPreview: true,
            previewToken: previewToken || null,
            previewCreatedAt: createdAt ?? null,
        };
        await applyArea(area);
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
function displayMapLoadError(error, layoutUrl) {
    if (typeof document === 'undefined') return;

    // Create or update error overlay
    let overlay = document.getElementById('map-load-error-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'map-load-error-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.95);
            z-index: 100000;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        `;
        document.body.appendChild(overlay);
    }

    const errorType = error.message?.includes('HTTP') ? 'http' :
                      error.message?.includes('JSON') || error instanceof SyntaxError ? 'json' :
                      'unknown';

    const httpMatch = error.message?.match(/HTTP (\d+)/);
    const httpStatus = httpMatch ? httpMatch[1] : null;

    let diagnosticHtml = `
        <div style="background: #1e293b; border: 2px solid #dc2626; border-radius: 8px; padding: 24px; max-width: 800px; width: 100%; max-height: 90vh; overflow-y: auto; font-family: system-ui, -apple-system, sans-serif;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
                <div style="font-size: 48px;">❌</div>
                <div>
                    <h1 style="margin: 0; color: #f8fafc; font-size: 24px; font-weight: 600;">Map Load Failed</h1>
                    <p style="margin: 4px 0 0 0; color: #94a3b8; font-size: 14px;">The game couldn't load the gameplay map</p>
                </div>
            </div>

            <div style="background: #dc2626; color: #fef2f2; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                <strong style="font-size: 14px;">Error:</strong>
                <div style="font-family: monospace; font-size: 13px; margin-top: 6px; word-break: break-word;">
                    ${error.message || 'Unknown error'}
                </div>
            </div>

            <div style="background: #0f172a; padding: 16px; border-radius: 6px; margin-bottom: 16px;">
                <strong style="color: #f8fafc; font-size: 14px; display: block; margin-bottom: 12px;">📊 Diagnostic Information</strong>
                <div style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #f8fafc;">Map URL:</strong><br/>
                        <code style="background: #1e293b; padding: 4px 8px; border-radius: 4px; display: block; margin-top: 4px; word-break: break-all; color: #3b82f6; font-size: 12px;">
                            ${layoutUrl?.href || 'Unknown'}
                        </code>
                    </div>
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #f8fafc;">Error Type:</strong>
                        <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 11px;">
                            ${errorType.toUpperCase()}
                        </span>
                    </div>
                    ${httpStatus ? `
                        <div style="margin-bottom: 8px;">
                            <strong style="color: #f8fafc;">HTTP Status:</strong>
                            <span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px; font-family: monospace; font-size: 11px;">
                                ${httpStatus}
                            </span>
                        </div>
                    ` : ''}
                    <div style="margin-bottom: 8px;">
                        <strong style="color: #f8fafc;">Browser:</strong> ${navigator.userAgent.split(' ').slice(-2).join(' ')}
                    </div>
                    <div>
                        <strong style="color: #f8fafc;">Current URL:</strong><br/>
                        <code style="background: #1e293b; padding: 4px 8px; border-radius: 4px; display: block; margin-top: 4px; word-break: break-all; font-size: 11px;">
                            ${window.location.href}
                        </code>
                    </div>
                </div>
            </div>
    `;

    // Add specific troubleshooting based on error type
    if (errorType === 'http') {
        if (httpStatus === '404') {
            diagnosticHtml += `
                <div style="background: #1e293b; padding: 16px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid #f59e0b;">
                    <strong style="color: #f8fafc; font-size: 14px; display: block; margin-bottom: 8px;">🔍 404 Not Found</strong>
                    <div style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
                        <p style="margin: 0 0 12px 0;">The map file doesn't exist at the specified URL.</p>
                        <strong style="color: #f8fafc;">Possible causes:</strong>
                        <ul style="margin: 8px 0; padding-left: 20px;">
                            <li>File path is incorrect in config.js</li>
                            <li>Map file hasn't been created yet</li>
                            <li>File was moved or renamed</li>
                            <li>Server path configuration issue</li>
                        </ul>
                        <strong style="color: #f8fafc;">How to fix:</strong>
                        <ol style="margin: 8px 0; padding-left: 20px;">
                            <li>Check that <code style="background: #0f172a; padding: 2px 6px; border-radius: 3px;">defaultdistrict3d_gameplaymap.json</code> exists</li>
                            <li>Verify path in <code style="background: #0f172a; padding: 2px 6px; border-radius: 3px;">config.js</code> → <code style="background: #0f172a; padding: 2px 6px; border-radius: 3px;">map.layouts[0].path</code></li>
                            <li>Open browser DevTools → Network tab to see exact failing URL</li>
                        </ol>
                    </div>
                </div>
            `;
        } else if (httpStatus === '500' || httpStatus === '502' || httpStatus === '503') {
            diagnosticHtml += `
                <div style="background: #1e293b; padding: 16px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid #dc2626;">
                    <strong style="color: #f8fafc; font-size: 14px; display: block; margin-bottom: 8px;">⚠️ Server Error (${httpStatus})</strong>
                    <div style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
                        <p style="margin: 0 0 12px 0;">The server encountered an error while trying to serve the map file.</p>
                        <strong style="color: #f8fafc;">How to fix:</strong>
                        <ol style="margin: 8px 0; padding-left: 20px;">
                            <li>Check if the development server is running</li>
                            <li>Restart the server</li>
                            <li>Check server logs for errors</li>
                            <li>Verify file permissions on the server</li>
                        </ol>
                    </div>
                </div>
            `;
        }
    } else if (errorType === 'json') {
        diagnosticHtml += `
            <div style="background: #1e293b; padding: 16px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid #f59e0b;">
                <strong style="color: #f8fafc; font-size: 14px; display: block; margin-bottom: 8px;">📝 JSON Parse Error</strong>
                <div style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
                    <p style="margin: 0 0 12px 0;">The map file was found but contains invalid JSON.</p>
                    <strong style="color: #f8fafc;">Common causes:</strong>
                    <ul style="margin: 8px 0; padding-left: 20px;">
                        <li>Missing or extra commas</li>
                        <li>Unclosed brackets or braces</li>
                        <li>Unquoted strings</li>
                        <li>Trailing commas (not allowed in JSON)</li>
                        <li>Comments (not allowed in JSON)</li>
                    </ul>
                    <strong style="color: #f8fafc;">How to fix:</strong>
                    <ol style="margin: 8px 0; padding-left: 20px;">
                        <li>Open the map file in a text editor</li>
                        <li>Use a JSON validator (e.g., <code style="background: #0f172a; padding: 2px 6px; border-radius: 3px;">jsonlint.com</code>)</li>
                        <li>Check browser console for line number of error</li>
                        <li>Common fix: Remove trailing commas after last array/object items</li>
                    </ol>
                </div>
            </div>
        `;
    } else {
        diagnosticHtml += `
            <div style="background: #1e293b; padding: 16px; border-radius: 6px; margin-bottom: 16px; border-left: 4px solid #64748b;">
                <strong style="color: #f8fafc; font-size: 14px; display: block; margin-bottom: 8px;">🔧 General Troubleshooting</strong>
                <div style="color: #94a3b8; font-size: 13px; line-height: 1.6;">
                    <strong style="color: #f8fafc;">Debug steps:</strong>
                    <ol style="margin: 8px 0; padding-left: 20px;">
                        <li>Open browser DevTools (F12)</li>
                        <li>Check the Console tab for detailed error messages</li>
                        <li>Check the Network tab to see the failed request</li>
                        <li>Verify the map file exists and is valid JSON</li>
                        <li>Try loading the URL directly in your browser</li>
                    </ol>
                </div>
            </div>
        `;
    }

    diagnosticHtml += `
            <div style="background: #0f172a; padding: 12px; border-radius: 6px; margin-bottom: 16px;">
                <strong style="color: #f8fafc; font-size: 12px; display: block; margin-bottom: 8px;">🐛 Full Error Stack</strong>
                <pre style="margin: 0; padding: 8px; background: #000; border-radius: 4px; overflow-x: auto; font-size: 11px; color: #ef4444; line-height: 1.4;">${error.stack || error.message || String(error)}</pre>
            </div>

            <div style="display: flex; gap: 12px; flex-wrap: wrap;">
                <button onclick="location.reload()" style="flex: 1; min-width: 150px; padding: 12px 24px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    🔄 Reload Page
                </button>
                <button onclick="document.getElementById('map-load-error-overlay').remove()" style="flex: 1; min-width: 150px; padding: 12px 24px; background: #64748b; color: white; border: none; border-radius: 6px; font-size: 14px; font-weight: 600; cursor: pointer;">
                    ✕ Dismiss (Load Empty Map)
                </button>
            </div>

            <div style="margin-top: 16px; padding: 12px; background: #0f172a; border-radius: 6px; text-align: center;">
                <p style="margin: 0; color: #64748b; font-size: 12px;">
                    A fallback empty map has been loaded. The game may not function correctly.
                </p>
            </div>
        </div>
    `;

    overlay.innerHTML = diagnosticHtml;
}
async function loadStartingArea() {
    console.log('[map-bootstrap] 🚀 START - Loading starting area...');
    console.log('[map-bootstrap] Layout URL:', layoutUrl);
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
        console.log('[map-bootstrap] Using preview payload');
        const applied = await applyPreviewLayout(previewPayload.layout, {
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
            const applied = await applyPreviewLayout(messagePayload.layout, {
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
    console.log('[map-bootstrap] No preview - fetching layout from:', layoutUrl.href);
    if (typeof fetch !== 'function') {
        console.warn('[map-bootstrap] fetch is unavailable; skipping starting map load');
        return;
    }
    try {
        console.log('[map-bootstrap] Fetching layout...');
        const response = await fetch(layoutUrl, { cache: 'no-cache' });
        console.log('[map-bootstrap] Fetch response status:', response.status, response.ok);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        console.log('[map-bootstrap] Parsing JSON...');
        const layout = await response.json();
        console.log('[map-bootstrap] ✅ JSON parsed successfully');
        console.log('[map-bootstrap] Loaded raw layout descriptor', {
            id: layout?.areaId || layout?.id || DEFAULT_AREA_ID,
            name: layout?.areaName || layout?.name || DEFAULT_AREA_NAME,
            source: layoutUrl.href,
            layout,
        });
        console.log('[map-bootstrap] Layout groupLibrary:', layout.groupLibrary);
        console.log('[map-bootstrap] Layout entities:', layout.entities);
        console.log('[map-bootstrap] Entities breakdown:', {
            total: layout.entities?.length || 0,
            groupspawners: layout.entities?.filter(e => e.type === 'groupspawner').length || 0,
            doors: layout.entities?.filter(e => e.type === 'door').length || 0,
            patrolpoints: layout.entities?.filter(e => e.type === 'patrolpoint').length || 0,
            propspawns: layout.entities?.filter(e => e.type === 'propspawn').length || 0,
        });
        const area = convertLayoutToArea(layout, {
            areaId: layout?.areaId || layout?.id || DEFAULT_AREA_ID,
            areaName: layout?.areaName || layout?.name || DEFAULT_AREA_NAME,
            prefabResolver,
            groupLibrary: resolveGroupLibrary(),
        });
        // Set source URL so visualsmap paths can be resolved relative to this file
        area.source = layoutUrl.href;
        console.log('[map-bootstrap] Area object has visualsMap:', !!area.visualsMap, 'scene3d:', !!area.scene3d);
        if (area.visualsMap) {
            console.log('[map-bootstrap] visualsMap path:', area.visualsMap);
        }
        console.log('[map-bootstrap] Area spawners:', area.spawners);
        console.log('[map-bootstrap] Area groupLibrary:', area.groupLibrary);
        console.log('[map-bootstrap] Spawn payload:', translateAreaToSpawnPayload(area));
        await applyArea(area);
    }
    catch (error) {
        console.error('[map-bootstrap] Failed to load starting map', error);

        // Display detailed error diagnostics on screen
        displayMapLoadError(error, layoutUrl);

        const fallbackArea = convertLayoutToArea({}, {
            areaId: DEFAULT_AREA_ID,
            areaName: 'Empty Area',
            prefabResolver,
            groupLibrary: resolveGroupLibrary(),
        });
        fallbackArea.source = 'fallback-empty';
        fallbackArea.warnings = [...(fallbackArea.warnings || []), 'Fallback area generated due to load failure'];
        await applyArea(fallbackArea);
    }
}
// Export loadStartingArea for app.js to call when ready
// This ensures app initializes FIRST, then map loads (race condition fix)
export { loadStartingArea };

// Also expose globally for debugging
if (typeof window !== 'undefined') {
    window.__loadStartingArea = loadStartingArea;
    console.log('[MAP-BOOTSTRAP-MODULE] 🟢 Exported loadStartingArea, waiting for app.js to call it');
}
