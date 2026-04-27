/**
 * CandleLightOverlay2D.js
 *
 * Self-contained 2D canvas overlay that renders animated flickering candlelight
 * glows on top of the game stage.  Designed as a drop-in module: it creates its
 * own canvas inside a given container, manages its own RAF loop, and optionally
 * connects to window.dayNightSystem so it only renders when candles should be lit.
 *
 * Quick start (from app.js):
 *   const { initCandleLightOverlay } = await import('../lighting/CandleLightOverlay2D.js');
 *   initCandleLightOverlay();
 *
 * Single-light/backward-compatible usage:
 *   const overlay = new CandleLightOverlay2D(stageEl, { intensity: 0.9, radius: 500 });
 *
 * Multi-layer usage:
 *   const overlay = new CandleLightOverlay2D(stageEl, {
 *     layers: [
 *       { id: 'table-left', enabled: true,  posNormX: 0.34, posNormY: 0.64, intensity: 0.55, radius: 380 },
 *       { id: 'table-right', enabled: true, posNormX: 0.68, posNormY: 0.62, intensity: 0.5, radius: 360 },
 *     ],
 *   });
 *   overlay.setLayerEnabled('table-left', false);
 *
 * Advanced:
 *   overlay.attach(dayNightSystem);   // optional – auto-polls window.dayNightSystem by default
 *   // ...later:
 *   overlay.destroy();
 */

const DEFAULT_LAYER_ID = 'default';

export class CandleLightOverlay2D {
  /**
   * @param {HTMLElement} container  - Element to inject the overlay canvas into (e.g. #gameStage).
   * @param {object}      [options]
   * @param {number}  [options.intensity=0.77]   - Overall brightness multiplier for the default layer (0.2–2.2).
   * @param {number}  [options.radius=480]        - Falloff radius in CSS px for the default layer.
   * @param {number}  [options.speed=4.17]        - Flicker animation speed for the default layer.
   * @param {number}  [options.turbulence=1.0]    - Amount of position/intensity drift (0–1) for the default layer.
   * @param {number}  [options.posNormX=0.5]      - Horizontal default-layer light position as 0–1 fraction.
   * @param {number}  [options.posNormY=0.66]     - Vertical default-layer light position as 0–1 fraction.
   * @param {Array<object>} [options.layers]      - Optional multi-light layer definitions. Each layer supports id, enabled, intensity, radius, speed, turbulence, posNormX, and posNormY.
   * @param {number}  [options.zIndex=2]          - CSS z-index of the overlay canvas.
   * @param {boolean} [options.autoConnect=true]  - Poll for window.dayNightSystem automatically.
   */
  constructor(container, options = {}) {
    this._container = container;
    this._destroyed = false;
    this._afId = null;
    this._pollTimer = null;
    this._dayNight = null;
    this._visible = true;
    this._w = 0;
    this._h = 0;

    // Rendering parameters kept for old callers that read/write the overlay directly.
    this.intensity  = options.intensity  ?? 0.77;
    this.radius     = options.radius     ?? 480;
    this.speed      = options.speed      ?? 4.17;
    this.turbulence = options.turbulence ?? 1.0;

    // Default light position kept for old callers that read/write the overlay directly.
    this._posNormX = options.posNormX ?? 0.5;
    this._posNormY = options.posNormY ?? 0.66;

    // Candle layers are used by _draw() to render one or more independently toggleable glows.
    this._layers = this._normalizeLayers(options.layers, options);

    // Bound event handler kept so it can be removed later
    this._onTimeChange = () => {
      this._visible = this._dayNight ? this._dayNight.areCandlesLit() : true;
    };

    // Output canvas – sits above canvas#game (z-index 1), below .controls-overlay (z-index 4)
    this._canvas = document.createElement('canvas');
    this._canvas.style.cssText = [
      'position:absolute',
      'inset:0',
      'width:100%',
      'height:100%',
      'pointer-events:none',
      `z-index:${options.zIndex ?? 2}`,
      'border-radius:inherit',
    ].join(';');
    this._canvas.setAttribute('aria-hidden', 'true');
    this._ctx = this._canvas.getContext('2d', { alpha: true });

    // Off-screen composition layer (CSS px dimensions, no DPR scaling needed)
    this._lightCanvas = document.createElement('canvas');
    this._lightCtx = this._lightCanvas.getContext('2d', { alpha: true });

    // Per-light scratch layer prevents one layer's vignette from darkening other enabled layers.
    this._layerCanvas = document.createElement('canvas');
    this._layerCtx = this._layerCanvas.getContext('2d', { alpha: true });

    container.appendChild(this._canvas);

    this._ro = new ResizeObserver(() => this._onResize());
    this._ro.observe(container);
    this._onResize();

    this._startLoop();

    if (options.autoConnect !== false) {
      this._autoPoll();
    }
  }

  // ── Public API ────────────────────────────────────────────────────────────

  /**
   * Apply numeric control settings from a demo-exported JSON object.
   * Image data (surface / occluders) is intentionally ignored.
   *
   * Radius and light position are scaled from the demo's reference viewport to the
   * current stage size.  The demo does not embed its viewport dimensions, so we
   * assume 1280×720 by default – override with the optional second argument if you
   * know the exact screen size the JSON was exported from.
   *
   * New multi-layer JSON may pass either `layers` or `lights` as an array. Each
   * layer/light may use normalized positions (`posNormX` / `posNormY`) or absolute
   * demo coordinates (`x` / `y`).
   *
   * @param {object} json             - Parsed JSON from the candlelight demo's "Export Settings" button.
   * @param {object} [refViewport]    - Reference viewport the JSON was created on.
   * @param {number} [refViewport.width=1280]
   * @param {number} [refViewport.height=720]
   */
  loadSettings(json, { width: refW = 1280, height: refH = 720 } = {}) {
    if (!json || typeof json !== 'object') return;
    const c = json.controls || {};

    if (c.intensity  != null) this.intensity  = Number(c.intensity);
    if (c.speed      != null) this.speed      = Number(c.speed);
    if (c.turbulence != null) this.turbulence = Number(c.turbulence);

    // Scale radius from reference viewport to current stage size
    if (c.radius != null) {
      const stageMin = Math.min(this._w || refW, this._h || refH);
      const refMin   = Math.min(refW, refH);
      this.radius = Number(c.radius) * (stageMin / refMin);
    }

    // Translate absolute light position to 0–1 fractions
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

  /**
   * Manually attach to a DayNightSystem instance.
   * The overlay will show only when dayNightSystem.areCandlesLit() returns true.
   *
   * @param {import('../../src/lighting/DayNightSystem.js').DayNightSystem} dayNightSystem
   */
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

  /** Disconnect from the DayNightSystem; overlay stays visible until destroyed. */
  detach() {
    if (!this._dayNight) return;
    this._dayNight.off('timeChange', this._onTimeChange);
    this._dayNight = null;
  }

  /** Set default-layer light position as a 0–1 fraction of the container size. */
  setPositionNorm(x, y) {
    this._posNormX = x;
    this._posNormY = y;
    this.setLayerPositionNorm(DEFAULT_LAYER_ID, x, y);
  }

  /** Replace all candlelight layers. Empty/invalid arrays fall back to one default layer. */
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
    return this.getLayers();
  }

  /** Return a safe copy of the current candlelight layer settings. */
  getLayers() {
    return this._layers.map((layer) => ({ ...layer }));
  }

  /** Enable/disable one layer by id or array index. Returns true if a layer was found. */
  setLayerEnabled(idOrIndex, enabled) {
    const layer = this._findLayer(idOrIndex);
    if (!layer) return false;
    layer.enabled = Boolean(enabled);
    return true;
  }

  /** Toggle one layer by id or array index. Returns the new boolean state, or null if not found. */
  toggleLayer(idOrIndex) {
    const layer = this._findLayer(idOrIndex);
    if (!layer) return null;
    layer.enabled = !layer.enabled;
    return layer.enabled;
  }

  /** Set one layer's normalized position by id or array index. Returns true if a layer was found. */
  setLayerPositionNorm(idOrIndex, x, y) {
    const layer = this._findLayer(idOrIndex);
    if (!layer) return false;
    layer.posNormX = this._coerceNumber(x, layer.posNormX);
    layer.posNormY = this._coerceNumber(y, layer.posNormY);
    this._syncDefaultLayerFields();
    return true;
  }

  /** Remove the overlay from the DOM and stop all timers. */
  destroy() {
    if (this._destroyed) return;
    this._destroyed = true;
    this.detach();
    cancelAnimationFrame(this._afId);
    if (this._pollTimer) clearInterval(this._pollTimer);
    this._ro.disconnect();
    if (this._canvas.parentNode) this._canvas.parentNode.removeChild(this._canvas);
  }

  // ── Private ───────────────────────────────────────────────────────────────

  _onResize() {
    const rect = this._container.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width));
    const h = Math.max(1, Math.round(rect.height));
    const dpr = Math.min(devicePixelRatio || 1, 2);

    this._canvas.width  = w * dpr;
    this._canvas.height = h * dpr;
    this._canvas.style.width  = `${w}px`;
    this._canvas.style.height = `${h}px`;
    this._ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this._lightCanvas.width  = w;
    this._lightCanvas.height = h;
    this._layerCanvas.width  = w;
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
      if (window.dayNightSystem) {
        this.attach(window.dayNightSystem);
      }
    };
    tryConnect();
    if (!this._dayNight) {
      this._pollTimer = setInterval(tryConnect, 500);
    }
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
      // enabled is intentionally a simple boolean used by setLayerEnabled() and debug controls.
      enabled: layer.enabled !== false,
      // intensity is used by _drawLayer() to scale this layer's alpha.
      intensity: this._coerceNumber(layer.intensity, fallback.intensity ?? this.intensity ?? 0.77),
      // radius is used by _drawLayer() as the light falloff size in CSS px.
      radius: this._coerceNumber(layer.radius, fallback.radius ?? this.radius ?? 480),
      // speed is used by _drawLayer() to advance this layer's flicker noise.
      speed: this._coerceNumber(layer.speed, fallback.speed ?? this.speed ?? 4.17),
      // turbulence is used by _drawLayer() for position and alpha flicker drift.
      turbulence: this._coerceNumber(layer.turbulence, fallback.turbulence ?? this.turbulence ?? 1.0),
      // posNormX is used by _drawLayer() as the normalized horizontal source position.
      posNormX: this._coerceNumber(layer.posNormX ?? layer.xNorm, fallback.posNormX ?? this._posNormX ?? 0.5),
      // posNormY is used by _drawLayer() as the normalized vertical source position.
      posNormY: this._coerceNumber(layer.posNormY ?? layer.yNorm, fallback.posNormY ?? this._posNormY ?? 0.66),
      // phaseOffset is used by _drawLayer() so multiple lights do not flicker in lockstep.
      phaseOffset: this._coerceNumber(layer.phaseOffset, index * 1.731),
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
    if (typeof idOrIndex === 'number') {
      return this._layers[idOrIndex] || null;
    }
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

  _coerceNumber(value, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  // ── Rendering helpers (ported from the candlelight demo) ─────────────────

  _clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
  }

  _smoothNoise(t) {
    return (
      Math.sin(t * 1.7)         * 0.44 +
      Math.sin(t * 4.9  + 1.8) * 0.31 +
      Math.sin(t * 9.3  + 4.2) * 0.18 +
      Math.sin(t * 17.1 + 0.7) * 0.07
    );
  }

  _drawSoftEllipse(tCtx, x, y, radiusX, radiusY, coreRadiusY, alpha, innerColor, outerColor) {
    const safeRY   = Math.max(1, radiusY);
    const coreStop = this._clamp(coreRadiusY / safeRY, 0, 0.94);
    const midStop  = this._clamp(coreStop + (1 - coreStop) * 0.32, coreStop, 0.98);

    tCtx.save();
    tCtx.translate(x, y);
    tCtx.scale(radiusX / safeRY, 1);

    const g = tCtx.createRadialGradient(0, 0, 0, 0, 0, safeRY);
    g.addColorStop(0,        innerColor);
    g.addColorStop(coreStop, innerColor);
    g.addColorStop(midStop,  `rgba(255,166,54,${alpha * 0.5})`);
    g.addColorStop(1,        outerColor);

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
      const angle  = (i / streakCount) * Math.PI * 2 + Math.sin(time + i) * 0.08;
      const length = radius * (0.42 + (i % 4) * 0.055);
      const start  = 34 + (i % 3) * 10;
      const wobble = Math.sin(time * (2.1 + i * 0.13) + i) * 18 * turbulence;

      const x1 = x + Math.cos(angle) * start  + wobble;
      const y1 = y + Math.sin(angle) * start  * 0.64;
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

    const noise      = this._smoothNoise(layerTime * layer.speed);
    const quickPulse = Math.sin(layerTime * 31.0) * 0.025;
    const flicker    = this._clamp(1 + noise * 0.16 * turbulence + quickPulse, 0.72, 1.28);

    const driftX = Math.sin(layerTime * 2.2) * 16 * turbulence + noise * 10 * turbulence;
    const driftY = Math.cos(layerTime * 2.9) * 10 * turbulence;

    const lx = layer.posNormX * w + driftX;
    const ly = layer.posNormY * h - 12 + driftY;

    const pulseAlpha = this._clamp(0.86 + (flicker - 1) * 0.8, 0.68, 1.18);
    const alpha      = this._clamp(0.5 * intensity * pulseAlpha, 0.08, 1.25);

    // Warm glow pool
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

    // Bright core at the candle point
    this._drawSoftEllipse(
      targetCtx,
      lx, ly - 18,
      102, 72, 16,
      alpha * 0.82,
      `rgba(255,245,196,${alpha * 0.8})`,
      'rgba(255,145,32,0)'
    );

    // Vignette sharpens the outer falloff edge for this layer only.
    targetCtx.globalCompositeOperation = 'multiply';
    const vig = targetCtx.createRadialGradient(lx, ly, 22, lx, ly, falloffRadius);
    vig.addColorStop(0,    'rgba(255,255,255,1)');
    vig.addColorStop(0.56, 'rgba(255,218,184,0.13)');
    vig.addColorStop(1,    'rgba(0,0,0,0.3)');
    targetCtx.fillStyle = vig;
    targetCtx.fillRect(0, 0, w, h);

    // Specular streaks on top
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

    // ── Compose light layers ────────────────────────────────────────────────
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

    // ── Blit to output canvas ──────────────────────────────────────────────
    ctx.clearRect(0, 0, w, h);
    if (enabledLayers.length) {
      ctx.drawImage(this._lightCanvas, 0, 0, w, h);
    }
  }
}

// ── Convenience initializer ───────────────────────────────────────────────────

/**
 * Initialize a CandleLightOverlay2D on #gameStage.
 * Safe to call multiple times; only one overlay is created.
 * Auto-polls for window.dayNightSystem and attaches when found.
 *
 * @param {object} [options] - Passed through to CandleLightOverlay2D constructor.
 * @returns {CandleLightOverlay2D|null}
 */
export function initCandleLightOverlay(options = {}) {
  if (typeof window !== 'undefined' && window.__candleLightOverlay) {
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
    };
    console.log('[CandleLightOverlay2D] Initialized on #gameStage');
    console.log('[CandleLightOverlay2D] Debug helpers available at window.__candleLightOverlayDebug');
    return overlay;
  } catch (err) {
    console.error('[CandleLightOverlay2D] Failed to initialize:', err);
    return null;
  }
}
