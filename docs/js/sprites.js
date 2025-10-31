// sprites.js — v19 basis + per-fighter offsets + LAYER QUEUE (z-order)
// Draw in camera space; bone length → sprite height; offsets in bone space;
// Rotation basis matches v19 (0 rad = up): segPos(sin,-cos), angleBetween(dx,-dy).

// ---------- image cache ----------
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

// ---------- public API ----------
export async function initSprites(){
  const C = window.CONFIG || {};
  const prof = C.fighters?.[pickFighterName(C)] || {};
  const sp = prof.sprites || {};
  await preloadAll([ sp.torso, sp.head, sp.arm?.upper, sp.arm?.lower, sp.leg?.upper, sp.leg?.lower ]);
  (window.GAME ||= {}).SPRITES = { preloaded:true, fighter: pickFighterName(C) };
  console.log('[sprites] ready for', pickFighterName(C));
}

export function renderSprites(ctx){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!ctx || !G.FIGHTERS || !G.ANCHORS) return;
  const camX = G.CAMERA?.x || 0;
  ctx.save();
  ctx.translate(-camX, 0); // camera space to match stick render
  drawFighterSprites(ctx, G.FIGHTERS.player, C, G.ANCHORS.player);
  drawFighterSprites(ctx, G.FIGHTERS.npc,    C, G.ANCHORS.npc);
  ctx.restore();
}

// ---------- fighter/profile/style helpers ----------
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

// ---------- v19 geometry basis ----------
function segPos(x,y,len,ang){ const ex = x + len*Math.sin(ang); const ey = y - len*Math.cos(ang); return [ex,ey]; }
function angleBetween(p0,p1){ const dx=p1[0]-p0[0], dy=p1[1]-p0[1]; return Math.atan2(dx, -dy); }
function withAX(x,y,ang,ax,ay){ const s=Math.sin(ang), c=Math.cos(ang); const dx=ax*s + ay*c; const dy=ax*(-c) + ay*s; return [x+dx, y+dy]; }
function dist(p0,p1){ return Math.hypot(p1[0]-p0[0], p1[1]-p0[1]); }

// ---------- offsets ----------
function off(prof, path){ const segs = path.split('.'); let o = prof.offsets || {}; for (const k of segs){ if (!o) break; o = o[k]; } return { ax: (o?.ax||0), ay: (o?.ay||0) }; }
function originOffFor(prof, key){ if (key==='torso') return off(prof, 'torso.origin'); if (key==='head') return off(prof, 'head.origin'); if (key==='armUpper') return off(prof, 'arm.upper.origin'); if (key==='armLower') return off(prof, 'arm.lower.origin'); if (key==='legUpper') return off(prof, 'leg.upper.origin'); if (key==='legLower') return off(prof, 'leg.lower.origin'); return {ax:0, ay:0}; }
function startJointOffFor(key){ if (key==='armUpper') return { path:'torso.shoulder', which:'torso' }; if (key==='legUpper') return { path:'torso.hip', which:'torso' }; if (key==='head') return { path:'torso.neck', which:'torso' }; if (key==='armLower') return { path:'arm.upper.elbow', which:'upperArm' }; if (key==='legLower') return { path:'leg.upper.knee',  which:'upperLeg' }; return null; }

// ---------- z-order (layer queue) ----------
const DEFAULT_RENDER_ORDER = ['HITBOX','LEG_R_LOWER','LEG_R_UPPER','LEG_L_LOWER','LEG_L_UPPER','TORSO','HEAD','ARM_R_LOWER','ARM_R_UPPER','ARM_L_LOWER','ARM_L_UPPER'];
function zOrder(tag){ const arr = (window.CONFIG?.render && Array.isArray(window.CONFIG.render.order)) ? window.CONFIG.render.order : DEFAULT_RENDER_ORDER; const i = arr.indexOf(tag); return (i === -1) ? (arr.length + 10) : i; }
function enqueue(Q, tag, fn){ Q.push({ z: zOrder(tag), tag, fn }); }

// ---------- drawing ----------
function drawBoneSprite(ctx, xStart, yStart, len, ang, key, prof, style, parentAng){
  const url = urlFor(prof, key); const rec = url && IMG_CACHE.get(url); const img = rec?.ready ? rec.img : null; if (!img) return;
  const j = startJointOffFor(key);
  if (j){ const o = off(prof, j.path); const useAng = parentAng ?? ang; [xStart, yStart] = withAX(xStart, yStart, useAng, o.ax, o.ay); }
  const xf = getXf(style, key); const units = getUnits(style); const wf = getWF(style, key, 1.0);
  const nh = (img.naturalHeight||img.height||1); const nw = (img.naturalWidth||img.width||1); const baseH = Math.max(1, len); const s = baseH/nh;
  const h = baseH * (xf.scaleY ?? 1); const w = (nw * s) * (xf.scaleX ?? 1) * wf;
  let [x,y] = segPos(xStart, yStart, len*0.5, ang);
  if (xf && (xf.ax || xf.ay)){ let ax = (xf.ax||0), ay = (xf.ay||0); if (units==='percent'){ ax = ax * len; ay = ay * len; } [x,y] = withAX(x,y, ang, ax, ay); }
  const o = originOffFor(prof, key); if (o.ax || o.ay){ [x,y] = withAX(x,y, ang, o.ax, o.ay); }
  const rot = (xf && xf.rotDeg ? (xf.rotDeg*Math.PI/180) : 0);
  ctx.save(); ctx.translate(x, y); ctx.rotate(ang + rot + Math.PI); ctx.drawImage(img, -w/2, -h/2, w, h);
  if (style.debug && style.debug[key]){ ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke(); }
  ctx.restore();
}

function drawHeadFromBone(ctx, F, C, A, prof, style){
  const s = C.actor?.scale ?? 0.7; const neck=(prof.parts?.head?.neck ?? C.parts?.head?.neck ?? 12)*s; const radius=(prof.parts?.head?.radius ?? C.parts?.head?.radius ?? 12)*s; const len=Math.max(1, neck + radius*2); const torsoAng = (A.torsoAbs!=null) ? A.torsoAbs : ((F.jointAngles?.torso||0) + (F.facingRad||0)); let x0 = A.torsoTop[0], y0 = A.torsoTop[1]; const neckOff = off(prof,'torso.neck'); if (neckOff.ax||neckOff.ay){ [x0,y0] = withAX(x0,y0, torsoAng, neckOff.ax, neckOff.ay); } drawBoneSprite(ctx, x0, y0, len, torsoAng, 'head', prof, style, torsoAng); }

function drawFighterSprites(ctx, F, C, A){
  if (!F || !A) return; const { prof } = getProfile(C); const style = getStyle(prof); const tAng = (A.torsoAbs!=null) ? A.torsoAbs : 0;
  const Q = [];
  // Legs
  let [lHipX,lHipY] = [A.lHipBase[0], A.lHipBase[1]]; let [rHipX,rHipY] = [A.rHipBase[0], A.rHipBase[1]]; const hipOff = off(prof,'torso.hip'); if (hipOff.ax||hipOff.ay){ [lHipX,lHipY]=withAX(lHipX,lHipY,tAng,hipOff.ax,hipOff.ay); [rHipX,rHipY]=withAX(rHipX,rHipY,tAng,hipOff.ax,hipOff.ay); }
  const lUlen=dist(A.lHipBase,A.lKnee), lUang=angleBetween(A.lHipBase,A.lKnee); const lLlen=dist(A.lKnee,A.lFoot), lLang=angleBetween(A.lKnee,A.lFoot);
  const rUlen=dist(A.rHipBase,A.rKnee), rUang=angleBetween(A.rHipBase,A.rKnee); const rLlen=dist(A.rKnee,A.rFoot), rLang=angleBetween(A.rKnee,A.rFoot);
  enqueue(Q,'LEG_L_UPPER', ()=> drawBoneSprite(ctx, lHipX, lHipY, lUlen, lUang, 'legUpper', prof, style, lUang));
  enqueue(Q,'LEG_L_LOWER', ()=> drawBoneSprite(ctx, A.lKnee[0], A.lKnee[1], lLlen, lLang, 'legLower', prof, style, lUang));
  enqueue(Q,'LEG_R_UPPER', ()=> drawBoneSprite(ctx, rHipX, rHipY, rUlen, rUang, 'legUpper', prof, style, rUang));
  enqueue(Q,'LEG_R_LOWER', ()=> drawBoneSprite(ctx, A.rKnee[0], A.rKnee[1], rLlen, rLang, 'legLower', prof, style, rUang));
  // Torso / Head
  const tLen=dist(A.torsoBot,A.torsoTop); enqueue(Q,'TORSO', ()=> drawBoneSprite(ctx, A.torsoBot[0], A.torsoBot[1], tLen, tAng, 'torso', prof, style, tAng));
  enqueue(Q,'HEAD',  ()=> drawHeadFromBone(ctx, F, C, A, prof, style));
  // Arms (apply shoulder offset at start)
  let [lShX,lShY] = [A.lShoulderBase[0], A.lShoulderBase[1]]; let [rShX,rShY] = [A.rShoulderBase[0], A.rShoulderBase[1]]; const shOff=off(prof,'torso.shoulder'); if (shOff.ax||shOff.ay){ [lShX,lShY]=withAX(lShX,lShY,tAng,shOff.ax,shOff.ay); [rShX,rShY]=withAX(rShX,rShY,tAng,shOff.ax,shOff.ay); }
  const lAulen=dist(A.lShoulderBase,A.lElbow), lAuang=angleBetween(A.lShoulderBase,A.lElbow); const lAllen=dist(A.lElbow,A.lHand), lAlang=angleBetween(A.lElbow,A.lHand);
  const rAulen=dist(A.rShoulderBase,A.rElbow), rAuang=angleBetween(A.rShoulderBase,A.rElbow); const rAllen=dist(A.rElbow,A.rHand), rAlang=angleBetween(A.rElbow,A.rHand);
  enqueue(Q,'ARM_L_UPPER', ()=> drawBoneSprite(ctx, lShX, lShY, lAulen, lAuang, 'armUpper', prof, style, lAuang));
  enqueue(Q,'ARM_L_LOWER', ()=> drawBoneSprite(ctx, A.lElbow[0], A.lElbow[1], lAllen, lAlang, 'armLower', prof, style, lAuang));
  enqueue(Q,'ARM_R_UPPER', ()=> drawBoneSprite(ctx, rShX, rShY, rAulen, rAuang, 'armUpper', prof, style, rAuang));
  enqueue(Q,'ARM_R_LOWER', ()=> drawBoneSprite(ctx, A.rElbow[0], A.rElbow[1], rAllen, rAlang, 'armLower', prof, style, rAuang));
  // Flush
  Q.sort((a,b)=> a.z - b.z); for (const d of Q){ d.fn(); }
}
