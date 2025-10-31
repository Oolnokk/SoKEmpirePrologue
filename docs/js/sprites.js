// sprites.js — bone-driven paper-doll renderer
// Uses CONFIG.fighters[*].sprites + style {anchor, widthFactor, xform, xformUnits}.
// Supports parts: torso, head, armUpper, armLower, legUpper, legLower.

const IMG_CACHE = new Map();
function loadImg(url){
  if (!url) return Promise.resolve(null);
  if (IMG_CACHE.has(url)){
    const rec = IMG_CACHE.get(url);
    return rec.ready ? Promise.resolve(rec.img) : rec.promise;
  }
  const img = new Image();
  let resolveFn, rejectFn;
  const promise = new Promise((res, rej)=>{ resolveFn=res; rejectFn=rej; });
  img.onload = ()=>{ IMG_CACHE.set(url, { img, ready:true, promise }); resolveFn(img); };
  img.onerror = (e)=>{ console.warn('[sprites] failed', url, e); IMG_CACHE.set(url, { img:null, ready:false, promise }); rejectFn(e); };
  img.crossOrigin = 'anonymous';
  img.src = url;
  IMG_CACHE.set(url, { img, ready:false, promise });
  return promise;
}

async function preloadAll(urls){
  const uniq = Array.from(new Set(urls.filter(Boolean)));
  await Promise.all(uniq.map(u=>loadImg(u).catch(()=>{})));
}

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
  drawFighterSprites(ctx, G.FIGHTERS.player, C, G.ANCHORS.player);
  drawFighterSprites(ctx, G.FIGHTERS.npc,    C, G.ANCHORS.npc);
}

function pickFighterName(C){
  const sel = (window.GAME && window.GAME.selectedFighter) || null;
  if (sel && C.fighters?.[sel]) return sel;
  if (C.fighters){ if (C.fighters.TLETINGAN) return 'TLETINGAN'; const ks=Object.keys(C.fighters); if (ks.length) return ks[0]; }
  return null;
}

function getProfile(C){
  const name = pickFighterName(C);
  return { name, prof: (C.fighters?.[name] || {} ) };
}

function getStyle(prof){ return prof.sprites?.style || {}; }
function getUnits(style){ return (style.xformUnits||'px').toLowerCase().startsWith('percent') ? 'percent' : 'px'; }
function getXf(style, key){ return (style.xform && style.xform[key]) || {}; }
function getAnchor(style, key){ return (style.anchor && style.anchor[key]) || 'mid'; }
function getWF(style, key, def){ return (style.widthFactor && style.widthFactor[key]) ?? def; }
function urlFor(prof, key){
  const sp = prof.sprites || {};
  if (key==='torso') return sp.torso;
  if (key==='head') return sp.head;
  if (key==='armUpper') return sp.arm?.upper;
  if (key==='armLower') return sp.arm?.lower;
  if (key==='legUpper') return sp.leg?.upper;
  if (key==='legLower') return sp.leg?.lower;
  return null;
}

function rot(x,y,a){ const c=Math.cos(a), s=Math.sin(a); return [x*c - y*s, x*s + y*c]; }

function drawBoneSprite(ctx, p0, p1, key, prof, style, faceLeft){
  const url = urlFor(prof, key);
  const imgRec = url && IMG_CACHE.get(url);
  const img = imgRec?.ready ? imgRec.img : null;
  if (!img) return; // stick fallback already drawn underneath

  const xf = getXf(style, key);
  const units = getUnits(style);
  const anchor = getAnchor(style, key); // 'start' | 'mid' | 'end'
  const wf = getWF(style, key, key==='torso'?0.45:(key.startsWith('arm')?0.28:0.32));

  const dx = p1[0]-p0[0], dy = p1[1]-p0[1];
  const len = Math.hypot(dx,dy) || 1;
  const ang = Math.atan2(dy,dx);

  // Map: bone length = image width; thickness = len*wf
  const scaleX = (xf.scaleX ?? 1);
  const scaleY = (xf.scaleY ?? 1);
  const w = len * scaleX;
  const h = Math.max(2, len * wf * scaleY);

  // Base position: midpoint
  let baseX = (p0[0]+p1[0])/2;
  let baseY = (p0[1]+p1[1])/2;

  // Anchor shift along bone
  let anchorShift = 0;
  if (anchor==='start') anchorShift = -w/2;
  else if (anchor==='end') anchorShift = w/2;
  // Extra offsets (ax, ay) in specified units
  let ax = (xf.ax ?? 0), ay = (xf.ay ?? 0);
  if (units==='percent'){ ax *= w; ay *= h; }

  ctx.save();
  ctx.translate(baseX, baseY);
  ctx.rotate(ang + (xf.rotDeg||0)*Math.PI/180);
  if (faceLeft && key==='torso'){ ctx.scale(-1,1); } // optional: flip torso with facing

  // Apply anchor/offset in bone-local space
  ctx.translate(anchorShift + ax, ay);
  ctx.drawImage(img, -w/2, -h/2, w, h);

  if (style.debug && style.debug[key]){
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
    ctx.strokeStyle = '#10b981'; ctx.strokeRect(-w/2, -h/2, w, h);
  }
  ctx.restore();
}

function drawHeadFromBone(ctx, F, C, A, prof, style){
  // Compute head center from torsoTop + rotated neck
  const s = C.actor?.scale ?? 0.7;
  const neck  = (prof.parts?.head?.neck ?? C.parts?.head?.neck ?? 12) * s;
  const radius= (prof.parts?.head?.radius ?? C.parts?.head?.radius ?? 12) * s;
  const torsoAng = (F.jointAngles?.torso || 0) + (F.facingRad || 0);
  const off = rot(0, -neck, torsoAng);
  const cx = A.torsoTop[0] + off[0];
  const cy = A.torsoTop[1] + off[1];

  const url = urlFor(prof, 'head');
  const imgRec = url && IMG_CACHE.get(url);
  const img = imgRec?.ready ? imgRec.img : null;
  const xf = getXf(style, 'head');
  const units = getUnits(style);
  let ax = (xf.ax ?? 0), ay = (xf.ay ?? 0);
  let w = radius*2*(xf.scaleX??1), h = radius*2*(xf.scaleY??1);
  if (units==='percent'){ ax *= w; ay *= h; }
  const faceLeft = Math.cos(F.facingRad||0) < 0;

  ctx.save();
  ctx.translate(cx + ax, cy + ay);
  ctx.rotate(torsoAng * 0.25 + (xf.rotDeg||0)*Math.PI/180);
  if (faceLeft) ctx.scale(-1,1);
  if (img){ ctx.drawImage(img, -w/2, -h/2, w, h); }
  else { ctx.beginPath(); ctx.arc(0,0,radius,0,Math.PI*2); ctx.fillStyle='rgba(255,255,255,.95)'; ctx.fill(); ctx.strokeStyle='rgba(0,0,0,.25)'; ctx.stroke(); }
  if (style.debug?.head){ ctx.strokeStyle='#22d3ee'; ctx.lineWidth=1; ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke(); }
  ctx.restore();
}

function drawFighterSprites(ctx, F, C, A){
  if (!F || !A) return;
  const { prof } = getProfile(C);
  const style = getStyle(prof);
  const faceLeft = Math.cos(F.facingRad||0) < 0;

  // === Z-order: legs → torso → arms → head ===
  // Legs
  drawBoneSprite(ctx, A.lHipBase, A.lKnee, 'legUpper', prof, style, faceLeft);
  drawBoneSprite(ctx, A.lKnee, A.lFoot,  'legLower', prof, style, faceLeft);
  drawBoneSprite(ctx, A.rHipBase, A.rKnee, 'legUpper', prof, style, faceLeft);
  drawBoneSprite(ctx, A.rKnee, A.rFoot,  'legLower', prof, style, faceLeft);
  // Torso
  drawBoneSprite(ctx, A.torsoBot, A.torsoTop, 'torso', prof, style, faceLeft);
  // Arms
  drawBoneSprite(ctx, A.lShoulderBase, A.lElbow, 'armUpper', prof, style, faceLeft);
  drawBoneSprite(ctx, A.lElbow, A.lHand, 'armLower', prof, style, faceLeft);
  drawBoneSprite(ctx, A.rShoulderBase, A.rElbow, 'armUpper', prof, style, faceLeft);
  drawBoneSprite(ctx, A.rElbow, A.rHand, 'armLower', prof, style, faceLeft);
  // Head (bone-driven)
  drawHeadFromBone(ctx, F, C, A, prof, style);
}
