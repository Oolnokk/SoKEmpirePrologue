const ROOT = typeof window !== 'undefined' ? window : globalThis;
const CONFIG = ROOT.CONFIG || {};
const overlay = typeof document !== 'undefined' ? document.getElementById('loadoutOverlay') : null;
const statusEl = overlay ? overlay.querySelector('#loadoutStatus') : null;
const entryTextarea = overlay ? overlay.querySelector('#loadoutEntry') : null;
const characterSelect = overlay ? overlay.querySelector('#loadoutCharacter') : null;
const fighterSelect = overlay ? overlay.querySelector('#loadoutFighter') : null;
const weaponSelect = overlay ? overlay.querySelector('#loadoutWeapon') : null;
const formEl = overlay ? overlay.querySelector('#loadoutForm') : null;
const slotContainers = overlay ? Array.from(overlay.querySelectorAll('.loadout-slot')) : [];
const bodyColorInputs = overlay ? Array.from(overlay.querySelectorAll('.loadout-bodycolor')) : [];
const CUSTOM_CHARACTER_KEY = '__custom__';
const DEFAULT_CHARACTER_KEY = (() => {
  const characterKeys = Object.keys(CONFIG.characters || {});
  if (characterKeys.includes('player')) return 'player';
  return characterKeys[0] || CUSTOM_CHARACTER_KEY;
})();
const DEFAULT_CHARACTER = cloneCharacter(CONFIG.characters?.[DEFAULT_CHARACTER_KEY] || {});

let selectedCharacterKey = DEFAULT_CHARACTER_KEY;
let loadout = cloneCharacter(DEFAULT_CHARACTER);
let resolveReady;
let isResolved = false;

const readyPromise = new Promise((resolve) => {
  resolveReady = resolve;
});

function resolveStage() {
  if (isResolved) return readyPromise;
  isResolved = true;
  if (typeof resolveReady === 'function') {
    resolveReady();
  }
  return readyPromise;
}

function cloneCharacter(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    const copy = Array.isArray(value) ? [] : {};
    for (const [key, val] of Object.entries(value)) {
      if (val && typeof val === 'object') {
        copy[key] = cloneCharacter(val);
      } else {
        copy[key] = val;
      }
    }
    return copy;
  }
}

function ensureSlots(target) {
  if (!target || typeof target !== 'object') {
    return {};
  }
  target.cosmetics ||= {};
  target.cosmetics.slots ||= {};
  return target.cosmetics.slots;
}

function ensureBodyColors(target) {
  if (!target || typeof target !== 'object') {
    return {};
  }
  target.bodyColors ||= {};
  return target.bodyColors;
}

function setStatus(message, { tone = 'info' } = {}) {
  if (!statusEl) return;
  statusEl.textContent = message || '';
  statusEl.dataset.tone = tone;
}

function formatNumber(value, { precision = 2 } = {}) {
  if (!Number.isFinite(value)) return '';
  const factor = 10 ** precision;
  return String(Math.round(value * factor) / factor);
}

function updateEntryPreview() {
  if (!entryTextarea) return;
  try {
    entryTextarea.value = JSON.stringify(loadout, null, 2);
  } catch (error) {
    console.warn('[loadout-stage] Failed to serialize loadout', error);
  }
}

function populateFighterSelect() {
  if (!fighterSelect) return;
  fighterSelect.innerHTML = '';
  const fighters = CONFIG.fighters || {};
  const fighterKeys = Object.keys(fighters);
  if (!fighterKeys.includes(loadout.fighter || '') && loadout.fighter) {
    fighterKeys.push(loadout.fighter);
  }
  fighterKeys.sort();
  const fragment = document.createDocumentFragment();
  fighterKeys.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    fragment.appendChild(option);
  });
  fighterSelect.appendChild(fragment);
  const selected = loadout.fighter || fighterSelect.options[0]?.value || '';
  fighterSelect.value = selected;
  loadout.fighter = fighterSelect.value || selected || null;
}

function populateCharacterSelect() {
  if (!characterSelect) return;
  characterSelect.innerHTML = '';
  const characters = CONFIG.characters || {};
  const characterKeys = Object.keys(characters);
  if (selectedCharacterKey && selectedCharacterKey !== CUSTOM_CHARACTER_KEY && !characterKeys.includes(selectedCharacterKey)) {
    characterKeys.push(selectedCharacterKey);
  }
  characterKeys.sort();
  const fragment = document.createDocumentFragment();
  characterKeys.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    fragment.appendChild(option);
  });

  const customOption = document.createElement('option');
  customOption.value = CUSTOM_CHARACTER_KEY;
  customOption.textContent = 'Custom entry';
  fragment.appendChild(customOption);

  characterSelect.appendChild(fragment);

  const preferred = characterKeys.includes(selectedCharacterKey)
    ? selectedCharacterKey
    : characterKeys.includes(DEFAULT_CHARACTER_KEY)
      ? DEFAULT_CHARACTER_KEY
      : CUSTOM_CHARACTER_KEY;
  characterSelect.value = preferred;
  selectedCharacterKey = characterSelect.value || preferred;
}

function populateWeaponSelect() {
  if (!weaponSelect) return;
  weaponSelect.innerHTML = '';
  const weapons = CONFIG.weapons || {};
  const weaponKeys = Object.keys(weapons);
  if (!weaponKeys.includes(loadout.weapon || '') && loadout.weapon) {
    weaponKeys.push(loadout.weapon);
  }
  weaponKeys.sort();
  const fragment = document.createDocumentFragment();
  weaponKeys.forEach((key) => {
    const option = document.createElement('option');
    option.value = key;
    option.textContent = key;
    fragment.appendChild(option);
  });
  weaponSelect.appendChild(fragment);
  const preferred = loadout.weapon || 'unarmed';
  const hasPreferred = preferred
    && Array.from(weaponSelect.options).some((option) => option.value === preferred);
  const selected = hasPreferred ? preferred : (weaponSelect.options[0]?.value || '');
  weaponSelect.value = selected;
  loadout.weapon = weaponSelect.value || selected || null;
}

function hydrateBodyColorInputs() {
  if (!bodyColorInputs.length) return;
  const colors = loadout.bodyColors || {};
  bodyColorInputs.forEach((container) => {
    const channel = container.dataset.channel;
    const values = (channel && colors[channel]) || {};
    const inputH = container.querySelector('input[id$="_h"]');
    const inputS = container.querySelector('input[id$="_s"]');
    const inputV = container.querySelector('input[id$="_v"]');
    if (inputH) inputH.value = values.h != null ? formatNumber(values.h, { precision: 2 }) : '';
    if (inputS) inputS.value = values.s != null ? formatNumber(values.s, { precision: 3 }) : '';
    if (inputV) inputV.value = values.v != null ? formatNumber(values.v, { precision: 3 }) : '';
  });
}

function hydrateSlotInputs() {
  if (!slotContainers.length) return;
  const slots = (loadout.cosmetics && loadout.cosmetics.slots) || {};
  slotContainers.forEach((container) => {
    const slotKey = container.dataset.slot;
    const slotData = slotKey ? slots[slotKey] : null;
    const idInput = container.querySelector('[data-slot-input="id"]');
    const hInput = container.querySelector('[data-slot-input="h"]');
    const sInput = container.querySelector('[data-slot-input="s"]');
    const vInput = container.querySelector('[data-slot-input="v"]');
    const hsv = slotData && slotData.hsv ? slotData.hsv : {};
    if (idInput) idInput.value = slotData?.id || '';
    if (hInput) hInput.value = hsv.h != null ? formatNumber(hsv.h, { precision: 2 }) : '';
    if (sInput) sInput.value = hsv.s != null ? formatNumber(hsv.s, { precision: 3 }) : '';
    if (vInput) vInput.value = hsv.v != null ? formatNumber(hsv.v, { precision: 3 }) : '';
  });
}

function hydrateForm() {
  populateCharacterSelect();
  populateFighterSelect();
  populateWeaponSelect();
  hydrateBodyColorInputs();
  hydrateSlotInputs();
  updateEntryPreview();
}

function parseNumberInput(value) {
  if (value === '' || value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function onBodyColorChange(channel, component, inputEl) {
  if (!channel || !component) return;
  const value = parseNumberInput(inputEl.value);
  const colors = ensureBodyColors(loadout);
  if (value === null || Number.isNaN(value)) {
    if (colors[channel]) {
      delete colors[channel][component];
      if (!Object.keys(colors[channel]).length) {
        delete colors[channel];
      }
    }
  } else {
    colors[channel] ||= {};
    colors[channel][component] = value;
  }
  if (!Object.keys(colors).length) {
    delete loadout.bodyColors;
  }
  updateEntryPreview();
}

function onSlotInputChange(slotKey, part, inputEl) {
  if (!slotKey || !part) return;
  const slots = ensureSlots(loadout);
  const current = slots[slotKey] ||= { id: '' };
  if (part === 'id') {
    const id = inputEl.value.trim();
    if (!id) {
      delete slots[slotKey];
      if (!Object.keys(slots).length) {
        delete loadout.cosmetics;
      }
    } else {
      current.id = id;
    }
  } else {
    current.id ||= '';
    current.hsv ||= {};
    const value = parseNumberInput(inputEl.value);
    if (value === null) {
      delete current.hsv[part];
    } else {
      current.hsv[part] = value;
    }
    if (current.hsv && !Object.keys(current.hsv).length) {
      delete current.hsv;
    }
  }
  updateEntryPreview();
}

function clearSlot(slotKey) {
  const slots = ensureSlots(loadout);
  delete slots[slotKey];
  if (!Object.keys(slots).length) {
    delete loadout.cosmetics;
  }
  hydrateSlotInputs();
  updateEntryPreview();
}

function bindEvents() {
  if (characterSelect) {
    characterSelect.addEventListener('change', (event) => {
      const selected = event.target.value || CUSTOM_CHARACTER_KEY;
      selectedCharacterKey = selected;
      if (selected === CUSTOM_CHARACTER_KEY) {
        setStatus('Custom entry selected. Adjust fields or paste a loadout.', { tone: 'info' });
        updateEntryPreview();
        return;
      }
      const characters = CONFIG.characters || {};
      const selectedCharacter = characters[selected];
      loadout = cloneCharacter(selectedCharacter || {});
      hydrateForm();
      setStatus(`Loaded character "${selected}" from config.`, { tone: 'success' });
    });
  }

  if (fighterSelect) {
    fighterSelect.addEventListener('change', (event) => {
      loadout.fighter = event.target.value || null;
      updateEntryPreview();
    });
  }

  if (weaponSelect) {
    weaponSelect.addEventListener('change', (event) => {
      loadout.weapon = event.target.value || null;
      updateEntryPreview();
    });
  }

  bodyColorInputs.forEach((container) => {
    const channel = container.dataset.channel;
    const inputH = container.querySelector('input[id$="_h"]');
    const inputS = container.querySelector('input[id$="_s"]');
    const inputV = container.querySelector('input[id$="_v"]');
    if (inputH) {
      inputH.addEventListener('input', () => onBodyColorChange(channel, 'h', inputH));
    }
    if (inputS) {
      inputS.addEventListener('input', () => onBodyColorChange(channel, 's', inputS));
    }
    if (inputV) {
      inputV.addEventListener('input', () => onBodyColorChange(channel, 'v', inputV));
    }
  });

  slotContainers.forEach((container) => {
    const slotKey = container.dataset.slot;
    const idInput = container.querySelector('[data-slot-input="id"]');
    const hInput = container.querySelector('[data-slot-input="h"]');
    const sInput = container.querySelector('[data-slot-input="s"]');
    const vInput = container.querySelector('[data-slot-input="v"]');
    const clearBtn = container.querySelector('[data-slot-action="clear"]');
    if (idInput) {
      idInput.addEventListener('input', () => onSlotInputChange(slotKey, 'id', idInput));
    }
    if (hInput) {
      hInput.addEventListener('input', () => onSlotInputChange(slotKey, 'h', hInput));
    }
    if (sInput) {
      sInput.addEventListener('input', () => onSlotInputChange(slotKey, 's', sInput));
    }
    if (vInput) {
      vInput.addEventListener('input', () => onSlotInputChange(slotKey, 'v', vInput));
    }
    if (clearBtn) {
      clearBtn.addEventListener('click', () => clearSlot(slotKey));
    }
  });

  if (formEl) {
    formEl.addEventListener('submit', (event) => {
      event.preventDefault();
    });
  }

  if (overlay) {
    overlay.addEventListener('click', (event) => {
      if (event.target === overlay) {
        setStatus('Click "Start Demo" to continue into the game.', { tone: 'info' });
      }
    });
  }

  if (entryTextarea) {
    entryTextarea.addEventListener('input', () => {
      setStatus('Entry changed – click "Apply From Entry" to load it.', { tone: 'info' });
    });
  }

  if (overlay) {
    overlay.querySelector('[data-action="copy-entry"]')?.addEventListener('click', async () => {
      if (!entryTextarea) return;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(entryTextarea.value);
        } else {
          entryTextarea.select();
          document.execCommand('copy');
          entryTextarea.setSelectionRange(entryTextarea.value.length, entryTextarea.value.length);
        }
        setStatus('Character entry copied to clipboard.', { tone: 'success' });
      } catch (error) {
        console.warn('[loadout-stage] Clipboard copy failed', error);
        setStatus('Unable to copy to clipboard. Select the text manually.', { tone: 'warning' });
      }
    });

    overlay.querySelector('[data-action="apply-entry"]')?.addEventListener('click', () => {
      if (!entryTextarea) return;
      try {
        const parsed = JSON.parse(entryTextarea.value);
        if (!parsed || typeof parsed !== 'object') {
          throw new Error('Entry must be an object');
        }
        loadout = cloneCharacter(parsed);
        selectedCharacterKey = CUSTOM_CHARACTER_KEY;
        hydrateForm();
        setStatus('Entry applied successfully.', { tone: 'success' });
      } catch (error) {
        console.warn('[loadout-stage] Failed to apply entry', error);
        setStatus('Unable to parse entry. Ensure it is valid JSON.', { tone: 'error' });
      }
    });

    overlay.querySelector('[data-action="reset-defaults"]')?.addEventListener('click', () => {
      selectedCharacterKey = DEFAULT_CHARACTER_KEY;
      loadout = cloneCharacter(CONFIG.characters?.[selectedCharacterKey] || DEFAULT_CHARACTER || {});
      hydrateForm();
      setStatus('Reset to default player configuration.', { tone: 'info' });
    });

    overlay.querySelector('[data-action="launch"]')?.addEventListener('click', () => {
      applyLoadoutToConfig();
      hideOverlay();
      setStatus('Starting demo with configured loadout…', { tone: 'success' });
      resolveStage();
    });
  }
}

function applyLoadoutToConfig() {
  ROOT.CONFIG ||= {};
  ROOT.CONFIG.characters ||= {};
  ROOT.CONFIG.characters.player = cloneCharacter(loadout);
  ROOT.GAME ||= {};
  ROOT.GAME.selectedCharacter = selectedCharacterKey === CUSTOM_CHARACTER_KEY ? 'player' : selectedCharacterKey;
  ROOT.GAME.selectedFighter = loadout.fighter || null;
  if (loadout.bodyColors) {
    try {
      ROOT.GAME.selectedBodyColors = JSON.parse(JSON.stringify(loadout.bodyColors));
    } catch (_err) {
      ROOT.GAME.selectedBodyColors = cloneCharacter(loadout.bodyColors);
    }
    ROOT.GAME.selectedBodyColorsFighter = loadout.fighter || null;
  } else {
    delete ROOT.GAME.selectedBodyColors;
    delete ROOT.GAME.selectedBodyColorsFighter;
  }
  if (loadout.cosmetics) {
    try {
      ROOT.GAME.selectedCosmetics = JSON.parse(JSON.stringify(loadout.cosmetics));
    } catch (_err) {
      ROOT.GAME.selectedCosmetics = cloneCharacter(loadout.cosmetics);
    }
  } else {
    delete ROOT.GAME.selectedCosmetics;
  }
  ROOT.GAME.selectedWeapon = loadout.weapon || null;
}

function hideOverlay() {
  if (!overlay) return;
  overlay.classList.remove('loadout-overlay--visible');
  overlay.hidden = true;
}

function showOverlay() {
  if (!overlay) {
    resolveStage();
    return;
  }
  hydrateForm();
  overlay.hidden = false;
  overlay.classList.add('loadout-overlay--visible');
  setStatus('Configure your fighter and click "Start Demo".', { tone: 'info' });
  const initialFocus = characterSelect || fighterSelect;
  if (initialFocus) {
    requestAnimationFrame(() => {
      try {
        initialFocus.focus();
      } catch (_err) {
        // ignore focus errors
      }
    });
  }
}

function init() {
  if (!overlay || ROOT.__skipLoadoutStage) {
    resolveStage();
    return;
  }
  bindEvents();
  hydrateForm();
  hideOverlay();
  setStatus('');
}

if (!ROOT.__waitForLoadoutReady) {
  ROOT.__waitForLoadoutReady = () => readyPromise;
} else {
  const previous = ROOT.__waitForLoadoutReady;
  ROOT.__waitForLoadoutReady = async () => {
    await previous();
    await readyPromise;
  };
}

ROOT.__resolveLoadoutStage = resolveStage;
ROOT.__showLoadoutOverlay = showOverlay;

init();

export {};
