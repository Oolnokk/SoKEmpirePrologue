// camera.js — simple x-follow camera with smoothing integrated with map registry
const DEFAULT_WORLD_WIDTH = 1600;
const DEFAULT_VIEWPORT_WIDTH = 720;
const DEFAULT_SMOOTHING = 0.15;

let attachedRegistry = null;
let detachRegistryListener = null;
let lastViewportWidth = DEFAULT_VIEWPORT_WIDTH;
let lastLoggedPlayerX = null;
let lastLoggedAreaId = null;

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) && !Number.isFinite(max)) return value;
  if (!Number.isFinite(min)) return Math.min(value, max);
  if (!Number.isFinite(max)) return Math.max(value, min);
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}

function ensureGameCamera() {
  window.GAME = window.GAME || {};
  const camera = (window.GAME.CAMERA = window.GAME.CAMERA || {});
  camera.x = Number.isFinite(camera.x) ? camera.x : 0;
  camera.y = Number.isFinite(camera.y) ? camera.y : 0;
  camera.zoom = Number.isFinite(camera.zoom) ? camera.zoom : 1;
  camera.smoothing = Number.isFinite(camera.smoothing) ? camera.smoothing : DEFAULT_SMOOTHING;
  camera.worldWidth = Number.isFinite(camera.worldWidth) ? camera.worldWidth : DEFAULT_WORLD_WIDTH;
  camera.bounds = camera.bounds || { min: 0, max: DEFAULT_WORLD_WIDTH };
  return camera;
}

function computeAreaBounds(area) {
  if (!area) {
    return { min: 0, max: DEFAULT_WORLD_WIDTH };
  }
  let minX = Infinity;
  let maxX = -Infinity;
  const consider = (inst) => {
    const x = inst?.position?.x;
    if (Number.isFinite(x)) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
    }
  };
  if (Array.isArray(area.instances)) {
    for (const inst of area.instances) consider(inst);
  }
  if (Array.isArray(area.props)) {
    for (const prop of area.props) consider(prop);
  }
  const startX = area.camera?.startX;
  if (Number.isFinite(startX)) {
    minX = Math.min(minX, startX);
    maxX = Math.max(maxX, startX);
  }
  if (!Number.isFinite(minX) || !Number.isFinite(maxX)) {
    return { min: 0, max: DEFAULT_WORLD_WIDTH };
  }
  if (minX === maxX) {
    maxX = minX + DEFAULT_WORLD_WIDTH;
  }
  const minBound = Math.min(0, minX);
  const maxBound = Math.max(minBound + DEFAULT_WORLD_WIDTH, maxX);
  return { min: minBound, max: maxBound };
}

function syncCameraToArea(area) {
  const camera = ensureGameCamera();
  const bounds = computeAreaBounds(area);
  const viewportWidth = lastViewportWidth || DEFAULT_VIEWPORT_WIDTH;
  const span = Math.max(bounds.max - bounds.min, viewportWidth, 1);
  const maxTarget = bounds.min + span - viewportWidth;
  const clampedStart = clamp(area?.camera?.startX, bounds.min, maxTarget);

  camera.bounds = { min: bounds.min, max: bounds.min + span };
  camera.worldWidth = span;
  camera.zoom = Number.isFinite(area?.camera?.startZoom)
    ? area.camera.startZoom
    : camera.zoom;

  if (Number.isFinite(clampedStart)) {
    camera.x = clampedStart;
  } else {
    camera.x = clamp(camera.x, bounds.min, maxTarget);
  }
  camera.targetX = camera.x;
}

function attachToRegistry(registry) {
  if (!registry || typeof registry.on !== 'function') {
    return;
  }
  if (registry === attachedRegistry) {
    return;
  }
  lastLoggedAreaId = null;
  lastLoggedPlayerX = null;
  if (typeof detachRegistryListener === 'function') {
    detachRegistryListener();
    detachRegistryListener = null;
  }
  attachedRegistry = registry;
  detachRegistryListener = registry.on('active-area-changed', (area) => {
    syncCameraToArea(area);
  });
  if (typeof registry.getActiveArea === 'function') {
    const activeArea = registry.getActiveArea();
    if (activeArea) {
      syncCameraToArea(activeArea);
    }
  }
}

export function initCamera({ canvas, mapRegistry } = {}) {
  const camera = ensureGameCamera();
  const config = window.CONFIG || {};
  lastViewportWidth = canvas?.width || config.canvas?.w || lastViewportWidth || DEFAULT_VIEWPORT_WIDTH;
  camera.bounds = camera.bounds || { min: 0, max: camera.worldWidth || DEFAULT_WORLD_WIDTH };

  const registry = mapRegistry || window.GAME?.mapRegistry || window.__MAP_REGISTRY__;
  if (registry) {
    attachToRegistry(registry);
  }

  const existingCallback = window.GAME.__onMapRegistryReadyForCamera;
  window.GAME.__onMapRegistryReadyForCamera = (registryInstance) => {
    attachToRegistry(registryInstance);
    if (typeof existingCallback === 'function' && existingCallback !== window.GAME.__onMapRegistryReadyForCamera) {
      try {
        existingCallback(registryInstance);
      } catch (_error) {
        // Ignore downstream errors to keep camera functional
      }
    }
  };
}

export function updateCamera(canvas) {
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!G.FIGHTERS || !G.CAMERA) return;
  const P = G.FIGHTERS.player;
  if (!P) return;

  const camera = ensureGameCamera();
  const activeAreaId = (attachedRegistry && typeof attachedRegistry.getActiveAreaId === 'function')
    ? attachedRegistry.getActiveAreaId()
    : (window.GAME?.currentAreaId || null);

  const viewportWidth = canvas?.width || C.canvas?.w || lastViewportWidth || DEFAULT_VIEWPORT_WIDTH;
  lastViewportWidth = viewportWidth;
  camera.viewportWidth = viewportWidth;

  const bounds = camera.bounds || { min: 0, max: camera.worldWidth || DEFAULT_WORLD_WIDTH };
  const minBound = Number.isFinite(bounds.min) ? bounds.min : 0;
  const maxBound = Number.isFinite(bounds.max) ? bounds.max : minBound + (camera.worldWidth || DEFAULT_WORLD_WIDTH);
  const maxCameraX = Math.max(minBound, maxBound - viewportWidth);

  const playerX = Number.isFinite(P.hitbox?.x)
    ? P.hitbox.x
    : Number.isFinite(P.pos?.x)
      ? P.pos.x
      : 0;
  if (Number.isFinite(playerX)) {
    const shouldLogArea = activeAreaId && activeAreaId !== lastLoggedAreaId;
    const shouldLogPosition = lastLoggedPlayerX == null || Math.abs(playerX - lastLoggedPlayerX) >= 1;
    if (shouldLogArea || shouldLogPosition) {
      lastLoggedPlayerX = playerX;
      lastLoggedAreaId = activeAreaId || lastLoggedAreaId;
      console.debug('[camera] Player X in layout coordinates', {
        areaId: activeAreaId || 'unknown',
        x: Number(playerX.toFixed(2)),
        viewportWidth,
        cameraBounds: { min: minBound, max: maxBound },
      });
    }
  }
  const desiredX = playerX - viewportWidth * 0.5;
  const target = clamp(desiredX, minBound, maxCameraX);

  const smoothing = Number.isFinite(camera.smoothing) ? camera.smoothing : DEFAULT_SMOOTHING;
  const currentX = Number.isFinite(camera.x) ? camera.x : minBound;
  camera.x = currentX + (target - currentX) * smoothing;
  camera.targetX = target;
}
