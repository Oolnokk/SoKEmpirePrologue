// sprites.js — v19 semantics: bone-parenting, offsets, branch mirroring, render.order, and local facing flip
// Exports: initSprites(), renderSprites(ctx), mirror API

const ASSETS = (window.ASSETS ||= {});
const CACHE = (ASSETS.sprites ||= {});
const GLOB = (window.GAME ||= {});
const RENDER = (window.RENDER ||= {});
RENDER.MIRROR ||= {}; // per-part mirror flags like 'ARM_L_UPPER': true

function angleZero(){ const z = (typeof window !== 'undefined' && window.ANGLE_ZERO) ? String(window.ANGLE_ZERO).toLowerCase() : 'right'; return (z === 'up') ? 'up' : 'right'; }
function basisFor(ang){
  const fn = (typeof window !== 'undefined' && typeof window.BONE_BASIS === 'function') ? window.BONE_BASIS : null;
  if (fn) return fn(ang);
  const c = Math.cos(ang), s = Math.sin(ang);
  if (angleZero() === 'right') { return { fx:c, fy:s, rx:-s, ry:c }; }
  return { fx:s, fy:-c, rx:c, ry:s };
}
function rad(deg){ return (deg||0) * Math.PI / 180; }
function dist(a,b){ const dx=b[0]-a[0], dy=b[1]-a[1]; return Math.sqrt(dx*dx+dy*dy); }
function angle(a,b){
  const dx = b[0]-a[0];
  const dy = b[1]-a[1];
  const fn = (typeof window !== 'undefined' && typeof window.BONE_ANGLE_FROM_DELTA === 'function') ? window.BONE_ANGLE_FROM_DELTA : null;
  if (fn) return fn(dx, dy);
  if (angleZero() === 'right') { return Math.atan2(dy, dx); }
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
function load(url){ if(!url) return null; if(CACHE[url]) return CACHE[url]; const img=new Image(); img.crossOrigin='anonymous'; img.src=url; CACHE[url]=img; return img; }

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

// Render order: use CONFIG.render.order if available; else fallback
function buildZMap(C){
  const def = ['HITBOX','ARM_L_UPPER','ARM_L_LOWER','LEG_L_UPPER','LEG_L_LOWER','TORSO','HEAD','LEG_R_UPPER','LEG_R_LOWER','ARM_R_UPPER','ARM_R_LOWER'];
  const arr = (C.render && Array.isArray(C.render.order) && C.render.order.length) ? C.render.order.map(s=>String(s).toUpperCase()) : def;
  const m = new Map();
  arr.forEach((tag,i)=>m.set(tag, i));
  return (tag)=> (m.has(tag) ? m.get(tag) : 999);
}

// Read per-fighter sprite images & style
function resolveImages(spriteConf){
  return {
    torso: load(spriteConf.torso),
    head:  load(spriteConf.head),
    arm_L_upper: load(spriteConf.arm?.upper),
    arm_L_lower: load(spriteConf.arm?.lower),
    arm_R_upper: load(spriteConf.arm?.upper),
    arm_R_lower: load(spriteConf.arm?.lower),
    leg_L_upper: load(spriteConf.leg?.upper),
    leg_L_lower: load(spriteConf.leg?.lower),
    leg_R_upper: load(spriteConf.leg?.upper),
    leg_R_lower: load(spriteConf.leg?.lower)
  };
}
function ensureFighterSprites(C,fname){
  const f=C.fighters?.[fname] || {};
  const S=(f.sprites)||{};
  return { imgs: resolveImages(S), style:(S.style||{}), offsets:(f.offsets||{}) };
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

function drawBoneSprite(ctx, img, bone, styleKey, style, offsets, facingFlip){
  if (!img || !img.complete) return;
  const anchorMap = (style.anchor||{});
  const anchor = anchorMap[styleKey] || 'mid';
  const t = (anchor === 'start') ? 0.0 : 0.5;
  // base anchor on bone
  const bAxis = basisFor(bone.ang);
  let px = bone.x + bone.len * t * bAxis.fx;
  let py = bone.y + bone.len * t * bAxis.fy;

  // 1) apply fighter offsets.origin (absolute units) in bone-space
  const off = originOffset(styleKey, offsets);
  if (off){ const p = withAX(px, py, bone.ang, off.ax||0, off.ay||0, 1); px=p[0]; py=p[1]; }

  // 2) then apply style xform (percent or px)
  const xform = (style.xform||{})[styleKey] || {};
  const units = (style.xformUnits||'percent');
  const Lunit = (units === 'percent') ? bone.len : 1;
  const p2 = withAX(px, py, bone.ang, xform.ax||0, xform.ay||0, Lunit);
  const posX = p2[0], posY = p2[1];

  // v19 sizing
  const nh = img.naturalHeight || img.height || 1;
  const nw = img.naturalWidth  || img.width  || 1;
  const baseH = Math.max(1, bone.len);
  const s = baseH / nh;

  const wfTbl = style.widthFactor || {};
  const wf = (wfTbl[styleKey] ?? wfTbl[styleKey?.replace(/_.*/, '')] ?? 1);

  let w = nw * s * wf;
  let h = baseH;
  const sx = (xform.scaleX==null?1:xform.scaleX);
  const sy = (xform.scaleY==null?1:xform.scaleY);
  w *= sx; h *= sy;

  // rotation with +PI baseline (v19)
  const zeroMode = angleZero();
  const angleComp = (zeroMode === 'right') ? -Math.PI/2 : 0;
  const theta = bone.ang + rad(xform.rotDeg || 0) + Math.PI + angleComp;

  ctx.save();
  ctx.translate(posX, posY);
  ctx.rotate(theta);
  if (facingFlip){ ctx.scale(-1, 1); } // global facing left -> local sprite flip
  ctx.drawImage(img, -w/2, -h/2, w, h);

  const dbg = (style.debug||{});
  if (dbg[styleKey]){ ctx.beginPath(); ctx.arc(0,0,3,0,Math.PI*2); ctx.fillStyle = '#00e5ff'; ctx.fill(); ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(w*0.25,0); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth=2; ctx.stroke(); }
  ctx.restore();
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

function drawArmBranch(ctx, rig, side, imgs, style, offsets, facingFlip){
  const upKey = side==='L' ? 'arm_L_upper':'arm_R_upper';
  const loKey = side==='L' ? 'arm_L_lower':'arm_R_lower';
  const up = rig[upKey]; const lo = rig[loKey]; if (!up) return;
  const tagU = tagOf(upKey), tagL = tagOf(loKey);
  const mirror = limbMirrorFlag(side, tagU, tagL);
  const originX = up.x;
  withBranchMirror(ctx, originX, mirror, ()=>{
    drawBoneSprite(ctx, imgs[upKey], up, styleKeyOf(upKey), style, offsets, facingFlip);
    if (lo) drawBoneSprite(ctx, imgs[loKey], lo, styleKeyOf(loKey), style, offsets, facingFlip);
  });
}

function drawLegBranch(ctx, rig, side, imgs, style, offsets, facingFlip){
  const upKey = side==='L' ? 'leg_L_upper':'leg_R_upper';
  const loKey = side==='L' ? 'leg_L_lower':'leg_R_lower';
  const up = rig[upKey]; const lo = rig[loKey]; if (!up) return;
  const tagU = tagOf(upKey), tagL = tagOf(loKey);
  const mirror = legMirrorFlag(side, tagU, tagL);
  const originX = up.x;
  withBranchMirror(ctx, originX, mirror, ()=>{
    drawBoneSprite(ctx, imgs[upKey], up, styleKeyOf(upKey), style, offsets, facingFlip);
    if (lo) drawBoneSprite(ctx, imgs[loKey], lo, styleKeyOf(loKey), style, offsets, facingFlip);
  });
}

export function renderSprites(ctx){
  const C = (window.CONFIG || {});
  const fname = pickFighterName(C);
  const rig = getBones(C, GLOB, fname);
  if (!rig) return;
  const { imgs, style, offsets } = ensureFighterSprites(C, fname);
  const facingFlip = (GLOB.FIGHTERS?.player?.facingSign || 1) < 0;

  // z-order support (we keep it simple: we still draw branches, but enqueue according to order)
  const zOf = buildZMap(C);
  const Q = [];
  function enqueue(tag, fn){ Q.push({z:zOf(tag), tag, fn}); }

  enqueue('TORSO', ()=> drawBoneSprite(ctx, imgs.torso, rig.torso, 'torso', style, offsets, facingFlip));
  enqueue('HEAD',  ()=> drawBoneSprite(ctx, imgs.head,  rig.head,  'head',  style, offsets, facingFlip));
  enqueue('ARM_L_UPPER', ()=> drawArmBranch(ctx, rig, 'L', imgs, style, offsets, facingFlip));
  enqueue('ARM_L_LOWER', ()=> {}); // lower is drawn inside branch; tag kept for ordering parity
  enqueue('ARM_R_UPPER', ()=> drawArmBranch(ctx, rig, 'R', imgs, style, offsets, facingFlip));
  enqueue('ARM_R_LOWER', ()=> {});
  enqueue('LEG_L_UPPER', ()=> drawLegBranch(ctx, rig, 'L', imgs, style, offsets, facingFlip));
  enqueue('LEG_L_LOWER', ()=> {});
  enqueue('LEG_R_UPPER', ()=> drawLegBranch(ctx, rig, 'R', imgs, style, offsets, facingFlip));
  enqueue('LEG_R_LOWER', ()=> {});

  Q.sort((a,b)=>a.z-b.z);
  for (const d of Q){ d.fn && d.fn(); }
}

export function initSprites(){
  const C = (window.CONFIG || {});
  const fname = pickFighterName(C);
  const f=C.fighters?.[fname];
  const S=(f?.sprites)||{};
  resolveImages(S);
  console.log('[sprites] ready (v19 parenting + offsets + branch mirror + render.order) for', fname);
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
