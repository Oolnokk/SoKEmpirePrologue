// cosmetics.js — Cosmetic overlay system for fighters
// Provides slot definitions, library registration, equipment helpers, and per-fighter layer resolution

import { degToRad } from './math-utils.js?v=1';

const ROOT = (typeof window !== 'undefined' ? window : globalThis);
const STATE = (ROOT.COSMETIC_SYSTEM ||= {
  library: {},
  assetCache: new Map()
});

export const COSMETIC_SLOTS = [
  'hat',
  'hood',
  'overwear',
  'torso',
  'legs',
  'arms',
  'upper-face',
  'lower-face',
  'hands',
  'feet',
  'shoulders',
  'beard',
  'hair'
];

function ensureArray(val){
  if (!val) return [];
  return Array.isArray(val) ? val : [val];
}

function deepMerge(base = {}, extra = {}){
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [key, value] of Object.entries(extra || {})){
    if (value && typeof value === 'object' && !Array.isArray(value)){
      out[key] = deepMerge(base?.[key] || {}, value);
    } else if (Array.isArray(value)){
      out[key] = value.slice();
    } else {
      out[key] = value;
    }
  }
  return out;
}

function pickPerFighter(def, fighterName){
  if (def == null) return null;
  if (typeof def === 'function'){
    return def(fighterName);
  }
  if (typeof def === 'string'){
    return { url: def };
  }
  const base = (def.base ?? def.default ?? (def.url || def.xform || def.widthFactor ? def : {}));
  const overrides = def.fighters || def.perFighter || {};
  const fighterOverride = fighterName && overrides[fighterName];
  if (!fighterOverride){
    if (base && typeof base === 'object' && !Array.isArray(base)){
      return deepMerge({}, base);
    }
    return base;
  }
  return deepMerge(base || {}, fighterOverride);
}

function loadImage(url){
  if (!url) return null;
  const cache = STATE.assetCache;
  if (cache.has(url)){
    return cache.get(url);
  }
  if (typeof Image === 'undefined'){
    return null;
  }
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', ()=>{ img.__broken = true; });
  img.src = url;
  cache.set(url, img);
  return img;
}

function normalizeCosmetic(id, raw = {}){
  const slots = ensureArray(raw.slot || raw.slots);
  const norm = {
    id,
    slots: slots.length ? slots : COSMETIC_SLOTS,
    parts: raw.parts || {},
    hsv: {
      defaults: { h:0, s:0, v:0, ...(raw.hsv?.defaults || {}) },
      limits: {
        h: raw.hsv?.limits?.h ?? [-180, 180],
        s: raw.hsv?.limits?.s ?? [-1, 1],
        v: raw.hsv?.limits?.v ?? [-1, 1]
      }
    }
  };
  if (raw.meta) norm.meta = { ...raw.meta };
  return norm;
}

export function registerCosmeticLibrary(library = {}){
  for (const [id, cosmetic] of Object.entries(library || {})){
    STATE.library[id] = normalizeCosmetic(id, cosmetic);
  }
  return STATE.library;
}

function clamp(value, min, max){
  if (!Number.isFinite(value)) return min;
  return Math.min(Math.max(value, min), max);
}

function clampHSV(input = {}, cosmetic){
  const defaults = cosmetic?.hsv?.defaults || { h:0, s:0, v:0 };
  const limits = cosmetic?.hsv?.limits || {};
  return {
    h: clamp(input.h ?? defaults.h ?? 0, limits.h?.[0] ?? -180, limits.h?.[1] ?? 180),
    s: clamp(input.s ?? defaults.s ?? 0, limits.s?.[0] ?? -1, limits.s?.[1] ?? 1),
    v: clamp(input.v ?? defaults.v ?? 0, limits.v?.[0] ?? -1, limits.v?.[1] ?? 1)
  };
}

function resolvePartConfig(partConfig = {}, fighterName){
  const imageCfg = pickPerFighter(partConfig.image || partConfig.images, fighterName);
  const styleCfg = pickPerFighter(partConfig.spriteStyle, fighterName);
  const warpCfg = pickPerFighter(partConfig.warp, fighterName);
  const anchorCfg = pickPerFighter(partConfig.anchor, fighterName);
  const alignCfg = pickPerFighter(partConfig.align, fighterName);
  const extra = partConfig.extra || {};
  const styleKey = partConfig.styleKey || partConfig.style || partConfig.styleName;
  return {
    image: imageCfg,
    spriteStyle: styleCfg,
    warp: warpCfg,
    anchor: anchorCfg,
    align: alignCfg,
    styleKey,
    extra: extra
  };
}

function ensureAsset(cosmeticId, partKey, imageCfg){
  if (!imageCfg || !imageCfg.url) return null;
  const key = `${cosmeticId}::${partKey}::${imageCfg.url}`;
  let asset = STATE.assets?.get(key);
  if (!STATE.assets){
    STATE.assets = new Map();
  }
  if (!asset){
    const img = loadImage(imageCfg.url);
    asset = { url: imageCfg.url, img, alignRad: imageCfg.alignRad ?? 0 };
    STATE.assets.set(key, asset);
  }
  if (imageCfg.alignRad != null){
    asset.alignRad = imageCfg.alignRad;
  }
  return asset;
}

export function cosmeticTagFor(baseTag, slot){
  return `${String(baseTag || '').toUpperCase()}__COS__${String(slot || '').toUpperCase()}`;
}

function normalizeEquipment(slotEntry){
  if (!slotEntry) return null;
  if (typeof slotEntry === 'string'){
    return { id: slotEntry };
  }
  const id = slotEntry.id || slotEntry.cosmeticId || slotEntry.item || slotEntry.name;
  if (!id) return null;
  const hsv = slotEntry.hsv || slotEntry.tone || {};
  const fighterOverrides = slotEntry.fighterOverrides || {};
  return { id, hsv, fighterOverrides };
}

export function ensureCosmeticLayers(config = {}, fighterName, baseStyle = {}){
  const layers = [];
  const library = registerCosmeticLibrary(config.cosmeticLibrary || config.cosmetics?.library || {});
  const fighter = config.fighters?.[fighterName] || {};
  const slotConfig = fighter.cosmetics?.slots || fighter.cosmetics || {};
  for (const slot of COSMETIC_SLOTS){
    const equipped = normalizeEquipment(slotConfig[slot]);
    if (!equipped) continue;
    const cosmetic = library[equipped.id];
    if (!cosmetic) continue;
    const hsv = clampHSV(equipped.hsv, cosmetic);
    for (const [partKey, partConfig] of Object.entries(cosmetic.parts || {})){
      const resolved = resolvePartConfig(partConfig, fighterName);
      if (!resolved?.image?.url) continue;
      const asset = ensureAsset(cosmetic.id, partKey, resolved.image);
      if (!asset) continue;
      let styleOverride = resolved.spriteStyle;
      if (typeof resolved.anchor === 'string'){
        styleOverride = {
          ...(styleOverride || {}),
          anchor: { ...(styleOverride?.anchor || {}), [partKey]: resolved.anchor }
        };
      } else if (resolved.anchor && typeof resolved.anchor === 'object' && !Array.isArray(resolved.anchor)){
        styleOverride = {
          ...(styleOverride || {}),
          anchor: { ...(styleOverride?.anchor || {}), ...resolved.anchor }
        };
      }
      const alignDeg = resolved.align?.deg;
      const alignRad = resolved.align?.rad ?? (Number.isFinite(alignDeg) ? degToRad(alignDeg) : undefined);
      layers.push({
        slot,
        partKey,
        cosmeticId: cosmetic.id,
        asset,
        hsv,
        styleOverride,
        warp: resolved.warp,
        anchorOverride: resolved.anchor,
        alignDeg,
        alignRad,
        styleKey: resolved.styleKey,
        extra: resolved.extra || {}
      });
    }
  }
  return layers;
}

export function clearCosmeticCache(){
  if (STATE.assets){
    STATE.assets.clear();
  }
  if (STATE.assetCache){
    STATE.assetCache.clear();
  }
}
