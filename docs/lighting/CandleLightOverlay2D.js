/**
 * CandleLightOverlay2D.js
 *
 * Self-contained 2D canvas overlay that renders an animated flickering candlelight
 * glow on top of the game stage.  Designed as a drop-in module: it creates its own
 * canvas inside a given container, manages its own RAF loop, and optionally connects
 * to window.dayNightSystem so it only renders when candles should be lit.
 *
 * Quick start (from app.js):
 *   const { initCandleLightOverlay } = await import('../lighting/CandleLightOverlay2D.js');
 *   initCandleLightOverlay();
 *
 * Advanced:
 *   import { CandleLightOverlay2D } from '../lighting/CandleLightOverlay2D.js';
 *   const overlay = new CandleLightOverlay2D(stageEl, { intensity: 0.9, radius: 500 });
 *   overlay.attach(dayNightSystem);   // optional – auto-polls window.dayNightSystem by default
 *   // ...later:
 *   overlay.destroy();
 */

export class CandleLightOverlay2D {
  /**
   * @param {HTMLElement} container  - Element to inject the overlay canvas into (e.g. #gameStage).
   * @param {object}      [options]
   * @param {number}  [options.intensity=0.77]   - Overall brightness multiplier (0.2–2.2).
   * @param {number}  [options.radius=480]        - Falloff radius in CSS px.
   * @param {number}  [options.speed=4.17]        - Flicker animation speed.
   * @param {number}  [options.turbulence=1.0]    - Amount of position/intensity drift (0–1).
   * @param {number}  [options.posNormX=0.5]      - Horizontal light position as 0–1 fraction.
   * @param {number}  [options.posNormY=0.66]     - Vertical light position as 0–1 fraction.
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

    // Rendering parameters
    this.intensity  = options.intensity  ?? 0.77;
    this.radius     = options.radius     ?? 480;
    this.speed      = options.speed      ?? 4.17;
    this.turbulence = options.turbulence ?? 1.0;

    // Light position as fraction of container size
    this._posNormX = options.posNormX ?? 0.5;
    this._posNormY = options.posNormY ?? 0.66;

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
   * @param {object} json - Parsed JSON from the candlelight demo's "Export Settings" button.
   */
  loadSettings(json) {
    if (!json || typeof json !== 'object') return;
    const c = json.controls || {};
    if (c.intensity  != null) this.intensity  = Number(c.intensity);
    if (c.radius     != null) this.radius     = Number(c.radius);
    if (c.speed      != null) this.speed      = Number(c.speed);
    if (c.turbulence != null) this.turbulence = Number(c.turbulence);
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

  /** Set light position as a 0–1 fraction of the container size. */
  setPositionNorm(x, y) {
    this._posNormX = x;
    this._posNormY = y;
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

  _draw(time) {
    const w = this._w;
    const h = this._h;
    if (!w || !h) return;

    const ctx = this._ctx;

    if (!this._visible) {
      ctx.clearRect(0, 0, w, h);
      return;
    }

    const intensity     = this.intensity;
    const falloffRadius = this.radius;
    const turbulence    = this.turbulence;

    const noise      = this._smoothNoise(time * this.speed);
    const quickPulse = Math.sin(time * 31.0) * 0.025;
    const flicker    = this._clamp(1 + noise * 0.16 * turbulence + quickPulse, 0.72, 1.28);

    const driftX = Math.sin(time * 2.2) * 16 * turbulence + noise * 10 * turbulence;
    const driftY = Math.cos(time * 2.9) * 10 * turbulence;

    const lx = this._posNormX * w + driftX;
    const ly = this._posNormY * h - 12 + driftY;

    const pulseAlpha = this._clamp(0.86 + (flicker - 1) * 0.8, 0.68, 1.18);
    const alpha      = this._clamp(0.5 * intensity * pulseAlpha, 0.08, 1.25);

    // ── Compose light layer ────────────────────────────────────────────────
    const lCtx = this._lightCtx;
    lCtx.clearRect(0, 0, w, h);

    // Warm glow pool
    lCtx.globalCompositeOperation = 'source-over';
    this._drawSoftEllipse(
      lCtx,
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
      lCtx,
      lx, ly - 18,
      102, 72, 16,
      alpha * 0.82,
      `rgba(255,245,196,${alpha * 0.8})`,
      'rgba(255,145,32,0)'
    );

    // Vignette sharpens the outer falloff edge
    lCtx.globalCompositeOperation = 'multiply';
    const vig = lCtx.createRadialGradient(lx, ly, 22, lx, ly, falloffRadius);
    vig.addColorStop(0,    'rgba(255,255,255,1)');
    vig.addColorStop(0.56, 'rgba(255,218,184,0.13)');
    vig.addColorStop(1,    'rgba(0,0,0,0.3)');
    lCtx.fillStyle = vig;
    lCtx.fillRect(0, 0, w, h);

    // Specular streaks on top
    lCtx.globalCompositeOperation = 'screen';
    this._drawSpecularStreaks(lCtx, lx, ly, falloffRadius, alpha, time, turbulence);

    // ── Blit to output canvas ──────────────────────────────────────────────
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(this._lightCanvas, 0, 0, w, h);
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
    console.log('[CandleLightOverlay2D] Initialized on #gameStage');
    return overlay;
  } catch (err) {
    console.error('[CandleLightOverlay2D] Failed to initialize:', err);
    return null;
  }
}
