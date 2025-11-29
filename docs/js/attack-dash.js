/**
 * Attack Dash System
 *
 * Manages forward dash movement integrated into attack strikes.
 * Dashes are cut short when the target enters the attack collider range.
 */

/**
 * Ensure attack dash state exists on fighter
 */
export function ensureAttackDashState(fighter) {
  if (!fighter || !fighter.attack) return null;

  const dash = (fighter.attack.dash ||= {});
  dash.active = !!dash.active;
  dash.impulse = Number.isFinite(dash.impulse) ? dash.impulse : 0;
  dash.duration = Number.isFinite(dash.duration) ? dash.duration : 0;
  dash.elapsed = Number.isFinite(dash.elapsed) ? dash.elapsed : 0;
  dash.targetId = dash.targetId || null;
  dash.colliderRange = Number.isFinite(dash.colliderRange) ? dash.colliderRange : 0;
  dash.appliedImpulse = !!dash.appliedImpulse;
  dash.savedFriction = Number.isFinite(dash.savedFriction) ? dash.savedFriction : null;

  return dash;
}

/**
 * Check if current attack phase supports dash movement
 */
function isDashPhase(phase) {
  if (!phase || typeof phase !== 'string') return false;
  const normalized = phase.toLowerCase();
  return normalized.includes('strike') || normalized.includes('impact');
}

/**
 * Get dash data from attack configuration
 */
function getAttackDashData(attackData) {
  if (!attackData || typeof attackData !== 'object') return null;
  if (!attackData.dash || typeof attackData.dash !== 'object') return null;

  // Use impulse if specified, otherwise convert old velocity to impulse
  let impulse = Number.isFinite(attackData.dash.impulse)
    ? attackData.dash.impulse
    : Number.isFinite(attackData.dash.velocity)
      ? attackData.dash.velocity * 0.5  // Convert velocity to impulse
      : 0;

  const duration = Number.isFinite(attackData.dash.duration) ? attackData.dash.duration : 0;

  if (impulse <= 0 || duration <= 0) return null;

  return {
    impulse,
    duration,
  };
}

/**
 * Start attack dash if conditions are met
 */
export function startAttackDash(fighter, attackData, targetId = null) {
  if (!fighter || !attackData) return false;

  const dashData = getAttackDashData(attackData);
  if (!dashData) return false;

  const attack = fighter.attack;
  if (!attack || !attack.active) return false;

  const phase = attack.currentPhase;
  if (!isDashPhase(phase)) return false;

  const dash = ensureAttackDashState(fighter);
  if (!dash) return false;

  // Activate dash
  dash.active = true;
  dash.impulse = dashData.impulse;
  dash.duration = dashData.duration;
  dash.elapsed = 0;
  dash.targetId = targetId;
  dash.colliderRange = Number.isFinite(attackData.range) ? attackData.range : 0;
  dash.appliedImpulse = false;
  dash.savedFriction = null;

  return true;
}

/**
 * Update attack dash state
 */
export function updateAttackDash(fighter, dt, game = null) {
  if (!fighter || !Number.isFinite(dt) || dt <= 0) return;

  const attack = fighter.attack;
  if (!attack || !attack.active) {
    stopAttackDash(fighter);
    return;
  }

  const dash = fighter.attack.dash;
  if (!dash || !dash.active) return;

  const phase = attack.currentPhase;
  if (!isDashPhase(phase)) {
    stopAttackDash(fighter);
    return;
  }

  // Check distance to target - cut short if in range
  if (dash.targetId && dash.colliderRange > 0) {
    const target = game?.FIGHTERS?.[dash.targetId];
    if (target && target.pos && fighter.pos) {
      const dx = target.pos.x - fighter.pos.x;
      const dy = target.pos.y - fighter.pos.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= dash.colliderRange) {
        stopAttackDash(fighter, true); // Brake on target reached
        return;
      }
    }
  }

  // Update elapsed time - stop if duration exceeded
  dash.elapsed += dt;
  if (dash.elapsed >= dash.duration) {
    stopAttackDash(fighter, true); // Brake on completion
    return;
  }

  // Apply impulse once at start and reduce friction for duration
  if (!dash.appliedImpulse && dash.impulse > 0) {
    // Get debug rotation offset from window
    const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};
    const rotationOffsetDeg = Number.isFinite(DEBUG.dashRotationOffset)
      ? DEBUG.dashRotationOffset
      : 0;

    // Convert degrees to radians
    const degToRad = (deg) => (deg * Math.PI) / 180;
    const rotationOffsetRad = degToRad(rotationOffsetDeg);

    // Get head angle from fighter pose, fallback to facingRad
    let baseAngle = fighter.facingRad || 0;
    if (fighter.pose?.head != null) {
      baseAngle = fighter.pose.head;
    }

    const angle = baseAngle + rotationOffsetRad;

    // Apply impulse in the direction of angle
    fighter.vel = fighter.vel || { x: 0, y: 0 };
    fighter.vel.x += dash.impulse * Math.cos(angle);
    fighter.vel.y += dash.impulse * Math.sin(angle);

    // Reduce friction for slippery movement
    fighter.frictionOverride = fighter.frictionOverride || {};
    fighter.frictionOverride.value = 0.5; // Low friction for dash
    fighter.frictionOverride.active = true;

    dash.appliedImpulse = true;
  }
}

/**
 * Stop attack dash
 * @param {boolean} brake - If true, immediately set velocity to 0 (hit the brakes)
 */
export function stopAttackDash(fighter, brake = false) {
  if (!fighter || !fighter.attack || !fighter.attack.dash) return;

  const dash = fighter.attack.dash;

  // Hit the brakes if requested
  if (brake && fighter.vel) {
    fighter.vel.x = 0;
    fighter.vel.y = 0;
  }

  // Restore friction
  if (fighter.frictionOverride) {
    fighter.frictionOverride.active = false;
    fighter.frictionOverride.value = null;
  }

  // Reset dash state
  dash.active = false;
  dash.impulse = 0;
  dash.elapsed = 0;
  dash.appliedImpulse = false;
}

/**
 * Check if fighter is currently dashing during attack
 */
export function isAttackDashing(fighter) {
  return !!(fighter?.attack?.dash?.active);
}

/**
 * Get current dash velocity
 */
export function getAttackDashVelocity(fighter) {
  if (!isAttackDashing(fighter)) return 0;
  return fighter.attack.dash.velocity || 0;
}
