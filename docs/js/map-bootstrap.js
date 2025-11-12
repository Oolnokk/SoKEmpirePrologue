import { MapRegistry, convertLayoutToArea } from './vendor/map-runtime.js';

const layoutUrl = new URL('../config/maps/examplestreet.layout.json', import.meta.url);
const DEFAULT_AREA_ID = 'examplestreet';
const PREVIEW_STORAGE_PREFIX = 'sok-map-editor-preview:';

function consumeEditorPreviewLayout(token) {
  if (!token) return null;
  try {
    if (typeof localStorage === 'undefined') return null;
    const key = PREVIEW_STORAGE_PREFIX + token;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    localStorage.removeItem(key);
    const payload = JSON.parse(raw);
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

function ensureParallaxContainer() {
  const parallax = (window.PARALLAX = window.PARALLAX || { layers: [], areas: {}, currentAreaId: null });
  parallax.areas = parallax.areas || {};
  parallax.layers = Array.isArray(parallax.layers) ? parallax.layers : [];
  return parallax;
}

function adaptAreaToParallax(area) {
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

function applyArea(area) {
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

async function loadStartingArea() {
  const params = new URLSearchParams(window.location.search);
  const previewToken = params.get('preview');
  const previewPayload = consumeEditorPreviewLayout(previewToken);

  if (previewPayload?.layout) {
    try {
      const descriptor = previewPayload.layout;
      const areaId = descriptor?.areaId || descriptor?.id || `editor_preview_${previewToken || 'area'}`;
      const areaName = descriptor?.areaName || descriptor?.name || 'Editor Preview';
      const area = convertLayoutToArea(descriptor, { areaId, areaName });
      area.source = descriptor?.source || 'map-editor-preview';
      area.meta = {
        ...area.meta,
        editorPreview: true,
        previewToken: previewToken || null,
        previewCreatedAt: previewPayload.createdAt ?? null,
      };
      applyArea(area);
      applyEditorPreviewSettings(area, {
        token: previewToken || null,
        createdAt: previewPayload.createdAt ?? null,
      });
      console.info('[map-bootstrap] Loaded editor preview area');
      return;
    } catch (error) {
      console.error('[map-bootstrap] Failed to apply editor preview layout', error);
    }
  } else if (previewToken) {
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
      name: layout?.areaName || layout?.name || null,
      source: layoutUrl.href,
      layout,
    });
    const area = convertLayoutToArea(layout, {
      areaId: layout.areaId || layout.id || DEFAULT_AREA_ID,
      areaName: layout.areaName || layout.name || 'Example Street',
    });
    applyArea(area);
  } catch (error) {
    console.error('[map-bootstrap] Failed to load starting map', error);
    const fallbackArea = convertLayoutToArea({}, {
      areaId: DEFAULT_AREA_ID,
      areaName: 'Empty Area',
    });
    fallbackArea.source = 'fallback-empty';
    fallbackArea.warnings = [...(fallbackArea.warnings || []), 'Fallback area generated due to load failure'];
    applyArea(fallbackArea);
  }
}

await loadStartingArea();
