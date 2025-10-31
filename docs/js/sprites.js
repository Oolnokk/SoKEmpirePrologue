// sprites.js — simple sprite loading & head render anchored to torso
const SPRITES = { head: null, ready: false };

function loadImage(src){
  return new Promise((resolve, reject)=>{
    const img = new Image();
    img.onload = ()=> resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function initSprites(){
  try {
    const base = './assets';
    const head = await loadImage(base + '/head.svg?v=1');
    SPRITES.head = head;
    SPRITES.ready = true;
    (window.GAME ||= {}).SPRITES = SPRITES;
    console.log('[sprites] loaded');
  } catch (e){
    console.warn('[sprites] failed to load, using vector fallback', e);
    (window.GAME ||= {}).SPRITES = SPRITES;
  }
}

export function renderSprites(ctx){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!ctx || !G.FIGHTERS || !G.ANCHORS) return;
  drawHead(ctx, G.FIGHTERS.player, C, G.ANCHORS.player);
  drawHead(ctx, G.FIGHTERS.npc, C, G.ANCHORS.npc);
}

function drawHead(ctx, F, C, A){
  if (!F || !A) return;
  const s = C.actor?.scale ?? 0.7;
  const r = (C.parts?.head?.r ?? 12) * s;
  const centerX = A.torsoTop[0];
  const centerY = A.torsoTop[1] - r * 0.9;
  const torsoAng = (F.jointAngles?.torso || 0) + (F.facingRad || 0);

  if (SPRITES.ready && SPRITES.head){
    const img = SPRITES.head;
    const w = r*2, h = r*2;
    ctx.save();
    ctx.translate(centerX, centerY);
    ctx.rotate(torsoAng * 0.25); // mild tilt
    // Flip if facing left
    if (Math.cos(F.facingRad||0) < 0){ ctx.scale(-1, 1); }
    ctx.drawImage(img, -w/2, -h/2, w, h);
    ctx.restore();
  } else {
    // Fallback vector head
    ctx.save();
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI*2);
    ctx.fillStyle = 'rgba(255,255,255,.9)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.stroke();
    ctx.restore();
  }
}
