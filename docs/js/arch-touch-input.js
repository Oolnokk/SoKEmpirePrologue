// arch-touch-input.js — builds the HUD arch buttons and wires them to GAME.input

const DEFAULT_CONFIG = {
  arch: {
    radiusPx: 150,
    startAngleDeg: -145,
    endAngleDeg: -35,
    anchor: { x: 0.88, y: 0.86 },
    scale: 1,
    buttonSizePx: 84,
    defaultGapPx: 10,
    rotateWithArch: true,
    debug: false,
  },
  buttons: [
    { id: 'attackA', action: 'buttonA', order: 0, lengthPct: 0.22, gapPx: 12, sprite: 'img/ui/btn-light.png' },
    { id: 'attackB', action: 'buttonB', order: 1, lengthPct: 0.22, gapPx: 12, sprite: 'img/ui/btn-heavy.png' },
    { id: 'attackC', action: 'buttonC', order: 2, lengthPct: 0.24, gapPx: 12, sprite: 'img/ui/btn-special.png' },
    { id: 'jump', action: 'jump', order: 3, lengthPct: 0.20, gapPx: 12, sprite: 'img/ui/btn-jump.png' },
  ],
};

function clone(value) {
  return typeof structuredClone === 'function'
    ? structuredClone(value)
    : JSON.parse(JSON.stringify(value));
}

function vpX(frac) {
  return frac * window.innerWidth;
}
function vpY(frac) {
  return frac * window.innerHeight;
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
      startAngleDeg: sanitizeNumber(arch.startAngleDeg, DEFAULT_CONFIG.arch.startAngleDeg),
      endAngleDeg: sanitizeNumber(arch.endAngleDeg, DEFAULT_CONFIG.arch.endAngleDeg),
      anchor: {
        x: sanitizeNumber(arch.anchor?.x, DEFAULT_CONFIG.arch.anchor.x),
        y: sanitizeNumber(arch.anchor?.y, DEFAULT_CONFIG.arch.anchor.y),
      },
      scale: sanitizeNumber(arch.scale, DEFAULT_CONFIG.arch.scale),
      buttonSizePx: sanitizeNumber(arch.buttonSizePx, DEFAULT_CONFIG.arch.buttonSizePx),
      defaultGapPx: sanitizeNumber(arch.defaultGapPx, DEFAULT_CONFIG.arch.defaultGapPx),
      rotateWithArch: arch.rotateWithArch !== false,
      debug: !!arch.debug,
    },
    buttons: buttons || clone(DEFAULT_CONFIG.buttons),
  };
}

function setInputState(input, action, down) {
  if (!input) return;
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

function buildButtonArch(config, handlers = {}) {
  const archCfg = config.arch;
  const btnCfgs = [...config.buttons].sort((a, b) => (a.order || 0) - (b.order || 0));

  const container = document.createElement('div');
  container.className = 'arch-hud';
  container.style.setProperty('--arch-button-size', `${archCfg.buttonSizePx * (archCfg.scale || 1)}px`);

  const radius = archCfg.radiusPx * (archCfg.scale || 1);
  const startRad = (archCfg.startAngleDeg * Math.PI) / 180;
  const endRad = (archCfg.endAngleDeg * Math.PI) / 180;
  const totalAngle = endRad - startRad; // signed
  const totalLength = Math.abs(radius * totalAngle);

  const cx = vpX(archCfg.anchor.x);
  const cy = vpY(archCfg.anchor.y);

  let cursorLen = 0;
  const debugInfo = [];

  btnCfgs.forEach((btnCfg) => {
    const segLength = btnCfg.lengthPct * totalLength;
    const gap = btnCfg.gapPx != null ? btnCfg.gapPx : archCfg.defaultGapPx || 0;

    // Raw segment along arc
    const rawStart = cursorLen;
    const rawEnd = cursorLen + segLength;

    // Carve AFTER sizing
    const carvedStart = rawStart + gap / 2;
    const carvedEnd = rawEnd - gap / 2;

    const startL = Math.min(carvedStart, carvedEnd);
    const endL = Math.max(carvedStart, carvedEnd);
    const centerL = (startL + endL) * 0.5;

    const t = centerL / totalLength; // 0..1 along the arch
    const angleAlong = totalAngle * t + startRad; // radians

    const x = cx + radius * Math.cos(angleAlong);
    const y = cy + radius * Math.sin(angleAlong);

    const size = archCfg.buttonSizePx * (archCfg.scale || 1);
    const halfSize = size / 2;

    const btnEl = document.createElement('button');
    btnEl.className = 'arch-hud__button';
    btnEl.id = `arch-btn-${btnCfg.id}`;
    btnEl.type = 'button';

    let rotDeg = 0;
    if (archCfg.rotateWithArch) {
      rotDeg = (angleAlong * 180) / Math.PI + 90;
    }

    btnEl.style.left = `${x - halfSize}px`;
    btnEl.style.top = `${y - halfSize}px`;
    btnEl.style.transform = `rotate(${rotDeg}deg)`;

    if (btnCfg.sprite) {
      const img = document.createElement('img');
      img.src = btnCfg.sprite;
      img.alt = btnCfg.id;
      btnEl.appendChild(img);
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
        rawStart,
        rawEnd,
        carvedStart: startL,
        carvedEnd: endL,
        angleDeg: (angleAlong * 180) / Math.PI,
        screenX: x,
        screenY: y,
      });
    }

    cursorLen += segLength;
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
  const activeButtons = new Map();

  const handleDown = (btnCfg, btnEl) => {
    btnEl?.classList.add('active');
    setInputState(input, btnCfg.action, true);
    activeButtons.set(btnCfg.id, { cfg: btnCfg, el: btnEl });
  };
  const handleUp = (btnCfg, btnEl) => {
    btnEl?.classList.remove('active');
    setInputState(input, btnCfg.action, false);
    activeButtons.delete(btnCfg.id);
  };

  const releaseActiveButtons = () => {
    activeButtons.forEach(({ cfg, el }) => {
      el?.classList.remove('active');
      setInputState(input, cfg.action, false);
    });
    activeButtons.clear();
  };

  const rebuild = () => {
    releaseActiveButtons();
    if (container?.parentNode) {
      container.parentNode.removeChild(container);
    }
    container = buildButtonArch(config, { onDown: handleDown, onUp: handleUp });
    document.body.appendChild(container);
  };

  rebuild();
  document.documentElement.classList.add('arch-hud-active');

  const onResize = () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(rebuild, 80);
  };
  window.addEventListener('resize', onResize);

  return {
    rebuild,
    destroy() {
      releaseActiveButtons();
      clearTimeout(resizeTimer);
      window.removeEventListener('resize', onResize);
      if (container?.parentNode) container.parentNode.removeChild(container);
      document.documentElement.classList.remove('arch-hud-active');
    },
  };
}

export default initArchTouchInput;
