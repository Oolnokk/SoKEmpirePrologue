// runtime-fixes.js - Reversible runtime monkeypatches for diagnosing skeleton issues
// These are TEMPORARY RUNTIME-ONLY experiments for fixing 90°/sign/basis issues
// All changes are in-memory only and fully reversible without page reload

// Initialize debug state storage
if (typeof window !== 'undefined') {
  window.__debugSaved = window.__debugSaved || {
    functions: {},
    jointAngles: {},
    activeToggles: {}
  };
}

/**
 * Toggle 1: Use standard segPos basis (cos/sin)
 * Changes segPos to use standard mathematical basis instead of 'up' convention
 */
export function toggleSegPosStandardBasis(enable) {
  const saved = window.__debugSaved;
  
  if (enable) {
    // Save original if not already saved
    if (!saved.functions.segPos) {
      saved.functions.segPos = window.BONE_SEG_POS;
    }
    
    // Apply standard basis: x = x + len*cos(ang), y = y + len*sin(ang)
    window.BONE_SEG_POS = function(x, y, len, ang) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      return [x + len * c, y + len * s];
    };
    
    saved.activeToggles.segPosStandard = true;
    console.log('[runtime-fixes] Standard segPos basis ENABLED');
  } else {
    // Restore original
    if (saved.functions.segPos) {
      window.BONE_SEG_POS = saved.functions.segPos;
    }
    saved.activeToggles.segPosStandard = false;
    console.log('[runtime-fixes] Standard segPos basis DISABLED');
  }
  
  return saved.activeToggles.segPosStandard;
}

/**
 * Toggle 2: Use standard withAX mapping (cos/sin)
 * Changes withAX to use standard mathematical mapping instead of 'up' convention
 */
export function toggleWithAXStandardMapping(enable) {
  const saved = window.__debugSaved;
  
  if (enable) {
    // Save original if not already saved
    if (!saved.functions.withAX) {
      saved.functions.withAX = window.BONE_WITH_AX;
    }
    
    // Apply standard mapping: dx = ax*cos - ay*sin, dy = ax*sin + ay*cos
    window.BONE_WITH_AX = function(x, y, ang, off, len, units) {
      if (!off) return [x, y];
      let ax = 0, ay = 0;
      if (Array.isArray(off)) {
        ax = +off[0] || 0;
        ay = +off[1] || 0;
      } else if (typeof off === 'object') {
        ax = +((off.ax ?? off.x) ?? 0) || 0;
        ay = +((off.ay ?? off.y) ?? 0) || 0;
      } else {
        return [x, y];
      }

      const lenVal = +len;
      const hasLen = Number.isFinite(lenVal) && lenVal !== 0;
      const L = hasLen ? Math.abs(lenVal) : 1;
      const unitStr = (units || off?.units || '').toString().toLowerCase();
      if (unitStr === 'percent' || unitStr === '%' || unitStr === 'pct') {
        ax *= L;
        ay *= L;
      }

      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const dx = ax * c - ay * s;
      const dy = ax * s + ay * c;
      return [x + dx, y + dy];
    };
    
    saved.activeToggles.withAXStandard = true;
    console.log('[runtime-fixes] Standard withAX mapping ENABLED');
  } else {
    // Restore original
    if (saved.functions.withAX) {
      window.BONE_WITH_AX = saved.functions.withAX;
    }
    saved.activeToggles.withAXStandard = false;
    console.log('[runtime-fixes] Standard withAX mapping DISABLED');
  }
  
  return saved.activeToggles.withAXStandard;
}

/**
 * Toggle 3: Negate lower joints (elbows/knees)
 * Runtime negation of lower joint angles to fix potential sign issues
 */
export function toggleNegateLowerJoints(enable) {
  const saved = window.__debugSaved;
  const G = window.GAME || {};
  const player = G.FIGHTERS?.player;
  
  if (!player || !player.jointAngles) {
    console.warn('[runtime-fixes] Player fighter not found');
    return false;
  }
  
  if (enable) {
    // Save original angles if not already saved
    if (!saved.jointAngles.lower) {
      saved.jointAngles.lower = {
        lElbow: player.jointAngles.lElbow,
        rElbow: player.jointAngles.rElbow,
        lKnee: player.jointAngles.lKnee,
        rKnee: player.jointAngles.rKnee
      };
    }
    
    // Negate lower joint angles
    player.jointAngles.lElbow = -(saved.jointAngles.lower.lElbow || 0);
    player.jointAngles.rElbow = -(saved.jointAngles.lower.rElbow || 0);
    player.jointAngles.lKnee = -(saved.jointAngles.lower.lKnee || 0);
    player.jointAngles.rKnee = -(saved.jointAngles.lower.rKnee || 0);
    
    saved.activeToggles.negateLower = true;
    console.log('[runtime-fixes] Negate lower joints ENABLED');
  } else {
    // Restore original angles
    if (saved.jointAngles.lower) {
      player.jointAngles.lElbow = saved.jointAngles.lower.lElbow;
      player.jointAngles.rElbow = saved.jointAngles.lower.rElbow;
      player.jointAngles.lKnee = saved.jointAngles.lower.lKnee;
      player.jointAngles.rKnee = saved.jointAngles.lower.rKnee;
    }
    saved.activeToggles.negateLower = false;
    console.log('[runtime-fixes] Negate lower joints DISABLED');
  }
  
  return saved.activeToggles.negateLower;
}

/**
 * Toggle 4: +90° global joint rotation
 * Adds or removes 90° to all joint angles (π/2 radians)
 */
export function toggleGlobalRotation90(enable) {
  const saved = window.__debugSaved;
  const G = window.GAME || {};
  const player = G.FIGHTERS?.player;
  
  if (!player || !player.jointAngles) {
    console.warn('[runtime-fixes] Player fighter not found');
    return false;
  }
  
  const NINETY_DEG = Math.PI / 2;
  
  if (enable) {
    // Save original angles if not already saved
    if (!saved.jointAngles.global90) {
      saved.jointAngles.global90 = { ...player.jointAngles };
    }
    
    // Add 90° to all joint angles
    for (const key in player.jointAngles) {
      if (typeof player.jointAngles[key] === 'number') {
        player.jointAngles[key] = (saved.jointAngles.global90[key] || 0) + NINETY_DEG;
      }
    }
    
    saved.activeToggles.global90 = true;
    console.log('[runtime-fixes] +90° global rotation ENABLED');
  } else {
    // Restore original angles
    if (saved.jointAngles.global90) {
      for (const key in saved.jointAngles.global90) {
        player.jointAngles[key] = saved.jointAngles.global90[key];
      }
    }
    saved.activeToggles.global90 = false;
    console.log('[runtime-fixes] +90° global rotation DISABLED');
  }
  
  return saved.activeToggles.global90;
}

/**
 * Toggle 5: Alternative segPos (-cos, sin)
 * Alternative basis for segPos that might fix specific orientation issues
 */
export function toggleAltSegPos(enable) {
  const saved = window.__debugSaved;
  
  if (enable) {
    // Save original if not already saved
    if (!saved.functions.segPos) {
      saved.functions.segPos = window.BONE_SEG_POS;
    }
    
    // Apply alternative basis: x = x - len*cos(ang), y = y + len*sin(ang)
    window.BONE_SEG_POS = function(x, y, len, ang) {
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      return [x - len * c, y + len * s];
    };
    
    saved.activeToggles.altSegPos = true;
    console.log('[runtime-fixes] Alternative segPos (-cos, sin) ENABLED');
  } else {
    // Restore original
    if (saved.functions.segPos) {
      window.BONE_SEG_POS = saved.functions.segPos;
    }
    saved.activeToggles.altSegPos = false;
    console.log('[runtime-fixes] Alternative segPos (-cos, sin) DISABLED');
  }
  
  return saved.activeToggles.altSegPos;
}

/**
 * Revert all runtime fixes and restore original state
 */
export function revertAllFixes() {
  console.log('[runtime-fixes] Reverting all fixes...');
  
  // Disable all toggles in reverse order
  toggleAltSegPos(false);
  toggleGlobalRotation90(false);
  toggleNegateLowerJoints(false);
  toggleWithAXStandardMapping(false);
  toggleSegPosStandardBasis(false);
  
  // Clear saved state
  window.__debugSaved = {
    functions: {},
    jointAngles: {},
    activeToggles: {}
  };
  
  console.log('[runtime-fixes] All fixes reverted');
  return true;
}

/**
 * Get current toggle states
 */
export function getToggleStates() {
  return {
    segPosStandard: window.__debugSaved.activeToggles.segPosStandard || false,
    withAXStandard: window.__debugSaved.activeToggles.withAXStandard || false,
    negateLower: window.__debugSaved.activeToggles.negateLower || false,
    global90: window.__debugSaved.activeToggles.global90 || false,
    altSegPos: window.__debugSaved.activeToggles.altSegPos || false
  };
}

/**
 * Simple ordering check to evaluate if skeleton rendering is correct
 * Returns: { pass: boolean, penalty: number, details: string }
 */
export function testOrdering() {
  const G = window.GAME || {};
  const bones = G.ANCHORS_OBJ?.player;
  
  if (!bones) {
    return { pass: false, penalty: 999, details: 'No bone data available' };
  }
  
  let penalty = 0;
  const issues = [];
  
  // Check that upper limbs connect properly to torso
  const torsoTop = { x: bones.torso?.endX, y: bones.torso?.endY };
  const torsoBottom = { x: bones.torso?.x, y: bones.torso?.y };
  
  // Arms should attach near top of torso
  if (bones.arm_L_upper && bones.arm_R_upper) {
    const lArmDist = Math.hypot(
      bones.arm_L_upper.x - torsoTop.x,
      bones.arm_L_upper.y - torsoTop.y
    );
    const rArmDist = Math.hypot(
      bones.arm_R_upper.x - torsoTop.x,
      bones.arm_R_upper.y - torsoTop.y
    );
    
    if (lArmDist > 50) {
      penalty += lArmDist - 50;
      issues.push(`Left arm disconnect: ${lArmDist.toFixed(1)}px`);
    }
    if (rArmDist > 50) {
      penalty += rArmDist - 50;
      issues.push(`Right arm disconnect: ${rArmDist.toFixed(1)}px`);
    }
  }
  
  // Legs should attach near bottom of torso
  if (bones.leg_L_upper && bones.leg_R_upper) {
    const lLegDist = Math.hypot(
      bones.leg_L_upper.x - torsoBottom.x,
      bones.leg_L_upper.y - torsoBottom.y
    );
    const rLegDist = Math.hypot(
      bones.leg_R_upper.x - torsoBottom.x,
      bones.leg_R_upper.y - torsoBottom.y
    );
    
    if (lLegDist > 50) {
      penalty += lLegDist - 50;
      issues.push(`Left leg disconnect: ${lLegDist.toFixed(1)}px`);
    }
    if (rLegDist > 50) {
      penalty += rLegDist - 50;
      issues.push(`Right leg disconnect: ${rLegDist.toFixed(1)}px`);
    }
  }
  
  // Check limb chain continuity (upper -> lower)
  const limbs = [
    { upper: 'arm_L_upper', lower: 'arm_L_lower', name: 'Left arm' },
    { upper: 'arm_R_upper', lower: 'arm_R_lower', name: 'Right arm' },
    { upper: 'leg_L_upper', lower: 'leg_L_lower', name: 'Left leg' },
    { upper: 'leg_R_upper', lower: 'leg_R_lower', name: 'Right leg' }
  ];
  
  for (const limb of limbs) {
    const upper = bones[limb.upper];
    const lower = bones[limb.lower];
    
    if (upper && lower) {
      const dist = Math.hypot(
        lower.x - upper.endX,
        lower.y - upper.endY
      );
      
      if (dist > 5) {
        penalty += dist;
        issues.push(`${limb.name} chain break: ${dist.toFixed(1)}px`);
      }
    }
  }
  
  const pass = penalty < 10;
  const details = issues.length > 0 ? issues.join('; ') : 'All checks passed';
  
  return {
    pass,
    penalty: Math.round(penalty * 10) / 10,
    details
  };
}

// Export window functions for console access
if (typeof window !== 'undefined') {
  window.__toggleSegPosStandard = toggleSegPosStandardBasis;
  window.__toggleWithAXStandard = toggleWithAXStandardMapping;
  window.__toggleNegateLower = toggleNegateLowerJoints;
  window.__toggleGlobal90 = toggleGlobalRotation90;
  window.__toggleAltSegPos = toggleAltSegPos;
  window.__revertAllFixes = revertAllFixes;
  window.__testOrdering = testOrdering;
}
