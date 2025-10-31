// render.js — compute anchors from F.jointAngles (rad) and draw stick rig
// v19 angle basis: 0 rad = up; segment end uses (sin,-cos).
// Outputs window.GAME.ANCHORS for use by sprites.js.

function segPos(x,y,len,ang){ return [ x + len*Math.sin(ang), y - len*Math.cos(ang) ]; }
function clamp(v,min,max){ return Math.max(min, Math.min(max, v)); }
function rad(v){ return (v==null?0:v); }

function lengthsFor(C, fighterName){
  const s = (C.actor?.scale ?? 0.7) * (C.fighters?.[fighterName]?.actor?.scale ?? 1);
  const P = C.parts || {};
  const Pf = (C.fighters?.[fighterName]?.parts) || {};
  const torso = (Pf.torso?.len ?? P.torso?.len ?? 60) * s;
  const armU  = (Pf.arm?.upper ?? P.arm?.upper ?? 50) * s;
  const armL  = (Pf.arm?.lower ?? P.arm?.lower ?? 50) * s;
  const legU  = (Pf.leg?.upper ?? P.leg?.upper ?? 40) * s;
  const legL  = (Pf.leg?.lower ?? P.leg?.lower ?? 40) * s;
  const hitW  = (Pf.hitbox?.w   ?? P.hitbox?.w   ?? 120) * s;
  const hitH  = (Pf.hitbox?.h   ?? P.hitbox?.h   ?? 160) * s;
  return { torso, armU, armL, legU, legL, hitW, hitH, scale: s };
}

function computeAnchorsFor(F, C, name){
  const L = lengthsFor(C, name);
  const gy = Math.round((C.groundRatio||0.7) * (C.canvas?.h || 460));
  const px = F.pos?.x ?? 0;
  const py = F.pos?.y ?? (gy-1);

  // angles (rad)
  const tAbs = rad(F.jointAngles?.torso) + rad(F.facingRad);
  // shoulders relative to torso; elbows relative to shoulders
  const lShAbs = tAbs + rad(F.jointAngles?.lShoulder);
  const rShAbs = tAbs + rad(F.jointAngles?.rShoulder);
  const lElAbs = lShAbs + rad(F.jointAngles?.lElbow);
  const rElAbs = rShAbs + rad(F.jointAngles?.rElbow);
  // hips are ABS (config limits are absolute); knees are relative
  let lHipAbs = rad(F.jointAngles?.lHip);
  let rHipAbs = rad(F.jointAngles?.rHip);
  if (C.hierarchy?.legsFollowTorsoRotation){ lHipAbs += tAbs; rHipAbs += tAbs; }
  const lKnAbs = lHipAbs + rad(F.jointAngles?.lKnee);
  const rKnAbs = rHipAbs + rad(F.jointAngles?.rKnee);

  const torsoBot = [px, py];
  const torsoTop = segPos(px, py, L.torso, tAbs);
  // simple shoulder/hip spacing along torso perpendicular
  const sOff = 0.18 * L.hitW; // shoulder spread
  const hOff = 0.22 * L.hitW; // hip spread
  const perpX = Math.cos(tAbs), perpY = Math.sin(tAbs); // (cos,sin) is perp in our basis
  const lShoulderBase = [ torsoTop[0] - perpX*sOff, torsoTop[1] + perpY*sOff ];
  const rShoulderBase = [ torsoTop[0] + perpX*sOff, torsoTop[1] - perpY*sOff ];
  const lHipBase      = [ torsoBot[0] - perpX*hOff, torsoBot[1] + perpY*hOff ];
  const rHipBase      = [ torsoBot[0] + perpX*hOff, torsoBot[1] - perpY*hOff ];

  const lElbow = segPos(lShoulderBase[0], lShoulderBase[1], L.armU, lShAbs);
  const rElbow = segPos(rShoulderBase[0], rShoulderBase[1], L.armU, rShAbs);
  const lHand  = segPos(lElbow[0], lElbow[1], L.armL, lElAbs);
  const rHand  = segPos(rElbow[0], rElbow[1], L.armL, rElAbs);

  const lKnee  = segPos(lHipBase[0], lHipBase[1], L.legU, lHipAbs);
  const rKnee  = segPos(rHipBase[0], rHipBase[1], L.legU, rHipAbs);
  const lFoot  = segPos(lKnee[0], lKnee[1], L.legL, lKnAbs);
  const rFoot  = segPos(rKnee[0], rKnee[1], L.legL, rKnAbs);

  return {
    torsoAbs: tAbs,
    torsoBot, torsoTop,
    lShoulderBase, rShoulderBase, lElbow, rElbow, lHand, rHand,
    lHipBase, rHipBase, lKnee, rKnee, lFoot, rFoot
  };
}

function drawSegment(ctx, a, b){ ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); }
function dot(ctx, p, r=2){ ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fill(); }

export function renderAll(ctx){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  if (!ctx || !G.FIGHTERS) return;
  const camX = G.CAMERA?.x || 0;
  const colors = C.colors || { body:'#e5f0ff', left:'#86efac', right:'#93c5fd', guide:'#233044', hitbox:'#0ea5e9' };

  // compute anchors from jointAngles
  const pName = (G.selectedFighter && C.fighters?.[G.selectedFighter]) ? G.selectedFighter : (C.fighters?.TLETINGAN? 'TLETINGAN' : Object.keys(C.fighters||{})[0] || 'default');
  const Aplayer = computeAnchorsFor(G.FIGHTERS.player, C, pName);
  const Anpc    = computeAnchorsFor(G.FIGHTERS.npc,    C, pName);
  G.ANCHORS = { player: Aplayer, npc: Anpc };

  // draw stick in camera space
  ctx.save();
  ctx.translate(-camX, 0);
  ctx.lineWidth = 3; ctx.strokeStyle = colors.body; ctx.fillStyle = colors.body;
  const A = Aplayer;
  drawSegment(ctx, A.torsoBot, A.torsoTop);
  drawSegment(ctx, A.lShoulderBase, A.lElbow); drawSegment(ctx, A.lElbow, A.lHand);
  drawSegment(ctx, A.rShoulderBase, A.rElbow); drawSegment(ctx, A.rElbow, A.rHand);
  drawSegment(ctx, A.lHipBase, A.lKnee); drawSegment(ctx, A.lKnee, A.lFoot);
  drawSegment(ctx, A.rHipBase, A.rKnee); drawSegment(ctx, A.rKnee, A.rFoot);
  dot(ctx, A.torsoTop, 2); dot(ctx, A.torsoBot, 2);
  ctx.restore();
}
