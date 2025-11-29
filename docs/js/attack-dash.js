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
  dash.velocity = Number.isFinite(dash.velocity) ? dash.velocity : 0;
  dash.duration = Number.isFinite(dash.duration) ? dash.duration : 0;
  dash.elapsed = Number.isFinite(dash.elapsed) ? dash.elapsed : 0;
  dash.targetId = dash.targetId || null;
  dash.colliderRange = Number.isFinite(dash.colliderRange) ? dash.colliderRange : 0;

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

  const velocity = Number.isFinite(attackData.dash.velocity) ? attackData.dash.velocity : 0;
  const duration = Number.isFinite(attackData.dash.duration) ? attackData.dash.duration : 0;

  if (velocity <= 0 || duration <= 0) return null;

  return {
    velocity,
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
  dash.velocity = dashData.velocity;
  dash.duration = dashData.duration;
  dash.elapsed = 0;
  dash.targetId = targetId;
  dash.colliderRange = Number.isFinite(attackData.range) ? attackData.range : 0;

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

  // Update elapsed time
  dash.elapsed += dt;
  if (dash.elapsed >= dash.duration) {
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
        stopAttackDash(fighter);
        return;
      }
    }
  }

  // Apply dash velocity using head angle with debug rotation offset
  if (dash.velocity > 0) {
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

    // Calculate velocity components from angle
    fighter.vel = fighter.vel || { x: 0, y: 0 };
    fighter.vel.x = dash.velocity * Math.cos(angle);
    fighter.vel.y = dash.velocity * Math.sin(angle);
  }
}

/**
 * Stop attack dash
 */
export function stopAttackDash(fighter) {
  if (!fighter || !fighter.attack || !fighter.attack.dash) return;

  const dash = fighter.attack.dash;
  dash.active = false;
  dash.velocity = 0;
  dash.elapsed = 0;
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
