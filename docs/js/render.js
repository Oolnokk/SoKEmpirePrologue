// render.js (v3): widen shoulder/hip spacing; keep vector-mirror flip; expose facingSign
function segPosFacing(x,y,len,ang,dir){ return [ x + len*(dir*Math.sin(ang)), y - len*Math.cos(ang) ]; }
function perpFacing(ang,dir){ return [ dir*Math.cos(ang), Math.sin(ang) ]; }
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
  const dir = (F.facingSign===-1) ? -1 : ( (F.facingSign===1) ? 1 : ((F.facingRad||0) > 1 ? -1 : 1) );

  // base absolute (no facing baked in)
  const tAbs = rad(F.jointAngles?.torso);
  const lShAbs = tAbs + rad(F.jointAngles?.lShoulder);
  const rShAbs = tAbs + rad(F.jointAngles?.rShoulder);
  const lElAbs = lShAbs + rad(F.jointAngles?.lElbow);
  const rElAbs = rShAbs + rad(F.jointAngles?.rElbow);
  let lHipAbs = rad(F.jointAngles?.lHip);
  let rHipAbs = rad(F.jointAngles?.rHip);
  if (C.hierarchy?.legsFollowTorsoRotation){ lHipAbs += tAbs; rHipAbs += tAbs; }
  const lKnAbs = lHipAbs + rad(F.jointAngles?.lKnee);
  const rKnAbs = rHipAbs + rad(F.jointAngles?.rKnee);

  const torsoBot = [px, py];
  const torsoTop = segPosFacing(px, py, L.torso, tAbs, dir);

  // widen spacing: pick the larger of torso length or hitbox width as basis
  const basis = Math.max(L.torso, L.hitW);
  const sOff = Math.max(0.28 * basis, 10); // shoulders further out
  const hOff = Math.max(0.32 * basis, 12); // hips a bit wider
  const perp = perpFacing(tAbs, dir);
  const lShoulderBase = [ torsoTop[0] - perp[0]*sOff, torsoTop[1] + perp[1]*sOff ];
  const rShoulderBase = [ torsoTop[0] + perp[0]*sOff, torsoTop[1] - perp[1]*sOff ];
  const lHipBase      = [ torsoBot[0] - perp[0]*hOff, torsoBot[1] + perp[1]*hOff ];
  const rHipBase      = [ torsoBot[0] + perp[0]*hOff, torsoBot[1] - perp[1]*hOff ];

  const lElbow = segPosFacing(lShoulderBase[0], lShoulderBase[1], L.armU, lShAbs, dir);
  const rElbow = segPosFacing(rShoulderBase[0], rShoulderBase[1], L.armU, rShAbs, dir);
  const lHand  = segPosFacing(lElbow[0], lElbow[1], L.armL, lElAbs, dir);
  const rHand  = segPosFacing(rElbow[0], rElbow[1], L.armL, rElAbs, dir);

  const lKnee  = segPosFacing(lHipBase[0], lHipBase[1], L.legU, lHipAbs, dir);
  const rKnee  = segPosFacing(rHipBase[0], rHipBase[1], L.legU, rHipAbs, dir);
  const lFoot  = segPosFacing(lKnee[0], lKnee[1], L.legL, lKnAbs, dir);
  const rFoot  = segPosFacing(rKnee[0], rKnee[1], L.legL, rKnAbs, dir);

  return { torsoAbs: tAbs, torsoBot, torsoTop, lShoulderBase, rShoulderBase, lElbow, rElbow, lHand, rHand, lHipBase, rHipBase, lKnee, rKnee, lFoot, rFoot, facingSign: dir };
}

function drawSegment(ctx, a, b){ ctx.beginPath(); ctx.moveTo(a[0],a[1]); ctx.lineTo(b[0],b[1]); ctx.stroke(); }
function dot(ctx, p, r=2){ ctx.beginPath(); ctx.arc(p[0],p[1],r,0,Math.PI*2); ctx.fill(); }

export function renderAll(ctx){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  if (!ctx || !G.FIGHTERS) return;
  const camX = G.CAMERA?.x || 0;
  const colors = C.colors || { body:'#e5f0ff', left:'#86efac', right:'#93c5fd', guide:'#233044', hitbox:'#0ea5e9' };

  const pName = (G.selectedFighter && C.fighters?.[G.selectedFighter]) ? G.selectedFighter : (C.fighters?.TLETINGAN? 'TLETINGAN' : Object.keys(C.fighters||{})[0] || 'default');
  const Aplayer = computeAnchorsFor(G.FIGHTERS.player, C, pName);
  const Anpc    = computeAnchorsFor(G.FIGHTERS.npc,    C, pName);
  G.ANCHORS = { player: Aplayer, npc: Anpc };

  ctx.save();
  ctx.translate(-camX, 0);
  ctx.lineWidth = 3; ctx.strokeStyle = colors.body; ctx.fillStyle = colors.body;
  const A = Aplayer;
  drawSegment(ctx, A.torsoBot, A.torsoTop);
  drawSegment(ctx, A.lShoulderBase, A.lElbow); drawSegment(ctx, A.lElbow, A.lHand);
  drawSegment(ctx, A.rShoulderBase, A.rElbow); drawSegment(ctx, A.rElbow, A.rHand);
  drawSegment(ctx, A.lHipBase, A.lKnee);       drawSegment(ctx, A.lKnee, A.lFoot);
  drawSegment(ctx, A.rHipBase, A.rKnee);       drawSegment(ctx, A.rKnee, A.rFoot);
  dot(ctx, A.torsoTop, 2); dot(ctx, A.torsoBot, 2);
  ctx.restore();
}
