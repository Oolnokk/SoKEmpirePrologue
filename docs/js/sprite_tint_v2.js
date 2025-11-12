const DEFAULT_DEBUG_LABEL = (color) => {
  const [r = 255, g = 255, b = 255, a = 255] = color || [];
  const alpha = (a / 255).toFixed(2);
  return `rgba(${r|0},${g|0},${b|0},${alpha})`;
};

function rgbaToPaint(rgba) {
  const [r = 255, g = 255, b = 255, a = 255] = Array.isArray(rgba) ? rgba : [];
  const alpha = Math.max(0, Math.min(255, a)) / 255;
  const rr = Math.max(0, Math.min(255, r)) | 0;
  const gg = Math.max(0, Math.min(255, g)) | 0;
  const bb = Math.max(0, Math.min(255, b)) | 0;
  return { css: `rgb(${rr},${gg},${bb})`, alpha };
}

export function tintSpriteToCanvas(source, dest, blendColor, opts = {}) {
  if (!source || !dest) return false;

  const w = (source.width || dest.width || 0) | 0;
  const h = (source.height || dest.height || 0) | 0;
  if (!w || !h) return false;

  if (dest.width !== w) dest.width = w;
  if (dest.height !== h) dest.height = h;

  const ctx = dest.getContext && dest.getContext('2d', { willReadFrequently: false });
  if (!ctx) return false;

  const { css, alpha } = rgbaToPaint(blendColor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, w, h);

  ctx.globalAlpha = alpha;
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, w, h);

  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1;
  if (typeof ctx.drawImage === 'function') {
    ctx.drawImage(source, 0, 0);
  } else {
    return false;
  }

  if (opts.debug) {
    try {
      const sw = Math.max(8, Math.round(w * 0.06));
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 1;
      ctx.fillStyle = css;
      ctx.fillRect(2, 2, sw, sw);
      ctx.strokeRect(2, 2, sw, sw);
      if (opts.label) {
        ctx.font = `bold ${Math.max(10, Math.round(sw * 0.55))}px sans-serif`;
        ctx.fillStyle = 'rgba(0,0,0,0.75)';
        ctx.fillText(opts.label, 4 + sw + 2, 2 + sw - 2);
      }
    } catch (err) {
      // Ignore rendering errors in debug overlay (e.g., fonts unavailable)
    }
  }

  return true;
}

function cloneBlendColor(color) {
  if (!Array.isArray(color)) return [255, 255, 255, 0];
  const clone = color.slice(0, 4);
  if (clone.length < 4) {
    clone[3] = clone[3] ?? 0;
  }
  return clone;
}

function defaultTintDebug(sprite, color) {
  const debugFlag = Boolean(sprite && sprite._debugTint);
  return {
    debug: debugFlag,
    label: debugFlag ? DEFAULT_DEBUG_LABEL(color) : undefined
  };
}

function ensureCanvas(canvas, width, height) {
  if (!canvas) {
    if (typeof document === 'undefined') return null;
    return ensureCanvas(document.createElement('canvas'), width, height);
  }
  const target = canvas;
  if (target.width !== width) target.width = width;
  if (target.height !== height) target.height = height;
  return target;
}

function copySourceToTarget(source, target) {
  const ctx = target.getContext && target.getContext('2d');
  if (!ctx) return;
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, target.width, target.height);
  ctx.drawImage(source, 0, 0);
}

export function createExecuteTint({ getDebugOptions } = {}) {
  const debugResolver = typeof getDebugOptions === 'function' ? getDebugOptions : defaultTintDebug;
  return function executeTintV2() {
    const bmp = this && this._bitmap;
    const src = bmp && (bmp.canvas || bmp._canvas || bmp.image || bmp.baseTexture || bmp);
    const width = src?.width | 0;
    const height = src?.height | 0;
    if (!src || !width || !height) return;

    const color = cloneBlendColor(this._blendColor);
    const alpha = color[3] == null ? 0 : color[3];

    this._tintCanvas = ensureCanvas(this._tintCanvas, width, height);
    const out = this._tintCanvas;
    if (!out) return;

    if (alpha <= 0) {
      copySourceToTarget(src, out);
      if (typeof this._applyTintToTarget === 'function') this._applyTintToTarget(out);
      if (typeof this._setDirty === 'function') this._setDirty();
      return;
    }

    const debug = debugResolver(this, color);
    const ok = tintSpriteToCanvas(src, out, color, debug);
    if (!ok) {
      copySourceToTarget(src, out);
    }

    if (typeof this._applyTintToTarget === 'function') {
      this._applyTintToTarget(out);
    } else if (bmp && bmp.context) {
      const ctx = bmp.context;
      ctx.clearRect(0, 0, width, height);
      ctx.drawImage(out, 0, 0);
    }
    if (typeof this._setDirty === 'function') this._setDirty();
  };
}

export function installExecuteTintPatch(SpriteClass, options) {
  const SpriteCtor = SpriteClass || (typeof window !== 'undefined' ? window.Sprite : undefined);
  if (!SpriteCtor || !SpriteCtor.prototype) return false;
  const proto = SpriteCtor.prototype;
  const executeTint = createExecuteTint(options);
  proto._executeTint = executeTint;
  proto._executeTintV2 = executeTint;
  return true;
}

if (typeof window !== 'undefined') {
  window.tintSpriteToCanvas = window.tintSpriteToCanvas || tintSpriteToCanvas;
  window.installExecuteTintPatch = window.installExecuteTintPatch || installExecuteTintPatch;
}

export const __SPRITE_TINT_INTERNALS__ = {
  rgbaToPaint,
  cloneBlendColor,
  ensureCanvas,
  copySourceToTarget,
  DEFAULT_DEBUG_LABEL
};
