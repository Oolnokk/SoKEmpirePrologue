// render.js — v19-accurate rig math wired for sprites.js (compat arrays extended)
// Angles in radians. 0 = up. Forward = (sin,-cos). Perp = (cos,sin).

function segPos(x, y, len, ang) { return [x + len * Math.sin(ang), y - len * Math.cos(ang)]; }
function withAX(x, y, ang, off) { if (!off) return [x, y]; const ax = off.ax || 0, ay = off.ay || 0; const dx = ax * Math.sin(ang) + ay * Math.cos(ang); const dy = ax * -Math.cos(ang) + ay * Math.sin(ang); return [x + dx, y + dy]; }
function rad(v) { return v == null ? 0 : v; }

function pickFighterConfig(C, name) { const f = (C.fighters && (C.fighters[name] || C.fighters[Object.keys(C.fighters||{})[0] || ''])) || {}; return f; }
function lengths(C, fcfg) { const s = (C.actor?.scale ?? 1) * (fcfg.actor?.scale ?? 1); const P = C.parts || {}; const Pf = fcfg.parts || {}; return { torso:(Pf.torso?.len ?? P.torso?.len ?? 60)*s, armU:(Pf.arm?.upper ?? P.arm?.upper ?? 50)*s, armL:(Pf.arm?.lower ?? P.arm?.lower ?? 50)*s, legU:(Pf.leg?.upper ?? P.leg?.upper ?? 40)*s, legL:(Pf.leg?.lower ?? P.leg?.lower ?? 40)*s, hbW:(Pf.hitbox?.w ?? P.hitbox?.w ?? 120)*s, hbH:(Pf.hitbox?.h ?? P.hitbox?.h ?? 160)*s, hbR:(Pf.hitbox?.r ?? P.hitbox?.r ?? 60)*s, scale:s }; }
function pickOffsets(C, fcfg) { function deepMerge(a,b){ const o = {...(a||{})}; for(const k in (b||{})){ o[k] = (typeof b[k]==='object' && !Array.isArray(b[k])) ? deepMerge(a?.[k], b[k]) : b[k]; } return o; } return deepMerge(C.offsets || {}, fcfg.offsets || {}); }

function computeAnchorsForFighter(F, C, fighterName) {
  const fcfg = pickFighterConfig(C, fighterName); const L = lengths(C, fcfg); const OFF = pickOffsets(C, fcfg); const hbAttach = (fcfg.parts?.hitbox?.torsoAttach || C.parts?.hitbox?.torsoAttach || { nx:0.5, ny:0.7 });
  const centerX = F.pos?.x ?? 0; const centerY = F.pos?.y ?? ((C.groundRatio||0.7) * (C.canvas?.h||460)); const torsoAng = rad(F.jointAngles?.torso);
  const torsoAttach = { x: centerX + (hbAttach.nx - 0.5) * L.hbW, y: centerY + (hbAttach.ny - 0.5) * L.hbH };
  const base = withAX(torsoAttach.x, torsoAttach.y, torsoAng, OFF.torso?.origin);
  const torsoTopArr = segPos(base[0], base[1], L.torso, torsoAng);
  const neckBaseArr     = withAX(torsoTopArr[0], torsoTopArr[1], torsoAng, OFF.torso?.neck);
  const shoulderBaseArr = withAX(torsoTopArr[0], torsoTopArr[1], torsoAng, OFF.torso?.shoulder);
  const hipBaseArr      = withAX(base[0],       base[1],        torsoAng, OFF.torso?.hip);

  const lShoulderRel = rad(F.jointAngles?.lShoulder); const rShoulderRel = rad(F.jointAngles?.rShoulder); const lElbowRel = rad(F.jointAngles?.lElbow); const rElbowRel = rad(F.jointAngles?.rElbow);
  const lUpperAng = torsoAng + lShoulderRel; const rUpperAng = torsoAng + rShoulderRel;
  const lElbowPosArr = withAX(...segPos(shoulderBaseArr[0], shoulderBaseArr[1], L.armU, lUpperAng), lUpperAng, OFF.arm?.upper?.elbow);
  const rElbowPosArr = withAX(...segPos(shoulderBaseArr[0], shoulderBaseArr[1], L.armU, rUpperAng), rUpperAng, OFF.arm?.upper?.elbow);
  const lLowerAng = lUpperAng + lElbowRel; const rLowerAng = rUpperAng + rElbowRel;
  const lWristPosArr = withAX(...segPos(lElbowPosArr[0], lElbowPosArr[1], L.armL, lLowerAng), lLowerAng, OFF.arm?.lower?.origin);
  const rWristPosArr = withAX(...segPos(rElbowPosArr[0], rElbowPosArr[1], L.armL, rLowerAng), rLowerAng, OFF.arm?.lower?.origin);

  const legsFollow = !!C.hierarchy?.legsFollowTorsoRotation; const lHipAng = rad(F.jointAngles?.lHip) + (legsFollow ? torsoAng : 0); const rHipAng = rad(F.jointAngles?.rHip) + (legsFollow ? torsoAng : 0); const lKneeRel = rad(F.jointAngles?.lKnee); const rKneeRel = rad(F.jointAngles?.rKnee);
  const lKneePosArr = withAX(...segPos(hipBaseArr[0], hipBaseArr[1], L.legU, lHipAng), lHipAng, OFF.leg?.upper?.knee);
  const rKneePosArr = withAX(...segPos(hipBaseArr[0], hipBaseArr[1], L.legU, rHipAng), rHipAng, OFF.leg?.upper?.knee);
  const lFootPosArr = segPos(lKneePosArr[0], lKneePosArr[1], L.legL, lHipAng + lKneeRel);
  const rFootPosArr = segPos(rKneePosArr[0], rKneePosArr[1], L.legL, rHipAng + rKneeRel);

  // Build bone objects (also keep base points as pseudo-bones so mirror hits them)
  const B = {
    center:{x:centerX,y:centerY},
    torso:{x:base[0],y:base[1],len:L.torso,ang:torsoAng},
    head:{x:neckBaseArr[0],y:neckBaseArr[1],len: ((fcfg.parts?.head?.neck ?? C.parts?.head?.neck ?? 14) + 2*(fcfg.parts?.head?.radius ?? C.parts?.head?.radius ?? 16)) * (L.scale/(C.actor?.scale||1)) * (C.actor?.scale||1), ang:torsoAng},
    shoulderBase:{x:shoulderBaseArr[0],y:shoulderBaseArr[1]},
    hipBase:{x:hipBaseArr[0],y:hipBaseArr[1]},
    neckBase:{x:neckBaseArr[0],y:neckBaseArr[1]},
    torsoTop:{x:torsoTopArr[0],y:torsoTopArr[1]},

    arm_L_upper:{x:shoulderBaseArr[0],y:shoulderBaseArr[1],len:L.armU,ang:lUpperAng},
    arm_L_lower:{x:lElbowPosArr[0],y:lElbowPosArr[1],len:L.armL,ang:lLowerAng},
    arm_R_upper:{x:shoulderBaseArr[0],y:shoulderBaseArr[1],len:L.armU,ang:rUpperAng},
    arm_R_lower:{x:rElbowPosArr[0],y:rElbowPosArr[1],len:L.armL,ang:rLowerAng},

    leg_L_upper:{x:hipBaseArr[0],y:hipBaseArr[1],len:L.legU,ang:lHipAng},
    leg_L_lower:{x:lKneePosArr[0],y:lKneePosArr[1],len:L.legL,ang:lHipAng+lKneeRel},
    leg_R_upper:{x:hipBaseArr[0],y:hipBaseArr[1],len:L.legU,ang:rHipAng},
    leg_R_lower:{x:rKneePosArr[0],y:rKneePosArr[1],len:L.legL,ang:rHipAng+rKneeRel}
  };

  // Mirror around hitbox center if facing left
  const facingRad = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);
  const flipLeft = Math.cos(facingRad) < 0;
  if (flipLeft) { const cx = centerX; const mirrorX = (x)=> (cx*2 - x); for (const k in B){ const b=B[k]; if (b && typeof b==='object' && 'x' in b && 'y' in b){ b.x = mirrorX(b.x); } } }

  return { B, L };
}

function toCompatArrays(obj){ const B=obj.B; const end=(b)=>segPos(b.x,b.y,b.len,b.ang); return {
  torsoAbs: B.torso.ang,
  torsoBot: [B.torso.x, B.torso.y],
  torsoTop: [B.torsoTop.x, B.torsoTop.y],
  neckBase: [B.neckBase.x, B.neckBase.y],
  shoulderBase: [B.shoulderBase.x, B.shoulderBase.y],
  hipBase: [B.hipBase.x, B.hipBase.y],
  lShoulderBase: [B.arm_L_upper.x, B.arm_L_upper.y],
  rShoulderBase: [B.arm_R_upper.x, B.arm_R_upper.y],
  lElbow: [B.arm_L_lower.x, B.arm_L_lower.y],
  rElbow: [B.arm_R_lower.x, B.arm_R_lower.y],
  lHand: end(B.arm_L_lower),
  rHand: end(B.arm_R_lower),
  lHipBase: [B.leg_L_upper.x, B.leg_L_upper.y],
  rHipBase: [B.leg_R_upper.x, B.leg_R_upper.y],
  lKnee: [B.leg_L_lower.x, B.leg_L_lower.y],
  rKnee: [B.leg_R_lower.x, B.leg_R_lower.y],
  lFoot: end(B.leg_L_lower),
  rFoot: end(B.leg_R_lower)
}; }

function drawStick(ctx, B) { ctx.lineCap='round'; ctx.lineWidth=3; ctx.strokeStyle='#a8b3c3'; const seg=(sx,sy,len,ang)=>{ const [ex,ey]=segPos(sx,sy,len,ang); ctx.beginPath(); ctx.moveTo(sx,sy); ctx.lineTo(ex,ey); ctx.stroke(); }; seg(B.torso.x,B.torso.y,B.torso.len,B.torso.ang); seg(B.arm_L_upper.x,B.arm_L_upper.y,B.arm_L_upper.len,B.arm_L_upper.ang); seg(B.arm_L_lower.x,B.arm_L_lower.y,B.arm_L_lower.len,B.arm_L_lower.ang); seg(B.arm_R_upper.x,B.arm_R_upper.y,B.arm_R_upper.len,B.arm_R_upper.ang); seg(B.arm_R_lower.x,B.arm_R_lower.y,B.arm_R_lower.len,B.arm_R_lower.ang); seg(B.leg_L_upper.x,B.leg_L_upper.y,B.leg_L_upper.len,B.leg_L_upper.ang); seg(B.leg_L_lower.x,B.leg_L_lower.y,B.leg_L_lower.len,B.leg_L_lower.ang); seg(B.leg_R_upper.x,B.leg_R_upper.y,B.leg_R_upper.len,B.leg_R_upper.ang); seg(B.leg_R_lower.x,B.leg_R_lower.y,B.leg_R_lower.len,B.leg_R_lower.ang); }

export function renderAll(ctx){ const G=(window.GAME ||= {}); const C=(window.CONFIG || {}); if(!ctx||!G.FIGHTERS) return; const fName=(G.selectedFighter && C.fighters?.[G.selectedFighter])? G.selectedFighter : (C.fighters?.TLETINGAN? 'TLETINGAN' : Object.keys(C.fighters||{})[0] || 'default'); const player=computeAnchorsForFighter(G.FIGHTERS.player,C,fName); const npc=computeAnchorsForFighter(G.FIGHTERS.npc,C,fName); (G.ANCHORS_OBJ ||= {}); G.ANCHORS_OBJ.player=player.B; G.ANCHORS_OBJ.npc=npc.B; (G.ANCHORS ||= {}); G.ANCHORS.player=toCompatArrays(player); G.ANCHORS.npc=toCompatArrays(npc); const camX=G.CAMERA?.x||0; ctx.save(); ctx.translate(-camX,0); drawStick(ctx, player.B); ctx.restore(); }
