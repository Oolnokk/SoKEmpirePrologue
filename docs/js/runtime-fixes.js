// runtime-fixes.js — Runtime debug toggles for 90°/sign/basis skeleton diagnosis
// This module provides a safe, reversible way to test different skeleton configurations
// at runtime without modifying source files. All changes are in-memory only.

(function() {
  'use strict';

  // Prevent double-initialization
  if (window.RUNTIME_FIXES) {
    console.warn('[runtime-fixes] Already initialized');
    return;
  }

  // Storage for original state
  window.__debugSaved = window.__debugSaved || {
    segPos: null,
    withAX: null,
    jointAngles: null,
    patched: false
  };

  /**
   * Test Y-ordering of lower limbs
   * Expected ordering (by Y coordinate, smaller = higher on screen):
   * arm_L_lower < arm_R_lower < leg_L_lower < leg_R_lower
   * 
   * Returns: { pass: boolean, ordering: string, penalty: number, yValues: object }
   */
  function testOrdering() {
    const G = window.GAME;
    if (!G || !G.ANCHORS_OBJ || !G.ANCHORS_OBJ.player) {
      return { pass: false, ordering: 'N/A', penalty: 999, yValues: {}, error: 'No player anchors' };
    }

    const B = G.ANCHORS_OBJ.player;
    const yValues = {
      arm_L_lower: B.arm_L_lower?.y ?? 999,
      arm_R_lower: B.arm_R_lower?.y ?? 999,
      leg_L_lower: B.leg_L_lower?.y ?? 999,
      leg_R_lower: B.leg_R_lower?.y ?? 999
    };

    // Expected ordering: arm_L_lower < arm_R_lower < leg_L_lower < leg_R_lower
    const violations = [];
    let penalty = 0;

    if (yValues.arm_L_lower >= yValues.arm_R_lower) {
      violations.push('arm_L_lower >= arm_R_lower');
      penalty += Math.abs(yValues.arm_L_lower - yValues.arm_R_lower) + 10;
    }
    if (yValues.arm_R_lower >= yValues.leg_L_lower) {
      violations.push('arm_R_lower >= leg_L_lower');
      penalty += Math.abs(yValues.arm_R_lower - yValues.leg_L_lower) + 10;
    }
    if (yValues.leg_L_lower >= yValues.leg_R_lower) {
      violations.push('leg_L_lower >= leg_R_lower');
      penalty += Math.abs(yValues.leg_L_lower - yValues.leg_R_lower) + 10;
    }

    const pass = violations.length === 0;
    const ordering = `L_arm:${yValues.arm_L_lower.toFixed(1)} < R_arm:${yValues.arm_R_lower.toFixed(1)} < L_leg:${yValues.leg_L_lower.toFixed(1)} < R_leg:${yValues.leg_R_lower.toFixed(1)}`;

    return {
      pass,
      ordering,
      penalty: Math.round(penalty),
      yValues,
      violations: violations.length > 0 ? violations : null
    };
  }

  /**
   * Save original runtime state before first toggle
   */
  function saveOriginalState() {
    if (window.__debugSaved.patched) {
      console.log('[runtime-fixes] Already saved original state');
      return;
    }

    // Save original functions
    if (window.BONE_SEG_POS) {
      window.__debugSaved.segPos = window.BONE_SEG_POS;
    }
    if (window.BONE_WITH_AX) {
      window.__debugSaved.withAX = window.BONE_WITH_AX;
    }

    // Save original joint angles from player fighter
    const G = window.GAME;
    if (G && G.FIGHTERS && G.FIGHTERS.player && G.FIGHTERS.player.jointAngles) {
      window.__debugSaved.jointAngles = JSON.parse(JSON.stringify(G.FIGHTERS.player.jointAngles));
    }

    window.__debugSaved.patched = true;
    console.log('[runtime-fixes] Original state saved');
  }

  /**
   * Toggle standard segPos basis (cos/sin) vs alternate
   * Standard: fx = sin(ang), fy = -cos(ang)
   */
  function toggleSegPosStd() {
    saveOriginalState();
    
    if (!window.__debugSaved.segPos) {
      console.error('[runtime-fixes] No original segPos to toggle');
      return testOrdering();
    }

    const basis = window.BONE_BASIS || ((ang) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      return { fx: s, fy: -c, rx: c, ry: s };
    });

    // Standard segPos implementation
    window.BONE_SEG_POS = function(x, y, len, ang) {
      const b = basis(ang);
      return [x + len * b.fx, y + len * b.fy];
    };

    console.log('[runtime-fixes] Applied standard segPos basis (sin/-cos)');
    return testOrdering();
  }

  /**
   * Toggle alternate segPos basis (swapped cos/sin)
   */
  function toggleSegPosAlt() {
    saveOriginalState();

    if (!window.__debugSaved.segPos) {
      console.error('[runtime-fixes] No original segPos to toggle');
      return testOrdering();
    }

    const basis = window.BONE_BASIS || ((ang) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      return { fx: s, fy: -c, rx: c, ry: s };
    });

    // Alternate segPos: swap fx/fy components
    window.BONE_SEG_POS = function(x, y, len, ang) {
      const b = basis(ang);
      return [x + len * b.rx, y + len * b.ry]; // Using rx/ry instead of fx/fy
    };

    console.log('[runtime-fixes] Applied alternate segPos basis (cos/sin)');
    return testOrdering();
  }

  /**
   * Toggle standard withAX mapping
   */
  function toggleWithAXStd() {
    saveOriginalState();

    if (!window.__debugSaved.withAX) {
      console.error('[runtime-fixes] No original withAX to toggle');
      return testOrdering();
    }

    const basis = window.BONE_BASIS || ((ang) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      return { fx: s, fy: -c, rx: c, ry: s };
    });

    // Standard withAX implementation
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

      const b = basis(ang);
      const dx = ax * b.fx + ay * b.rx;
      const dy = ax * b.fy + ay * b.ry;
      return [x + dx, y + dy];
    };

    console.log('[runtime-fixes] Applied standard withAX mapping');
    return testOrdering();
  }

  /**
   * Toggle negation of lower joint angles (elbow, knee)
   */
  function toggleNegateLowers() {
    saveOriginalState();

    const G = window.GAME;
    if (!G || !G.FIGHTERS || !G.FIGHTERS.player || !G.FIGHTERS.player.jointAngles) {
      console.error('[runtime-fixes] No player fighter to toggle');
      return testOrdering();
    }

    const angles = G.FIGHTERS.player.jointAngles;
    
    // Negate lower joint angles
    if (angles.lElbow != null) angles.lElbow = -angles.lElbow;
    if (angles.rElbow != null) angles.rElbow = -angles.rElbow;
    if (angles.lKnee != null) angles.lKnee = -angles.lKnee;
    if (angles.rKnee != null) angles.rKnee = -angles.rKnee;

    console.log('[runtime-fixes] Negated lower joint angles (elbows, knees)');
    return testOrdering();
  }

  /**
   * Toggle global +90° rotation to all joints
   */
  function toggleGlobalRotate90() {
    saveOriginalState();

    const G = window.GAME;
    if (!G || !G.FIGHTERS || !G.FIGHTERS.player || !G.FIGHTERS.player.jointAngles) {
      console.error('[runtime-fixes] No player fighter to toggle');
      return testOrdering();
    }

    const angles = G.FIGHTERS.player.jointAngles;
    const offset = Math.PI / 2; // 90 degrees in radians

    // Add 90° to all joint angles
    for (const key in angles) {
      if (angles[key] != null && typeof angles[key] === 'number') {
        angles[key] += offset;
      }
    }

    console.log('[runtime-fixes] Applied +90° global rotation to all joints');
    return testOrdering();
  }

  /**
   * Revert all runtime changes and restore original state
   */
  function revertAll() {
    if (!window.__debugSaved.patched) {
      console.log('[runtime-fixes] No changes to revert');
      return testOrdering();
    }

    // Restore original functions
    if (window.__debugSaved.segPos) {
      window.BONE_SEG_POS = window.__debugSaved.segPos;
    }
    if (window.__debugSaved.withAX) {
      window.BONE_WITH_AX = window.__debugSaved.withAX;
    }

    // Restore original joint angles
    const G = window.GAME;
    if (window.__debugSaved.jointAngles && G && G.FIGHTERS && G.FIGHTERS.player) {
      G.FIGHTERS.player.jointAngles = JSON.parse(JSON.stringify(window.__debugSaved.jointAngles));
    }

    window.__debugSaved.patched = false;
    console.log('[runtime-fixes] Reverted all changes to original state');
    return testOrdering();
  }

  // Export API
  window.RUNTIME_FIXES = {
    testOrdering,
    toggleSegPosStd,
    toggleSegPosAlt,
    toggleWithAXStd,
    toggleNegateLowers,
    toggleGlobalRotate90,
    revertAll
  };

  console.log('[runtime-fixes] Runtime debug toggles initialized');
})();
