/**
 * CandleLightOverlay2D.js
 *
 * Self-contained 2D canvas overlay that renders animated flickering candlelight
 * glows on top of the game stage. Supports multiple named layers, simple
 * enabled booleans, and a small Map -> Vars bridge for checkbox toggles.
 */

const DEFAULT_LAYER_ID = 'default';
const VARS_PANEL_ID = 'candlelightLayerVarsPanel';

function coerceNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function getScratchbonesCandlelightConfig() {
  return window?.SCRATCHBONES_CONFIG?.game?.layout?.lighting?.candlelight || null;
}

function ensureScratchbonesCandlelightConfig() {
  if (typeof window === 'undefined') return null;
  window.SCRATCHBONES_CONFIG ||= {};
  window.SCRATCHBONES_CONFIG.game ||= {};
  window.SCRATCHBONES_CONFIG.game.layout ||= {};
  window.SCRATCHBONES_CONFIG.game.layout.lighting ||= {};
  window.SCRATCHBONES_CONFIG.game.layout.lighting.candlelight ||= {};
  return window.SCRATCHBONES_CONFIG.game.layout.lighting.candlelight;
}

function getConfiguredLayers() {
  const config = getScratchbonesCandlelightConfig();
  return Array.isArray(config?.layers) ? config.layers : null;
}

function mergeOptionsWithConfigLayers(options = {}) {
  if (Array.isArray(options.layers) && options.layers.length) return options;
  const configLayers = getConfiguredLayers();
  if (!configLayers?.length) return options;
  return { ...options, layers: configLayers };
}

function writeLayerEnabledToConfig(layerId, enabled) {
  const config = ensureScratchbonesCandlelightConfig();
  if (!config) return;
  config.layers = Array.isArray(config.layers) ? config.layers : [];
  let layer = config.layers.find((entry) => entry?.id === layerId);
  if (!layer) {
    layer = { id: layerId };
    config.layers.push(layer);
  }
  layer.enabled = Boolean(enabled);
}

function findVisibleVarsContainer() {
  if (typeof document === 'undefined') return null;

  const directSelectors = [
    '#projectionVarsPanel',
    '#varsPanel',
    '[data-projection-vars-panel]',
    '[data-vars-panel]',
    '.projectionVarsPanel',
    '.varsPanel',
    '.vars-panel',
  ];

  for (const selector of directSelectors) {
    const el = document.querySelector(selector);
    if (isUsableContainer(el)) return el;
  }

  const candidates = Array.from(document.querySelectorAll('details, aside, section, div, form'));
  const visibleCandidates = candidates.filter(isUsableContainer);

  const preferred = visibleCandidates.find((el) => {
    const text = compactText(el);
    return /projection\s+vars/i.test(text) || /map\s*[-→>]\s*vars/i.test(text);
  });
  if (preferred) return preferred;

  const loose = visibleCandidates.find((el) => {
    const text = compactText(el);
    return /^vars\b/i.test(text) || /\bvars\b/i.test(text);
  });
  if (loose) return loose;

  const debugDetails = Array.from(document.querySelectorAll('details.debug, details')).find(isUsableContainer);
  return debugDetails || null;
}

function compactText(el) {
  return String(el?.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 240);
}

function isUsableContainer(el) {
  if (!el || el.id === VARS_PANEL_ID || el.closest?.(`#${VARS_PANEL_ID}`)) return false;
  if (el === document.body || el === document.documentElement) return false;
  const rect = el.getBoundingClientRect?.();
  const style = window.getComputedStyle?.(el);
  if (!rect || !style) return false;
  if (style.display === 'none' || style.visibility === 'hidden') return false;
  return rect.width > 20 && rect.height > 10;
}

function persistLayerListToConfig(layers) {
  const config = ensureScratchbonesCandlelightConfig();
  if (!config) return;
  const existingById = new Map((Array.isArray(config.layers) ? config.layers : [])
    .filter((entry) => entry?.id)
    .map((entry) => [entry.id, entry]));
  config.layers = layers.map((layer) => ({
    ...(existingById.get(layer.id) || {}),
    ...layer,
    enabled: layer.enabled !== false,
  }));
}

export class CandleLightOverlay2D {
  constructor(container, options = {}) {
    const resolvedOptions = mergeOptionsWithConfigLayers(options);

    this._container = container;
    this._destroyed = false;
    this._afId = null;
    this._pollTimer = null;
    this._dayNight = null;
    this._visible = true;
    this._w = 0;
    this._h = 0;
    this._varsBridge = null;

    // Rendering parameters kept for old callers that read/write the overlay directly.
    this.intensity = resolvedOptions.intensity ?? 0.77;
    this.radius = resolvedOptions.radius ?? 480;
    this.speed = resolvedOptions.speed ?? 4.17;
    this.turbulence = resolvedOptions.turbulence ?? 1.0;

    // Default light position kept for old callers that read/write the overlay directly.
    this._posNormX = resolvedOptions.posNormX ?? 0.5;
    this._posNormY = resolvedOptions.posNormY ?? 0.66;

    // Candle layers are used by _draw() to render one or more independently toggleable glows.
    this._layers = this._normalizeLayers(resolvedOptions.layers, resolvedOptions);
    persistLayerListToConfig(this.getLayers());

    this._onTimeChange = () => {
      this._visible = this._dayNight ? this._dayNight.areCandlesLit() : true;
    };

    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      `z-index:${resolvedOptions.zIndex ?? 2}`,
      'border-radius:inherit',
    ].join(';');
    this._canvas.setAttribute('aria-hidden', 'true');
    this._ctx = this._canvas.getContext('2d', { alpha: true });

    this._lightCanvas = document.createElement('canvas');
    this._lightCtx = this._lightCanvas.getContext('2d', { alpha: true });

    this._layerCanvas = document.createElement('canvas');
    this._layerCtx = this._layerCanvas.getContext('2d', { alpha: true });

    container.appendChild(this._canvas);

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(container);
    this._onResize();
    this._startLoop();

    if (resolvedOptions.autoConnect !== false) this._autoPoll();
  }

  loadSettings(json, { width: refW = 1280, height: refH = 720 } = {}) {
    if (!json || typeof json !== 'object') return;
    const c = json.controls || {};

    if (c.intensity != null) this.intensity = Number(c.intensity);
    if (c.speed != null) this.speed = Number(c.speed);
    if (c.turbulence != null) this.turbulence = Number(c.turbulence);

    if (c.radius != null) {
      const stageMin = Math.min(this._w || refW, this._h || refH);
      const refMin = Math.min(refW, refH);
      this.radius = Number(c.radius) * (stageMin / refMin);
    }

    if (json.light) {
      if (typeof json.light.x === 'number') this._posNormX = json.light.x / refW;
      if (typeof json.light.y === 'number') this._posNormY = json.light.y / refH;
    }

    const layerDefs = Array.isArray(json.layers)
      ? json.layers
      : (Array.isArray(json.lights) ? json.lights : null);

    if (layerDefs) {
      this.setLayers(layerDefs.map((layer, index) => this._normalizeLayerFromJson(layer, index, refW, refH)));
      return;
    }

    this.setLayers([{
      id: DEFAULT_LAYER_ID,
      enabled: true,
      intensity: this.intensity,
      radius: this.radius,
      speed: this.speed,
      turbulence: this.turbulence,
      posNormX: this._posNormX,
      posNormY: this._posNormY,
    }]);
  }

  attach(dayNightSystem) {
    this.detach();
    this._dayNight = dayNightSystem;
    this._dayNight.on('timeChange', this._onTimeChange);
    this._visible = this._dayNight.areCandlesLit();
    if (this._pollTimer) {
      clearInterval(this._pollTimer);
      this._pollTimer = null;
    }
  }

  detach() {
    if (!this._dayNight) return;
    this._dayNight.off('timeChange', this._onTimeChange);
    this._dayNight = null;
  }

  setPositionNorm(x, y) {
    this._posNormX = x;
    this._posNormY = y;
    this.setLayerPositionNorm(DEFAULT_LAYER_ID, x, y);
  }

  setLayers(layers = []) {
    this._layers = this._normalizeLayers(layers, {
      intensity: this.intensity,
      radius: this.radius,
      speed: this.speed,
      turbulence: this.turbulence,
      posNormX: this._posNormX,
      posNormY: this._posNormY,
    });
    this._syncDefaultLayerFields();
    persistLayerListToConfig(this.getLayers());
    this.refreshVarsPanel();
    return this.getLayers();
  }

  getLayers() {
    return this._layers.map((layer) => ({ ...layer }));
  }

  setLayerEnabled(idOrIndex, enabled) {
    const layer = this._findLayer(idOrIndex);
    if (!layer) return false;
    layer.enabled = Boolean(enabled);
    writeLayerEnabledToConfig(layer.id, layer.enabled);
    this.refreshVarsPanel();
    return true;
  }

  toggleLayer(idOrIndex) {
    const layer = this._findLayer(idOrIndex);
    if (!layer) return null;
    layer.enabled = !layer.enabled;
    writeLayerEnabledToConfig(layer.id, layer.enabled);
    this.refreshVarsPanel();
    return layer.enabled;
  }

  setLayerPositionNorm(idOrIndex, x, y) {
    const layer = this._findLayer(idOrIndex);
    if (!layer) return false;
    layer.posNormX = coerceNumber(x, layer.posNormX);
    layer.posNormY = coerceNumber(y, layer.posNormY);
    persistLayerListToConfig(this.getLayers());
    this._syncDefaultLayerFields();
    return true;
  }

  installVarsBridge() {
    if (this._varsBridge) return this._varsBridge;
    this._varsBridge = installCandlelightLayerVarsBridge(this);
    return this._varsBridge;
  }

  refreshVarsPanel() {
    this._varsBridge?.refresh?.();
  }

  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.detach();
    cancelAnimationFrame(this._afId);
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._varsBridge?.destroy?.();
    this._ro.disconnect();
    if (this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
  }

  _onResize() {
    const rect = this._container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(devicePixelRatio || 1, 2);

    this._canvas.width = w * dpr;
    this._canvas.height = h * dpr;
    this._canvas.style.width = `${w}px`;
    this._canvas.style.height = `${h}px`;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._lightCanvas.width = w;
    this._lightCanvas.height = h;
    this._layerCanvas.width = w;
    this._layerCanvas.height = h;
    this._w = w;
    this._h = h;
  }

  _autoPoll() {
    if (typeof window === 'undefined') return;
    const tryConnect = () => {
      if (this._destroyed || this._dayNight) {
        clearInterval(this._pollTimer);
        this._pollTimer = null;
        return;
      }
      if (window.dayNightSystem) this.attach(window.dayNightSystem);
    };
    tryConnect();
    if (!this._dayNight) this._pollTimer = setInterval(tryConnect, 500);
  }

  _startLoop() {
    const loop = (ms) => {
      if (this._destroyed) return;
      this._afId = requestAnimationFrame(loop);
      this._draw(ms / 1000);
    };
    this._afId = requestAnimationFrame(loop);
  }

  _normalizeLayers(layers, fallback = {}) {
    const source = Array.isArray(layers) && layers.length ? layers : [{ id: DEFAULT_LAYER_ID, ...fallback }];
    return source.map((layer, index) => this._normalizeLayer(layer, index, fallback));
  }

  _normalizeLayer(layer = {}, index = 0, fallback = {}) {
    const id = typeof layer.id === 'string' && layer.id.trim() ? layer.id.trim() : (index === 0 ? DEFAULT_LAYER_ID : `layer-${index + 1}`);
    return {
      id,
      // Used by Map -> Vars checkboxes and _draw() to skip this layer.
      enabled: layer.enabled !== false,
      // Used by _drawLayer() to scale this layer's alpha.
      intensity: coerceNumber(layer.intensity, fallback.intensity ?? this.intensity ?? 0.77),
      // Used by _drawLayer() as the light falloff size in CSS px.
      radius: coerceNumber(layer.radius, fallback.radius ?? this.radius ?? 480),
      // Used by _drawLayer() to advance this layer's flicker noise.
      speed: coerceNumber(layer.speed, fallback.speed ?? this.speed ?? 4.17),
      // Used by _drawLayer() for position and alpha flicker drift.
      turbulence: coerceNumber(layer.turbulence, fallback.turbulence ?? this.turbulence ?? 1.0),
      // Used by _drawLayer() as the normalized horizontal source position.
      posNormX: coerceNumber(layer.posNormX ?? layer.xNorm, fallback.posNormX ?? this._posNormX ?? 0.5),
      // Used by _drawLayer() as the normalized vertical source position.
      posNormY: coerceNumber(layer.posNormY ?? layer.yNorm, fallback.posNormY ?? this._posNormY ?? 0.66),
      // Used by _drawLayer() so multiple lights do not flicker in lockstep.
      phaseOffset: coerceNumber(layer.phaseOffset, index * 1.731),
    };
  }

  _normalizeLayerFromJson(layer = {}, index = 0, refW = 1280, refH = 720) {
    const stageMin = Math.min(this._w || refW, this._h || refH);
    const refMin = Math.min(refW, refH);
    const radius = layer.radius != null ? Number(layer.radius) * (stageMin / refMin) : undefined;
    return {
      ...layer,
      radius,
      posNormX: typeof layer.posNormX === 'number' ? layer.posNormX : (typeof layer.x === 'number' ? layer.x / refW : layer.xNorm),
      posNormY: typeof layer.posNormY === 'number' ? layer.posNormY : (typeof layer.y === 'number' ? layer.y / refH : layer.yNorm),
      phaseOffset: layer.phaseOffset ?? index * 1.731,
    };
  }

  _findLayer(idOrIndex) {
    if (typeof idOrIndex === 'number') return this._layers[idOrIndex] || null;
    const id = String(idOrIndex ?? '').trim();
    if (!id) return null;
    return this._layers.find((layer) => layer.id === id) || null;
  }

  _syncDefaultLayerFields() {
    const defaultLayer = this._layers[0];
    if (!defaultLayer) return;
    this.intensity = defaultLayer.intensity;
    this.radius = defaultLayer.radius;
    this.speed = defaultLayer.speed;
    this.turbulence = defaultLayer.turbulence;
    this._posNormX = defaultLayer.posNormX;
    this._posNormY = defaultLayer.posNormY;
  }

  _clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  _smoothNoise(t) {
    return (
      Math.sin(t * 1.7) * 0.44 +
      Math.sin(t * 4.9 + 1.8) * 0.31 +
      Math.sin(t * 9.3 + 4.2) * 0.18 +
      Math.sin(t * 17.1 + 0.7) * 0.07
    );
  }

  _drawSoftEllipse(tCtx, x, y, radiusX, radiusY, coreRadiusY, alpha, innerColor, outerColor) {
    const safeRY = Math.max(1, radiusY);
    const coreStop = this._clamp(coreRadiusY / safeRY, 0, 0.94);
    const midStop = this._clamp(coreStop + (1 - coreStop) * 0.32, coreStop, 0.98);

    tCtx.save();
    tCtx.translate(x, y);
    tCtx.scale(radiusX / safeRY, 1);

    const g = tCtx.createRadialGradient(0, 0, 0, 0, 0, safeRY);
    g.addColorStop(0, innerColor);
    g.addColorStop(coreStop, innerColor);
    g.addColorStop(midStop, `rgba(255,166,54,${alpha * 0.5})`);
    g.addColorStop(1, outerColor);

    tCtx.fillStyle = g;
    tCtx.beginPath();
    tCtx.arc(0, 0, safeRY, 0, Math.PI * 2);
    tCtx.fill();
    tCtx.restore();
  }

  _drawSpecularStreaks(tCtx, x, y, radius, alpha, time, turbulence) {
    const streakCount = 14;
    tCtx.lineWidth = 1;

    for (let i = 0; i < streakCount; i++) {
      const angle = (i / streakCount) * Math.PI * 2 + Math.sin(time + i) * 0.08;
      const length = radius * (0.42 + (i % 4) * 0.055);
      const start = 34 + (i % 3) * 10;
      const wobble = Math.sin(time * (2.1 + i * 0.13) + i) * 18 * turbulence;

      const x1 = x + Math.cos(angle) * start + wobble;
      const y1 = y + Math.sin(angle) * start * 0.64;
      const x2 = x + Math.cos(angle) * length + wobble * 0.45;
      const y2 = y + Math.sin(angle) * length * 0.64;

      const g = tCtx.createLinearGradient(x1, y1, x2, y2);
      g.addColorStop(0, `rgba(255,221,140,${alpha * 0.11})`);
      g.addColorStop(1, 'rgba(255,130,28,0)');

      tCtx.strokeStyle = g;
      tCtx.beginPath();
      tCtx.moveTo(x1, y1);
      tCtx.lineTo(x2, y2);
      tCtx.stroke();
    }
  }

  _drawLayer(targetCtx, layer, time) {
    const w = this._w;
    const h = this._h;
    const intensity = layer.intensity;
    const falloffRadius = layer.radius;
    const turbulence = layer.turbulence;
    const layerTime = time + layer.phaseOffset;

    const noise = this._smoothNoise(layerTime * layer.speed);
    const quickPulse = Math.sin(layerTime * 31.0) * 0.025;
    const flicker = this._clamp(1 + noise * 0.16 * turbulence + quickPulse, 0.72, 1.28);

    const driftX = Math.sin(layerTime * 2.2) * 16 * turbulence + noise * 10 * turbulence;
    const driftY = Math.cos(layerTime * 2.9) * 10 * turbulence;

    const lx = layer.posNormX * w + driftX;
    const ly = layer.posNormY * h - 12 + driftY;

    const pulseAlpha = this._clamp(0.86 + (flicker - 1) * 0.8, 0.68, 1.18);
    const alpha = this._clamp(0.5 * intensity * pulseAlpha, 0.08, 1.25);

    targetCtx.globalCompositeOperation = 'source-over';
    this._drawSoftEllipse(
      targetCtx,
      lx, ly + falloffRadius * 0.12,
      Math.max(60, falloffRadius * 1.12),
      Math.max(42, falloffRadius * 0.7),
      46,
      alpha,
      `rgba(255,223,136,${alpha})`,
      'rgba(255,120,16,0)'
    );

    this._drawSoftEllipse(
      targetCtx,
      lx, ly - 18,
      102, 72, 16,
      alpha * 0.82,
      `rgba(255,245,196,${alpha * 0.8})`,
      'rgba(255,145,32,0)'
    );

    targetCtx.globalCompositeOperation = 'multiply';
    const vig = targetCtx.createRadialGradient(lx, ly, 22, lx, ly, falloffRadius);
    vig.addColorStop(0, 'rgba(255,255,255,1)');
    vig.addColorStop(0.56, 'rgba(255,218,184,0.13)');
    vig.addColorStop(1, 'rgba(0,0,0,0.3)');
    targetCtx.fillStyle = vig;
    targetCtx.fillRect(0, 0, w, h);

    targetCtx.globalCompositeOperation = 'screen';
    this._drawSpecularStreaks(targetCtx, lx, ly, falloffRadius, alpha, layerTime, turbulence);
  }

  _draw(time) {
    const w = this._w;
    const h = this._h;
    if (!w || !h) return;

    const ctx = this._ctx;
    if (!this._visible) {
      ctx.clearRect(0, 0, w, h);
      return;
    }

    const enabledLayers = this._layers.filter((layer) => layer.enabled !== false);
    const lCtx = this._lightCtx;
    const layerCtx = this._layerCtx;
    lCtx.clearRect(0, 0, w, h);
    layerCtx.clearRect(0, 0, w, h);

    for (const layer of enabledLayers) {
      layerCtx.clearRect(0, 0, w, h);
      this._drawLayer(layerCtx, layer, time);
      lCtx.globalCompositeOperation = 'screen';
      lCtx.drawImage(this._layerCanvas, 0, 0, w, h);
    }

    ctx.clearRect(0, 0, w, h);
    if (enabledLayers.length) ctx.drawImage(this._lightCanvas, 0, 0, w, h);
  }
}

export function installCandlelightLayerVarsBridge(overlay) {
  if (!overlay || typeof document === 'undefined') {
    return { refresh() {}, destroy() {} };
  }

  let destroyed = false;
  let scheduled = false;
  let observer = null;

  const scheduleRefresh = () => {
    if (destroyed || scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      refresh();
    });
  };

  const refresh = () => {
    if (destroyed) return;
    const host = findVisibleVarsContainer();
    const existing = document.getElementById(VARS_PANEL_ID);
    if (!host) {
      existing?.remove();
      return;
    }

    const panel = existing || document.createElement('div');
    panel.id = VARS_PANEL_ID;
    panel.dataset.candlelightLayerVars = 'true';
    panel.style.cssText = [
      'margin-top:10px',
      'padding:8px',
      'border:1px solid rgba(242,208,143,0.35)',
      'border-radius:10px',
      'background:rgba(20,14,12,0.72)',
      'color:inherit',
      'font-size:12px',
      'line-height:1.35',
    ].join(';');

    const layers = overlay.getLayers();
    panel.innerHTML = '';

    const title = document.createElement('div');
    title.textContent = 'Candlelight Layers';
    title.style.cssText = 'font-weight:800;margin-bottom:6px;color:var(--accent-2,#f2d08f);';
    panel.appendChild(title);

    if (!layers.length) {
      const empty = document.createElement('div');
      empty.textContent = 'No candlelight layers configured.';
      empty.style.opacity = '0.72';
      panel.appendChild(empty);
    }

    for (const layer of layers) {
      const label = document.createElement('label');
      label.style.cssText = 'display:flex;align-items:center;gap:7px;margin:5px 0;min-height:28px;';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = layer.enabled !== false;
      checkbox.dataset.candlelightLayerId = layer.id;
      checkbox.addEventListener('change', () => {
        overlay.setLayerEnabled(layer.id, checkbox.checked);
        writeLayerEnabledToConfig(layer.id, checkbox.checked);
        console.log(`[CandleLightOverlay2D] ${layer.id} enabled=${checkbox.checked}`);
      });

      const text = document.createElement('span');
      text.textContent = layer.id;
      text.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';

      label.appendChild(checkbox);
      label.appendChild(text);
      panel.appendChild(label);
    }

    const hint = document.createElement('div');
    hint.textContent = 'These booleans update SCRATCHBONES_CONFIG.game.layout.lighting.candlelight.layers at runtime.';
    hint.style.cssText = 'margin-top:6px;opacity:0.68;font-size:11px;';
    panel.appendChild(hint);

    if (panel.parentNode !== host) host.appendChild(panel);
  };

  observer = new MutationObserver(scheduleRefresh);
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['open', 'style', 'class', 'hidden'] });

  window.addEventListener('resize', scheduleRefresh, { passive: true });
  setTimeout(scheduleRefresh, 0);
  setTimeout(scheduleRefresh, 500);
  setTimeout(scheduleRefresh, 1500);

  return {
    refresh,
    destroy() {
      destroyed = true;
      observer?.disconnect();
      window.removeEventListener('resize', scheduleRefresh);
      document.getElementById(VARS_PANEL_ID)?.remove();
    },
  };
}

export function initCandleLightOverlay(options = {}) {
  if (typeof window !== 'undefined' && window.__candleLightOverlay) {
    window.__candleLightOverlay.installVarsBridge?.();
    return window.__candleLightOverlay;
  }

  const container = document.getElementById('gameStage');
  if (!container) {
    console.warn('[CandleLightOverlay2D] #gameStage not found – overlay skipped');
    return null;
  }

  try {
    const overlay = new CandleLightOverlay2D(container, options);
    window.__candleLightOverlay = overlay;
    window.__candleLightOverlayDebug = {
      getLayers: () => overlay.getLayers(),
      setLayers: (layers) => overlay.setLayers(layers),
      setLayerEnabled: (idOrIndex, enabled) => overlay.setLayerEnabled(idOrIndex, enabled),
      toggleLayer: (idOrIndex) => overlay.toggleLayer(idOrIndex),
      setLayerPositionNorm: (idOrIndex, x, y) => overlay.setLayerPositionNorm(idOrIndex, x, y),
      refreshVarsPanel: () => overlay.refreshVarsPanel(),
      installVarsBridge: () => overlay.installVarsBridge(),
    };
    overlay.installVarsBridge();
    console.log('[CandleLightOverlay2D] Initialized on #gameStage');
    console.log('[CandleLightOverlay2D] Debug helpers available at window.__candleLightOverlayDebug');
    console.log('[CandleLightOverlay2D] Map -> Vars layer bridge installed');
    return overlay;
  } catch (err) {
    console.error('[CandleLightOverlay2D] Failed to initialize:', err);
    return null;
  }
}
