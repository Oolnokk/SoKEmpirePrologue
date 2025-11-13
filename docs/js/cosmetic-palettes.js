// cosmetic-palettes.js — legacy helper retained for shade math utilities
// Palette sidecar support was removed; these helpers remain for editors that
// still need deterministic shade derivation from base colours.

const COLOR_KEYS = ['primary', 'secondary', 'tertiary'];
const SHADE_KEYS = ['primary', 'secondary', 'tertiary'];

function isSameOrigin(url){
  if (!url && url !== '') return true;
  const location = ROOT?.location;
  if (!location || !location.origin) return true;
  try {
    const parsed = new URL(url, location.href);
    if (parsed.origin === 'null') return true;
    return parsed.origin === location.origin;
  } catch (_err){
    return false;
  }
}

function clamp01(value){
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

function clone(obj){
  return obj ? JSON.parse(JSON.stringify(obj)) : obj;
}

function normalizeRow(id, rawRow = {}, baseRow = null){
  const normalized = {
    id,
    colors: baseRow ? { ...baseRow.colors } : {},
    shaded: baseRow ? { ...baseRow.shaded } : {},
    shading: baseRow ? { ...baseRow.shading } : {},
    meta: baseRow?.meta ? { ...baseRow.meta } : {}
  };
  const rawColors = rawRow.colors || rawRow.palette || {};
  for (const key of COLOR_KEYS){
    const value = rawRow[key] ?? rawColors[key];
    if (value != null){
      const hex = normalizeHex(value);
      if (hex){
        normalized.colors[key] = hex;
      }
    }
  }
  const shadedInput = rawRow.shaded || rawRow.shadedColors || {};
  for (const key of SHADE_KEYS){
    const value = rawRow[`${key}Shade`] ?? rawRow[`${key}_shade`] ?? shadedInput[key];
    if (value != null){
      const hex = normalizeHex(value);
      if (hex){
        normalized.shaded[key] = hex;
      }
    }
  }
  const shadeConfig = rawRow.shading || rawRow.shade || rawRow.darken || null;
  if (shadeConfig != null){
    const shade = normalizeShadeConfig(shadeConfig);
    normalized.shading = { ...normalized.shading, ...shade };
  }
  if (rawRow.meta && typeof rawRow.meta === 'object'){
    normalized.meta = { ...normalized.meta, ...clone(rawRow.meta) };
  }
  COLOR_KEYS.forEach((key, index)=>{
    const color = normalized.colors[key];
    if (!color) return;
    const shadeAmount = normalized.shading[key] ?? normalized.shading[`bucket${index + 1}`];
    const hasExplicitShade = (shadedInput && (shadedInput[key] != null))
      || rawRow?.[`${key}Shade`] != null
      || rawRow?.[`${key}_shade`] != null;
    if (shadeAmount != null){
      if (!hasExplicitShade || !normalized.shaded[key]){
        normalized.shaded[key] = applyShade(color, shadeAmount);
      }
      return;
    }
    if (!normalized.shaded[key] && baseRow?.shading?.[key] != null){
      normalized.shaded[key] = applyShade(color, baseRow.shading[key]);
    }
  });
  return normalized;
}

function collectRows(rawRows){
  if (!rawRows) return {};
  if (Array.isArray(rawRows)){
    const out = {};
    for (const entry of rawRows){
      if (!entry) continue;
      const id = entry.id || entry.name || entry.key;
      if (!id) continue;
      out[id] = entry;
    }
    return out;
  }
  if (typeof rawRows === 'object'){
    return { ...rawRows };
  }
  return {};
}

function normalizePaletteData(raw = {}, { url } = {}){
  const rowsSource = collectRows(raw.rows || raw.palettes || raw.variants);
  const resolved = {};
  const stack = new Set();

  function resolveRow(id){
    if (!id || resolved[id]) return resolved[id] || null;
    if (stack.has(id)) return resolved[id] || null;
    const rawRow = rowsSource[id] || {};
    stack.add(id);
    const inheritId = rawRow.extends || rawRow.inherit || rawRow.base || rawRow.parent || null;
    const baseRow = inheritId ? resolveRow(inheritId) : null;
    const row = normalizeRow(id, rawRow, baseRow);
    resolved[id] = row;
    stack.delete(id);
    return row;
  }

  for (const id of Object.keys(rowsSource)){
    resolveRow(id);
  }

  const defaultCandidate = raw.defaultRow || raw.default || raw.primary || null;
  const rowsKeys = Object.keys(resolved);
  const defaultRow = (defaultCandidate && resolved[defaultCandidate])
    ? defaultCandidate
    : (rowsSource.default ? 'default' : (rowsKeys[0] || null));

  const fighterRows = { ...(raw.fighters || raw.perFighter || {}) };
  const variantRows = { ...(raw.variantsMap || raw.variantRows || {}) };
  if (raw.variants && typeof raw.variants === 'object' && !Array.isArray(raw.variants)){
    for (const [key, value] of Object.entries(raw.variants)){
      if (typeof value === 'string'){ variantRows[key] = value; }
    }
  }

  return {
    url: url || null,
    rows: resolved,
    defaultRow,
    fighterRows,
    variantRows,
    meta: raw.meta ? clone(raw.meta) : {}
  };
}

function derivePaletteUrl(imageUrl){
  if (!imageUrl) return null;
  const str = String(imageUrl);
  const hashIndex = str.indexOf('#');
  const queryIndex = str.indexOf('?');
  const endIndex = (queryIndex >= 0 && hashIndex >= 0)
    ? Math.min(queryIndex, hashIndex)
    : (queryIndex >= 0 ? queryIndex : (hashIndex >= 0 ? hashIndex : str.length));
  const base = str.slice(0, endIndex);
  const suffix = str.slice(endIndex);
  const dot = base.lastIndexOf('.');
  const paletteBase = dot >= 0 ? base.slice(0, dot) : base;
  return `${paletteBase}.palette.json${suffix}`;
}

function registerPaletteSidecar(sidecarUrl, rawData){
  if (!sidecarUrl) return null;
  const normalized = normalizePaletteData(rawData || {}, { url: sidecarUrl });
  STATE.cache.set(sidecarUrl, normalized);
  return normalized;
}

function registerPaletteForImage(imageUrl, rawData){
  if (!imageUrl) return null;
  const paletteUrl = derivePaletteUrl(imageUrl);
  const normalized = registerPaletteSidecar(paletteUrl, rawData);
  STATE.imageToPalette.set(imageUrl, paletteUrl);
  return normalized;
}

function getPaletteForImage(imageUrl){
  if (!imageUrl) return null;
  const paletteUrl = STATE.imageToPalette.get(imageUrl) || derivePaletteUrl(imageUrl);
  if (!paletteUrl) return null;
  if (STATE.cache.has(paletteUrl)){
    return STATE.cache.get(paletteUrl);
  }
  const preloaded = STATE.preloaded.get(paletteUrl);
  if (preloaded){
    STATE.preloaded.delete(paletteUrl);
    const normalized = normalizePaletteData(preloaded, { url: paletteUrl });
    STATE.cache.set(paletteUrl, normalized);
    return normalized;
  }
  if (!isSameOrigin(paletteUrl)){
    STATE.cache.set(paletteUrl, null);
    return null;
  }
  if (typeof fetch === 'function'){
    try {
      fetch(paletteUrl, { credentials: 'same-origin' })
        .then((resp)=> resp.ok ? resp.json() : null)
        .then((json)=> {
          if (!json){
            STATE.cache.set(paletteUrl, null);
            return null;
          }
          const normalized = normalizePaletteData(json, { url: paletteUrl });
          STATE.cache.set(paletteUrl, normalized);
          return normalized;
        })
        .catch(()=> {
          STATE.cache.set(paletteUrl, null);
          return null;
        });
    } catch (_err){
      // ignore fetch errors in non-browser environments
    }
  }
  return null;
}

function preloadPaletteData(sidecarUrl, rawData){
  if (!sidecarUrl) return null;
  STATE.preloaded.set(sidecarUrl, rawData);
  return rawData;
}

function dedupeList(items = []){
  const out = [];
  const seen = new Set();
  for (const item of items){
    if (!item) continue;
    const key = String(item);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function mergePaletteConfigs(configs = []){
  const merged = {
    rows: []
  };
  for (const config of configs){
    if (!config && config !== 0) continue;
    if (typeof config === 'string'){
      merged.rows.push(config);
      continue;
    }
    if (Array.isArray(config)){
      merged.rows.push(...config);
      continue;
    }
    if (typeof config !== 'object') continue;
    if (typeof config.row === 'string'){
      merged.rows.push(config.row);
    }
    if (Array.isArray(config.rows)){
      merged.rows.push(...config.rows);
    }
    if (config.variant){
      merged.variant = config.variant;
    }
    if (config.inline){
      merged.inline = true;
    }
    if (config.useBodyColors != null){
      merged.useBodyColors = !!config.useBodyColors;
    }
    if (config.bodyOrder){
      merged.bodyOrder = Array.isArray(config.bodyOrder)
        ? config.bodyOrder.slice()
        : [config.bodyOrder];
    }
    if (config.colors){
      merged.colors = { ...(merged.colors || {}), ...config.colors };
    }
    if (config.shaded){
      merged.shaded = { ...(merged.shaded || {}), ...config.shaded };
    }
    const shadeCfg = config.shading ?? config.shade ?? config.darken;
    if (shadeCfg != null){
      const shade = normalizeShadeConfig(shadeCfg);
      merged.shading = { ...(merged.shading || {}), ...shade };
    }
    if (config.bucketMap || config.buckets){
      merged.bucketMap = {
        ...(merged.bucketMap || {}),
        ...(config.bucketMap || {}),
        ...(config.buckets || {})
      };
    }
    if (config.perFighter || config.fighters){
      merged.perFighter = {
        ...(merged.perFighter || {}),
        ...(config.perFighter || {}),
        ...(config.fighters || {})
      };
    }
    if (config.variantRowMap){
      merged.variantRowMap = {
        ...(merged.variantRowMap || {}),
        ...config.variantRowMap
      };
    }
    if (config.defaultRow && !merged.defaultRow){
      merged.defaultRow = config.defaultRow;
    }
    if (config.fallbackRow){
      merged.fallbackRow = config.fallbackRow;
    }
    if (config.inlineId && !merged.inlineId){
      merged.inlineId = config.inlineId;
    }
    if (config.meta){
      merged.meta = { ...(merged.meta || {}), ...clone(config.meta) };
    }
  }
  merged.rows = dedupeList(merged.rows);
  return merged;
}

function createInlinePaletteData(config = {}){
  const rowId = config.inlineId || config.row || config.id || 'inline';
  const rowDef = {
    id: rowId,
    colors: config.colors || {},
    shaded: config.shaded || {},
    shading: config.shading || config.shade || null,
    meta: config.meta || {}
  };
  return normalizePaletteData({
    rows: { [rowId]: rowDef },
    defaultRow: rowId
  }, { url: null });
}

function paletteFromBodyColors(bodyColors = {}, { letters, shading, rowId = 'body', meta } = {}){
  const chosen = Array.isArray(letters) && letters.length
    ? letters
    : ['A', 'B', 'C'];
  const colors = {};
  chosen.forEach((letter, index)=>{
    const key = COLOR_KEYS[index];
    const hsv = bodyColors[String(letter).toUpperCase()];
    if (!hsv) return;
    const hex = hsvToHex(hsv);
    if (hex){
      colors[key] = hex;
    }
  });
  if (!Object.keys(colors).length) return null;
  const rowDef = {
    id: rowId,
    colors,
    shading: shading || null,
    meta: meta || { source: 'bodyColors' }
  };
  return normalizePaletteData({
    rows: { [rowId]: rowDef },
    defaultRow: rowId
  }, { url: null });
}

function pickPaletteRowId(paletteData, mergedConfig, fighterName){
  if (!paletteData) return null;
  const candidates = [];
  if (fighterName && mergedConfig.perFighter?.[fighterName]){
    candidates.push(mergedConfig.perFighter[fighterName]);
  }
  if (Array.isArray(mergedConfig.rows)){
    candidates.push(...mergedConfig.rows);
  }
  if (fighterName && paletteData.fighterRows?.[fighterName]){
    candidates.push(paletteData.fighterRows[fighterName]);
  }
  if (mergedConfig.variant){
    if (mergedConfig.variantRowMap?.[mergedConfig.variant]){
      candidates.push(mergedConfig.variantRowMap[mergedConfig.variant]);
    }
    if (paletteData.variantRows?.[mergedConfig.variant]){
      candidates.push(paletteData.variantRows[mergedConfig.variant]);
    }
  }
  if (mergedConfig.defaultRow){
    candidates.push(mergedConfig.defaultRow);
  }
  if (mergedConfig.fallbackRow){
    candidates.push(mergedConfig.fallbackRow);
  }
  if (paletteData.defaultRow){
    candidates.push(paletteData.defaultRow);
  }
  const seen = new Set();
  for (const id of candidates){
    if (!id) continue;
    const key = String(id);
    if (seen.has(key)) continue;
    seen.add(key);
    if (paletteData.rows?.[key]){
      return key;
    }
  }
  const keys = Object.keys(paletteData.rows || {});
  return keys[0] || null;
}

function resolveBucketReference(reference, row, baseMap){
  if (reference == null && reference !== 0) return null;
  if (typeof reference === 'string'){
    const key = reference.replace(/[^a-z0-9]+/gi, '').toLowerCase();
    switch (key){
      case 'primary':
      case 'bucket1':
      case 'color1':
        return baseMap.primary || row.colors.primary || null;
      case 'secondary':
      case 'bucket2':
      case 'color2':
        return baseMap.secondary || row.colors.secondary || null;
      case 'tertiary':
      case 'bucket3':
      case 'color3':
        return baseMap.tertiary || row.colors.tertiary || null;
      case 'primaryshade':
      case 'shade1':
      case 'dark1':
        return baseMap.primaryShade || row.shaded.primary || null;
      case 'secondaryshade':
      case 'shade2':
      case 'dark2':
        return baseMap.secondaryShade || row.shaded.secondary || null;
      case 'tertiaryshade':
      case 'shade3':
      case 'dark3':
        return baseMap.tertiaryShade || row.shaded.tertiary || null;
      default:
        if (row.colors[key]) return row.colors[key];
        if (row.shaded[key]) return row.shaded[key];
        return null;
    }
  }
  if (typeof reference === 'number'){
    const amt = normalizeShadeAmount(reference);
    if (amt == null) return null;
    const baseColor = baseMap.primary || row.colors.primary || null;
    return baseColor ? applyShade(baseColor, amt) : null;
  }
  if (typeof reference === 'object'){
    if (reference.color != null){
      const hex = normalizeHex(reference.color);
      if (hex) return hex;
    }
    const baseRef = reference.of || reference.base || reference.from || reference.source || reference.key;
    const baseColor = baseRef ? resolveBucketReference(baseRef, row, baseMap) : (baseMap.primary || row.colors.primary || null);
    if (baseColor && reference.shade != null){
      const amt = normalizeShadeAmount(reference.shade);
      if (amt != null){
        return applyShade(baseColor, amt);
      }
    }
    if (baseColor) return baseColor;
  }
  return null;
}

function buildBucketMap(row){
  const map = {};
  if (row.colors.primary) map.primary = row.colors.primary;
  if (row.colors.secondary) map.secondary = row.colors.secondary;
  if (row.colors.tertiary) map.tertiary = row.colors.tertiary;
  if (row.shaded.primary) map.primaryShade = row.shaded.primary;
  if (row.shaded.secondary) map.secondaryShade = row.shaded.secondary;
  if (row.shaded.tertiary) map.tertiaryShade = row.shaded.tertiary;
  return map;
}

function buildBuckets(row, mergedConfig){
  const base = buildBucketMap(row);
  const custom = mergedConfig.bucketMap || {};
  for (const [bucket, ref] of Object.entries(custom)){
    const value = resolveBucketReference(ref, row, base);
    if (value){
      base[bucket] = value;
    }
  }
  return base;
}

function resolvePaletteAssignment({
  imageUrl,
  assetPalette,
  paletteConfigs = [],
  fighterName,
  isAppearance,
  bodyColors = {},
  bodyColorLetters = []
}){
  const mergedConfig = mergePaletteConfigs(paletteConfigs);
  let paletteData = assetPalette || null;
  if (!paletteData && imageUrl){
    paletteData = getPaletteForImage(imageUrl);
  }
  if (!paletteData && mergedConfig.colors){
    paletteData = createInlinePaletteData({
      inlineId: mergedConfig.inlineId || 'inline',
      colors: mergedConfig.colors,
      shaded: mergedConfig.shaded,
      shading: mergedConfig.shading,
      meta: mergedConfig.meta
    });
  }
  if (!paletteData && isAppearance && mergedConfig.useBodyColors !== false){
    const letters = bodyColorLetters.length ? bodyColorLetters : mergedConfig.bodyOrder;
    paletteData = paletteFromBodyColors(bodyColors, {
      letters,
      shading: mergedConfig.shading,
      rowId: 'body',
      meta: mergedConfig.meta
    });
  }
  if (!paletteData) return null;
  const rowId = pickPaletteRowId(paletteData, mergedConfig, fighterName);
  if (!rowId) return null;
  const row = paletteData.rows?.[rowId];
  if (!row) return null;
  const buckets = buildBuckets(row, mergedConfig);
  return {
    paletteUrl: paletteData.url,
    rowId,
    colors: { ...row.colors },
    shaded: { ...row.shaded },
    shading: { ...row.shading },
    buckets,
    meta: {
      ...(paletteData.meta || {}),
      ...(row.meta || {}),
      ...(mergedConfig.meta || {})
    }
  };
}

function clearPaletteCache(){
  // Cache removed with palette sidecar support. Retained for API stability.
}

export {
  applyShade,
  hsvToHex,
  clearPaletteCache
};
