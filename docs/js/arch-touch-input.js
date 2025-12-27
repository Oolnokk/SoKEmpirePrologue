// arch-touch-input.js — builds the HUD arch buttons and wires them to GAME.input

const DEFAULT_CONFIG = {
  arch: {
    radiusPx: 150,
    start: { x: 0.98, y: 0.94 },
    end: { x: 0.78, y: 0.86 },
    gridSnapPx: 0,
    scale: 1,
    buttonSizePx: 84,
    defaultGapPx: 10,
    rotateWithArch: true,
    flipVertical: true,
    debug: false,
  },
  buttons: [
    { id: 'attackA', action: 'buttonA', order: 0, lengthPct: 0.22, gapPx: 12, letter: 'A' },
    { id: 'attackB', action: 'buttonB', order: 1, lengthPct: 0.22, gapPx: 12, letter: 'B' },
    { id: 'attackC', action: 'buttonC', order: 2, lengthPct: 0.24, gapPx: 12, letter: 'C' },
    { id: 'jump', action: 'jump', order: 3, lengthPct: 0.20, gapPx: 12, letter: 'J' },
  ],
};

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function getViewportRect(rootEl) {
  const gameplayRoot =
    (rootEl && rootEl !== document.body ? rootEl : null) ||
    document.getElementById('gameStage') ||
    document.querySelector('.stage');

  if (gameplayRoot && gameplayRoot !== document.body) {
    const rect = gameplayRoot.getBoundingClientRect();
    return {
      width: rect.width,
      height: rect.height,
      offsetLeft: 0,
      offsetTop: 0,
    };
  }

  const vv = window.visualViewport;
  if (vv) {
    return {
      width: vv.width,
      height: vv.height,
      offsetLeft: vv.offsetLeft,
      offsetTop: vv.offsetTop,
    };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    offsetLeft: 0,
    offsetTop: 0,
  };
}

function vpPoint(coord, vp, flipVertical) {
  const normY = flipVertical ? 1 - coord.y : coord.y;
  return {
    x: vp.offsetLeft + coord.x * vp.width,
    y: vp.offsetTop + normY * vp.height,
  };
}

function sanitizeNumber(value, fallback) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function mergeArchConfig(raw = {}) {
  const arch = raw.arch || {};
  const buttons = Array.isArray(raw.buttons) && raw.buttons.length ? raw.buttons : null;
  return {
    arch: {
      radiusPx: sanitizeNumber(arch.radiusPx, DEFAULT_CONFIG.arch.radiusPx),
      start: {
        x: sanitizeNumber(arch.start?.x, DEFAULT_CONFIG.arch.start.x),
        y: sanitizeNumber(arch.start?.y, DEFAULT_CONFIG.arch.start.y),
      },
      end: {
        x: sanitizeNumber(arch.end?.x, DEFAULT_CONFIG.arch.end.x),
        y: sanitizeNumber(arch.end?.y, DEFAULT_CONFIG.arch.end.y),
      },
      gridSnapPx: sanitizeNumber(arch.gridSnapPx ?? arch.gridSizePx, DEFAULT_CONFIG.arch.gridSnapPx),
      scale: sanitizeNumber(arch.scale, DEFAULT_CONFIG.arch.scale),
      buttonSizePx: sanitizeNumber(arch.buttonSizePx, DEFAULT_CONFIG.arch.buttonSizePx),
      defaultGapPx: sanitizeNumber(arch.defaultGapPx, DEFAULT_CONFIG.arch.defaultGapPx),
      rotateWithArch: arch.rotateWithArch !== false,
      flipVertical: arch.flipVertical !== false,
      debug: !!arch.debug,
    },
    buttons: buttons || clone(DEFAULT_CONFIG.buttons),
  };
}

function setInputState(input, action, down) {
  if (!input) return;

  // Handle special context action
  if (action === 'context') {
    if (down) {
      // Trigger context action (e.g., pickup)
      const pickupManager = window.GAME?.groundPickupManager;
      if (pickupManager) {
        pickupManager.triggerPickup();
      }
    }
    return;
  }

  if (action === 'jump') {
    input.jump = !!down;
    return;
  }
  const state = input[action];
  if (!state) return;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  const wasDown = !!state.down;
  if (down) {
    state.down = true;
    if (!wasDown) state.downTime = now;
  } else if (wasDown) {
    state.down = false;
    state.upTime = now;
  }
}

function chooseCircleCenter(p0, p1, radius, preference) {
  const dx = p1.x - p0.x;
  const dy = p1.y - p0.y;
  const dSq = dx * dx + dy * dy;
  const d = Math.sqrt(dSq);
  if (!d || d > radius * 2) return null;

  const mx = (p0.x + p1.x) / 2;
  const my = (p0.y + p1.y) / 2;
  const h = Math.sqrt(Math.max(radius * radius - (d / 2) * (d / 2), 0));

  const ux = -dy / d;
  const uy = dx / d;

  const c1 = { x: mx + ux * h, y: my + uy * h };
  const c2 = { x: mx - ux * h, y: my - uy * h };

  const target = preference || { x: window.innerWidth / 2, y: window.innerHeight / 2 };
  const dist1 = (c1.x - target.x) ** 2 + (c1.y - target.y) ** 2;
  const dist2 = (c2.x - target.x) ** 2 + (c2.y - target.y) ** 2;
  return dist1 <= dist2 ? c1 : c2;
}

function normalizeAngleDelta(delta) {
  if (delta > Math.PI) return delta - Math.PI * 2;
  if (delta < -Math.PI) return delta + Math.PI * 2;
  return delta;
}

function snapToGrid(point, gridSizePx) {
  if (!gridSizePx || !Number.isFinite(gridSizePx)) return point;
  return {
    x: Math.round(point.x / gridSizePx) * gridSizePx,
    y: Math.round(point.y / gridSizePx) * gridSizePx,
  };
}

function observeButtonList(buttons, onChange) {
  if (!Array.isArray(buttons) || !onChange) return null;
  const methods = ['push', 'pop', 'shift', 'unshift', 'splice', 'sort', 'reverse'];
  const originals = new Map();

  methods.forEach((method) => {
    if (typeof buttons[method] !== 'function') return;
    originals.set(method, buttons[method]);
    // eslint-disable-next-line no-param-reassign
    buttons[method] = function patchedMethod(...args) {
      const result = originals.get(method).apply(this, args);
      onChange();
      return result;
    };
  });

  return () => {
    originals.forEach((original, method) => {
      // eslint-disable-next-line no-param-reassign
      buttons[method] = original;
    });
  };
}

function buildButtonArch(config, handlers = {}, rootEl = null) {
  const archCfg = config.arch;
  const btnCfgs = [...config.buttons].sort((a, b) => (a.order || 0) - (b.order || 0));

  const container = document.createElement('div');
  container.className = 'arch-hud';
  container.style.position = rootEl === document.body ? 'fixed' : 'absolute';
  container.style.inset = '0';
  container.style.setProperty('--arch-button-size', `${archCfg.buttonSizePx * (archCfg.scale || 1)}px`);

  const vp = getViewportRect(rootEl);
  const scale = archCfg.scale || 1;
  const baseRadius = archCfg.radiusPx * scale;
  const flipY = archCfg.flipVertical !== false;
  const startPt = snapToGrid(vpPoint(archCfg.start, vp, flipY), archCfg.gridSnapPx);
  const endPt = snapToGrid(vpPoint(archCfg.end, vp, flipY), archCfg.gridSnapPx);
  const chordLength = Math.hypot(endPt.x - startPt.x, endPt.y - startPt.y);
  const radius = Math.max(baseRadius, chordLength / 2 + archCfg.buttonSizePx * scale * 0.1);
  const center = chooseCircleCenter(startPt, endPt, radius, {
    x: vp.offsetLeft + vp.width * 0.5,
    y: vp.offsetTop + vp.height * 0.5,
  });
  if (!center) return container;

  const startRad = Math.atan2(startPt.y - center.y, startPt.x - center.x);
  const endRad = Math.atan2(endPt.y - center.y, endPt.x - center.x);
  const totalAngle = normalizeAngleDelta(endRad - startRad);
  const totalLength = Math.abs(radius * totalAngle);
  if (!Number.isFinite(totalLength) || totalLength === 0) return container;

  const debugInfo = [];
  const btnCount = btnCfgs.length;

  btnCfgs.forEach((btnCfg, idx) => {
    const t = btnCount > 1 ? idx / (btnCount - 1) : 0.5;
    const angleAlong = startRad + totalAngle * t;
    const x = center.x + radius * Math.cos(angleAlong);
    const y = center.y + radius * Math.sin(angleAlong);

    const size = archCfg.buttonSizePx * (archCfg.scale || 1);
    const halfSize = size / 2;

    const btnEl = document.createElement('button');
    btnEl.className = btnCfg.contextual ? 'arch-hud__button arch-hud__button--context' : 'arch-hud__button';
    btnEl.id = `arch-btn-${btnCfg.id}`;
    btnEl.type = 'button';

    let rotDeg = 0;
    if (archCfg.rotateWithArch) {
      rotDeg = (angleAlong * 180) / Math.PI + 90;
    }

    btnEl.style.left = `${x - halfSize}px`;
    btnEl.style.top = `${y - halfSize}px`;
    btnEl.style.transform = `rotate(${rotDeg}deg)`;

    const letter = (btnCfg.letter || '').toString().trim();
    if (letter) {
      btnEl.dataset.letter = letter.toUpperCase();
      const label = document.createElement('span');
      label.className = 'arch-hud__button-label';
      label.textContent = letter.toUpperCase();
      btnEl.appendChild(label);
    }

    const onDown = (event) => {
      event.preventDefault();
      handlers.onDown?.(btnCfg, btnEl);
    };
    const onUp = (event) => {
      if (event) event.preventDefault();
      handlers.onUp?.(btnCfg, btnEl);
    };

    btnEl.addEventListener('pointerdown', onDown);
    btnEl.addEventListener('pointerup', onUp);
    btnEl.addEventListener('pointercancel', onUp);
    btnEl.addEventListener('pointerleave', onUp);
    btnEl.addEventListener('touchstart', onDown, { passive: false });
    btnEl.addEventListener('touchend', onUp, { passive: false });

    container.appendChild(btnEl);

    if (archCfg.debug) {
      debugInfo.push({
        id: btnCfg.id,
        angleDeg: (angleAlong * 180) / Math.PI,
        screenX: x,
        screenY: y,
        t,
      });
    }
  });

  if (archCfg.debug && debugInfo.length) {
    const dbg = document.createElement('pre');
    dbg.style.position = 'fixed';
    dbg.style.left = '8px';
    dbg.style.bottom = '8px';
    dbg.style.maxWidth = '70vw';
    dbg.style.maxHeight = '40vh';
    dbg.style.overflow = 'auto';
    dbg.style.fontSize = '10px';
    dbg.style.background = 'rgba(15,23,42,0.9)';
    dbg.style.color = '#e5e7eb';
    dbg.style.padding = '6px 8px';
    dbg.style.borderRadius = '6px';
    dbg.style.zIndex = '999';
    dbg.textContent = JSON.stringify(debugInfo, null, 2);
    container.appendChild(dbg);
  }

  return container;
}

export function initArchTouchInput({ input = null, enabled = true, config: rawConfig = null } = {}) {
  if (!enabled) return null;
  const config = mergeArchConfig(rawConfig || window.CONFIG?.hud?.arch || {});
  let container = null;
  let resizeTimer = null;
  let teardownButtonObserver = null;
  let buttonObserverTarget = null;

  const handleDown = (btnCfg, btnEl) => {
    btnEl?.classList.add('active');
    setInputState(input, btnCfg.action, true);
  };
  const handleUp = (btnCfg, btnEl) => {
    btnEl?.classList.remove('active');
    setInputState(input, btnCfg.action, false);
  };

  const getHudRoot = () => {
    const stage = document.getElementById('gameStage') || document.querySelector('.stage');
    if (stage) return stage;
    return document.fullscreenElement || document.body;
  };

  const rebuild = () => {
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    if (buttonObserverTarget !== config.buttons) {
      if (typeof teardownButtonObserver === 'function') teardownButtonObserver();
      buttonObserverTarget = config.buttons;
      teardownButtonObserver = observeButtonList(buttonObserverTarget, rebuild);
    }
    const root = getHudRoot();
    container = buildButtonArch(config, { onDown: handleDown, onUp: handleUp }, root);
    root.appendChild(container);
  };

  rebuild();
  document.documentElement.classList.add('arch-hud-active');

  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 80);
  };
  window.addEventListener('resize', onResize);
  document.addEventListener('fullscreenchange', rebuild);
  window.addEventListener('archButtonsChanged', rebuild);

  return {
    rebuild,
    destroy() {
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('fullscreenchange', rebuild);
      window.removeEventListener('archButtonsChanged', rebuild);
      if (typeof teardownButtonObserver === 'function') teardownButtonObserver();
      if (container?.parentNode) container.parentNode.removeChild(container);
      document.documentElement.classList.remove('arch-hud-active');
    },
  };
}

export default initArchTouchInput;
