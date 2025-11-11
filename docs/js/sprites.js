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
import { COSMETIC_SLOTS, ensureCosmeticLayers, cosmeticTagFor } from './cosmetics.js?v=1';

const ASSETS = (window.ASSETS ||= {});
const CACHE = (ASSETS.sprites ||= {});
const FAILED = (ASSETS.failedSprites ||= new Set());
const GLOB = (window.GAME ||= {});
const RENDER = (window.RENDER ||= {});
RENDER.MIRROR = RENDER.MIRROR || {}; // Initialize per-limb mirror flags

const HSV_TINT_CACHE = new WeakMap();

function hsvKey(hsv){
  if (!hsv) return '0|0|0';
  const h = Number.isFinite(hsv.h) ? hsv.h : 0;
  const s = Number.isFinite(hsv.s) ? hsv.s : 0;
  const v = Number.isFinite(hsv.v) ? hsv.v : 0;
  return `${h.toFixed(4)}|${s.toFixed(4)}|${v.toFixed(4)}`;
}

function createTintCanvas(width, height){
  if (typeof OffscreenCanvas === 'function'){
    try {
      const canvas = new OffscreenCanvas(width, height);
      return canvas;
    } catch (err) {
      // Fall back to DOM canvas
    }
  }
  if (typeof document !== 'undefined' && typeof document.createElement === 'function'){
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  return null;
}

function rgbToHsv(r, g, b){
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;
  let h = 0;
  if (delta){
    switch(max){
      case rn:
        h = ((gn - bn) / delta) % 6;
        break;
      case gn:
        h = (bn - rn) / delta + 2;
        break;
      default:
        h = (rn - gn) / delta + 4;
        break;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
}

function hsvToRgb(h, s, v){
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0, g = 0, b = 0;
  if (h >= 0 && h < 60){
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120){
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180){
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240){
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300){
    r = x; g = 0; b = c;
  } else {
    r = c; g = 0; b = x;
  }
  return {
    r: Math.round((r + m) * 255),
    g: Math.round((g + m) * 255),
    b: Math.round((b + m) * 255)
  };
}

function tintImageWithHSV(img, hsv){
  if (!img || img.__broken) return img;
  if (!(Number.isFinite(img.naturalWidth) ? img.naturalWidth : img.width)) return img;
  if (!hsv || (!Number.isFinite(hsv.h) && !Number.isFinite(hsv.s) && !Number.isFinite(hsv.v))){
    return img;
  }
  if (!img.complete || (img.naturalWidth || img.width || 0) === 0 || (img.naturalHeight || img.height || 0) === 0){
    return img;
  }

  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!(width > 0 && height > 0)) return img;

  const key = hsvKey(hsv);
  let cacheForImage = HSV_TINT_CACHE.get(img);
  if (!cacheForImage){
    cacheForImage = new Map();
    HSV_TINT_CACHE.set(img, cacheForImage);
  }
  if (cacheForImage.has(key)){
    return cacheForImage.get(key);
  }

  const hueShift = Number.isFinite(hsv.h) ? hsv.h : 0;
  const satFactor = Number.isFinite(hsv.s) ? Math.max(0, 1 + hsv.s) : 1;
  const valFactor = Number.isFinite(hsv.v) ? Math.max(0, 1 + hsv.v) : 1;

  if (hueShift === 0 && satFactor === 1 && valFactor === 1){
    cacheForImage.set(key, img);
    return img;
  }

  const canvas = createTintCanvas(width, height);
  if (!canvas) {
    cacheForImage.set(key, img);
    return img;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    cacheForImage.set(key, img);
    return img;
  }
  ctx.clearRect(0, 0, width, height);
  try {
    ctx.drawImage(img, 0, 0, width, height);
  } catch (err) {
    cacheForImage.set(key, img);
    return img;
  }
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, width, height);
  } catch (err) {
    cacheForImage.set(key, img);
    return img;
  }
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4){
    const alpha = data[i + 3];
    if (alpha === 0) continue;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const { h, s, v } = rgbToHsv(r, g, b);
    let newH = (h + hueShift) % 360;
    if (newH < 0) newH += 360;
    let newS = s * satFactor;
    if (newS < 0) newS = 0;
    if (newS > 1) newS = 1;
    let newV = v * valFactor;
    if (newV < 0) newV = 0;
    if (newV > 1) newV = 1;
    const { r: nr, g: ng, b: nb } = hsvToRgb(newH, newS, newV);
    data[i] = nr;
    data[i + 1] = ng;
    data[i + 2] = nb;
  }
  ctx.putImageData(imageData, 0, 0);
  cacheForImage.set(key, canvas);
  return canvas;
}

function hasHsvAdjustments(hsv){
  if (!hsv) return false;
  return (Number.isFinite(hsv.h) && hsv.h !== 0)
    || (Number.isFinite(hsv.s) && hsv.s !== 0)
    || (Number.isFinite(hsv.v) && hsv.v !== 0);
}

function prepareImageForHSV(img, hsv){
  if (!hasHsvAdjustments(hsv)){
    return { image: img, applyFilter: false };
  }
  const tinted = tintImageWithHSV(img, hsv);
  if (tinted && tinted !== img){
    return { image: tinted, applyFilter: false };
  }
  return { image: img, applyFilter: true };
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

// Render order: use CONFIG.render.order if available; else fallback
function buildZMap(C){
  const def = ['HITBOX','ARM_L_UPPER','ARM_L_LOWER','LEG_L_LOWER','LEG_L_UPPER','TORSO','HEAD','LEG_R_LOWER','LEG_R_UPPER','ARM_R_UPPER','ARM_R_LOWER'];
  const baseOrder = (C.render && Array.isArray(C.render.order) && C.render.order.length) ? C.render.order.map(s=>String(s).toUpperCase()) : def;
  const expanded = [];
  for (const tag of baseOrder){
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
    out.xform = { ...(base.xform || {}), ...overrides.xform };
  }
  return out;
}

function buildFilterString(baseFilter, hsv){
  const filters = [];
  if (baseFilter && baseFilter !== 'none'){
    filters.push(baseFilter);
  }
  if (hsv){
    if (Number.isFinite(hsv.h)){
      filters.push(`hue-rotate(${hsv.h}deg)`);
    }
    if (Number.isFinite(hsv.s)){
      const sat = Math.max(0, 1 + hsv.s);
      filters.push(`saturate(${sat})`);
    }
    if (Number.isFinite(hsv.v)){
      const bright = Math.max(0, 1 + hsv.v);
      filters.push(`brightness(${bright})`);
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

function drawBoneSprite(ctx, asset, bone, styleKey, style, offsets){
  const options = arguments[6] || {};
  const img = asset?.img;
  if (!img || img.__broken) return false;
  if (!img.complete) return false;
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return false;

  const { image: renderImage, applyFilter } = prepareImageForHSV(img, options.hsv);
  const sourceImage = renderImage || img;

  // Normalize styleKey: arm_L_upper -> armUpper, leg_R_lower -> legLower
  // Convert underscore format with optional side marker (L/R) to camelCase used by style configs
  function normalizeStyleKey(k){
    if (!k || typeof k !== 'string') return k;
    const parts = k.split('_');
    // If format is like ['arm','L','upper'] remove the side marker
    if (parts.length === 3 && (parts[1] === 'L' || parts[1] === 'R')) {
      parts.splice(1,1);
    }
    // Join into camelCase: first part lower, rest capitalized
    return parts.map((p,i)=> i===0 ? p : (p.charAt(0).toUpperCase() + p.slice(1)) ).join('');
  }
  const normalizedKey = normalizeStyleKey(styleKey);

  // Get anchor config: anchors at bone midpoint by default
  const effectiveStyle = mergeSpriteStyles(style, options.styleOverride);
  const anchorCfg = effectiveStyle.anchor || {};
  const anchorMode = anchorCfg[styleKey] || 'mid';
  const resolvedAnchorMode = (options.anchorMode != null)
    ? options.anchorMode
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
  const xform = (effectiveStyle.xform || {})[normalizedKey] || (effectiveStyle.xform || {})[styleKey] || {};
  const xformUnits = (effectiveStyle.xformUnits || 'px').toLowerCase();

  let ax = xform.ax ?? 0;
  let ay = xform.ay ?? 0;
  if (xformUnits === 'percent' || xformUnits === '%' || xformUnits === 'pct') {
    ax *= bone.len;
    ay *= bone.len;
  }
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

  // Rotation (fixed): bone.ang + alignRad + Math.PI
  const alignRad = (options.alignRad != null)
    ? options.alignRad
    : (options.alignDeg != null ? degToRad(options.alignDeg) : (asset.alignRad ?? 0));
  const theta = bone.ang + alignRad + Math.PI;

  const originalFilter = ctx.filter;
  const filter = applyFilter
    ? buildFilterString(originalFilter, options.hsv)
    : (originalFilter && originalFilter !== '' ? originalFilter : 'none');
  const warp = options.warp;
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
  const fname = pickFighterName(C);
  const rig = getBones(C, GLOB, fname);
  if (!rig) return;

  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showSprites === false) return; // Skip sprite rendering if disabled
  
  // Get flip state and center from render.js computed data
  // rig is G.ANCHORS_OBJ.player (just the B bones object)
  // flipLeft is stored separately in G.FLIP_STATE by render.js
  const entity = (fname === 'player' || fname === 'npc') ? fname : 'player';
  const flipLeft = G.FLIP_STATE?.[entity] || false;
  const centerX = rig.center?.x ?? 0;
  
  ctx.save();
  // Mirror around character center when facing left (matching reference HTML exactly)
  if (flipLeft) {
    ctx.translate(centerX * 2, 0);
    ctx.scale(-1, 1);
  }

  // RENDER.MIRROR flags control per-limb mirroring (e.g., for attack animations)
  
  const { assets, style, offsets, cosmetics } = ensureFighterSprites(C, fname);

  const zOf = buildZMap(C);
  const queue = [];
  function enqueue(tag, drawFn){ queue.push({ z: zOf(tag), tag, drawFn }); }

  // Helper to get mirror flag for a specific part
  const getMirror = getMirrorFlag;

  // Hitbox (if desired)
  // enqueue('HITBOX', ()=> { /* draw hitbox if needed */ });

  // Torso & head
  enqueue('TORSO', ()=>{
    if (assets.torso && rig.torso){
      drawBoneSprite(ctx, assets.torso, rig.torso, 'torso', style, offsets);
    }
  });
  enqueue('HEAD', ()=>{
    if (assets.head && rig.head){
      drawBoneSprite(ctx, assets.head, rig.head, 'head', style, offsets);
    }
  });

  // Left arm - enqueue upper and lower separately (matching reference)
  const lArmUpper = rig.arm_L_upper;
  const lArmLower = rig.arm_L_lower;
  const lArmMirror = getMirror('ARM_L_UPPER') || getMirror('ARM_L_LOWER');
  if (lArmUpper) {
    enqueue('ARM_L_UPPER', ()=> {
      const originX = lArmUpper.x;
      withBranchMirror(ctx, originX, lArmMirror, ()=> {
        drawBoneSprite(ctx, assets.arm_L_upper, lArmUpper, 'arm_L_upper', style, offsets);
      });
    });
  }
  if (lArmLower) {
    enqueue('ARM_L_LOWER', ()=> {
      const originX = lArmUpper?.x ?? lArmLower.x;
      withBranchMirror(ctx, originX, lArmMirror, ()=> {
        drawBoneSprite(ctx, assets.arm_L_lower, lArmLower, 'arm_L_lower', style, offsets);
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
      withBranchMirror(ctx, originX, rArmMirror, ()=> {
        drawBoneSprite(ctx, assets.arm_R_upper, rArmUpper, 'arm_R_upper', style, offsets);
      });
    });
  }
  if (rArmLower) {
    enqueue('ARM_R_LOWER', ()=> {
      const originX = rArmUpper?.x ?? rArmLower.x;
      withBranchMirror(ctx, originX, rArmMirror, ()=> {
        drawBoneSprite(ctx, assets.arm_R_lower, rArmLower, 'arm_R_lower', style, offsets);
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
        drawBoneSprite(ctx, assets.leg_L_upper, lLegUpper, 'leg_L_upper', style, offsets);
      });
    });
  }
  if (lLegLower) {
    enqueue('LEG_L_LOWER', ()=> {
      const originX = lLegUpper?.x ?? lLegLower.x;
      withBranchMirror(ctx, originX, lLegMirror, ()=> {
        drawBoneSprite(ctx, assets.leg_L_lower, lLegLower, 'leg_L_lower', style, offsets);
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
        drawBoneSprite(ctx, assets.leg_R_upper, rLegUpper, 'leg_R_upper', style, offsets);
      });
    });
  }
  if (rLegLower) {
    enqueue('LEG_R_LOWER', ()=> {
      const originX = rLegUpper?.x ?? rLegLower.x;
      withBranchMirror(ctx, originX, rLegMirror, ()=> {
        drawBoneSprite(ctx, assets.leg_R_lower, rLegLower, 'leg_R_lower', style, offsets);
      });
    });
  }

  if (Array.isArray(cosmetics)){
    for (const layer of cosmetics){
      const bone = rig[layer.partKey];
      if (!bone) continue;
      const baseTag = tagOf(layer.partKey);
      const slotTag = cosmeticTagFor(baseTag, layer.slot);
      const styleKey = layer.styleKey || layer.partKey;
      const { mirror, originX } = resolveCosmeticMirror(rig, layer.partKey, bone);
      enqueue(slotTag, ()=>{
        withBranchMirror(ctx, originX, mirror, ()=>{
          drawBoneSprite(ctx, layer.asset, bone, styleKey, style, offsets, {
            styleOverride: layer.styleOverride,
            hsv: layer.hsv,
            warp: layer.warp,
            alignRad: layer.alignRad,
            alignDeg: layer.alignRad == null ? layer.alignDeg : undefined
          });
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
  
  ctx.restore(); // Restore canvas state (undo flip if applied)
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

// Interface for external logic
export function ensureFighterSprites(C, fname){
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
  
  const cosmetics = ensureCosmeticLayers(C, fname, style);

  return { assets: S, style, offsets, cosmetics };
}
