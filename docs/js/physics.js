import { getFootingRecovery, getMovementMultipliers, getStatProfile } from './stat-hooks.js?v=1';
import { computeGroundY } from './ground-utils.js?v=1';

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
const AIRBORNE_SPIN_JOINTS = ['torso', 'head', 'lShoulder', 'rShoulder', 'lHip', 'rHip', 'lKnee', 'rKnee'];
const DEFAULT_WALK_SPEED_MULTIPLIERS = { combat: 1, nonCombat: 0.82, sneak: 0.7 };

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function resolveWorldWidth(config) {
  const selectWidth = (...values) => values.find((value) => Number.isFinite(value) && value > 0) || null;
  const worldWidth = selectWidth(
    config?.world?.width,
    config?.camera?.worldWidth,
    typeof window !== 'undefined' ? window.GAME?.CAMERA?.worldWidth : null,
    typeof window !== 'undefined' ? window.GAME?.RENDER_STATE?.stage?.width : null,
    typeof window !== 'undefined' ? window.GAME?.CAMERA?.viewportWidth : null,
    config?.canvas?.w,
  );
  return worldWidth || 720;
}

function getBalanceScalar(key, fallback = 1) {
  if (typeof window === 'undefined') return fallback;
  const balance = window.CONFIG?.balance;
  const value = balance?.[key];
  return Number.isFinite(value) ? Number(value) : fallback;
}

function resolveWalkModeForPhysics(fighter) {
  if (!fighter) return 'combat';
  if (fighter.sneak || fighter.renderProfile?.sneak) return 'sneak';
  if (fighter.nonCombat || fighter.renderProfile?.nonCombat) return 'nonCombat';
  return fighter.walkMode || 'combat';
}

function resolveWalkSpeedMultiplier(fighter, config) {
  const mode = resolveWalkModeForPhysics(fighter);
  const configSource = config?.walkSpeedMultipliers || (typeof window !== 'undefined' ? window.CONFIG?.walkSpeedMultipliers : null);
  const configured = configSource && Number.isFinite(configSource[mode]) ? configSource[mode] : null;
  const fallback = DEFAULT_WALK_SPEED_MULTIPLIERS[mode] ?? 1;
  const resolved = configured != null ? configured : fallback;
  return Number.isFinite(resolved) ? resolved : 1;
}

function dampingForFrame(base, dt) {
  if (!Number.isFinite(dt) || dt <= 0) return base;
  const frame = 1 / 60;
  return Math.pow(base, dt / frame);
}

function resolveCanvasWidth(config) {
  const canvasWidth = Number(config?.canvas?.w);
  if (Number.isFinite(canvasWidth) && canvasWidth > 0) return canvasWidth;
  return 720;
}

function resolveBaseHorizontalBounds(config) {
  const width = resolveCanvasWidth(config);
  const defaultMargin = 40;
  const margins = config?.canvas?.margins || {};
  const marginLeft = Number.isFinite(margins.left) && margins.left >= 0 ? margins.left : defaultMargin;
  const marginRight = Number.isFinite(margins.right) && margins.right >= 0 ? margins.right : marginLeft;

  const movementBounds = config?.movement?.bounds || {};
  const movementLeft = Number.isFinite(movementBounds.left)
    ? movementBounds.left
    : Number.isFinite(movementBounds.min)
      ? movementBounds.min
      : null;
  const movementRight = Number.isFinite(movementBounds.right)
    ? movementBounds.right
    : Number.isFinite(movementBounds.max)
      ? movementBounds.max
      : null;

  const candidates = [];

  if (movementLeft != null && movementRight != null) {
    candidates.push({ minX: movementLeft, maxX: movementRight });
  }

  candidates.push({
    minX: marginLeft,
    maxX: width - marginRight,
  });

  const defaultBounds = {
    minX: defaultMargin,
    maxX: width - defaultMargin,
  };

  const chosen = candidates.find(
    (bounds) =>
      Number.isFinite(bounds.minX) &&
      Number.isFinite(bounds.maxX) &&
      bounds.maxX > bounds.minX,
  );

  const baseBounds = chosen || (Number.isFinite(defaultBounds.maxX) && defaultBounds.maxX > defaultBounds.minX
    ? defaultBounds
    : { minX: 0, maxX: Math.max(0, width) });

  const resolvePlayableBounds = () => {
    const registryBounds =
      typeof window !== 'undefined'
        ? window.GAME?.mapRegistry?.getActiveArea?.()?.playableBounds
        : null;
    const mapBounds = config?.map?.activePlayableBounds || config?.map?.playableBounds || null;
    return [mapBounds, registryBounds]
      .find((bounds) => Number.isFinite(bounds?.left) && Number.isFinite(bounds?.right))
      || null;
  };

  const playableBounds = resolvePlayableBounds();
  const mapMinX = Number.isFinite(config?.map?.playAreaMinX) ? config.map.playAreaMinX : null;
  const mapMaxX = Number.isFinite(config?.map?.playAreaMaxX) ? config.map.playAreaMaxX : null;

  let minX = baseBounds.minX;
  let maxX = baseBounds.maxX;

  if (playableBounds) {
    minX = playableBounds.left;
    maxX = playableBounds.right;
  } else {
    if (mapMinX != null) minX = mapMinX;
    if (mapMaxX != null) maxX = mapMaxX;
    if (!(Number.isFinite(minX) && Number.isFinite(maxX) && maxX > minX)) {
      minX = baseBounds.minX;
      maxX = baseBounds.maxX;
    }
  }

  return { minX, maxX, span: Math.max(1, maxX - minX) };
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

function randomRange(min, max) {
  return min + Math.random() * (max - min);
}

function resolveBodyRadiusFromConfig(config) {
  const actorRadius = Number.isFinite(config?.actor?.bodyRadius)
    ? Math.max(0, config.actor.bodyRadius)
    : null;
  const movementRadius = Number.isFinite(config?.movement?.bodyRadius)
    ? Math.max(0, config.movement.bodyRadius)
    : null;
  if (actorRadius != null) return actorRadius;
  if (movementRadius != null) return movementRadius;
  const scale = Number.isFinite(config?.actor?.scale) ? config.actor.scale : 1;
  const wHalf = (config?.parts?.hitbox?.w || 40) * scale * 0.5;
  const hHalf = (config?.parts?.hitbox?.h || 80) * scale * 0.5;
  return Math.sqrt(wHalf * wHalf + hHalf * hHalf);
}

function resolveFighterBodyRadius(fighter, config) {
  if (!fighter) return 0;
  if (Number.isFinite(fighter.bodyRadius)) {
    return Math.max(0, fighter.bodyRadius);
  }
  const physicsRadius = Number.isFinite(fighter.physics?.bodyRadius)
    ? Math.max(0, fighter.physics.bodyRadius)
    : null;
  if (physicsRadius != null) return physicsRadius;
  return resolveBodyRadiusFromConfig(config);
}

function resolveCollisionShare(fighter) {
  if (!fighter || fighter.isDead) return 0.5;
  if (fighter.ragdoll) return 0.25;
  if (fighter.recovering) return 0.4;
  return fighter.isPlayer ? 0.55 : 0.5;
}

const DEFAULT_HORIZONTAL_MARGIN = 40;
const DEFAULT_CANVAS_WIDTH = 720;
const DEFAULT_PLAYABLE_SPAN = DEFAULT_CANVAS_WIDTH - DEFAULT_HORIZONTAL_MARGIN * 2;

function resolveHorizontalBounds(config) {
  const resolvePlayableBounds = () => {
    const registryBounds =
      typeof window !== 'undefined'
        ? window.GAME?.mapRegistry?.getActiveArea?.()?.playableBounds
        : null;
    const mapBounds = config?.map?.activePlayableBounds || config?.map?.playableBounds || null;
    return [mapBounds, registryBounds]
      .find((bounds) => Number.isFinite(bounds?.left) && Number.isFinite(bounds?.right))
      || null;
  };

  const playableBounds = resolvePlayableBounds();
  const mapMinX = Number.isFinite(config?.map?.playAreaMinX) ? config.map.playAreaMinX : null;
  const mapMaxX = Number.isFinite(config?.map?.playAreaMaxX) ? config.map.playAreaMaxX : null;

  const { minX: resolvedMinX, maxX: resolvedMaxX } = resolveBaseHorizontalBounds(config);
  let minX = resolvedMinX;
  let maxX = resolvedMaxX;

  if (playableBounds) {
    minX = playableBounds.left;
    maxX = playableBounds.right;
  } else {
    if (mapMinX != null) minX = mapMinX;
    if (mapMaxX != null) maxX = mapMaxX;
    if (!(Number.isFinite(minX) && Number.isFinite(maxX) && maxX > minX)) {
      minX = resolvedMinX;
      maxX = resolvedMaxX;
    }
  }

  return { minX, maxX, span: Math.max(1, maxX - minX) };
}

function clampFighterToBounds(fighter, config) {
  if (!fighter?.pos) return;

  const bounds = typeof resolveHorizontalBounds === 'function'
    ? resolveHorizontalBounds(config)
    : (() => {
        const margin = typeof DEFAULT_HORIZONTAL_MARGIN === 'number' ? DEFAULT_HORIZONTAL_MARGIN : 40;
        const canvasWidth = Number.isFinite(config?.canvas?.w)
          ? config.canvas.w
          : (typeof DEFAULT_CANVAS_WIDTH === 'number' ? DEFAULT_CANVAS_WIDTH : 720);
        const playableBounds = [
          config?.map?.activePlayableBounds,
          config?.map?.playableBounds,
        ]
          .find((b) => Number.isFinite(b?.left) && Number.isFinite(b?.right))
          || null;
        const mapMinX = Number.isFinite(config?.map?.playAreaMinX) ? config.map.playAreaMinX : null;
        const mapMaxX = Number.isFinite(config?.map?.playAreaMaxX) ? config.map.playAreaMaxX : null;
        let minX = mapMinX ?? margin;
        let maxX = mapMaxX ?? (canvasWidth - margin);
        if (playableBounds) {
          minX = playableBounds.left;
          maxX = playableBounds.right;
        } else if (mapMinX == null || mapMaxX == null) {
          minX = margin;
          maxX = canvasWidth - margin;
        }
        return { minX, maxX, span: Math.max(1, maxX - minX) };
      })();
  fighter.pos.x = clamp(fighter.pos.x, bounds.minX, bounds.maxX);

  const groundY = computeGroundY(config);
  if (!fighter.ragdoll && fighter.pos.y > groundY) {
    fighter.pos.y = groundY;
  }
}

function computeBoundsSpeedScalar(span) {
  if (!Number.isFinite(span) || span <= 0) return 1;
  const normalized = span / DEFAULT_PLAYABLE_SPAN;
  return clamp(normalized, 0.55, 2.25);
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
  const blendSources = [fighter.ragdoll ? 1 : 0, state.partialBlend || 0, state.airBlend || 0, state.recoveryBlend || 0];
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
  state.bodyRadius = resolveFighterBodyRadius(fighter, config);
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
  const defaultSurfaceMaterial = typeof config?.ground?.materialType === 'string'
    ? config.ground.materialType.trim()
    : '';
  let newSurfaceMaterial = null;
  const statProfile = fighter.statProfile || getStatProfile(fighter);
  const movementMultipliers = getMovementMultipliers(statProfile);
  const bounds = resolveHorizontalBounds(config);
  const boundsSpeedScalar = computeBoundsSpeedScalar(bounds.span);
  const movementBaseMultiplier = getBalanceScalar('baseMovementSpeed', 1);
  const walkSpeedMultiplier = resolveWalkSpeedMultiplier(fighter, config);
  const baseRecoveryMultiplier = getBalanceScalar('baseRecoveryRate', 1);
  const baseAccelX = (Number.isFinite(M.accelX) ? M.accelX : 1500) * movementBaseMultiplier;
  const baseMaxSpeed = (Number.isFinite(M.maxSpeedX) ? M.maxSpeedX : 420) * movementBaseMultiplier;
  const accelX = baseAccelX * boundsSpeedScalar * (movementMultipliers.accel || 1) * walkSpeedMultiplier;
  const maxSpeed = baseMaxSpeed * boundsSpeedScalar * (movementMultipliers.maxSpeed || 1) * walkSpeedMultiplier;
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
  // Allow movement during Charge phase (hold-release heavies)
  const attackPhase = fighter.attack?.currentPhase || null;
  const canMoveWhileAttacking = attackActive && attackPhase === 'Charge';
  const prevOnGround = !!fighter.onGround;

  const jumpPressed = input ? !!input.jump : false;
  fighter._jumpHeld = fighter._jumpHeld || false;
  if (jumpPressed && !fighter._jumpHeld && prevOnGround && !fighter.ragdoll && !fighter.recovering) {
    fighter.vel.y = jumpImpulse;
    fighter.onGround = false;
    state.airBlend = Math.max(state.airBlend, 0.45);
  }
  fighter._jumpHeld = jumpPressed;

  // Dash removed - speed multiplier always 1
  const dashMult = 1;

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
    if (input && (!attackActive || canMoveWhileAttacking)) {
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
    if (left && !right && (!attackActive || canMoveWhileAttacking)) {
      fighter.vel.x -= accelX * dashMult * dt;
      fighter.facingRad = Math.PI;
      fighter.facingSign = -1;
    } else if (right && !left && (!attackActive || canMoveWhileAttacking)) {
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

  const { minX: movementMinX, maxX: movementMaxX } = resolveHorizontalBounds(config);
  fighter.pos.x = clamp(fighter.pos.x, movementMinX, movementMaxX);

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
      const colliderMaterial = typeof raw.materialType === 'string' ? raw.materialType.trim() : '';
      if (prevY <= top && fighter.pos.y >= top) {
        fighter.pos.y = top;
        if (fighter.vel.y > 0) {
          fighter.landedImpulse = Math.max(Math.abs(fighter.vel.y), fighter.landedImpulse || 0);
          fighter.vel.y = -fighter.vel.y * restitution;
        }
        onGround = true;
        if (colliderMaterial) {
          newSurfaceMaterial = colliderMaterial;
        }
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
    if (!newSurfaceMaterial && defaultSurfaceMaterial) {
      newSurfaceMaterial = defaultSurfaceMaterial;
    }
  }

  fighter.onGround = onGround;
  if (fighter.onGround && Math.abs(fighter.vel.y) < 1) {
    fighter.vel.y = 0;
  }

  if (fighter.onGround) {
    const resolvedMaterial = (newSurfaceMaterial && newSurfaceMaterial.trim())
      ? newSurfaceMaterial
      : (fighter.surfaceMaterial && fighter.surfaceMaterial.trim())
        ? fighter.surfaceMaterial
        : defaultSurfaceMaterial || null;
    fighter.surfaceMaterial = resolvedMaterial || null;
  } else if (fighter.surfaceMaterial) {
    fighter.surfaceMaterial = null;
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

  decayPartialBlend(state, dt);
  updateAirBlend(fighter, state, dt);
  applyRecoveryBlend(fighter, state, dt);
  updateJointPhysics(fighter, config, dt);

  fighter.landedImpulse = (fighter.landedImpulse || 0) * Math.exp(-10 * dt);
  fighter.prevOnGround = prevOnGround;
}

export function resolveFighterBodyCollisions(fighters, config, { iterations = 2 } = {}) {
  if (!Array.isArray(fighters) || fighters.length < 2) return;
  const worldConfig = config || {};
  const entries = [];
  const seen = new Set();
  for (const fighter of fighters) {
    if (!fighter || seen.has(fighter)) continue;
    seen.add(fighter);
    if (fighter.destroyed) continue;
    if (!fighter.pos || !Number.isFinite(fighter.pos.x) || !Number.isFinite(fighter.pos.y)) continue;
    if (!fighter.vel || !Number.isFinite(fighter.vel.x) || !Number.isFinite(fighter.vel.y)) {
      fighter.vel = { x: Number(fighter.vel?.x) || 0, y: Number(fighter.vel?.y) || 0 };
    }
    ensureFighterPhysics(fighter, worldConfig);
    const radius = Math.max(0, resolveFighterBodyRadius(fighter, worldConfig));
    if (radius <= 0) continue;
    entries.push({ fighter, radius });
  }
  if (entries.length < 2) return;

  const passes = Math.max(1, Math.floor(iterations));
  for (let pass = 0; pass < passes; pass += 1) {
    for (let i = 0; i < entries.length; i += 1) {
      const a = entries[i];
      const fighterA = a.fighter;
      if (!fighterA || fighterA.ragdoll) continue;
      for (let j = i + 1; j < entries.length; j += 1) {
        const b = entries[j];
        const fighterB = b.fighter;
        if (!fighterB || fighterB.ragdoll) continue;
        const ax = fighterA.pos.x;
        const ay = fighterA.pos.y;
        const bx = fighterB.pos.x;
        const by = fighterB.pos.y;
        let dx = ax - bx;
        let dy = ay - by;
        const minDist = a.radius + b.radius;
        if (!(minDist > 0)) continue;
        const biasHorizontal = Math.abs(dy) < minDist * 0.6 && (fighterA.onGround || fighterB.onGround);
        if (biasHorizontal) {
          const gap = minDist - Math.abs(dx);
          if (!(gap > 0)) continue;
          const dir = dx >= 0 ? 1 : -1;
          const push = gap * 0.5 + 0.5;
          const shareA = resolveCollisionShare(fighterA);
          const shareB = resolveCollisionShare(fighterB);
          const totalShare = shareA + shareB || 1;
          const weightA = shareB / totalShare;
          const weightB = shareA / totalShare;
          fighterA.pos.x += dir * push * weightA;
          fighterB.pos.x -= dir * push * weightB;
          const relVel = (fighterA.vel?.x || 0) - (fighterB.vel?.x || 0);
          if (relVel * dir < 0) {
            const correction = relVel * 0.5;
            if (fighterA.vel) fighterA.vel.x -= correction * weightA;
            if (fighterB.vel) fighterB.vel.x += correction * weightB;
          }
          continue;
        }
        const distSq = dx * dx + dy * dy;
        if (distSq >= minDist * minDist) continue;
        let dist = Math.sqrt(distSq);
        if (!(dist > 1e-6)) {
          const angle = (i + j) % 2 === 0 ? Math.PI / 4 : -Math.PI / 4;
          dx = Math.cos(angle);
          dy = Math.sin(angle);
          dist = 1;
        } else {
          dx /= dist;
          dy /= dist;
        }
        const overlap = minDist - dist;
        if (!(overlap > 0)) continue;
        const shareA = resolveCollisionShare(fighterA);
        const shareB = resolveCollisionShare(fighterB);
        const totalShare = shareA + shareB || 1;
        const weightA = shareB / totalShare;
        const weightB = shareA / totalShare;
        const push = overlap * 0.5 + 0.25;
        fighterA.pos.x += dx * push * weightA;
        fighterA.pos.y += dy * push * weightA;
        fighterB.pos.x -= dx * push * weightB;
        fighterB.pos.y -= dy * push * weightB;
        const relVelX = (fighterA.vel?.x || 0) - (fighterB.vel?.x || 0);
        const relVelY = (fighterA.vel?.y || 0) - (fighterB.vel?.y || 0);
        const relNormal = relVelX * dx + relVelY * dy;
        if (relNormal < 0) {
          const correction = relNormal * 0.5;
          if (fighterA.vel) {
            fighterA.vel.x -= dx * correction * weightA;
            fighterA.vel.y -= dy * correction * weightA;
          }
          if (fighterB.vel) {
            fighterB.vel.x += dx * correction * weightB;
            fighterB.vel.y += dy * correction * weightB;
          }
        }
      }
    }
  }

  for (const entry of entries) {
    clampFighterToBounds(entry.fighter, worldConfig);
  }
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

export function applyAirborneSpinImpulse(fighter, config, {
  force = 0,
  direction = 0,
} = {}) {
  if (!fighter) return;
  if (fighter.onGround) return;
  ensureFighterPhysics(fighter, config);
  const state = ensurePhysicsState(fighter);
  const magnitude = clamp(Math.abs(force) / 320, 0, 2.2);
  if (magnitude <= 0) return;
  const spinDir = direction !== 0 ? Math.sign(direction) : (Math.random() < 0.5 ? -1 : 1);
  const baseTorque = 0.22 * magnitude;
  for (const joint of AIRBORNE_SPIN_JOINTS) {
    const bias = joint === 'torso' || joint === 'head' ? 1 : 0.7;
    state.jointVel[joint] = (state.jointVel[joint] || 0) + spinDir * baseTorque * bias;
  }
  perturbJoints(state, clamp(0.3 + magnitude * 0.4, 0, 1));
  const addedBlend = clamp(0.18 + magnitude * 0.28, 0, 0.75);
  state.partialBlend = Math.max(state.partialBlend || 0, addedBlend);
  state.partialBlendStart = state.partialBlend;
  state.partialBlendTimer = 0;
  state.partialBlendDuration = Math.max(state.partialBlendDuration || 0.45, 0.32 + magnitude * 0.45);
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

