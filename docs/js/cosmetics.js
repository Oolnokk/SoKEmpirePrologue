// cosmetics.js — Cosmetic overlay system for fighters
// Provides slot definitions, library registration, equipment helpers, and per-fighter layer resolution

import { degToRad } from './math-utils.js?v=1';

const ROOT = (typeof window !== 'undefined' ? window : globalThis);
const STATE = (ROOT.COSMETIC_SYSTEM ||= {
  library: {},
  assetCache: new Map(),
  profiles: new Map()
});

export function getRegisteredCosmeticLibrary(){
  const entries = Object.entries(STATE.library || {});
  const out = {};
  for (const [id, cosmetic] of entries){
    out[id] = cosmetic ? deepMerge({}, cosmetic) : cosmetic;
  }
  return out;
}

function normalizeProfile(rawProfile = {}){
  const cosmetics = {};
  for (const [cosmeticId, cosmeticData] of Object.entries(rawProfile.cosmetics || {})){
    const norm = { ...cosmeticData, parts: {} };
    for (const [partKey, partData] of Object.entries(cosmeticData.parts || {})){
      if (partData && typeof partData === 'object'){
        norm.parts[partKey] = deepMerge({}, partData);
      }
    }
    cosmetics[cosmeticId] = norm;
  }
  return { cosmetics };
}

function getProfilePartOverrides(fighterName, cosmeticId, partKey){
  if (!fighterName || !cosmeticId || !partKey) return null;
  const profile = STATE.profiles?.get(fighterName);
  if (!profile) return null;
  return profile.cosmetics?.[cosmeticId]?.parts?.[partKey] || null;
}

function mergeConfig(baseValue, override){
  if (override == null) return baseValue;
  if (baseValue == null){
    if (override && typeof override === 'object' && !Array.isArray(override)){
      return deepMerge({}, override);
    }
    return override;
  }
  if (override && typeof override === 'object' && !Array.isArray(override) && typeof baseValue === 'object' && !Array.isArray(baseValue)){
    return deepMerge(baseValue, override);
  }
  return override;
}

export function registerFighterCosmeticProfile(fighterName, profile = {}){
  if (!fighterName) return null;
  const normalized = normalizeProfile(profile);
  const current = STATE.profiles.get(fighterName) || { cosmetics: {} };
  const merged = {
    cosmetics: deepMerge(current.cosmetics || {}, normalized.cosmetics || {})
  };
  STATE.profiles.set(fighterName, merged);
  return merged;
}

export function getFighterCosmeticProfile(fighterName){
  return fighterName ? STATE.profiles.get(fighterName) || null : null;
}

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

function coerceNumber(value){
  if (Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim().length){
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

function clamp(value, min, max){
  const num = coerceNumber(value);
  const lo = Number.isFinite(min) ? min : Number.NEGATIVE_INFINITY;
  const hi = Number.isFinite(max) ? max : Number.POSITIVE_INFINITY;
  if (!Number.isFinite(num)){
    if (Number.isFinite(min)) return min;
    if (Number.isFinite(max)) return max;
    return 0;
  }
  return Math.min(Math.max(num, lo), hi);
}

function clampHSV(input = {}, cosmetic){
  const defaults = cosmetic?.hsv?.defaults || { h:0, s:0, v:0 };
  const limits = cosmetic?.hsv?.limits || {};
  const source = Array.isArray(input)
    ? { h: input[0], s: input[1], v: input[2] }
    : (input && typeof input === 'object' ? input : {});

  function resolveLimitPair(limitPair, fallbackMin, fallbackMax){
    const min = Number.isFinite(limitPair?.[0]) ? limitPair[0] : fallbackMin;
    const max = Number.isFinite(limitPair?.[1]) ? limitPair[1] : fallbackMax;
    return [min, max];
  }

  function clampWithPercentSupport(value, defaultValue, min, max, { allowPercent = false } = {}){
    const fallback = Number.isFinite(defaultValue)
      ? defaultValue
      : (Number.isFinite(coerceNumber(defaultValue)) ? coerceNumber(defaultValue) : 0);
    const raw = value ?? fallback;
    let num = coerceNumber(raw);
    if (!Number.isFinite(num)) {
      num = fallback;
    }
    if (allowPercent){
      const limitMagnitude = Math.max(Math.abs(min ?? 0), Math.abs(max ?? 0));
      if (limitMagnitude <= 1 && Math.abs(num) > 2){
        num = num / 100;
      }
    }
    return clamp(num, min, max);
  }

  const [hMin, hMax] = resolveLimitPair(limits.h, -180, 180);
  const [sMin, sMax] = resolveLimitPair(limits.s, -1, 1);
  const [vMin, vMax] = resolveLimitPair(limits.v, -1, 1);

  return {
    h: clampWithPercentSupport(source.h, defaults.h ?? 0, hMin, hMax),
    s: clampWithPercentSupport(source.s, defaults.s ?? 0, sMin, sMax, { allowPercent: true }),
    v: clampWithPercentSupport(source.v, defaults.v ?? 0, vMin, vMax, { allowPercent: true })
  };
}

function resolvePartConfig(partConfig = {}, fighterName, cosmeticId, partKey){
  let imageCfg = pickPerFighter(partConfig.image || partConfig.images, fighterName);
  let styleCfg = pickPerFighter(partConfig.spriteStyle, fighterName);
  let warpCfg = pickPerFighter(partConfig.warp, fighterName);
  let anchorCfg = pickPerFighter(partConfig.anchor, fighterName);
  let alignCfg = pickPerFighter(partConfig.align, fighterName);
  let extra = (partConfig.extra && typeof partConfig.extra === 'object') ? deepMerge({}, partConfig.extra) : (partConfig.extra || {});
  let styleKey = partConfig.styleKey || partConfig.style || partConfig.styleName;

  const profileOverrides = getProfilePartOverrides(fighterName, cosmeticId, partKey);
  if (profileOverrides){
    imageCfg = mergeConfig(imageCfg, profileOverrides.image);
    styleCfg = mergeConfig(styleCfg, profileOverrides.spriteStyle);
    warpCfg = mergeConfig(warpCfg, profileOverrides.warp);
    anchorCfg = mergeConfig(anchorCfg, profileOverrides.anchor);
    alignCfg = mergeConfig(alignCfg, profileOverrides.align);
    extra = mergeConfig(extra, profileOverrides.extra);
    if (profileOverrides.styleKey != null){
      styleKey = profileOverrides.styleKey;
    }
  }

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

function mergeSlotConfigs(baseSlots = {}, overrideDef = {}){
  const overrides = overrideDef?.slots || overrideDef;
  const merged = { ...baseSlots };
  if (!overrides || typeof overrides !== 'object'){
    return merged;
  }
  for (const [slot, value] of Object.entries(overrides)){
    if (value == null){
      delete merged[slot];
      continue;
    }
    merged[slot] = (value && typeof value === 'object' && !Array.isArray(value))
      ? deepMerge({}, value)
      : value;
  }
  return merged;
}

export function ensureCosmeticLayers(config = {}, fighterName, baseStyle = {}){
  const layers = [];
  const library = registerCosmeticLibrary(config.cosmeticLibrary || config.cosmetics?.library || {});
  const fighter = config.fighters?.[fighterName] || {};
  let slotConfig = deepMerge({}, fighter.cosmetics?.slots || fighter.cosmetics || {});
  if (typeof window !== 'undefined'){
    const G = window.GAME || {};
    if (G.selectedFighter === fighterName && G.selectedCosmetics){
      slotConfig = mergeSlotConfigs(slotConfig, G.selectedCosmetics);
    }
  }
  const editorState = (typeof window !== 'undefined')
    ? (window.GAME?.editorState || null)
    : null;
  for (const slot of COSMETIC_SLOTS){
    const equipped = normalizeEquipment(slotConfig[slot]);
    if (!equipped) continue;
    const cosmetic = library[equipped.id];
    if (!cosmetic) continue;
    const slotOverride = editorState?.slotOverrides?.[slot];
    let hsv = clampHSV(equipped.hsv, cosmetic);
    if (slotOverride?.hsv){
      hsv = clampHSV({ ...hsv, ...slotOverride.hsv }, cosmetic);
    }
    for (const [partKey, partConfig] of Object.entries(cosmetic.parts || {})){
      const resolved = resolvePartConfig(partConfig, fighterName, cosmetic.id, partKey);
      const partOverride = slotOverride?.parts?.[partKey];
      if (slotOverride?.image){
        resolved.image = mergeConfig(resolved.image, slotOverride.image);
      }
      if (partOverride?.image){
        resolved.image = mergeConfig(resolved.image, partOverride.image);
      }
      if (!resolved?.image?.url) continue;
      const asset = ensureAsset(cosmetic.id, partKey, resolved.image);
      if (!asset) continue;
      let styleOverride = resolved.spriteStyle;
      let warpOverride = resolved.warp;
      let anchorOverride = resolved.anchor;
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
      if (slotOverride?.spriteStyle){
        styleOverride = mergeConfig(styleOverride, slotOverride.spriteStyle);
      }
      const partOverride = slotOverride?.parts?.[partKey];
      if (partOverride?.hsv){
        hsv = clampHSV({ ...hsv, ...partOverride.hsv }, cosmetic);
      }
      if (partOverride?.spriteStyle){
        styleOverride = mergeConfig(styleOverride, partOverride.spriteStyle);
      }
      if (slotOverride?.warp){
        warpOverride = mergeConfig(warpOverride, slotOverride.warp);
      }
      if (partOverride?.warp){
        warpOverride = mergeConfig(warpOverride, partOverride.warp);
      }
      if (slotOverride?.anchor){
        anchorOverride = mergeConfig(anchorOverride, slotOverride.anchor);
      }
      if (partOverride?.anchor){
        anchorOverride = mergeConfig(anchorOverride, { [partKey]: partOverride.anchor });
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
        warp: warpOverride,
        anchorOverride,
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
  if (STATE.profiles instanceof Map){
    STATE.profiles.clear();
  }
}
