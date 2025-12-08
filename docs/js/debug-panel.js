// debug-panel.js - Debug panel for displaying and editing bone/sprite transforms and poses
// Provides live transform display, pose editing, and JSON export functionality

import { $$, fmt } from './dom-utils.js?v=1';
import { radToDeg, radToDegNum, degToRad } from './math-utils.js?v=1';
import { pushPoseOverride as runtimePushPoseOverride, pushPoseLayerOverride as runtimePushPoseLayerOverride } from './animator.js?v=5';
import { normalizePrefabDefinition } from './prefab-catalog.js?v=1';

// Initialize the debug panel
export function initDebugPanel() {
  const panel = $$('#debugPanel');
  if (!panel) {
    console.warn('[debug-panel] Debug panel element not found');
    return;
  }

  const focusableSelector = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  const getFocusableElements = () => Array.from(panel.querySelectorAll(focusableSelector)).filter((el) => {
    const style = window.getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none';
  });

  const handlePanelKeydown = (event) => {
    if (panel.classList.contains('debug-panel--hidden')) return;
    if (event.key !== 'Tab') return;

    const focusable = getFocusableElements();
    if (!focusable.length) {
      event.preventDefault();
      panel.focus({ preventScroll: true });
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus({ preventScroll: true });
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus({ preventScroll: true });
    }
  };

  panel.addEventListener('keydown', handlePanelKeydown);

  // Setup copy JSON button
  const copyBtn = $$('#debugCopyJson', panel);
  if (copyBtn) {
    copyBtn.addEventListener('click', copyPoseConfigToClipboard);
  }

  // Setup freeze angles checkbox
  const freezeCheckbox = $$('#freezeAnglesCheckbox', panel);
  if (freezeCheckbox) {
    const C = window.CONFIG || {};
    // Initialize checkbox state from config
    freezeCheckbox.checked = C.debug?.freezeAngles || false;

    freezeCheckbox.addEventListener('change', (e) => {
      if (!C.debug) C.debug = {};
      C.debug.freezeAngles = e.target.checked;
      console.log('[debug-panel] Freeze angles:', C.debug.freezeAngles);
    });
  }

  // Setup drop bottle button
  const dropBottleBtn = $$('#btnDropBottle', panel);
  if (dropBottleBtn) {
    dropBottleBtn.addEventListener('click', dropBottleOnPlayer);
  }

  // Setup panel visibility toggle
  const toggleBtn = $$('#debugToggle');
  if (toggleBtn) {
    const setPanelOpen = (isOpen) => {
      panel.classList.toggle('debug-panel--hidden', !isOpen);
      panel.setAttribute('aria-hidden', isOpen ? 'false' : 'true');
      toggleBtn.textContent = isOpen ? '✕ Debug' : '🔍 Debug';

      if (isOpen) {
        const focusTarget = getFocusableElements()[0] || panel;
        focusTarget.focus({ preventScroll: true });
      } else {
        toggleBtn.focus({ preventScroll: true });
      }
    };

    toggleBtn.addEventListener('click', () => {
      const isOpening = panel.classList.contains('debug-panel--hidden');
      setPanelOpen(isOpening);
    });
  }

  console.log('[debug-panel] Debug panel initialized');
}

/**
 * Update the bottle census display showing status of all spawned bottles.
 * Displays position, velocity, and ground state for debugging physics.
 * Depends on window.GAME.dynamicInstances for bottle data.
 * Shows bottles with prefabId 'bottle_tall' or id starting with 'bottle_debug_'.
 */
function updateBottleCensus() {
  const censusContent = $$('#bottleCensusContent');
  if (!censusContent) return;

  const game = window.GAME || {};
  const bottles = (game.dynamicInstances || []).filter(inst =>
    inst?.prefabId === 'bottle_tall' || inst?.id?.startsWith('bottle_debug_')
  );

  if (bottles.length === 0) {
    censusContent.textContent = 'No bottles spawned';
    return;
  }

  const lines = bottles.map(bottle => {
    const x = bottle.position?.x?.toFixed(0) || '?';
    const y = bottle.position?.y?.toFixed(0) || '?';
    const vy = bottle.physics?.vel?.y?.toFixed(1) || '?';
    const onGround = bottle.physics?.onGround ? '🟢' : '🔴';
    return `${onGround} Bottle @ (${x}, ${y}) vy=${vy}`;
  });

  censusContent.innerHTML = lines.join('<br>');
}

// Update the debug panel with current frame data
export function updateDebugPanel() {
  const panel = $$('#debugPanel');
  if (!panel || panel.classList.contains('debug-panel--hidden')) return;

  const G = window.GAME || {};
  const C = window.CONFIG || {};

  // Update bottle census
  updateBottleCensus();
  
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

  const inputs = [
    'torso', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow',
    'lHip', 'lKnee', 'rHip', 'rKnee'
  ];

  for (const key of inputs) {
    const input = $$(`#pose_${key}`, container);
    if (input && jointAngles[key] != null) {
      const degValue = radToDegNum(jointAngles[key]).toFixed(1);
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
    { key: 'head', label: 'Head' },
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
    const degValue = radToDegNum(currentVal).toFixed(1);
    
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
    { key: 'cameraOffsetX', path: 'camera.manualOffsetX', label: 'Camera Offset X', min: -400, max: 400, step: 1 },
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
    
    for (const k in fighter.jointAngles) {
      degPose[k] = radToDegNum(fighter.jointAngles[k]);
    }

    // Import and use pushPoseOverride if available
    if (typeof runtimePushPoseOverride === 'function') {
      runtimePushPoseOverride(fighter.id, degPose, 100);
    } else if (typeof window.pushPoseOverride === 'function') {
      window.pushPoseOverride(fighter.id, degPose, 100); // fallback for legacy globals
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

  // Build pose object from current joint angles
  const currentPose = {};
  const jointKeys = ['torso', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow', 'lHip', 'lKnee', 'rHip', 'rKnee'];
  
  for (const key of jointKeys) {
    if (player.jointAngles?.[key] != null) {
      currentPose[key] = Math.round(radToDegNum(player.jointAngles[key]));
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

// Export animator helpers for use by debug panel input handlers
if (typeof window !== 'undefined') {
  window.pushPoseOverride = function(fighterId, poseDeg, durMs = 100, options = {}) {
    if (typeof runtimePushPoseOverride === 'function') {
      runtimePushPoseOverride(fighterId, poseDeg, durMs, options);
    }
  };
  window.pushPoseLayerOverride = function(fighterId, layerId, poseDeg, options = {}) {
    if (typeof runtimePushPoseLayerOverride === 'function') {
      return runtimePushPoseLayerOverride(fighterId, layerId, poseDeg, options);
    }
    return null;
  };
}

// Drop a bottle on top of the player
async function dropBottleOnPlayer() {
  console.log('[debug-panel] Dropping bottle on player...');

  try {
    // Get the player position
    const game = window.GAME || {};
    const player = game.FIGHTERS?.player;
    if (!player || !player.pos) {
      console.warn('[debug-panel] Player not found or has no position');
      return;
    }

    console.log('[debug-panel] Player position:', player.pos);

    // Check ground Y calculation
    const playerGroundY = player.pos.y;
    const configGroundY = window.CONFIG?.groundY;
    console.log('[debug-panel] Player Y:', playerGroundY);
    console.log('[debug-panel] Config groundY:', configGroundY);
    console.log('[debug-panel] Canvas height:', window.CONFIG?.canvas?.h);

    // Get the editor preview sandbox
    const sandbox = game.editorPreview;
    if (!sandbox || typeof sandbox.addDynamicInstance !== 'function') {
      console.warn('[debug-panel] Editor preview sandbox not available');
      return;
    }

    // Fetch the bottle prefab
    const bottlePrefabUrl = './config/prefabs/obstructions/bottle_tall.prefab.json';
    const response = await fetch(bottlePrefabUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch bottle prefab: ${response.status}`);
    }

    const bottlePrefab = await response.json();
    const normalizedPrefab = normalizePrefabDefinition(bottlePrefab);

    if (!normalizedPrefab) {
      throw new Error('Failed to normalize bottle prefab');
    }

    // Create a unique instance ID
    const instanceId = `bottle_debug_${Date.now()}`;

    // Calculate spawn position (WAY above player for visibility)
    const spawnX = player.pos.x;
    const spawnY = player.pos.y - 600; // 600 pixels above player

    console.log('[debug-panel] Spawning bottle at:', { x: spawnX, y: spawnY });

    // Create the prop instance (props don't have layers - they render in gameplay space)
    const bottleInstance = {
      id: instanceId,
      prefabId: 'bottle_tall',
      prefab: normalizedPrefab,
      position: { x: spawnX, y: spawnY },
      scale: { x: 1, y: 1 }, // Normal size - no longer affected by proximityScale
      rotationDeg: 0,
      tags: normalizedPrefab.tags || [],
      meta: {
        identity: {
          prefabId: 'bottle_tall',
          source: 'debug-spawn',
        },
        debug: true, // Mark for debugging
      }
    };

    // Add using the sandbox method (handles both rendering and physics)
    const success = sandbox.addDynamicInstance(bottleInstance);

    if (success) {
      console.log('[debug-panel] ✅ Bottle spawned successfully!');
      console.log('[debug-panel] Total dynamic instances:', game.dynamicInstances?.length);
      console.log('[debug-panel] Bottle instance:', bottleInstance);

      // Log bottle position every 100ms for debugging
      let logCount = 0;
      const logInterval = setInterval(() => {
        const bottle = game.dynamicInstances?.find(inst => inst.id === instanceId);
        if (bottle) {
          // Detect if bottle has landed (y >= groundY and vel.y near zero)
          if (
            bottle.position?.y !== undefined &&
            bottle.physics?.vel?.y !== undefined &&
            !bottle.physics?.onGround
          ) {
            const groundY = window.CONFIG?.groundY || 0;
            if (bottle.position.y >= groundY && Math.abs(bottle.physics.vel.y) < 50) {
              bottle.physics.onGround = true;
            }
          }
          console.log(`[bottle-track] Position: y=${bottle.position?.y?.toFixed(1)}, vel.y=${bottle.physics?.vel?.y?.toFixed(1)}, onGround=${bottle.physics?.onGround}`);
          logCount++;
          if (logCount > 50 || bottle.physics?.onGround) {
            clearInterval(logInterval);
            if (bottle.physics?.onGround) {
              console.log('[bottle-track] 🎯 BOTTLE HIT THE GROUND!');
            }
          }
        } else {
          clearInterval(logInterval);
        }
      }, 100);
    } else {
      console.warn('[debug-panel] Failed to add bottle instance');
    }
  } catch (error) {
    console.error('[debug-panel] Failed to drop bottle:', error);
  }
}

