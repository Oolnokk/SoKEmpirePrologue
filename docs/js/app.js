// Character selection and settings management
function initCharacterDropdown() {
  const characterSelect = document.getElementById('characterSelect');
  if (!characterSelect || !window.CONFIG || !window.CONFIG.characters) return;
  characterSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select Character --';
  characterSelect.appendChild(defaultOption);
  const characters = window.CONFIG.characters;
  Object.keys(characters).forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    characterSelect.appendChild(option);
  });
  characterSelect.addEventListener('change', (e) => {
    const selectedChar = e.target.value;
    if (!selectedChar || !characters[selectedChar]) return;
    const charData = characters[selectedChar];
    // Sync fighter, weapon, and appearance
    window.GAME.selectedFighter = charData.fighter;
    window.GAME.selectedWeapon = charData.weapon;
    window.GAME.selectedAppearance = {
      clothes: charData.clothes,
      hairstyle: charData.hairstyle,
      beard: charData.beard,
      adornments: charData.adornments
    };
    // Optionally update UI or trigger re-render
    if (typeof showFighterSettings === 'function') {
      showFighterSettings(charData.fighter);
    }
    // Also update fighter dropdown to match
    const fighterSelect = document.getElementById('fighterSelect');
    if (fighterSelect) fighterSelect.value = charData.fighter;
  });
  console.log('[initCharacterDropdown] Character dropdown initialized with', Object.keys(characters).length, 'characters');
}
// Initialize dropdowns on page load
window.addEventListener('DOMContentLoaded', () => {
  initCharacterDropdown();
  initFighterDropdown();
});
import { initPresets, ensureAltSequenceUsesKickAlt } from './presets.js?v=6';
import { initFighters } from './fighter.js?v=6';
import { initControls } from './controls.js?v=7';
import { initCombat } from './combat.js?v=19';
import { updatePoses } from './animator.js?v=4';
import { renderAll, LIMB_COLORS } from './render.js?v=4';
import { updateCamera } from './camera.js?v=1';
import { initHitDetect, runHitDetect } from './hitdetect.js?v=1';
import { initSprites, renderSprites } from './sprites.js?v=8';
import { initDebugPanel, updateDebugPanel } from './debug-panel.js?v=1';
import { $$, show } from './dom-utils.js?v=1';
import { initTouchControls } from './touch-controls.js?v=1';

// Setup canvas
const cv = $$('#game');
const cx = cv?.getContext('2d');
window.GAME ||= {};

// Detect touch devices early so we can surface on-screen controls reliably
const rootElement = document.documentElement;
function detectTouchSupport(){
  const nav = navigator || {};
  const coarsePointer = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const hasTouch = ('ontouchstart' in window) || (nav.maxTouchPoints > 0) || (nav.msMaxTouchPoints > 0) || coarsePointer;
  rootElement.classList.toggle('is-touch', !!hasTouch);
}
detectTouchSupport();
if (typeof window.matchMedia === 'function'){
  const coarseQuery = window.matchMedia('(pointer: coarse)');
  const applyFromQuery = (ev) => {
    if (ev.matches) {
      rootElement.classList.add('is-touch');
    } else if (!('ontouchstart' in window) && (navigator.maxTouchPoints || 0) === 0) {
      rootElement.classList.remove('is-touch');
    }
  };
  if (typeof coarseQuery.addEventListener === 'function') {
    coarseQuery.addEventListener('change', applyFromQuery);
  } else if (typeof coarseQuery.addListener === 'function') {
    coarseQuery.addListener(applyFromQuery);
  }
}
window.addEventListener('touchstart', () => rootElement.classList.add('is-touch'), { once: true, passive: true });

// Mouse tracking state
window.GAME.MOUSE = {
  isDown: false,
  x: 0,              // Canvas-space X
  y: 0,              // Canvas-space Y
  worldX: 0,         // World-space X (accounting for camera)
  worldY: 0,         // World-space Y
  isInCanvas: false  // Whether mouse is over canvas
};

// Joystick state for touch controls
window.GAME.JOYSTICK = {
  active: false,
  startX: 0,
  startY: 0,
  currentX: 0,
  currentY: 0,
  deltaX: 0,
  deltaY: 0,
  distance: 0,
  angle: 0
};

// Aiming state
window.GAME.AIMING = {
  manualAim: false,
  targetAngle: 0
};

// === Apply render layer order (matches reference HTML) ===
const RENDER_ORDER = ['HITBOX','ARM_L_UPPER','ARM_L_LOWER','LEG_L_UPPER','LEG_L_LOWER','TORSO','HEAD','LEG_R_UPPER','LEG_R_LOWER','ARM_R_UPPER','ARM_R_LOWER'];
function applyRenderOrder(){
  window.CONFIG ||= {};
  window.CONFIG.render ||= {};
  window.CONFIG.render.order = RENDER_ORDER;
}
applyRenderOrder();

// HUD refs
const staminaFill = $$('#staminaFill');
const footingFill = $$('#footingFill');
const healthFill = $$('#healthFill');
const statusInfo = $$('#statusInfo');
const reloadBtn = $$('#btnReloadCfg');
const fullscreenBtn = $$('#btnFullscreen');
const stageEl = document.getElementById('gameStage');
const fpsHud = $$('#fpsHud');
const boneKeyList = $$('#boneKeyList');

if (reloadBtn){
  reloadBtn.addEventListener('click', async ()=>{
    try {
      if (statusInfo) statusInfo.textContent = 'Reloading config…';
      await window.reloadConfig?.();
      initPresets();
      ensureAltSequenceUsesKickAlt();
      applyRenderOrder();
      if (statusInfo) statusInfo.textContent = 'Config reloaded';
    } catch (e){
      if (statusInfo) statusInfo.textContent = 'Config reload failed';
      console.error(e);
    }
  });
}

if (fullscreenBtn && stageEl){
  const doc = document;
  const requestFs = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen || stageEl.msRequestFullscreen;
  const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

  const updateFullscreenUi = () => {
    const isFull = doc.fullscreenElement === stageEl || doc.webkitFullscreenElement === stageEl;
    fullscreenBtn.textContent = isFull ? '⤡ Exit' : '⤢ Full';
    fullscreenBtn.setAttribute('aria-pressed', isFull ? 'true' : 'false');
  };

  fullscreenBtn.addEventListener('click', async (e) => {
    e.preventDefault();
    if (!requestFs || !exitFs){
      console.warn('[fullscreen] Browser does not support fullscreen API');
      return;
    }
    try {
      const isFull = doc.fullscreenElement === stageEl || doc.webkitFullscreenElement === stageEl;
      if (!isFull){
        await requestFs.call(stageEl);
      } else {
        await exitFs.call(doc);
      }
    } catch (err){
      console.error('[fullscreen] toggle failed', err);
    }
  });

  doc.addEventListener('fullscreenchange', updateFullscreenUi);
  doc.addEventListener('webkitfullscreenchange', updateFullscreenUi);
  updateFullscreenUi();
}

if (boneKeyList) {
  const LABELS = {
    torso: 'Torso',
    head: 'Head',
    arm_L_upper: 'Left Upper Arm',
    arm_L_lower: 'Left Lower Arm',
    arm_R_upper: 'Right Upper Arm',
    arm_R_lower: 'Right Lower Arm',
    leg_L_upper: 'Left Upper Leg',
    leg_L_lower: 'Left Lower Leg',
    leg_R_upper: 'Right Upper Leg',
    leg_R_lower: 'Right Lower Leg'
  };
  boneKeyList.innerHTML = '';
  Object.entries(LIMB_COLORS).forEach(([key, color]) => {
    const item = document.createElement('div');
    item.style.display = 'flex';
    item.style.alignItems = 'center';
    item.style.gap = '8px';

    const swatch = document.createElement('span');
    swatch.style.display = 'inline-block';
    swatch.style.width = '16px';
    swatch.style.height = '16px';
    swatch.style.borderRadius = '4px';
    swatch.style.background = color;
    swatch.style.border = '1px solid rgba(255,255,255,0.2)';

    const label = document.createElement('span');
    label.textContent = LABELS[key] || key;

    item.appendChild(swatch);
    item.appendChild(label);
    boneKeyList.appendChild(item);
  });
}

// Wire up render debug controls
const toggleShowSprites = $$('#toggleShowSprites');
const toggleShowBones = $$('#toggleShowBones');
const toggleShowHitbox = $$('#toggleShowHitbox');

if (toggleShowSprites) {
  toggleShowSprites.checked = window.RENDER_DEBUG?.showSprites !== false;
  toggleShowSprites.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showSprites = e.target.checked;
  });
}

if (toggleShowBones) {
  toggleShowBones.checked = window.RENDER_DEBUG?.showBones !== false;
  toggleShowBones.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showBones = e.target.checked;
  });
}

if (toggleShowHitbox) {
  toggleShowHitbox.checked = window.RENDER_DEBUG?.showHitbox !== false;
  toggleShowHitbox.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showHitbox = e.target.checked;
  });
}

// Re-init presets on external config updates
document.addEventListener('config:updated', ()=>{
  initPresets();
  ensureAltSequenceUsesKickAlt();
  applyRenderOrder();
});

// Fighter selection and settings management
let currentSelectedFighter = null;

// Debounced preview management so fighter settings immediately refresh the viewport
let previewTimeoutId = null;
let previewQueuedFighter = null;
let previewInFlight = false;
let notifyConfigTimeoutId = null;

function scheduleConfigUpdatedEvent() {
  if (typeof document === 'undefined') return;
  if (notifyConfigTimeoutId) return;
  notifyConfigTimeoutId = setTimeout(() => {
    notifyConfigTimeoutId = null;
    try {
      document.dispatchEvent(new Event('config:updated'));
    } catch (err) {
      console.warn('[fighterSettings] Failed to dispatch config:updated event', err);
    }
  }, 0);
}

function scheduleFighterPreview(fighterName) {
  if (!fighterName) return;
  previewQueuedFighter = fighterName;

  if (previewTimeoutId) {
    clearTimeout(previewTimeoutId);
  }

  previewTimeoutId = setTimeout(async () => {
    previewTimeoutId = null;

    if (previewInFlight) {
      // Preview currently running; queue the latest fighter once the current run finishes
      previewQueuedFighter = fighterName;
      return;
    }

    const queuedName = previewQueuedFighter;
    previewQueuedFighter = null;
    if (!queuedName) return;

    previewInFlight = true;
    try {
      await reinitializeFighter(queuedName);
    } catch (err) {
      console.error('[fighterSettings] Fighter preview failed', err);
    } finally {
      previewInFlight = false;
      if (previewQueuedFighter) {
        scheduleFighterPreview(previewQueuedFighter);
      }
    }
  }, 120);
}

function initFighterDropdown() {
  const fighterSelect = $$('#fighterSelect');
  if (!fighterSelect) return;

  const C = window.CONFIG || {};
  const fighters = C.fighters || {};

  // Clear existing options
  fighterSelect.innerHTML = '';

  // Add a default option
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select Fighter --';
  fighterSelect.appendChild(defaultOption);

  // Populate with fighters from config
  Object.keys(fighters).forEach(fighterName => {
    const option = document.createElement('option');
    option.value = fighterName;
    option.textContent = fighterName;
    fighterSelect.appendChild(option);
  });

  // Handle selection change
  fighterSelect.addEventListener('change', (e) => {
    const selectedFighter = e.target.value;
    currentSelectedFighter = selectedFighter;
    window.GAME.selectedFighter = selectedFighter;
    if (selectedFighter) {
      showFighterSettings(selectedFighter);
    } else {
      hideFighterSettings();
    }
  });

  console.log('[initFighterDropdown] Fighter dropdown initialized with', Object.keys(fighters).length, 'fighters');
}

function showFighterSettings(fighterName) {
  const settingsBox = $$('#fighterSettingsBox');
  const settingsFields = $$('#fighterSettingsFields');
  if (!settingsBox || !settingsFields) return;

  const C = window.CONFIG || {};
  const fighter = C.fighters?.[fighterName];
  if (!fighter) return;

  // Show the settings box
  settingsBox.style.display = '';

  // Populate with numeric values
  populateFighterSettings(fighterName, fighter, settingsFields);

  // Setup collapse/expand functionality if not already done
  const toggleBtn = $$('#toggleFighterSettings');
  const content = $$('#fighterSettingsContent');
  const label = $$('.fighter-settings-label');
  
  if (toggleBtn && content && label && !label.dataset.initialized) {
    label.addEventListener('click', () => {
      content.classList.toggle('collapsed');
      toggleBtn.classList.toggle('collapsed');
      toggleBtn.textContent = content.classList.contains('collapsed') ? '▶' : '▼';
    });
    label.dataset.initialized = 'true';
  }

  // Setup button handlers if not already done
  setupFighterButtons(fighterName);
}

function setupFighterButtons(fighterName) {
  const refreshBtn = $$('#btnRefreshFighter');
  const loadBtn = $$('#btnLoadFighter');
  const reinitializeBtn = $$('#btnReinitializeFighter');
  const exportBtn = $$('#btnExportConfig');

  // Only set up once - buttons persist across fighter selections
  if (refreshBtn && !window._fighterButtonsInitialized) {
    refreshBtn.addEventListener('click', () => {
      if (currentSelectedFighter) {
        refreshFighterSettings(currentSelectedFighter);
      }
    });
    
    loadBtn.addEventListener('click', () => {
      if (currentSelectedFighter) {
        loadFighterSettings(currentSelectedFighter);
      }
    });
    
    if (reinitializeBtn) {
      reinitializeBtn.addEventListener('click', () => {
        if (currentSelectedFighter) {
          reinitializeFighter(currentSelectedFighter);
        }
      });
    }
    
    exportBtn.addEventListener('click', () => exportConfig());
    
    window._fighterButtonsInitialized = true;
  }
}

function refreshFighterSettings(fighterName) {
  console.log('[refreshFighterSettings] Refreshing settings for', fighterName);
  
  // Re-populate the settings UI with current values from config
  const settingsFields = $$('#fighterSettingsFields');
  if (settingsFields) {
    const C = window.CONFIG || {};
    const fighter = C.fighters?.[fighterName];
    if (fighter) {
      populateFighterSettings(fighterName, fighter, settingsFields);
      console.log('[refreshFighterSettings] Settings refreshed');
    }
  }
}

async function loadFighterSettings(fighterName) {
  console.log('[loadFighterSettings] Loading settings for', fighterName);
  
  try {
    // The config is already updated in memory via input handlers
    // Reinitialize sprites and fighters to apply changes
    if (statusInfo) statusInfo.textContent = 'Reloading fighter...';
    
    // Reload sprites with new config
    await initSprites();
    
    // Reinit fighters
    initFighters(cv, cx);
    
    // Reinit presets
    initPresets();
    ensureAltSequenceUsesKickAlt();
    
    if (statusInfo) statusInfo.textContent = 'Fighter loaded';
    console.log('[loadFighterSettings] Fighter reloaded successfully');
  } catch (e) {
    if (statusInfo) statusInfo.textContent = 'Fighter reload failed';
    console.error('[loadFighterSettings] Error:', e);
  }
}

/**
 * Reinitialize fighter with asset reload while preserving all user edits.
 * This function:
 * 1. Captures current fighter state (joint angles, config values, debug settings)
 * 2. Reloads sprites and skeleton
 * 3. Restores all captured state so user edits are preserved
 * 
 * @param {string} fighterName - Name of fighter to reinitialize
 */
async function reinitializeFighter(fighterName) {
  console.log('[reinitializeFighter] Reinitializing fighter while preserving settings:', fighterName);
  
  try {
    const G = window.GAME || {};
    const C = window.CONFIG || {};
    
    if (statusInfo) statusInfo.textContent = 'Reinitializing fighter...';
    
    // === Step 1: Capture current state from all sources ===
    
    // Capture fighter runtime state (joint angles, velocities, etc.)
    const capturedState = {};
    if (G.FIGHTERS) {
      for (const [fighterId, fighter] of Object.entries(G.FIGHTERS)) {
        capturedState[fighterId] = {
          // Preserve joint angles (user may have edited these via debug panel)
          jointAngles: fighter.jointAngles ? { ...fighter.jointAngles } : null,
          // Preserve position and facing
          pos: fighter.pos ? { ...fighter.pos } : null,
          facingSign: fighter.facingSign,
          facingRad: fighter.facingRad,
          // Preserve stamina and footing
          stamina: fighter.stamina ? { ...fighter.stamina } : null,
          footing: fighter.footing,
          // Preserve walk and attack state
          walk: fighter.walk ? { ...fighter.walk } : null,
          attack: fighter.attack ? { ...fighter.attack } : null,
          combo: fighter.combo ? { ...fighter.combo } : null,
          onGround: fighter.onGround,
          prevOnGround: fighter.prevOnGround,
          ragdoll: fighter.ragdoll
        };
      }
    }
    
    // Capture debug settings
    const debugSettings = {
      freezeAngles: C.debug?.freezeAngles || false
    };
    
    // Capture current config edits (these are already in CONFIG but we track them)
    // The config values are already updated in memory by the input handlers
    // so we don't need to capture/restore them explicitly
    
    console.log('[reinitializeFighter] Captured state:', { capturedState, debugSettings });
    
    // === Step 2: Reload sprites and fighters ===
    
    // Reload sprites with current config
    await initSprites();
    
    // Reinit fighters (this resets them to default STANCE)
    initFighters(cv, cx);
    
    // Reinit presets
    initPresets();
    ensureAltSequenceUsesKickAlt();
    
    // === Step 3: Restore captured state ===
    
    // Restore fighter runtime state
    if (G.FIGHTERS) {
      for (const [fighterId, fighter] of Object.entries(G.FIGHTERS)) {
        const saved = capturedState[fighterId];
        if (saved) {
          // Restore joint angles (most important for user edits)
          if (saved.jointAngles) {
            fighter.jointAngles = { ...saved.jointAngles };
          }
          // Restore position and facing
          if (saved.pos) {
            fighter.pos = { ...saved.pos };
          }
          if (saved.facingSign !== undefined) fighter.facingSign = saved.facingSign;
          if (saved.facingRad !== undefined) fighter.facingRad = saved.facingRad;
          // Restore stamina and footing
          if (saved.stamina) {
            fighter.stamina = { ...saved.stamina };
          }
          if (saved.footing !== undefined) fighter.footing = saved.footing;
          // Restore walk and attack state
          if (saved.walk) fighter.walk = { ...saved.walk };
          if (saved.attack) fighter.attack = { ...saved.attack };
          if (saved.combo) fighter.combo = { ...saved.combo };
          if (saved.onGround !== undefined) fighter.onGround = saved.onGround;
          if (saved.prevOnGround !== undefined) fighter.prevOnGround = saved.prevOnGround;
          if (saved.ragdoll !== undefined) fighter.ragdoll = saved.ragdoll;
        }
      }
    }
    
    // Restore debug settings
    if (!C.debug) C.debug = {};
    C.debug.freezeAngles = debugSettings.freezeAngles;
    
    // Update freeze checkbox to match restored state
    const freezeCheckbox = $$('#freezeAnglesCheckbox');
    if (freezeCheckbox) {
      freezeCheckbox.checked = debugSettings.freezeAngles;
    }
    
    if (statusInfo) statusInfo.textContent = 'Fighter reinitialized, settings retained';
    console.log('[reinitializeFighter] Fighter reinitialized successfully with preserved state');
  } catch (e) {
    if (statusInfo) statusInfo.textContent = 'Fighter reinitialize failed';
    console.error('[reinitializeFighter] Error:', e);
  }
}

function exportConfig() {
  console.log('[exportConfig] Exporting config...');
  
  const C = window.CONFIG || {};
  
  // Generate the config.js file content in the same format as the original
  const configContent = generateConfigJS(C);
  
  // Create a blob and trigger download
  const blob = new Blob([configContent], { type: 'text/javascript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'config.js';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  console.log('[exportConfig] Config exported');
}

function generateConfigJS(config) {
  const INDENT = '  ';

  function stringifyWithFunctions(value) {
    const functions = [];
    const json = JSON.stringify(value, (key, val) => {
      if (typeof val === 'function') {
        const id = functions.push(val.toString()) - 1;
        return `__FUNC_${id}__`;
      }
      return val;
    }, 2);
    return json.replace(/"__FUNC_(\d+)__"/g, (_match, idx) => functions[Number(idx)] || 'undefined');
  }

  function formatAssignment(indentLevel, prefix, value) {
    const serialized = stringifyWithFunctions(value).split('\n');
    const indent = INDENT.repeat(indentLevel);
    let statement = indent + prefix + serialized[0];
    if (serialized.length > 1) {
      statement += '\n' + serialized.slice(1).map(line => indent + line).join('\n');
    }
    return statement + ';';
  }

  const lines = [];
  lines.push('// khyunchained CONFIG with sprite anchor mapping (torso/start) & optional debug');
  const configLiteral = stringifyWithFunctions(config);
  lines.push(`window.CONFIG = ${configLiteral};`);
  lines.push('');
  lines.push('');
  lines.push('// ==== CONFIG.attacks (authoritative) ====');
  lines.push('window.CONFIG = window.CONFIG || {};');
  lines.push('(function initAttacks(){');
  lines.push('  const D = CONFIG.durations || { toWindup:320, toStrike:160, toRecoil:180, toStance:120 };');
  lines.push(formatAssignment(1, 'CONFIG.attacks = ', config.attacks || {}));
  lines.push('})();');
  lines.push('');
  lines.push('');
  lines.push('// Back-compat: build CONFIG.presets from CONFIG.attacks');
  lines.push('(function buildPresets(){');
  lines.push('  if (!window.CONFIG || !CONFIG.attacks) return;');
  lines.push('  const clone = (o) => JSON.parse(JSON.stringify(o));');
  lines.push('');
  lines.push('  const SLAM = {');
  lines.push('    poses: clone(CONFIG.poses),');
  lines.push('    durations: clone(CONFIG.durations),');
  lines.push('    knockbackBase: (CONFIG.attacks.slots[2]?.knockbackBase ?? 250),');
  lines.push('    cancelWindow: (CONFIG.attacks.slots[2]?.cancelWindowRecoil ?? 0.5)');
  lines.push('  };');
  lines.push('');
  lines.push('  const KICK = {');
  lines.push('    durations: { toWindup:180, toStrike:110, toRecoil:680, toStance:0 },');
  lines.push('    knockbackBase: (CONFIG.attacks.slots[3]?.knockbackBase ?? 180),');
  lines.push('    cancelWindow: (CONFIG.attacks.slots[3]?.cancelWindowRecoil ?? 0.6),');
  lines.push('    poses: {');
  lines.push('      Stance: Object.assign(clone(CONFIG.poses.Stance), { resetFlipsBefore: true }),');
  lines.push('      Windup: clone(CONFIG.attacks.library.KICK_Windup.overrides),');
  lines.push('      Strike: clone(CONFIG.attacks.library.KICK_Strike.overrides),');
  lines.push('      Recoil: clone(CONFIG.attacks.library.KICK_Recoil.overrides)');
  lines.push('    }');
  lines.push('  };');
  lines.push('');
  lines.push('  const PUNCH = {');
  lines.push('    durations: { toWindup1:180, toWindup2:180, toStrike1:110, toStrike2:110, toRecoil:200, toStance:120 },');
  lines.push('    knockbackBase: 140,');
  lines.push('    cancelWindow: 0.7,');
  lines.push('    poses: {');
  lines.push('      Stance: clone(CONFIG.poses.Stance),');
  lines.push('      Windup: clone(CONFIG.poses.Windup),');
  lines.push('      Strike: clone(CONFIG.poses.Strike),');
  lines.push('      Recoil: clone(CONFIG.poses.Recoil),');
  lines.push('      Strike1: clone(CONFIG.attacks.library.PUNCH_Strike1?.overrides || {}),');
  lines.push('      Strike2: clone(CONFIG.attacks.library.PUNCH_Strike2?.overrides || {})');
  lines.push('    },');
  lines.push('    sequence: [');
  lines.push('      { pose:\'Stance\', durKey:\'toStance\' },');
  lines.push('      { pose:\'Windup\', durKey:\'toWindup1\' },');
  lines.push('      { pose:\'Strike1\', durKey:\'toStrike1\' },');
  lines.push('      { pose:\'Windup\', durKey:\'toWindup2\' },');
  lines.push('      { pose:\'Strike2\', durKey:\'toStrike2\' },');
  lines.push('      { pose:\'Recoil\', durKey:\'toRecoil\' },');
  lines.push('      { pose:\'Stance\', durKey:\'toStance\' }');
  lines.push('    ]');
  lines.push('  };');
  lines.push('');
  lines.push('  CONFIG.presets = Object.assign({}, CONFIG.presets || {}, { SLAM, KICK, PUNCH });');
  lines.push('');
  lines.push('  const ensurePreset = (name, base=\'PUNCH\') => {');
  lines.push('    if (!CONFIG.presets[name]) CONFIG.presets[name] = clone(CONFIG.presets[base] || {});');
  lines.push('    CONFIG.presets[name].useWeaponColliders = true;');
  lines.push('  };');
  lines.push('  [\'SLASH\',\'STAB\',\'THRUST\',\'SWEEP\',\'CHOP\',\'SMASH\',\'SWING\',\'HACK\',\'TOSS\'].forEach(n => ensurePreset(n));');
  lines.push('');
  lines.push('  try { document.dispatchEvent(new Event(\'config:ready\')); } catch(_){}');
})();

  return lines.join('\n');
}

function hideFighterSettings() {
  const settingsBox = $$('#fighterSettingsBox');
  if (settingsBox) {
    settingsBox.style.display = 'none';
  }
}

function populateFighterSettings(fighterName, fighter, container) {
  container.innerHTML = '';

  // Extract all numeric values from the fighter config
  const numericFields = extractNumericFields(fighter, fighterName);

  numericFields.forEach(field => {
    const label = document.createElement('label');
    label.style.display = 'flex';
    label.style.justifyContent = 'space-between';
    label.style.alignItems = 'center';
    label.style.fontSize = '12px';
    label.style.color = '#e5e7eb';

    const labelText = document.createElement('span');
    labelText.textContent = field.label;
    labelText.style.flex = '1';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = field.value;
    input.step = field.step || 0.1;
    input.style.width = '80px';
    input.style.padding = '4px';
    input.style.background = '#1f2937';
    input.style.border = '1px solid #374151';
    input.style.borderRadius = '4px';
    input.style.color = '#e5e7eb';
    input.dataset.path = field.path;
    input.dataset.originalValue = field.value;

    // Handle real-time updates to the in-memory config
    input.addEventListener('input', (e) => {
      const newValue = parseFloat(e.target.value);
      if (!isNaN(newValue)) {
        setNestedValue(fighter, field.path, newValue);
        console.log(`[fighterSettings] Updated ${fighterName}.${field.path} = ${newValue}`);
        scheduleConfigUpdatedEvent();
        scheduleFighterPreview(fighterName);
      }
    });

    label.appendChild(labelText);
    label.appendChild(input);
    container.appendChild(label);
  });
}

function extractNumericFields(obj, prefix = '', fields = []) {
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    
    const value = obj[key];
    const path = prefix ? `${prefix}.${key}` : key;
    
    if (typeof value === 'number') {
      // Format the label nicely
      const label = path.split('.').map(part => 
        part.replace(/([A-Z])/g, ' $1').trim()
      ).join(' › ');
      
      fields.push({
        label: label,
        path: path,
        value: value,
        step: (value < 1 && value > -1) ? 0.01 : (value < 10 ? 0.1 : 1)
      });
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively extract nested numeric fields
      extractNumericFields(value, path, fields);
    }
  }
  return fields;
}

function setNestedValue(obj, path, value) {
  const keys = path.split('.');
  let current = obj;
  
  for (let i = 0; i < keys.length - 1; i++) {
    if (!current[keys[i]]) {
      current[keys[i]] = {};
    }
    current = current[keys[i]];
  }
  
  current[keys[keys.length - 1]] = value;
}

function updateHUD(){
  const G = window.GAME;
  const P = G.FIGHTERS?.player;
  if (!P) return;
  const S = P.stamina;
  if (S && staminaFill){ staminaFill.style.width = Math.round((S.current/S.max)*100)+'%'; }
  if (footingFill){ footingFill.style.width = Math.round(P.footing)+'%'; }
  if (healthFill){ healthFill.style.width = '100%'; }
}

function drawStage(){
  if (!cx) return;
  const C = window.CONFIG || {};
  const camX = window.GAME?.CAMERA?.x || 0;
  const worldW = window.GAME?.CAMERA?.worldWidth || 1600;
  cx.clearRect(0,0,cv.width,cv.height);
  cx.fillStyle = '#0b1220';
  cx.fillRect(0,0,cv.width,cv.height);
  // ground (with camera offset)
  const gy = (C.canvas?.h||460) * (C.groundRatio||0.7);
  cx.save();
  cx.translate(-camX, 0);
  cx.strokeStyle = 'rgba(255,255,255,.15)';
  cx.beginPath(); cx.moveTo(0, gy); cx.lineTo(worldW, gy); cx.stroke();
  cx.restore();

  cx.fillStyle = '#93c5fd';
  cx.fillText('KHY Modular Build', 14, 22);
}

let last = performance.now();
let fpsLast = performance.now();
let frames = 0;
function loop(t){
  const dt = (t - last) / 1000; last = t;
  if (window.GAME?.combat) window.GAME.combat.tick(dt);
  updatePoses();
  updateCamera(cv);
  drawStage();
  renderAll(cx);
  renderSprites(cx);
  runHitDetect();
  updateHUD();
  updateDebugPanel();

  // FPS HUD
  frames++;
  const elapsed = (t - fpsLast);
  if (elapsed >= 250){ // update every 1/4s for stability
    const fps = Math.round((frames / elapsed) * 1000);
    if (fpsHud) fpsHud.textContent = 'FPS: ' + fps;
    fpsLast = t;
    frames = 0;
  }

  requestAnimationFrame(loop);
}

// === Mouse event handlers ===
function updateMousePosition(e) {
  if (!cv) return;
  const rect = cv.getBoundingClientRect();
  // Get mouse position relative to canvas
  const scaleX = cv.width / rect.width;
  const scaleY = cv.height / rect.height;
  window.GAME.MOUSE.x = (e.clientX - rect.left) * scaleX;
  window.GAME.MOUSE.y = (e.clientY - rect.top) * scaleY;
  // World coordinates account for camera offset
  const camX = window.GAME?.CAMERA?.x || 0;
  window.GAME.MOUSE.worldX = window.GAME.MOUSE.x + camX;
  window.GAME.MOUSE.worldY = window.GAME.MOUSE.y;
}

if (cv) {
  cv.addEventListener('mousemove', (e) => {
    updateMousePosition(e);
    window.GAME.MOUSE.isInCanvas = true;
  });

  cv.addEventListener('mouseenter', (e) => {
    updateMousePosition(e);
    window.GAME.MOUSE.isInCanvas = true;
  });

  cv.addEventListener('mouseleave', () => {
    window.GAME.MOUSE.isInCanvas = false;
  });

  cv.addEventListener('mousedown', (e) => {
    e.preventDefault();
    window.GAME.MOUSE.isDown = true;
    // Left click = Button A (combo attacks)
    if (e.button === 0 && window.GAME.combat) {
      window.GAME.combat.slotDown('A');
    }
    // Right click = Button B (single attacks)
    else if (e.button === 2 && window.GAME.combat) {
      window.GAME.combat.slotDown('B');
    }
  });

  cv.addEventListener('mouseup', (e) => {
    e.preventDefault();
    window.GAME.MOUSE.isDown = false;
    // Left click = Button A
    if (e.button === 0 && window.GAME.combat) {
      window.GAME.combat.slotUp('A');
    }
    // Right click = Button B
    else if (e.button === 2 && window.GAME.combat) {
      window.GAME.combat.slotUp('B');
    }
  });

  // Prevent context menu on right click
  cv.addEventListener('contextmenu', (e) => {
    e.preventDefault();
  });
}

// Track mouse globally for when it leaves canvas
window.addEventListener('mousemove', (e) => {
  if (!window.GAME.MOUSE.isInCanvas) {
    updateMousePosition(e);
  }
});

function boot(){
  try {
    if (statusInfo) statusInfo.textContent = 'Booted';
    initPresets();
    ensureAltSequenceUsesKickAlt();
    initFighters(cv, cx);
    initControls();
    initCombat();
    initHitDetect();
    initDebugPanel();
    initTouchControls();
    initFighterDropdown();
    requestAnimationFrame(loop);
    setTimeout(()=>{ const p=$$('#interactPrompt'); show(p,true); setTimeout(()=>show(p,false),1200); }, 600);
  } catch (e){
    const b=document.getElementById('bootError'), m=document.getElementById('bootErrorMsg');
    if(b&&m){ m.textContent=(e.message||'Unknown error'); b.style.display='block'; }
    console.error(e);
  }
}

(async function start(){
  try { if (window.reloadConfig) await window.reloadConfig(); } catch(_){ }
  applyRenderOrder();
  await initSprites();
  boot();
})();
