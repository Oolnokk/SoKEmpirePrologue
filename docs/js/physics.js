// physics.js — Universal fighter physics (ported from Ancient Code-Monolith V2)
// Handles gravity, horizontal acceleration, jump impulses, ragdoll transitions,
// and produces pose offsets that blend with authored animation.

import { degToRad } from './math-utils.js?v=1';

const TAU = Math.PI * 2;

const JOINT_PHYSICS = {
  damping: 0.92,
  normalStiffness: 0.25,
  ragdollStiffness: 0.05,
  maxAngularVel: 0.3,
  joints: {
    torso: { mass: 2.0, limits: [-0.8, 0.8] },
    lShoulder: { mass: 0.5, limits: [-1.5, 1.5] },
    rShoulder: { mass: 0.5, limits: [-1.5, 1.5] },
    lElbow: { mass: 0.4, limits: [-2.5, 0.2] },
    rElbow: { mass: 0.4, limits: [-0.2, 2.5] },
    lHip: { mass: 0.8, limits: [-1.2, 0.8] },
    rHip: { mass: 0.8, limits: [-1.2, 0.8] },
    lKnee: { mass: 0.6, limits: [-0.2, 2.0] },
    rKnee: { mass: 0.6, limits: [-0.2, 2.0] }
  }
};

function clamp(v, lo, hi){
  return Math.max(lo, Math.min(hi, v));
}

function lerp(a, b, t){
  return a + (b - a) * t;
}

function normAngle(rad){
  let a = rad % TAU;
  if (a > Math.PI) a -= TAU;
  if (a < -Math.PI) a += TAU;
  return a;
}

function lerpAngle(a, b, t){
  return a + normAngle(b - a) * t;
}

function ensureCamera(C){
  const G = (window.GAME ||= {});
  const defaultWorld = 1600;
  if (!G.CAMERA){
    G.CAMERA = {
      x: 0,
      worldWidth: C.world?.width || defaultWorld,
      smoothing: 0.15,
      lookAhead: 0,
      deadZone: 0
    };
  }
  if (!Number.isFinite(G.CAMERA.x)){
    G.CAMERA.x = 0;
  }
  if (!Number.isFinite(G.CAMERA.targetX)){
    G.CAMERA.targetX = G.CAMERA.x;
  }
  if (!Number.isFinite(G.CAMERA.worldWidth)){
    G.CAMERA.worldWidth = C.world?.width || defaultWorld;
  }
  if (!Number.isFinite(G.CAMERA.smoothing)){
    G.CAMERA.smoothing = 0.15;
  }
  if (!Number.isFinite(G.CAMERA.lookAhead)){
    G.CAMERA.lookAhead = 0;
  }
  if (!Number.isFinite(G.CAMERA.deadZone)){
    G.CAMERA.deadZone = 0;
  }
  const legacy = (window.CAMERA ||= {});
  legacy.x = G.CAMERA.x;
  legacy.targetX = G.CAMERA.targetX;
  legacy.worldWidth = G.CAMERA.worldWidth;
  legacy.smoothing = G.CAMERA.smoothing;
  legacy.lookAhead = G.CAMERA.lookAhead;
  legacy.deadZone = G.CAMERA.deadZone;
}

function ensureFighterState(fighter, C){
  if (!fighter) return;
  fighter.vel ||= { x: 0, y: 0 };
  fighter.pos ||= { x: 0, y: 0 };
  fighter.ragdollVel ||= { x: fighter.vel.x, y: fighter.vel.y };
  fighter.recoveryStartAngles ||= {};
  fighter.physics ||= { offsets: {} };
  fighter.physics.offsets ||= {};
  fighter.physics.jointAngles ||= {};
  fighter.recoveryDuration = fighter.recoveryDuration || 0.8;
  fighter.recoveryTargetY = fighter.recoveryTargetY ?? fighter.pos.y;
  fighter.recoveryStartY = fighter.recoveryStartY ?? fighter.pos.y;
  fighter.stamina ||= { current: 100, max: 100, drainRate: 40, regenRate: 25, minToDash: 10, isDashing: false };
  fighter.jointAngles ||= {};
  const joints = Object.keys(JOINT_PHYSICS.joints);
  for (const key of joints){
    if (!(key in fighter.jointAngles)) fighter.jointAngles[key] = 0;
    const velKey = `${key}Vel`;
    if (!(velKey in fighter.jointAngles)) fighter.jointAngles[velKey] = 0;
  }
  if (fighter.isPlayer){
    const G = window.GAME || {};
    const sharedInput = (G.input ||= {
      left:false, right:false, jump:false, dash:false,
      buttonA:{ down:false, downTime:0, upTime:0 },
      buttonB:{ down:false, downTime:0, upTime:0 }
    });
    fighter.input = sharedInput;
  } else {
    fighter.input ||= { left:false, right:false, jump:false, dash:false };
  }
  if (!fighter.physics.lastGroundY){
    const canvasH = C.canvas?.h || 460;
    const groundRatio = C.groundRatio ?? 0.7;
    fighter.physics.lastGroundY = Math.round(canvasH * groundRatio);
  }
}

function initJointPhysicsState(fighter){
  const joints = Object.keys(JOINT_PHYSICS.joints);
  for (const key of joints){
    const velKey = `${key}Vel`;
    if (!(velKey in fighter.jointAngles)) fighter.jointAngles[velKey] = 0;
    if (!(key in fighter.physics.jointAngles)) fighter.physics.jointAngles[key] = fighter.jointAngles[key] || 0;
  }
}

function updateJointPhysics(fighter, dt){
  initJointPhysicsState(fighter);
  const stiffness = fighter.ragdoll ? JOINT_PHYSICS.ragdollStiffness : JOINT_PHYSICS.normalStiffness;
  for (const [key, joint] of Object.entries(JOINT_PHYSICS.joints)){
    const velKey = `${key}Vel`;
    const angle = fighter.physics.jointAngles[key] ?? fighter.jointAngles[key] ?? 0;
    let angularVel = fighter.jointAngles[velKey] || 0;

    let targetAngle = 0;
    if (fighter.ragdoll){
      if (!(key in fighter.physics.jointTargets)){
        fighter.physics.jointTargets ||= {};
        fighter.physics.jointTargets[key] = (Math.random() - 0.5) * 0.5;
      }
      targetAngle = fighter.physics.jointTargets[key];
      if (fighter.ragdollTime < 0.5){
        angularVel += (Math.random() - 0.5) * 0.3 * dt;
      }
    } else if (fighter.recovering){
      const stancePose = (window.CONFIG?.poses?.Stance) || {};
      const t = Math.min(1, fighter.recoveryTime / fighter.recoveryDuration);
      const eased = 1 - Math.pow(1 - t, 3);
      const start = fighter.recoveryStartAngles[key] || 0;
      targetAngle = lerp(start, degToRad(stancePose[key] || 0), eased);
    }

    const angleError = targetAngle - angle;
    angularVel += angleError * stiffness;
    angularVel *= JOINT_PHYSICS.damping;
    angularVel = clamp(angularVel, -JOINT_PHYSICS.maxAngularVel, JOINT_PHYSICS.maxAngularVel);

    let newAngle = angle + angularVel;
    const [min, max] = joint.limits;
    newAngle = clamp(newAngle, min, max);

    fighter.physics.jointAngles[key] = newAngle;
    fighter.jointAngles[velKey] = angularVel;
  }

  if (fighter.ragdoll){
    const torsoTilt = fighter.physics.jointAngles.torso || 0;
    fighter.vel.x += Math.sin(torsoTilt) * 0.15 * dt;
  }
}

function enterRagdollState(fighter){
  if (fighter.ragdoll) return;
  console.log(`⚠️ ${fighter.id?.toUpperCase() || 'FIGHTER'} RAGDOLL ACTIVATED - Footing: ${fighter.footing?.toFixed?.(1) ?? fighter.footing}`);
  fighter.ragdoll = true;
  fighter.ragdollTime = 0;
  fighter.physics.jointTargets = {};
  fighter.recovering = false;
}

function computePhysicsOffsets(fighter){
  const offsets = {};
  const vx = fighter.vel?.x || 0;
  offsets.torso = clamp(vx * 0.04, -25, 25);
  const crouch = clamp((fighter.landedImpulse || 0) * 0.04, 0, 60);
  offsets.lKnee = crouch;
  offsets.rKnee = crouch;
  offsets.lHip = -crouch * 0.25;
  offsets.rHip = -crouch * 0.25;

  if (!fighter.onGround && fighter.input?.jump){
    offsets.torso = (offsets.torso || 0) - 10;
    offsets.lHip = (offsets.lHip || 0) + 30;
    offsets.rHip = (offsets.rHip || 0) + 30;
    offsets.lKnee = (offsets.lKnee || 0) + 30;
    offsets.rKnee = (offsets.rKnee || 0) + 30;
  }
  return offsets;
}

function updatePlayerFacing(fighter, dt, C){
  if (!fighter || !fighter.isPlayer) return;
  const G = window.GAME || {};
  const face = G.FACE || { active:false, rad:0 };
  const movement = C.movement || {};
  let target = fighter.facingRad || 0;
  if (movement.lockFacingDuringAttack && face.active){
    target = face.rad ?? target;
  } else {
    const input = fighter.input || {};
    const isDashing = !!fighter.stamina?.isDashing;
    if (input.left !== input.right && !isDashing){
      target = input.right ? 0 : Math.PI;
    }
  }
  const smoothing = Number.isFinite(movement.facingSmooth) ? movement.facingSmooth : 10;
  const s = 1 - Math.exp(-smoothing * dt);
  const prev = fighter.facingRad || (fighter.facingSign < 0 ? Math.PI : 0);
  fighter.facingRad = lerpAngle(prev, target, s);
  fighter.facingSign = Math.cos(fighter.facingRad) >= 0 ? 1 : -1;
}

function updateFighterPhysics(fighter, dt, C, worldWidth){
  if (!fighter) return;
  ensureFighterState(fighter, C);

  const movement = C.movement || {};
  const parts = C.parts || {};
  const actorScale = C.actor?.scale ?? 1;
  const hb = parts.hitbox || { h: 160 };
  const hbHeight = (hb.h || 160) * actorScale;
  const canvasH = C.canvas?.h || 460;
  const groundRatio = C.groundRatio ?? 0.7;
  const groundSurface = Math.round(canvasH * groundRatio);
  const groundCenterY = groundSurface - hbHeight / 2;
  fighter.physics.lastGroundY = groundSurface;

  const wasGrounded = fighter.onGround;

  // Handle buffered jump (pressed this frame)
  const input = fighter.input || {};
  const wantsJump = !!input.jump && !fighter.__prevJump && fighter.onGround && !fighter.ragdoll && !fighter.recovering;
  if (wantsJump){
    fighter.vel.y = movement.jumpImpulse ?? -650;
    fighter.onGround = false;
  }
  fighter.__prevJump = !!input.jump;

  // Gravity
  const gravity = movement.gravity ?? 2400;
  const gravityMult = fighter.ragdoll ? 1.8 : 1.0;
  fighter.vel.y += gravity * dt * gravityMult;

  // Horizontal input
  if (!fighter.ragdoll && !fighter.recovering){
    const dashMult = fighter.stamina?.isDashing ? (movement.dashSpeedMultiplier || 1) : 1;
    const accelX = (movement.accelX || 0) * dashMult;
    const maxSpeed = (movement.maxSpeedX || 0) * dashMult;
    if (input.left) fighter.vel.x -= accelX * dt;
    if (input.right) fighter.vel.x += accelX * dt;
    if (maxSpeed > 0){
      fighter.vel.x = clamp(fighter.vel.x, -maxSpeed, maxSpeed);
    }
  }

  // Friction
  if (fighter.ragdoll){
    fighter.ragdollVel.x = fighter.ragdollVel.x ?? fighter.vel.x;
    fighter.vel.x = fighter.ragdollVel.x * 0.96;
    fighter.ragdollVel.x *= 0.96;
  } else {
    const friction = movement.friction ?? 8;
    fighter.vel.x *= Math.exp(-friction * dt);
  }

  // Joint physics (for ragdoll blending)
  updateJointPhysics(fighter, dt);

  // Integrate position
  fighter.pos.x += fighter.vel.x * dt;
  fighter.pos.y += fighter.vel.y * dt;

  // Clamp world bounds
  const margin = 40;
  const maxX = (worldWidth || 1600) - margin;
  fighter.pos.x = clamp(fighter.pos.x, margin, maxX);

  // Ground collision
  const ragdollGround = groundSurface - 20 * actorScale;
  const targetGround = fighter.ragdoll ? ragdollGround : groundCenterY;
  if (fighter.pos.y >= targetGround){
    fighter.pos.y = targetGround;
    if (fighter.vel.y > 0){
      if (fighter.ragdoll){
        fighter.vel.y = -fighter.vel.y * 0.2;
        for (const key of Object.keys(JOINT_PHYSICS.joints)){
          const velKey = `${key}Vel`;
          fighter.jointAngles[velKey] *= 0.5;
        }
      } else {
        fighter.landedImpulse = Math.max(fighter.landedImpulse || 0, fighter.vel.y);
        const restitution = movement.restitution ?? 0;
        fighter.vel.y = -fighter.vel.y * restitution;
      }
    }
    fighter.onGround = true;
  } else {
    fighter.onGround = false;
  }

  // Ragdoll transitions and recovery
  if (fighter.ragdoll){
    fighter.ragdollTime += dt;
    if (fighter.onGround && fighter.ragdollTime > 2.5){
      fighter.ragdoll = false;
      fighter.ragdollTime = 0;
      fighter.recovering = true;
      fighter.recoveryTime = 0;
      fighter.recoveryStartY = fighter.pos.y;
      fighter.recoveryTargetY = groundCenterY;
      fighter.recoveryStartAngles = { ...fighter.physics.jointAngles };
      fighter.footing = 30;
    }
  } else if (fighter.recovering){
    fighter.recoveryTime += dt;
    const t = Math.min(1, fighter.recoveryTime / fighter.recoveryDuration);
    fighter.pos.y = lerp(fighter.recoveryStartY, fighter.recoveryTargetY, t);
    if (t >= 1){
      fighter.recovering = false;
      fighter.recoveryTime = 0;
    }
  }

  // Footing recovery
  if (fighter.onGround && !fighter.ragdoll){
    const recoveryRate = 20;
    const maxFooting = window.CONFIG?.knockback?.maxFooting ?? 100;
    fighter.footing = Math.min(maxFooting, (fighter.footing ?? 0) + recoveryRate * dt);
  }

  if (!fighter.ragdoll && !fighter.recovering && (fighter.footing ?? 0) <= 10){
    enterRagdollState(fighter);
  }

  fighter.landedImpulse = (fighter.landedImpulse || 0) * Math.exp(-10 * dt);
  fighter.prevOnGround = wasGrounded;

  fighter.physics.offsets = computePhysicsOffsets(fighter);
  fighter.physics.lastDt = dt;
}

export function initPhysics(){
  const C = window.CONFIG || {};
  ensureCamera(C);
  const G = window.GAME || {};
  if (G.FIGHTERS){
    for (const fighter of Object.values(G.FIGHTERS)){
      ensureFighterState(fighter, C);
    }
  }
  console.log('[physics] initialized');
}

export function updatePhysics(dt){
  const C = window.CONFIG || {};
  const G = window.GAME || {};
  const fighters = G.FIGHTERS || {};
  const worldWidth = G.CAMERA?.worldWidth || C.world?.width || 1600;
  if (fighters.player){
    updateFighterPhysics(fighters.player, dt, C, worldWidth);
    updatePlayerFacing(fighters.player, dt, C);
  }
  if (fighters.npc){
    updateFighterPhysics(fighters.npc, dt, C, worldWidth);
  }
}

export function getPhysicsOffsets(fighter){
  return fighter?.physics?.offsets || null;
}

export function getPhysicsJointAngles(fighter){
  return fighter?.physics?.jointAngles || null;
}
