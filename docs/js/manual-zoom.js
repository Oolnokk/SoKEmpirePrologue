// manual-zoom.js — Mouse wheel and touch pinch zoom controls
import { applyManualZoom } from './camera.js?v=5';

const WHEEL_SCALE_PER_DELTA = 0.0025;
const MIN_WHEEL_DELTA = 0.05;

const activePointers = new Map();
let pinchLastDistance = null;

function isEventOnCanvas(event, canvas) {
  if (!event || !canvas) return false;
  if (typeof event.composedPath === 'function') {
    return event.composedPath().includes(canvas);
  }
  return canvas.contains(event.target);
}

function getElementRelativePosition(element, clientX, clientY) {
  if (!element || typeof element.getBoundingClientRect !== 'function') {
    return { x: 0, y: 0 };
  }
  const rect = element.getBoundingClientRect();
  return {
    x: clientX - rect.left,
    y: clientY - rect.top,
  };
}

function handleWheel(event, element, canvas) {
  if (!event || !element || !canvas) return;
  if (!isEventOnCanvas(event, canvas)) {
    return;
  }
  const delta = event.deltaY;
  if (!Number.isFinite(delta) || delta === 0) {
    return;
  }

  const direction = delta > 0 ? -1 : 1;
  const magnitude = Math.abs(delta) * WHEEL_SCALE_PER_DELTA;
  if (magnitude < MIN_WHEEL_DELTA) {
    return;
  }

  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  const pos = getElementRelativePosition(canvas, event.clientX, event.clientY);
  const scale = 1 + magnitude * direction;
  applyManualZoom({ scale, focusX: pos.x, viewportWidth: canvas.clientWidth || canvas.width });
}

function updatePinchZoom(canvas) {
  if (activePointers.size < 2) {
    pinchLastDistance = null;
    return;
  }

  const pointers = Array.from(activePointers.values());
  const [first, second] = pointers;
  const dx = second.clientX - first.clientX;
  const dy = second.clientY - first.clientY;
  const distance = Math.hypot(dx, dy);

  if (!Number.isFinite(distance) || distance <= 0) {
    return;
  }

  const centerX = (first.clientX + second.clientX) / 2;
  const centerY = (first.clientY + second.clientY) / 2;
  const pos = getElementRelativePosition(canvas, centerX, centerY);

  if (pinchLastDistance == null) {
    pinchLastDistance = distance;
    return;
  }

  const scale = distance / pinchLastDistance;
  pinchLastDistance = distance;

  if (!Number.isFinite(scale) || scale === 0) {
    return;
  }

  if (Math.abs(scale - 1) < 0.01) {
    return;
  }

  applyManualZoom({ scale, focusX: pos.x, viewportWidth: canvas.clientWidth || canvas.width });
}

function handlePointerDown(event, canvas) {
  if (event.pointerType !== 'touch' || !isEventOnCanvas(event, canvas)) {
    return;
  }

  activePointers.set(event.pointerId, { clientX: event.clientX, clientY: event.clientY });

  if (activePointers.size >= 2 && typeof canvas.setPointerCapture === 'function') {
    try {
      canvas.setPointerCapture(event.pointerId);
    } catch (_err) {
      // Ignore capture errors (e.g., unsupported browsers)
    }
  }

  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  updatePinchZoom(canvas);
}

function handlePointerMove(event, canvas) {
  if (!activePointers.has(event.pointerId)) {
    return;
  }

  const pointer = activePointers.get(event.pointerId);
  pointer.clientX = event.clientX;
  pointer.clientY = event.clientY;

  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  updatePinchZoom(canvas);
}

function releasePointer(pointerId, canvas) {
  activePointers.delete(pointerId);
  if (activePointers.size < 2) {
    pinchLastDistance = null;
  }
  if (typeof canvas.releasePointerCapture === 'function') {
    try {
      canvas.releasePointerCapture(pointerId);
    } catch (_err) {
      // Ignore release errors
    }
  }
}

function handlePointerEnd(event, canvas) {
  if (!activePointers.has(event.pointerId)) {
    return;
  }

  if (typeof event.preventDefault === 'function') {
    event.preventDefault();
  }

  releasePointer(event.pointerId, canvas);
}

export function initManualZoom({ canvas, stage }) {
  const targetElement = stage || canvas;
  if (!canvas || !targetElement) {
    console.warn('[manual-zoom] Canvas element missing; zoom controls not initialized');
    return;
  }

  const wheelHandler = (event) => handleWheel(event, targetElement, canvas);
  const pointerDownHandler = (event) => handlePointerDown(event, canvas);
  const pointerMoveHandler = (event) => handlePointerMove(event, canvas);
  const pointerUpHandler = (event) => handlePointerEnd(event, canvas);

  targetElement.addEventListener('wheel', wheelHandler, { passive: false });
  targetElement.addEventListener('pointerdown', pointerDownHandler, { passive: false });
  targetElement.addEventListener('pointermove', pointerMoveHandler, { passive: false });
  targetElement.addEventListener('pointerup', pointerUpHandler, { passive: false });
  targetElement.addEventListener('pointercancel', pointerUpHandler, { passive: false });
  targetElement.addEventListener('pointerleave', pointerUpHandler, { passive: false });
  targetElement.addEventListener('pointerout', pointerUpHandler, { passive: false });

  console.log('[manual-zoom] Initialized manual zoom controls');
}
