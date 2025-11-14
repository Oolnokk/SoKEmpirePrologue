// render.js — v20-compatible rig math with 'up' as zero angle
// Angle basis is centralized in math-utils.js so sprites.js stays in sync (always 'up' convention).
//
// === COORDINATE SYSTEM & MATH BASIS ===
// This module uses a coordinate system where:
// - Zero angle (0 radians) points UP (negative Y direction in screen space)
// - Positive angles rotate CLOCKWISE
// - ALL joint angles MUST be in RADIANS (animator.js converts from degrees)
//
// Basis math convention (implemented in math-utils.js basis() function):
// - Forward vector: fx = sin(angle), fy = -cos(angle)
//   This makes 0° point up, 90° point right, 180° point down, 270° point left
// - Right vector: rx = cos(angle), ry = sin(angle)
//   This is perpendicular to the forward vector (90° clockwise)
//
// The rad() function from math-utils.js is a null-safe accessor that returns the value as-is
// (or 0 if null). It does NOT convert degrees to radians - that conversion happens
// in animator.js via degToRadPose() before values reach this module.

import { angleZero as angleZeroUtil, basis as basisUtil, segPos, withAX as withAXUtil, rad, angleFromDelta as angleFromDeltaUtil, degToRad } from './math-utils.js?v=1';
import { getNpcDashTrail, getNpcAttackTrail } from './npc.js?v=2';
import { pickFighterConfig, lengths, pickOffsets } from './fighter-utils.js?v=1';

// === RENDER DEBUG CONFIGURATION ===
// Global config object for controlling what is rendered for debugging purposes
if (typeof window !== 'undefined') {
  window.RENDER_DEBUG = window.RENDER_DEBUG || {
    showSprites: true,   // Show sprite images
    showBones: true,     // Show skeleton bones
    showHitbox: true,    // Show hitbox overlay
    showBone: {          // Per-bone visibility (all default to true)
      torso: true,
      head: true,
      arm_L_upper: true,
      arm_L_lower: true,
      arm_R_upper: true,
      arm_R_lower: true,
      leg_L_upper: true,
      leg_L_lower: true,
      leg_R_upper: true,
      leg_R_lower: true
    }
  };
}

function angleZero(){ return 'up'; }
function basis(ang){ const c = Math.cos(ang), s = Math.sin(ang); return { fx:s, fy:-c, rx:c, ry:s }; }
function angleFromDelta(dx, dy){
  return Math.atan2(dx, -dy);
}

if (typeof window !== 'undefined') {
  window.ANGLE_ZERO = angleZero();
  window.BONE_BASIS = basis;
  window.BONE_SEG_POS = segPos;
  window.BONE_WITH_AX = withAX;
  window.BONE_ANGLE_FROM_DELTA = angleFromDelta;
}

// Wrapper for withAX that matches the signature used in render.js
function withAX(x, y, ang, off, len, units) {
  // Convert render.js offset format to math-utils format
  if (!off) return [x, y];
  
  let ax = 0, ay = 0, offsetUnits = '';
  
  if (Array.isArray(off)) {
    ax = +off[0] || 0;
    ay = +off[1] || 0;
  } else if (typeof off === 'object') {
    ax = +((off.ax ?? off.x) ?? 0) || 0;
    ay = +((off.ay ?? off.y) ?? 0) || 0;
    offsetUnits = (off.units || '').toString().toLowerCase();
  } else {
    return [x, y];
  }
  
  const unitStr = units || offsetUnits;
  return withAXUtil(x, y, ang, ax, ay, len || 1, unitStr);
}

function computeAnchorsForFighter(F, C, fallbackFighterName) {
  const profile = F?.renderProfile || {};
  const requestedName = profile.fighterName;
  const fighterName = (requestedName && C.fighters?.[requestedName]) ? requestedName : fallbackFighterName;
  const fcfg = pickFighterConfig(C, fighterName); const L = lengths(C, fcfg); const OFF = pickOffsets(C, fcfg); const hbAttach = (fcfg.parts?.hitbox?.torsoAttach || C.parts?.hitbox?.torsoAttach || { nx:0.5, ny:0.7 });
  const centerX = F.pos?.x ?? 0; const centerY = F.pos?.y ?? ((C.groundRatio||0.7) * (C.canvas?.h||460));
  const torsoAngRaw = F.jointAngles?.torso ?? 0; // already in radians from animator
  const torsoAng = torsoAngRaw; // with 'up' as zero, torso angle is used directly
  const torsoAttach = { x: centerX + (hbAttach.nx - 0.5) * L.hbW, y: centerY + (hbAttach.ny - 0.5) * L.hbH };
  const originBaseArr   = withAX(torsoAttach.x, torsoAttach.y, torsoAngRaw, OFF.torso?.origin);
  const hipBaseArr      = withAX(originBaseArr[0], originBaseArr[1], torsoAngRaw, OFF.torso?.hip);
  const torsoTopArr     = segPos(hipBaseArr[0], hipBaseArr[1], L.torso, torsoAng);
  const neckBaseArr     = withAX(torsoTopArr[0], torsoTopArr[1], torsoAng, OFF.torso?.neck);
  const shoulderBaseArr = withAX(torsoTopArr[0], torsoTopArr[1], torsoAng, OFF.torso?.shoulder);
  let lShoulderBaseArr = [...shoulderBaseArr];
  let rShoulderBaseArr = [...shoulderBaseArr];
  const breathOffsets = F.anim?.breath?.shoulderOffsets;
  if (breathOffsets){
    const torsoBasis = basis(torsoAngRaw);
    const applyOffset = (baseArr, spec) => {
      if (!spec) return baseArr;
      const ax = Number(spec.ax) || 0;
      const ay = Number(spec.ay) || 0;
      if (!ax && !ay) return baseArr;
      return [
        baseArr[0] + ax * torsoBasis.fx + ay * torsoBasis.rx,
        baseArr[1] + ax * torsoBasis.fy + ay * torsoBasis.ry
      ];
    };
    if (breathOffsets.left){
      lShoulderBaseArr = applyOffset(lShoulderBaseArr, breathOffsets.left);
    }
    if (breathOffsets.right){
      rShoulderBaseArr = applyOffset(rShoulderBaseArr, breathOffsets.right);
    }
  }

  const hitbox = {
    x: centerX,
    y: centerY,
    w: L.hbW,
    h: L.hbH,
    ang: torsoAngRaw,
    attachX: torsoAttach.x,
    attachY: torsoAttach.y
  };

  const lShoulderRel = F.jointAngles?.lShoulder ?? 0;
  const rShoulderRel = F.jointAngles?.rShoulder ?? 0;
  const lElbowRel = F.jointAngles?.lElbow ?? 0;
  const rElbowRel = F.jointAngles?.rElbow ?? 0;
  // Match reference: shoulder angles are relative to torso, so subtract torso from shoulder
  let lUpperAng = torsoAng + (lShoulderRel - torsoAngRaw);
  let rUpperAng = torsoAng + (rShoulderRel - torsoAngRaw);
  // Elbow angles accumulate consistently with addition (child angle relative to parent)
  let lLowerAng = lUpperAng + lElbowRel;
  let rLowerAng = rUpperAng + rElbowRel;

  const lElbowPosArr = withAX(...segPos(lShoulderBaseArr[0], lShoulderBaseArr[1], L.armU, lUpperAng), lUpperAng, OFF.arm?.upper?.elbow);
  const rElbowPosArr = withAX(...segPos(rShoulderBaseArr[0], rShoulderBaseArr[1], L.armU, rUpperAng), rUpperAng, OFF.arm?.upper?.elbow);
  const lWristPosArr = withAX(...segPos(lElbowPosArr[0], lElbowPosArr[1], L.armL, lLowerAng), lLowerAng, OFF.arm?.lower?.origin);
  const rWristPosArr = withAX(...segPos(rElbowPosArr[0], rElbowPosArr[1], L.armL, rLowerAng), rLowerAng, OFF.arm?.lower?.origin);

  const legsFollow = !!C.hierarchy?.legsFollowTorsoRotation;
  let lHipAng = (F.jointAngles?.lHip ?? 0) + (legsFollow ? torsoAngRaw : 0);
  let rHipAng = (F.jointAngles?.rHip ?? 0) + (legsFollow ? torsoAngRaw : 0);
  const lKneeRel = F.jointAngles?.lKnee ?? 0;
  const rKneeRel = F.jointAngles?.rKnee ?? 0;
  // Knee angles accumulate consistently with addition (child angle relative to parent)
  const lKneeAng = lHipAng + lKneeRel;
  const rKneeAng = rHipAng + rKneeRel;
  const lKneePosArr = withAX(...segPos(hipBaseArr[0], hipBaseArr[1], L.legU, lHipAng), lHipAng, OFF.leg?.upper?.knee);
  const rKneePosArr = withAX(...segPos(hipBaseArr[0], hipBaseArr[1], L.legU, rHipAng), rHipAng, OFF.leg?.upper?.knee);
  const lAnklePosArr = withAX(...segPos(lKneePosArr[0], lKneePosArr[1], L.legL, lKneeAng), lKneeAng, OFF.leg?.lower?.origin);
  const rAnklePosArr = withAX(...segPos(rKneePosArr[0], rKneePosArr[1], L.legL, rKneeAng), rKneeAng, OFF.leg?.lower?.origin);

  // Build bone objects (include base points)
  const headLen = ((fcfg.parts?.head?.neck ?? C.parts?.head?.neck ?? 14) + 2*(fcfg.parts?.head?.radius ?? C.parts?.head?.radius ?? 16)) * (L.scale/(C.actor?.scale||1)) * (C.actor?.scale||1);
  const headAngRaw = F.jointAngles?.head;
  const headAng = Number.isFinite(headAngRaw) ? headAngRaw : torsoAng;
  const headBaseArr = withAX(neckBaseArr[0], neckBaseArr[1], headAng, OFF.head?.origin);
  const headEndArr = segPos(headBaseArr[0], headBaseArr[1], headLen, headAng);

  const B = {
    center:{x:centerX,y:centerY},
    torso:{x:hipBaseArr[0],y:hipBaseArr[1],len:L.torso,ang:torsoAng,endX:torsoTopArr[0],endY:torsoTopArr[1]},
    head:{x:headBaseArr[0],y:headBaseArr[1],len:headLen,ang:headAng,endX:headEndArr[0],endY:headEndArr[1]},
    shoulderBase:{x:shoulderBaseArr[0],y:shoulderBaseArr[1]},
    hipBase:{x:hipBaseArr[0],y:hipBaseArr[1]},
    neckBase:{x:neckBaseArr[0],y:neckBaseArr[1]},
    torsoTop:{x:torsoTopArr[0],y:torsoTopArr[1]},

    arm_L_upper:{x:lShoulderBaseArr[0],y:lShoulderBaseArr[1],len:L.armU,ang:lUpperAng,endX:lElbowPosArr[0],endY:lElbowPosArr[1]},
    arm_L_lower:{x:lElbowPosArr[0],y:lElbowPosArr[1],len:L.armL,ang:lLowerAng,endX:lWristPosArr[0],endY:lWristPosArr[1]},
    arm_R_upper:{x:rShoulderBaseArr[0],y:rShoulderBaseArr[1],len:L.armU,ang:rUpperAng,endX:rElbowPosArr[0],endY:rElbowPosArr[1]},
    arm_R_lower:{x:rElbowPosArr[0],y:rElbowPosArr[1],len:L.armL,ang:rLowerAng,endX:rWristPosArr[0],endY:rWristPosArr[1]},

    leg_L_upper:{x:hipBaseArr[0],y:hipBaseArr[1],len:L.legU,ang:lHipAng,endX:lKneePosArr[0],endY:lKneePosArr[1]},
    leg_L_lower:{x:lKneePosArr[0],y:lKneePosArr[1],len:L.legL,ang:lKneeAng,endX:lAnklePosArr[0],endY:lAnklePosArr[1]},
    leg_R_upper:{x:hipBaseArr[0],y:hipBaseArr[1],len:L.legU,ang:rHipAng,endX:rKneePosArr[0],endY:rKneePosArr[1]},
    leg_R_lower:{x:rKneePosArr[0],y:rKneePosArr[1],len:L.legL,ang:rKneeAng,endX:rAnklePosArr[0],endY:rAnklePosArr[1]}
  };

  const resolveWeaponAttachment = (attachKey) => {
    switch ((attachKey || '').toLowerCase()) {
      case 'rwrist':
        return { pos: rWristPosArr, ang: rLowerAng };
      case 'lwrist':
        return { pos: lWristPosArr, ang: lLowerAng };
      case 'relbow':
        return { pos: rElbowPosArr, ang: rUpperAng };
      case 'lelbow':
        return { pos: lElbowPosArr, ang: lUpperAng };
      case 'rshoulder':
        return { pos: rShoulderBaseArr, ang: rUpperAng };
      case 'lshoulder':
        return { pos: lShoulderBaseArr, ang: lUpperAng };
      case 'torso':
        return { pos: hipBaseArr, ang: torsoAng };
      default:
        return null;
    }
  };

  const weaponKey = profile.weapon
    || profile.character?.weapon
    || (typeof F.weapon === 'string' ? F.weapon : null);
  const weaponDef = weaponKey && C.weapons ? C.weapons[weaponKey] : null;
  if (weaponDef && Array.isArray(weaponDef.boneOffsets) && weaponDef.boneOffsets.length) {
    weaponDef.boneOffsets.forEach((spec, index) => {
      if (!spec) return;
      const attachment = resolveWeaponAttachment(spec.attach || '');
      if (!attachment || !attachment.pos) return;
      const basePos = attachment.pos;
      const baseAng = attachment.ang ?? torsoAng;
      const offsetX = Number(spec.x) || 0;
      const offsetY = Number(spec.y) || 0;
      const startArr = withAX(basePos[0], basePos[1], baseAng, offsetX, offsetY);
      const length = Math.max(0, Number(spec.length) || 0);
      const angOffset = Number.isFinite(spec.angleRad)
        ? spec.angleRad
        : (Number.isFinite(spec.angleDeg) ? degToRad(spec.angleDeg) : 0);
      const boneAng = baseAng + angOffset;
      const [endX, endY] = segPos(startArr[0], startArr[1], length, boneAng);
      const boneKey = `weapon_${index}`;
      B[boneKey] = {
        x: startArr[0],
        y: startArr[1],
        len: length,
        ang: boneAng,
        endX,
        endY,
        attach: spec.attach || null,
        weapon: weaponKey
      };
    });
  }

  // Determine if character is facing left for sprite rendering
  const facingRad = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);
  const flipLeft = Math.cos(facingRad) < 0;

  return { B, L, hitbox, flipLeft, fighterName, profile };
}

export const LIMB_COLORS = {
  torso: '#fbbf24',
  head: '#d1d5db',
  arm_L_upper: '#60a5fa',
  arm_L_lower: '#3b82f6',
  arm_R_upper: '#f87171',
  arm_R_lower: '#ef4444',
  leg_L_upper: '#34d399',
  leg_L_lower: '#10b981',
  leg_R_upper: '#fde68a',
  leg_R_lower: '#f59e0b',
  weapon_0: '#fb923c',
  weapon_1: '#f97316'
};

function drawJoint(ctx, x, y, color){
  ctx.beginPath();
  ctx.arc(x, y, 4, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

function drawSegment(ctx, boneKey, B){
  const bone = B[boneKey];
  if (!bone) return;
  
  // Check if this specific bone should be rendered
  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  const showBoneMap = DEBUG.showBone || {};
  if (showBoneMap.hasOwnProperty(boneKey) && !showBoneMap[boneKey]) {
    return; // Skip this bone if explicitly disabled
  }
  
  const color = LIMB_COLORS[boneKey] || '#94a3b8';
  const { x: sx, y: sy, len, ang } = bone;
  const hasEnd = Number.isFinite(bone.endX) && Number.isFinite(bone.endY);
  const [ex, ey] = hasEnd ? [bone.endX, bone.endY] : segPos(sx, sy, len, ang);
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.strokeStyle = color;
  ctx.stroke();
  drawJoint(ctx, sx, sy, color);
  drawJoint(ctx, ex, ey, color);
}

function drawStick(ctx, B) {
  // Check if bones should be rendered at all
  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showBones === false) {
    return; // Skip all bone rendering if disabled
  }
  
  ctx.lineCap = 'round';
  ctx.lineWidth = 4;
  const order = ['torso','head','arm_L_upper','arm_L_lower','arm_R_upper','arm_R_lower','leg_L_upper','leg_L_lower','leg_R_upper','leg_R_lower'];
  for (const key of order) {
    drawSegment(ctx, key, B);
  }
  const weaponKeys = Object.keys(B)
    .filter((key) => key.startsWith('weapon_'))
    .sort();
  for (const key of weaponKeys) {
    drawSegment(ctx, key, B);
  }
}

function drawHitbox(ctx, hb) {
  if (!ctx || !hb) return;
  
  // Check if hitbox should be rendered
  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showHitbox === false) {
    return; // Skip hitbox rendering if disabled
  }
  
  const stroke = (window.CONFIG?.colors?.hitbox) || '#0ea5e9';
  ctx.save();
  ctx.translate(hb.x, hb.y);
  ctx.rotate(hb.ang);
  ctx.lineWidth = 2;
  ctx.strokeStyle = stroke;
  ctx.fillStyle = 'rgba(14,165,233,0.08)';
  const w = hb.w || 0;
  const h = hb.h || 0;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, -h * 0.5);
  ctx.stroke();
  ctx.restore();

  if (Number.isFinite(hb.attachX) && Number.isFinite(hb.attachY)) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(hb.attachX, hb.attachY);
    ctx.lineTo(hb.x, hb.y);
    ctx.stroke();
    ctx.restore();
  }
}



function drawCompass(ctx, x, y, r, label){
  if (!ctx) return;
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#6b7280';
  ctx.fillStyle = '#9aa6b2';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  const A = [0, Math.PI/2, Math.PI, Math.PI * 1.5];
  const T = ['0', '90', '180', '270'];
  for (let i = 0; i < A.length; i++) {
    const b = basis(A[i]);
    const ex = x + r * b.fx;
    const ey = y + r * b.fy;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.fillText(T[i], ex - 6, ey - 4);
  }
  if (label) { ctx.fillText(label, x - r, y + r + 14); }
  ctx.restore();
}


function drawFallbackSilhouette(ctx, entity, config){
  if (!ctx || !entity) return;
  try {
    const lengths = entity.lengths || {};
    const configHitbox = config?.parts?.hitbox || {};
    const globalScale = config?.actor?.scale || 1;
    const hbW = Number.isFinite(lengths.hbW)
      ? lengths.hbW
      : (configHitbox.w || 40) * globalScale;
    const hbH = Number.isFinite(lengths.hbH)
      ? lengths.hbH
      : (configHitbox.h || 80) * globalScale;
    const originX = entity.hitbox?.x ?? entity.fighter?.pos?.x ?? 0;
    const originY = entity.hitbox?.y ?? entity.fighter?.pos?.y ?? 0;
    const px = originX - hbW / 2;
    const py = originY - hbH / 2;
    const palette = entity.id === 'player'
      ? { fill: '#4b9ce2', stroke: '#1f4d7a' }
      : { fill: '#fca5a5', stroke: '#b91c1c' };
    ctx.save();
    ctx.globalAlpha = 0.4;
    ctx.fillStyle = palette.fill;
    ctx.fillRect(px, py, hbW, hbH);
    ctx.strokeStyle = palette.stroke;
    ctx.lineWidth = 2;
    ctx.strokeRect(px, py, hbW, hbH);
    ctx.restore();
  } catch (_err) {
    // ignore fallback drawing errors so rendering never fails
  }
}


export function renderAll(ctx){
  const G=(window.GAME ||= {});
  const C=(window.CONFIG || {});
  if(!ctx||!G.FIGHTERS) return;
  const fallbackName=(G.selectedFighter && C.fighters?.[G.selectedFighter])? G.selectedFighter : (C.fighters?.TLETINGAN? 'TLETINGAN' : Object.keys(C.fighters||{})[0] || 'default');

  const anchorsById = {};
  const flipState = {};
  const renderEntities = [];

  for (const [fighterId, fighter] of Object.entries(G.FIGHTERS)) {
    if (!fighter) continue;
    const result = computeAnchorsForFighter(fighter, C, fallbackName);
    anchorsById[fighterId] = result.B;
    flipState[fighterId] = result.flipLeft;
    renderEntities.push({
      id: fighterId,
      fighter,
      fighterName: result.fighterName,
      profile: result.profile || fighter.renderProfile || null,
      bones: result.B,
      hitbox: result.hitbox,
      flipLeft: result.flipLeft,
      lengths: result.L,
      centerX: Number.isFinite(result.hitbox?.x) ? result.hitbox.x : (fighter.pos?.x ?? 0)
    });
  }

  G.ANCHORS_OBJ = anchorsById;
  G.FLIP_STATE = flipState;
  G.RENDER_STATE = { entities: renderEntities };

  // Fallback background so the viewport is never visually blank
  try{
    ctx.fillStyle = '#eaeaea';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    // If parallax isn't configured, draw a minimal horizon + ground
    if (!window.PARALLAX || !window.PARALLAX.areas || !window.PARALLAX.areas[window.PARALLAX.currentAreaId]){
      const groundY = Math.floor(ctx.canvas.height * 0.8);
      // sky gradient
      const g = ctx.createLinearGradient(0,0,0,ctx.canvas.height);
      g.addColorStop(0, '#cfe8ff'); g.addColorStop(1, '#eaeaea');
      ctx.fillStyle = g; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
      // ground
      ctx.fillStyle = '#c8d0c3';
      ctx.fillRect(0, groundY, ctx.canvas.width, ctx.canvas.height - groundY);
      // marker text so it's obvious
      ctx.fillStyle = '#445';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('NO AREA LOADED — fallback ground', 12, 22);
    }
  }catch(_e){ /* ignore */ }
  
  const camX = G.CAMERA?.x || 0;
  const zoom = Number.isFinite(G.CAMERA?.zoom) ? G.CAMERA.zoom : 1;
  const canvasHeight = ctx.canvas?.height || 0;
  ctx.save();
  ctx.setTransform(zoom, 0, 0, zoom, -zoom * camX, canvasHeight * (1 - zoom));

  for (const entity of renderEntities) {
    if (!entity) continue;
    ctx.save();
    if (entity.flipLeft) {
      const centerX = Number.isFinite(entity.centerX) ? entity.centerX : 0;
      ctx.translate(centerX * 2, 0);
      ctx.scale(-1, 1);
    }
    drawHitbox(ctx, entity.hitbox);
    drawStick(ctx, entity.bones);
    drawFallbackSilhouette(ctx, entity, C);
    ctx.restore();
  }

  const npcDashTrailEntries = getNpcDashTrail();
  const dashList = Array.isArray(npcDashTrailEntries)
    ? npcDashTrailEntries
    : (npcDashTrailEntries ? [{ id: 'npc', trail: npcDashTrailEntries }] : []);
  for (const entry of dashList) {
    const dashTrail = entry?.trail;
    if (!dashTrail?.positions?.length) continue;
    for (let i = dashTrail.positions.length - 1; i >= 0; i -= 1) {
      const pos = dashTrail.positions[i];
      const alpha = Math.max(0, pos.alpha ?? 0);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = 'rgba(248, 113, 113, 0.35)';
      const radius = (C.parts?.hitbox?.w || 40) * (C.actor?.scale || 1) * 0.3;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  const npcAttackTrailEntries = getNpcAttackTrail();
  const attackList = Array.isArray(npcAttackTrailEntries)
    ? npcAttackTrailEntries
    : (npcAttackTrailEntries ? [{ id: 'npc', trail: npcAttackTrailEntries }] : []);
  for (const entry of attackList) {
    const npcAttackTrail = entry?.trail;
    if (!npcAttackTrail?.enabled) continue;
    for (const key of ['handL', 'handR', 'footL', 'footR']) {
      const trail = npcAttackTrail.colliders?.[key];
      if (!trail || !trail.length) continue;
      for (let i = trail.length - 1; i >= 0; i -= 1) {
        const sample = trail[i];
        const alpha = Math.max(0, sample.alpha ?? 0);
        if (alpha <= 0) continue;
        ctx.save();
        ctx.globalAlpha = alpha * 0.6;
        ctx.beginPath();
        ctx.arc(sample.x, sample.y, sample.radius ?? 14, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(239, 68, 68, ${alpha * 0.65})`;
        ctx.strokeStyle = `rgba(248, 113, 22, ${alpha * 0.85})`;
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  ctx.restore();
  drawCompass(ctx, 60, 80, 28, `zero=${angleZero()}`);
}
