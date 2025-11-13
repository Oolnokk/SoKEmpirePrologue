// camera.js — simple x-follow camera with smoothing integrated with map registry
import { pickFighterConfig, pickFighterName } from './fighter-utils.js?v=1';

const DEFAULT_WORLD_WIDTH = 1600;
const DEFAULT_VIEWPORT_WIDTH = 720;
const DEFAULT_SMOOTHING = 0.15;
const DEFAULT_ZOOM_SMOOTHING = 0.08;
const DEFAULT_INACTIVITY_SECONDS = 15;
const MIN_EFFECTIVE_ZOOM = 0.05;
const MAKE_AWARE_EVENT = 'make-aware';
const EPSILON = 1e-4;

let attachedRegistry = null;
let detachRegistryListener = null;
let lastViewportWidth = DEFAULT_VIEWPORT_WIDTH;
let lastLoggedPlayerX = null;
let lastLoggedAreaId = null;
let makeAwareListenerAttached = false;

function measureViewportWidth(canvas) {
  if (!canvas) return null;

  try {
    if (typeof canvas.getBoundingClientRect === 'function') {
      const rect = canvas.getBoundingClientRect();
      if (rect && Number.isFinite(rect.width) && rect.width > 0) {
        return rect.width;
      }
    }
  } catch (_error) {
    // Ignore DOM measurement failures (e.g., detached canvas)
  }

  const clientWidth = Number.isFinite(canvas.clientWidth) ? canvas.clientWidth : null;
  if (clientWidth && clientWidth > 0) {
    return clientWidth;
  }

  const attrWidth = Number.isFinite(canvas.width) ? canvas.width : null;
  if (attrWidth && attrWidth > 0) {
    return attrWidth;
  }

  return null;
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) return min;
  if (!Number.isFinite(min) && !Number.isFinite(max)) return value;
  if (!Number.isFinite(min)) return Math.min(value, max);
  if (!Number.isFinite(max)) return Math.max(value, min);
  if (min > max) return min;
  return Math.min(Math.max(value, min), max);
}

function getNowSeconds() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now() / 1000;
  }
  return Date.now() / 1000;
}

function ensureCameraAwareness(camera) {
  const awareness = (camera.awareness = camera.awareness || {});
  const fallbackZoom = Number.isFinite(camera.zoom) ? camera.zoom : 1;
  awareness.state = awareness.state === 'aware' ? 'aware' : 'default';
  awareness.defaultZoom = Number.isFinite(awareness.defaultZoom) ? awareness.defaultZoom : fallbackZoom;
  awareness.awareZoom = Number.isFinite(awareness.awareZoom) ? awareness.awareZoom : 1;
  awareness.targetZoom = Number.isFinite(awareness.targetZoom)
    ? awareness.targetZoom
    : (awareness.state === 'aware' ? awareness.awareZoom : awareness.defaultZoom);
  awareness.inactivitySeconds = Number.isFinite(awareness.inactivitySeconds)
    ? Math.max(0, awareness.inactivitySeconds)
    : DEFAULT_INACTIVITY_SECONDS;
  awareness.smoothing = Number.isFinite(awareness.smoothing)
    ? clamp(awareness.smoothing, 0, 1)
    : DEFAULT_ZOOM_SMOOTHING;
  awareness.lastInputTime = Number.isFinite(awareness.lastInputTime)
    ? awareness.lastInputTime
    : getNowSeconds();
  return awareness;
}

function refreshAwarenessConfig(camera) {
  const awareness = ensureCameraAwareness(camera);
  const config = window.CONFIG || {};
  const fighterName = pickFighterName(config);
  const fighterConfig = pickFighterConfig(config, fighterName);
  const globalScale = Number.isFinite(config.actor?.scale) ? config.actor.scale : 1;
  const fighterScale = Number.isFinite(fighterConfig?.actor?.scale) ? fighterConfig.actor.scale : 1;
  const combinedScale = globalScale * fighterScale;
  const spec = config.camera?.awareness || {};

  const offset = Number.isFinite(spec.scaleOffset) ? spec.scaleOffset : 0;
  const minZoom = Number.isFinite(spec.minZoom) ? Math.max(MIN_EFFECTIVE_ZOOM, spec.minZoom) : MIN_EFFECTIVE_ZOOM;
  const maxZoom = Number.isFinite(spec.maxZoom) ? Math.max(minZoom, spec.maxZoom) : Math.max(minZoom, 3);
  const defaultZoom = clamp(combinedScale + offset, minZoom, maxZoom);
  const awareZoom = clamp(Number.isFinite(spec.normalZoom) ? spec.normalZoom : 1, minZoom, maxZoom);
  const inactivitySeconds = Number.isFinite(spec.inactivitySeconds)
    ? Math.max(0, spec.inactivitySeconds)
    : DEFAULT_INACTIVITY_SECONDS;
  const smoothing = Number.isFinite(spec.smoothing)
    ? clamp(spec.smoothing, 0, 1)
    : DEFAULT_ZOOM_SMOOTHING;

  let targetChanged = false;

  if (Math.abs(defaultZoom - awareness.defaultZoom) > EPSILON || awareness.fighterName !== fighterName) {
    awareness.defaultZoom = defaultZoom;
    awareness.fighterName = fighterName;
    if (awareness.state !== 'aware') {
      awareness.targetZoom = defaultZoom;
      targetChanged = true;
    }
  }

  if (Math.abs(awareZoom - awareness.awareZoom) > EPSILON) {
    awareness.awareZoom = awareZoom;
    if (awareness.state === 'aware') {
      awareness.targetZoom = awareZoom;
      targetChanged = true;
    }
  }

  awareness.inactivitySeconds = inactivitySeconds;
  awareness.smoothing = smoothing;
  awareness.minZoom = minZoom;
  awareness.maxZoom = maxZoom;

  if (!Number.isFinite(camera.targetZoom) || targetChanged) {
    camera.targetZoom = awareness.targetZoom;
  }
  if (!Number.isFinite(camera.zoom)) {
    camera.zoom = awareness.state === 'aware' ? awareness.awareZoom : awareness.defaultZoom;
  }
}

function setAwarenessState(camera, nextState, { now } = {}) {
  const awareness = ensureCameraAwareness(camera);
  const timestamp = Number.isFinite(now) ? now : getNowSeconds();
  const normalized = nextState === 'aware' ? 'aware' : 'default';
  if (awareness.state === normalized) {
    if (normalized === 'aware') {
      awareness.lastInputTime = timestamp;
    }
    return;
  }
  awareness.state = normalized;
  awareness.targetZoom = normalized === 'aware' ? awareness.awareZoom : awareness.defaultZoom;
  awareness.lastStateChange = timestamp;
  if (normalized === 'aware') {
    awareness.lastInputTime = timestamp;
  }
  camera.targetZoom = awareness.targetZoom;
  if (normalized === 'default' && Math.abs(camera.zoom - awareness.targetZoom) < EPSILON) {
    camera.zoom = awareness.targetZoom;
  }
}

function isInputActive(input) {
  if (!input) return false;
  if (input.left || input.right || input.jump || input.dash) return true;
  if (input.buttonA?.down || input.buttonB?.down) return true;
  return false;
}

function attachMakeAwareListener() {
  if (typeof window === 'undefined' || makeAwareListenerAttached) return;
  window.addEventListener(MAKE_AWARE_EVENT, () => {
    const camera = ensureGameCamera();
    const now = getNowSeconds();
    refreshAwarenessConfig(camera);
    setAwarenessState(camera, 'aware', { now });
  });
  makeAwareListenerAttached = true;
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
  if (!Number.isFinite(camera.viewportWidth)) {
    camera.viewportWidth = lastViewportWidth;
  }
  if (!Number.isFinite(camera.viewportWorldWidth)) {
    const effectiveZoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : 1, MIN_EFFECTIVE_ZOOM);
    const width = Number.isFinite(camera.viewportWidth) ? camera.viewportWidth : DEFAULT_VIEWPORT_WIDTH;
    camera.viewportWorldWidth = width / effectiveZoom;
  }
  const awareness = ensureCameraAwareness(camera);
  camera.targetZoom = Number.isFinite(camera.targetZoom) ? camera.targetZoom : awareness.targetZoom;
  if (typeof camera.setAwarenessState !== 'function') {
    camera.setAwarenessState = (state, options) => setAwarenessState(camera, state, options);
  }
  if (typeof camera.makeAware !== 'function') {
    camera.makeAware = (options) => setAwarenessState(camera, 'aware', options);
  }
  if (typeof camera.resetAwareness !== 'function') {
    camera.resetAwareness = (options) => setAwarenessState(camera, 'default', options);
  }
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
  const awareness = ensureCameraAwareness(camera);
  const viewportWidth = lastViewportWidth || DEFAULT_VIEWPORT_WIDTH;
  const effectiveZoom = Math.max(
    Number.isFinite(camera.zoom) ? camera.zoom : awareness.defaultZoom,
    MIN_EFFECTIVE_ZOOM
  );
  const viewportWorldWidth = viewportWidth / effectiveZoom;
  const span = Math.max(bounds.max - bounds.min, viewportWorldWidth, 1);
  const maxTarget = bounds.min + span - viewportWorldWidth;
  const clampedStart = clamp(area?.camera?.startX, bounds.min, maxTarget);

  camera.bounds = { min: bounds.min, max: bounds.min + span };
  camera.worldWidth = span;
  if (Number.isFinite(area?.camera?.startZoom)) {
    camera.zoom = clamp(area.camera.startZoom, awareness.minZoom ?? MIN_EFFECTIVE_ZOOM, awareness.maxZoom ?? area.camera.startZoom);
  }
  camera.viewportWidth = viewportWidth;
  camera.viewportWorldWidth = viewportWorldWidth;

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
  const measuredWidth = measureViewportWidth(canvas);
  lastViewportWidth = measuredWidth
    || canvas?.width
    || config.canvas?.w
    || lastViewportWidth
    || DEFAULT_VIEWPORT_WIDTH;
  camera.bounds = camera.bounds || { min: 0, max: camera.worldWidth || DEFAULT_WORLD_WIDTH };
  camera.viewportWidth = lastViewportWidth;
  refreshAwarenessConfig(camera);
  const awareness = ensureCameraAwareness(camera);
  setAwarenessState(camera, 'default', { now: getNowSeconds() });
  camera.zoom = awareness.defaultZoom;
  camera.targetZoom = awareness.targetZoom;
  camera.viewportWorldWidth = lastViewportWidth / Math.max(camera.zoom, MIN_EFFECTIVE_ZOOM);
  attachMakeAwareListener();

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
  const awareness = ensureCameraAwareness(camera);
  const now = getNowSeconds();
  refreshAwarenessConfig(camera);
  const activeAreaId = (attachedRegistry && typeof attachedRegistry.getActiveAreaId === 'function')
    ? attachedRegistry.getActiveAreaId()
    : (window.GAME?.currentAreaId || null);

  const measuredWidth = measureViewportWidth(canvas);
  const viewportWidth = measuredWidth
    || canvas?.width
    || C.canvas?.w
    || lastViewportWidth
    || DEFAULT_VIEWPORT_WIDTH;
  lastViewportWidth = viewportWidth;
  camera.viewportWidth = viewportWidth;
  const effectiveZoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : awareness.defaultZoom, MIN_EFFECTIVE_ZOOM);
  let viewportWorldWidth = viewportWidth / effectiveZoom;
  camera.viewportWorldWidth = viewportWorldWidth;

  const bounds = camera.bounds || { min: 0, max: camera.worldWidth || DEFAULT_WORLD_WIDTH };
  const minBound = Number.isFinite(bounds.min) ? bounds.min : 0;
  const maxBound = Number.isFinite(bounds.max) ? bounds.max : minBound + (camera.worldWidth || DEFAULT_WORLD_WIDTH);
  const maxCameraX = Math.max(minBound, maxBound - viewportWorldWidth);

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
        viewportWidthPixels: viewportWidth,
        viewportWidthWorld: Number(viewportWorldWidth.toFixed(2)),
        cameraBounds: { min: minBound, max: maxBound },
      });
    }
  }
  const desiredX = playerX - viewportWorldWidth * 0.5;
  const target = clamp(desiredX, minBound, maxCameraX);

  const smoothing = Number.isFinite(camera.smoothing) ? camera.smoothing : DEFAULT_SMOOTHING;
  const currentX = Number.isFinite(camera.x) ? camera.x : minBound;
  camera.x = currentX + (target - currentX) * smoothing;
  camera.targetX = target;

  const input = G.input;
  if (isInputActive(input)) {
    awareness.lastInputTime = now;
  }
  if (awareness.state === 'aware' && (now - awareness.lastInputTime) >= awareness.inactivitySeconds) {
    setAwarenessState(camera, 'default', { now });
  }

  const minZoom = awareness.minZoom ?? MIN_EFFECTIVE_ZOOM;
  const maxZoom = awareness.maxZoom ?? Math.max(minZoom, 3);
  const targetZoomRaw = Number.isFinite(camera.targetZoom) ? camera.targetZoom : awareness.targetZoom;
  const targetZoom = clamp(targetZoomRaw, minZoom, maxZoom);
  const zoomSmoothing = awareness.smoothing;
  if (!Number.isFinite(camera.zoom)) {
    camera.zoom = awareness.state === 'aware' ? awareness.awareZoom : awareness.defaultZoom;
  }
  if (zoomSmoothing <= 0) {
    camera.zoom = targetZoom;
  } else {
    camera.zoom = camera.zoom + (targetZoom - camera.zoom) * zoomSmoothing;
  }
  camera.zoom = clamp(camera.zoom, minZoom, maxZoom);
  const updatedZoom = Math.max(camera.zoom, MIN_EFFECTIVE_ZOOM);
  viewportWorldWidth = viewportWidth / updatedZoom;
  camera.viewportWorldWidth = viewportWorldWidth;
}
