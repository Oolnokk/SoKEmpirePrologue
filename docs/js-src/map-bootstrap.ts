import { MapRegistry, convertLayoutToArea } from './vendor/map-runtime.js';
import { loadPrefabsFromManifests, createPrefabResolver, summarizeLoadErrors } from './prefab-catalog.js';
import {
  pickDefaultLayoutEntry,
  resolveDefaultLayoutId,
  resolvePreviewStoragePrefix,
} from './map-config-defaults.js';

type PrefabLoadError = { type?: string; error?: unknown };
type PrefabLibrary = { prefabs: Map<string, unknown>; errors: PrefabLoadError[] };
type MapArea = ReturnType<typeof convertLayoutToArea>;
type PrefabResolver = ReturnType<typeof createPrefabResolver>;

type PreviewPayload = {
  layout?: unknown;
  createdAt?: number | string | null;
};

type PreviewMessageData = {
  type?: string;
  token?: string | null;
  payload?: PreviewPayload | null;
  createdAt?: number | string | null;
};

type WaitForPreviewOptions = {
  timeoutMs?: number;
};

type MapLayoutConfig = {
  id: string;
  path: string;
  areaName: string | null;
};

const FALLBACK_LAYOUT_PATH = '../config/maps/defaultdistrict.layout.json';
const FALLBACK_AREA_ID = 'defaultdistrict';
const FALLBACK_AREA_NAME = 'DefaultDistrict';
const FALLBACK_PREVIEW_STORAGE_PREFIX = 'sok-map-editor-preview:';

const AREA_NAME_ELEMENT_ID = 'areaName';
const AREA_OVERLAY_UNSUB_KEY = '__sokAreaNameOverlayUnsub__' as const;
const PLAYABLE_BOUNDS_UNSUB_KEY = '__sokPlayableBoundsSyncUnsub__' as const;

function getAreaNameElement(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const element = document.getElementById(AREA_NAME_ELEMENT_ID);
  if (!element) return null;
  if (typeof HTMLElement !== 'undefined' && element instanceof HTMLElement) {
    return element;
  }
  return (element as Element)?.nodeType === 1 ? (element as HTMLElement) : null;
}

function updateAreaNameOverlay(area: MapArea | null): void {
  const element = getAreaNameElement();
  if (!element) return;

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

function bindAreaNameOverlay(registry: MapRegistry): void {
  if (typeof window === 'undefined') {
    updateAreaNameOverlay((registry as MapRegistry | undefined)?.getActiveArea?.() ?? null);
    return;
  }
  const globalWindow = window as typeof window & { __sokAreaNameOverlayUnsub__?: () => void };
  const previous = globalWindow[AREA_OVERLAY_UNSUB_KEY];
  if (typeof previous === 'function') {
    try {
      previous();
    } catch (error) {
      console.warn('[map-bootstrap] Failed to remove previous area overlay listener', error);
    }
    globalWindow[AREA_OVERLAY_UNSUB_KEY] = undefined;
  }
  if (typeof registry?.on === 'function') {
    const unsubscribe = registry.on('active-area-changed', (activeArea: MapArea | null) => {
      updateAreaNameOverlay(activeArea);
    });
    globalWindow[AREA_OVERLAY_UNSUB_KEY] = unsubscribe;
  }
  updateAreaNameOverlay(registry?.getActiveArea?.() ?? null);
}

function bindPlayableBoundsSync(registry: MapRegistry): void {
  if (typeof window === 'undefined') {
    syncConfigPlayableBounds((registry as MapRegistry | undefined)?.getActiveArea?.() ?? null);
    return;
  }

  const globalWindow = window as typeof window & { __sokPlayableBoundsSyncUnsub__?: () => void };
  const previous = globalWindow[PLAYABLE_BOUNDS_UNSUB_KEY];
  if (typeof previous === 'function') {
    try {
      previous();
    } catch (error) {
      console.warn('[map-bootstrap] Failed to remove previous playable bounds listener', error);
    }
    globalWindow[PLAYABLE_BOUNDS_UNSUB_KEY] = undefined;
  }

  if (typeof registry?.on === 'function') {
    const unsubscribe = registry.on('active-area-changed', (activeArea: MapArea | null) => {
      syncConfigPlayableBounds(activeArea);
    });
    globalWindow[PLAYABLE_BOUNDS_UNSUB_KEY] = unsubscribe;
  }

  syncConfigPlayableBounds(registry?.getActiveArea?.() ?? null);
}

function normalizeLayoutEntry(entry: unknown): MapLayoutConfig | null {
  if (!entry || typeof entry !== 'object') return null;
  const record = entry as Record<string, unknown>;
  const path = typeof record.path === 'string' && record.path.trim() ? record.path.trim() : null;
  if (!path) return null;
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

function resolveLayoutUrl(path: string | null | undefined, fallbackPath = FALLBACK_LAYOUT_PATH): URL {
  if (typeof path === 'string' && path.trim()) {
    try {
      const base = typeof window !== 'undefined' && window.location ? window.location.href : import.meta.url;
      return new URL(path, base);
    } catch (error) {
      console.warn('[map-bootstrap] Failed to resolve configured layout path', error);
    }
  }
  return new URL(fallbackPath, import.meta.url);
}

type ResolvedMapConfig = {
  mapConfig: Record<string, unknown>;
  layouts: MapLayoutConfig[];
  defaultLayoutEntry: MapLayoutConfig | null;
  defaultAreaId: string;
  defaultAreaName: string;
  layoutUrl: URL;
  previewStoragePrefix: string;
  prefabManifests: string[];
};

function resolveMapConfig(): ResolvedMapConfig {
  const rawConfig = typeof window !== 'undefined'
    ? (window as typeof window & { CONFIG?: unknown }).CONFIG
    : undefined;
  const mapConfig = rawConfig && typeof rawConfig === 'object' && rawConfig
    ? (rawConfig as Record<string, unknown>).map
    : undefined;
  const mapConfigRecord = mapConfig && typeof mapConfig === 'object'
    ? mapConfig as Record<string, unknown>
    : {};

  const layouts = Array.isArray(mapConfigRecord.layouts)
    ? mapConfigRecord.layouts.map((entry) => normalizeLayoutEntry(entry)).filter((entry): entry is MapLayoutConfig => !!entry)
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

const prefabLibraryPromise: Promise<PrefabLibrary> = (async () => {
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
  } catch (error) {
    console.error('[map-bootstrap] Failed to load prefab manifests', error);
    return { prefabs: new Map(), errors: [{ type: 'bootstrap', error }] };
  }
})();

function consumeEditorPreviewLayout(token: string | null): (PreviewPayload & { token: string }) | null {
  if (!token) return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    const key = PREVIEW_STORAGE_PREFIX + token;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    localStorage.removeItem(key);
    const payload = JSON.parse(raw) as PreviewPayload | null;
    if (!payload || typeof payload !== 'object') return null;
    return { ...payload, token };
  } catch (error) {
    console.warn('[map-bootstrap] Unable to read preview payload', error);
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(PREVIEW_STORAGE_PREFIX + token);
      }
    } catch (_rmErr) {
      // ignore cleanup failures
    }
    return null;
  }
}

type EditorCollider = {
  id: number;
  label: string;
  type: string;
  left: number;
  width: number;
  topOffset: number;
  height: number;
  meta?: Record<string, unknown> | null;
};

function normalizeAreaCollider(input: unknown, index: number): EditorCollider {
  const fallbackId = index + 1;
  const safe = (input && typeof input === 'object') ? (input as Record<string, unknown>) : {};
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

  let topOffset = Number((safe as Record<string, unknown>).topOffset);
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
  const bottomOffset = Number((safe as Record<string, unknown>).bottomOffset);
  const bottom = Number(safe.bottom);
  if (!Number.isFinite(height) && Number.isFinite(bottomOffset)) {
    height = bottomOffset - topOffset;
  } else if (!Number.isFinite(height) && Number.isFinite(bottom)) {
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
    ? { ...(safe.meta as Record<string, unknown>) }
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

function isGroundRatioLocked(config: any): boolean {
  if (!config || typeof config !== 'object') return false;
  const ground = config.ground;
  if (!ground || typeof ground !== 'object') return false;
  return ground.lockRatio === true;
}

function applyEditorPreviewSettings(
  area: MapArea,
  { token = null, createdAt = null }: { token?: string | null; createdAt?: number | string | null } = {}
): void {
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
  const groundOffset = Number(area?.ground?.offset);
  const normalizedColliders = Array.isArray(area?.colliders)
    ? area.colliders.map((col, index) => normalizeAreaCollider(col, index))
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

function ensureParallaxContainer(): { layers: unknown[]; areas: Record<string, unknown>; currentAreaId: string | null } {
  const parallax = (window.PARALLAX = window.PARALLAX || { layers: [], areas: {}, currentAreaId: null });
  parallax.areas = parallax.areas || {};
  parallax.layers = Array.isArray(parallax.layers) ? parallax.layers : [];
  return parallax;
}

function syncConfigGround(area: MapArea): void {
  const CONFIG = (window.CONFIG = window.CONFIG || {});
  const canvasConfig = CONFIG.canvas || {};
  const canvasHeight = Number.isFinite(canvasConfig.h) ? (canvasConfig.h as number) : 460;
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

function syncConfigPlayableBounds(area: MapArea | null): void {
  const CONFIG = (window.CONFIG = window.CONFIG || {});
  const mapConfig = (CONFIG.map = typeof CONFIG.map === 'object' && CONFIG.map ? CONFIG.map : {});

  const initialBounds = (mapConfig.__initialPlayArea = mapConfig.__initialPlayArea || {
    minX: Number.isFinite(mapConfig.playAreaMinX) ? mapConfig.playAreaMinX : null,
    maxX: Number.isFinite(mapConfig.playAreaMaxX) ? mapConfig.playAreaMaxX : null,
  });

  const playable = area?.playableBounds;
  const left = Number.isFinite(playable?.left) ? (playable as { left: number }).left : null;
  const right = Number.isFinite(playable?.right) ? (playable as { right: number }).right : null;

  if (left != null && right != null) {
    mapConfig.playableBounds = { ...playable, left, right };
    mapConfig.activePlayableBounds = mapConfig.playableBounds;
    mapConfig.playAreaMinX = left;
    mapConfig.playAreaMaxX = right;
    return;
  }

  mapConfig.playableBounds = null;
  mapConfig.activePlayableBounds = null;
  mapConfig.playAreaMinX = Number.isFinite(initialBounds?.minX) ? initialBounds.minX : null;
  mapConfig.playAreaMaxX = Number.isFinite(initialBounds?.maxX) ? initialBounds.maxX : null;
}

function syncConfigPlatforming(area: MapArea): void {
  const CONFIG = (window.CONFIG = window.CONFIG || {});
  const normalized = Array.isArray(area?.colliders)
    ? area.colliders.map((col, index) => normalizeAreaCollider(col, index))
    : [];
  CONFIG.platformingColliders = normalized;
}

function adaptAreaToParallax(area: MapArea) {
  return {
    id: area.id,
    name: area.name,
    source: area.source,
    camera: area.camera,
    ground: area.ground,
    layers: area.layers.map((layer, index) => ({
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
    instances: area.instances,
    meta: area.meta,
  };
}

function applyArea(area: MapArea): void {
  const registry = (window.__MAP_REGISTRY__ instanceof MapRegistry)
    ? window.__MAP_REGISTRY__
    : new MapRegistry({ logger: console });
  registry.registerArea(area.id, area);
  registry.setActiveArea(area.id);
  window.__MAP_REGISTRY__ = registry;

  const parallax = ensureParallaxContainer();
  parallax.areas[area.id] = adaptAreaToParallax(area);
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
  bindPlayableBoundsSync(registry);

  console.info(`[map-bootstrap] Loaded area "${area.id}" (${area.source || 'unknown source'})`);
}

function applyPreviewLayout(
  descriptor: unknown,
  {
    previewToken = null,
    createdAt = null,
    prefabResolver,
  }: { previewToken?: string | null; createdAt?: number | string | null; prefabResolver: PrefabResolver }
): boolean {
  if (!descriptor) return false;
  try {
    const record = (descriptor ?? {}) as Record<string, unknown>;
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
    area.source = (record.source as string) || 'map-editor-preview';
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
  } catch (error) {
    console.error('[map-bootstrap] Failed to apply editor preview layout', error);
    return false;
  }
}

function waitForPreviewMessage(previewToken: string | null, { timeoutMs = 3000 }: WaitForPreviewOptions = {}): Promise<PreviewPayload | null> {
  if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') {
    return Promise.resolve(null);
  }

  const expectedOrigin = window.location.origin;

  return new Promise((resolve) => {
    let settled = false;
    let timeoutId: number | null = null;

    const cleanup = () => {
      if (timeoutId != null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
      window.removeEventListener('message', handleMessage as EventListener);
    };

    const handleMessage = (event: MessageEvent<PreviewMessageData>) => {
      const origin = event?.origin ?? '';
      if (expectedOrigin && expectedOrigin !== 'null' && origin && origin !== expectedOrigin) {
        return;
      }

      const data = event?.data;
      if (!data || data.type !== 'map-editor-preview') return;
      if (previewToken && data.token && data.token !== previewToken) return;

      settled = true;
      cleanup();
      const payload = data.payload || {};
      resolve({
        layout: payload?.layout || null,
        createdAt: payload?.createdAt ?? data.createdAt ?? null,
      });
    };

    window.addEventListener('message', handleMessage as EventListener);

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

async function loadStartingArea(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const configPreviewToken = typeof MAP_CONFIG.previewToken === 'string' ? MAP_CONFIG.previewToken : null;
  const previewToken = configPreviewToken || params.get('preview');
  const previewPayload = consumeEditorPreviewLayout(previewToken);
  const previewMessagePromise: Promise<PreviewPayload | null> = (!previewPayload?.layout && previewToken)
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
  } else if (previewToken) {
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
      id: (layout?.areaId as string) || (layout?.id as string) || DEFAULT_AREA_ID,
      name: (layout?.areaName as string) || (layout?.name as string) || DEFAULT_AREA_NAME,
      source: layoutUrl.href,
      layout,
    });
    const area = convertLayoutToArea(layout, {
      areaId: (layout?.areaId as string) || (layout?.id as string) || DEFAULT_AREA_ID,
      areaName: (layout?.areaName as string) || (layout?.name as string) || DEFAULT_AREA_NAME,
      prefabResolver,
    });
    applyArea(area);
  } catch (error) {
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
