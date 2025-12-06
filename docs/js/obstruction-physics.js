import { computeGroundY } from './ground-utils.js?v=1';

/**
 * Obstruction Physics System
 * Handles dynamic physics simulation for obstruction prefabs with physics.enabled=true
 */

/**
 * Initialize physics state for a dynamic obstruction instance
 */
export function initObstructionPhysics(instance, config) {
  if (!instance || !instance.prefab) return;

  const physics = instance.prefab?.obstruction?.physics;
  if (!physics || !physics.enabled || !physics.dynamic) return;

  // Initialize physics state if not already present
  if (!instance.physics) {
    instance.physics = {
      vel: { x: 0, y: 0 },
      mass: Number.isFinite(physics.mass) && physics.mass > 0 ? physics.mass : 1,
      drag: Number.isFinite(physics.drag) && physics.drag >= 0 ? physics.drag : 0.2,
      restitution: 0.3, // Bounce factor
      onGround: false,
    };
  }

  // Ensure position is initialized
  if (!instance.position) {
    instance.position = { x: 0, y: computeGroundY(config) };
  }

  // Initialize velocity if not present
  if (!instance.physics.vel) {
    instance.physics.vel = { x: 0, y: 0 };
  }
}

/**
 * Update physics for all dynamic obstruction instances
 */
export function updateObstructionPhysics(instances, config, dt, options = {}) {
  if (!Array.isArray(instances) || !Number.isFinite(dt) || dt <= 0) return;

  const gravity = 2400; // Same gravity scale as fighters
  const groundY = computeGroundY(config);
  const friction = 8; // Ground friction

  for (const instance of instances) {
    const physics = instance.prefab?.obstruction?.physics;
    if (!physics || !physics.enabled || !physics.dynamic) continue;
    if (!instance.physics) continue;

    const state = instance.physics;
    const mass = state.mass;
    const drag = state.drag;

    // Apply gravity
    state.vel.y += gravity * dt;

    // Apply drag to horizontal movement
    const dragFactor = Math.exp(-drag * dt);
    state.vel.x *= dragFactor;

    // Update position
    instance.position.x += state.vel.x * dt;
    instance.position.y += state.vel.y * dt;

    // Ground collision
    if (instance.position.y >= groundY) {
      instance.position.y = groundY;
      state.onGround = true;

      // Bounce
      if (state.vel.y > 0) {
        state.vel.y = -state.vel.y * state.restitution;

        // Stop bouncing if velocity is too low
        if (Math.abs(state.vel.y) < 10) {
          state.vel.y = 0;
        }
      }

      // Apply ground friction
      const frictionFactor = Math.exp(-friction * dt);
      state.vel.x *= frictionFactor;
    } else {
      state.onGround = false;
    }

    // Clamp very small velocities to zero
    if (Math.abs(state.vel.x) < 0.1) state.vel.x = 0;
    if (Math.abs(state.vel.y) < 0.1 && state.onGround) state.vel.y = 0;
  }
}

/**
 * Resolve collision between a circle (fighter) and a dynamic obstruction
 */
function resolveCircleBoxCollision(circleX, circleY, radius, box) {
  const boxLeft = box.x + (box.offsetX || 0) - box.width / 2;
  const boxRight = boxLeft + box.width;
  const boxTop = box.y + (box.offsetY || 0) - box.height;
  const boxBottom = box.y + (box.offsetY || 0);

  // Find nearest point on box to circle
  const nearestX = Math.max(boxLeft, Math.min(circleX, boxRight));
  const nearestY = Math.max(boxTop, Math.min(circleY, boxBottom));

  const dx = circleX - nearestX;
  const dy = circleY - nearestY;
  const distSq = dx * dx + dy * dy;
  const radiusSq = radius * radius;

  if (distSq >= radiusSq) return null; // No collision

  const dist = Math.sqrt(Math.max(distSq, 1e-12));
  const penetration = radius - dist;

  // Calculate normal
  let nx, ny;
  if (dist > 1e-6) {
    nx = dx / dist;
    ny = dy / dist;
  } else {
    // Circle center inside box - push out vertically
    nx = 0;
    ny = -1;
  }

  return {
    normal: { x: nx, y: ny },
    penetration,
  };
}

/**
 * Handle collisions between fighters and dynamic obstructions
 */
export function resolveObstructionFighterCollisions(instances, fighters, config) {
  if (!Array.isArray(instances) || !Array.isArray(fighters)) return;

  const groundY = computeGroundY(config);

  for (const instance of instances) {
    const physics = instance.prefab?.obstruction?.physics;
    const collision = instance.prefab?.obstruction?.collision;

    if (!physics || !physics.enabled || !physics.dynamic) continue;
    if (!collision || !collision.enabled) continue;
    if (!instance.physics) continue;

    const box = collision.box;
    if (!box || !box.width || !box.height) continue;

    const obsMass = instance.physics.mass;

    for (const fighter of fighters) {
      if (!fighter || !fighter.pos || fighter.destroyed) continue;

      // Use fighter body radius for collision
      const fighterRadius = fighter.physics?.bodyRadius || 50;

      const hit = resolveCircleBoxCollision(
        fighter.pos.x,
        fighter.pos.y,
        fighterRadius,
        {
          x: instance.position.x,
          y: instance.position.y,
          width: box.width,
          height: box.height,
          offsetX: box.offsetX || 0,
          offsetY: box.offsetY || 0,
        }
      );

      if (!hit) continue;

      // Separate fighter and obstruction
      const fighterMass = 70; // Average human mass
      const totalMass = fighterMass + obsMass;
      const fighterShare = obsMass / totalMass;
      const obsShare = fighterMass / totalMass;

      // Push fighter
      fighter.pos.x += hit.normal.x * hit.penetration * fighterShare;
      fighter.pos.y += hit.normal.y * hit.penetration * fighterShare;

      // Push obstruction
      instance.position.x -= hit.normal.x * hit.penetration * obsShare;
      instance.position.y -= hit.normal.y * hit.penetration * obsShare;

      // Transfer momentum
      const fighterVel = fighter.vel || { x: 0, y: 0 };
      const obsVel = instance.physics.vel;

      const relVelX = fighterVel.x - obsVel.x;
      const relVelY = fighterVel.y - obsVel.y;
      const relVelNormal = relVelX * hit.normal.x + relVelY * hit.normal.y;

      if (relVelNormal < 0) {
        // Collision happening - transfer momentum
        const impulse = relVelNormal * 0.8; // Partial momentum transfer

        if (fighter.vel) {
          fighter.vel.x -= hit.normal.x * impulse * obsShare;
          fighter.vel.y -= hit.normal.y * impulse * obsShare;
        }

        obsVel.x += hit.normal.x * impulse * fighterShare;
        obsVel.y += hit.normal.y * impulse * fighterShare;
      }

      // Keep obstruction on ground if it was on ground
      if (instance.position.y > groundY) {
        instance.position.y = groundY;
      }
    }
  }
}

/**
 * Initialize all dynamic obstructions in a set of instances
 */
export function initAllObstructionPhysics(instances, config) {
  if (!Array.isArray(instances)) return;

  for (const instance of instances) {
    initObstructionPhysics(instance, config);
  }
}
