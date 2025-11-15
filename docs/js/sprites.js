// sprites.js — Full anchor/xform/rotation/mirror logic, fixed bone angle math (standard graphics coords: "up" = 0 radians)
// Exports: initSprites(), renderSprites(ctx), mirror API
//
// Matches khy-stage-game-v20.html behavior, with fixes:
// - Bones: 0 radians is "up", angles clockwise
// - Sprites: anchored to bone midpoint by default, or bone start if config specifies
// - Sizing: sprite height is bone.len, width scales by aspect ratio and widthFactor
// - Offsets: (ax, ay) can be in percent units (multiply by bone.len) or px
// - Scales: scaleX, scaleY affect width/height
// - rotation: bone.ang + alignRad + Math.PI
// - Mirroring per part via RENDER.MIRROR flags

import { angleZero as angleZeroUtil, basis as basisFn, dist, angle as angleUtil, degToRad } from './math-utils.js?v=1';
import { pickFighterName as pickFighterNameUtil } from './fighter-utils.js?v=1';
import { COSMETIC_SLOTS, ensureCosmeticLayers, cosmeticTagFor, resolveFighterBodyColors } from './cosmetics.js?v=1';

const ASSETS = (window.ASSETS ||= {});
const CACHE = (ASSETS.sprites ||= {});
const FAILED = (ASSETS.failedSprites ||= new Set());
const GLOB = (window.GAME ||= {});
const RENDER = (window.RENDER ||= {});
RENDER.MIRROR = RENDER.MIRROR || {}; // Initialize per-limb mirror flags
const WEAPON_SPRITE_CACHE = new Map();

function ensureArray(value){
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

function clampNumber(value, min, max){
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function normalizeBodyColorOverride(source){
  if (!source || typeof source !== 'object') return null;
  const map = {};
  for (const [key, raw] of Object.entries(source)){
    const letter = String(key || '').trim().toUpperCase();
    if (!letter) continue;
    if (!raw || typeof raw !== 'object') continue;
    const h = Number(raw.h);
    const s = Number(raw.s);
    const lInput = raw.l ?? raw.v;
    map[letter] = {
      h: Number.isFinite(h) ? clampNumber(h, -360, 360) : 0,
      s: Number.isFinite(s) ? clampNumber(s, -1, 1) : 0,
      l: Number.isFinite(lInput) ? clampNumber(lInput, -1, 1) : 0,
    };
  }
  return Object.keys(map).length ? map : null;
}

function buildSpriteOverrides(profile){
  if (!profile || typeof profile !== 'object') return {};
  const overrides = {};
  const colorSource = profile.bodyColorsOverride
    ?? profile.bodyColors
    ?? profile.character?.bodyColors;
  const normalizedColors = normalizeBodyColorOverride(colorSource);
  if (normalizedColors) {
    overrides.bodyColors = normalizedColors;
  }
  const cosmeticLayers = profile.cosmeticLayers ?? profile.cosmeticsLayers;
  if (Array.isArray(cosmeticLayers)) {
    overrides.cosmeticLayers = cosmeticLayers.map(layer => ({ ...layer }));
  }
  if (profile.untintedOverlays || profile.untintedOverlayLayers) {
    overrides.untintedOverlays = profile.untintedOverlays ?? profile.untintedOverlayLayers;
  }
  if (profile.characterKey) {
    overrides.characterKey = profile.characterKey;
  }
  if (profile.character && typeof profile.character === 'object') {
    overrides.characterData = profile.character;
  }
  return overrides;
}

function hasHslAdjustments(hsl){
  if (!hsl) return false;
  return (Number.isFinite(hsl.h) && hsl.h !== 0)
    || (Number.isFinite(hsl.s) && hsl.s !== 0)
    || (Number.isFinite(hsl.l) && hsl.l !== 0);
}

function prepareImageForHSL(img, hsl){
  return { image: img, applyFilter: hasHslAdjustments(hsl) };
}


function imageDrawDimensions(img){
  const width = img?.naturalWidth || img?.videoWidth || img?.width || 0;
  const height = img?.naturalHeight || img?.videoHeight || img?.height || 0;
  return { width, height };
}

// Legacy support: map old hideSprites to new RENDER_DEBUG
if (typeof RENDER.hideSprites === 'boolean') {
  window.RENDER_DEBUG = window.RENDER_DEBUG || {};
  window.RENDER_DEBUG.showSprites = !RENDER.hideSprites;
}

RENDER.MIRROR ||= {}; // per-part mirror flags like 'ARM_L_UPPER': true

function angleZero(){ return 'up'; }
function spriteAngleZero(){ return 'up'; }

// Standard "up" = 0 radians - use basisFn from math-utils.js
function basisFor(ang){
  const fn = (typeof window !== 'undefined' && typeof window.BONE_BASIS === 'function') ? window.BONE_BASIS : null;
  if (fn) return fn(ang);
  const c = Math.cos(ang), s = Math.sin(ang);
  return { fx: s, fy: -c, rx: c, ry: s };
}

function withAX(x,y,ang,ax,ay,unitsLen){
  const L = (unitsLen||1);
  const u = (ax||0)*L, v = (ay||0)*L;
  const b = basisFor(ang);
  const dx = u*b.fx + v*b.rx;
  const dy = u*b.fy + v*b.ry;
  return [x+dx,y+dy];
}

// FIXED: "up" = 0 radians
function angle(a, b){
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fn = (typeof window !== 'undefined' && typeof window.BONE_ANGLE_FROM_DELTA === 'function') ? window.BONE_ANGLE_FROM_DELTA : null;
  if (fn) return fn(dx, dy);
  return Math.atan2(dx, -dy);
}

function pickFighterName(C){
  return pickFighterNameUtil(C);
}

function load(url){
  if (!url) return null;
  const cached = CACHE[url];
  if (cached) return cached;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.addEventListener('error', ()=>{ img.__broken = true; });
  img.src = url;
  CACHE[url] = img;
  return img;
}

function ensureWeaponSpriteAsset(cacheKey, spriteDef){
  if (!spriteDef || typeof spriteDef !== 'object' || !spriteDef.url) return null;
  const key = `${cacheKey || ''}:${spriteDef.url}`;
  let asset = WEAPON_SPRITE_CACHE.get(key);
  if (!asset) {
    asset = { url: spriteDef.url };
    WEAPON_SPRITE_CACHE.set(key, asset);
  }
  if (!asset.img || asset.img.src !== spriteDef.url) {
    asset.img = load(spriteDef.url);
  }
  if (spriteDef.alignRad != null) {
    asset.alignRad = spriteDef.alignRad;
  } else if (Number.isFinite(spriteDef.alignDeg)) {
    asset.alignRad = degToRad(spriteDef.alignDeg);
  }
  return asset;
}

// Returns bone objects keyed by body part
// This is a simple accessor that returns pre-computed bones from G.ANCHORS_OBJ
// Bone creation happens in computeAnchorsForFighter() in render.js
function getBones(C, G, fname){
  // Return bones from the single source of truth: G.ANCHORS_OBJ
  // Try direct lookup first (e.g., 'player', 'npc')
  if (G.ANCHORS_OBJ?.[fname]) {
    return G.ANCHORS_OBJ[fname];
  }
  // Fallback: if fname is a config fighter name (e.g., 'TLETINGAN'), 
  // use 'player' as common case
  if (G.ANCHORS_OBJ?.player) {
    return G.ANCHORS_OBJ.player;
  }
  // Last resort: use first available anchor set
  const anchors = G.ANCHORS_OBJ;
  if (anchors && typeof anchors === 'object') {
    const keys = Object.keys(anchors);
    if (keys.length > 0) {
      return anchors[keys[0]];
    }
  }
  return null;
}

// Tag helpers
function tagOf(boneKey){
  switch(boneKey){
    case 'torso': return 'TORSO';
    case 'head': return 'HEAD';
    case 'arm_L_upper': return 'ARM_L_UPPER';
    case 'arm_L_lower': return 'ARM_L_LOWER';
    case 'arm_R_upper': return 'ARM_R_UPPER';
    case 'arm_R_lower': return 'ARM_R_LOWER';
    case 'leg_L_upper': return 'LEG_L_UPPER';
    case 'leg_L_lower': return 'LEG_L_LOWER';
    case 'leg_R_upper': return 'LEG_R_UPPER';
    case 'leg_R_lower': return 'LEG_R_LOWER';
    default: return boneKey.toUpperCase();
  }
}
function styleKeyOf(boneKey){
  switch (boneKey){
    case 'arm_L_upper':
    case 'arm_R_upper': return 'armUpper';
    case 'arm_L_lower':
    case 'arm_R_lower': return 'armLower';
    case 'leg_L_upper':
    case 'leg_R_upper': return 'legUpper';
    case 'leg_L_lower':
    case 'leg_R_lower': return 'legLower';
    case 'head': return 'head';
    case 'torso': return 'torso';
    default: return boneKey;
  }
}

function spriteRotationOffset(styleKey){
  switch (styleKey){
    case 'legUpper':
    case 'legLower':
      return 0; // No offset required for legs in corrected system
    default:
      return 0;
  }
}

function normalizeStyleKey(k){
  if (!k || typeof k !== 'string') return k;
  const parts = k.split('_');
  if (parts.length === 3 && (parts[1] === 'L' || parts[1] === 'R')) {
    parts.splice(1, 1);
  }
  return parts.map((p, i) => (i === 0 ? p : (p.charAt(0).toUpperCase() + p.slice(1)))).join('');
}

// Render order: use CONFIG.render.order if available; else fallback
function buildZMap(C){
  const def = ['HITBOX','ARM_L_UPPER','ARM_L_LOWER','LEG_L_LOWER','LEG_L_UPPER','TORSO','HEAD','LEG_R_LOWER','LEG_R_UPPER','ARM_R_UPPER','ARM_R_LOWER','WEAPON'];
  const baseOrder = (C.render && Array.isArray(C.render.order) && C.render.order.length) ? C.render.order.map(s=>String(s).toUpperCase()) : def;
  const expanded = [];
  for (const tag of baseOrder){
    for (const slot of COSMETIC_SLOTS){
      expanded.push(cosmeticTagFor(tag, slot, 'back'));
    }
    expanded.push(tag);
    for (const slot of COSMETIC_SLOTS){
      expanded.push(cosmeticTagFor(tag, slot));
    }
  }
  const m = new Map();
  expanded.forEach((tag,i)=>m.set(tag, i));
  return (tag)=> (m.has(tag) ? m.get(tag) : baseOrder.length + COSMETIC_SLOTS.length + 999);
}

// === MIRROR API ===
export function resetMirror(){ RENDER.MIRROR = {}; }
export function setMirrorForPart(part, val){ RENDER.MIRROR[part] = !!val; }

function legMirrorFlag(side, tagU, tagL){
  // Modify as needed if you want per-leg mirroring based on animation or sprites
  return !!RENDER.MIRROR[tagU] || !!RENDER.MIRROR[tagL];
}

function getMirrorFlag(tag){
  return !!RENDER.MIRROR[tag];
}

// Leg drawing uses branch mirroring, standard math
function drawLegBranch(ctx, rig, side, assets, style, offsets, segment='both'){
  const upKey = side==='L' ? 'leg_L_upper':'leg_R_upper';
  const loKey = side==='L' ? 'leg_L_lower':'leg_R_lower';
  const up = rig[upKey]; const lo = rig[loKey]; if (!up) return;
  const tagU = tagOf(upKey), tagL = tagOf(loKey);
  const mirror = legMirrorFlag(side, tagU, tagL);
  const originX = up.x;
  withBranchMirror(ctx, originX, mirror, ()=>{
    if (segment !== 'lower'){
      drawBoneSprite(ctx, assets[upKey], up, styleKeyOf(upKey), style, offsets);
    }
    if (segment !== 'upper' && lo){
      drawBoneSprite(ctx, assets[loKey], lo, styleKeyOf(loKey), style, offsets);
    }
  });
}

// Draws arms with branch-level mirroring
function drawArmBranch(ctx, rig, side, assets, style, offsets, segment='both'){
  const upKey = side==='L' ? 'arm_L_upper':'arm_R_upper';
  const loKey = side==='L' ? 'arm_L_lower':'arm_R_lower';
  const up = rig[upKey]; const lo = rig[loKey]; if (!up) return;
  const tagU = tagOf(upKey), tagL = tagOf(loKey);
  const mirror = RENDER.MIRROR[tagU] || RENDER.MIRROR[tagL];
  const originX = up.x;
  withBranchMirror(ctx, originX, mirror, ()=>{
    if (segment !== 'lower') drawBoneSprite(ctx, assets[upKey], up, styleKeyOf(upKey), style, offsets);
    if (segment !== 'upper' && lo) drawBoneSprite(ctx, assets[loKey], lo, styleKeyOf(loKey), style, offsets);
  });
}

// Branch mirroring for limbs
function withBranchMirror(ctx, originX, mirror, drawFn){
  ctx.save();
  if (mirror) {
    ctx.translate(originX, 0);
    ctx.scale(-1, 1);
    ctx.translate(-originX, 0);
  }
  drawFn();
  ctx.restore();
}

function resolveCosmeticMirror(rig, partKey, bone){
  const tag = tagOf(partKey);
  const fallbackOrigin = bone?.x ?? 0;
  switch (tag){
    case 'ARM_L_UPPER':
    case 'ARM_L_LOWER':
      return {
        mirror: getMirrorFlag('ARM_L_UPPER') || getMirrorFlag('ARM_L_LOWER'),
        originX: rig?.arm_L_upper?.x ?? rig?.arm_L_lower?.x ?? fallbackOrigin
      };
    case 'ARM_R_UPPER':
    case 'ARM_R_LOWER':
      return {
        mirror: getMirrorFlag('ARM_R_UPPER') || getMirrorFlag('ARM_R_LOWER'),
        originX: rig?.arm_R_upper?.x ?? rig?.arm_R_lower?.x ?? fallbackOrigin
      };
    case 'LEG_L_UPPER':
    case 'LEG_L_LOWER':
      return {
        mirror: getMirrorFlag('LEG_L_UPPER') || getMirrorFlag('LEG_L_LOWER'),
        originX: rig?.leg_L_upper?.x ?? rig?.leg_L_lower?.x ?? fallbackOrigin
      };
    case 'LEG_R_UPPER':
    case 'LEG_R_LOWER':
      return {
        mirror: getMirrorFlag('LEG_R_UPPER') || getMirrorFlag('LEG_R_LOWER'),
        originX: rig?.leg_R_upper?.x ?? rig?.leg_R_lower?.x ?? fallbackOrigin
      };
    default:
      return { mirror: getMirrorFlag(tag), originX: fallbackOrigin };
  }
}

// Sprite rendering for bones, fixed math
function mergeSpriteStyles(base = {}, overrides = {}){
  if (!overrides) return base;
  const out = { ...base };
  if (overrides.widthFactor){
    out.widthFactor = { ...(base.widthFactor || {}), ...overrides.widthFactor };
  }
  if (overrides.anchor){
    out.anchor = { ...(base.anchor || {}), ...overrides.anchor };
  }
  if (overrides.xformUnits){
    out.xformUnits = overrides.xformUnits;
  }
  if (overrides.xform){
    const baseXform = base.xform || {};
    const overrideXform = overrides.xform || {};
    const merged = { ...(baseXform || {}) };
    for (const key of Object.keys(overrideXform)){
      const overrideVal = overrideXform[key];
      if (overrideVal === null){
        merged[key] = null;
        continue;
      }
      const baseVal = baseXform[key];
      if (overrideVal && typeof overrideVal === 'object' && !Array.isArray(overrideVal)){
        merged[key] = {
          ...(baseVal && typeof baseVal === 'object' ? baseVal : {}),
          ...overrideVal
        };
      } else {
        merged[key] = overrideVal;
      }
    }
    out.xform = merged;
  }
  return out;
}

function buildFilterString(baseFilter, hsl){
  const filters = [];
  if (baseFilter && baseFilter !== 'none'){
    filters.push(baseFilter);
  }
  if (hsl){
    if (Number.isFinite(hsl.h)){
      filters.push(`hue-rotate(${hsl.h}deg)`);
    }
    if (Number.isFinite(hsl.s)){
      const sat = Math.max(0, 1 + hsl.s);
      filters.push(`saturate(${sat})`);
    }
    if (Number.isFinite(hsl.l)){
      const light = Math.max(0, 1 + hsl.l);
      filters.push(`brightness(${light})`);
    }
  }
  return filters.length ? filters.join(' ') : 'none';
}

function setTransformFromTriangle(ctx, srcTri, dstTri){
  const [sx0, sy0] = srcTri[0];
  const [sx1, sy1] = srcTri[1];
  const [sx2, sy2] = srcTri[2];
  const [dx0, dy0] = dstTri[0];
  const [dx1, dy1] = dstTri[1];
  const [dx2, dy2] = dstTri[2];
  const delta = sx0 * (sy1 - sy2) + sx1 * (sy2 - sy0) + sx2 * (sy0 - sy1);
  if (!delta) return false;
  const a = dx0 * (sy1 - sy2) + dx1 * (sy2 - sy0) + dx2 * (sy0 - sy1);
  const b = dy0 * (sy1 - sy2) + dy1 * (sy2 - sy0) + dy2 * (sy0 - sy1);
  const c = dx0 * (sx2 - sx1) + dx1 * (sx0 - sx2) + dx2 * (sx1 - sx0);
  const d = dy0 * (sx2 - sx1) + dy1 * (sx0 - sx2) + dy2 * (sx1 - sx0);
  const e = dx0 * (sx1 * sy2 - sx2 * sy1) + dx1 * (sx2 * sy0 - sx0 * sy2) + dx2 * (sx0 * sy1 - sx1 * sy0);
  const f = dy0 * (sx1 * sy2 - sx2 * sy1) + dy1 * (sx2 * sy0 - sx0 * sy2) + dy2 * (sx0 * sy1 - sx1 * sy0);
  ctx.setTransform(a / delta, b / delta, c / delta, d / delta, e / delta, f / delta);
  return true;
}

function drawWarpedImage(ctx, img, destPoints, w, h){
  const { width: srcW, height: srcH } = imageDrawDimensions(img);
  if (!(srcW > 0 && srcH > 0)) return;
  const srcPoints = {
    center: [srcW / 2, srcH / 2],
    tl: [0, 0],
    tr: [srcW, 0],
    br: [srcW, srcH],
    bl: [0, srcH]
  };
  const triangles = [
    ['center', 'tl', 'tr'],
    ['center', 'tr', 'br'],
    ['center', 'br', 'bl'],
    ['center', 'bl', 'tl']
  ];
  for (const tri of triangles){
    const dstTri = tri.map(key => {
      const pt = destPoints[key];
      return [pt.x, pt.y];
    });
    const srcTri = tri.map(key => srcPoints[key]);
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(dstTri[0][0], dstTri[0][1]);
    ctx.lineTo(dstTri[1][0], dstTri[1][1]);
    ctx.lineTo(dstTri[2][0], dstTri[2][1]);
    ctx.closePath();
    ctx.clip();
    if (setTransformFromTriangle(ctx, srcTri, dstTri)){
      ctx.drawImage(img, 0, 0, srcW, srcH, 0, 0, w, h);
    }
    ctx.restore();
  }
}

function normalizeSpriteOffsetSpec(raw){
  if (!raw) return null;
  let spec = raw;
  if (typeof raw === 'object' && raw !== null && raw.origin){
    spec = raw.origin;
  }
  if (Array.isArray(spec)){
    const [ax = 0, ay = 0, units] = spec;
    return {
      ax: Number(ax) || 0,
      ay: Number(ay) || 0,
      units: typeof units === 'string' ? units : undefined
    };
  }
  if (typeof spec === 'number'){
    return { ax: spec, ay: 0 };
  }
  if (!spec || typeof spec !== 'object') return null;
  return {
    ax: Number(spec.ax ?? spec.x ?? 0) || 0,
    ay: Number(spec.ay ?? spec.y ?? 0) || 0,
    units: typeof spec.units === 'string'
      ? spec.units
      : (typeof spec.unit === 'string' ? spec.unit : undefined)
  };
}

function lookupSpriteOffset(offsets, styleKey){
  if (!offsets || typeof offsets !== 'object') return null;
  const normalizedKey = normalizeStyleKey(styleKey);
  const tryCandidates = (...candidates)=>{
    for (const candidate of candidates){
      const spec = normalizeSpriteOffsetSpec(candidate);
      if (spec) return spec;
    }
    return null;
  };

  const direct = tryCandidates(offsets[styleKey], offsets[normalizedKey]);
  if (direct) return direct;

  switch (normalizedKey){
    case 'torso':
      return tryCandidates(offsets.torso, offsets.torso?.sprite, offsets.torso?.origin, offsets.torso?.spriteOffset);
    case 'head':
      return tryCandidates(offsets.head, offsets.head?.sprite, offsets.head?.origin, offsets.head?.spriteOffset);
    case 'armUpper':
      return tryCandidates(offsets.armUpper, offsets.arm?.upper, offsets.arm?.upper?.sprite, offsets.arm?.upper?.spriteOffset);
    case 'armLower':
      return tryCandidates(offsets.armLower, offsets.arm?.lower, offsets.arm?.lower?.sprite, offsets.arm?.lower?.spriteOffset);
    case 'legUpper':
      return tryCandidates(offsets.legUpper, offsets.leg?.upper, offsets.leg?.upper?.sprite, offsets.leg?.upper?.spriteOffset);
    case 'legLower':
      return tryCandidates(offsets.legLower, offsets.leg?.lower, offsets.leg?.lower?.sprite, offsets.leg?.lower?.spriteOffset);
    default:
      return null;
  }
}

function drawBoneSprite(ctx, asset, bone, styleKey, style, offsets){
  const options = arguments[6] || {};
  const opts = options || {};
  const img = asset?.img;
  if (!img || img.__broken) return false;
  if (!img.complete) return false;
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return false;

  const { image: renderImage, applyFilter } = prepareImageForHSL(img, opts.hsl);
  const sourceImage = renderImage || img;

  const normalizedKey = normalizeStyleKey(styleKey);

  // Get anchor config: anchors at bone midpoint by default
  const effectiveStyle = mergeSpriteStyles(style, opts.styleOverride);
  if (opts.anchorOverride && typeof opts.anchorOverride === 'object'){
    const anchorSrc = opts.anchorOverride;
    const normalizedAnchor = {};
    for (const [key, value] of Object.entries(anchorSrc)){
      if (value == null) continue;
      normalizedAnchor[key] = value;
      const normalizedKey = normalizeStyleKey(key);
      if (normalizedKey && normalizedKey !== key){
        normalizedAnchor[normalizedKey] = value;
      }
    }
    if (Object.keys(normalizedAnchor).length){
      effectiveStyle.anchor = {
        ...(effectiveStyle.anchor || {}),
        ...normalizedAnchor
      };
    }
  }
  const anchorCfg = effectiveStyle.anchor || {};
  const anchorMode = anchorCfg[styleKey] || 'mid';
  const resolvedAnchorMode = (opts.anchorMode != null)
    ? opts.anchorMode
    : (anchorCfg[normalizedKey] != null ? anchorCfg[normalizedKey] : anchorMode);

  // Basis vectors for local orientation
  const bAxis = basisFor(bone.ang);
  let posX, posY;
  if (resolvedAnchorMode === 'start') {
    posX = bone.x;
    posY = bone.y;
  } else {
    posX = bone.x + bone.len * 0.5 * bAxis.fx;
    posY = bone.y + bone.len * 0.5 * bAxis.fy;
  }

  // Offset config for fine-tuning sprite placement
  const baseStyleXformSrc = style?.xform || {};
  const xform = (effectiveStyle.xform || {})[normalizedKey] || (effectiveStyle.xform || {})[styleKey] || {};
  const xformUnits = (effectiveStyle.xformUnits || 'px').toLowerCase();

  let ax = Number.isFinite(xform.ax) ? xform.ax : (xform.ax == null ? 0 : Number(xform.ax) || 0);
  let ay = Number.isFinite(xform.ay) ? xform.ay : (xform.ay == null ? 0 : Number(xform.ay) || 0);
  if (xformUnits === 'percent' || xformUnits === '%' || xformUnits === 'pct') {
    ax *= bone.len;
    ay *= bone.len;
  }
  const hasXformAx = Math.abs(ax) > 1e-6;
  const hasXformAy = Math.abs(ay) > 1e-6;
  // Offsets in bone-local space
  const offsetX = ax * bAxis.fx + ay * bAxis.rx;
  const offsetY = ax * bAxis.fy + ay * bAxis.ry;
  posX += offsetX;
  posY += offsetY;

  // Sizing
  const nh = sourceImage.naturalHeight || sourceImage.height || 1;
  const nw = sourceImage.naturalWidth  || sourceImage.width  || 1;
  const baseH = Math.max(1, bone.len);
  const wfTbl = effectiveStyle.widthFactor || {};
  const wf = (wfTbl[normalizedKey] ?? wfTbl[styleKey] ?? 1);
  let w = nw * (baseH / nh) * wf;
  let h = baseH;

  // Scales
  const scaleX = xform.scaleX ?? 1;
  const scaleY = xform.scaleY ?? 1;
  w *= scaleX;
  h *= scaleY;

  const spriteOffset = lookupSpriteOffset(offsets, styleKey);
  if (spriteOffset){
    const units = (spriteOffset.units || '').toLowerCase();
    let ox = Number.isFinite(spriteOffset.ax) ? spriteOffset.ax : 0;
    let oy = Number.isFinite(spriteOffset.ay) ? spriteOffset.ay : 0;
    const unitMode = units
      || (xformUnits === 'percent' || xformUnits === '%' || xformUnits === 'pct' ? 'percent' : 'px');
    if (unitMode === 'percent' || unitMode === '%' || unitMode === 'pct'){
      const heightBasis = Math.abs(h) > 1e-6 ? Math.abs(h) : Math.abs(baseH);
      const widthBasis = Math.abs(w) > 1e-6 ? Math.abs(w) : Math.abs(baseH);
      ox *= heightBasis;
      oy *= widthBasis;
    }
    if (!hasXformAx) {
      posX += ox * bAxis.fx;
      posY += ox * bAxis.fy;
    }
    if (!hasXformAy) {
      posX += oy * bAxis.rx;
      posY += oy * bAxis.ry;
    }
  }

  const overrideXformCandidate = options && options.styleOverride?.xform;
  const overrideXformSrc = overrideXformCandidate || options?.styleOverride?.xform || {};
  const overrideXform = overrideXformSrc[normalizedKey] || overrideXformSrc[styleKey] || null;
  let extraRotRad = 0;
  if (overrideXform){
    if (Number.isFinite(overrideXform.rotRad)){
      extraRotRad = overrideXform.rotRad;
    } else if (Number.isFinite(overrideXform.rotDeg)){
      extraRotRad = degToRad(overrideXform.rotDeg);
    }
  }

  // Rotation (fixed): bone.ang + alignRad + extraRotRad + Math.PI
  const baseStyleXform = baseStyleXformSrc[normalizedKey] || baseStyleXformSrc[styleKey] || {};
  let alignRad;
  if (options?.alignRad != null){
    alignRad = options.alignRad;
  } else if (options?.alignDeg != null){
    alignRad = degToRad(options.alignDeg);
  } else if (Number.isFinite(asset.alignRad)){
    alignRad = asset.alignRad;
  } else if (Number.isFinite(baseStyleXform.rotRad)){
    alignRad = baseStyleXform.rotRad;
  } else if (Number.isFinite(baseStyleXform.rotDeg)){
    alignRad = degToRad(baseStyleXform.rotDeg);
  } else {
    alignRad = 0;
  }
  const theta = bone.ang + alignRad + extraRotRad + Math.PI;

  const originalFilter = ctx.filter;
  const filter = applyFilter
    ? buildFilterString(originalFilter, opts.hsl)
    : (originalFilter && originalFilter !== '' ? originalFilter : 'none');
  const warp = opts.warp;
  ctx.save();
  ctx.filter = filter;
  if (warp && typeof warp === 'object'){
    const units = (warp.units || 'percent').toLowerCase();
    const pts = {
      tl: { x: -w / 2, y: -h / 2 },
      tr: { x:  w / 2, y: -h / 2 },
      br: { x:  w / 2, y:  h / 2 },
      bl: { x: -w / 2, y:  h / 2 },
      center: { x: 0, y: 0 }
    };
    const keys = ['tl','tr','br','bl','center'];
    const convert = (val, size) => {
      if (!Number.isFinite(val)) return 0;
      if (units === 'percent' || units === '%' || units === 'pct'){
        return val * size;
      }
      return val;
    };
    for (const key of keys){
      const spec = warp[key];
      if (!spec) continue;
      const dx = convert(spec.x ?? spec.ax ?? 0, w);
      const dy = convert(spec.y ?? spec.ay ?? 0, h);
      pts[key].x += dx;
      pts[key].y += dy;
    }
    const cosT = Math.cos(theta);
    const sinT = Math.sin(theta);
    const dest = {};
    for (const key of keys){
      const local = pts[key];
      const rx = local.x * cosT - local.y * sinT;
      const ry = local.x * sinT + local.y * cosT;
      dest[key] = { x: posX + rx, y: posY + ry };
    }
    drawWarpedImage(ctx, sourceImage, dest, w, h);
  } else {
    ctx.translate(posX, posY);
    ctx.rotate(theta);
    ctx.drawImage(sourceImage, -w/2, -h/2, w, h);
  }
  ctx.restore();
  return true;
}

export function renderSprites(ctx){
  const C = (window.CONFIG || {});
  const G = (window.GAME || {});
  const renderState = G.RENDER_STATE;
  const entities = Array.isArray(renderState?.entities) ? renderState.entities : [];
  if (!ctx || !entities.length) return;

  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showSprites === false) return; // Skip sprite rendering if disabled

  const camX = G.CAMERA?.x || 0;
  const zoom = Number.isFinite(G.CAMERA?.zoom) ? G.CAMERA.zoom : 1;
  const canvasHeight = ctx.canvas?.height || 0;
  const zOf = buildZMap(C);

  ctx.save();
  ctx.setTransform(zoom, 0, 0, zoom, -zoom * camX, canvasHeight * (1 - zoom));

  for (const entity of entities) {
    if (!entity) continue;
    const fighterName = entity.fighterName || pickFighterName(C);
    const rig = entity.bones || G.ANCHORS_OBJ?.[entity.id];
    if (!rig) continue;

    const flipLeft = entity.flipLeft != null
      ? !!entity.flipLeft
      : !!(G.FLIP_STATE && entity.id && G.FLIP_STATE[entity.id]);
    const centerX = Number.isFinite(entity.centerX) ? entity.centerX : (rig.center?.x ?? 0);
    const animStyle = G.ANIM_STYLE_OVERRIDES?.[entity.id] || null;
    const animXform = animStyle?.xform || null;

    function applyAnimOptions(styleKey, baseOptions){
      if (!animXform) return baseOptions;
      const normalizedKey = normalizeStyleKey(styleKey);
      const entries = [];
      if (animXform[styleKey]) entries.push([styleKey, animXform[styleKey]]);
      if (normalizedKey && normalizedKey !== styleKey && animXform[normalizedKey]) {
        entries.push([normalizedKey, animXform[normalizedKey]]);
      }
      if (!entries.length) return baseOptions;
      const nextOptions = baseOptions ? { ...baseOptions } : {};
      const baseStyleOverride = (baseOptions && baseOptions.styleOverride)
        ? { ...baseOptions.styleOverride }
        : {};
      const xform = baseStyleOverride.xform ? { ...baseStyleOverride.xform } : {};
      for (const [key, spec] of entries){
        xform[key] = { ...(xform[key] || {}), ...spec };
      }
      baseStyleOverride.xform = xform;
      nextOptions.styleOverride = baseStyleOverride;
      return nextOptions;
    }

    const overrides = buildSpriteOverrides(entity.profile || {});
    const { assets, style, offsets, cosmetics, bodyColors, untintedOverlays: activeUntintedOverlays } = ensureFighterSprites(C, fighterName, overrides);
    const overlayMap = activeUntintedOverlays || {};

    ctx.save();
    if (flipLeft) {
      ctx.translate(centerX * 2, 0);
      ctx.scale(-1, 1);
    }

    const queue = [];
    function enqueue(tag, drawFn){ queue.push({ z: zOf(tag), tag, drawFn }); }

    // RENDER.MIRROR flags control per-limb mirroring (e.g., for attack animations)
    const getMirror = getMirrorFlag;

    function makeTintOptions(asset){
      if (!asset || !bodyColors) return undefined;
      const spec = asset.bodyColor || asset.bodyColors;
      const letters = Array.isArray(spec) ? spec : (spec != null ? [spec] : []);
      for (const entry of letters){
        const key = String(entry || '').trim().toUpperCase();
        if (!key) continue;
        const tint = bodyColors[key];
        if (tint){
          return { hsl: { ...tint } };
        }
      }
      return undefined;
    }

    function drawUntintedOverlays(partKey, bone, styleKey){
      const overlays = overlayMap[partKey];
      if (!overlays || overlays.length === 0) return;
      for (const overlay of overlays){
        const key = overlay?.styleKey || styleKey;
        const overlayOptions = applyAnimOptions(key, overlay?.options || undefined);
        drawBoneSprite(ctx, overlay?.asset, bone, key, style, offsets, overlayOptions);
      }
    }

    // Torso & head
    enqueue('TORSO', ()=>{
      if (assets.torso && rig.torso){
        const torsoOptions = applyAnimOptions('torso', makeTintOptions(assets.torso));
        drawBoneSprite(ctx, assets.torso, rig.torso, 'torso', style, offsets, torsoOptions);
        drawUntintedOverlays('torso', rig.torso, 'torso');
      }
    });
    enqueue('HEAD', ()=>{
      if (assets.head && rig.head){
        const headOptions = applyAnimOptions('head', makeTintOptions(assets.head));
        drawBoneSprite(ctx, assets.head, rig.head, 'head', style, offsets, headOptions);
        drawUntintedOverlays('head', rig.head, 'head');
      }
    });

    // Left arm
    const lArmUpper = rig.arm_L_upper;
    const lArmLower = rig.arm_L_lower;
    const lArmMirror = getMirror('ARM_L_UPPER') || getMirror('ARM_L_LOWER');
    if (lArmUpper) {
      enqueue('ARM_L_UPPER', ()=> {
        const originX = lArmUpper.x;
        const armUpperOptions = applyAnimOptions('arm_L_upper', makeTintOptions(assets.arm_L_upper));
        withBranchMirror(ctx, originX, lArmMirror, ()=> {
          drawBoneSprite(ctx, assets.arm_L_upper, lArmUpper, 'arm_L_upper', style, offsets, armUpperOptions);
          drawUntintedOverlays('arm_L_upper', lArmUpper, 'arm_L_upper');
        });
      });
    }
    if (lArmLower) {
      enqueue('ARM_L_LOWER', ()=> {
        const originX = lArmUpper?.x ?? lArmLower.x;
        const armLowerOptions = applyAnimOptions('arm_L_lower', makeTintOptions(assets.arm_L_lower));
        withBranchMirror(ctx, originX, lArmMirror, ()=> {
          drawBoneSprite(ctx, assets.arm_L_lower, lArmLower, 'arm_L_lower', style, offsets, armLowerOptions);
          drawUntintedOverlays('arm_L_lower', lArmLower, 'arm_L_lower');
        });
      });
    }

    // Right arm
    const rArmUpper = rig.arm_R_upper;
    const rArmLower = rig.arm_R_lower;
    const rArmMirror = getMirror('ARM_R_UPPER') || getMirror('ARM_R_LOWER');
    if (rArmUpper) {
      enqueue('ARM_R_UPPER', ()=> {
        const originX = rArmUpper.x;
        const armUpperOptions = applyAnimOptions('arm_R_upper', makeTintOptions(assets.arm_R_upper));
        withBranchMirror(ctx, originX, rArmMirror, ()=> {
          drawBoneSprite(ctx, assets.arm_R_upper, rArmUpper, 'arm_R_upper', style, offsets, armUpperOptions);
          drawUntintedOverlays('arm_R_upper', rArmUpper, 'arm_R_upper');
        });
      });
    }
    if (rArmLower) {
      enqueue('ARM_R_LOWER', ()=> {
        const originX = rArmUpper?.x ?? rArmLower.x;
        const armLowerOptions = applyAnimOptions('arm_R_lower', makeTintOptions(assets.arm_R_lower));
        withBranchMirror(ctx, originX, rArmMirror, ()=> {
          drawBoneSprite(ctx, assets.arm_R_lower, rArmLower, 'arm_R_lower', style, offsets, armLowerOptions);
          drawUntintedOverlays('arm_R_lower', rArmLower, 'arm_R_lower');
        });
      });
    }

    // Left leg
    const lLegUpper = rig.leg_L_upper;
    const lLegLower = rig.leg_L_lower;
    const lLegMirror = getMirror('LEG_L_UPPER') || getMirror('LEG_L_LOWER');
    if (lLegUpper) {
      enqueue('LEG_L_UPPER', ()=> {
        const originX = lLegUpper.x;
        withBranchMirror(ctx, originX, lLegMirror, ()=> {
          const legUpperOptions = applyAnimOptions('leg_L_upper', makeTintOptions(assets.leg_L_upper));
          drawBoneSprite(ctx, assets.leg_L_upper, lLegUpper, 'leg_L_upper', style, offsets, legUpperOptions);
          drawUntintedOverlays('leg_L_upper', lLegUpper, 'leg_L_upper');
        });
      });
    }
    if (lLegLower) {
      enqueue('LEG_L_LOWER', ()=> {
        const originX = lLegUpper?.x ?? lLegLower.x;
        withBranchMirror(ctx, originX, lLegMirror, ()=> {
          const legLowerOptions = applyAnimOptions('leg_L_lower', makeTintOptions(assets.leg_L_lower));
          drawBoneSprite(ctx, assets.leg_L_lower, lLegLower, 'leg_L_lower', style, offsets, legLowerOptions);
          drawUntintedOverlays('leg_L_lower', lLegLower, 'leg_L_lower');
        });
      });
    }

    // Right leg
    const rLegUpper = rig.leg_R_upper;
    const rLegLower = rig.leg_R_lower;
    const rLegMirror = getMirror('LEG_R_UPPER') || getMirror('LEG_R_LOWER');
    if (rLegUpper) {
      enqueue('LEG_R_UPPER', ()=> {
        const originX = rLegUpper.x;
        withBranchMirror(ctx, originX, rLegMirror, ()=> {
          const legUpperOptions = applyAnimOptions('leg_R_upper', makeTintOptions(assets.leg_R_upper));
          drawBoneSprite(ctx, assets.leg_R_upper, rLegUpper, 'leg_R_upper', style, offsets, legUpperOptions);
          drawUntintedOverlays('leg_R_upper', rLegUpper, 'leg_R_upper');
        });
      });
    }
    if (rLegLower) {
      enqueue('LEG_R_LOWER', ()=> {
        const originX = rLegUpper?.x ?? rLegLower.x;
        withBranchMirror(ctx, originX, rLegMirror, ()=> {
          const legLowerOptions = applyAnimOptions('leg_R_lower', makeTintOptions(assets.leg_R_lower));
          drawBoneSprite(ctx, assets.leg_R_lower, rLegLower, 'leg_R_lower', style, offsets, legLowerOptions);
          drawUntintedOverlays('leg_R_lower', rLegLower, 'leg_R_lower');
        });
      });
    }

    const activeWeaponKey = entity.profile?.weapon
      || entity.profile?.character?.weapon
      || (entity.profile?.characterKey && C.characters?.[entity.profile.characterKey]?.weapon)
      || null;
    const weaponConfig = activeWeaponKey && C.weapons ? C.weapons[activeWeaponKey] : null;
    if (weaponConfig && weaponConfig.sprite) {
      const spriteLayers = Array.isArray(weaponConfig.sprite.layers)
        ? weaponConfig.sprite.layers
        : [weaponConfig.sprite];
      spriteLayers.forEach((layerSpec = {}, layerIndex) => {
        if (!layerSpec || typeof layerSpec !== 'object') return;
        const anchorKey = layerSpec.anchorBone || layerSpec.bone || `weapon_${layerIndex}`;
        const bone = rig[anchorKey];
        if (!bone) return;
        const asset = ensureWeaponSpriteAsset(activeWeaponKey || anchorKey, layerSpec);
        if (!asset) return;
        const layerTag = String(layerSpec.layerTag || 'WEAPON').toUpperCase();
        const styleKey = layerSpec.styleKey || anchorKey;
        const weaponStyle = layerSpec.style ? mergeSpriteStyles(style, layerSpec.style) : style;
        const options = {};
        if (layerSpec.alignRad != null) {
          options.alignRad = layerSpec.alignRad;
        } else if (Number.isFinite(layerSpec.alignDeg)) {
          options.alignDeg = layerSpec.alignDeg;
        }
        if (layerSpec.anchorMode) options.anchorMode = layerSpec.anchorMode;
        if (layerSpec.anchorOverride) options.anchorOverride = layerSpec.anchorOverride;
        if (layerSpec.warp) options.warp = layerSpec.warp;
        if (layerSpec.hsl) options.hsl = layerSpec.hsl;
        if (layerSpec.styleOverride) {
          options.styleOverride = { ...layerSpec.styleOverride };
        }

        enqueue(layerTag, ()=>{
          drawBoneSprite(ctx, asset, bone, styleKey, weaponStyle, offsets, options);
        });
      });
    }

    if (Array.isArray(cosmetics)){
      for (const layer of cosmetics){
        const bone = rig[layer.partKey];
        if (!bone) continue;
        const baseTag = tagOf(layer.partKey);
        const slotTag = cosmeticTagFor(baseTag, layer.slot, layer.position);
        const styleKey = layer.styleKey || layer.partKey;
        const { mirror, originX } = resolveCosmeticMirror(rig, layer.partKey, bone);
        enqueue(slotTag, ()=>{
          withBranchMirror(ctx, originX, mirror, ()=>{
            drawBoneSprite(ctx, layer.asset, bone, styleKey, style, offsets, applyAnimOptions(styleKey, {
              styleOverride: layer.styleOverride,
              hsl: layer.hsl ?? layer.hsv,
              warp: layer.warp,
              alignRad: layer.alignRad,
              alignDeg: layer.alignRad == null ? layer.alignDeg : undefined,
              palette: layer.palette
            }));
          });
        });
      }
    }

    queue.sort((a, b) => a.z - b.z);

    for (const entry of queue){
      if (typeof entry?.drawFn === 'function'){
        entry.drawFn();
      }
    }

    ctx.restore();
  }

  ctx.restore();
}

export function initSprites(){
  const C = (window.CONFIG || {});
  const fname = pickFighterName(C);
  const f = C.fighters?.[fname];
  const S = (f?.sprites)||{};
  resolveSpriteAssets(S);
  console.log('[sprites] ready (anchor/xform/rotation/mirror fixed) for', fname);
}

// Asset loader
function resolveSpriteAssets(spriteMap){
  for (const [k, cfg] of Object.entries(spriteMap)){
    if (cfg && cfg.url){
      if (!cfg.img || cfg.img.src !== cfg.url){
        cfg.img = load(cfg.url);
      }
      // cfg.alignRad can be set per asset if needed
    }
  }
}

function resolveUntintedOverlayMap(fighterConfig = {}, spriteMap = {}){
  const source = fighterConfig.untintedOverlays
    || fighterConfig.sprites?.untintedOverlays
    || fighterConfig.sprites?.untinted_regions;
  if (!source) return {};

  const entries = Array.isArray(source)
    ? source
    : Object.values(source);

  const map = {};

  for (const entry of entries){
    if (!entry || typeof entry !== 'object') continue;

    const parts = ensureArray(entry.parts || entry.part || entry.targets || entry.target);
    if (!parts.length) continue;

    const url = entry.url || entry.href;
    if (!url || typeof url !== 'string') continue;

    const asset = entry.asset && typeof entry.asset === 'object'
      ? entry.asset
      : { url };
    if (!asset.img || asset.img.src !== url){
      asset.img = load(url);
    }

    const alignRad = Number.isFinite(entry.alignRad)
      ? entry.alignRad
      : (Number.isFinite(entry.alignDeg) ? degToRad(entry.alignDeg) : undefined);

    const baseOptions = {};
    if (Number.isFinite(alignRad)){
      baseOptions.alignRad = alignRad;
    }
    if (entry.anchorMode != null){
      baseOptions.anchorMode = entry.anchorMode;
    }
    if (entry.styleOverride){
      baseOptions.styleOverride = entry.styleOverride;
    }
    if (entry.warp){
      baseOptions.warp = entry.warp;
    }

    for (const rawPart of parts){
      const partKey = String(rawPart || '').trim();
      if (!partKey) continue;
      const list = map[partKey] || (map[partKey] = []);
      const options = { ...baseOptions };
      if (!Number.isFinite(options.alignRad)){
        const baseAsset = spriteMap?.[partKey];
        if (Number.isFinite(baseAsset?.alignRad)){
          options.alignRad = baseAsset.alignRad;
        }
      }
      list.push({
        asset,
        styleKey: entry.styleKey,
        options
      });
    }
  }

  return map;
}

// Interface for external logic
export function ensureFighterSprites(C, fname, overrides = {}){
  const f = C.fighters?.[fname] || {};
  const S = f.sprites || {};
  for (const k in S){
    resolveSpriteAssets(S);
  }
  // Look for style in fighter config first (both f.spriteStyle and f.sprites.style), then fallback to global
  const style = f.spriteStyle || f.sprites?.style || C.spriteStyle || {};
  const offsets = f.spriteOffsets || C.spriteOffsets || {};
  
  // Convert rotDeg from xform config to alignRad on each sprite asset
  const xform = style.xform || {};
  for (const boneKey in S) {
    const asset = S[boneKey];
    if (asset && asset.url) {
      const styleKey = styleKeyOf(boneKey);
      const xformData = xform[styleKey];
      if (xformData && typeof xformData.rotDeg === 'number') {
        // Convert degrees to radians and store as alignRad
        asset.alignRad = degToRad(xformData.rotDeg);
      } else if (asset.alignRad === undefined) {
        // Default to 0 if not set
        asset.alignRad = 0;
      }
    }
  }

  const overrideBodyColors = normalizeBodyColorOverride(overrides.bodyColors);
  const cosmeticsOverride = Array.isArray(overrides.cosmeticLayers) ? overrides.cosmeticLayers : null;
  const untintedOverride = overrides.untintedOverlays || null;
  const overrideCharacterKey = overrides.characterKey || null;
  const overrideCharacterData = overrides.characterData && typeof overrides.characterData === 'object'
    ? overrides.characterData
    : null;

  const cosmetics = cosmeticsOverride ?? ensureCosmeticLayers(C, fname, style, {
    characterKey: overrideCharacterKey,
    characterData: overrideCharacterData,
  });
  const bodyColors = overrideBodyColors ?? resolveFighterBodyColors(C, fname);
  const untintedOverlays = resolveUntintedOverlayMap(f, S);
  const appliedUntintedOverlays = untintedOverride || untintedOverlays;

  const result = { assets: S, style, offsets, cosmetics, bodyColors, untintedOverlays: appliedUntintedOverlays };
  ensureFighterSprites.__lastResult = result;
  return result;
}
