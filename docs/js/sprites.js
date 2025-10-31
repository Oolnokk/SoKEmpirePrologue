// sprites.js — bone-driven sprite rendering using CONFIG.fighters[*].sprites
// Head is treated as a bone (neck length + radius), anchored from torsoTop and rotated by torso/facing.

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

export async function initSprites(){
  const C = window.CONFIG || {};
  const fighterName = pickFighterName(C);
  const profile = C.fighters?.[fighterName];
  const headUrl = profile?.sprites?.head;
  if (headUrl) await loadImg(headUrl).catch(()=>{});
  (window.GAME ||= {}).SPRITES = { preloaded:true };
  console.log('[sprites] init done for', fighterName);
}

export function renderSprites(ctx){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!ctx || !G.FIGHTERS || !G.ANCHORS) return;
  drawHeadFromBone(ctx, G.FIGHTERS.player, C, G.ANCHORS.player);
  drawHeadFromBone(ctx, G.FIGHTERS.npc, C, G.ANCHORS.npc);
}

function pickFighterName(C){
  // Prefer explicitly selected fighter if we ever set one.
  const sel = (window.GAME && window.GAME.selectedFighter) || null;
  if (sel && C.fighters?.[sel]) return sel;
  if (C.fighters){
    if (C.fighters.TLETINGAN) return 'TLETINGAN';
    const keys = Object.keys(C.fighters);
    if (keys.length) return keys[0];
  }
  return null;
}

function getHeadParams(C, F){
  const name = pickFighterName(C);
  const prof = (name && C.fighters?.[name]) || {};
  const s = C.actor?.scale ?? 0.7;
  const neck = (prof.parts?.head?.neck ?? C.parts?.head?.neck ?? 12) * s;
  const radius = (prof.parts?.head?.radius ?? C.parts?.head?.radius ?? 12) * s;
  const sprites = prof.sprites || {};
  const style = sprites.style || {};
  return { s, neck, radius, sprites, style }
}

function rot(x, y, a){ const c=Math.cos(a), s=Math.sin(a); return [x*c - y*s, x*s + y*c]; }

async function drawHeadFromBone(ctx, F, C, A){
  if (!F || !A) return;
  const { s, neck, radius, sprites, style } = getHeadParams(C, F);
  const torsoAng = (F.jointAngles?.torso || 0) + (F.facingRad || 0);
  // Anchor: start at torsoTop, move *up along torso* by neck
  const off = rot(0, -neck, torsoAng);
  const centerX = A.torsoTop[0] + off[0];
  const centerY = A.torsoTop[1] + off[1];

  const url = sprites.head;
  const imgRec = url && IMG_CACHE.get(url);
  const img = imgRec?.ready ? imgRec.img : null;

  // Default transforms
  const xf = style.xform?.head || {};
  const scaleX = (xf.scaleX ?? 1) * 1.0;
  const scaleY = (xf.scaleY ?? 1) * 1.0;
  const rotDeg = (xf.rotDeg ?? 0);
  const ax = (xf.ax ?? 0); // anchor offsets, loosely in px; we keep it simple
  const ay = (xf.ay ?? 0);

  const w = radius * 2 * scaleX;
  const h = radius * 2 * scaleY;
  const faceLeft = Math.cos(F.facingRad||0) < 0;

  ctx.save();
  ctx.translate(centerX + ax, centerY + ay);
  // mild follow + configured rotation
  ctx.rotate(torsoAng * 0.25 + (rotDeg * Math.PI/180));
  if (faceLeft) ctx.scale(-1, 1);

  if (img){
    ctx.drawImage(img, -w/2, -h/2, w, h);
  } else {
    // vector fallback so we never lose the head
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,.95)'; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
  }

  // Optional anchor gizmo
  if (style.debug?.head){
    ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-6,0); ctx.lineTo(6,0); ctx.moveTo(0,-6); ctx.lineTo(0,6); ctx.stroke();
  }
  ctx.restore();
}
