import {
  computeRagdollBlendController,
  getFootingRecovery,
  getMovementMultipliers,
  getStatProfile,
} from './stat-hooks.js?v=1';

const JOINT_LIMITS = {
  torso: [-0.8, 0.8],
  head: [-0.6, 0.9],
  lShoulder: [-1.6, 1.6],
  rShoulder: [-1.6, 1.6],
  lElbow: [-2.6, 0.3],
  rElbow: [-0.3, 2.6],
  lHip: [-1.3, 0.9],
  rHip: [-1.3, 0.9],
  lKnee: [-0.3, 2.1],
  rKnee: [-0.3, 2.1],
};

const STIFFNESS = {
  normal: 0.28,
  ragdoll: 0.06,
};

const MAX_ANGULAR_VEL = 0.45;

const DAMPING_BASE = {
  normal: 0.9,
  ragdoll: 0.94,
};

const PARTIAL_STIFFNESS = 0.15;
const PARTIAL_DAMPING = 0.92;
const RAGDOLL_NOISE = 0.35;

const FULL_RAGDOLL_SETTLE_MIN = 1.35;
const FULL_RAGDOLL_SETTLE_MAX = 2.4;
const RECOVERY_BASE_DURATION = 0.8;
const RECOVERY_DURATION_BONUS = 1.1;

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function getBalanceScalar(key, fallback = 1) {
  if (typeof window === 'undefined') return fallback;
  const balance = window.CONFIG?.balance;
  const value = balance?.[key];
  return Number.isFinite(value) ? Number(value) : fallback;
}

function dampingForFrame(base, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return base;
  const frame = 1 / 60;
  return Math.pow(base, dt / frame);
}

function ensurePhysicsState(fighter) {
  fighter.physics ||= {};
  const state = fighter.physics;
  state.jointVel ||= {};
  state.ragdollAngles ||= {};
  state.ragdollTargets ||= {};
  state.partialBlend ||= 0;
  state.partialBlendStart ||= 0;
  state.partialBlendTimer ||= 0;
  state.partialBlendDuration ||= 0.45;
  state.airBlend ||= 0;
  state.controllerBlend ||= 0;
  state.lastFootingOnFall = Number.isFinite(state.lastFootingOnFall)
    ? state.lastFootingOnFall
    : fighter.footing ?? 0;
  state.ragdollRetargetTimer = Number.isFinite(state.ragdollRetargetTimer)
    ? state.ragdollRetargetTimer
    : 0;
  state.animationPose ||= null;
  state.recoveryBlend ||= 0;
  return state;
}

function ensureKnockbackState(fighter) {
  if (!fighter) return null;
  fighter.knockback ||= { timer: 0, magnitude: 0, direction: 0 };
  const state = fighter.knockback;
  if (!Number.isFinite(state.timer)) state.timer = 0;
  if (!Number.isFinite(state.magnitude)) state.magnitude = 0;
  if (!Number.isFinite(state.direction)) state.direction = 0;
  return state;
}

function computeGroundY(config) {
  const canvasH = config?.canvas?.h || 460;
  const groundRatio = config?.groundRatio || 0.7;
  return canvasH * groundRatio - 1;
}

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function randomizeRagdollTargets(state) {
  for (const key of Object.keys(JOINT_LIMITS)) {
    const [min, max] = JOINT_LIMITS[key];
    const center = (min + max) * 0.5;
    const span = (max - min) * 0.5;
    state.ragdollTargets[key] = clamp(center + randomRange(-span, span) * 0.7, min, max);
  }
  state.ragdollRetargetTimer = randomRange(0.45, 0.85);
}

function perturbJoints(state, strength) {
  const s = clamp(strength || 0, 0, 1);
  if (s <= 0) return;
  for (const key of Object.keys(JOINT_LIMITS)) {
    const noise = (Math.random() - 0.5) * 0.6 * s;
    state.jointVel[key] = (state.jointVel[key] || 0) + noise;
  }
}

function decayPartialBlend(state, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  if (state.partialBlend <= 0) {
    state.partialBlend = 0;
    return;
  }
  state.partialBlendTimer += dt;
  const duration = Math.max(0.12, state.partialBlendDuration || 0.4);
  const t = clamp(state.partialBlendTimer / duration, 0, 1);
  const eased = 1 - Math.pow(1 - t, 2.6);
  const start = state.partialBlendStart || state.partialBlend;
  state.partialBlend = clamp(start * (1 - eased), 0, 1);
  if (state.partialBlend <= 0.02) {
    state.partialBlend = 0;
    state.partialBlendTimer = 0;
  }
}

function updateRagdollTargets(fighter, state, dt) {
  if (fighter.ragdoll) {
    state.ragdollRetargetTimer -= dt;
    if (state.ragdollRetargetTimer <= 0) {
      randomizeRagdollTargets(state);
    }
  }
}

function updateJointPhysics(fighter, config, dt) {
  const state = ensurePhysicsState(fighter);
  const blendSources = [
    fighter.ragdoll ? 1 : 0,
    state.partialBlend || 0,
    state.airBlend || 0,
    state.recoveryBlend || 0,
    state.controllerBlend || 0,
  ];
  const totalBlend = Math.max(...blendSources);
  state.totalBlend = clamp(totalBlend, 0, 1);

  const pose = state.animationPose || fighter.jointAngles || {};
  for (const joint of Object.keys(JOINT_LIMITS)) {
    const [min, max] = JOINT_LIMITS[joint];
    let angle = state.ragdollAngles[joint];
    if (!Number.isFinite(angle)) {
      const base = clamp(pose[joint] ?? 0, min, max);
      state.ragdollAngles[joint] = base;
      angle = base;
    }
    let vel = state.jointVel[joint] || 0;
    let target = clamp(pose[joint] ?? 0, min, max);
    let stiffness = STIFFNESS.normal;
    let damping = dampingForFrame(DAMPING_BASE.normal, dt);

    if (fighter.ragdoll) {
      const ragTarget = state.ragdollTargets[joint];
      target = Number.isFinite(ragTarget) ? ragTarget : target;
      stiffness = STIFFNESS.ragdoll;
      damping = dampingForFrame(DAMPING_BASE.ragdoll, dt);
      vel += (Math.random() - 0.5) * RAGDOLL_NOISE;
    } else if (state.totalBlend > 0) {
      const ragTarget = state.ragdollTargets[joint];
      if (Number.isFinite(ragTarget)) {
        target = lerp(target, ragTarget, state.totalBlend);
      }
      const stiffnessBlend = clamp(state.totalBlend, 0, 1);
      stiffness = lerp(STIFFNESS.normal, PARTIAL_STIFFNESS, stiffnessBlend);
      const baseDamp = lerp(DAMPING_BASE.normal, PARTIAL_DAMPING, stiffnessBlend);
      damping = dampingForFrame(baseDamp, dt);
    }

    vel += (target - angle) * stiffness;
    vel *= damping;
    vel = clamp(vel, -MAX_ANGULAR_VEL, MAX_ANGULAR_VEL);
    angle = clamp(angle + vel, min, max);

    state.jointVel[joint] = vel;
    state.ragdollAngles[joint] = angle;
  }
}

function updateAirBlend(fighter, state, dt) {
  if (fighter.ragdoll) return;
  const target = fighter.onGround ? 0 : clamp(0.25 + Math.abs(fighter.vel?.y || 0) / 1200, 0.25, 0.7);
  const rate = fighter.onGround ? 12 : 6;
  const t = 1 - Math.exp(-rate * dt);
  state.airBlend += (target - state.airBlend) * t;
  if (state.airBlend < 0.02) state.airBlend = 0;
}

export function ensureFighterPhysics(fighter, config) {
  ensurePhysicsState(fighter);
  ensureKnockbackState(fighter);
  const state = fighter.physics;
  if (!fighter.ragdollTargets || !state.ragdollTargets || Object.keys(state.ragdollTargets).length === 0) {
    randomizeRagdollTargets(state);
  }
  if (!Number.isFinite(fighter.recoveryDuration)) {
    const recoveryMultiplier = getBalanceScalar('baseRecoveryRate', 1);
    fighter.recoveryDuration = RECOVERY_BASE_DURATION / Math.max(recoveryMultiplier, 0.0001);
  }
}

export function updatePhysicsPoseTarget(fighter, poseRad) {
  if (!fighter) return;
  const state = ensurePhysicsState(fighter);
  state.animationPose = poseRad ? { ...poseRad } : null;
}

function applyRecoveryBlend(fighter, state, dt) {
  if (!fighter.recovering) {
    state.recoveryBlend = 0;
    return;
  }
  const recoveryMultiplier = getBalanceScalar('baseRecoveryRate', 1);
  const baseDuration = RECOVERY_BASE_DURATION / Math.max(recoveryMultiplier, 0.0001);
  const duration = Math.max(baseDuration * 0.5, fighter.recoveryDuration || baseDuration);
  const t = clamp(fighter.recoveryTime / duration, 0, 1);
  state.recoveryBlend = Math.max(0, 0.75 * (1 - t));
}

export function updateFighterPhysics(fighter, config, dt, options = {}) {
  if (!fighter || !Number.isFinite(dt) || dt <= 0) return;
  const state = ensurePhysicsState(fighter);
  const knockback = ensureKnockbackState(fighter);
  const M = config?.movement || {};
  const platformColliders = Array.isArray(config?.platformingColliders) ? config.platformingColliders : [];
  const groundY = computeGroundY(config);
  const statProfile = fighter.statProfile || getStatProfile(fighter);
  const movementMultipliers = getMovementMultipliers(statProfile);
  const movementBaseMultiplier = getBalanceScalar('baseMovementSpeed', 1);
  const baseRecoveryMultiplier = getBalanceScalar('baseRecoveryRate', 1);
  const baseAccelX = (Number.isFinite(M.accelX) ? M.accelX : 1500) * movementBaseMultiplier;
  const baseMaxSpeed = (Number.isFinite(M.maxSpeedX) ? M.maxSpeedX : 420) * movementBaseMultiplier;
  const accelX = baseAccelX * (movementMultipliers.accel || 1);
  const maxSpeed = baseMaxSpeed * (movementMultipliers.maxSpeed || 1);
  const friction = Number.isFinite(M.friction) ? Math.max(0, M.friction) : 8;
  const restitution = Number.isFinite(M.restitution) ? Math.max(0, M.restitution) : 0;
  const gravity = Number.isFinite(M.gravity) ? M.gravity : 0;
  const jumpImpulse = Number.isFinite(M.jumpImpulse) ? M.jumpImpulse : -650;

  if (fighter.gravityOverride?.expiresAt) {
    const nowSec = performance.now() / 1000;
    if (fighter.gravityOverride.expiresAt <= nowSec) {
      delete fighter.gravityOverride;
    }
  }
  const defaultGravityScale = fighter.ragdoll ? 1.8 : 1;
  const gravityScale = Number.isFinite(fighter.gravityOverride?.value)
    ? fighter.gravityOverride.value
    : defaultGravityScale;

  const input = options.input || fighter.input || null;
  const attackActive = !!options.attackActive;
  const prevOnGround = !!fighter.onGround;

  const jumpPressed = input ? !!input.jump : false;
  fighter._jumpHeld = fighter._jumpHeld || false;
  if (jumpPressed && !fighter._jumpHeld && prevOnGround && !fighter.ragdoll && !fighter.recovering) {
    fighter.vel.y = jumpImpulse;
    fighter.onGround = false;
    state.airBlend = Math.max(state.airBlend, 0.45);
  }
  fighter._jumpHeld = jumpPressed;

  const baseDashSpeed = (Number.isFinite(M.dashSpeedMultiplier) ? M.dashSpeedMultiplier : 1.8) * movementBaseMultiplier;
  const dashMult = fighter.stamina?.isDashing
    ? baseDashSpeed * (movementMultipliers.dashSpeed || 1)
    : 1;

  fighter.vel ||= { x: 0, y: 0 };
  fighter.pos ||= { x: 0, y: computeGroundY(config) };
  if (!Number.isFinite(fighter.vel.x)) fighter.vel.x = 0;
  if (!Number.isFinite(fighter.vel.y)) fighter.vel.y = 0;

  fighter.vel.y += gravity * gravityScale * dt;

  if (knockback.timer > 0) {
    knockback.timer = Math.max(0, knockback.timer - dt);
    if (knockback.timer <= 0) {
      knockback.magnitude = 0;
    }
  }
  const underKnockback = knockback.timer > 0 && !fighter.ragdoll;

  if (fighter.ragdoll) {
    fighter.vel.x *= 0.96;
  } else if (fighter.recovering) {
    fighter.vel.x *= Math.exp(-friction * dt);
  } else if (underKnockback) {
    const damping = Math.exp(-Math.max(2, friction * 0.35) * dt);
    fighter.vel.x *= damping;
    if (input && !attackActive) {
      const inputDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      if (inputDir !== 0) {
        fighter.vel.x += accelX * 0.55 * inputDir * dt;
        if (Math.sign(fighter.vel.x) === inputDir) {
          knockback.timer = Math.max(0, knockback.timer - dt * 1.6);
        }
      }
    }
  } else if (input) {
    const left = !!input.left;
    const right = !!input.right;
    if (left && !right && !attackActive) {
      fighter.vel.x -= accelX * dashMult * dt;
      fighter.facingRad = Math.PI;
      fighter.facingSign = -1;
    } else if (right && !left && !attackActive) {
      fighter.vel.x += accelX * dashMult * dt;
      fighter.facingRad = 0;
      fighter.facingSign = 1;
    } else {
      fighter.vel.x *= Math.exp(-friction * dt);
    }
  } else {
    fighter.vel.x *= Math.exp(-friction * dt);
  }

  fighter.vel.x = clamp(fighter.vel.x, -maxSpeed * dashMult, maxSpeed * dashMult);

  fighter.pos.x += fighter.vel.x * dt;
  fighter.pos.y += fighter.vel.y * dt;

  const margin = 40;
  const worldWidth = config?.canvas?.w || 720;
  fighter.pos.x = clamp(fighter.pos.x, margin, worldWidth - margin);

  let onGround = false;
  const prevY = Number.isFinite(fighter.prevPosY) ? fighter.prevPosY : fighter.pos.y - fighter.vel.y * dt;
  fighter.prevPosY = fighter.pos.y;

  if (platformColliders.length && !fighter.ragdoll) {
    const px = Number.isFinite(fighter.pos.x) ? fighter.pos.x : 0;
    for (const raw of platformColliders) {
      const left = Number(raw.left);
      const width = Number(raw.width);
      const topOffset = Number(raw.topOffset);
      const height = Number(raw.height);
      if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) continue;
      if (!Number.isFinite(height) || height <= 0) continue;
      const right = left + width;
      if (px < left || px > right) continue;
      const top = groundY + (Number.isFinite(topOffset) ? topOffset : 0);
      const bottom = top + height;
      if (prevY <= top && fighter.pos.y >= top) {
        fighter.pos.y = top;
        if (fighter.vel.y > 0) {
          fighter.landedImpulse = Math.max(Math.abs(fighter.vel.y), fighter.landedImpulse || 0);
          fighter.vel.y = -fighter.vel.y * restitution;
        }
        onGround = true;
      } else if (prevY >= bottom && fighter.pos.y <= bottom) {
        fighter.pos.y = bottom;
        if (fighter.vel.y < 0) fighter.vel.y = 0;
      }
    }
  }

  if (fighter.pos.y >= groundY) {
    fighter.pos.y = groundY;
    if (fighter.vel.y > 0) {
      fighter.landedImpulse = Math.max(Math.abs(fighter.vel.y), fighter.landedImpulse || 0);
      if (fighter.ragdoll) {
        fighter.vel.y = -fighter.vel.y * 0.2;
        perturbJoints(state, 0.35);
      } else {
        fighter.vel.y = -fighter.vel.y * restitution;
      }
      if (Math.abs(fighter.vel.y) < 1) fighter.vel.y = 0;
    }
    onGround = true;
  }

  fighter.onGround = onGround;
  if (fighter.onGround && Math.abs(fighter.vel.y) < 1) {
    fighter.vel.y = 0;
  }

  if (!fighter.ragdoll && fighter.onGround) {
    const baseRecoveryRate = 20 * getFootingRecovery(statProfile) * baseRecoveryMultiplier;
    const recoveryRate = underKnockback ? Math.max(4, baseRecoveryRate * 0.35) : baseRecoveryRate;
    const maxFoot = config?.knockback?.maxFooting ?? 100;
    fighter.footing = Math.min(maxFoot, (fighter.footing ?? maxFoot) + recoveryRate * dt);
  }

  if (fighter.ragdoll) {
    fighter.ragdollTime = (fighter.ragdollTime || 0) + dt;
    state.lastFootingOnFall = fighter.footing ?? 0;
    updateRagdollTargets(fighter, state, dt);
    const maxFoot = config?.knockback?.maxFooting ?? 100;
    const instability = 1 - clamp((state.lastFootingOnFall || 0) / maxFoot, 0, 1);
    const settleTime = lerp(FULL_RAGDOLL_SETTLE_MIN, FULL_RAGDOLL_SETTLE_MAX, instability);
    if (fighter.onGround && fighter.ragdollTime >= settleTime) {
      fighter.ragdoll = false;
      fighter.recovering = true;
      fighter.recoveryTime = 0;
      fighter.recoveryStartY = fighter.pos.y;
      fighter.recoveryTargetY = groundY;
      const baseDuration = RECOVERY_BASE_DURATION / Math.max(baseRecoveryMultiplier, 0.0001);
      const bonusDuration = RECOVERY_DURATION_BONUS / Math.max(baseRecoveryMultiplier, 0.0001);
      fighter.recoveryDuration = baseDuration + bonusDuration * instability;
      fighter.recoveryStartAngles = { ...state.ragdollAngles };
      state.partialBlend = Math.max(state.partialBlend, 0.55);
      state.partialBlendStart = state.partialBlend;
      state.partialBlendTimer = 0;
      state.partialBlendDuration = fighter.recoveryDuration;
    }
  } else if (fighter.recovering) {
    fighter.recoveryTime = (fighter.recoveryTime || 0) + dt;
    const baseDuration = RECOVERY_BASE_DURATION / Math.max(baseRecoveryMultiplier, 0.0001);
    const duration = Math.max(baseDuration * 0.5, fighter.recoveryDuration || baseDuration);
    const t = clamp(fighter.recoveryTime / duration, 0, 1);
    fighter.pos.y = lerp(fighter.recoveryStartY ?? groundY, fighter.recoveryTargetY ?? groundY, 1 - Math.pow(1 - t, 2));
    if (t >= 1) {
      fighter.recovering = false;
      fighter.recoveryTime = 0;
      fighter.footing = Math.max(fighter.footing ?? 0, (config?.knockback?.maxFooting ?? 100) * 0.3);
    }
  }

  const controller = computeRagdollBlendController(fighter, config);
  const controllerBlend = Number.isFinite(controller?.ratio) ? controller.ratio : 0;
  state.controllerBlend = clamp(controllerBlend, 0, 1);
  fighter.ragdollBlend ||= {};
  fighter.ragdollBlend.ratio = state.controllerBlend;
  fighter.ragdollBlend.base = controller?.base ?? 0;
  fighter.ragdollBlend.contributions = controller?.contributions || {};

  decayPartialBlend(state, dt);
  updateAirBlend(fighter, state, dt);
  applyRecoveryBlend(fighter, state, dt);
  updateJointPhysics(fighter, config, dt);

  fighter.landedImpulse = (fighter.landedImpulse || 0) * Math.exp(-10 * dt);
  fighter.prevOnGround = prevOnGround;
}

export function triggerFullRagdoll(fighter, config, { angle = 0, force = 0 } = {}) {
  if (!fighter) return;
  ensureFighterPhysics(fighter, config);
  const state = ensurePhysicsState(fighter);
  const knockback = ensureKnockbackState(fighter);
  fighter.ragdoll = true;
  fighter.ragdollTime = 0;
  fighter.recovering = false;
  state.partialBlend = 1;
  state.partialBlendStart = 1;
  state.partialBlendTimer = 0;
  state.partialBlendDuration = 0.6;
  randomizeRagdollTargets(state);
  perturbJoints(state, 1);

  const backAngle = angle + Math.PI;
  const impulseMag = force * 0.35 + 160;
  fighter.vel.x += Math.cos(backAngle) * impulseMag;
  fighter.vel.y += Math.sin(backAngle) * impulseMag * 0.45;
  knockback.timer = 0;
  knockback.magnitude = 0;
}

export function applyHitReactionRagdoll(fighter, config, {
  angle = 0,
  force = 0,
  footingBefore,
} = {}) {
  if (!fighter) return false;
  ensureFighterPhysics(fighter, config);
  const state = ensurePhysicsState(fighter);
  const maxFoot = config?.knockback?.maxFooting ?? 100;
  const prevFooting = clamp(
    footingBefore != null ? footingBefore : fighter.footing ?? maxFoot,
    0,
    maxFoot,
  );
  if (prevFooting <= 0) {
    triggerFullRagdoll(fighter, config, { angle, force });
    return true;
  }

  if (prevFooting >= maxFoot) {
    return false;
  }

  const instability = 1 - prevFooting / maxFoot;
  const blend = clamp(0.2 + instability * 0.7, 0.1, 0.9);
  state.partialBlend = Math.max(state.partialBlend || 0, blend);
  state.partialBlendStart = state.partialBlend;
  state.partialBlendTimer = 0;
  state.partialBlendDuration = 0.3 + instability * 0.7;

  if (!fighter.ragdoll && fighter.attack?.active) {
    const forceFactor = Number.isFinite(force) ? Math.min(Math.abs(force) / 900, 0.25) : 0;
    const pause = clamp(0.08 + blend * 0.35 + forceFactor, 0.08, 0.5);
    fighter.attack.hitPause = Math.max(fighter.attack.hitPause || 0, pause);
    fighter.anim = fighter.anim || {};
    fighter.anim.hitPause = Math.max(fighter.anim.hitPause || 0, pause);
  }

  perturbJoints(state, blend);
  const impulseMag = force * (0.12 + 0.35 * instability);
  if (impulseMag > 0) {
    const backAngle = angle + Math.PI;
    fighter.vel.x += Math.cos(backAngle) * impulseMag;
    fighter.vel.y += Math.sin(backAngle) * impulseMag * 0.28;
  }
  const knockback = ensureKnockbackState(fighter);
  const baseDuration = 0.22 + Math.abs(force) / 320;
  knockback.timer = Math.max(knockback.timer || 0, Math.min(0.9, baseDuration));
  knockback.magnitude = Math.max(knockback.magnitude || 0, Math.abs(force));
  knockback.direction = angle;
  return false;
}

export function getPhysicsRagdollBlend(fighter) {
  if (!fighter) return 0;
  const state = fighter.physics;
  if (!state) return fighter.ragdoll ? 1 : 0;
  if (fighter.ragdoll) return 1;
  return clamp(Math.max(state.totalBlend || 0, fighter.recovering ? 0.3 : 0), 0, 1);
}

export function getPhysicsRagdollAngles(fighter) {
  if (!fighter?.physics) return null;
  return fighter.physics.ragdollAngles || null;
}

