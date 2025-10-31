// sprites.js — match v19 math for bone→sprite mapping, camera space, and offsets
// - Map bone length to **image height**; preserve aspect ratio (w = h * (nw/nh)).
// - Offsets (ax, ay) are applied in **bone space**; when xformUnits === 'percent', treat them as % of bone length.
// - Rotate sprites by (boneAngle + rotDeg + PI), centered at the bone midpoint.
// - Translate by camera so sprites and sticks live in the same space.
// - Head is bone-driven: start at torsoTop, extend by neck+radius*2 along torso angle.

const IMG_CACHE = new Map();
function loadImg(url){
  if (!url) return Promise.resolve(null);
  if (IMG_CACHE.has(url)){ const rec = IMG_CACHE.get(url); return rec.ready ? Promise.resolve(rec.img) : rec.promise; }
  const img = new Image();
  let resolveFn, rejectFn;
  const promise = new Promise((res, rej)=>{ resolveFn=res; rejectFn=rej; });
  img.onload  = ()=>{ IMG_CACHE.set(url, { img, ready:true,  promise }); resolveFn(img); };
  img.onerror = (e)=>{ console.warn('[sprites] failed', url, e); IMG_CACHE.set(url, { img:null, ready:false, promise }); rejectFn(e); };
  img.crossOrigin = 'anonymous';
  img.src = url;
  IMG_CACHE.set(url, { img, ready:false, promise });
  return promise;
}
async function preloadAll(urls){ const uniq = Array.from(new Set(urls.filter(Boolean))); await Promise.all(uniq.map(u=>loadImg(u).catch(()=>{}))); }

export async function initSprites(){
  const C = window.CONFIG || {};
  const name = pickFighterName(C);
  const prof = C.fighters?.[name] || {};
  const sp = prof.sprites || {};
  await preloadAll([ sp.torso, sp.head, sp.arm?.upper, sp.arm?.lower, sp.leg?.upper, sp.leg?.lower ]);
  (window.GAME ||= {}).SPRITES = { preloaded:true, fighter:name };
  console.log('[sprites] ready for', name);
}

export function renderSprites(ctx){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!ctx || !G.FIGHTERS || !G.ANCHORS) return;
  const camX = G.CAMERA?.x || 0;
  ctx.save();
  ctx.translate(-camX, 0); // IMPORTANT: draw in camera space like renderAll()
  drawFighterSprites(ctx, G.FIGHTERS.player, C, G.ANCHORS.player);
  drawFighterSprites(ctx, G.FIGHTERS.npc,    C, G.ANCHORS.npc);
  ctx.restore();
}

function pickFighterName(C){
  const sel = (window.GAME && window.GAME.selectedFighter) || null;
  if (sel && C.fighters?.[sel]) return sel;
  if (C.fighters){ if (C.fighters.TLETINGAN) return 'TLETINGAN'; const ks=Object.keys(C.fighters); if (ks.length) return ks[0]; }
  return null;
}
function getProfile(C){ const name = pickFighterName(C); return { name, prof: (C.fighters?.[name] || {} ) }; }
function getStyle(prof){ return prof.sprites?.style || {}; }
function getUnits(style){ return (style.xformUnits||'px').toLowerCase().startsWith('percent') ? 'percent' : 'px'; }
function getXf(style, key){ return (style.xform && style.xform[key]) || {}; }
function getWF(style, key, def){ return (style.widthFactor && style.widthFactor[key]) ?? def; }
function urlFor(prof, key){ const sp = prof.sprites || {}; return key==='torso'?sp.torso: key==='head'?sp.head: key==='armUpper'?sp.arm?.upper: key==='armLower'?sp.arm?.lower: key==='legUpper'?sp.leg?.upper: key==='legLower'?sp.leg?.lower: null; }

function segPos(x,y,len,ang){ const ex = x + len*Math.cos(ang), ey = y + len*Math.sin(ang); return [ex,ey]; }
function withAX(x,y,ang,ax,ay){ // world-space offset from bone-space (v19)
  const c=Math.cos(ang), s=Math.sin(ang);
  const dx = ax*c - ay*s; // forward is +X in bone space (along bone) maps to world via (c,-s)
  const dy = ax*s + ay*c;
  return [x+dx, y+dy];
}

function drawBoneSprite(ctx, xStart, yStart, len, ang, key, prof, style){
  const url = urlFor(prof, key);
  const rec = url && IMG_CACHE.get(url);
  const img = rec?.ready ? rec.img : null;
  if (!img) return;

  // === v19 semantics ===
  const xf = getXf(style, key);
  const units = getUnits(style);
  const wf = getWF(style, key, 1.0);

  const nh = (img.naturalHeight||img.height||1);
  const nw = (img.naturalWidth ||img.width ||1);
  const baseH = Math.max(1, len);
  const s = baseH / nh; // bone length → sprite HEIGHT
  let h = baseH * (xf.scaleY ?? 1);
  let w = (nw * s) * (xf.scaleX ?? 1) * wf; // keep aspect and apply widthFactor on width

  // Midpoint of bone
  const mid = segPos(xStart, yStart, len*0.5, ang);
  let x = mid[0], y = mid[1];

  // Offsets in bone space; percent → relative to **bone length**
  if (xf && (xf.ax || xf.ay)){
    let ax = (xf.ax||0), ay = (xf.ay||0);
    if (units==='percent'){ ax = ax * len; ay = ay * len; }
    [x,y] = withAX(x,y, ang, ax, ay);
  }

  const rot = (xf && xf.rotDeg ? (xf.rotDeg*Math.PI/180) : 0);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(ang + rot + Math.PI);
  ctx.drawImage(img, -w/2, -h/2, w, h);
  ctx.restore();
}

function drawHeadFromBone(ctx, F, C, A, prof, style){
  if (!F || !A) return;
  const s = C.actor?.scale ?? 0.7;
  const neck  = (prof.parts?.head?.neck ?? C.parts?.head?.neck ?? 12) * s;
  const radius= (prof.parts?.head?.radius ?? C.parts?.head?.radius ?? 12) * s;
  const len = Math.max(1, neck + radius*2);
  const torsoAng = (A.torsoAbs!=null) ? A.torsoAbs : ((F.jointAngles?.torso||0) + (F.facingRad||0));
  // Start at torsoTop, extend along torso
  const x0 = A.torsoTop[0], y0 = A.torsoTop[1];
  drawBoneSprite(ctx, x0, y0, len, torsoAng, 'head', prof, style);
}

function angleBetween(p0,p1){ return Math.atan2(p1[1]-p0[1], p1[0]-p0[0]); }
function dist(p0,p1){ return Math.hypot(p1[0]-p0[0], p1[1]-p0[1]); }

function drawFighterSprites(ctx, F, C, A){
  if (!F || !A) return;
  const { prof } = getProfile(C);
  const style = getStyle(prof);

  // Legs (use anchor points for length & angle)
  const lUlen = dist(A.lHipBase, A.lKnee), lUang = angleBetween(A.lHipBase, A.lKnee);
  const lLlen = dist(A.lKnee, A.lFoot),   lLang = angleBetween(A.lKnee, A.lFoot);
  const rUlen = dist(A.rHipBase, A.rKnee), rUang = angleBetween(A.rHipBase, A.rKnee);
  const rLlen = dist(A.rKnee, A.rFoot),   rLang = angleBetween(A.rKnee, A.rFoot);

  drawBoneSprite(ctx, A.lHipBase[0], A.lHipBase[1], lUlen, lUang, 'legUpper', prof, style);
  drawBoneSprite(ctx, A.lKnee[0],    A.lKnee[1],    lLlen, lLang, 'legLower', prof, style);
  drawBoneSprite(ctx, A.rHipBase[0], A.rHipBase[1], rUlen, rUang, 'legUpper', prof, style);
  drawBoneSprite(ctx, A.rKnee[0],    A.rKnee[1],    rLlen, rLang, 'legLower', prof, style);

  // Torso (bottom → top)
  const tLen = dist(A.torsoBot, A.torsoTop);
  const tAng = angleBetween(A.torsoBot, A.torsoTop);
  drawBoneSprite(ctx, A.torsoBot[0], A.torsoBot[1], tLen, tAng, 'torso', prof, style);

  // Arms
  const lAulen = dist(A.lShoulderBase, A.lElbow), lAuang = angleBetween(A.lShoulderBase, A.lElbow);
  const lAllen = dist(A.lElbow, A.lHand),         lAlang = angleBetween(A.lElbow, A.lHand);
  const rAulen = dist(A.rShoulderBase, A.rElbow), rAuang = angleBetween(A.rShoulderBase, A.rElbow);
  const rAllen = dist(A.rElbow, A.rHand),         rAlang = angleBetween(A.rElbow, A.rHand);

  drawBoneSprite(ctx, A.lShoulderBase[0], A.lShoulderBase[1], lAulen, lAuang, 'armUpper', prof, style);
  drawBoneSprite(ctx, A.lElbow[0],        A.lElbow[1],        lAllen, lAlang, 'armLower', prof, style);
  drawBoneSprite(ctx, A.rShoulderBase[0], A.rShoulderBase[1], rAulen, rAuang, 'armUpper', prof, style);
  drawBoneSprite(ctx, A.rElbow[0],        A.rElbow[1],        rAllen, rAlang, 'armLower', prof, style);

  // Head (bone-driven)
  drawHeadFromBone(ctx, F, C, A, prof, style);
}
