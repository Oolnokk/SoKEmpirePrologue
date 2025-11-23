// camera.js — simple x-follow camera with smoothing integrated with map registry
import { pickFighterConfig, pickFighterName } from './fighter-utils.js?v=1';

const DEFAULT_WORLD_WIDTH = 1600;
const DEFAULT_WORLD_HEIGHT = 900;
const DEFAULT_VIEWPORT_WIDTH = 720;
const DEFAULT_VIEWPORT_HEIGHT = 460;
const DEFAULT_SMOOTHING = 0.15;
const DEFAULT_ZOOM_SMOOTHING = 0.08;
const DEFAULT_INACTIVITY_SECONDS = 15;
const MIN_EFFECTIVE_ZOOM = 0.05;
const MAKE_AWARE_EVENT = 'make-aware';
const EPSILON = 1e-4;

let attachedRegistry = null;
let detachRegistryListener = null;
let lastViewportWidth = DEFAULT_VIEWPORT_WIDTH;
let lastViewportHeight = DEFAULT_VIEWPORT_HEIGHT;
let lastLoggedPlayerX = null;
let lastLoggedAreaId = null;
let makeAwareListenerAttached = false;

function measureViewportWidth(canvas) {
  if (!canvas) return null;

  const attrWidth = Number.isFinite(canvas.width) ? canvas.width : null;

  try {
    if (typeof canvas.getBoundingClientRect === 'function') {
      const rect = canvas.getBoundingClientRect();
      if (rect && Number.isFinite(rect.width) && rect.width > 0) {
        if (attrWidth && attrWidth > 0) {
          return attrWidth;
        }
        return rect.width;
      }
    }
  } catch (_error) {
    // Ignore DOM measurement failures (e.g., detached canvas)
  }

  if (attrWidth && attrWidth > 0) {
    return attrWidth;
  }

  const clientWidth = Number.isFinite(canvas.clientWidth) ? canvas.clientWidth : null;
  if (clientWidth && clientWidth > 0) {
    return clientWidth;
  }

  return null;
}

function measureViewportHeight(canvas) {
  if (!canvas) return null;

  const attrHeight = Number.isFinite(canvas.height) ? canvas.height : null;

  try {
    if (typeof canvas.getBoundingClientRect === 'function') {
      const rect = canvas.getBoundingClientRect();
      if (rect && Number.isFinite(rect.height) && rect.height > 0) {
        if (attrHeight && attrHeight > 0) {
          return attrHeight;
        }
        return rect.height;
      }
    }
  } catch (_error) {
    // Ignore DOM measurement failures (e.g., detached canvas)
  }

  if (attrHeight && attrHeight > 0) {
    return attrHeight;
  }

  const clientHeight = Number.isFinite(canvas.clientHeight) ? canvas.clientHeight : null;
  if (clientHeight && clientHeight > 0) {
    return clientHeight;
  }

  return null;
}

function getManualCameraOffset() {
  const config = (typeof window !== 'undefined' && window.CONFIG) ? window.CONFIG : null;
  if (!config || !config.camera) return 0;
  const manual = config.camera.manualOffsetX;
  return Number.isFinite(manual) ? manual : 0;
}

function getManualCameraOffsetY() {
  const config = (typeof window !== 'undefined' && window.CONFIG) ? window.CONFIG : null;
  if (!config || !config.camera) return 0;
  const manual = config.camera.manualOffsetY;
  return Number.isFinite(manual) ? manual : 0;
}

function firstFinite(...values) {
  for (const value of values) {
    if (Number.isFinite(value)) return value;
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
  camera.smoothingY = Number.isFinite(camera.smoothingY) ? camera.smoothingY : camera.smoothing;
  camera.worldWidth = Number.isFinite(camera.worldWidth) ? camera.worldWidth : DEFAULT_WORLD_WIDTH;
  camera.worldHeight = Number.isFinite(camera.worldHeight) ? camera.worldHeight : DEFAULT_WORLD_HEIGHT;
  camera.bounds = camera.bounds || { min: 0, max: DEFAULT_WORLD_WIDTH };
  camera.verticalBounds = camera.verticalBounds || { min: -DEFAULT_WORLD_HEIGHT * 0.5, max: DEFAULT_WORLD_HEIGHT * 0.5 };
  if (!Number.isFinite(camera.viewportWidth)) {
    camera.viewportWidth = lastViewportWidth;
  }
  if (!Number.isFinite(camera.viewportHeight)) {
    camera.viewportHeight = lastViewportHeight;
  }
  if (!Number.isFinite(camera.viewportWorldWidth)) {
    const effectiveZoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : 1, MIN_EFFECTIVE_ZOOM);
    const width = Number.isFinite(camera.viewportWidth) ? camera.viewportWidth : DEFAULT_VIEWPORT_WIDTH;
    camera.viewportWorldWidth = width / effectiveZoom;
  }
  if (!Number.isFinite(camera.viewportWorldHeight)) {
    const effectiveZoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : 1, MIN_EFFECTIVE_ZOOM);
    const height = Number.isFinite(camera.viewportHeight) ? camera.viewportHeight : DEFAULT_VIEWPORT_HEIGHT;
    camera.viewportWorldHeight = height / effectiveZoom;
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

function deriveBoundsFromColliders(colliders) {
  if (!Array.isArray(colliders) || !colliders.length) {
    return null;
  }
  let minLeft = Infinity;
  let maxRight = -Infinity;
  colliders.forEach((col) => {
    if (!col || typeof col !== 'object') return;
    const left = Number(col.left);
    const width = Number(col.width);
    if (!Number.isFinite(left) || !Number.isFinite(width)) return;
    const right = left + width;
    minLeft = Math.min(minLeft, Math.min(left, right));
    maxRight = Math.max(maxRight, Math.max(left, right));
  });
  if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight) || maxRight <= minLeft) {
    return null;
  }
  return { min: minLeft, max: maxRight };
}

function deriveVerticalBoundsFromColliders(colliders) {
  if (!Array.isArray(colliders) || !colliders.length) {
    return null;
  }
  let minTop = Infinity;
  let maxBottom = -Infinity;
  colliders.forEach((col) => {
    if (!col || typeof col !== 'object') return;
    const top = Number(col.top ?? col.y);
    const height = Number(col.height ?? col.h);
    if (!Number.isFinite(top) || !Number.isFinite(height)) return;
    const bottom = top + height;
    minTop = Math.min(minTop, Math.min(top, bottom));
    maxBottom = Math.max(maxBottom, Math.max(top, bottom));
  });
  if (!Number.isFinite(minTop) || !Number.isFinite(maxBottom) || maxBottom <= minTop) {
    return null;
  }
  return { min: minTop, max: maxBottom };
}

function computeAreaBounds(area) {
  if (!area) {
    return { min: 0, max: DEFAULT_WORLD_WIDTH };
  }
  const playable = area.playableBounds || null;
  const playableLeft = Number(playable?.left ?? playable?.min);
  const playableRight = Number(playable?.right ?? playable?.max);
  if (Number.isFinite(playableLeft) && Number.isFinite(playableRight) && playableRight > playableLeft) {
    return { min: playableLeft, max: playableRight };
  }

  const colliderBounds = deriveBoundsFromColliders(area.colliders);
  if (colliderBounds) {
    return colliderBounds;
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

function computeAreaVerticalBounds(area) {
  if (!area) {
    return { min: -DEFAULT_WORLD_HEIGHT * 0.5, max: DEFAULT_WORLD_HEIGHT * 0.5 };
  }
  const playable = area.playableBounds || null;
  const playableTop = Number(playable?.top ?? playable?.minY ?? playable?.yMin);
  const playableBottom = Number(playable?.bottom ?? playable?.maxY ?? playable?.yMax);
  if (Number.isFinite(playableTop) && Number.isFinite(playableBottom) && playableBottom > playableTop) {
    return { min: playableTop, max: playableBottom };
  }

  const colliderBounds = deriveVerticalBoundsFromColliders(area.colliders);
  if (colliderBounds) {
    return colliderBounds;
  }

  let minY = Infinity;
  let maxY = -Infinity;
  const consider = (inst) => {
    const y = inst?.position?.y ?? inst?.y;
    if (Number.isFinite(y)) {
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  };
  if (Array.isArray(area.instances)) {
    for (const inst of area.instances) consider(inst);
  }
  if (Array.isArray(area.props)) {
    for (const prop of area.props) consider(prop);
  }
  const startY = area.camera?.startY;
  if (Number.isFinite(startY)) {
    minY = Math.min(minY, startY);
    maxY = Math.max(maxY, startY);
  }
  if (!Number.isFinite(minY) || !Number.isFinite(maxY)) {
    return { min: -DEFAULT_WORLD_HEIGHT * 0.5, max: DEFAULT_WORLD_HEIGHT * 0.5 };
  }
  if (minY === maxY) {
    maxY = minY + DEFAULT_WORLD_HEIGHT;
  }
  const minBound = Math.min(-DEFAULT_WORLD_HEIGHT * 0.5, minY);
  const maxBound = Math.max(minBound + DEFAULT_WORLD_HEIGHT, maxY);
  return { min: minBound, max: maxBound };
}

function resolveCameraFraming(area) {
  const config = window.CONFIG || {};
  const fighterName = pickFighterName(config);
  const fighterConfig = pickFighterConfig(config, fighterName);
  const baseCamera = config.camera || {};
  const fighterCamera = fighterConfig?.camera || {};
  const areaCamera = area?.camera || {};

  const offsetX = firstFinite(areaCamera.offsetX, fighterCamera.offsetX, baseCamera.offsetX, 0) ?? 0;
  const offsetY = firstFinite(areaCamera.offsetY, fighterCamera.offsetY, baseCamera.offsetY, 0) ?? 0;

  const smoothingXRaw = firstFinite(areaCamera.smoothingX, fighterCamera.smoothingX, baseCamera.smoothingX, null);
  const smoothingYRaw = firstFinite(areaCamera.smoothingY, fighterCamera.smoothingY, baseCamera.smoothingY, smoothingXRaw);
  const smoothingX = Number.isFinite(smoothingXRaw) ? clamp(smoothingXRaw, 0, 1) : null;
  const smoothingY = Number.isFinite(smoothingYRaw) ? clamp(smoothingYRaw, 0, 1) : null;

  return { offsetX, offsetY, smoothingX, smoothingY };
}

function syncCameraToArea(area) {
  const camera = ensureGameCamera();
  const bounds = computeAreaBounds(area);
  const verticalBounds = computeAreaVerticalBounds(area);
  const awareness = ensureCameraAwareness(camera);
  const viewportWidth = lastViewportWidth || DEFAULT_VIEWPORT_WIDTH;
  const viewportHeight = lastViewportHeight || DEFAULT_VIEWPORT_HEIGHT;
  const effectiveZoom = Math.max(
    Number.isFinite(camera.zoom) ? camera.zoom : awareness.defaultZoom,
    MIN_EFFECTIVE_ZOOM
  );
  const viewportWorldWidth = viewportWidth / effectiveZoom;
  const viewportWorldHeight = viewportHeight / effectiveZoom;
  const span = Math.max(bounds.max - bounds.min, viewportWorldWidth, 1);
  const verticalSpan = Math.max(verticalBounds.max - verticalBounds.min, viewportWorldHeight, 1);
  const maxTarget = bounds.min + span - viewportWorldWidth;
  const maxTargetY = verticalBounds.min + verticalSpan - viewportWorldHeight;
  const clampedStart = clamp(area?.camera?.startX, bounds.min, maxTarget);
  const clampedStartY = clamp(area?.camera?.startY, verticalBounds.min, maxTargetY);
  const manualOffset = getManualCameraOffset();
  const manualOffsetY = getManualCameraOffsetY();
  const framing = resolveCameraFraming(area);

  if (Number.isFinite(framing.smoothingY)) {
    camera.smoothingY = framing.smoothingY;
  }
  if (Number.isFinite(framing.smoothingX)) {
    camera.smoothing = framing.smoothingX;
  }

  camera.bounds = { min: bounds.min, max: bounds.min + span };
  camera.verticalBounds = { min: verticalBounds.min, max: verticalBounds.min + verticalSpan };
  camera.worldWidth = span;
  camera.worldHeight = verticalSpan;
  if (Number.isFinite(area?.camera?.startZoom)) {
    camera.zoom = clamp(area.camera.startZoom, awareness.minZoom ?? MIN_EFFECTIVE_ZOOM, awareness.maxZoom ?? area.camera.startZoom);
  }
  camera.viewportWidth = viewportWidth;
  camera.viewportHeight = viewportHeight;
  camera.viewportWorldWidth = viewportWorldWidth;
  camera.viewportWorldHeight = viewportWorldHeight;

  if (Number.isFinite(clampedStart)) {
    camera.x = clamp(clampedStart + manualOffset + framing.offsetX, bounds.min, maxTarget);
  } else {
    camera.x = clamp(camera.x + framing.offsetX + manualOffset, bounds.min, maxTarget);
  }
  camera.targetX = camera.x;

  if (Number.isFinite(clampedStartY)) {
    camera.y = clamp(clampedStartY + manualOffsetY + framing.offsetY, verticalBounds.min, maxTargetY);
  } else {
    camera.y = clamp(camera.y + framing.offsetY + manualOffsetY, verticalBounds.min, maxTargetY);
  }
  camera.targetY = camera.y;
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
  const measuredHeight = measureViewportHeight(canvas);
  lastViewportWidth = measuredWidth
    || canvas?.width
    || config.canvas?.w
    || lastViewportWidth
    || DEFAULT_VIEWPORT_WIDTH;
  lastViewportHeight = measuredHeight
    || canvas?.height
    || config.canvas?.h
    || lastViewportHeight
    || DEFAULT_VIEWPORT_HEIGHT;
  camera.bounds = camera.bounds || { min: 0, max: camera.worldWidth || DEFAULT_WORLD_WIDTH };
  camera.viewportWidth = lastViewportWidth;
  camera.viewportHeight = lastViewportHeight;
  refreshAwarenessConfig(camera);
  const awareness = ensureCameraAwareness(camera);
  setAwarenessState(camera, 'default', { now: getNowSeconds() });
  camera.zoom = awareness.defaultZoom;
  camera.targetZoom = awareness.targetZoom;
  camera.viewportWorldWidth = lastViewportWidth / Math.max(camera.zoom, MIN_EFFECTIVE_ZOOM);
  camera.viewportWorldHeight = lastViewportHeight / Math.max(camera.zoom, MIN_EFFECTIVE_ZOOM);
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
  const activeArea = (attachedRegistry && typeof attachedRegistry.getActiveArea === 'function')
    ? attachedRegistry.getActiveArea()
    : null;
  const framing = resolveCameraFraming(activeArea);
  if (Number.isFinite(framing.smoothingX)) {
    camera.smoothing = framing.smoothingX;
  }
  if (Number.isFinite(framing.smoothingY)) {
    camera.smoothingY = framing.smoothingY;
  }
  const manualOffsetX = getManualCameraOffset();
  const manualOffsetY = getManualCameraOffsetY();

  const measuredWidth = measureViewportWidth(canvas);
  const measuredHeight = measureViewportHeight(canvas);
  const viewportWidth = measuredWidth
    || canvas?.width
    || C.canvas?.w
    || lastViewportWidth
    || DEFAULT_VIEWPORT_WIDTH;
  const viewportHeight = measuredHeight
    || canvas?.height
    || C.canvas?.h
    || lastViewportHeight
    || DEFAULT_VIEWPORT_HEIGHT;
  lastViewportWidth = viewportWidth;
  lastViewportHeight = viewportHeight;
  camera.viewportWidth = viewportWidth;
  camera.viewportHeight = viewportHeight;
  const effectiveZoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : awareness.defaultZoom, MIN_EFFECTIVE_ZOOM);
  let viewportWorldWidth = viewportWidth / effectiveZoom;
  let viewportWorldHeight = viewportHeight / effectiveZoom;
  camera.viewportWorldWidth = viewportWorldWidth;
  camera.viewportWorldHeight = viewportWorldHeight;

  const bounds = camera.bounds || { min: 0, max: camera.worldWidth || DEFAULT_WORLD_WIDTH };
  const minBound = Number.isFinite(bounds.min) ? bounds.min : 0;
  const maxBound = Number.isFinite(bounds.max) ? bounds.max : minBound + (camera.worldWidth || DEFAULT_WORLD_WIDTH);
  const maxCameraX = Math.max(minBound, maxBound - viewportWorldWidth);
  const verticalBounds = camera.verticalBounds || { min: -DEFAULT_WORLD_HEIGHT * 0.5, max: DEFAULT_WORLD_HEIGHT * 0.5 };
  const minBoundY = Number.isFinite(verticalBounds.min) ? verticalBounds.min : -DEFAULT_WORLD_HEIGHT * 0.5;
  const derivedSpanY = Number.isFinite(verticalBounds.max) ? verticalBounds.max - minBoundY : 0;
  const worldHeight = Number.isFinite(camera.worldHeight) ? camera.worldHeight : DEFAULT_WORLD_HEIGHT;
  const verticalSpan = Math.max(derivedSpanY, worldHeight, 1);
  let maxBoundY = Number.isFinite(verticalBounds.max) ? verticalBounds.max : minBoundY + verticalSpan;
  let minCameraY = minBoundY;
  let maxCameraY = maxBoundY - viewportWorldHeight;
  if (!Number.isFinite(maxCameraY) || maxCameraY <= minCameraY) {
    const centerY = minBoundY + (maxBoundY - minBoundY) * 0.5;
    const padding = 1;
    minCameraY = centerY - viewportWorldHeight * 0.5 - padding;
    maxCameraY = centerY - viewportWorldHeight * 0.5 + padding;
  }

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
  const playerY = Number.isFinite(P.hitbox?.y)
    ? P.hitbox.y
    : Number.isFinite(P.pos?.y)
      ? P.pos.y
      : 0;
  const desiredX = playerX - viewportWorldWidth * 0.5 + framing.offsetX + manualOffsetX;
  const target = clamp(desiredX, minBound, maxCameraX);
  const desiredY = playerY - viewportWorldHeight * 0.5 + framing.offsetY + manualOffsetY;
  const targetY = clamp(desiredY, minCameraY, maxCameraY);

  const smoothing = Number.isFinite(camera.smoothing) ? camera.smoothing : DEFAULT_SMOOTHING;
  const smoothingY = Number.isFinite(camera.smoothingY) ? camera.smoothingY : smoothing;
  const currentX = Number.isFinite(camera.x) ? camera.x : minBound;
  const currentY = Number.isFinite(camera.y) ? camera.y : minCameraY;
  camera.x = currentX + (target - currentX) * smoothing;
  camera.targetX = target;
  camera.y = currentY + (targetY - currentY) * smoothingY;
  camera.targetY = targetY;

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
  viewportWorldHeight = viewportHeight / updatedZoom;
  camera.viewportWorldHeight = viewportWorldHeight;
}

export function applyManualZoom({
  scale,
  delta,
  focusX,
  viewportWidth,
} = {}) {
  const camera = ensureGameCamera();
  const awareness = ensureCameraAwareness(camera);
  refreshAwarenessConfig(camera);
  const now = getNowSeconds();
  setAwarenessState(camera, 'aware', { now });
  awareness.lastInputTime = now;

  const minZoom = awareness.minZoom ?? MIN_EFFECTIVE_ZOOM;
  const maxZoom = awareness.maxZoom ?? Math.max(minZoom, 3);

  const currentZoom = Number.isFinite(camera.zoom) ? camera.zoom : awareness.defaultZoom;
  const currentTarget = Number.isFinite(camera.targetZoom) ? camera.targetZoom : currentZoom;
  let nextZoom = currentTarget;

  if (Number.isFinite(scale) && scale > 0) {
    nextZoom *= scale;
  }
  if (Number.isFinite(delta)) {
    nextZoom += delta;
  }

  nextZoom = clamp(nextZoom, minZoom, maxZoom);

  const viewportPxWidth = Number.isFinite(viewportWidth)
    ? viewportWidth
    : Number.isFinite(camera.viewportWidth)
      ? camera.viewportWidth
      : lastViewportWidth || DEFAULT_VIEWPORT_WIDTH;
  lastViewportWidth = viewportPxWidth;
  const viewportPxHeight = Number.isFinite(camera.viewportHeight)
    ? camera.viewportHeight
    : lastViewportHeight || DEFAULT_VIEWPORT_HEIGHT;
  lastViewportHeight = viewportPxHeight;

  const effectiveCurrentZoom = Math.max(currentZoom, MIN_EFFECTIVE_ZOOM);
  const beforeWorldWidth = viewportPxWidth / effectiveCurrentZoom;
  const focusRatioX = Number.isFinite(focusX) && viewportPxWidth > 0
    ? clamp(focusX / viewportPxWidth, 0, 1)
    : 0.5;

  const bounds = camera.bounds || { min: 0, max: camera.worldWidth || DEFAULT_WORLD_WIDTH };
  const minBound = Number.isFinite(bounds.min) ? bounds.min : 0;
  const maxBound = Number.isFinite(bounds.max) ? bounds.max : minBound + (camera.worldWidth || DEFAULT_WORLD_WIDTH);
  const maxCameraXBefore = Math.max(minBound, maxBound - beforeWorldWidth);
  const currentX = Number.isFinite(camera.x) ? clamp(camera.x, minBound, maxCameraXBefore) : minBound;
  const focusWorld = currentX + beforeWorldWidth * focusRatioX;

  const effectiveNextZoom = Math.max(nextZoom, MIN_EFFECTIVE_ZOOM);
  const afterWorldWidth = viewportPxWidth / effectiveNextZoom;
  const maxCameraXAfter = Math.max(minBound, maxBound - afterWorldWidth);
  let nextX = focusWorld - afterWorldWidth * focusRatioX;
  nextX = clamp(nextX, minBound, maxCameraXAfter);

  camera.viewportWidth = viewportPxWidth;
  camera.viewportWorldWidth = afterWorldWidth;
  camera.viewportHeight = viewportPxHeight;
  camera.viewportWorldHeight = viewportPxHeight / effectiveNextZoom;
  camera.targetZoom = nextZoom;
  camera.targetX = nextX;
  camera.x = nextX;

  return nextZoom;
}
