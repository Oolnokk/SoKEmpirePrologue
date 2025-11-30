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

  const duration = Number.isFinite(attackData.dash.duration) ? attackData.dash.duration : 0;
  if (duration <= 0) return null;

  // Support both velocity-based (instant) and impulse-based (accelerating) dashes
  const velocity = Number.isFinite(attackData.dash.velocity) ? attackData.dash.velocity : 0;
  const impulse = Number.isFinite(attackData.dash.impulse) ? attackData.dash.impulse : 0;

  if (velocity <= 0 && impulse <= 0) return null;

  return {
    velocity,
    impulse,
    duration,
    mode: velocity > 0 ? 'velocity' : 'impulse'
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
  dash.mode = dashData.mode;
  dash.velocity = dashData.velocity;
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
    stopAttackDash(fighter, false); // Don't brake - let momentum carry
    return;
  }

  // Get debug settings
  const DEBUG = (typeof window !== 'undefined' && window.RENDER_DEBUG) || {};

  // Determine if this is a heavy attack (gap closer) or light/combo attack
  const attackType = fighter.attack?.context?.type || 'light';
  const isHeavy = attackType === 'heavy';

  // Get angle from head/torso pose (like aiming)
  let angle = fighter.facingRad || 0; // Default to horizontal facing
  if (fighter.pose?.head != null) {
    angle = fighter.pose.head;
  } else if (fighter.pose?.torso != null) {
    angle = fighter.pose.torso;
  }

  fighter.vel = fighter.vel || { x: 0, y: 0 };

  if (dash.mode === 'velocity' && dash.velocity > 0) {
    // Velocity mode: Set velocity directly every frame (instant superhuman speed)
    const baseMultiplier = Number.isFinite(DEBUG.dashImpulseMultiplier) ? DEBUG.dashImpulseMultiplier : 10.0;
    const velocityMult = isHeavy ? baseMultiplier * 2.0 : baseMultiplier;
    const frictionMult = Number.isFinite(DEBUG.dashFrictionMultiplier) ? DEBUG.dashFrictionMultiplier : 0.0;

    const totalVelocity = dash.velocity * velocityMult;
    fighter.vel.x = totalVelocity * Math.cos(angle);
    fighter.vel.y = totalVelocity * Math.sin(angle);

    // Zero friction for maintained velocity
    fighter.frictionOverride = fighter.frictionOverride || {};
    fighter.frictionOverride.value = frictionMult;
    fighter.frictionOverride.active = true;
  } else if (!dash.appliedImpulse && dash.impulse > 0) {
    // Impulse mode: Apply force once at start (accelerating dash)
    const baseMultiplier = Number.isFinite(DEBUG.dashImpulseMultiplier) ? DEBUG.dashImpulseMultiplier : 10.0;
    const impulseMult = isHeavy ? baseMultiplier * 2.0 : baseMultiplier;
    const frictionMult = Number.isFinite(DEBUG.dashFrictionMultiplier) ? DEBUG.dashFrictionMultiplier : 0.01;

    const totalImpulse = dash.impulse * impulseMult;
    fighter.vel.x += totalImpulse * Math.cos(angle);
    fighter.vel.y += totalImpulse * Math.sin(angle);

    // Reduce friction for slippery movement
    fighter.frictionOverride = fighter.frictionOverride || {};
    fighter.frictionOverride.value = frictionMult;
    fighter.frictionOverride.active = true;

    dash.appliedImpulse = true;
  }

  // Apply weight drop lerp if configured
  if (Number.isFinite(DEBUG.dashWeightDrop) && DEBUG.dashWeightDrop > 0) {
    // Lerp gravity from 0 to full over the strike duration
    const progress = Math.min(1, dash.elapsed / dash.duration);
    const targetGravity = 1.0 + DEBUG.dashWeightDrop;
    const lerpedGravity = progress * targetGravity;

    fighter.gravityOverride = fighter.gravityOverride || {};
    fighter.gravityOverride.value = lerpedGravity;
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

  // Restore gravity (clear weight drop)
  if (fighter.gravityOverride) {
    fighter.gravityOverride.value = null;
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
