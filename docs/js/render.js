// render.js — per-fighter parts (lengths), publish torsoAbs for sprites
export function renderAll(ctx){
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  if (!ctx || !G.FIGHTERS) return;
  const camX = G.CAMERA?.x || 0;
  G.ANCHORS ||= {};
  ctx.save();
  ctx.translate(-camX, 0);
  renderFighter(ctx, G.FIGHTERS.npc, C);
  renderFighter(ctx, G.FIGHTERS.player, C);
  ctx.restore();
}

function pickFighterName(C){
  const sel = (window.GAME && window.GAME.selectedFighter) || null;
  if (sel && C.fighters?.[sel]) return sel;
  if (C.fighters){ if (C.fighters.TLETINGAN) return 'TLETINGAN'; const ks=Object.keys(C.fighters); if (ks.length) return ks[0]; }
  return null;
}

function resolveParts(C){
  const name = pickFighterName(C);
  const prof = (C.fighters?.[name] || {});
  const s  = (prof.actor?.scale ?? C.actor?.scale ?? 0.7);
  const parts = {
    hitboxH: (prof.parts?.hitbox?.h ?? C.parts?.hitbox?.h ?? 100) * s,
    torsoLen: (prof.parts?.torso?.len ?? C.parts?.torso?.len ?? 60) * s,
    armUpper: (prof.parts?.arm?.upper ?? C.parts?.arm?.upper ?? 20) * s,
    armLower: (prof.parts?.arm?.lower ?? C.parts?.arm?.lower ?? 20) * s,
    legUpper: (prof.parts?.leg?.upper ?? C.parts?.leg?.upper ?? 26) * s,
    legLower: (prof.parts?.leg?.lower ?? C.parts?.leg?.lower ?? 26) * s,
    s
  };
  return parts;
}

function cos(a){ return Math.cos(a); }
function seg(x,y,len,ang){ return [x + cos(ang)*len, y + Math.sin(ang)*len]; }

function renderFighter(ctx, F, C){
  if(!F) return;
  const P = resolveParts(C);
  const centerX = F.pos.x;
  const centerY = F.pos.y;
  const torsoLen = P.torsoLen;
  const torsoAbs = (F.jointAngles?.torso ?? 0) + (F.facingRad || 0);
  const torsoTop = seg(centerX, centerY, -torsoLen/2, Math.PI/2);
  const torsoBot = seg(centerX, centerY,  torsoLen/2, Math.PI/2);

  const shoulderSpan = Math.max(16*P.s, P.torsoLen*0.35);
  const hipSpan = Math.max(12*P.s, P.torsoLen*0.28);
  const lShoulderBase = [torsoTop[0] - shoulderSpan/2, torsoTop[1]];
  const rShoulderBase = [torsoTop[0] + shoulderSpan/2, torsoTop[1]];
  const lHipBase = [torsoBot[0] - hipSpan/2, torsoBot[1]];
  const rHipBase = [torsoBot[0] + hipSpan/2, torsoBot[1]];

  const lSh = (F.jointAngles?.lShoulder ?? -0.5) + F.facingRad;
  const lEl = (F.jointAngles?.lElbow ?? -0.8);
  const rSh = (F.jointAngles?.rShoulder ??  0.5) + F.facingRad;
  const rEl = (F.jointAngles?.rElbow ??   0.8);
  const lHip = (F.jointAngles?.lHip ?? 0.2) + F.facingRad;
  const lK  = (F.jointAngles?.lKnee ?? 0.2);
  const rHip = (F.jointAngles?.rHip ?? -0.2) + F.facingRad;
  const rK  = (F.jointAngles?.rKnee ?? -0.2);

  const lElbow = seg(lShoulderBase[0], lShoulderBase[1], P.armUpper, lSh);
  const lHand  = seg(lElbow[0], lElbow[1], P.armLower, lSh + lEl);
  const rElbow = seg(rShoulderBase[0], rShoulderBase[1], P.armUpper, rSh);
  const rHand  = seg(rElbow[0], rElbow[1], P.armLower, rSh + rEl);

  const lKnee = seg(lHipBase[0], lHipBase[1], P.legUpper, lHip);
  const lFoot = seg(lKnee[0], lKnee[1], P.legLower, lHip + lK);
  const rKnee = seg(rHipBase[0], rHipBase[1], P.legUpper, rHip);
  const rFoot = seg(rKnee[0], rKnee[1], P.legLower, rHip + rK);

  (window.GAME ||= {}).ANCHORS ||= {};
  window.GAME.ANCHORS[F.id] = {
    torsoTop, torsoBot, lShoulderBase, rShoulderBase, lHipBase, rHipBase,
    lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot,
    centerX, centerY, hb: P.hitboxH, s: P.s, torsoLen, torsoAbs, facingRad: (F.facingRad||0)
  };

  // Stick debug underneath
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.35)';
  const line=(a,b)=>{ ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); };
  line(torsoTop, torsoBot);
  line(lShoulderBase, lElbow); line(lElbow, lHand);
  line(rShoulderBase, rElbow); line(rElbow, rHand);
  line(lHipBase, lKnee);       line(lKnee, lFoot);
  line(rHipBase, rKnee);       line(rKnee, rFoot);
  ctx.restore();

  const G = window.GAME || {};
  if (G.COLLIDERS_POS && F.isPlayer){
    G.COLLIDERS_POS.handL = { x: lHand[0], y: lHand[1] };
    G.COLLIDERS_POS.handR = { x: rHand[0], y: rHand[1] };
    G.COLLIDERS_POS.footL = { x: lFoot[0], y: lFoot[1] };
    G.COLLIDERS_POS.footR = { x: rFoot[0], y: rFoot[1] };
    if (G.colliders?.drawAttackColliders){ G.colliders.drawAttackColliders(G.COLLIDERS_POS); }
  }
}
