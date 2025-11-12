/**
 * sprite_tint_v2.js
 *
 * Fill + destination-in masking tint helper for reliably recoloring fully white or
 * greyscale sprites on HTML5 canvas while preserving alpha-based outlines.
 */

const clampByte = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (value <= 0) return 0;
  if (value >= 255) return 255;
  return Math.round(value);
};

const rgbaToPaint = (rgba) => {
  const [r = 255, g = 255, b = 255, a = 255] = Array.isArray(rgba) ? rgba : [];
  const alpha = Math.max(0, Math.min(255, Number(a))) / 255;
  return { css: `rgb(${clampByte(r)},${clampByte(g)},${clampByte(b)})`, alpha };
};

export function tintSpriteToCanvas(source, dest, blendColor, opts = {}) {
  if (!source || !dest) return false;

  const width = (source.width || source.naturalWidth || dest.width || 0) | 0;
  const height = (source.height || source.naturalHeight || dest.height || 0) | 0;
  if (!(width > 0 && height > 0)) return false;

  if (dest.width !== width) dest.width = width;
  if (dest.height !== height) dest.height = height;

  const ctx = dest.getContext('2d', { willReadFrequently: false });
  if (!ctx) return false;

  const { css, alpha } = rgbaToPaint(blendColor);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  ctx.clearRect(0, 0, width, height);

  ctx.globalAlpha = alpha || 0;
  if (alpha > 0) {
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, width, height);
  }

  ctx.globalCompositeOperation = 'destination-in';
  ctx.globalAlpha = 1;
  ctx.drawImage(source, 0, 0, width, height);

  if (opts.debug) {
    try {
      const sw = Math.max(8, Math.round(width * 0.06));
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
    } catch (_) {
      // ignore debug drawing failures (e.g., missing fonts)
    }
  }

  return true;
}

if (typeof window !== 'undefined') {
  window.tintSpriteToCanvas = tintSpriteToCanvas;
}
