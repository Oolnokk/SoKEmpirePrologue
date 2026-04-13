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
    id:       'M',
    label:    'Mao-ao (M)',
    headUrl:  'fightersprites/mao-ao-m/head_mint.png',
    torsoUrl: 'bonesplayersprites/torso_mao-ao_m.png',
    armLUrl:  'bonesplayersprites/arm-L_mao-ao_m.png',
    armRUrl:  'bonesplayersprites/arm-R_mao-ao_m.png',
    urLayers: [
      { url: 'fightersprites/mao-ao-m/untinted_regions/ur-head.png' },
    ],
  },
  {
    id:       'F',
    label:    'Mao-ao (F)',
    headUrl:  'fightersprites/mao-ao-f/head.png',
    torsoUrl: 'bonesplayersprites/torso_mao-ao_f.png',
    armLUrl:  'bonesplayersprites/arm-L_mao-ao_f.png',
    armRUrl:  'bonesplayersprites/arm-R_mao-ao_f.png',
    urLayers: [
      { url: 'fightersprites/mao-ao-f/untinted_regions/ur-head.png' },
    ],
  },
];

// Probability of randomly assigning an overwear item when no cosmeticWeights are
// configured. Lower than the hat probability (0.5) because overwear covers more of
// the portrait and is expected to be rarer in the default look.
const OVERWEAR_DEFAULT_PROBABILITY = 0.4;
// Arms and legs are excluded because those body parts are not rendered in portraits.
const PORTRAIT_CLOTHING_SLOTS_HAT      = new Set(['hat', 'hood']);
const PORTRAIT_CLOTHING_SLOTS_OVERWEAR = new Set(['overwear']);
const PORTRAIT_CLOTHING_SLOTS_EXCLUDED = new Set(['arms', 'legs']);

const BODYCOLOR_LIMITS = {
  A: { hMin: -100, hMax:  -30, sMin: 0.05, sMax: 0.75, vMin: -0.50, vMax: 0.20 },
  B: { hMin: -100, hMax:  -30, sMin: -0.20, sMax: 0.90, vMin: -0.85, vMax: 0.10 },
  C: { hMin: -100, hMax:  -30, sMin: -0.65, sMax: 0.65, vMin: -0.25, vMax: 0.55 },
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

async function renderProfile(canvas, profile, opts = {}) {
  const showBody = opts.showBody === true;
  const { fighter, hair, hairFront, hairBack, hairSide, eyes, facialHair, hat, overwear, bodyColors } = profile;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, PORTRAIT_CW, PORTRAIT_CH);

  const filterFor = (slot) => slot ? makeCSSFilter(bodyColors[slot]) : 'none';
  const filterA   = makeCSSFilter(bodyColors.A);

  // Support both three-slot (hairBack/hairSide/hairFront) and legacy single-slot (hair).
  const allCosmeticGroups = hairFront !== undefined
    ? [hairBack, hairSide, eyes, facialHair, hairFront, hat, overwear]
    : [hair, eyes, facialHair, hat, overwear];

  // Separate layers by body slot and front/back position.
  const headBackLayers  = [];  // head-level back (e.g. hair back)
  const headFrontLayers = [];  // head-level front (e.g. hair front, eyes, hat)
  const bodyBackLayers  = [];  // body-level back (e.g. overwear poncho back panel)
  const bodyFrontLayers = [];  // body-level front (e.g. overwear poncho front panel)

  for (const group of allCosmeticGroups) {
    if (!group || !group.layers.length) continue;
    for (const layer of group.layers) {
      const filter = filterFor(group.tintSlot);
      if (layer.bodySlot === 'torso') {
        (layer.pos === 'back' ? bodyBackLayers : bodyFrontLayers).push({ layer, filter });
      } else {
        (layer.pos === 'back' ? headBackLayers : headFrontLayers).push({ layer, filter });
      }
    }
  }

  const neededUrls = new Set([
    fighter.headUrl,
    ...(fighter.urLayers || []).map(m => m.url),
    ...headBackLayers.map(({ layer }) => layer.url),
    ...headFrontLayers.map(({ layer }) => layer.url),
  ]);

  if (showBody) {
    if (fighter.armRUrl)  neededUrls.add(fighter.armRUrl);
    if (fighter.armLUrl)  neededUrls.add(fighter.armLUrl);
    if (fighter.torsoUrl) neededUrls.add(fighter.torsoUrl);
    for (const { layer } of [...bodyBackLayers, ...bodyFrontLayers]) neededUrls.add(layer.url);
  }

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

  // ── Render order ───────────────────────────────────────────
  // 1. Head-level back layers (hair back)
  for (const { layer, filter } of headBackLayers) {
    const img = imgMap.get(layer.url);
    if (img) drawPortraitLayer(ctx, img, composeXform(HEAD_XFORM, layer), filter);
  }

  if (showBody) {
    // 2. Body-level back layers (overwear back panel, behind arms/torso)
    for (const { layer, filter } of bodyBackLayers) {
      const img = imgMap.get(layer.url);
      if (img) drawPortraitLayer(ctx, img, composeXform(HEAD_XFORM, layer), filter);
    }
    // 3. Arm-R (behind torso)
    if (fighter.armRUrl) {
      const img = imgMap.get(fighter.armRUrl);
      if (img) drawPortraitLayer(ctx, img, HEAD_XFORM, filterA);
    }
    // 4. Arm-L (behind head, in front of arm-R)
    if (fighter.armLUrl) {
      const img = imgMap.get(fighter.armLUrl);
      if (img) drawPortraitLayer(ctx, img, HEAD_XFORM, filterA);
    }
    // 5. Torso
    if (fighter.torsoUrl) {
      const img = imgMap.get(fighter.torsoUrl);
      if (img) drawPortraitLayer(ctx, img, HEAD_XFORM, filterA);
    }
    // 6. Body-level front layers (overwear front panel, over torso/arms but under head)
    for (const { layer, filter } of bodyFrontLayers) {
      const img = imgMap.get(layer.url);
      if (img) drawPortraitLayer(ctx, img, composeXform(HEAD_XFORM, layer), filter);
    }
  }

  // 7. Head
  { const img = imgMap.get(fighter.headUrl); if (img) drawPortraitLayer(ctx, img, HEAD_XFORM, filterA); }

  // 8. Untinted-region overlays (preserves flesh-toned areas on tinted head)
  for (const mid of (fighter.urLayers || [])) {
    const img = imgMap.get(mid.url);
    if (img) drawPortraitLayer(ctx, img, mid.xform || HEAD_XFORM, 'none');
  }

  // 9. Head-level front layers (eyes, hair front, hat)
  for (const { layer, filter } of headFrontLayers) {
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
  const torso  = json.parts && json.parts.torso;

  if (head) {
    if (head.layers) {
      for (const [layerName, layer] of Object.entries(head.layers)) {
        const xf =
          (layer.spriteStyle && layer.spriteStyle.base && layer.spriteStyle.base.xform && layer.spriteStyle.base.xform.head) ||
          (layer.spriteStyle && layer.spriteStyle.xform && layer.spriteStyle.xform.head) || {};
        const imgUrl = layer.image && layer.image.url;
        if (imgUrl) {
          layers.push({
            url:      portraitRelPath(imgUrl),
            ax:       xf.ax     ?? 0,
            ay:       xf.ay     ?? 0,
            sx:       xf.scaleX ?? 1,
            sy:       xf.scaleY ?? 1,
            pos:      layerName === 'back' ? 'back' : 'front',
            bodySlot: 'head',
          });
        }
      }
    } else if (head.image) {
      const xf = (head.spriteStyle && head.spriteStyle.xform && head.spriteStyle.xform.head) || {};
      const imgUrl = head.image.url;
      if (imgUrl) {
        layers.push({
          url:      portraitRelPath(imgUrl),
          ax:       xf.ax     ?? 0,
          ay:       xf.ay     ?? 0,
          sx:       xf.scaleX ?? 1,
          sy:       xf.scaleY ?? 1,
          pos:      'front',
          bodySlot: 'head',
        });
      }
    }
  }

  if (torso && torso.layers) {
    for (const [layerName, layer] of Object.entries(torso.layers)) {
      const xf =
        (layer.spriteStyle && layer.spriteStyle.base && layer.spriteStyle.base.xform && layer.spriteStyle.base.xform.torso) ||
        (layer.spriteStyle && layer.spriteStyle.xform && layer.spriteStyle.xform.torso) || {};
      const imgUrl = layer.image && layer.image.url;
      if (imgUrl) {
        layers.push({
          url:      portraitRelPath(imgUrl),
          ax:       xf.ax ?? 0,
          ay:       xf.ay ?? 0,
          // Existing fighting-game torso configs use scaleMulX/scaleMulY (bone-relative
          // multipliers). For the static portrait frame they are treated as direct sx/sy
          // values; portrait-specific cosmetics should use scaleX/scaleY instead.
          sx:       xf.scaleX ?? xf.scaleMulX ?? 1,
          sy:       xf.scaleY ?? xf.scaleMulY ?? 1,
          pos:      layerName === 'back' ? 'back' : 'front',
          bodySlot: 'torso',
        });
      }
    }
  }

  const colorRange = (json.slot === 'hat' && json.colorRange) ? json.colorRange : null;
  const resolvedTintSlot = colorRange ? 'HAT' : tintSlot;
  const hairSlot = json.hairSlot || null; // 'front' | 'back' | 'side'
  return { id: shortId, label, tintSlot: resolvedTintSlot, layers, slot: json.slot || null, colorRange, hairSlot };
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
  const hairFrontOptions  = [{ id: 'none', label: 'No Front Hair',  tintSlot: null, layers: [] }];
  const hairBackOptions   = [{ id: 'none', label: 'No Back Hair',   tintSlot: null, layers: [] }];
  const hairSideOptions   = [{ id: 'none', label: 'No Side Hair',   tintSlot: null, layers: [] }];
  const eyesOptions       = [{ id: 'none', label: 'No Eye Mark',    tintSlot: null, layers: [] }];
  const facialHairOptions = [{ id: 'none', label: 'No Facial Hair', tintSlot: null, layers: [] }];
  const hatOptions        = [{ id: 'none', label: 'No Hat',         tintSlot: null, layers: [] }];
  const overwearOptions   = [{ id: 'none', label: 'No Overwear',    tintSlot: null, layers: [] }];
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
  }

  // Also load non-appearance clothing entries: hat, hood, and overwear slots
  // (arms and legs slots are excluded as they are not rendered in portraits).
  const clothingEntries = (data.entries || []).filter(e => e.id && !e.id.startsWith('appearance::'));
  const clothingPathMap = new Map();
  for (const entry of clothingEntries) {
    if (!clothingPathMap.has(entry.path)) clothingPathMap.set(entry.path, []);
    clothingPathMap.get(entry.path).push(entry);
  }
  const clothingSeenIds = new Set(seenIds);

  await Promise.all([...clothingPathMap.entries()].map(async ([path, entries]) => {
    const jsonUrl = new URL(path, indexBaseUrl).toString();
    let json;
    try {
      const resp = await fetch(jsonUrl);
      if (!resp.ok) throw new Error('HTTP ' + resp.status + ' for ' + path);
      json = await resp.json();
    } catch (e) {
      console.warn('[portrait] Could not load clothing JSON:', path, e);
      return;
    }
    const slot = json.slot || (Array.isArray(json.slots) ? json.slots[0] : null);
    if (!slot || PORTRAIT_CLOTHING_SLOTS_EXCLUDED.has(slot)) return;
    const isHat      = PORTRAIT_CLOTHING_SLOTS_HAT.has(slot);
    const isOverwear = PORTRAIT_CLOTHING_SLOTS_OVERWEAR.has(slot);
    if (!isHat && !isOverwear) return;

    for (const entry of entries) {
      const opt = portraitOptionFromJson(entry, json);
      if (!opt.layers.length) continue;
      if (clothingSeenIds.has(opt.id)) continue;
      clothingSeenIds.add(opt.id);
      if (isHat)      hatOptions.push(opt);
      else            overwearOptions.push(opt);
    }
  }));

  // Load species body color ranges, allowed cosmetics, and cosmetic weights, keyed by fighter ID
  const bodyColorRangesByGender = {};
  const allowedCosmeticsByFighter = {};
  const cosmeticWeightsByFighter = {};
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
          }
        }
      }));
    }
  } catch (e) {
    console.warn('[portrait] Could not load species data', e);
  }

  return { hairFrontOptions, hairBackOptions, hairSideOptions, eyesOptions, facialHairOptions, hatOptions, overwearOptions, indexEntries, optionCache, bodyColorRangesByGender, allowedCosmeticsByFighter, cosmeticWeightsByFighter };
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
 * Unspecified categories use uniform random. Cosmetics missing from a weight map default to weight 1.
 * Weight 0 excludes an item from selection entirely.
 */
function weightedPickRng(arr, weights, rng) {
  if (!arr || arr.length === 0) return undefined;
  if (!weights) return arr[Math.floor(rng() * arr.length)];
  const w = arr.map(o => (weights[o.id] != null ? weights[o.id] : 1));
  const total = w.reduce((a, b) => a + b, 0);
  if (total <= 0) return arr[Math.floor(rng() * arr.length)];
  let r = rng() * total;
  for (let i = 0; i < arr.length; i++) {
    r -= w[i];
    if (r <= 0) return arr[i];
  }
  return arr[arr.length - 1];
}

/**
 * Generate a fully deterministic random profile using a provided rng() function.
 * All option arrays must be supplied by the caller.
 * cosmeticWeightsByFighter (optional): object keyed by fighter.id, each value being a
 *   per-category weights map (see weightedPickRng docs above). When omitted the selection
 *   falls back to the original uniform-random behaviour.
 * overwearOptions (optional): array of overwear cosmetic options (ponchos, cloaks, etc.).
 *   When omitted or empty, overwear defaults to none.
 */
function randomProfileSeeded(rng, fighters, hairFrontOptions, hairBackOptions, hairSideOptions, eyesOptions, facialHairOptions, bodyColorRangesByGender, allowedCosmeticsByFighter, hatOptions, cosmeticWeightsByFighter, overwearOptions) {
  const pickRng   = (arr) => arr[Math.floor(rng() * arr.length)];
  const fighter   = pickRng(fighters);
  const fighterEntry = allowedCosmeticsByFighter?.[fighter.id];
  const allowed   = fighterEntry instanceof Set ? fighterEntry : (fighterEntry?.set ?? null);
  const disallowedCombos = (fighterEntry instanceof Set ? [] : (fighterEntry?.disallowedCombos ?? []));
  const filterArr = (arr) => arr && allowed ? arr.filter(o => o.id === 'none' || allowed.has(o.id)) : arr;
  const weights   = cosmeticWeightsByFighter?.[fighter.id] ?? null;

  const filteredHairFront  = filterArr(hairFrontOptions)  ?? [];
  const filteredHairBack   = filterArr(hairBackOptions)   ?? [];
  const filteredHairSide   = filterArr(hairSideOptions)   ?? [];
  const filteredEyes       = filterArr(eyesOptions)       ?? [];
  const filteredFacialHair = filterArr(facialHairOptions) ?? [];
  const filteredHat        = filterArr(hatOptions) ?? [{ id: 'none', label: 'No Hat', tintSlot: null, layers: [] }];

  let hairFront  = weightedPickRng(filteredHairFront.length  ? filteredHairFront  : [{ id: 'none', label: 'No Front Hair', tintSlot: null, layers: [] }], weights?.hairFront,  rng);
  let hairBack   = weightedPickRng(filteredHairBack.length   ? filteredHairBack   : [{ id: 'none', label: 'No Back Hair',  tintSlot: null, layers: [] }], weights?.hairBack,   rng);
  let hairSide   = weightedPickRng(filteredHairSide.length   ? filteredHairSide   : [{ id: 'none', label: 'No Side Hair',  tintSlot: null, layers: [] }], weights?.hairSide,   rng);
  const eyes       = weightedPickRng(filteredEyes.length       ? filteredEyes       : [{ id: 'none', label: 'No Eye Mark',   tintSlot: null, layers: [] }], weights?.eyes,       rng);
  const noFacialHair = filteredFacialHair.find(o => o.id === 'none') ?? filteredFacialHair[0] ?? { id: 'none', label: 'No Facial Hair', tintSlot: null, layers: [] };
  const facialHair = rng() < 0.35 ? pickRng(filteredFacialHair.length ? filteredFacialHair : [noFacialHair]) : noFacialHair;
  const noHat      = filteredHat.find(o => o.id === 'none') ?? filteredHat[0];
  // When hat weights are configured, use a single weighted pick (weights include 'none').
  // Otherwise fall back to the original 50%-skip + uniform-pick behaviour.
  const hat = weights?.hat
    ? weightedPickRng(filteredHat.length ? filteredHat : [noHat], weights.hat, rng)
    : (rng() < 0.5 ? pickRng(filteredHat) : noHat);

  // Overwear: not filtered by allowedCosmetics (it is a separate slot category).
  const noOverwear = { id: 'none', label: 'No Overwear', tintSlot: null, layers: [] };
  const overwearPool = (overwearOptions && overwearOptions.length) ? overwearOptions : [noOverwear];
  const overwear = weights?.overwear
    ? weightedPickRng(overwearPool, weights.overwear, rng)
    : (rng() < OVERWEAR_DEFAULT_PROBABILITY ? pickRng(overwearPool) : noOverwear);

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

  const bodyColors = randomBodyColorsSeeded(rng, bodyColorRangesByGender?.[fighter.id]);
  if (hat && hat.colorRange) bodyColors.HAT = randomColorFromRangeSeeded(hat.colorRange, rng);
  return { fighter, hairFront, hairBack, hairSide, eyes, facialHair, hat, overwear, bodyColors };
}
