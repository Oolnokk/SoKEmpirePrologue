// ============================================================
// PORTRAIT UTILS
// Shared portrait generation and rendering logic.
// Used by: character-tools.html, ScratchbonesBluffGame.html
//
// Setup (call before rendering):
//   setPortraitAssetBase('./assets/');          // character-tools (default)
//   setPortraitAssetBase('./docs/assets/');     // ScratchbonesBluffGame
// ============================================================

// ── Constants ──────────────────────────────────────────────

const PORTRAIT_CW = 200;
const PORTRAIT_CH = 200;
const PORTRAIT_L  = 80;

// Head xform (from config spriteStyle for Mao-ao head bone)
const HEAD_XFORM = { ax: 0, ay: -0.1, sx: 0.95, sy: 1.14 };

// ── Fighter definitions ────────────────────────────────────

const FIGHTERS = [
  {
    id:      'M',
    label:   'Mao-ao (M)',
    headUrl: 'fightersprites/mao-ao-m/head_mint.png',
    urLayers: [
      { url: 'fightersprites/mao-ao-m/untinted_regions/ur-head.png' },
    ],
  },
  {
    id:      'F',
    label:   'Mao-ao (F)',
    headUrl: 'fightersprites/mao-ao-f/head.png',
    urLayers: [
      { url: 'fightersprites/mao-ao-f/untinted_regions/ur-head.png' },
    ],
  },
];

// ── Body color limits ──────────────────────────────────────

const BODYCOLOR_LIMITS = {
  A: { hMin: -130, hMax:  -30, sMin: 0.05, sMax: 0.75, vMin: -0.50, vMax: 0.20 },
  B: { hMin: -180, hMax:  180, sMin: -1.00, sMax: 1.00, vMin: -1.00, vMax: 1.00 },
  C: { hMin: -180, hMax:  180, sMin: -1.00, sMax: 1.00, vMin: -1.00, vMax: 1.00 },
};

// ── Image loading ──────────────────────────────────────────

let _puAssetBase = './assets/';
const IMG_CACHE  = new Map();

/** Set the asset base URL used by loadImg(). Call before rendering. */
function setPortraitAssetBase(base) {
  _puAssetBase = base;
  IMG_CACHE.clear();
}

function loadImg(relPath) {
  const url = _puAssetBase + relPath;
  if (IMG_CACHE.has(url)) return IMG_CACHE.get(url);
  const promise = new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload  = () => resolve(img);
    img.onerror = () => {
      if (!url.startsWith('https://raw.githubusercontent.com')) {
        const rawUrl = 'https://raw.githubusercontent.com/Oolnokk/SoKEmpirePrologue/main/docs/assets/' + relPath;
        const img2 = new Image();
        img2.crossOrigin = 'anonymous';
        img2.onload  = () => resolve(img2);
        img2.onerror = () => reject(new Error('Failed: ' + relPath));
        img2.src = rawUrl;
      } else {
        reject(new Error('Failed: ' + relPath));
      }
    };
    img.src = url;
  });
  IMG_CACHE.set(url, promise);
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

// ── Rendering ──────────────────────────────────────────────

async function renderProfile(canvas, profile) {
  const { fighter, hair, eyes, facialHair, bodyColors } = profile;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, PORTRAIT_CW, PORTRAIT_CH);

  const filterFor = (slot) => slot ? makeCSSFilter(bodyColors[slot]) : 'none';
  const filterA   = makeCSSFilter(bodyColors.A);

  const allCosmeticGroups = [hair, eyes, facialHair];
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
    fighter.headUrl,
    ...(fighter.urLayers || []).map(m => m.url),
    ...backLayers.map(({ layer }) => layer.url),
    ...frontLayers.map(({ layer }) => layer.url),
  ]);

  let imgMap;
  try {
    const entries = await Promise.all(
      [...neededUrls].map(async (url) => [url, await loadImg(url)])
    );
    imgMap = new Map(entries);
  } catch (err) {
    console.warn('[portrait] image load error', err);
    ctx.fillStyle = '#220000'; ctx.fillRect(0, 0, PORTRAIT_CW, PORTRAIT_CH);
    ctx.fillStyle = '#ff4444'; ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Load error', PORTRAIT_CW / 2, PORTRAIT_CH / 2);
    return;
  }

  for (const { layer, filter } of backLayers) {
    const img = imgMap.get(layer.url);
    if (img) drawPortraitLayer(ctx, img, composeXform(HEAD_XFORM, layer), filter);
  }
  { const img = imgMap.get(fighter.headUrl); if (img) drawPortraitLayer(ctx, img, HEAD_XFORM, filterA); }
  for (const mid of (fighter.urLayers || [])) {
    const img = imgMap.get(mid.url);
    if (img) drawPortraitLayer(ctx, img, mid.xform || HEAD_XFORM, 'none');
  }
  for (const { layer, filter } of frontLayers) {
    const img = imgMap.get(layer.url);
    if (img) drawPortraitLayer(ctx, img, composeXform(HEAD_XFORM, layer), filter);
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

  return { id: shortId, label, tintSlot, layers };
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

  const allEntries = (data.entries || []).filter(e => e.id && e.id.startsWith('appearance::'));
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
  const hairOptions       = [{ id: 'none', label: 'No Hair',        tintSlot: null, layers: [] }];
  const eyesOptions       = [{ id: 'none', label: 'No Eye Mark',    tintSlot: null, layers: [] }];
  const facialHairOptions = [{ id: 'none', label: 'No Facial Hair', tintSlot: null, layers: [] }];
  const seenIds = new Set();

  for (const entry of indexEntries) {
    const opt = optionCache.get(entry.id);
    if (!opt || !opt.layers.length) continue;
    if (seenIds.has(opt.id)) continue;
    seenIds.add(opt.id);
    const cat = portraitCategoryForEntry(entry);
    if (cat === 'eyes')            eyesOptions.push(opt);
    else if (cat === 'facialhair') facialHairOptions.push(opt);
    else                           hairOptions.push(opt);
  }

  // Load species body color ranges and allowed cosmetics, keyed by fighter ID
  const bodyColorRangesByGender = {};
  const allowedCosmeticsByFighter = {};
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
        for (const genderData of Object.values(sData)) {
          if (!genderData || typeof genderData !== 'object' || !genderData.bodyColorRanges) continue;
          const fighter = FIGHTERS.find(f => genderData.headSprite && f.headUrl === genderData.headSprite);
          if (fighter) {
            bodyColorRangesByGender[fighter.id] = genderData.bodyColorRanges;
            if (genderData.allowedCosmetics) {
              allowedCosmeticsByFighter[fighter.id] = new Set(genderData.allowedCosmetics);
            }
          }
        }
      }));
    }
  } catch (e) {
    console.warn('[portrait] Could not load species data', e);
  }

  return { hairOptions, eyesOptions, facialHairOptions, indexEntries, optionCache, bodyColorRangesByGender, allowedCosmeticsByFighter };
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

/**
 * Generate a fully deterministic random profile using a provided rng() function.
 * All option arrays must be supplied by the caller.
 */
function randomProfileSeeded(rng, fighters, hairOptions, eyesOptions, facialHairOptions, bodyColorRangesByGender, allowedCosmeticsByFighter) {
  const pickRng = (arr) => arr[Math.floor(rng() * arr.length)];
  const fighter = pickRng(fighters);

  const allowed = allowedCosmeticsByFighter?.[fighter.id];
  const filteredHair       = allowed ? hairOptions.filter(o => o.id === 'none' || allowed.has(o.id))       : hairOptions;
  const filteredEyes       = allowed ? eyesOptions.filter(o => o.id === 'none' || allowed.has(o.id))       : eyesOptions;
  const filteredFacialHair = allowed ? facialHairOptions.filter(o => o.id === 'none' || allowed.has(o.id)) : facialHairOptions;

  const hair       = pickRng(filteredHair);
  const eyes       = pickRng(filteredEyes);
  const noFacialHair = filteredFacialHair.find(o => o.id === 'none') ?? filteredFacialHair[0];
  const facialHair = rng() < 0.35 ? pickRng(filteredFacialHair) : noFacialHair;
  const bodyColors = randomBodyColorsSeeded(rng, bodyColorRangesByGender?.[fighter.id]);
  return { fighter, hair, eyes, facialHair, bodyColors };
}
