import { MapRegistry, convertLayoutToArea } from './vendor/map-runtime.js';
import { loadPrefabsFromManifests, createPrefabResolver, summarizeLoadErrors } from './prefab-catalog.js';

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

const layoutUrl = new URL('../config/maps/examplestreet.layout.json', import.meta.url);
const DEFAULT_AREA_ID = 'examplestreet';
const PREVIEW_STORAGE_PREFIX = 'sok-map-editor-preview:';
const MAP_CONFIG = window.CONFIG?.map || {};
const PREFAB_MANIFESTS = Array.isArray(MAP_CONFIG.prefabManifests)
  ? MAP_CONFIG.prefabManifests.filter((entry) => typeof entry === 'string' && entry.trim())
  : [];

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

  if (Number.isFinite(groundOffset) && canvasHeight > 0) {
    const ratioRaw = 1 - groundOffset / canvasHeight;
    const ratio = Math.max(0.1, Math.min(0.95, ratioRaw));
    preview.previousGroundRatio = CONFIG.groundRatio;
    CONFIG.groundRatio = ratio;
    preview.groundOffset = groundOffset;

    const groundY = canvasHeight * ratio;
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

  window.GAME = window.GAME || {};
  window.GAME.mapRegistry = registry;
  window.GAME.currentAreaId = area.id;
  window.GAME.__onMapRegistryReadyForCamera?.(registry);

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
    const messagePayload = await waitForPreviewMessage(previewToken);
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
      name: (layout?.areaName as string) || (layout?.name as string) || null,
      source: layoutUrl.href,
      layout,
    });
    const area = convertLayoutToArea(layout, {
      areaId: (layout?.areaId as string) || (layout?.id as string) || DEFAULT_AREA_ID,
      areaName: (layout?.areaName as string) || (layout?.name as string) || 'Example Street',
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
