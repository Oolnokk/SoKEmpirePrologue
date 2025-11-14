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

const APPEARANCE_SLOT_PREFIX = 'appearance:';
const APPEARANCE_ID_PREFIX = 'appearance::';

function appearanceSlotKey(slotName){
  if (!slotName) return `${APPEARANCE_SLOT_PREFIX}default`;
  const trimmed = String(slotName).trim();
  return trimmed.startsWith(APPEARANCE_SLOT_PREFIX)
    ? trimmed
    : `${APPEARANCE_SLOT_PREFIX}${trimmed}`;
}

function normalizeAppearanceId(fighterName, rawId){
  if (!rawId) return null;
  const id = String(rawId).trim();
  if (!id.length) return null;
  if (id.startsWith(APPEARANCE_ID_PREFIX)){
    return id;
  }
  return `${APPEARANCE_ID_PREFIX}${fighterName}::${id}`;
}

function normalizeAppearanceSlotEntry(entry){
  if (!entry) return null;
  if (typeof entry === 'string'){
    return { id: entry };
  }
  if (entry && typeof entry === 'object'){
    const normalized = deepMerge({}, entry);
    normalized.id = normalized.id
      || normalized.cosmeticId
      || normalized.item
      || normalized.name;
    if (!normalized.id) return null;
    const colors = ensureArray(normalized.colors || normalized.bodyColors || normalized.appearanceColors);
    if (colors.length){
      normalized.colors = colors;
    } else {
      delete normalized.colors;
    }
    return normalized;
  }
  return null;
}

function buildBodyColorMap(source = {}){
  const map = {};
  for (const [key, value] of Object.entries(source || {})){
    const letter = String(key || '').trim().toUpperCase();
    if (!letter) continue;
    map[letter] = clampHSL(value, null);
  }
  return map;
}

function resolveBodyColorSource(config = {}, fighterName){
  if (!fighterName) return { colors: {}, characterKey: null };
  const G = (typeof window !== 'undefined') ? (window.GAME || {}) : {};
  const characters = config.characters || {};

  const bodyColorFighter = G.selectedBodyColorsFighter;
  if (
    G.selectedFighter === fighterName
    && G.selectedBodyColors
    && (bodyColorFighter == null || bodyColorFighter === fighterName)
  ){
    return { colors: buildBodyColorMap(G.selectedBodyColors), characterKey: G.selectedCharacter || null };
  }

  if (G.selectedCharacter){
    const selected = characters[G.selectedCharacter];
    if (selected?.fighter === fighterName){
      return { colors: buildBodyColorMap(selected.bodyColors), characterKey: G.selectedCharacter };
    }
  }

  for (const [key, data] of Object.entries(characters)){
    if (data?.fighter === fighterName){
      return { colors: buildBodyColorMap(data.bodyColors), characterKey: key };
    }
  }

  const fighterColors = config.fighters?.[fighterName]?.bodyColors;
  if (fighterColors){
    return { colors: buildBodyColorMap(fighterColors), characterKey: null };
  }

  return { colors: {}, characterKey: null };
}

export function resolveCharacterAppearance(config = {}, fighterName){
  if (!fighterName) return { appearance: null, characterKey: null };
  const { characterKey } = resolveBodyColorSource(config, fighterName);
  const characters = config.characters || {};

  if (characterKey && characters[characterKey]?.appearance){
    return { appearance: characters[characterKey].appearance, characterKey };
  }

  for (const [key, data] of Object.entries(characters)){
    if (data?.fighter === fighterName && data?.appearance){
      return { appearance: data.appearance, characterKey: key };
    }
  }

  return { appearance: null, characterKey: null };
}

function mergeAppearanceSources(sources = []){
  const queue = [];
  for (const source of sources){
    if (!source) continue;
    if (Array.isArray(source)){
      queue.push(...source);
    } else {
      queue.push(source);
    }
  }

  const mergedSlots = {};
  const mergedLibrary = {};
  let hasSlots = false;
  let hasLibrary = false;

  for (const entry of queue){
    if (!entry || typeof entry !== 'object') continue;
    if (entry.slots && typeof entry.slots === 'object'){
      for (const [slotName, slotEntry] of Object.entries(entry.slots)){
        if (slotEntry == null){
          delete mergedSlots[slotName];
          continue;
        }
        mergedSlots[slotName] = deepMerge({}, slotEntry);
        hasSlots = true;
      }
    }
    if (entry.library && typeof entry.library === 'object'){
      for (const [libId, libEntry] of Object.entries(entry.library)){
        if (libEntry == null){
          delete mergedLibrary[libId];
          continue;
        }
        mergedLibrary[libId] = deepMerge({}, libEntry);
        hasLibrary = true;
      }
    }
  }

  const result = {};
  if (hasSlots && Object.keys(mergedSlots).length){
    result.slots = mergedSlots;
  }
  if (hasLibrary && Object.keys(mergedLibrary).length){
    result.library = mergedLibrary;
  }
  return result;
}

function prepareAppearanceForFighter(fighterName, appearance = {}){
  if (!fighterName || !appearance) return { library: {}, slots: {} };
  const preparedSlots = {};
  const preparedLibrary = {};

  for (const [slotName, slotEntry] of Object.entries(appearance.slots || {})){
    const normalizedEntry = normalizeAppearanceSlotEntry(slotEntry);
    if (!normalizedEntry?.id) continue;
    const slotKey = appearanceSlotKey(slotName);
    const normalizedId = normalizeAppearanceId(fighterName, normalizedEntry.id);
    const colors = ensureArray(normalizedEntry.colors);
    preparedSlots[slotKey] = {
      ...normalizedEntry,
      id: normalizedId,
      colors: colors.length ? colors : undefined
    };
  }

  const baseSlots = Object.keys(preparedSlots);

  for (const [rawId, def] of Object.entries(appearance.library || {})){
    const normalizedId = normalizeAppearanceId(fighterName, rawId);
    if (!normalizedId) continue;
    const raw = deepMerge({}, def || {});
    const appearanceMeta = raw.appearance || {};
    const explicitSlot = appearanceMeta.slot
      || appearanceMeta.slotName
      || raw.slot
      || (Array.isArray(raw.slots) && raw.slots.find((slot)=> String(slot).startsWith(APPEARANCE_SLOT_PREFIX)))
      || (baseSlots.length ? baseSlots[0] : appearanceSlotKey('body'));
    const slotKey = appearanceSlotKey(explicitSlot.replace(APPEARANCE_SLOT_PREFIX, ''));
    const defaultColors = ensureArray(appearanceMeta.bodyColors || raw.bodyColors || raw.colors);
    raw.type = raw.type || 'appearance';
    raw.appearance = {
      ...appearanceMeta,
      fighter: fighterName,
      slot: slotKey.replace(APPEARANCE_SLOT_PREFIX, ''),
      bodyColors: ensureArray(appearanceMeta.bodyColors || raw.bodyColors || raw.colors),
      inheritSprite: appearanceMeta.inheritSprite || raw.inheritSprite || null,
      originalId: appearanceMeta.originalId || rawId
    };
    delete raw.bodyColors;
    delete raw.colors;
    if (raw.slot) delete raw.slot;
    raw.slots = ensureArray(raw.slots || []);
    if (!raw.slots.includes(slotKey)){
      raw.slots.push(slotKey);
    }
    preparedLibrary[normalizedId] = raw;
    if (!preparedSlots[slotKey]){
      preparedSlots[slotKey] = {
        id: normalizedId,
        colors: defaultColors.length ? defaultColors : undefined
      };
    }
  }

  return { library: preparedLibrary, slots: preparedSlots };
}

export function registerFighterAppearance(fighterName, ...sources){
  const merged = mergeAppearanceSources(sources);
  const prepared = prepareAppearanceForFighter(fighterName, merged);
  if (prepared && prepared.library && Object.keys(prepared.library).length){
    registerCosmeticLibrary(prepared.library);
  }
  return prepared;
}

export function resolveFighterBodyColors(config = {}, fighterName){
  return resolveBodyColorSource(config, fighterName).colors;
}

function resolveAppearanceBaseHSL(equipped = {}, cosmetic = {}, bodyColors = {}){
  const letters = ensureArray(equipped.colors || cosmetic.appearance?.bodyColors || cosmetic.bodyColors || cosmetic.colors);
  for (const letter of letters){
    const key = String(letter || '').trim().toUpperCase();
    if (!key) continue;
    const value = bodyColors[key];
    if (value){
      return deepMerge({}, value);
    }
  }
  const fallback = bodyColors.A || bodyColors.B || bodyColors.C;
  return fallback ? deepMerge({}, fallback) : { h: 0, s: 0, l: 0 };
}

function addHSL(base = {}, adjustment = {}){
  return {
    h: (Number(base.h) || 0) + (Number(adjustment.h) || 0),
    s: (Number(base.s) || 0) + (Number(adjustment.s) || 0),
    l: (Number(base.l ?? base.v) || 0) + (Number(adjustment.l ?? adjustment.v) || 0)
  };
}

function clampBodyHSL(hsl = {}){
  return {
    h: clamp(hsl.h, -180, 180),
    s: clamp(hsl.s, -1, 1),
    l: clamp(hsl.l ?? hsl.v, -1, 1)
  };
}

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
  const tintConfig = raw.hsl || raw.hsv || {};
  const tintDefaults = tintConfig.defaults || {};
  const tintLimits = tintConfig.limits || {};
  const norm = {
    id,
    slots: slots.length ? slots : COSMETIC_SLOTS,
    parts: raw.parts || {},
    hsl: {
      defaults: {
        h: tintDefaults.h ?? 0,
        s: tintDefaults.s ?? 0,
        l: (tintDefaults.l ?? tintDefaults.v ?? 0)
      },
      limits: {
        h: tintLimits.h ?? [-180, 180],
        s: tintLimits.s ?? [-1, 1],
        l: tintLimits.l ?? tintLimits.v ?? [-1, 1]
      }
    }
  };
  if (raw.meta) norm.meta = { ...raw.meta };
  if (raw.type) norm.type = raw.type;
  if (raw.appearance){
    norm.appearance = deepMerge({}, raw.appearance);
    if (raw.bodyColors || raw.colors){
      norm.appearance.bodyColors = ensureArray(norm.appearance.bodyColors || raw.bodyColors || raw.colors);
    }
  } else if (raw.bodyColors || raw.colors){
    norm.appearance = { bodyColors: ensureArray(raw.bodyColors || raw.colors) };
  }
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

function clampHSL(input = {}, cosmetic){
  const defaults = cosmetic?.hsl?.defaults || { h:0, s:0, l:0 };
  const limits = cosmetic?.hsl?.limits || {};
  const source = Array.isArray(input)
    ? { h: input[0], s: input[1], l: input[2] }
    : (input && typeof input === 'object' ? input : {});

  if (source && source.l == null && source.v != null){
    source.l = source.v;
  }

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
  const [lMin, lMax] = resolveLimitPair(limits.l ?? limits.v, -1, 1);

  return {
    h: clampWithPercentSupport(source.h, defaults.h ?? 0, hMin, hMax),
    s: clampWithPercentSupport(source.s, defaults.s ?? 0, sMin, sMax, { allowPercent: true }),
    l: clampWithPercentSupport(source.l, defaults.l ?? defaults.v ?? 0, lMin, lMax, { allowPercent: true })
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
    asset = { url: imageCfg.url, img };
    STATE.assets.set(key, asset);
  }

  if (imageCfg.alignDeg != null && Number.isFinite(imageCfg.alignDeg)){
    asset.alignRad = degToRad(imageCfg.alignDeg);
  } else if (imageCfg.alignRad != null && Number.isFinite(imageCfg.alignRad)){
    asset.alignRad = imageCfg.alignRad;
  } else if (imageCfg.alignRad == null && imageCfg.alignDeg == null){
    delete asset.alignRad;
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
  const hsl = slotEntry.hsl || slotEntry.hsv || slotEntry.tone || {};
  const fighterOverrides = slotEntry.fighterOverrides || {};
  const colors = ensureArray(slotEntry.colors || slotEntry.bodyColors || slotEntry.appearanceColors);
  return {
    id,
    hsl,
    fighterOverrides,
    colors: colors.length ? colors : undefined
  };
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
  const { appearance: characterAppearance } = resolveCharacterAppearance(config, fighterName);
  const appearanceData = registerFighterAppearance(
    fighterName,
    fighter.appearance || {},
    characterAppearance
  );
  if (appearanceData?.slots && Object.keys(appearanceData.slots).length){
    slotConfig = mergeSlotConfigs(slotConfig, appearanceData.slots);
  }
  if (typeof window !== 'undefined'){
    const G = window.GAME || {};
    if (G.selectedFighter === fighterName && G.selectedCosmetics){
      slotConfig = mergeSlotConfigs(slotConfig, G.selectedCosmetics);
    }
  }
  const editorState = (typeof window !== 'undefined')
    ? (window.GAME?.editorState || null)
    : null;
  const bodyColors = resolveFighterBodyColors(config, fighterName);
  const slotKeys = new Set(COSMETIC_SLOTS);
  const orderedSlots = [...COSMETIC_SLOTS];
  for (const key of Object.keys(slotConfig || {})){
    if (!slotKeys.has(key)){
      slotKeys.add(key);
      orderedSlots.push(key);
    }
  }
  for (const slot of orderedSlots){
    const equipped = normalizeEquipment(slotConfig[slot]);
    if (!equipped) continue;
    const cosmetic = library[equipped.id];
    if (!cosmetic) continue;
    const slotOverride = editorState?.slotOverrides?.[slot];
    const isAppearance = slot.startsWith(APPEARANCE_SLOT_PREFIX) || cosmetic?.type === 'appearance' || !!cosmetic?.appearance;
    const equippedTint = equipped.hsl ?? equipped.hsv;
    let slotHSL = isAppearance
      ? resolveAppearanceBaseHSL(equipped, cosmetic, bodyColors)
      : clampHSL(equippedTint, cosmetic);
    if (isAppearance){
      if (equippedTint){
        slotHSL = addHSL(slotHSL, clampHSL(equippedTint, cosmetic));
      }
      if (slotOverride?.hsl){
        slotHSL = addHSL(slotHSL, clampHSL(slotOverride.hsl, cosmetic));
      }
    } else if (slotOverride?.hsl){
      slotHSL = clampHSL({ ...slotHSL, ...slotOverride.hsl }, cosmetic);
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
      let hsl = isAppearance ? { ...slotHSL } : { ...slotHSL };
      if (partOverride?.hsl){
        if (isAppearance){
          hsl = addHSL(hsl, clampHSL(partOverride.hsl, cosmetic));
        } else {
          hsl = clampHSL({ ...hsl, ...partOverride.hsl }, cosmetic);
        }
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
      if (isAppearance && !resolved.styleKey && cosmetic.appearance?.inheritSprite){
        resolved.styleKey = cosmetic.appearance.inheritSprite;
      }
      const alignDeg = resolved.align?.deg;
      const alignRad = resolved.align?.rad ?? (Number.isFinite(alignDeg) ? degToRad(alignDeg) : undefined);
      if (isAppearance){
        hsl = clampBodyHSL(hsl);
      }
      const layerExtra = resolved.extra ? deepMerge({}, resolved.extra) : {};
      if (isAppearance){
        layerExtra.appearance = {
          slot: slot.replace(APPEARANCE_SLOT_PREFIX, ''),
          fighter: cosmetic.appearance?.fighter || fighterName,
          originalId: cosmetic.appearance?.originalId || cosmetic.id,
          bodyColors: ensureArray(equipped.colors || cosmetic.appearance?.bodyColors)
        };
      }
      layers.push({
        slot,
        partKey,
        cosmeticId: cosmetic.id,
        asset,
        hsl,
        styleOverride,
        warp: warpOverride,
        anchorOverride,
        alignDeg,
        alignRad,
        styleKey: resolved.styleKey,
        extra: layerExtra
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
