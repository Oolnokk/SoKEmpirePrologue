import { MapRegistry, convertLayoutToArea } from './vendor/map-runtime.js';

const layoutUrl = new URL('../config/maps/examplestreet.layout.json', import.meta.url);
const DEFAULT_AREA_ID = 'examplestreet';

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

async function loadStartingArea() {
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
    const area = convertLayoutToArea(layout, {
      areaId: layout.areaId || layout.id || DEFAULT_AREA_ID,
      areaName: layout.areaName || layout.name || 'Example Street',
    });

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

    console.info(`[map-bootstrap] Loaded starting area "${area.id}"`);
  } catch (error) {
    console.error('[map-bootstrap] Failed to load starting map', error);
  }
}

await loadStartingArea();
