// cosmetic-palettes.js — legacy helper retained for shade math utilities
// Palette sidecar support was removed; these helpers remain for editors that
// still need deterministic shade derivation from base colours.

function clampChannel(value){
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 255) return 255;
  return Math.round(value);
}

function parseHexColor(value){
  if (!value && value !== 0) return null;
  if (typeof value === 'number' && Number.isFinite(value)){
    const hex = value.toString(16).padStart(6, '0');
    return parseHexColor(`#${hex}`);
  }
  let str = String(value).trim();
  if (!str.length) return null;
  if (str.startsWith('#')){
    str = str.slice(1);
  }
  if (str.startsWith('0x') || str.startsWith('0X')){
    str = str.slice(2);
  }
  if (str.length === 3){
    str = str.split('').map((ch)=> ch + ch).join('');
  }
  if (str.length !== 6) return null;
  const r = Number.parseInt(str.slice(0, 2), 16);
  const g = Number.parseInt(str.slice(2, 4), 16);
  const b = Number.parseInt(str.slice(4, 6), 16);
  if ([r, g, b].some((n)=> Number.isNaN(n))) return null;
  return { r, g, b };
}

function rgbToHex(r, g, b){
  const rr = clampChannel(r).toString(16).padStart(2, '0');
  const gg = clampChannel(g).toString(16).padStart(2, '0');
  const bb = clampChannel(b).toString(16).padStart(2, '0');
  return `#${(rr + gg + bb).toUpperCase()}`;
}

function normalizeShadeAmount(amount){
  if (amount == null) return null;
  if (typeof amount === 'string' && amount.trim().length){
    const parsed = Number.parseFloat(amount.trim());
    amount = Number.isNaN(parsed) ? null : parsed;
  }
  if (!Number.isFinite(amount)) return null;
  if (Math.abs(amount) > 1){
    amount = amount / 100;
  }
  if (amount < -1) amount = -1;
  if (amount > 1) amount = 1;
  return amount;
}

function applyShade(hex, amount){
  const base = parseHexColor(hex);
  const amt = normalizeShadeAmount(amount);
  if (!base || amt == null) return hex || null;
  if (amt === 0) return rgbToHex(base.r, base.g, base.b);
  if (amt < 0){
    const factor = 1 + amt;
    return rgbToHex(base.r * factor, base.g * factor, base.b * factor);
  }
  const factor = amt;
  const r = base.r + (255 - base.r) * factor;
  const g = base.g + (255 - base.g) * factor;
  const b = base.b + (255 - base.b) * factor;
  return rgbToHex(r, g, b);
}

function clamp01(value){
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

function hsvToRgb(h, s, v){
  const hue = (((h % 360) + 360) % 360) / 60;
  const i = Math.floor(hue);
  const f = hue - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  const mod = i % 6;
  const lookup = [
    [v, t, p],
    [q, v, p],
    [p, v, t],
    [p, q, v],
    [t, p, v],
    [v, p, q]
  ];
  const [r, g, b] = lookup[mod];
  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

function hsvToHex(hsv){
  if (!hsv || typeof hsv !== 'object') return null;
  const hRaw = Number(hsv.h);
  const sRaw = Number(hsv.s);
  const vRaw = Number(hsv.v);
  const h = Number.isFinite(hRaw) ? hRaw : 0;
  const s = clamp01(Number.isFinite(sRaw) ? sRaw : 0);
  const v = clamp01(Number.isFinite(vRaw) ? vRaw : 0);
  const { r, g, b } = hsvToRgb(h, s, v);
  return rgbToHex(r, g, b);
}

function clearPaletteCache(){
  // Cache removed with palette sidecar support. Retained for API stability.
}

export {
  applyShade,
  hsvToHex,
  clearPaletteCache
};
