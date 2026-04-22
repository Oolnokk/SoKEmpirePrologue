// ============================================================
// PORTRAIT UTILS
// Shared portrait generation and rendering logic.
// Used by: character-tools.html, ScratchbonesBluffGame.html
//
// Setup (call before rendering):
//   setPortraitAssetBase('./assets/');          // character-tools (default)
//   setPortraitAssetBase('./docs/assets/');     // ScratchbonesBluffGame
// ============================================================

// ── Constants / Config ─────────────────────────────────────

const _PORTRAIT_DEFAULTS = {
  canvas: { width: 200, height: 200, layerSize: 80 },
  headXform: { ax: 0, ay: -0.1, sx: 0.95, sy: 1.14 },
  fighters: [
    {
      id:      'M',
      label:   'Mao-ao (M)',
      headUrl: 'fightersprites/mao-ao-m/head_mint.png',
      bodyLayers: [
        { id: 'armL', url: 'portraitsprites/arm-L_mao-ao_m.png', tintSlot: 'A', pos: 'back' },
        { id: 'torso', url: 'portraitsprites/torso_mao-ao_m.png', tintSlot: 'A', pos: 'back' },
        { id: 'armR', url: 'portraitsprites/arm-R_mao-ao_m.png', tintSlot: 'A', pos: 'back' },
      ],
      urLayers: [
        { url: 'fightersprites/mao-ao-m/untinted_regions/ur-head.png' },
      ],
    },
    {
      id:      'F',
      label:   'Mao-ao (F)',
      headUrl: 'fightersprites/mao-ao-f/head.png',
      bodyLayers: [
        { id: 'armL', url: 'portraitsprites/arm-L_mao-ao_f.png', tintSlot: 'A', pos: 'back' },
        { id: 'torso', url: 'portraitsprites/torso_mao-ao_f.png', tintSlot: 'A', pos: 'back' },
        { id: 'armR', url: 'portraitsprites/arm-R_mao-ao_f.png', tintSlot: 'A', pos: 'back' },
      ],
      urLayers: [
        { url: 'fightersprites/mao-ao-f/untinted_regions/ur-head.png' },
      ],
    },
  ],
  bodyColorLimits: {
    A: { hMin: -100, hMax:  -30, sMin: 0.05, sMax: 0.75, vMin: -0.50, vMax: 0.20 },
    B: { hMin: -100, hMax:  -30, sMin: -0.20, sMax: 0.90, vMin: -0.85, vMax: 0.10 },
    C: { hMin: -100, hMax:  -30, sMin: -0.65, sMax: 0.65, vMin: -0.25, vMax: 0.55 },
  }
};

let _portraitConfig = {
  ..._PORTRAIT_DEFAULTS,
  ...(window.PORTRAIT_CONFIG || {})
};

function normalizePortraitLayerXform(layer) {
  if (!layer || typeof layer !== 'object') return layer;
  const next = { ...layer };
  const xf = (layer.xform && typeof layer.xform === 'object') ? layer.xform : null;
  if (next.ax == null) next.ax = xf?.ax ?? 0;
  if (next.ay == null) next.ay = xf?.ay ?? 0;
  if (next.sx == null) next.sx = xf?.sx ?? xf?.scaleX ?? xf?.scaleMulX ?? 1;
  if (next.sy == null) next.sy = xf?.sy ?? xf?.scaleY ?? xf?.scaleMulY ?? 1;
  return next;
}

function normalizePortraitMaskLayer(maskLayer) {
  if (!maskLayer || typeof maskLayer !== 'object') return null;
  return normalizePortraitLayerXform(maskLayer);
}

function normalizedFighterPortrait(fighter) {
  if (!fighter || typeof fighter !== 'object') return fighter;
  return {
    ...fighter,
    bodyLayers: Array.isArray(fighter.bodyLayers)
      ? fighter.bodyLayers.map(normalizePortraitLayerXform)
      : fighter.bodyLayers,
    opacityMaskLayer: normalizePortraitMaskLayer(fighter.opacityMaskLayer),
  };
}

function setPortraitConfig(overrides) {
  _portraitConfig = {
    ..._PORTRAIT_DEFAULTS,
    ..._portraitConfig,
    ...(overrides || {})
  };
  PORTRAIT_CW = _portraitConfig.canvas?.width ?? 200;
  PORTRAIT_CH = _portraitConfig.canvas?.height ?? 200;
  PORTRAIT_L = _portraitConfig.canvas?.layerSize ?? 80;
  HEAD_XFORM = _portraitConfig.headXform || _PORTRAIT_DEFAULTS.headXform;
  FIGHTERS = (_portraitConfig.fighters || _PORTRAIT_DEFAULTS.fighters).map(normalizedFighterPortrait);
  BODYCOLOR_LIMITS = _portraitConfig.bodyColorLimits || _PORTRAIT_DEFAULTS.bodyColorLimits;
}

let PORTRAIT_CW = _portraitConfig.canvas?.width ?? 200;
let PORTRAIT_CH = _portraitConfig.canvas?.height ?? 200;
let PORTRAIT_L  = _portraitConfig.canvas?.layerSize ?? 80;
let HEAD_XFORM = _portraitConfig.headXform || _PORTRAIT_DEFAULTS.headXform;
let FIGHTERS = (_portraitConfig.fighters || _PORTRAIT_DEFAULTS.fighters).map(normalizedFighterPortrait);
let BODYCOLOR_LIMITS = _portraitConfig.bodyColorLimits || _PORTRAIT_DEFAULTS.bodyColorLimits;
let LAST_RANDOMIZATION_RULES_BY_FIGHTER = {};

// ── Image loading ──────────────────────────────────────────

let _puAssetBase = './assets/';
const IMG_CACHE  = new Map();

/** Set the asset base URL used by loadImg(). Call before rendering. */
function setPortraitAssetBase(base) {
  _puAssetBase = base;
  IMG_CACHE.clear();
}

function loadImg(relPath) {
  if (IMG_CACHE.has(relPath)) return IMG_CACHE.get(relPath);

  const ensureTrailingSlash = (base) => String(base || './assets/').replace(/\/?$/, '/');
  const localBase = ensureTrailingSlash(_puAssetBase);
  const fallbackBase = localBase.includes('/docs/assets/')
    ? localBase.replace('/docs/assets/', '/assets/')
    : localBase.replace('/assets/', '/docs/assets/');

  const candidateUrls = [
    localBase + relPath,
    fallbackBase + relPath,
    'https://raw.githubusercontent.com/Oolnokk/SoKEmpirePrologue/main/docs/assets/' + relPath,
  ];

  const seen = new Set();
  const uniqueCandidates = candidateUrls.filter((url) => {
    if (!url || seen.has(url)) return false;
    seen.add(url);
    return true;
  });

  const tryLoadUrl = (url) => new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(url);
    img.src = url;
  });

  const promise = (async () => {
    const attemptedUrls = [];
    for (const url of uniqueCandidates) {
      attemptedUrls.push(url);
      try {
        return await tryLoadUrl(url);
      } catch (_) {
        // Try next candidate URL.
      }
    }
    const error = new Error(`Failed to load portrait asset "${relPath}"`);
    error.name = 'PortraitImageLoadError';
    error.relPath = relPath;
    error.attemptedUrls = attemptedUrls;
    throw error;
  })();

  IMG_CACHE.set(relPath, promise);
  return promise;
}

// ── CSS filter helpers ─────────────────────────────────────

function buildCSSFilter(h, s, v) {
  const sat = Math.max(0, 1 + (Number(s) || 0));
  const bri = Math.max(0, 1 + (Number(v) || 0));
  if ((Number(h) || 0) === 0 && sat === 1 && bri === 1) return 'none';
  return `hue-rotate(${(Number(h) || 0).toFixed(1)}deg) saturate(${sat.toFixed(3)}) brightness(${bri.toFixed(3)})`;
}

function makeCSSFilter(color) {
  if (!color) return 'none';
  return buildCSSFilter(color.h, color.s, color.v ?? color.l);
}

// ── Canvas helpers ─────────────────────────────────────────

function composeXform(base, child) {
  return {
    ax: (base.ax ?? 0) + (child.ax ?? 0),
    ay: (base.ay ?? 0) + (child.ay ?? 0),
    sx: (base.sx ?? 1) * (child.sx ?? 1),
    sy: (base.sy ?? 1) * (child.sy ?? 1),
  };
}

function drawPortraitLayer(ctx, img, xform, cssFilter) {
  const { ax, ay, sx, sy } = xform;
  const h  = PORTRAIT_L * sy;
  const w  = (img.naturalWidth / img.naturalHeight) * PORTRAIT_L * sx;
  const cx = PORTRAIT_CW / 2 + ay * PORTRAIT_L;
  const cy = PORTRAIT_CH / 2 - ax * PORTRAIT_L;
  ctx.save();
  ctx.filter = cssFilter || 'none';
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function applyPortraitOpacityMask(ctx, img, xform) {
  const { ax, ay, sx, sy } = xform;
  const h  = PORTRAIT_L * sy;
  const w  = (img.naturalWidth / img.naturalHeight) * PORTRAIT_L * sx;
  const cx = PORTRAIT_CW / 2 + ay * PORTRAIT_L;
  const cy = PORTRAIT_CH / 2 - ax * PORTRAIT_L;
  ctx.save();
  ctx.globalCompositeOperation = 'destination-out';
  ctx.drawImage(img, cx - w / 2, cy - h / 2, w, h);
  ctx.restore();
}

function getProfileSpriteXforms(profile) {
  if (!profile) return [];
  const { fighter, hair, hairFront, hairBack, hairSide, eyes, facialHair, hat, torsoCosmetic, armCosmetic } = profile;
  const resolvedFighter = resolvePortraitFighter(fighter) || fighter;
  const headXform = resolvedFighter?.headXform || fighter?.headXform || HEAD_XFORM;
  const opacityMaskLayer = resolvedFighter?.opacityMaskLayer || fighter?.opacityMaskLayer || null;
  const headUrl = resolvedFighter?.headUrl || fighter?.headUrl;
  const bodyLayerSource = resolvedFighter?.bodyLayers || fighter?.bodyLayers || [];
  const urLayerSource = resolvedFighter?.urLayers || fighter?.urLayers || [];
  const toRecord = (part, layer, extra = {}) => ({
    part,
    url: layer?.url || null,
    xform: composeXform(headXform, layer || {}),
    ...extra,
  });
  const records = [];
  for (const layer of bodyLayerSource) records.push(toRecord('body', layer, { pos: layer.pos || 'back', id: layer.id || null }));
  for (const group of [torsoCosmetic, armCosmetic]) {
    if (!group?.layers?.length) continue;
    for (const layer of group.layers) {
      records.push(toRecord('bodyCosmetic', layer, { group: group.id || null, pos: layer.pos || 'front' }));
    }
  }
  const allCosmeticGroups = hairFront !== undefined
    ? [hairBack, hairSide, facialHair, eyes, hairFront, hat]
    : [hair, facialHair, eyes, hat];
  for (const group of allCosmeticGroups) {
    if (!group?.layers?.length) continue;
    for (const layer of group.layers) {
      records.push(toRecord('cosmetic', layer, { group: group.id || null, pos: layer.pos || 'front' }));
    }
  }
  if (headUrl) records.push({ part: 'head', url: headUrl, xform: { ...headXform } });
  for (const layer of urLayerSource) {
    records.push({ part: 'headOverlay', url: layer.url || null, renderOrder: layer.renderOrder || 'normal', xform: { ...(layer.xform || headXform) } });
  }
  if (opacityMaskLayer?.url) records.push(toRecord('opacityMask', opacityMaskLayer));
  return records;
}

// ── Rendering ──────────────────────────────────────────────

async function renderProfile(canvas, profile) {
  const { fighter, hair, hairFront, hairBack, hairSide, eyes, facialHair, hat, torsoCosmetic, armCosmetic, bodyColors } = profile;
  const resolvedFighter = resolvePortraitFighter(fighter) || fighter;
  const headXform = resolvedFighter?.headXform || fighter?.headXform || HEAD_XFORM;
  const opacityMaskLayer = resolvedFighter?.opacityMaskLayer || fighter?.opacityMaskLayer || null;
  const headUrl = resolvedFighter?.headUrl || fighter?.headUrl;
  const bodyLayerSource = resolvedFighter?.bodyLayers || fighter?.bodyLayers || [];
  const urLayerSource = resolvedFighter?.urLayers || fighter?.urLayers || [];
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, PORTRAIT_CW, PORTRAIT_CH);

  const filterFor = (slot) => slot ? makeCSSFilter(bodyColors[slot]) : 'none';
  const filterA   = makeCSSFilter(bodyColors.A);

  const bodyBackLayers = [];
  const bodyFrontLayers = [];
  for (const layer of bodyLayerSource) {
    const target = layer.pos === 'front' ? bodyFrontLayers : bodyBackLayers;
    target.push({ layer, filter: filterFor(layer.tintSlot || 'A') });
  }
  for (const group of [torsoCosmetic, armCosmetic]) {
    if (!group || !group.layers || !group.layers.length) continue;
    for (const layer of group.layers) {
      const target = layer.pos === 'back' ? bodyBackLayers : bodyFrontLayers;
      target.push({ layer, filter: filterFor(group.tintSlot || 'A') });
    }
  }

  // Support both three-slot (hairBack/hairSide/hairFront) and legacy single-slot (hair).
  const allCosmeticGroups = hairFront !== undefined
  ? [hairBack, hairSide, facialHair, eyes, hairFront, hat]
  : [hair, facialHair, eyes, hat];
  const backLayers  = [];
  const frontLayers = [];

  for (const group of allCosmeticGroups) {
    if (!group || !group.layers.length) continue;
    for (const layer of group.layers) {
      const target = layer.pos === 'back' ? backLayers : frontLayers;
      target.push({ layer, filter: filterFor(group.tintSlot) });
    }
  }

  const neededUrls = new Set([
    headUrl,
    ...urLayerSource.map(m => m.url),
    ...bodyBackLayers.map(({ layer }) => layer.url),
    ...backLayers.map(({ layer }) => layer.url),
    ...frontLayers.map(({ layer }) => layer.url),
    ...bodyFrontLayers.map(({ layer }) => layer.url),
    ...(opacityMaskLayer?.url ? [opacityMaskLayer.url] : []),
  ]);

  let imgMap;
  try {
    const entries = await Promise.all(
      [...neededUrls].map(async (url) => [url, await loadImg(url)])
    );
    imgMap = new Map(entries);
  } catch (err) {
    console.warn('[portrait] image load error', {
      message: err?.message || String(err),
      name: err?.name || 'Error',
      relPath: err?.relPath || null,
      attemptedUrls: Array.isArray(err?.attemptedUrls) ? err.attemptedUrls : [],
    });
    ctx.fillStyle = '#220000'; ctx.fillRect(0, 0, PORTRAIT_CW, PORTRAIT_CH);
    ctx.fillStyle = '#ff4444'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Load error', PORTRAIT_CW / 2, PORTRAIT_CH / 2);
    return;
  }

  for (const { layer, filter } of bodyBackLayers) {
    const img = imgMap.get(layer.url);
    if (img) drawPortraitLayer(ctx, img, composeXform(headXform, layer), filter);
  }
  for (const { layer, filter } of backLayers) {
    const img = imgMap.get(layer.url);
    if (img) drawPortraitLayer(ctx, img, composeXform(headXform, layer), filter);
  }
  { const img = imgMap.get(headUrl); if (img) drawPortraitLayer(ctx, img, headXform, filterA); }
  for (const mid of urLayerSource) {
    if (mid.renderOrder === 'topLayer') continue;
    const img = imgMap.get(mid.url);
    if (img) drawPortraitLayer(ctx, img, headXform, 'none');
  }
  for (const { layer, filter } of frontLayers) {
    const img = imgMap.get(layer.url);
    if (img) drawPortraitLayer(ctx, img, composeXform(headXform, layer), filter);
  }
  for (const mid of urLayerSource) {
    if (mid.renderOrder !== 'topLayer') continue;
    const img = imgMap.get(mid.url);
    if (img) drawPortraitLayer(ctx, img, headXform, 'none');
  }
  for (const { layer, filter } of bodyFrontLayers) {
    const img = imgMap.get(layer.url);
    if (img) drawPortraitLayer(ctx, img, composeXform(headXform, layer), filter);
  }
  if (opacityMaskLayer?.url) {
    const maskImg = imgMap.get(opacityMaskLayer.url);
    if (maskImg) applyPortraitOpacityMask(ctx, maskImg, composeXform(headXform, opacityMaskLayer));
  }
}

// ── Cosmetic config parsing ────────────────────────────────

function portraitRelPath(url) {
  if (!url) return url;
  if (url.startsWith('./assets/')) return url.slice('./assets/'.length);
  return url;
}

function portraitCategoryForEntry(entry) {
  const path = (entry.path || '').toLowerCase();
  const name = (entry.id.split('::').pop() || '').toLowerCase();
  if (path.includes('/headhair/') || path.includes('headhair/')) return 'hair';
  if (path.includes('/eyes/')     || path.includes('eyes/'))     return 'eyes';
  if (path.includes('/facialhair/') || path.includes('facialhair/')) return 'facialhair';
  if (name.includes('eye')) return 'eyes';
  if (name.includes('beard') || name.includes('stache') || name.includes('whisker') || name.includes('facial')) return 'facialhair';
  return 'hair';
}

function portraitOptionFromJson(entry, json) {
  const label    = (json.meta && json.meta.name) || entry.id.split('::').pop().replace(/^mao-ao_/i, '').replace(/_/g, ' ');
  const tintSlot = (json.appearance && json.appearance.bodyColors && json.appearance.bodyColors[0]) || null;
  const shortId  = entry.id.split('::').pop().replace(/^mao-ao_/i, '');

  const layers = [];
  const head   = json.parts && json.parts.head;

  if (head) {
    if (head.layers) {
      for (const [layerName, layer] of Object.entries(head.layers)) {
        const xf =
          (layer.spriteStyle && layer.spriteStyle.base && layer.spriteStyle.base.xform && layer.spriteStyle.base.xform.head) ||
          (layer.spriteStyle && layer.spriteStyle.xform && layer.spriteStyle.xform.head) || {};
        const imgUrl = layer.image && layer.image.url;
        if (imgUrl) {
          layers.push({
            url: portraitRelPath(imgUrl),
            ax:  xf.ax     ?? 0,
            ay:  xf.ay     ?? 0,
            sx:  xf.scaleX ?? 1,
            sy:  xf.scaleY ?? 1,
            pos: layerName === 'back' ? 'back' : 'front',
          });
        }
      }
    } else if (head.image) {
      const xf = (head.spriteStyle && head.spriteStyle.xform && head.spriteStyle.xform.head) || {};
      const imgUrl = head.image.url;
      if (imgUrl) {
        layers.push({
          url: portraitRelPath(imgUrl),
          ax:  xf.ax     ?? 0,
          ay:  xf.ay     ?? 0,
          sx:  xf.scaleX ?? 1,
          sy:  xf.scaleY ?? 1,
          pos: 'front',
        });
      }
    }
  }

  // Portrait torso/arm clothing layers come from non-appearance cosmetic files and
  // are selected by using '/portrait/' asset paths.
  if (!layers.length && json.parts && typeof json.parts === 'object') {
    for (const [partName, partDef] of Object.entries(json.parts)) {
      const partLayers = partDef && partDef.layers ? partDef.layers : null;
      if (!partLayers || typeof partLayers !== 'object') continue;
      for (const [layerName, layer] of Object.entries(partLayers)) {
        const imgUrl = layer?.image?.url;
        if (!imgUrl || !String(imgUrl).toLowerCase().includes('/portrait/')) continue;
        const xf =
          layer?.spriteStyle?.base?.xform?.[partName] ||
          layer?.spriteStyle?.base?.xform?.head ||
          layer?.spriteStyle?.xform?.[partName] ||
          layer?.spriteStyle?.xform?.head ||
          {};
        layers.push({
          url: portraitRelPath(imgUrl),
          ax:  xf.ax     ?? 0,
          ay:  xf.ay     ?? 0,
          sx:  xf.scaleX ?? xf.scaleMulX ?? 1,
          sy:  xf.scaleY ?? xf.scaleMulY ?? 1,
          pos: layerName === 'back' ? 'back' : 'front',
        });
      }
    }
  }

  const colorRange = json.colorRange || null;
  const tags = Array.isArray(json.tags) ? json.tags : [];
  const materialTag = (typeof json.material === 'string' && json.material.trim())
    ? json.material.trim().toLowerCase()
    : (tags.find(tag => typeof tag === 'string' && tag.toLowerCase().startsWith('material:')) || '')
      .split(':')[1]
      ?.trim()
      ?.toLowerCase()
      || null;
  const resolvedTintSlot = json.slot === 'hat' && colorRange ? 'HAT'
                         : !json.appearance && colorRange ? 'CLOTH'
                         : !json.appearance && json.tintSlot != null ? json.tintSlot
                         : tintSlot;
  const hairSlot = json.hairSlot || null; // 'front' | 'back' | 'side'
  return { id: shortId, label, tintSlot: resolvedTintSlot, layers, slot: json.slot || null, colorRange, hairSlot, tags, materialTag };
}

/**
 * Fetch cosmetics index and all appearance entries.
 * Returns { hairOptions, eyesOptions, facialHairOptions, indexEntries, optionCache }.
 * Throws on unrecoverable failure.
 */
async function loadPortraitCosmetics(configBase) {
  let indexBaseUrl = new URL(configBase + 'cosmetics/index.json', window.location.href).toString();
  let data;
  try {
    const resp = await fetch(indexBaseUrl);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    data = await resp.json();
  } catch (e) {
    console.warn('[portrait] Primary index fetch failed, falling back to raw GitHub URL', e);
    const rawUrl = 'https://raw.githubusercontent.com/Oolnokk/SoKEmpirePrologue/main/docs/config/cosmetics/index.json';
    const resp2 = await fetch(rawUrl);
    if (!resp2.ok) throw new Error('HTTP ' + resp2.status);
    data = await resp2.json();
    indexBaseUrl = rawUrl;
  }

  const allEntries = (data.entries || []).filter(e => e.id && (e.id.startsWith('appearance::') || !e.id.includes('::')));
  const pathToEntries = new Map();
  for (const entry of allEntries) {
    if (!pathToEntries.has(entry.path)) pathToEntries.set(entry.path, []);
    pathToEntries.get(entry.path).push(entry);
  }

  const optionCache  = new Map();
  const indexEntries = [];

  await Promise.all([...pathToEntries.entries()].map(async ([path, entries]) => {
    const jsonUrl = new URL(path, indexBaseUrl).toString();
    let json;
    try {
      const resp = await fetch(jsonUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + path);
      json = await resp.json();
    } catch (e) {
      console.warn('[portrait] Could not load cosmetic JSON:', path, e);
      return;
    }
    for (const entry of entries) {
      const opt = portraitOptionFromJson(entry, json);
      if (opt.layers.length) {
        optionCache.set(entry.id, opt);
        indexEntries.push(entry);
      }
    }
  }));

  // Build categorised option arrays (unfiltered — callers may apply species filtering)
  const hairFrontOptions  = [{ id: 'none', label: 'No Front Hair',  tintSlot: null, layers: [] }];
  const hairBackOptions   = [{ id: 'none', label: 'No Back Hair',   tintSlot: null, layers: [] }];
  const hairSideOptions   = [{ id: 'none', label: 'No Side Hair',   tintSlot: null, layers: [] }];
  const eyesOptions       = [{ id: 'none', label: 'No Eye Mark',    tintSlot: null, layers: [] }];
  const facialHairOptions = [{ id: 'none', label: 'No Facial Hair', tintSlot: null, layers: [] }];
  const hatOptions        = [{ id: 'none', label: 'No Hat',         tintSlot: null, layers: [] }];
  const torsoPortraitOptions = [{ id: 'none', label: 'No Torso Clothing', tintSlot: null, layers: [] }];
  const armPortraitOptions = [{ id: 'none', label: 'No Arm Clothing', tintSlot: null, layers: [] }];
  const seenIds = new Set();

  for (const entry of indexEntries) {
    const opt = optionCache.get(entry.id);
    if (!opt || !opt.layers.length) continue;
    if (seenIds.has(opt.id)) continue;
    seenIds.add(opt.id);
    const cat = opt.slot === 'hat'       ? 'hat'
              : opt.hairSlot === 'front' ? 'hairFront'
              : opt.hairSlot === 'back'  ? 'hairBack'
              : opt.hairSlot === 'side'  ? 'hairSide'
              : portraitCategoryForEntry(entry);
    if      (cat === 'hat')        hatOptions.push(opt);
    else if (cat === 'hairFront')  hairFrontOptions.push(opt);
    else if (cat === 'hairBack')   hairBackOptions.push(opt);
    else if (cat === 'hairSide')   hairSideOptions.push(opt);
    else if (cat === 'eyes')       eyesOptions.push(opt);
    else if (cat === 'facialhair') facialHairOptions.push(opt);

    if (!entry.id.startsWith('appearance::')) {
      const lowerLayers = opt.layers.map(l => (l.url || '').toLowerCase());
      if (lowerLayers.some(u => u.includes('/torso/portrait/') || u.includes('/overwear/portrait/'))) torsoPortraitOptions.push(opt);
      if (lowerLayers.some(u => u.includes('/arms/portrait/'))) armPortraitOptions.push(opt);
    }
  }

  // Load species body color ranges, allowed cosmetics, and cosmetic weights, keyed by fighter ID
  const bodyColorRangesByGender = {};
  const allowedCosmeticsByFighter = {};
  const cosmeticWeightsByFighter = {};
  const fighterPortraitOverrides = {};
  const forcedCosmeticsByFighter = {};
  const conditionalCosmeticsByFighter = {};
  const randomizationRulesByFighter = {};
  try {
    const speciesIdxUrl = new URL(configBase + 'species/index.json', window.location.href).toString();
    const speciesIdxResp = await fetch(speciesIdxUrl);
    if (speciesIdxResp.ok) {
      const speciesIdx = await speciesIdxResp.json();
      await Promise.all((speciesIdx.entries || []).map(async entry => {
        const sUrl = new URL(entry.path, speciesIdxUrl).toString();
        const sResp = await fetch(sUrl);
        if (!sResp.ok) return;
        const sData = await sResp.json();
        for (const [genderKey, genderData] of Object.entries(sData)) {
          if (!genderData || typeof genderData !== 'object' || !genderData.bodyColorRanges) continue;
          let fighter = FIGHTERS.find(f => genderData.headSprite && f.headUrl === genderData.headSprite);
          if (!fighter && genderData.headSprite && Array.isArray(genderData.portraitBodyLayers)) {
            fighter = normalizedFighterPortrait({
              id: `${sData.speciesId}_${genderKey}`,
              gender: genderKey,
              label: `${sData.label || entry.label} (${genderKey === 'male' ? 'M' : 'F'})`,
              headUrl: genderData.headSprite,
              bodyLayers: genderData.portraitBodyLayers.map(normalizePortraitLayerXform),
              urLayers: (genderData.headUrLayers || []).map(l => ({ url: l.url, renderOrder: l.renderOrder })),
              headXform: genderData.headXform ? normalizePortraitLayerXform(genderData.headXform) : null,
              opacityMaskLayer: genderData.portraitOpacityMaskLayer ? normalizePortraitMaskLayer(genderData.portraitOpacityMaskLayer) : null,
            });
            FIGHTERS.push(fighter);
          }
          if (fighter) {
            bodyColorRangesByGender[fighter.id] = genderData.bodyColorRanges;
            fighterPortraitOverrides[fighter.id] = {
              ...(fighterPortraitOverrides[fighter.id] || {}),
              ...(genderData.headXform ? { headXform: genderData.headXform } : {}),
              ...(Array.isArray(genderData.portraitBodyLayers) ? {
                bodyLayers: genderData.portraitBodyLayers.map(normalizePortraitLayerXform)
              } : {}),
              ...(genderData.portraitOpacityMaskLayer ? {
                opacityMaskLayer: normalizePortraitMaskLayer(genderData.portraitOpacityMaskLayer)
              } : {})
            };
            if (genderData.allowedCosmetics) {
              allowedCosmeticsByFighter[fighter.id] = {
                set: new Set(
                  genderData.allowedCosmetics.map(id => id.split('::').pop().replace(/^mao-ao_/i, ''))
                ),
                disallowedCombos: (genderData.disallowedCosmeticCombos || []).map(rule => ({
                  conditions: rule.conditions || {},
                  repairSlots: rule.repairSlots || []
                }))
              };
            }
            if (genderData.cosmeticWeights) {
              cosmeticWeightsByFighter[fighter.id] = genderData.cosmeticWeights;
            }
            if (genderData.forcedCosmetics && typeof genderData.forcedCosmetics === 'object') {
              forcedCosmeticsByFighter[fighter.id] = genderData.forcedCosmetics;
            }
            if (Array.isArray(genderData.conditionalCosmetics)) {
              conditionalCosmeticsByFighter[fighter.id] = genderData.conditionalCosmetics;
            }
            if (genderData.randomizationRules && typeof genderData.randomizationRules === 'object') {
              randomizationRulesByFighter[fighter.id] = genderData.randomizationRules;
            }
          }
        }
      }));
    }
  } catch (e) {
    console.warn('[portrait] Could not load species data', e);
  }

  if (Object.keys(fighterPortraitOverrides).length) {
    FIGHTERS = FIGHTERS.map(fighter => {
      const override = fighterPortraitOverrides[fighter.id];
      if (!override) return fighter;
      return normalizedFighterPortrait({
        ...fighter,
        ...(override.headXform ? { headXform: override.headXform } : {}),
        ...(override.bodyLayers ? { bodyLayers: override.bodyLayers } : {}),
        ...(override.opacityMaskLayer ? { opacityMaskLayer: override.opacityMaskLayer } : {})
      });
    });
  }

  LAST_RANDOMIZATION_RULES_BY_FIGHTER = randomizationRulesByFighter;

  return { hairFrontOptions, hairBackOptions, hairSideOptions, eyesOptions, facialHairOptions, hatOptions, torsoPortraitOptions, armPortraitOptions, indexEntries, optionCache, bodyColorRangesByGender, allowedCosmeticsByFighter, cosmeticWeightsByFighter, forcedCosmeticsByFighter, conditionalCosmeticsByFighter, randomizationRulesByFighter };
}

// ── Seeded randomisation ───────────────────────────────────

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

/**
 * Random color from a bodyColorRange stop table, driven by a provided rng().
 */
function randomColorFromRangeSeeded(range, rng) {
  if (!range || !range.stops || range.stops.length < 2) return { h: 0, s: 0, v: 0 };
  const h = range.minH + rng() * (range.maxH - range.minH);
  const stops = range.stops;
  let i = 0;
  while (i < stops.length - 2 && stops[i + 1].h <= h) i++;
  const s0 = stops[i], s1 = stops[i + 1];
  const t = s1.h === s0.h ? 0 : clamp((h - s0.h) / (s1.h - s0.h), 0, 1);
  const sMin = s0.sMin + t * (s1.sMin - s0.sMin);
  const sMax = s0.sMax + t * (s1.sMax - s0.sMax);
  const vMin = s0.vMin + t * (s1.vMin - s0.vMin);
  const vMax = s0.vMax + t * (s1.vMax - s0.vMax);
  return { h, s: sMin + rng() * (sMax - sMin), v: vMin + rng() * (vMax - vMin) };
}

/**
 * Generate random body colors driven by a provided rng().
 * bodyColorRanges is optional (from species data); falls back to BODYCOLOR_LIMITS.
 */
function randomBodyColorsSeeded(rng, bodyColorRanges) {
  const rh = (lo, hi) => lo + rng() * (hi - lo);
  function fallback(slot) {
    const lim = BODYCOLOR_LIMITS[slot];
    return { h: rh(lim.hMin, lim.hMax), s: rh(lim.sMin, lim.sMax), v: rh(lim.vMin, lim.vMax) };
  }
  return {
    A: bodyColorRanges && bodyColorRanges.A ? randomColorFromRangeSeeded(bodyColorRanges.A, rng) : fallback('A'),
    B: bodyColorRanges && bodyColorRanges.B ? randomColorFromRangeSeeded(bodyColorRanges.B, rng) : fallback('B'),
    C: bodyColorRanges && bodyColorRanges.C ? randomColorFromRangeSeeded(bodyColorRanges.C, rng) : fallback('C'),
  };
}

function randomInRange(rng, lo, hi) {
  return lo + rng() * (hi - lo);
}

function materialColorRangeFor(option) {
  const materialTag = option?.materialTag;
  if (!materialTag) return null;
  const materialPalettes = window.CONFIG?.cosmeticMaterialPalettes;
  if (!materialPalettes || typeof materialPalettes !== 'object') return null;
  return materialPalettes[materialTag] || null;
}

function applyBodyColorRulesSeeded(bodyColors, rules, rng) {
  if (!bodyColors || !rules || typeof rules !== 'object') return bodyColors;
  const result = {
    ...bodyColors,
    A: bodyColors.A ? { ...bodyColors.A } : bodyColors.A,
    B: bodyColors.B ? { ...bodyColors.B } : bodyColors.B,
    C: bodyColors.C ? { ...bodyColors.C } : bodyColors.C
  };
  const brightnessRule = rules.brightnessContrastAB;
  if (!brightnessRule || !result.A || !result.B) return result;
  const medium = brightnessRule.medium;
  const bright = brightnessRule.bright;
  if (!medium || !bright) return result;
  const flip = rng() < 0.5;
  const slotA = flip ? 'A' : 'B';
  const slotB = flip ? 'B' : 'A';
  result[slotA].v = randomInRange(rng, medium.min, medium.max);
  result[slotB].v = randomInRange(rng, bright.min, bright.max);
  return result;
}

/**
 * Weighted random pick from an array, driven by rng().
 * weights: object mapping item.id to a numeric weight (items absent from the map default to 1).
 * Falls back to uniform pick when weights is null/undefined.
 *
 * To tune cosmetic odds, add a "cosmeticWeights" block to the species JSON (e.g. mao-ao.json)
 * under the gender section:
 *   "cosmeticWeights": {
 *     "hat":       { "none": 65, "basic_headband": 28, "riverlandskasa_low": 3.5, ... },
 *     "hairFront": { "none": 5, "smooth_striped": 5, "tuft": 30, ... },
 *     "hairBack":  { "none": 50, "long_ponytail": 25, "splayedknot_medium": 25 },
 *     "hairSide":  { "none": 90, "shoulder_length_drape": 10 }
 *   }
 * Optional per-hat occlusion can be configured under "randomizationRules.hatHideRules":
 *   "hatHideRules": {
 *     "riverlandskasa_low": { "hideSlots": ["hairFront", "hairBack"] },
 *     "basic_headband": { "hideSlots": [] }
 *   }
 * Unspecified categories use uniform random. Cosmetics missing from a weight map default to weight 1.
 * Weight 0 excludes an item from selection entirely.
 */
function weightedPickRng(arr, weights, rng) {
  if (!arr || arr.length === 0) return undefined;
  if (!weights) return arr[Math.floor(rng() * arr.length)];
  const hasWeightKey = (key) => Object.prototype.hasOwnProperty.call(weights, key);
  const resolveWeight = (optionId) => {
    if (hasWeightKey(optionId)) return weights[optionId];
    const underscoreIndex = typeof optionId === 'string' ? optionId.indexOf('_') : -1;
    if (underscoreIndex > 0) {
      const suffixId = optionId.slice(underscoreIndex + 1);
      if (hasWeightKey(suffixId)) return weights[suffixId];
    }
    return 1;
  };
  const w = arr.map(o => resolveWeight(o.id));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return arr[Math.floor(rng() * arr.length)];
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= w[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

function resolvePortraitFighter(fighter) {
  if (!fighter) return fighter;
  const byId = FIGHTERS.find((candidate) => candidate?.id === fighter.id);
  if (byId) return byId;
  const byHead = fighter.headUrl
    ? FIGHTERS.find((candidate) => candidate?.headUrl === fighter.headUrl)
    : null;
  return byHead || fighter;
}

function noneOptionForSlot(options, fallbackLabel) {
  return options.find((option) => option?.id === 'none')
    ?? options[0]
    ?? { id: 'none', label: fallbackLabel, tintSlot: null, layers: [] };
}

function toHiddenSlotSet(rule) {
  if (!rule) return null;
  if (Array.isArray(rule.hideSlots)) {
    return new Set(rule.hideSlots.filter((slot) => typeof slot === 'string'));
  }
  if (Array.isArray(rule)) {
    return new Set(rule.filter((slot) => typeof slot === 'string'));
  }
  return null;
}

function hatHideRuleFor(hatId, randomizationRules) {
  if (!hatId || hatId === 'none') return null;
  const map = randomizationRules?.hatHideRules;
  if (!map || typeof map !== 'object') return null;
  return map[hatId] || null;
}

/**
 * Generate a fully deterministic random profile using a provided rng() function.
 * All option arrays must be supplied by the caller.
 * cosmeticWeightsByFighter (optional): object keyed by fighter.id, each value being a
 *   per-category weights map (see weightedPickRng docs above). When omitted the selection
 *   falls back to the original uniform-random behaviour.
 */
function randomProfileSeeded(rng, fighters, hairFrontOptions, hairBackOptions, hairSideOptions, eyesOptions, facialHairOptions, bodyColorRangesByGender, allowedCosmeticsByFighter, hatOptions, cosmeticWeightsByFighter, torsoPortraitOptions, armPortraitOptions, forcedCosmeticsByFighter, conditionalCosmeticsByFighter, randomizationRulesByFighter) {
  const pickRng   = (arr) => arr[Math.floor(rng() * arr.length)];
  const fighterInput = pickRng(fighters);
  const fighter = resolvePortraitFighter(fighterInput);
  const fighterEntry = allowedCosmeticsByFighter?.[fighter.id] ?? allowedCosmeticsByFighter?.[fighterInput?.id];
  const allowed   = fighterEntry instanceof Set ? fighterEntry : (fighterEntry?.set ?? null);
  const disallowedCombos = (fighterEntry instanceof Set ? [] : (fighterEntry?.disallowedCombos ?? []));
  const allowedPrefixes = allowed
    ? new Set(
      Array.from(allowed)
        .filter(id => typeof id === 'string' && id.includes('_'))
        .map(id => id.slice(0, id.indexOf('_')))
    )
    : null;
  const isAllowedId = (optionId) => {
    if (!allowed) return true;
    if (allowed.has(optionId)) return true;
    const underscoreIndex = typeof optionId === 'string' ? optionId.indexOf('_') : -1;
    if (underscoreIndex > 0) {
      const prefixId = optionId.slice(0, underscoreIndex);
      if (!allowedPrefixes?.has(prefixId)) return false;
      const suffixId = optionId.slice(underscoreIndex + 1);
      if (allowed.has(suffixId)) return true;
    }
    return false;
  };
  const filterArr = (arr) => arr && allowed ? arr.filter(o => o.id === 'none' || isAllowedId(o.id)) : arr;
  const weights   = cosmeticWeightsByFighter?.[fighter.id] ?? cosmeticWeightsByFighter?.[fighterInput?.id] ?? null;

  const filteredHairFront  = filterArr(hairFrontOptions)  ?? [];
  const filteredHairBack   = filterArr(hairBackOptions)   ?? [];
  const filteredHairSide   = filterArr(hairSideOptions)   ?? [];
  const filteredEyes       = filterArr(eyesOptions)       ?? [];
  const filteredFacialHair = filterArr(facialHairOptions) ?? [];
  const filteredHat        = filterArr(hatOptions) ?? [{ id: 'none', label: 'No Hat', tintSlot: null, layers: [] }];

  let hairFront  = weightedPickRng(filteredHairFront.length  ? filteredHairFront  : [{ id: 'none', label: 'No Front Hair', tintSlot: null, layers: [] }], weights?.hairFront,  rng);
  let hairBack   = weightedPickRng(filteredHairBack.length   ? filteredHairBack   : [{ id: 'none', label: 'No Back Hair',  tintSlot: null, layers: [] }], weights?.hairBack,   rng);
  let hairSide   = weightedPickRng(filteredHairSide.length   ? filteredHairSide   : [{ id: 'none', label: 'No Side Hair',  tintSlot: null, layers: [] }], weights?.hairSide,   rng);
  let eyes         = weightedPickRng(filteredEyes.length       ? filteredEyes       : [{ id: 'none', label: 'No Eye Mark',   tintSlot: null, layers: [] }], weights?.eyes,       rng);
  const noFacialHair = filteredFacialHair.find(o => o.id === 'none') ?? filteredFacialHair[0] ?? { id: 'none', label: 'No Facial Hair', tintSlot: null, layers: [] };
  let facialHair = weights?.facialHair
    ? weightedPickRng(filteredFacialHair.length ? filteredFacialHair : [noFacialHair], weights.facialHair, rng)
    : (rng() < 0.35 ? pickRng(filteredFacialHair.length ? filteredFacialHair : [noFacialHair]) : noFacialHair);
  const noHat      = filteredHat.find(o => o.id === 'none') ?? filteredHat[0];
  // When hat weights are configured, use a single weighted pick (weights include 'none').
  // Otherwise fall back to the original 50%-skip + uniform-pick behaviour.
  let hat = weights?.hat
    ? weightedPickRng(filteredHat.length ? filteredHat : [noHat], weights.hat, rng)
    : (rng() < 0.5 ? pickRng(filteredHat) : noHat);

  // Enforce disallowed cosmetic combination rules.
  // Each rule specifies conditions (slot-value pairs that must all match) and
  // repairSlots (slots to try forcing to a non-none option, tried in random order).
  if (disallowedCombos.length) {
    const filteredBySlot = { hairFront: filteredHairFront, hairBack: filteredHairBack, hairSide: filteredHairSide };
    let maxIter = disallowedCombos.length * 2 + 1;
    let violated = true;
    while (violated && maxIter-- > 0) {
      violated = false;
      for (const rule of disallowedCombos) {
        const cur = { hairFront, hairBack, hairSide };
        const matches = Object.entries(rule.conditions).every(([slot, val]) => cur[slot]?.id === val);
        if (!matches || !rule.repairSlots.length) continue;
        violated = true;
        const slots = rule.repairSlots.slice();
        if (slots.length >= 2 && rng() < 0.5) slots.reverse();
        for (const slot of slots) {
          const nonNone = (filteredBySlot[slot] || []).filter(o => o.id !== 'none');
          if (nonNone.length) {
            if      (slot === 'hairFront') hairFront = pickRng(nonNone);
            else if (slot === 'hairBack')  hairBack  = pickRng(nonNone);
            else if (slot === 'hairSide')  hairSide  = pickRng(nonNone);
            break;
          }
        }
        break; // restart rule checking after each repair
      }
    }
  }

  const filteredTorso = filterArr(torsoPortraitOptions) ?? [];
  const filteredArm   = filterArr(armPortraitOptions)   ?? [];
  const torsoCosmetic = weightedPickRng(filteredTorso.length ? filteredTorso : [{ id: 'none', label: 'No Torso Clothing', tintSlot: null, layers: [] }], null, rng);
  const armCosmetic   = weightedPickRng(filteredArm.length   ? filteredArm   : [{ id: 'none', label: 'No Arm Clothing',   tintSlot: null, layers: [] }], null, rng);

  // Apply forced cosmetics — species-level slots that always override random selection.
  const forced = forcedCosmeticsByFighter?.[fighter.id] ?? forcedCosmeticsByFighter?.[fighterInput?.id];
  if (forced) {
    const filteredBySlot = { eyes: filteredEyes, facialHair: filteredFacialHair, hairFront: filteredHairFront, hairBack: filteredHairBack, hairSide: filteredHairSide, hat: filteredHat };
    for (const [slot, id] of Object.entries(forced)) {
      const opt = filteredBySlot[slot]?.find(o => o.id === id);
      if (!opt) continue;
      if      (slot === 'eyes')       eyes = opt;
      else if (slot === 'facialHair') facialHair = opt;
      else if (slot === 'hairFront')  hairFront = opt;
      else if (slot === 'hairBack')   hairBack = opt;
      else if (slot === 'hairSide')   hairSide = opt;
      else if (slot === 'hat')        hat = opt;
    }
  }

  // Apply conditional cosmetics — rules that fire based on current slot state and clothing tags.
  const conditionals = conditionalCosmeticsByFighter?.[fighter.id] ?? conditionalCosmeticsByFighter?.[fighterInput?.id];
  if (conditionals) {
    const curSlots = { hairFront, hairBack, hairSide, eyes, facialHair, hat };
    const filteredBySlot = { eyes: filteredEyes, facialHair: filteredFacialHair, hairFront: filteredHairFront, hairBack: filteredHairBack, hairSide: filteredHairSide, hat: filteredHat };
    for (const rule of conditionals) {
      const met = Object.entries(rule.conditions).every(([key, val]) => {
        if (key === 'anyClothingTag') return [torsoCosmetic, armCosmetic].some(c => c?.tags?.includes(val));
        return curSlots[key]?.id === val;
      });
      if (!met) continue;
      const opt = (filteredBySlot[rule.slot] || []).find(o => o.id === rule.cosmeticId);
      if (!opt) continue;
      if      (rule.slot === 'eyes')       eyes = opt;
      else if (rule.slot === 'facialHair') facialHair = opt;
      else if (rule.slot === 'hairFront')  hairFront = opt;
      else if (rule.slot === 'hairBack')   hairBack = opt;
      else if (rule.slot === 'hairSide')   hairSide = opt;
      else if (rule.slot === 'hat')        hat = opt;
    }
  }

  const ruleMap = randomizationRulesByFighter || LAST_RANDOMIZATION_RULES_BY_FIGHTER || null;
  const randomizationRules = ruleMap?.[fighter.id] ?? ruleMap?.[fighterInput?.id] ?? null;
  const hatHideSlots = toHiddenSlotSet(hatHideRuleFor(hat?.id, randomizationRules));
  if (hatHideSlots?.size) {
    if (hatHideSlots.has('hairFront')) {
      hairFront = noneOptionForSlot(filteredHairFront, 'No Front Hair');
    }
    if (hatHideSlots.has('hairBack')) {
      hairBack = noneOptionForSlot(filteredHairBack, 'No Back Hair');
    }
    if (hatHideSlots.has('hairSide')) {
      hairSide = noneOptionForSlot(filteredHairSide, 'No Side Hair');
    }
    if (hatHideSlots.has('facialHair')) {
      facialHair = noneOptionForSlot(filteredFacialHair, 'No Facial Hair');
    }
  }

  let bodyColors = randomBodyColorsSeeded(rng, bodyColorRangesByGender?.[fighter.id] ?? bodyColorRangesByGender?.[fighterInput?.id]);
  bodyColors = applyBodyColorRulesSeeded(bodyColors, randomizationRules, rng);

  const clothingRule = randomizationRules?.clothingColors;
  const hasClothPiece = Boolean(torsoCosmetic?.layers?.length || armCosmetic?.layers?.length);
  const syncAcrossPieces = clothingRule?.syncAcrossPieces === true;
  const ruleRange = clothingRule?.range || null;
  const clothSourceRange = ruleRange || torsoCosmetic?.colorRange || armCosmetic?.colorRange || null;
  const hatMaterialRange = materialColorRangeFor(hat);
  const hatSourceRange = hatMaterialRange || hat?.colorRange || null;

  if (hasClothPiece && clothSourceRange) {
    bodyColors.CLOTH = randomColorFromRangeSeeded(clothSourceRange, rng);
  }
  if (hatSourceRange) {
    bodyColors.HAT = (syncAcrossPieces && bodyColors.CLOTH && !hatMaterialRange)
      ? bodyColors.CLOTH
      : randomColorFromRangeSeeded(hatSourceRange, rng);
  }
  return { fighter, hairFront, hairBack, hairSide, eyes, facialHair, hat, torsoCosmetic, armCosmetic, bodyColors };
}

window.setPortraitConfig = setPortraitConfig;
