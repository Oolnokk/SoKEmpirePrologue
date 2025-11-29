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
import { pickFighterConfig, lengths, pickOffsets, resolveBoneLengthScale } from './fighter-utils.js?v=1';
import { updateFighterColliders, pruneFighterColliders, getFighterColliders } from './colliders.js?v=1';
import { computeGroundY } from './ground-utils.js?v=1';

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

export function computeAnchorsForFighter(F, C, fallbackFighterName) {
  const profile = F?.renderProfile || {};
  const requestedName = profile.fighterName;
  const fighterName = (requestedName && C.fighters?.[requestedName]) ? requestedName : fallbackFighterName;
  const fcfg = pickFighterConfig(C, fighterName); const L = lengths(C, fcfg);
  const lengthOverrides = (F?.anim?.length?.overrides && typeof F.anim.length.overrides === 'object')
    ? F.anim.length.overrides
    : {};
  const torsoLen = L.torso * resolveBoneLengthScale(lengthOverrides, 'torso', L.torso, ['body']);
  const armUpperLeftLen = L.armU * resolveBoneLengthScale(lengthOverrides, 'arm_L_upper', L.armU, ['arm_upper', 'upper_arm', 'arm']);
  const armUpperRightLen = L.armU * resolveBoneLengthScale(lengthOverrides, 'arm_R_upper', L.armU, ['arm_upper', 'upper_arm', 'arm']);
  const armLowerLeftLen = L.armL * resolveBoneLengthScale(lengthOverrides, 'arm_L_lower', L.armL, ['arm_lower', 'lower_arm', 'arm']);
  const armLowerRightLen = L.armL * resolveBoneLengthScale(lengthOverrides, 'arm_R_lower', L.armL, ['arm_lower', 'lower_arm', 'arm']);
  const legUpperLeftLen = L.legU * resolveBoneLengthScale(lengthOverrides, 'leg_L_upper', L.legU, ['leg_upper', 'upper_leg', 'leg']);
  const legUpperRightLen = L.legU * resolveBoneLengthScale(lengthOverrides, 'leg_R_upper', L.legU, ['leg_upper', 'upper_leg', 'leg']);
  const legLowerLeftLen = L.legL * resolveBoneLengthScale(lengthOverrides, 'leg_L_lower', L.legL, ['leg_lower', 'lower_leg', 'leg']);
  const legLowerRightLen = L.legL * resolveBoneLengthScale(lengthOverrides, 'leg_R_lower', L.legL, ['leg_lower', 'lower_leg', 'leg']);
  const scaledLengths = {
    ...L,
    torso: torsoLen,
    armU: (armUpperLeftLen + armUpperRightLen) * 0.5,
    armULeft: armUpperLeftLen,
    armURight: armUpperRightLen,
    armL: (armLowerLeftLen + armLowerRightLen) * 0.5,
    armLowerLeft: armLowerLeftLen,
    armLowerRight: armLowerRightLen,
    legU: (legUpperLeftLen + legUpperRightLen) * 0.5,
    legUpperLeft: legUpperLeftLen,
    legUpperRight: legUpperRightLen,
    legL: (legLowerLeftLen + legLowerRightLen) * 0.5,
    legLowerLeft: legLowerLeftLen,
    legLowerRight: legLowerRightLen
  };
  const OFF = pickOffsets(C, fcfg); const hbAttach = (fcfg.parts?.hitbox?.torsoAttach || C.parts?.hitbox?.torsoAttach || { nx:0.5, ny:0.7 });
  const centerX = F.pos?.x ?? 0; const centerY = F.pos?.y ?? ((C.groundRatio||0.7) * (C.canvas?.h||460));
  const torsoAngRaw = F.jointAngles?.torso ?? 0; // already in radians from animator
  const torsoAng = torsoAngRaw; // with 'up' as zero, torso angle is used directly
  const torsoAttach = { x: centerX + (hbAttach.nx - 0.5) * L.hbW, y: centerY + (hbAttach.ny - 0.5) * L.hbH };
  const originBaseArr   = withAX(torsoAttach.x, torsoAttach.y, torsoAngRaw, OFF.torso?.origin);
  const hipBaseArr      = withAX(originBaseArr[0], originBaseArr[1], torsoAngRaw, OFF.torso?.hip);
  const torsoTopArr     = segPos(hipBaseArr[0], hipBaseArr[1], torsoLen, torsoAng);
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

  const lElbowPosArr = withAX(...segPos(lShoulderBaseArr[0], lShoulderBaseArr[1], armUpperLeftLen, lUpperAng), lUpperAng, OFF.arm?.upper?.elbow);
  const rElbowPosArrRaw = segPos(rShoulderBaseArr[0], rShoulderBaseArr[1], armUpperRightLen, rUpperAng);
  const rElbowPosArr = (Number.isFinite(rElbowPosArrRaw[0]) && Number.isFinite(rElbowPosArrRaw[1]))
    ? withAX(rElbowPosArrRaw[0], rElbowPosArrRaw[1], rUpperAng, OFF.arm?.upper?.elbow)
    : [rShoulderBaseArr[0], rShoulderBaseArr[1]];
  const lWristPosArrRaw = segPos(lElbowPosArr[0], lElbowPosArr[1], armLowerLeftLen, lLowerAng);
  const lWristPosArr = (Number.isFinite(lWristPosArrRaw[0]) && Number.isFinite(lWristPosArrRaw[1]))
    ? withAX(lWristPosArrRaw[0], lWristPosArrRaw[1], lLowerAng, OFF.arm?.lower?.origin)
    : [lElbowPosArr[0], lElbowPosArr[1]];
  const rWristPosArrRaw = segPos(rElbowPosArr[0], rElbowPosArr[1], armLowerRightLen, rLowerAng);
  const rWristPosArr = (Number.isFinite(rWristPosArrRaw[0]) && Number.isFinite(rWristPosArrRaw[1]))
    ? withAX(rWristPosArrRaw[0], rWristPosArrRaw[1], rLowerAng, OFF.arm?.lower?.origin)
    : [rElbowPosArr[0], rElbowPosArr[1]];

  const legsFollow = !!C.hierarchy?.legsFollowTorsoRotation;
  let lHipAng = (F.jointAngles?.lHip ?? 0) + (legsFollow ? torsoAngRaw : 0);
  let rHipAng = (F.jointAngles?.rHip ?? 0) + (legsFollow ? torsoAngRaw : 0);
  const lKneeRel = F.jointAngles?.lKnee ?? 0;
  const rKneeRel = F.jointAngles?.rKnee ?? 0;
  // Knee angles accumulate consistently with addition (child angle relative to parent)
  const lKneeAng = lHipAng + lKneeRel;
  const rKneeAng = rHipAng + rKneeRel;
  const lKneePosArr = withAX(...segPos(hipBaseArr[0], hipBaseArr[1], legUpperLeftLen, lHipAng), lHipAng, OFF.leg?.upper?.knee);
  const rKneePosArr = withAX(...segPos(hipBaseArr[0], hipBaseArr[1], legUpperRightLen, rHipAng), rHipAng, OFF.leg?.upper?.knee);
  const lAnklePosArr = withAX(...segPos(lKneePosArr[0], lKneePosArr[1], legLowerLeftLen, lKneeAng), lKneeAng, OFF.leg?.lower?.origin);
  const rAnklePosArr = withAX(...segPos(rKneePosArr[0], rKneePosArr[1], legLowerRightLen, rKneeAng), rKneeAng, OFF.leg?.lower?.origin);

  // Build bone objects (include base points)
  const baseHeadLen = ((fcfg.parts?.head?.neck ?? C.parts?.head?.neck ?? 14) + 2*(fcfg.parts?.head?.radius ?? C.parts?.head?.radius ?? 16)) * (L.scale/(C.actor?.scale||1)) * (C.actor?.scale||1);
  const headScale = resolveBoneLengthScale(lengthOverrides, 'head', baseHeadLen, ['neck', 'head']);
  const headLen = baseHeadLen * headScale;
  const headAngRaw = F.jointAngles?.head;
  const headAng = Number.isFinite(headAngRaw) ? headAngRaw : torsoAng;
  const headBaseArr = withAX(neckBaseArr[0], neckBaseArr[1], headAng, OFF.head?.origin);
  const headEndArr = segPos(headBaseArr[0], headBaseArr[1], headLen, headAng);

  const B = {
    center:{x:centerX,y:centerY},
    torso:{x:hipBaseArr[0],y:hipBaseArr[1],len:torsoLen,ang:torsoAng,endX:torsoTopArr[0],endY:torsoTopArr[1]},
    head:{x:headBaseArr[0],y:headBaseArr[1],len:headLen,ang:headAng,endX:headEndArr[0],endY:headEndArr[1]},
    shoulderBase:{x:shoulderBaseArr[0],y:shoulderBaseArr[1]},
    hipBase:{x:hipBaseArr[0],y:hipBaseArr[1]},
    neckBase:{x:neckBaseArr[0],y:neckBaseArr[1]},
    torsoTop:{x:torsoTopArr[0],y:torsoTopArr[1]},

    arm_L_upper:{x:lShoulderBaseArr[0],y:lShoulderBaseArr[1],len:armUpperLeftLen,ang:lUpperAng,endX:lElbowPosArr[0],endY:lElbowPosArr[1]},
    arm_L_lower:{x:lElbowPosArr[0],y:lElbowPosArr[1],len:armLowerLeftLen,ang:lLowerAng,endX:lWristPosArr[0],endY:lWristPosArr[1]},
    arm_R_upper:{x:rShoulderBaseArr[0],y:rShoulderBaseArr[1],len:armUpperRightLen,ang:rUpperAng,
      endX:Number.isFinite(rElbowPosArr[0])?rElbowPosArr[0]:rShoulderBaseArr[0],
      endY:Number.isFinite(rElbowPosArr[1])?rElbowPosArr[1]:rShoulderBaseArr[1]},
    arm_R_lower:{x:rElbowPosArr[0],y:rElbowPosArr[1],len:armLowerRightLen,ang:rLowerAng,
      endX:Number.isFinite(rWristPosArr[0])?rWristPosArr[0]:rElbowPosArr[0],
      endY:Number.isFinite(rWristPosArr[1])?rWristPosArr[1]:rElbowPosArr[1]},

    leg_L_upper:{x:hipBaseArr[0],y:hipBaseArr[1],len:legUpperLeftLen,ang:lHipAng,endX:lKneePosArr[0],endY:lKneePosArr[1]},
    leg_L_lower:{x:lKneePosArr[0],y:lKneePosArr[1],len:legLowerLeftLen,ang:lKneeAng,endX:lAnklePosArr[0],endY:lAnklePosArr[1]},
    leg_R_upper:{x:hipBaseArr[0],y:hipBaseArr[1],len:legUpperRightLen,ang:rHipAng,endX:rKneePosArr[0],endY:rKneePosArr[1]},
    leg_R_lower:{x:rKneePosArr[0],y:rKneePosArr[1],len:legLowerRightLen,ang:rKneeAng,endX:rAnklePosArr[0],endY:rAnklePosArr[1]}
  };

  const weaponKey = profile.weapon
    || profile.character?.weapon
    || (typeof F.weapon === 'string' ? F.weapon : 'unarmed');
  const weaponDef = weaponKey && C.weapons ? C.weapons[weaponKey] : null;
  const weaponState = F.anim?.weapon?.state;
  // Always add a static weapon bone, even when unarmed or weaponState is missing
  if (weaponState && weaponState.weaponKey === weaponKey && Array.isArray(weaponState.bones)) {
    weaponState.bones.forEach((bone, index) => {
      if (!bone || isNaN(bone?.start?.x) || isNaN(bone?.start?.y)) return;
      const boneKey = bone.id || `weapon_${index}`;
      const collidesWithBaseRig = boneKey && !String(boneKey).startsWith('weapon_') && Object.prototype.hasOwnProperty.call(B, boneKey);
      const safeKey = collidesWithBaseRig ? `weapon_${boneKey}` : boneKey;
      const start = bone.start || { x: 0, y: 0 };
      const end = bone.end || { x: start.x, y: start.y };
      B[safeKey] = {
        x: start.x,
        y: start.y,
        len: Number.isFinite(bone.length) ? bone.length : Math.hypot(end.x - start.x, end.y - start.y),
        ang: bone.angle ?? angleFromDelta(end.x - start.x, end.y - start.y),
        endX: end.x,
        endY: end.y,
        weapon: weaponKey,
        sourceId: bone.id || null
      };
    });
  } else if (weaponDef && weaponDef.rig && Array.isArray(weaponDef.rig.bones)) {
    // Fallback: add static weapon bone for unarmed
    weaponDef.rig.bones.forEach((bone, index) => {
      const boneKey = bone.id || `weapon_${index}`;
      B[boneKey] = {
        x: rWristPosArr[0],
        y: rWristPosArr[1],
        len: 0,
        ang: rLowerAng,
        endX: rWristPosArr[0],
        endY: rWristPosArr[1],
        weapon: 'unarmed',
        sourceId: bone.id || null
      };
    });
  }

  // Determine if character is facing left for sprite rendering
  const facingRad = (typeof F.facingRad === 'number') ? F.facingRad : ((F.facingSign||1) < 0 ? Math.PI : 0);
  const flipLeft = Math.cos(facingRad) < 0;

  return { B, L: scaledLengths, hitbox, flipLeft, fighterName, profile };
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

function drawRangeCollider(ctx, fighter, hitbox) {
  if (!ctx || !fighter) return;

  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showRangeCollider !== true) {
    return;
  }

  let attackRange = null;
  const perception = fighter.perception;
  if (perception && Number.isFinite(perception.attackRange)) {
    attackRange = perception.attackRange;
  } else if (fighter.plannedAbility?.range) {
    attackRange = fighter.plannedAbility.range;
  } else if (fighter.ai?.attackRange) {
    attackRange = fighter.ai.attackRange;
  }

  if (!attackRange || attackRange <= 0) return;

  const centerX = hitbox?.x ?? fighter.pos?.x ?? 0;
  const centerY = hitbox?.y ?? fighter.pos?.y ?? 0;

  // Get phase for color coding (use phase instead of mode)
  const phase = fighter.behaviorPhase;
  const currentPhase = phase?.current || 'unknown';

  // Color mapping based on NPC behavior PHASE
  const phaseColors = {
    'decide': { stroke: 'rgba(251, 191, 36, 0.8)', fill: 'rgba(251, 191, 36, 0.12)' },      // Yellow
    'approach': { stroke: 'rgba(251, 146, 60, 0.8)', fill: 'rgba(251, 146, 60, 0.12)' },   // Orange
    'attack': { stroke: 'rgba(239, 68, 68, 0.8)', fill: 'rgba(239, 68, 68, 0.12)' },       // Red
    'retreat': { stroke: 'rgba(168, 85, 247, 0.8)', fill: 'rgba(168, 85, 247, 0.12)' },    // Purple
    'shuffle': { stroke: 'rgba(168, 162, 158, 0.8)', fill: 'rgba(168, 162, 158, 0.12)' },  // Gray
    'unknown': { stroke: 'rgba(156, 163, 175, 0.8)', fill: 'rgba(156, 163, 175, 0.12)' }   // Gray
  };

  const colors = phaseColors[currentPhase] || phaseColors.unknown;

  // Get facing angle - use head angle with debug rotation offset
  const rotationOffset = Number.isFinite(DEBUG.rangeColliderRotationOffset)
    ? DEBUG.rangeColliderRotationOffset
    : 0;

  // Try to get head angle from pose state, fallback to facingRad
  let baseAngle = fighter.facingRad || 0;
  if (fighter.pose?.head) {
    baseAngle = fighter.pose.head;
  }

  const angle = baseAngle + degToRad(rotationOffset);

  // Draw rectangle extending from center in facing direction
  // Rectangle width = 40px, length = attackRange
  const rectWidth = 40;
  const rectLength = attackRange;

  // Calculate the end point of the bone/rectangle
  const [endX, endY] = segPos(centerX, centerY, rectLength, angle);

  ctx.save();
  ctx.strokeStyle = colors.stroke;
  ctx.fillStyle = colors.fill;
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);

  // Draw rectangle aligned with angle
  ctx.translate(centerX, centerY);
  ctx.rotate(angle);

  // Draw rectangle from origin extending forward
  ctx.beginPath();
  ctx.rect(0, -rectWidth / 2, rectLength, rectWidth);
  ctx.fill();
  ctx.stroke();

  ctx.restore();

  // Draw phase and range label at end of collider
  ctx.save();
  ctx.setLineDash([]);
  ctx.fillStyle = colors.stroke;
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${currentPhase.toUpperCase()} (${attackRange.toFixed(0)})`, endX, endY - 15);
  ctx.restore();

  // Draw behavior phase info inside collider
  if (phase) {
    const lines = [];

    // Phase name
    lines.push({ text: `Phase: ${currentPhase.toUpperCase()}`, color: 'rgba(255, 255, 255, 0.95)' });

    // Phase-specific info with ability type color coding
    if (phase.plannedAbility) {
      const ability = phase.plannedAbility;
      let abilityColor = 'rgba(255, 255, 255, 0.95)'; // Default white

      // Color code by ability type
      if (ability.trigger === 'hold-release' && ability.weight === 'heavy') {
        abilityColor = 'rgba(139, 0, 0, 1)'; // Deep red for heavy
      } else if (ability.type === 'quick') {
        abilityColor = 'rgba(230, 230, 250, 1)'; // Lavender for quick
      } else if (ability.weight === 'light') {
        // Combo attacks - color by progress (orange, yellow, green, blue)
        const comboProgress = phase.comboProgress || 0;
        if (comboProgress === 1) abilityColor = 'rgba(255, 165, 0, 1)'; // Orange
        else if (comboProgress === 2) abilityColor = 'rgba(255, 255, 0, 1)'; // Yellow
        else if (comboProgress === 3) abilityColor = 'rgba(0, 255, 0, 1)'; // Green
        else if (comboProgress >= 4) abilityColor = 'rgba(0, 191, 255, 1)'; // Blue
        else abilityColor = 'rgba(255, 165, 0, 1)'; // Orange for initial
      }

      lines.push({
        text: `${ability.slotKey}-${ability.weight} (${ability.id || 'unknown'})`,
        color: abilityColor
      });
    }

    // Timer info
    if (Number.isFinite(phase.timer)) {
      lines.push({ text: `T: ${phase.timer.toFixed(1)}s`, color: 'rgba(255, 255, 255, 0.95)' });
    }

    // Additional phase details
    if (currentPhase === 'attack' && phase.comboProgress > 0) {
      lines.push({ text: `Combo: ${phase.comboProgress}/${phase.comboMaxHits || 4}`, color: 'rgba(255, 255, 255, 0.95)' });
    }

    if (currentPhase === 'approach' && phase.holdInputActive) {
      lines.push({ text: `[HOLD ACTIVE]`, color: 'rgba(255, 215, 0, 1)' }); // Gold
    }

    // Draw text lines centered inside collider
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
    ctx.lineWidth = 4;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const lineHeight = 18;
    const startY = centerY - ((lines.length - 1) * lineHeight) / 2;

    lines.forEach((line, i) => {
      const y = startY + i * lineHeight;
      ctx.strokeText(line.text, centerX, y);
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, centerX, y);
    });
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


function extractBoneDebugInfo(bone) {
  if (!bone) {
    return { present: false, start: null, end: null };
  }

  const hasStart = Number.isFinite(bone.x) && Number.isFinite(bone.y);
  const start = hasStart ? { x: bone.x, y: bone.y } : null;
  let end = (Number.isFinite(bone.endX) && Number.isFinite(bone.endY))
    ? { x: bone.endX, y: bone.endY }
    : null;

  if (!end && start && Number.isFinite(bone.len) && Number.isFinite(bone.ang)) {
    const [ex, ey] = segPos(start.x, start.y, bone.len, bone.ang);
    end = { x: ex, y: ey };
  }

  return {
    present: true,
    start,
    end
  };
}

function collectPlayerBoneDebug(bones) {
  const timestamp = (typeof performance !== 'undefined' && typeof performance.now === 'function')
    ? performance.now()
    : Date.now();

  if (!bones) {
    return {
      timestamp,
      torso: { present: false, start: null, end: null },
      arm_L_lower: { present: false, start: null, end: null },
      arm_R_lower: { present: false, start: null, end: null }
    };
  }

  return {
    timestamp,
    torso: extractBoneDebugInfo(bones.torso),
    arm_L_lower: extractBoneDebugInfo(bones.arm_L_lower),
    arm_R_lower: extractBoneDebugInfo(bones.arm_R_lower)
  };
}

function maybeLogPlayerBoneDebug(debugObj, report) {
  if (!debugObj || !report) return;

  debugObj.playerBoneStatus = report;

  if (debugObj.logPlayerBoneStatus === false) {
    return;
  }

  const now = report.timestamp;
  const lastLog = Number(debugObj._playerBoneStatusLogTime) || 0;
  const minInterval = Number.isFinite(debugObj.playerBoneStatusIntervalMs)
    ? Math.max(16, debugObj.playerBoneStatusIntervalMs)
    : 500;
  if (now - lastLog < minInterval) {
    return;
  }

  const formatNumber = (value) => (Number.isFinite(value) ? value.toFixed(1) : 'n/a');
  const formatPoint = (pt) => (pt ? `(${formatNumber(pt.x)}, ${formatNumber(pt.y)})` : 'n/a');
  const describe = (info) => (info?.present
    ? `${formatPoint(info.start)} → ${formatPoint(info.end)}`
    : 'missing');

  const message = `[render] Player bones | torso: ${describe(report.torso)} | arm_L_lower: ${describe(report.arm_L_lower)} | arm_R_lower: ${describe(report.arm_R_lower)}`;

  // console.debug(message); // Disabled - was spamming console
  debugObj._playerBoneStatusLogTime = now;
  debugObj._playerBoneStatusMessage = message;
}

export function renderAll(ctx){
  const G=(window.GAME ||= {});
  const C=(window.CONFIG || {});
  if(!ctx||!G.FIGHTERS) return;
  const fallbackName=(G.selectedFighter && C.fighters?.[G.selectedFighter])? G.selectedFighter : (C.fighters?.TLETINGAN? 'TLETINGAN' : Object.keys(C.fighters||{})[0] || 'default');

  const anchorsById = {};
  const flipState = {};
  const renderEntities = [];
  const activeColliderIds = [];

  for (const [fighterId, fighter] of Object.entries(G.FIGHTERS)) {
    if (!fighter) continue;
    const result = computeAnchorsForFighter(fighter, C, fallbackName);
    anchorsById[fighterId] = result.B;
    flipState[fighterId] = result.flipLeft;
    const entity = {
      id: fighterId,
      fighter,
      fighterName: result.fighterName,
      profile: result.profile || fighter.renderProfile || null,
      bones: result.B,
      hitbox: result.hitbox,
      flipLeft: result.flipLeft,
      lengths: result.L,
      centerX: Number.isFinite(result.hitbox?.x) ? result.hitbox.x : (fighter.pos?.x ?? 0)
    };
    renderEntities.push(entity);
    activeColliderIds.push(fighterId);
    const hitCenter = result.hitbox
      ? {
          x: Number.isFinite(result.hitbox.x) ? result.hitbox.x : (fighter.pos?.x ?? 0),
          y: Number.isFinite(result.hitbox.y) ? result.hitbox.y : (fighter.pos?.y ?? 0),
        }
      : (fighter.pos ? { x: fighter.pos.x || 0, y: fighter.pos.y || 0 } : null);
    updateFighterColliders(fighterId, result.B, { config: C, hitCenter });
  }

  G.ANCHORS_OBJ = anchorsById;
  G.FLIP_STATE = flipState;
  G.RENDER_STATE = { entities: renderEntities };
  pruneFighterColliders(activeColliderIds);

  if (typeof window !== 'undefined' && window.RENDER_DEBUG) {
    const playerBones = anchorsById.player;
    const report = collectPlayerBoneDebug(playerBones);
    maybeLogPlayerBoneDebug(window.RENDER_DEBUG, report);
  }

  const canvasHeight = ctx.canvas?.height || 0;
  const groundLine = computeGroundY(C, { canvasHeight }) ?? canvasHeight;

  // Fallback background so the viewport is never visually blank
  try{
    // If parallax isn't configured, draw a minimal horizon + ground
    if (!window.PARALLAX || !window.PARALLAX.areas || !window.PARALLAX.areas[window.PARALLAX.currentAreaId]){
      // sky gradient
      const g = ctx.createLinearGradient(0,0,0,ctx.canvas.height);
      g.addColorStop(0, '#cfe8ff'); g.addColorStop(1, '#eaeaea');
      ctx.fillStyle = g; ctx.fillRect(0,0,ctx.canvas.width,ctx.canvas.height);
      // ground
      ctx.fillStyle = '#c8d0c3';
      ctx.fillRect(0, groundLine, ctx.canvas.width, ctx.canvas.height - groundLine);
      // marker text so it's obvious
      ctx.fillStyle = '#445';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText('NO AREA LOADED — fallback ground', 12, 22);
    }
  }catch(_e){ /* ignore */ }
  
  const camX = G.CAMERA?.x || 0;
  const zoom = Number.isFinite(G.CAMERA?.zoom) ? G.CAMERA.zoom : 1;
  ctx.save();
  ctx.translate(0, groundLine);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -groundLine);

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
    const baseKeys = ['handL', 'handR', 'footL', 'footR'];
    const weaponKeys = Object.keys(npcAttackTrail.colliders || {}).filter((key) => key.startsWith('weapon:'));
    for (const key of [...baseKeys, ...weaponKeys]) {
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

    // Draw range collider AFTER entity is drawn, outside the flip transform
    drawRangeCollider(ctx, entity.fighter, entity.hitbox);
  }

  // Draw attack colliders debug visualization
  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
  if (DEBUG.showAttackColliders) {
    for (const entity of renderEntities) {
      if (!entity || !entity.fighter) continue;
      drawAttackColliders(ctx, entity.fighter, entity.id);
    }
  }

  ctx.restore();
  drawCompass(ctx, 60, 80, 28, `zero=${angleZero()}`);
}

function drawAttackColliders(ctx, fighter, fighterId) {
  if (!ctx || !fighter) return;

  // Only draw if fighter is actively attacking
  const attack = fighter.attack;
  if (!attack || !attack.active) return;

  const currentPhase = attack.currentPhase || '';
  const isStriking = currentPhase.toLowerCase().includes('strike') || currentPhase.toLowerCase().includes('impact');
  if (!isStriking) return;

  // Get active collider keys
  const keys = attack.currentActiveKeys || [];
  if (!Array.isArray(keys) || keys.length === 0) return;

  // Get collider positions
  const colliders = getFighterColliders(fighterId);
  if (!colliders) return;

  // Check if attack recently landed a hit (within last 100ms)
  const hitRecently = attack.strikeLanded === true;

  // Draw each active collider
  ctx.save();
  keys.forEach((key) => {
    const pos = colliders[key];
    const radius = colliders[`${key}Radius`] || 12;

    if (!pos || !Number.isFinite(pos.x) || !Number.isFinite(pos.y)) return;

    // Yellow by default, red if hit landed
    const color = hitRecently ? 'rgba(255, 0, 0, 0.6)' : 'rgba(255, 255, 0, 0.6)';
    const strokeColor = hitRecently ? 'rgba(200, 0, 0, 0.9)' : 'rgba(200, 200, 0, 0.9)';

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.stroke();

    // Draw label
    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 3;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeText(key, pos.x, pos.y);
    ctx.fillText(key, pos.x, pos.y);
  });
  ctx.restore();
}
