// sprites.js — Full anchor/xform/rotation/mirror logic, fixed bone angle math (standard graphics coords: "right" = 0 radians)
// Exports: initSprites(), renderSprites(ctx), mirror API
//
// Matches khy-stage-game-v20.html behavior, with fixes:
// - Bones: 0 radians is "right"/east, angles counterclockwise
// - Sprites: anchored to bone midpoint by default, or bone start if config specifies
// - Sizing: sprite height is bone.len, width scales by aspect ratio and widthFactor
// - Offsets: (ax, ay) can be in percent units (multiply by bone.len) or px
// - Scales: scaleX, scaleY affect width/height
// - Rotation: bone.ang + alignRad (+ Math.PI if needed for asset flip)
// - Mirroring per part via RENDER.MIRROR flags

const ASSETS = (window.ASSETS ||= {});
const CACHE = (ASSETS.sprites ||= {});
const FAILED = (ASSETS.failedSprites ||= new Set());
const GLOB = (window.GAME ||= {});
const RENDER = (window.RENDER ||= {});

// Legacy support: map old hideSprites to new RENDER_DEBUG
if (typeof RENDER.hideSprites === 'boolean') {
  window.RENDER_DEBUG = window.RENDER_DEBUG || {};
  window.RENDER_DEBUG.showSprites = !RENDER.hideSprites;
}

RENDER.MIRROR ||= {}; // per-part mirror flags like 'ARM_L_UPPER': true

function angleZero(){ return 'right'; }
function spriteAngleZero(){ return 'right'; }

// Standard "right" = 0 radians.
function basisFor(ang){
  const fn = (typeof window !== 'undefined' && typeof window.BONE_BASIS === 'function') ? window.BONE_BASIS : null;
  if (fn) return fn(ang);
  const c = Math.cos(ang), s = Math.sin(ang);
  return { fx: c, fy: s, rx: -s, ry: c };
}
function rad(deg){ return (deg||0) * Math.PI / 180; }
function dist(a,b){ const dx=b[0]-a[0], dy=b[1]-a[1]; return Math.sqrt(dx*dx+dy*dy); }

// FIXED: "right" = 0 radians (graphics standard)
function angle(a, b){
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const fn = (typeof window !== 'undefined' && typeof window.BONE_ANGLE_FROM_DELTA === 'function') ? window.BONE_ANGLE_FROM_DELTA : null;
  if (fn) return fn(dx, dy);
  return Math.atan2(dy, dx);
}
function withAX(x,y,ang,ax,ay,unitsLen){
  const L = (unitsLen||1);
  const u = (ax||0)*L, v = (ay||0)*L;
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

function pickFighterName(C){
  if(GLOB.selectedFighter && C.fighters?.[GLOB.selectedFighter]) return GLOB.selectedFighter;
  if (C.fighters?.TLETINGAN) return 'TLETINGAN';
  const k=Object.keys(C.fighters||{}); return k.length?k[0]:'default';
}

// Returns bone objects keyed by body part
function getBones(C, G, fname){
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
      return 0; // No offset required for legs in corrected system
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

// === MIRROR API ===
export function resetMirror(){ RENDER.MIRROR = {}; }
export function setMirrorForPart(part, val){ RENDER.MIRROR[part] = !!val; }

function legMirrorFlag(side, tagU, tagL){
  // Modify as needed if you want per-leg mirroring based on animation or sprites
  return !!RENDER.MIRROR[tagU] || !!RENDER.MIRROR[tagL];
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

// Sprite rendering for bones, fixed math
function drawBoneSprite(ctx, asset, bone, styleKey, style, offsets){
  const img = asset?.img;
  if (!img || img.__broken) return false;
  if (!img.complete) return false;
  if (!(img.naturalWidth > 0 && img.naturalHeight > 0)) return false;

  // Get anchor config: default is "mid", else "start"
  const anchorCfg = style.anchor || {};
  const anchorMode = anchorCfg[styleKey] || 'mid';

  // Basis vectors for local orientation
  const bAxis = basisFor(bone.ang);
  let posX, posY;
  if (anchorMode === 'start') {
    posX = bone.x;
    posY = bone.y;
  } else {
    posX = bone.x + bone.len * 0.5 * bAxis.fx;
    posY = bone.y + bone.len * 0.5 * bAxis.fy;
  }

  // Offset config for fine-tuning sprite placement
  const xform = (style.xform || {})[styleKey] || {};
  const xformUnits = (style.xformUnits || 'px').toLowerCase();

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
  const nh = img.naturalHeight || img.height || 1;
  const nw = img.naturalWidth  || img.width  || 1;
  const baseH = Math.max(1, bone.len);
  const wfTbl = style.widthFactor || {};
  const wf = (wfTbl[styleKey] ?? wfTbl[styleKey?.replace(/_.*/, '')] ?? 1);
  let w = nw * (baseH / nh) * wf;
  let h = baseH;

  // Scales
  const scaleX = xform.scaleX ?? 1;
  const scaleY = xform.scaleY ?? 1;
  w *= scaleX;
  h *= scaleY;

  // Rotation (fixed): bone.ang + alignRad
  const alignRad = asset.alignRad ?? 0;
  const theta = bone.ang + alignRad;
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

  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showSprites === false) return;
  const { assets, style, offsets } = ensureFighterSprites(C, fname);

  const zOf = buildZMap(C);
  const queue = [];
  function enqueue(tag, drawFn){ queue.push({ z: zOf(tag), tag, drawFn }); }

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
  // Arms & legs
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
  return { assets: S, style: C.spriteStyle || {}, offsets: C.spriteOffsets || {} };
}
