// render.js — v19-accurate rig math wired for sprites.js (with compat arrays for legacy sprites.js)
// Angles in radians. 0 = up. Forward = (sin,-cos). Perp = (cos,sin).
// We compute anchors from CONFIG offsets, then mirror around hitbox center when facing left.

function segPos(x, y, len, ang) {
  return [x + len * Math.sin(ang), y - len * Math.cos(ang)];
}
function withAX(x, y, ang, off) {
  if (!off) return [x, y];
  const ax = off.ax || 0, ay = off.ay || 0;
  const dx = ax * Math.sin(ang) + ay * Math.cos(ang);
  const dy = ax * -Math.cos(ang) + ay * Math.sin(ang);
  return [x + dx, y + dy];
}

function rad(v) { return v == null ? 0 : v; }

function pickFighterConfig(C, name) {
  const f = (C.fighters && (C.fighters[name] || C.fighters[Object.keys(C.fighters||{})[0] || ''])) || {};
  return f;
}

function lengths(C, fcfg) {
  const s = (C.actor?.scale ?? 1) * (fcfg.actor?.scale ?? 1);
  const P = C.parts || {};
  const Pf = fcfg.parts || {};
  return {
    torso: (Pf.torso?.len ?? P.torso?.len ?? 60) * s,
    armU:  (Pf.arm?.upper ?? P.arm?.upper ?? 50) * s,
    armL:  (Pf.arm?.lower ?? P.arm?.lower ?? 50) * s,
    legU:  (Pf.leg?.upper ?? P.leg?.upper ?? 40) * s,
    legL:  (Pf.leg?.lower ?? P.leg?.lower ?? 40) * s,
    hbW:   (Pf.hitbox?.w   ?? P.hitbox?.w   ?? 120) * s,
    hbH:   (Pf.hitbox?.h   ?? P.hitbox?.h   ?? 160) * s,
    hbR:   (Pf.hitbox?.r   ?? P.hitbox?.r   ?? 60)  * s,
    scale: s
  };
}

function pickOffsets(C, fcfg) {
  function deepMerge(a,b){ const o = {...(a||{})}; for(const k in (b||{})){ o[k] = (typeof b[k]==='object' && !Array.isArray(b[k])) ? deepMerge(a?.[k], b[k]) : b[k]; } return o; }
  return deepMerge(C.offsets || {}, fcfg.offsets || {});
}

function computeAnchorsForFighter(F, C, fighterName) {
  const fcfg = pickFighterConfig(C, fighterName);
  const L = lengths(C, fcfg);
  const OFF = pickOffsets(C, fcfg);
  const hbAttach = (fcfg.parts?.hitbox?.torsoAttach || C.parts?.hitbox?.torsoAttach || { nx:0.5, ny:0.7 });

  const centerX = F.pos?.x ?? 0;
  const centerY = F.pos?.y ?? ((C.groundRatio||0.7) * (C.canvas?.h||460));
  const torsoAng = rad(F.jointAngles?.torso);

  // Hitbox attachment → torso base/top
  const torsoAttach = { x: centerX + (hbAttach.nx - 0.5) * L.hbW, y: centerY + (hbAttach.ny - 0.5) * L.hbH };
  const base = withAX(torsoAttach.x, torsoAttach.y, torsoAng, OFF.torso?.origin);
  const torsoTop = segPos(base[0], base[1], L.torso, torsoAng);

  // Neck, shoulder, hip bases from CONFIG.offsets (v19 behavior)
  const neckBase     = withAX(torsoTop[0], torsoTop[1], torsoAng, OFF.torso?.neck);
  const shoulderBase = withAX(torsoTop[0], torsoTop[1], torsoAng, OFF.torso?.shoulder);
  const hipBase      = withAX(base[0],      base[1],     torsoAng, OFF.torso?.hip);

  // Arms: torso-relative shoulders; elbows relative to upper-arm
  const lShoulderRel = rad(F.jointAngles?.lShoulder);
  const rShoulderRel = rad(F.jointAngles?.rShoulder);
  const lElbowRel    = rad(F.jointAngles?.lElbow);
  const rElbowRel    = rad(F.jointAngles?.rElbow);

  const lUpperAng = torsoAng + lShoulderRel;
  const rUpperAng = torsoAng + rShoulderRel;
  const lElbowPos = withAX(...segPos(shoulderBase[0], shoulderBase[1], L.armU, lUpperAng), lUpperAng, OFF.arm?.upper?.elbow);
  const rElbowPos = withAX(...segPos(shoulderBase[0], shoulderBase[1], L.armU, rUpperAng), rUpperAng, OFF.arm?.upper?.elbow);

  const lLowerAng = lUpperAng + lElbowRel;
  const rLowerAng = rUpperAng + rElbowRel;
  const lWristPos = withAX(...segPos(lElbowPos[0], lElbowPos[1], L.armL, lLowerAng), lLowerAng, OFF.arm?.lower?.origin);
  const rWristPos = withAX(...segPos(rElbowPos[0], rElbowPos[1], L.armL, rLowerAng), rLowerAng, OFF.arm?.lower?.origin);

  // Legs: absolute hips; knees relative; optionally add torso rot
  const legsFollow = !!C.hierarchy?.legsFollowTorsoRotation;
  const lHipAng = rad(F.jointAngles?.lHip) + (legsFollow ? torsoAng : 0);
  const rHipAng = rad(F.jointAngles?.rHip) + (legsFollow ? torsoAng : 0);
  const lKneeRel = rad(F.jointAngles?.lKnee);
  const rKneeRel = rad(F.jointAngles?.rKnee);

  const lKneePos = withAX(...segPos(hipBase[0], hipBase[1], L.legU, lHipAng), lHipAng, OFF.leg?.upper?.knee);
  const rKneePos = withAX(...segPos(hipBase[0], hipBase[1], L.legU, rHipAng), rHipAng, OFF.leg?.upper?.knee);
  const lFootPos = segPos(lKneePos[0], lKneePos[1], L.legL, lHipAng + lKneeRel);
  const rFootPos = segPos(rKneePos[0], rKneePos[1], L.legL, rHipAng + rKneeRel);

  // Head bone (neck + 2*radius) like v19
  const headNeck = (fcfg.parts?.head?.neck ?? C.parts?.head?.neck ?? 14) * L.scale / (C.actor?.scale || 1);
  const headRad  = (fcfg.parts?.head?.radius ?? C.parts?.head?.radius ?? 16) * L.scale / (C.actor?.scale || 1);
  const headLen  = (headNeck + 2*headRad) * (C.actor?.scale ?? 1);

  // Object bones (start x,y,len,ang)
  const B = {
    center: { x: centerX, y: centerY },
    torso:  { x: base[0], y: base[1], len: L.torso, ang: torsoAng },
    head:   { x: neckBase[0], y: neckBase[1], len: headLen, ang: torsoAng },

    arm_L_upper: { x: shoulderBase[0], y: shoulderBase[1], len: L.armU, ang: lUpperAng },
    arm_L_lower: { x: lElbowPos[0],   y: lElbowPos[1],   len: L.armL, ang: lLowerAng },
    arm_R_upper: { x: shoulderBase[0], y: shoulderBase[1], len: L.armU, ang: rUpperAng },
    arm_R_lower: { x: rElbowPos[0],   y: rElbowPos[1],   len: L.armL, ang: rLowerAng },

    leg_L_upper: { x: hipBase[0], y: hipBase[1], len: L.legU, ang: lHipAng },
    leg_L_lower: { x: lKneePos[0], y: lKneePos[1], len: L.legL, ang: lHipAng + lKneeRel },
    leg_R_upper: { x: hipBase[0], y: hipBase[1], len: L.legU, ang: rHipAng },
    leg_R_lower: { x: rKneePos[0], y: rKneePos[1], len: L.legL, ang: rHipAng + rKneeRel },

    hitbox: { w: L.hbW, h: L.hbH, r: L.hbR }
  };

  // Mirror by hitbox center if facing left (facingRad π)
  const facingRad = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);
  const flipLeft = Math.cos(facingRad) < 0;
  if (flipLeft) {
    const cx = centerX;
    const mirrorX = (x) => (cx * 2 - x);
    for (const k of Object.keys(B)) {
      const b = B[k];
      if (b && typeof b === 'object' && 'x' in b && 'y' in b) {
        b.x = mirrorX(b.x);
      }
    }
  }

  return B;
}

// --- Compatibility layer for legacy sprites.js (expects arrays like lShoulderBase, etc.) ---
function endPos(b){ return segPos(b.x, b.y, b.len, b.ang); }
function toCompatArrays(B){
  return {
    torsoAbs: B.torso.ang,
    torsoBot: [B.torso.x, B.torso.y],
    torsoTop: endPos(B.torso),
    lShoulderBase: [B.arm_L_upper.x, B.arm_L_upper.y],
    rShoulderBase: [B.arm_R_upper.x, B.arm_R_upper.y],
    lElbow: [B.arm_L_lower.x, B.arm_L_lower.y],
    rElbow: [B.arm_R_lower.x, B.arm_R_lower.y],
    lHand: endPos(B.arm_L_lower),
    rHand: endPos(B.arm_R_lower),
    lHipBase: [B.leg_L_upper.x, B.leg_L_upper.y],
    rHipBase: [B.leg_R_upper.x, B.leg_R_upper.y],
    lKnee: [B.leg_L_lower.x, B.leg_L_lower.y],
    rKnee: [B.leg_R_lower.x, B.leg_R_lower.y],
    lFoot: endPos(B.leg_L_lower),
    rFoot: endPos(B.leg_R_lower)
  };
}

function drawStick(ctx, B) {
  ctx.lineCap = 'round'; ctx.lineWidth = 3; ctx.strokeStyle = '#a8b3c3';
  const seg = (sx,sy,len,ang)=>{ const [ex,ey]=segPos(sx,sy,len,ang); ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke(); };
  seg(B.torso.x, B.torso.y, B.torso.len, B.torso.ang);
  seg(B.arm_L_upper.x, B.arm_L_upper.y, B.arm_L_upper.len, B.arm_L_upper.ang);
  seg(B.arm_L_lower.x, B.arm_L_lower.y, B.arm_L_lower.len, B.arm_L_lower.ang);
  seg(B.arm_R_upper.x, B.arm_R_upper.y, B.arm_R_upper.len, B.arm_R_upper.ang);
  seg(B.arm_R_lower.x, B.arm_R_lower.y, B.arm_R_lower.len, B.arm_R_lower.ang);
  seg(B.leg_L_upper.x, B.leg_L_upper.y, B.leg_L_upper.len, B.leg_L_upper.ang);
  seg(B.leg_L_lower.x, B.leg_L_lower.y, B.leg_L_lower.len, B.leg_L_lower.ang);
  seg(B.leg_R_upper.x, B.leg_R_upper.y, B.leg_R_upper.len, B.leg_R_upper.ang);
  seg(B.leg_R_lower.x, B.leg_R_lower.y, B.leg_R_lower.len, B.leg_R_lower.ang);
}

export function renderAll(ctx) {
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  if (!ctx || !G.FIGHTERS) return;

  const fName = (G.selectedFighter && C.fighters?.[G.selectedFighter])
    ? G.selectedFighter
    : (C.fighters?.TLETINGAN ? 'TLETINGAN' : Object.keys(C.fighters||{})[0] || 'default');

  const playerB = computeAnchorsForFighter(G.FIGHTERS.player, C, fName);
  const npcB    = computeAnchorsForFighter(G.FIGHTERS.npc,    C, fName);

  // Export both object bones and legacy arrays so sprites.js continues to work
  (G.ANCHORS_OBJ ||= {}); G.ANCHORS_OBJ.player = playerB; G.ANCHORS_OBJ.npc = npcB;
  (G.ANCHORS ||= {});     G.ANCHORS.player     = toCompatArrays(playerB); G.ANCHORS.npc = toCompatArrays(npcB);

  const camX = G.CAMERA?.x || 0;
  ctx.save();
  ctx.translate(-camX, 0);
  drawStick(ctx, playerB);
  // drawStick(ctx, npcB);
  ctx.restore();
}
