// debug-panel.js - Debug panel for displaying and editing bone/sprite transforms and poses
// Provides live transform display, pose editing, and JSON export functionality

const $$ = (sel, el = document) => el.querySelector(sel);

// Convert radians to degrees for display
function radToDeg(rad) {
  return ((rad * 180) / Math.PI).toFixed(2);
}

// Convert degrees to radians for setting poses
function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

// Format number for display
function fmt(n, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return '0.00';
  return Number(n).toFixed(decimals);
}

// Initialize the debug panel
export function initDebugPanel() {
  const panel = $$('#debugPanel');
  if (!panel) {
    console.warn('[debug-panel] Debug panel element not found');
    return;
  }

  // Setup copy JSON button
  const copyBtn = $$('#debugCopyJson', panel);
  if (copyBtn) {
    copyBtn.addEventListener('click', copyPoseConfigToClipboard);
  }

  // Setup panel visibility toggle
  const toggleBtn = $$('#debugToggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('debug-panel--hidden');
      toggleBtn.textContent = panel.classList.contains('debug-panel--hidden') ? '🔍 Debug' : '✕ Debug';
    });
  }

  console.log('[debug-panel] Debug panel initialized');
}

// Update the debug panel with current frame data
export function updateDebugPanel() {
  const panel = $$('#debugPanel');
  if (!panel || panel.classList.contains('debug-panel--hidden')) return;

  const G = window.GAME || {};
  const C = window.CONFIG || {};
  
  if (!G.FIGHTERS || !G.ANCHORS_OBJ) return;

  const player = G.FIGHTERS.player;
  const playerBones = G.ANCHORS_OBJ.player;

  // Update transforms display
  updateTransformsDisplay(player, playerBones);

  // Update pose editor
  updatePoseEditor(player, C);
}

// Update the transforms display section
function updateTransformsDisplay(fighter, bones) {
  const container = $$('#debugTransforms');
  if (!container) return;

  let html = '<div class="debug-section-title">Live Bone Transforms (World Space)</div>';
  html += '<div class="debug-table">';
  html += '<div class="debug-table-header">';
  html += '<span>Bone</span><span>Start (x,y)</span><span>End (x,y)</span><span>Angle</span>';
  html += '</div>';

  const boneOrder = [
    'torso', 'head',
    'arm_L_upper', 'arm_L_lower',
    'arm_R_upper', 'arm_R_lower',
    'leg_L_upper', 'leg_L_lower',
    'leg_R_upper', 'leg_R_lower'
  ];

  for (const key of boneOrder) {
    const bone = bones[key];
    if (!bone) continue;

    html += '<div class="debug-table-row">';
    html += `<span class="debug-bone-name">${key}</span>`;
    html += `<span>(${fmt(bone.x)}, ${fmt(bone.y)})</span>`;
    html += `<span>(${fmt(bone.endX)}, ${fmt(bone.endY)})</span>`;
    html += `<span>${radToDeg(bone.ang)}°</span>`;
    html += '</div>';
  }

  html += '</div>';

  // Add sprite info if available
  const spriteInfo = getSpriteInfo(fighter);
  if (spriteInfo) {
    html += '<div class="debug-section-title" style="margin-top: 16px;">Sprite Transforms</div>';
    html += '<div class="debug-table">';
    html += '<div class="debug-table-header">';
    html += '<span>Sprite</span><span>Anchor (x,y)</span><span>Scale</span><span>Rotation</span>';
    html += '</div>';
    
    for (const [name, info] of Object.entries(spriteInfo)) {
      html += '<div class="debug-table-row">';
      html += `<span class="debug-bone-name">${name}</span>`;
      html += `<span>(${fmt(info.x)}, ${fmt(info.y)})</span>`;
      html += `<span>${fmt(info.scaleX, 2)} × ${fmt(info.scaleY, 2)}</span>`;
      html += `<span>${fmt(info.rotation, 2)}°</span>`;
      html += '</div>';
    }
    
    html += '</div>';
  }

  container.innerHTML = html;
}

// Get sprite transform info
function getSpriteInfo(fighter) {
  const G = window.GAME || {};
  const bones = G.ANCHORS_OBJ?.player;
  if (!bones) return null;

  // Return sprite info based on bone positions
  // This is a simplified version - real sprites would have more complex transforms
  return {
    torso: {
      x: bones.torso?.x,
      y: bones.torso?.y,
      scaleX: 1.0,
      scaleY: 1.0,
      rotation: radToDeg(bones.torso?.ang || 0)
    },
    head: {
      x: bones.head?.x,
      y: bones.head?.y,
      scaleX: 1.0,
      scaleY: 1.0,
      rotation: radToDeg(bones.head?.ang || 0)
    }
  };
}

// Update pose editor inputs
function updatePoseEditor(fighter, config) {
  const container = $$('#debugPoseEditor');
  if (!container) return;

  // Only create inputs once
  if (!container.dataset.initialized) {
    createPoseEditorInputs(container, fighter, config);
    container.dataset.initialized = 'true';
  }

  // Update current values
  const jointAngles = fighter.jointAngles || {};
  const RAD_TO_DEG = 180 / Math.PI;

  const inputs = [
    'torso', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow',
    'lHip', 'lKnee', 'rHip', 'rKnee'
  ];

  for (const key of inputs) {
    const input = $$(`#pose_${key}`, container);
    if (input && jointAngles[key] != null) {
      const degValue = (jointAngles[key] * RAD_TO_DEG).toFixed(1);
      if (document.activeElement !== input) {
        input.value = degValue;
      }
    }
  }
}

// Create pose editor input fields
function createPoseEditorInputs(container, fighter, config) {
  let html = '<div class="debug-section-title">Pose Editor (Live Edit)</div>';
  html += '<div class="debug-pose-grid">';

  const inputs = [
    { key: 'torso', label: 'Torso' },
    { key: 'lShoulder', label: 'L Shoulder (rel)' },
    { key: 'lElbow', label: 'L Elbow (rel)' },
    { key: 'rShoulder', label: 'R Shoulder (rel)' },
    { key: 'rElbow', label: 'R Elbow (rel)' },
    { key: 'lHip', label: 'L Hip' },
    { key: 'lKnee', label: 'L Knee (rel)' },
    { key: 'rHip', label: 'R Hip' },
    { key: 'rKnee', label: 'R Knee (rel)' }
  ];

  for (const { key, label } of inputs) {
    const currentVal = fighter.jointAngles?.[key] || 0;
    const degValue = ((currentVal * 180) / Math.PI).toFixed(1);
    
    html += '<div class="debug-input-group">';
    html += `<label for="pose_${key}">${label}</label>`;
    html += `<input type="number" id="pose_${key}" class="debug-input" value="${degValue}" step="1" />`;
    html += '<span class="debug-unit">°</span>';
    html += '</div>';
  }

  html += '</div>';

  // Add config editor section
  html += '<div class="debug-section-title" style="margin-top: 16px;">Config Values</div>';
  html += '<div class="debug-pose-grid">';

  const configInputs = [
    { key: 'actorScale', path: 'actor.scale', label: 'Actor Scale', min: 0.5, max: 1.5, step: 0.05 },
    { key: 'groundRatio', path: 'groundRatio', label: 'Ground Ratio', min: 0.5, max: 0.95, step: 0.01 },
    { key: 'authoredWeight', path: 'movement.authoredWeight', label: 'Authored Weight', min: 0, max: 1, step: 0.05 },
    { key: 'physicsWeight', path: 'movement.physicsWeight', label: 'Physics Weight', min: 0, max: 1, step: 0.05 }
  ];

  for (const { key, path, label, min, max, step } of configInputs) {
    const value = getNestedValue(config, path) || 0;
    
    html += '<div class="debug-input-group">';
    html += `<label for="cfg_${key}">${label}</label>`;
    html += `<input type="number" id="cfg_${key}" class="debug-input" value="${value}" min="${min}" max="${max}" step="${step}" data-path="${path}" />`;
    html += '</div>';
  }

  html += '</div>';

  container.innerHTML = html;

  // Attach event listeners
  for (const { key } of inputs) {
    const input = $$(`#pose_${key}`, container);
    if (input) {
      input.addEventListener('input', (e) => {
        const degValue = parseFloat(e.target.value) || 0;
        const radValue = degToRad(degValue);
        setPoseValue(fighter, key, radValue);
      });
    }
  }

  for (const { key } of configInputs) {
    const input = $$(`#cfg_${key}`, container);
    if (input) {
      input.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        const path = e.target.dataset.path;
        setNestedValue(config, path, value);
        
        // Trigger visual update if needed
        if (key === 'actorScale' || key === 'groundRatio') {
          window.GAME.needsUpdate = true;
        }
      });
    }
  }
}

// Set pose value on fighter and push as override
function setPoseValue(fighter, key, radValue) {
  if (!fighter.jointAngles) fighter.jointAngles = {};
  fighter.jointAngles[key] = radValue;

  // Push as override to prevent animation from overwriting immediately
  const G = window.GAME || {};
  if (G.FIGHTERS) {
    const degPose = {};
    const RAD_TO_DEG = 180 / Math.PI;
    
    for (const k in fighter.jointAngles) {
      degPose[k] = fighter.jointAngles[k] * RAD_TO_DEG;
    }

    // Import and use pushPoseOverride if available
    if (window.pushPoseOverride) {
      window.pushPoseOverride(fighter.id, degPose, 100); // 100ms override
    }
  }
}

// Get nested value from object using path string
function getNestedValue(obj, path) {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

// Set nested value in object using path string
function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  const lastKey = keys.pop();
  const target = keys.reduce((current, key) => {
    if (!current[key]) current[key] = {};
    return current[key];
  }, obj);
  target[lastKey] = value;
}

// Copy current pose and config to clipboard as JSON
function copyPoseConfigToClipboard() {
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  
  if (!G.FIGHTERS?.player) {
    console.warn('[debug-panel] No player fighter found');
    return;
  }

  const player = G.FIGHTERS.player;
  const RAD_TO_DEG = 180 / Math.PI;

  // Build pose object from current joint angles
  const currentPose = {};
  const jointKeys = ['torso', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow', 'lHip', 'lKnee', 'rHip', 'rKnee'];
  
  for (const key of jointKeys) {
    if (player.jointAngles?.[key] != null) {
      currentPose[key] = Math.round(player.jointAngles[key] * RAD_TO_DEG);
    }
  }

  // Build config object
  const exportData = {
    pose: currentPose,
    config: {
      actor: {
        scale: C.actor?.scale || 0.70
      },
      groundRatio: C.groundRatio || 0.70,
      movement: {
        authoredWeight: C.movement?.authoredWeight || 0.6,
        physicsWeight: C.movement?.physicsWeight || 0.4
      },
      parts: C.parts,
      hierarchy: C.hierarchy,
      ik: C.ik
    },
    bones: {}
  };

  // Add bone world transforms
  const bones = G.ANCHORS_OBJ?.player;
  if (bones) {
    const boneKeys = ['torso', 'head', 'arm_L_upper', 'arm_L_lower', 'arm_R_upper', 'arm_R_lower',
                     'leg_L_upper', 'leg_L_lower', 'leg_R_upper', 'leg_R_lower'];
    
    for (const key of boneKeys) {
      const bone = bones[key];
      if (bone) {
        exportData.bones[key] = {
          start: { x: fmt(bone.x, 2), y: fmt(bone.y, 2) },
          end: { x: fmt(bone.endX, 2), y: fmt(bone.endY, 2) },
          angle: radToDeg(bone.ang)
        };
      }
    }
  }

  const json = JSON.stringify(exportData, null, 2);

  // Copy to clipboard
  navigator.clipboard.writeText(json).then(() => {
    console.log('[debug-panel] Copied pose/config to clipboard');
    showCopyNotification();
  }).catch(err => {
    console.error('[debug-panel] Failed to copy:', err);
    // Fallback: show in console
    console.log('[debug-panel] JSON export:', json);
  });
}

// Show a temporary notification that copy succeeded
function showCopyNotification() {
  const btn = $$('#debugCopyJson');
  if (!btn) return;

  const originalText = btn.textContent;
  btn.textContent = '✓ Copied!';
  btn.style.background = '#10b981';

  setTimeout(() => {
    btn.textContent = originalText;
    btn.style.background = '';
  }, 1500);
}

// Export pushPoseOverride function for use by input handlers
if (typeof window !== 'undefined') {
  window.pushPoseOverride = function(fighterId, poseDeg, durMs = 100) {
    const G = window.GAME || {};
    const F = G.FIGHTERS?.[fighterId];
    if (!F) return;
    
    if (!F.anim) F.anim = { last: performance.now() / 1000 };
    
    F.anim.override = {
      pose: poseDeg,
      until: performance.now() / 1000 + durMs / 1000
    };
  };
}

