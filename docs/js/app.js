// Character selection and settings management
const ABILITY_SLOT_CONFIG = [
  { slot: 'A', type: 'light', elementId: 'slotALight' },
  { slot: 'A', type: 'heavy', elementId: 'slotAHeavy' },
  { slot: 'B', type: 'light', elementId: 'slotBLight' },
  { slot: 'B', type: 'heavy', elementId: 'slotBHeavy' },
  { slot: 'C', type: 'light', elementId: 'slotCLight' },
  { slot: 'C', type: 'heavy', elementId: 'slotCHeavy' }
];

const abilitySelectRefs = {};

function getSlotConfig(slotKey) {
  return window.CONFIG?.abilitySystem?.slots?.[slotKey] || null;
}

function getSlotAllowance(slotKey, type) {
  const slot = getSlotConfig(slotKey);
  return slot?.allowed?.[type] || null;
}

function abilityMatchesSlot(def = {}, type, allowance) {
  if (!def || typeof def !== 'object' || Object.keys(def).length === 0) return false;
  if (allowance) {
    if (Array.isArray(allowance.triggers) && allowance.triggers.length) {
      if (!allowance.triggers.includes(def.trigger)) return false;
    }
    if (Array.isArray(allowance.types) && allowance.types.length) {
      if (!def.type || !allowance.types.includes(def.type)) return false;
    }
    if (Array.isArray(allowance.classification) && allowance.classification.length) {
      if (!def.type || !allowance.classification.includes(def.type)) return false;
    }
    if (Array.isArray(allowance.tags) && allowance.tags.length) {
      const tags = Array.isArray(def.tags) ? def.tags : [];
      for (const tag of allowance.tags) {
        if (!tags.includes(tag)) return false;
      }
    }
  } else {
    if (type === 'light' && def.type && def.type !== 'light') return false;
    if (type === 'heavy' && def.type && def.type !== 'heavy' && def.type !== 'defensive') return false;
  }
  return true;
}

function ensureGameSelectionState() {
  window.GAME ||= {};
  window.GAME.selectedAbilities ||= {};
  for (const { slot, type } of ABILITY_SLOT_CONFIG) {
    const slotState = (window.GAME.selectedAbilities[slot] ||= { light: null, heavy: null });
    if (!(type in slotState)) {
      slotState[type] = null;
    }
  }
}

function normalizeAbilityValue(value) {
  if (value === undefined || value === null || value === '') return null;
  return String(value);
}

function setAbilitySelection(assignments = {}, { syncDropdowns = false } = {}) {
  ensureGameSelectionState();
  const updatesForCombat = {};
  const abilityDefs = window.CONFIG?.abilitySystem?.abilities || {};

  Object.entries(assignments).forEach(([slotKey, slotValues]) => {
    if (!slotValues) return;
    const slotState = (window.GAME.selectedAbilities[slotKey] ||= { light: null, heavy: null });
    const combatSlot = {};

    if ('light' in slotValues) {
      const normalized = normalizeAbilityValue(slotValues.light);
      const allowance = getSlotAllowance(slotKey, 'light');
      const allowed = normalized && abilityMatchesSlot(abilityDefs[normalized], 'light', allowance)
        ? normalized
        : null;
      slotState.light = allowed;
      combatSlot.light = allowed;
      const select = abilitySelectRefs?.[slotKey]?.light;
      if (syncDropdowns && select) {
        select.value = allowed ?? '';
      }
    }

    if ('heavy' in slotValues) {
      const normalized = normalizeAbilityValue(slotValues.heavy);
      const allowance = getSlotAllowance(slotKey, 'heavy');
      const allowed = normalized && abilityMatchesSlot(abilityDefs[normalized], 'heavy', allowance)
        ? normalized
        : null;
      slotState.heavy = allowed;
      combatSlot.heavy = allowed;
      const select = abilitySelectRefs?.[slotKey]?.heavy;
      if (syncDropdowns && select) {
        select.value = allowed ?? '';
      }
    }

    if (Object.keys(combatSlot).length) {
      updatesForCombat[slotKey] = combatSlot;
    }
  });

  if (Object.keys(updatesForCombat).length && window.GAME.combat?.updateSlotAssignments) {
    window.GAME.combat.updateSlotAssignments(updatesForCombat);
  }
}

function mapSlottedAbilitiesArray(values = []) {
  const defaults = getDefaultAbilityAssignments();
  const assignments = {};
  const abilityDefs = window.CONFIG?.abilitySystem?.abilities || {};
  ABILITY_SLOT_CONFIG.forEach(({ slot, type }, index) => {
    const fallback = defaults?.[slot]?.[type] ?? null;
    const chosen = values[index] !== undefined ? values[index] : fallback;
    const normalized = normalizeAbilityValue(chosen);
    const allowance = getSlotAllowance(slot, type);
    let allowed = normalized && abilityMatchesSlot(abilityDefs[normalized], type, allowance)
      ? normalized
      : null;
    if (!allowed && fallback) {
      const fallbackNormalized = normalizeAbilityValue(fallback);
      if (fallbackNormalized && abilityMatchesSlot(abilityDefs[fallbackNormalized], type, allowance)) {
        allowed = fallbackNormalized;
      }
    }
    assignments[slot] ||= {};
    assignments[slot][type] = allowed;
  });
  return assignments;
}

function getDefaultAbilityAssignments() {
  const slots = window.CONFIG?.abilitySystem?.slots || {};
  const abilityDefs = window.CONFIG?.abilitySystem?.abilities || {};
  const assignments = {};
  Object.entries(slots).forEach(([slotKey, slotDef]) => {
    const lightDefault = normalizeAbilityValue(slotDef?.light);
    const heavyDefault = normalizeAbilityValue(slotDef?.heavy);
    const lightAllowance = slotDef?.allowed?.light || null;
    const heavyAllowance = slotDef?.allowed?.heavy || null;
    assignments[slotKey] = {
      light: lightDefault && abilityMatchesSlot(abilityDefs[lightDefault], 'light', lightAllowance)
        ? lightDefault
        : null,
      heavy: heavyDefault && abilityMatchesSlot(abilityDefs[heavyDefault], 'heavy', heavyAllowance)
        ? heavyDefault
        : null
    };
  });
  return assignments;
}

function populateAbilityOptions(select, slotKey, type, abilityDefs) {
  if (!select) return;
  const prevValue = select.value;
  select.innerHTML = '';

  const allowance = getSlotAllowance(slotKey, type);
  const placeholder = document.createElement('option');
  placeholder.value = '';
  if (allowance?.triggers && allowance.triggers.includes('defensive')) {
    placeholder.textContent = '-- Select Defensive Ability --';
  } else if (type === 'heavy') {
    placeholder.textContent = '-- Select Heavy Ability --';
  } else {
    placeholder.textContent = '-- Select Light Ability --';
  }
  select.appendChild(placeholder);

  const entries = Object.entries(abilityDefs || {})
    .filter(([_, def]) => abilityMatchesSlot(def, type, allowance))
    .sort((a, b) => {
      const aName = a[1]?.name || a[0];
      const bName = b[1]?.name || b[0];
      return aName.localeCompare(bName);
    });

  entries.forEach(([id, def]) => {
    const option = document.createElement('option');
    option.value = id;
    option.textContent = def?.name || id;
    select.appendChild(option);
  });

  const hasPrevious = entries.some(([id]) => id === prevValue);
  select.value = hasPrevious ? prevValue : '';
}

function initAbilitySlotDropdowns() {
  const abilitySystem = window.CONFIG?.abilitySystem;
  if (!abilitySystem) return;

  ensureGameSelectionState();
  const abilityDefs = abilitySystem.abilities || {};

  ABILITY_SLOT_CONFIG.forEach(({ slot, type, elementId }) => {
    const select = document.getElementById(elementId);
    if (!select) return;
    abilitySelectRefs[slot] ||= {};
    abilitySelectRefs[slot][type] = select;

    populateAbilityOptions(select, slot, type, abilityDefs);

    if (!select.dataset.initialized) {
      select.addEventListener('change', (event) => {
        const value = event.target.value || null;
        setAbilitySelection({ [slot]: { [type]: value } });
      });
      select.dataset.initialized = 'true';
    }
  });

  const defaults = getDefaultAbilityAssignments();
  const merged = { ...defaults };
  Object.entries(window.GAME?.selectedAbilities || {}).forEach(([slotKey, slotValues]) => {
    if (!slotValues) return;
    const hasLight = slotValues.light != null;
    const hasHeavy = slotValues.heavy != null;
    if (!hasLight && !hasHeavy) return;
    merged[slotKey] ||= {};
    if (hasLight) merged[slotKey].light = slotValues.light;
    if (hasHeavy) merged[slotKey].heavy = slotValues.heavy;
  });

  setAbilitySelection(merged, { syncDropdowns: true });
}

function initWeaponDropdown() {
  const weaponSelect = document.getElementById('weaponSelect');
  if (!weaponSelect) return;

  const weapons = window.CONFIG?.weapons || {};
  const previous = weaponSelect.value || window.GAME?.selectedWeapon || window.CONFIG?.characters?.player?.weapon || '';

  weaponSelect.innerHTML = '';

  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = '-- Select Weapon --';
  weaponSelect.appendChild(placeholder);

  Object.keys(weapons).sort().forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    weaponSelect.appendChild(option);
  });

  const hasPrevious = previous && Object.prototype.hasOwnProperty.call(weapons, previous);
  const fallback = Object.prototype.hasOwnProperty.call(weapons, 'unarmed') ? 'unarmed' : '';
  weaponSelect.value = hasPrevious ? previous : fallback;

  window.GAME ||= {};
  window.GAME.selectedWeapon = weaponSelect.value || null;

  if (!weaponSelect.dataset.initialized) {
    weaponSelect.addEventListener('change', (event) => {
      const value = event.target.value;
      window.GAME.selectedWeapon = value || null;
    });
    weaponSelect.dataset.initialized = 'true';
  }
}

function initCharacterDropdown() {
  const characterSelect = document.getElementById('characterSelect');
  if (!characterSelect || !window.CONFIG || !window.CONFIG.characters) return;
  const characters = window.CONFIG.characters;
  const characterKeys = Object.keys(characters);
  const previousSelection =
    characterSelect.value ||
    window.GAME?.selectedCharacter ||
    '';
  characterSelect.innerHTML = '';
  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = '-- Select Character --';
  characterSelect.appendChild(defaultOption);
  characterKeys.forEach(key => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    characterSelect.appendChild(option);
  });
  const onCharacterChange = (e) => {
    const map = window.CONFIG?.characters || {};
    const selectedChar = e.target.value;
    window.GAME ||= {};
    if (!selectedChar || !map[selectedChar]) {
      characterSelect.value = '';
      window.GAME.selectedCharacter = null;
      window.GAME.selectedFighter = null;
      window.GAME.selectedWeapon = null;
      delete window.GAME.selectedAppearance;
      delete window.GAME.selectedBodyColors;
      delete window.GAME.selectedBodyColorsFighter;
      delete window.GAME.selectedCosmetics;

      if (typeof hideFighterSettings === 'function') {
        hideFighterSettings();
      }

      const fighterSelect = document.getElementById('fighterSelect');
      if (fighterSelect) {
        fighterSelect.value = '';
      }

      const weaponSelect = document.getElementById('weaponSelect');
      if (weaponSelect) {
        weaponSelect.value = '';
      }

      const defaults = getDefaultAbilityAssignments();
      setAbilitySelection(defaults, { syncDropdowns: true });
      return;
    }
    const charData = map[selectedChar];
    // Sync fighter, weapon, cosmetics, and appearance
    window.GAME.selectedCharacter = selectedChar;
    window.GAME.selectedFighter = charData.fighter;
    window.GAME.selectedWeapon = charData.weapon || null;
    window.GAME.selectedAppearance = {
      clothes: charData.clothes,
      hairstyle: charData.hairstyle,
      beard: charData.beard,
      adornments: charData.adornments
    };

    if (charData.bodyColors){
      try {
        window.GAME.selectedBodyColors = JSON.parse(JSON.stringify(charData.bodyColors));
      } catch (_err) {
        window.GAME.selectedBodyColors = { ...charData.bodyColors };
      }
      window.GAME.selectedBodyColorsFighter = charData.fighter;
    } else {
      delete window.GAME.selectedBodyColors;
      delete window.GAME.selectedBodyColorsFighter;
    }

    if (charData.cosmetics) {
      try {
        window.GAME.selectedCosmetics = JSON.parse(JSON.stringify(charData.cosmetics));
      } catch (_err) {
        window.GAME.selectedCosmetics = charData.cosmetics;
      }
    } else {
      delete window.GAME.selectedCosmetics;
    }

    // Optionally update UI or trigger re-render
    if (typeof showFighterSettings === 'function') {
      showFighterSettings(charData.fighter);
    }
    // Also update fighter dropdown to match
    const fighterSelect = document.getElementById('fighterSelect');
    if (fighterSelect) fighterSelect.value = charData.fighter;

    const weaponSelect = document.getElementById('weaponSelect');
    if (weaponSelect) {
      const hasOption = Array.from(weaponSelect.options).some(opt => opt.value === charData.weapon);
      if (!hasOption && charData.weapon) {
        const option = document.createElement('option');
        option.value = charData.weapon;
        option.textContent = charData.weapon;
        weaponSelect.appendChild(option);
      }
      weaponSelect.value = charData.weapon || '';
    }

    const abilityAssignments = mapSlottedAbilitiesArray(charData.slottedAbilities || []);
    setAbilitySelection(abilityAssignments, { syncDropdowns: true });
  };

  if (characterSelect._characterChangeHandler) {
    characterSelect.removeEventListener('change', characterSelect._characterChangeHandler);
  }
  characterSelect._characterChangeHandler = onCharacterChange;
  characterSelect.addEventListener('change', onCharacterChange);

  const preferredDefault = characters.player ? 'player' : characterKeys[0] || '';
  const hasPreviousSelection =
    previousSelection && Object.prototype.hasOwnProperty.call(characters, previousSelection);
  const nextSelection = hasPreviousSelection ? previousSelection : preferredDefault;

  if (nextSelection) {
    characterSelect.value = nextSelection;
    onCharacterChange({ target: { value: nextSelection } });
  } else {
    characterSelect.value = '';
    onCharacterChange({ target: { value: '' } });
  }

  console.log('[initCharacterDropdown] Character dropdown initialized with', characterKeys.length, 'characters');
}

function initSelectionDropdowns() {
  initWeaponDropdown();
  initAbilitySlotDropdowns();
  initCharacterDropdown();
  initFighterDropdown();
}

// Initialize dropdowns on page load
window.addEventListener('DOMContentLoaded', () => {
  initSelectionDropdowns();
});
import { initNpcSystems, updateNpcSystems } from './npc.js?v=2';
import { initPresets, ensureAltSequenceUsesKickAlt } from './presets.js?v=6';
import { initFighters } from './fighter.js?v=7';
import { initControls } from './controls.js?v=7';
import { initCombat } from './combat.js?v=19';
import { updatePoses } from './animator.js?v=4';
import { renderAll, LIMB_COLORS } from './render.js?v=4';
import { initCamera, updateCamera } from './camera.js?v=5';
import { initManualZoom } from './manual-zoom.js?v=1';
import { initHitDetect, runHitDetect } from './hitdetect.js?v=1';
import { initSprites, renderSprites } from './sprites.js?v=8';
import { initDebugPanel, updateDebugPanel } from './debug-panel.js?v=1';
import { $$, show } from './dom-utils.js?v=1';
import { initTouchControls } from './touch-controls.js?v=1';
import { initBountySystem, updateBountySystem, getBountyState } from './bounty.js?v=1';

// Setup canvas
const cv = $$('#game');
const stage = $$('#gameStage');
const cx = cv?.getContext('2d');
window.GAME ||= {};
initCamera({ canvas: cv });
initManualZoom({ canvas: cv, stage });

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
  isInCanvas: false, // Whether mouse is over canvas
  hasPosition: false // Whether a real pointer position has been recorded
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
const staminaLabel = $$('#staminaLabel');
const footingLabel = $$('#footingLabel');
const healthLabel = $$('#healthLabel');
const bountyHud = $$('#bountyHud');
const bountyStars = $$('#bountyStars');
const statusInfo = $$('#statusInfo');
const reloadBtn = $$('#btnReloadCfg');
const fullscreenBtn = $$('#btnFullscreen');
const stageEl = document.getElementById('gameStage');
const fpsHud = $$('#fpsHud');
const coordHud = $$('#coordHud');
const boneKeyList = $$('#boneKeyList');
const helpBtn = $$('#btnHelp');
const helpPanel = $$('#helpPanel');

if (helpBtn && helpPanel) {
  const setHelpVisible = (visible) => {
    helpPanel.classList.toggle('visible', visible);
    helpBtn.setAttribute('aria-expanded', visible ? 'true' : 'false');
  };

  helpBtn.addEventListener('click', (e) => {
    e.preventDefault();
    const next = !helpPanel.classList.contains('visible');
    setHelpVisible(next);
  });

  document.addEventListener('click', (event) => {
    if (!helpPanel.contains(event.target) && !helpBtn.contains(event.target)) {
      setHelpVisible(false);
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      setHelpVisible(false);
    }
  });

  setHelpVisible(false);
}

if (reloadBtn){
  reloadBtn.addEventListener('click', async ()=>{
    try {
      if (statusInfo) statusInfo.textContent = 'Reloading config…';
      const previousFighter = window.GAME?.selectedFighter || currentSelectedFighter || null;
      await window.reloadConfig?.();
      initPresets();
      ensureAltSequenceUsesKickAlt();
      applyRenderOrder();
      await initSprites();
      initFighters(cv, cx);
      initSelectionDropdowns();
      if (previousFighter) {
        scheduleFighterPreview(previousFighter);
      }
      scheduleConfigUpdatedEvent();
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
  const previousSelection =
    fighterSelect.value ||
    currentSelectedFighter ||
    window.GAME?.selectedFighter ||
    null;

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

  const hasPreviousSelection =
    previousSelection && Object.prototype.hasOwnProperty.call(fighters, previousSelection);

  if (hasPreviousSelection) {
    fighterSelect.value = previousSelection;
    currentSelectedFighter = previousSelection;
    window.GAME ||= {};
    window.GAME.selectedFighter = previousSelection;
    showFighterSettings(previousSelection);
  } else {
    fighterSelect.value = '';
    if (!previousSelection) {
      hideFighterSettings();
    }
  }

  // Handle selection change
  if (!fighterSelect.dataset.initialized) {
    fighterSelect.addEventListener('change', (e) => {
      const selectedFighter = e.target.value;
      currentSelectedFighter = selectedFighter;
      window.GAME ||= {};
      const previousPaletteFighter = window.GAME.selectedBodyColorsFighter;
      window.GAME.selectedFighter = selectedFighter;
      if (!selectedFighter) {
        delete window.GAME.selectedBodyColors;
        delete window.GAME.selectedBodyColorsFighter;
        delete window.GAME.selectedCosmetics;
        delete window.GAME.selectedAppearance;
        hideFighterSettings();
        return;
      }

      if (previousPaletteFighter && previousPaletteFighter !== selectedFighter) {
        delete window.GAME.selectedBodyColors;
        delete window.GAME.selectedBodyColorsFighter;
      }
      delete window.GAME.selectedCosmetics;
      delete window.GAME.selectedAppearance;

      showFighterSettings(selectedFighter);
    });
    fighterSelect.dataset.initialized = 'true';
  }

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
    initNpcSystems();
    
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
    initNpcSystems();
    
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
  lines.push('})();');

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
  if (S && staminaFill){
    const ratio = S.max ? Math.max(0, Math.min(1, S.current / S.max)) : 0;
    const pct = Math.round(ratio * 100);
    staminaFill.style.width = `${pct}%`;
    staminaFill.classList.toggle('low', ratio <= 0.25);
    staminaFill.classList.toggle('dashing', !!S.isDashing);
    if (staminaLabel){
      staminaLabel.textContent = `Stamina ${pct}%`;
    }
  } else if (staminaLabel){
    staminaLabel.textContent = 'Stamina';
  }

  if (footingFill){
    const footing = Math.round(Math.max(0, Math.min(100, P.footing ?? 0)));
    footingFill.style.width = `${footing}%`;
    if (footingLabel){
      footingLabel.textContent = `Footing ${footing}%`;
    }
  } else if (footingLabel){
    footingLabel.textContent = 'Footing';
  }

  if (healthFill){
    const health = P.health;
    if (health){
      const max = Number.isFinite(health.max) ? health.max : 100;
      const current = Number.isFinite(health.current) ? Math.max(0, Math.min(health.current, max)) : max;
      const ratio = max > 0 ? current / max : 0;
      const pct = Math.round(ratio * 100);
      healthFill.style.width = `${pct}%`;
      if (healthLabel){
        healthLabel.textContent = `HP: ${current}/${max}`;
      }
    } else {
      healthFill.style.width = '100%';
      if (healthLabel){
        healthLabel.textContent = 'HP: 100';
      }
    }
  }

  if (coordHud) {
    const fmt = (value) => (Number.isFinite(value) ? value.toFixed(1) : '—');
    const pos = P.pos || {};
    const spawn = window.GAME?.spawnPoints?.player || {};
    const playerText = `Player: (${fmt(pos.x)}, ${fmt(pos.y)})`;
    const spawnText = `Spawn: (${fmt(spawn.x)}, ${fmt(spawn.y)})`;
    coordHud.textContent = `${playerText} | ${spawnText}`;
  }

  if (bountyHud) {
    const bounty = getBountyState();
    const maxStarsConfig = Number.isFinite(window.CONFIG?.bounty?.maxStars)
      ? window.CONFIG.bounty.maxStars
      : 5;
    const maxStars = Math.max(1, maxStarsConfig);
    const activeStars = Math.max(0, Math.min(maxStars, Math.round(bounty?.stars || 0)));
    if (bounty && (bounty.active || activeStars > 0)) {
      const filled = '★'.repeat(activeStars);
      const empty = '☆'.repeat(Math.max(0, maxStars - activeStars));
      if (bountyStars) {
        bountyStars.textContent = `${filled}${empty}`;
      }
      bountyHud.classList.add('active');
      bountyHud.classList.toggle('cooldown', !bounty.active && activeStars > 0);
    } else {
      bountyHud.classList.remove('active');
      bountyHud.classList.remove('cooldown');
      if (bountyStars) bountyStars.textContent = '';
    }
  }
}

function resolveActiveParallaxArea() {
  const parallax = window.PARALLAX;
  if (parallax?.currentAreaId && parallax?.areas) {
    return parallax.areas[parallax.currentAreaId] || null;
  }
  const registry = window.GAME?.mapRegistry;
  if (registry?.getActiveArea) {
    try {
      return registry.getActiveArea();
    } catch (_err) {
      return null;
    }
  }
  return null;
}

const LAYER_DEBUG_COLORS = {
  parallax: '#1f2937',
  background: '#0f172a',
  gameplay: '#1f3b4d',
  foreground: '#334155',
};

function pickLayerDebugColor(layer, index) {
  const type = (layer?.type || '').toString().toLowerCase();
  const base = LAYER_DEBUG_COLORS[type] || '#1f2937';
  if (!base.startsWith('#') || base.length !== 7) return base;
  const shade = Math.max(0, Math.min(0xff, 0x20 + index * 16));
  const component = shade.toString(16).padStart(2, '0');
  return `#${component}${base.slice(3, 5)}${base.slice(5)}`;
}

function drawEditorPreviewMap(cx, { camX, groundY }) {
  const area = resolveActiveParallaxArea();
  if (!area) return;

  const layers = Array.isArray(area.layers) ? [...area.layers] : [];
  if (!layers.length) return;

  const instancesByLayer = new Map();
  if (Array.isArray(area.instances)) {
    for (const inst of area.instances) {
      const layerId = inst?.layerId;
      if (!layerId) continue;
      const list = instancesByLayer.get(layerId) || [];
      list.push(inst);
      instancesByLayer.set(layerId, list);
    }
  }

  layers.sort((a, b) => (a?.z ?? 0) - (b?.z ?? 0));

  layers.forEach((layer, index) => {
    const layerId = layer?.id;
    if (!layerId) return;
    const instances = instancesByLayer.get(layerId);
    if (!instances?.length) return;

    const parallax = Number.isFinite(layer?.parallax) ? layer.parallax : 1;
    const yOffset = Number(layer?.yOffset) || 0;
    const scale = Number.isFinite(layer?.scale) ? layer.scale : 1;
    const tint = pickLayerDebugColor(layer, index);

    cx.save();
    cx.translate((1 - parallax) * camX, yOffset);
    cx.globalAlpha = layer?.type === 'foreground' ? 0.55 : 0.42;
    cx.fillStyle = tint;
    cx.strokeStyle = 'rgba(148, 163, 184, 0.45)';
    cx.lineWidth = 1.5;

    for (const inst of instances) {
      const pos = inst?.position || {};
      const x = Number(pos.x) || 0;
      const y = Number(pos.y) || 0;
      const scaleX = Number.isFinite(inst?.scale?.x) ? inst.scale.x : (Number.isFinite(inst?.scale?.y) ? inst.scale.y : 1);
      const scaleY = Number.isFinite(inst?.scale?.y) ? inst.scale.y : scaleX;

      const baseWidth = Number(inst?.meta?.original?.w || inst?.meta?.original?.width) || 120;
      const baseHeight = Number(inst?.meta?.original?.h || inst?.meta?.original?.height) || 80;
      const width = Math.max(24, baseWidth * scale * scaleX);
      const height = Math.max(12, baseHeight * scale * scaleY);

      const left = x - width / 2;
      const top = groundY + y - height;

      cx.fillRect(left, top, width, height);
      cx.strokeRect(left, top, width, height);
    }

    cx.restore();
  });
}

function drawStage(){
  if (!cx) return;
  const C = window.CONFIG || {};
  const camera = window.GAME?.CAMERA || {};
  const camX = camera.x || 0;
  const worldW = camera.worldWidth || 1600;
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : 1;
  cx.clearRect(0,0,cv.width,cv.height);
  cx.fillStyle = '#0b1220';
  cx.fillRect(0,0,cv.width,cv.height);
  // ground (with camera offset)
  const gy = (C.canvas?.h||460) * (C.groundRatio||0.7);
  cx.save();
  cx.setTransform(zoom, 0, 0, zoom, -zoom * camX, cv.height * (1 - zoom));

  drawEditorPreviewMap(cx, { camX, groundY: gy });

  cx.strokeStyle = 'rgba(255,255,255,.15)';
  cx.beginPath(); cx.moveTo(0, gy); cx.lineTo(worldW, gy); cx.stroke();

  const preview = window.GAME?.editorPreview;
  const collider = preview?.groundCollider;
  if (collider) {
    const left = Number.isFinite(collider.left) ? collider.left : 0;
    const width = Number.isFinite(collider.width)
      ? collider.width
      : (Number.isFinite(collider.right) ? collider.right - left : null);
    const top = Number.isFinite(collider.top) ? collider.top : gy;
    const height = Number.isFinite(collider.height)
      ? collider.height
      : Math.max(48, (preview?.groundOffset ?? 140) + 24);
    if (width && width > 0 && Number.isFinite(height) && height > 0) {
      const right = left + width;
      const bottom = top + height;
      cx.save();
      cx.setLineDash([8, 6]);
      cx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      cx.lineWidth = 2;
      cx.strokeRect(left, top, width, height);
      cx.setLineDash([4, 4]);
      cx.beginPath();
      cx.moveTo(left, top);
      cx.lineTo(right, top);
      cx.moveTo(left, bottom);
      cx.lineTo(right, bottom);
      cx.stroke();
      cx.restore();
    }
  }
  const previewColliders = Array.isArray(preview?.platformColliders)
    ? preview.platformColliders
    : [];
  if (previewColliders.length) {
    cx.save();
    cx.lineWidth = 1.5;
    for (const col of previewColliders) {
      const left = Number(col.left);
      const width = Number(col.width);
      const topOffset = Number(col.topOffset);
      const height = Number(col.height);
      if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) continue;
      if (!Number.isFinite(height) || height <= 0) continue;
      const top = gy + (Number.isFinite(topOffset) ? topOffset : 0);
      const fill = 'rgba(96, 165, 250, 0.18)';
      const stroke = 'rgba(96, 165, 250, 0.55)';
      cx.fillStyle = fill;
      cx.strokeStyle = stroke;
      cx.fillRect(left, top, width, height);
      cx.strokeRect(left, top, width, height);
      if (col.label && typeof col.label === 'string' && col.label.trim()) {
        cx.save();
        cx.fillStyle = '#bfdbfe';
        const fontSize = Math.max(9, 12 / Math.max(zoom, 0.5));
        cx.font = `${fontSize}px ui-monospace,Menlo,Consolas`;
        cx.textBaseline = 'top';
        cx.fillText(col.label.trim(), left + 6, top + 4);
        cx.restore();
      }
    }
    cx.restore();
  }
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
  updateNpcSystems(dt);
  updateBountySystem(dt);
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
  const pixelX = (e.clientX - rect.left) * scaleX;
  const pixelY = (e.clientY - rect.top) * scaleY;
  window.GAME.MOUSE.x = pixelX;
  window.GAME.MOUSE.y = pixelY;
  // World coordinates account for camera offset and zoom
  const camera = window.GAME?.CAMERA || {};
  const camX = camera.x || 0;
  const zoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : 1, 1e-4);
  const verticalOffset = cv.height * (1 - zoom);
  window.GAME.MOUSE.worldX = pixelX / zoom + camX;
  window.GAME.MOUSE.worldY = (pixelY - verticalOffset) / zoom;
  window.GAME.MOUSE.hasPosition = true;
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
    initNpcSystems();
    initBountySystem();
    initControls();
    initCombat();
    initHitDetect();
    initDebugPanel();
    initTouchControls();
    initSelectionDropdowns();
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
