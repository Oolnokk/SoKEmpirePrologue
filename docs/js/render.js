// render.js — simple stick-figure renderer + camera translation + collider viz + anchors
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

function cos(a){ return Math.cos(a); }
function sin(a){ return Math.sin(a); }
function seg(x,y,len,ang){ return [x + cos(ang)*len, y + sin(ang)*len]; }

function renderFighter(ctx, F, C){
  if(!F) return;
  const s = C.actor?.scale ?? 0.70;
  const hb = (C.parts?.hitbox?.h ?? 100) * s;
  const torsoLen = hb * 0.5;
  const centerX = F.pos.x;
  const centerY = F.pos.y;
  const torsoTop = seg(centerX, centerY, -torsoLen/2, Math.PI/2);
  const torsoBot = seg(centerX, centerY,  torsoLen/2, Math.PI/2);

  const shoulderSpan = 24 * s;
  const hipSpan = 18 * s;
  const lShoulderBase = [torsoTop[0] - shoulderSpan/2, torsoTop[1]];
  const rShoulderBase = [torsoTop[0] + shoulderSpan/2, torsoTop[1]];
  const lHipBase = [torsoBot[0] - hipSpan/2, torsoBot[1]];
  const rHipBase = [torsoBot[0] + hipSpan/2, torsoBot[1]];

  const armUpper = (C.parts?.arm?.upper ?? 20) * s;
  const armLower = (C.parts?.arm?.lower ?? 20) * s;
  const legUpper = (C.parts?.leg?.upper ?? 26) * s;
  const legLower = (C.parts?.leg?.lower ?? 26) * s;

  const lSh = (F.jointAngles?.lShoulder ?? -0.5) + F.facingRad;
  const lEl = (F.jointAngles?.lElbow ?? -0.8);
  const rSh = (F.jointAngles?.rShoulder ??  0.5) + F.facingRad;
  const rEl = (F.jointAngles?.rElbow ??   0.8);
  const lHip = (F.jointAngles?.lHip ?? 0.2) + F.facingRad;
  const lK  = (F.jointAngles?.lKnee ?? 0.2);
  const rHip = (F.jointAngles?.rHip ?? -0.2) + F.facingRad;
  const rK  = (F.jointAngles?.rKnee ?? -0.2);

  const lElbow = seg(lShoulderBase[0], lShoulderBase[1], armUpper, lSh);
  const lHand  = seg(lElbow[0], lElbow[1], armLower, lSh + lEl);
  const rElbow = seg(rShoulderBase[0], rShoulderBase[1], armUpper, rSh);
  const rHand  = seg(rElbow[0], rElbow[1], armLower, rSh + rEl);

  const lKnee = seg(lHipBase[0], lHipBase[1], legUpper, lHip);
  const lFoot = seg(lKnee[0], lKnee[1], legLower, lHip + lK);
  const rKnee = seg(rHipBase[0], rHipBase[1], legUpper, rHip);
  const rFoot = seg(rKnee[0], rKnee[1], legLower, rHip + rK);

  // Expose anchors for sprite renderer
  (window.GAME ||= {}).ANCHORS ||= {};
  window.GAME.ANCHORS[F.id] = {
    torsoTop, torsoBot, lShoulderBase, rShoulderBase, lHipBase, rHipBase,
    lElbow, lHand, rElbow, rHand, lKnee, lFoot, rKnee, rFoot,
    centerX, centerY, hb, s, torsoLen
  };

  // Lines
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(255,255,255,.9)';
  ctx.beginPath(); ctx.moveTo(torsoTop[0], torsoTop[1]); ctx.lineTo(torsoBot[0], torsoBot[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lShoulderBase[0], lShoulderBase[1]); ctx.lineTo(lElbow[0], lElbow[1]); ctx.lineTo(lHand[0], lHand[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rShoulderBase[0], rShoulderBase[1]); ctx.lineTo(rElbow[0], rElbow[1]); ctx.lineTo(rHand[0], rHand[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lHipBase[0], lHipBase[1]); ctx.lineTo(lKnee[0], lKnee[1]); ctx.lineTo(lFoot[0], lFoot[1]); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(rHipBase[0], rHipBase[1]); ctx.lineTo(rKnee[0], rKnee[1]); ctx.lineTo(rFoot[0], rFoot[1]); ctx.stroke();
  ctx.restore();

  // Colliders
  const G = window.GAME || {};
  if (G.COLLIDERS_POS && F.isPlayer){
    G.COLLIDERS_POS.handL = { x: lHand[0], y: lHand[1] };
    G.COLLIDERS_POS.handR = { x: rHand[0], y: rHand[1] };
    G.COLLIDERS_POS.footL = { x: lFoot[0], y: lFoot[1] };
    G.COLLIDERS_POS.footR = { x: rFoot[0], y: rFoot[1] };
    if (G.colliders?.drawAttackColliders){ G.colliders.drawAttackColliders(G.COLLIDERS_POS); }
  }
}
