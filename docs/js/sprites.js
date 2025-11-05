// sprites.js — v20-derived drawing logic with full anchor/xform support
// Exports: initSprites(), renderSprites(ctx), mirror API
//
// This implementation matches khy-stage-game-v20.html behavior:
// - anchors sprites at bone midpoint by default, or bone start if config specifies
// - sizes sprite height to bone.len and scales width by aspect ratio and widthFactor
// - applies xform offsets (ax, ay) with percent units (multiply by bone.len)
// - applies xform scales (scaleX, scaleY) to computed dimensions
// - applies rotation: bone.ang + rotDeg + alignRad + Math.PI
// - global facing flip for walk; branch-level mirroring controlled by RENDER.MIRROR flags

const ASSETS = (window.ASSETS ||= {});
const CACHE = (ASSETS.sprites ||= {});
const FAILED = (ASSETS.failedSprites ||= new Set());
const GLOB = (window.GAME ||= {});
const RENDER = (window.RENDER ||= {});

// Legacy support: map old hideSprites to new RENDER_DEBUG
if (typeof RENDER.hideSprites === 'boolean') {
  if (typeof window !== 'undefined') {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showSprites = !RENDER.hideSprites;
  }
}

RENDER.MIRROR ||= {}; // per-part mirror flags like 'ARM_L_UPPER': true

function angleZero(){ return 'up'; }
function spriteAngleZero(){ return 'up'; }
function basisFor(ang){
  const fn = (typeof window !== 'undefined' && typeof window.BONE_BASIS === 'function') ? window.BONE_BASIS : null;
  if (fn) return fn(ang);
  const c = Math.cos(ang), s = Math.sin(ang);
  return { fx:s, fy:-c, rx:c, ry:s };
}
function rad(deg){ return (deg||0) * Math.PI / 180; }
function dist(a,b){ const dx=b[0]-a[0], dy=b[1]-a[1]; return Math.sqrt(dx*dx+dy*dy); }
function angle(a,b){
  const dx = b[0]-a[0];
  const dy = b[1]-a[1];
  const fn = (typeof window !== 'undefined' && typeof window.BONE_ANGLE_FROM_DELTA === 'function') ? window.BONE_ANGLE_FROM_DELTA : null;
  if (fn) return fn(dx, dy);
  return Math.atan2(dx, -dy);
}
function withAX(x,y,ang,ax,ay,unitsLen){
  const L=(unitsLen||1);
  const u=(ax||0)*L, v=(ay||0)*L;
  const b = basisFor(ang);
  const dx = u*b.fx + v*b.rx;
  const dy = u*b.fy + v*b.ry;
  return [x+dx,y+dy];
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

function pickFighterName(C){ if(GLOB.selectedFighter && C.fighters?.[GLOB.selectedFighter]) return GLOB.selectedFighter; if (C.fighters?.TLETINGAN) return 'TLETINGAN'; const k=Object.keys(C.fighters||{}); return k.length?k[0]:'default'; }

function getBones(C,G,fname){
  const AO = G.ANCHORS_OBJ?.player;
  if (AO){
    return {
      torso: AO.torso, head: AO.head,
      arm_L_upper: AO.arm_L_upper, arm_L_lower: AO.arm_L_lower,
      arm_R_upper: AO.arm_R_upper, arm_R_lower: AO.arm_R_lower,
      leg_L_upper: AO.leg_L_upper, leg_L_lower: AO.leg_L_lower,
      leg_R_upper: AO.leg_R_upper, leg_R_lower: AO.leg_R_lower
    };
  }
  const A = G.ANCHORS?.player;
  if (A){
    const torsoStart=A.torsoBot, torsoEnd=A.torsoTop;
    const lUpStart=A.lShoulderBase, lElbow=A.lElbow, lHand=A.lHand;
    const rUpStart=A.rShoulderBase, rElbow=A.rElbow, rHand=A.rHand;
    const lHipStart=A.lHipBase, lKnee=A.lKnee, lFoot=A.lFoot;
    const rHipStart=A.rHipBase, rKnee=A.rKnee, rFoot=A.rFoot;
    const headStart=A.neckBase || A.torsoTop;
    function boneFrom(s,e){ const len=dist(s,e); const ang=angle(s,e); return {x:s[0],y:s[1],len,ang}; }
    const torso = boneFrom(torsoStart, torsoEnd);
    const fcfg = (C.fighters?.[fname]) || {};
    const headNeck=(fcfg.parts?.head?.neck ?? C.parts?.head?.neck ?? 14)*(C.actor?.scale ?? 1)*(fcfg.actor?.scale ?? 1);
    const headRad =(fcfg.parts?.head?.radius?? C.parts?.head?.radius?? 16)*(C.actor?.scale ?? 1)*(fcfg.actor?.scale ?? 1);
    const headLen=headNeck+2*headRad;
    return {
      torso,
      head:{x:headStart[0],y:headStart[1],len:headLen,ang:torso.ang},
      arm_L_upper:boneFrom(lUpStart,lElbow),
      arm_L_lower:boneFrom(lElbow,lHand),
      arm_R_upper:boneFrom(rUpStart,rElbow),
      arm_R_lower:boneFrom(rElbow,rHand),
      leg_L_upper:boneFrom(lHipStart,lKnee),
      leg_L_lower:boneFrom(lKnee,lFoot),
      leg_R_upper:boneFrom(rHipStart,rKnee),
      leg_R_lower:boneFrom(rKnee,rFoot)
    };
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
      return Math.PI;
    default:
      return 0;
  }
}

// Render order: use CONFIG.render.order if available; else fallback
function buildZMap(C){
  const def = ['HITBOX','ARM_L_UPPER','ARM_L_LOWER','LEG_L_UPPER','LEG_L_LOWER','TORSO','HEAD','LEG_R_UPPER','LEG_R_LOWER','ARM_R_UPPER','ARM_R_LOWER'];
  const arr = (C.render && Array.isArray(C.render.order) && C.render.order.length) ? C.render.order.map(s=>String(s).toUpperCase()) : def;
  const m = new Map();
  arr.forEach((tag,i)=>m.set(tag, i));
  return (tag)=> (m.has(tag) ? m.get(tag) : 999);
}

// Read per-fighter sprite images & style
function parseSpriteSpec(spec){
  if (!spec) return { url: null, alignRad: null };
  if (typeof spec === 'string') return { url: spec, alignRad: null };
  if (typeof spec === 'object') {
    const url = spec.url || spec.src || spec.href || null;
    let alignRad = null;
    const degVal = spec.alignDeg ?? spec.align ?? null;
    const radVal = spec.alignRad;
    if (Number.isFinite(radVal)) {
      alignRad = radVal;
    } else if (degVal != null) {
      const num = Number(degVal);
      if (!Number.isNaN(num)) {
        alignRad = num * Math.PI / 180;
      }
    }
    return { url, alignRad };
  }
  return { url: null, alignRad: null };
}

function resolveSpriteAssets(spriteConf){
  function entry(spec){
    const info = parseSpriteSpec(spec);
    return { img: load(info.url), alignRad: info.alignRad };
  }

  const torso = entry(spriteConf.torso);
  const head = entry(spriteConf.head);
  const armUpper = entry(spriteConf.arm?.upper);
  const armLower = entry(spriteConf.arm?.lower);
  const legUpper = entry(spriteConf.leg?.upper);
  const legLower = entry(spriteConf.leg?.lower);

  return {
    torso,
    head,
    arm_L_upper: armUpper,
    arm_L_lower: armLower,
    arm_R_upper: armUpper,
    arm_R_lower: armLower,
    leg_L_upper: legUpper,
    leg_L_lower: legLower,
    leg_R_upper: legUpper,
    leg_R_lower: legLower
  };
}
function ensureFighterSprites(C,fname){
  const f = C.fighters?.[fname] || {};
  const S = (f.sprites) || {};
  const assets = resolveSpriteAssets(S);
  const legacyImgs = {};
  for (const key of Object.keys(assets)){
    legacyImgs[key] = assets[key]?.img || null;
  }
  return { assets, imgs: legacyImgs, style:(S.style||{}), offsets:(f.offsets||{}) };
}

function originOffset(styleKey, offsets){
  if (!offsets) return null;
  switch(styleKey){
    case 'torso': return offsets.torso?.origin || null;
    case 'head': return offsets.head?.origin || null;
    case 'armUpper': return offsets.arm?.upper?.origin || null;
    case 'armLower': return offsets.arm?.lower?.origin || null;
    case 'legUpper': return offsets.leg?.upper?.origin || null;
    case 'legLower': return offsets.leg?.lower?.origin || null;
    default: return null;
  }
}

const ORIENTATION_OFFSETS = {
  torso: Math.PI / 2,
  head: 0,
  armUpper: -Math.PI / 2,
  armLower: -Math.PI / 2,
  legUpper: Math.PI / 2,
  legLower: Math.PI / 2
};

function orientationOffsetFor(styleKey){
  return ORIENTATION_OFFSETS[styleKey] || 0;
}

// Branch-level mirror wrapper (as in v19)
function withBranchMirror(ctx, originX, mirror, drawFn){
  if (!mirror) return drawFn();
  ctx.save();
  ctx.translate(originX, 0);
  ctx.scale(-1, 1);
  ctx.translate(-originX, 0);
  try{ return drawFn(); } finally { ctx.restore(); }
}

function limbMirrorFlag(side, upperTag, lowerTag){
  const M = RENDER.MIRROR || {};
  return !!(M[upperTag] || M[lowerTag] || M[side==="L"? 'ARM_L' : 'ARM_R'] || M['ARM'] || M['ALL']);
}
function legMirrorFlag(side, upperTag, lowerTag){
  const M = RENDER.MIRROR || {};
  return !!(M[upperTag] || M[lowerTag] || M[side==="L"? 'LEG_L' : 'LEG_R'] || M['LEG'] || M['ALL']);
}

function drawArmBranch(ctx, rig, side, assets, style, offsets, segment = 'both'){
  const upKey = side==='L' ? 'arm_L_upper':'arm_R_upper';
  const loKey = side==='L' ? 'arm_L_lower':'arm_R_lower';
  const up = rig[upKey]; const lo = rig[loKey]; if (!up) return;
  const tagU = tagOf(upKey), tagL = tagOf(loKey);
  const mirror = limbMirrorFlag(side, tagU, tagL);
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

function drawLegBranch(ctx, rig, side, assets, style, offsets, segment = 'both'){
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

// drawBoneSprite — v20-derived logic with anchor, xform, offsets, and rotation
// Matches khy-stage-game-v20.html behavior:
// - anchors at bone midpoint by default, or bone start if config says "start"
// - sets sprite height to bone.len, width scaled by aspect ratio and widthFactor
// - applies xform offsets (ax, ay) with percent units (multiply by bone.len)
// - applies xform scales (scaleX, scaleY)
// - rotation: bone.ang + alignRad + Math.PI
// - returns true on successful draw, false otherwise
function drawBoneSprite(ctx, asset, bone, styleKey, style, offsets){
  const img = asset?.img;
  if (!img || img.__broken) return false;
  if (!img.complete) return false;
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return false;

  // Get anchor config: default to "mid", but use "start" if specified
  const anchorCfg = style.anchor || {};
  const anchorMode = anchorCfg[styleKey] || 'mid';
  
  // Calculate base position based on anchor mode
  const bAxis = basisFor(bone.ang);
  let posX, posY;
  if (anchorMode === 'start') {
    // Anchor at bone start
    posX = bone.x;
    posY = bone.y;
  } else {
    // Anchor at bone midpoint (default)
    posX = bone.x + bone.len * 0.5 * bAxis.fx;
    posY = bone.y + bone.len * 0.5 * bAxis.fy;
  }

  // Get xform config for sprite-specific offsets
  const xform = (style.xform || {})[styleKey] || {};
  const xformUnits = (style.xformUnits || 'px').toLowerCase();
  
  // Apply sprite offsets (ax, ay) with percent units support
  // These are additional offsets for sprite positioning, NOT bone joint offsets
  let ax = xform.ax ?? 0;
  let ay = xform.ay ?? 0;
  if (xformUnits === 'percent' || xformUnits === '%' || xformUnits === 'pct') {
    ax *= bone.len;
    ay *= bone.len;
  }
  
  // Apply offset in bone-local space
  const offsetX = ax * bAxis.fx + ay * bAxis.rx;
  const offsetY = ax * bAxis.fy + ay * bAxis.ry;
  posX += offsetX;
  posY += offsetY;  // Sizing: sprite height = bone length, width based on aspect ratio and widthFactor
  const nh = img.naturalHeight || img.height || 1;
  const nw = img.naturalWidth  || img.width  || 1;
  const baseH = Math.max(1, bone.len);
  const wfTbl = style.widthFactor || {};
  const wf = (wfTbl[styleKey] ?? wfTbl[styleKey?.replace(/_.*/, '')] ?? 1);
  let w = nw * (baseH / nh) * wf;
  let h = baseH;
  
  // Apply xform scales for sprite sizing
  const scaleX = xform.scaleX ?? 1;
  const scaleY = xform.scaleY ?? 1;
  w *= scaleX;
  h *= scaleY;

  // Rotation: bone.ang + alignRad + Math.PI
  // alignRad orients the sprite image, bone.ang is the bone direction, +Math.PI for canvas coords
  const alignRad = asset.alignRad ?? 0;
  const theta = bone.ang + alignRad + Math.PI;

  ctx.save();
  ctx.translate(posX, posY);
  ctx.rotate(theta);
  ctx.drawImage(img, -w/2, -h/2, w, h);
  ctx.restore();
  return true;
}

export function renderSprites(ctx){
  const C = (window.CONFIG || {});
  const fname = pickFighterName(C);
  const rig = getBones(C, GLOB, fname);
  if (!rig) return;
  
  // Check if sprites should be rendered
  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showSprites === false) {
    return; // Skip sprite rendering if disabled
  }
  
  const { assets, style, offsets } = ensureFighterSprites(C, fname);

  const zOf = buildZMap(C);
  const queue = [];
  function enqueue(tag, drawFn){ queue.push({ z: zOf(tag), tag, drawFn }); }

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
  enqueue('ARM_L_UPPER', ()=> drawArmBranch(ctx, rig, 'L', assets, style, offsets, 'upper'));
  enqueue('ARM_L_LOWER', ()=> drawArmBranch(ctx, rig, 'L', assets, style, offsets, 'lower'));
  enqueue('ARM_R_UPPER', ()=> drawArmBranch(ctx, rig, 'R', assets, style, offsets, 'upper'));
  enqueue('ARM_R_LOWER', ()=> drawArmBranch(ctx, rig, 'R', assets, style, offsets, 'lower'));
  enqueue('LEG_L_UPPER', ()=> drawLegBranch(ctx, rig, 'L', assets, style, offsets, 'upper'));
  enqueue('LEG_L_LOWER', ()=> drawLegBranch(ctx, rig, 'L', assets, style, offsets, 'lower'));
  enqueue('LEG_R_UPPER', ()=> drawLegBranch(ctx, rig, 'R', assets, style, offsets, 'upper'));
  enqueue('LEG_R_LOWER', ()=> drawLegBranch(ctx, rig, 'R', assets, style, offsets, 'lower'));

  queue.sort((a, b) => a.z - b.z);
  for (const entry of queue){
    if (typeof entry?.drawFn === 'function'){
      entry.drawFn();
    }
  }
}

export function initSprites(){
  const C = (window.CONFIG || {});
  const fname = pickFighterName(C);
  const f=C.fighters?.[fname];
  const S=(f?.sprites)||{};
  resolveSpriteAssets(S);
  console.log('[sprites] ready (v20-derived anchor/xform/rotation) for', fname);
}

// ==== MIRROR API (to be called by pose loader / combat events) ====
export function resetMirror(){ RENDER.MIRROR = {}; }
export function setMirrorForPart(part, val){
  if (!RENDER.MIRROR) RENDER.MIRROR = {};
  const M = RENDER.MIRROR;
  const map = {
    ALL:['TORSO','HEAD','ARM_L_UPPER','ARM_L_LOWER','ARM_R_UPPER','ARM_R_LOWER','LEG_L_UPPER','LEG_L_LOWER','LEG_R_UPPER','LEG_R_LOWER'],
    ARM:['ARM_L_UPPER','ARM_L_LOWER','ARM_R_UPPER','ARM_R_LOWER'],
    ARMUPPER:['ARM_L_UPPER','ARM_R_UPPER'], ARMLOWER:['ARM_L_LOWER','ARM_R_LOWER'],
    LEG:['LEG_L_UPPER','LEG_L_LOWER','LEG_R_UPPER','LEG_R_LOWER'],
    LEGUPPER:['LEG_L_UPPER','LEG_R_UPPER'], LEGLOWER:['LEG_L_LOWER','LEG_R_LOWER'],
    ARM_L:['ARM_L_UPPER','ARM_L_LOWER'], ARM_R:['ARM_R_UPPER','ARM_R_LOWER'],
    LEG_L:['LEG_L_UPPER','LEG_L_LOWER'], LEG_R:['LEG_R_UPPER','LEG_R_LOWER']
  };
  const key = String(part).toUpperCase();
  const list = map[key] || [key];
  for (const t of list){ M[t] = !!val; }
}
export function applyPoseMirror(poseName){
  const C = (window.CONFIG || {});
  const p = C.poses?.[poseName];
  if (!p || !p.mirror) return;
  for (const k of Object.keys(p.mirror)){ setMirrorForPart(k, !!p.mirror[k]); }
}
