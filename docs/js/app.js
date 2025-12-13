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

function computeGroundYFromConfig(config = {}, canvasHeightOverride) {
  const explicit = Number.isFinite(config?.groundY) ? config.groundY : null;
  const canvasHeight = Number.isFinite(canvasHeightOverride)
    ? canvasHeightOverride
    : (Number.isFinite(config?.canvas?.h) ? config.canvas.h : 460);
  if (explicit != null) return explicit;
  const offset = Number(config?.ground?.offset);
  if (Number.isFinite(offset)) {
    return Math.round(canvasHeight - offset);
  }
  const ratioRaw = Number(config?.groundRatio);
  const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 && ratioRaw < 1
    ? ratioRaw
    : 0.7;
  return Math.round(canvasHeight * ratio);
}

const BACKGROUND_DEFAULTS = {
  skyColors: [
    'rgba(59,63,69,0.9)',
    'rgba(80,89,96,0.5)',
    'rgba(32,38,50,0.0)',
  ],
  tilePortion: 0,
  tileScale: 1,
  tileOffsetY: 0,
  time24h: 12,
};

const BACKGROUND_STORE_FALLBACK = {};
const BACKGROUND_GLOBAL_KEY = '__global__';

const colorParserCtx = typeof document !== 'undefined'
  ? document.createElement('canvas').getContext('2d')
  : null;

function parseCssColor(color) {
  if (!colorParserCtx || !color) return null;
  try {
    colorParserCtx.fillStyle = '#000';
    colorParserCtx.fillStyle = color;
    const normalized = colorParserCtx.fillStyle;
    const match = normalized.match(
      /^rgba?\((\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)[ ,]+(\d+(?:\.\d+)?)(?:[ ,]+([0-9.]+))?\)$/
    );
    if (!match) return null;
    return {
      r: Number(match[1]),
      g: Number(match[2]),
      b: Number(match[3]),
      a: match[4] != null ? Number(match[4]) : 1,
    };
  } catch (_e) {
    return null;
  }
}

function lerpCssColor(a, b, t) {
  const start = parseCssColor(a);
  const end = parseCssColor(b);
  const amt = Number.isFinite(t) ? Math.min(Math.max(t, 0), 1) : 0;
  if (!start || !end) return a || b;
  const lerp = (x, y) => x + (y - x) * amt;
  const r = Math.round(lerp(start.r, end.r));
  const g = Math.round(lerp(start.g, end.g));
  const bCh = Math.round(lerp(start.b, end.b));
  const aCh = lerp(start.a, end.a);
  return `rgba(${r}, ${g}, ${bCh}, ${Number(aCh.toFixed(3))})`;
}

function sampleDayCycleColor(colors, time24h, offset = 0) {
  const palette = Array.isArray(colors) && colors.length >= 3
    ? colors
    : BACKGROUND_DEFAULTS.skyColors;
  const normalized = ((Number(time24h) + offset) % 24 + 24) % 24;
  if (normalized < 8) {
    return lerpCssColor(palette[0], palette[1], normalized / 8);
  }
  if (normalized < 16) {
    return lerpCssColor(palette[1], palette[2], (normalized - 8) / 8);
  }
  return lerpCssColor(palette[2], palette[0], (normalized - 16) / 8);
}

function computeSkyGradientStops(background) {
  const time = Number.isFinite(background?.sky?.time24h)
    ? background.sky.time24h
    : BACKGROUND_DEFAULTS.time24h;
  const colors = background?.sky?.colors;
  return {
    top: sampleDayCycleColor(colors, time, -1.5),
    mid: sampleDayCycleColor(colors, time, 0),
    bottom: sampleDayCycleColor(colors, time, 1.5),
  };
}

function getBackgroundStore() {
  if (typeof window !== 'undefined') {
    window.__BACKGROUND_BY_AREA__ = window.__BACKGROUND_BY_AREA__ || {};
    return window.__BACKGROUND_BY_AREA__;
  }
  return BACKGROUND_STORE_FALLBACK;
}

function normalizeBackgroundConfig(source = null, existing = null) {
  const target = typeof existing === 'object' && existing ? { ...existing } : {};
  const layout = (target.layout = typeof source?.layout === 'object' && source.layout ? { ...source.layout } : (target.layout || {}));
  const sky = (target.sky = typeof source?.sky === 'object' && source.sky ? { ...source.sky } : (target.sky || {}));
  const tiles = (target.tiles = typeof source?.tiles === 'object' && source.tiles ? { ...source.tiles } : (target.tiles || {}));

  const skyColors = Array.isArray(sky.colors) && sky.colors.length >= 3
    ? sky.colors.slice(0, 3)
    : BACKGROUND_DEFAULTS.skyColors;
  sky.colors = skyColors;
  sky.time24h = clampValue(
    coerceFiniteNumber(sky.time24h ?? source?.time24h ?? BACKGROUND_DEFAULTS.time24h) ?? BACKGROUND_DEFAULTS.time24h,
    0,
    24,
  );

  const portionCandidate = layout.tilePortion ?? tiles.heightRatio ?? tiles.portion ?? BACKGROUND_DEFAULTS.tilePortion;
  layout.tilePortion = clampValue(coerceFiniteNumber(portionCandidate) ?? BACKGROUND_DEFAULTS.tilePortion, 0, 1);

  const tileUrl = typeof tiles.url === 'string'
    ? tiles.url
    : (typeof tiles.imageUrl === 'string' ? tiles.imageUrl : null);
  tiles.url = tileUrl;
  tiles.imageUrl = tileUrl;
  tiles.scale = clampValue(coerceFiniteNumber(tiles.scale ?? tiles.tileScale ?? BACKGROUND_DEFAULTS.tileScale) ?? BACKGROUND_DEFAULTS.tileScale, 0.05, 10);
  tiles.offsetY = coerceFiniteNumber(tiles.offsetY ?? tiles.tileOffsetY ?? BACKGROUND_DEFAULTS.tileOffsetY) || 0;
  if (typeof tiles.fallbackColor !== 'string') {
    tiles.fallbackColor = null;
  }

  return target;
}

function ensureBackgroundConfig(raw = null, areaId = null) {
  const store = getBackgroundStore();
  const key = areaId || BACKGROUND_GLOBAL_KEY;
  const existing = store[key];
  const normalized = normalizeBackgroundConfig(raw ?? existing ?? (!areaId && typeof window !== 'undefined' ? window.BACKGROUND : null), existing);
  store[key] = normalized;
  if (!areaId && typeof window !== 'undefined') {
    window.BACKGROUND = normalized;
  }
  return normalized;
}

function resolveAreaById(areaId = null) {
  if (areaId) {
    const registryArea = (() => {
      const registry = window.GAME?.mapRegistry;
      if (registry && typeof registry.getArea === 'function') {
        try {
          return registry.getArea(areaId);
        } catch (error) {
          console.warn?.('[backgrounds] Failed to resolve area by id via registry', error);
        }
      }
      return null;
    })();
    if (registryArea) return registryArea;
    // Fallback to CONFIG.areas (preferred) or legacy PARALLAX (deprecated)
    const configArea = window.CONFIG?.areas?.[areaId];
    if (configArea) return configArea;
    const parallaxArea = window.PARALLAX?.areas?.[areaId];
    if (parallaxArea) {
      if (!window.__PARALLAX_READ_DEPRECATION_LOGGED) {
        console.warn('[app.js] Reading from window.PARALLAX is deprecated. Use window.CONFIG.areas or MapRegistry instead. See docs/NOTICE_PARALLAX_REMOVAL.md');
        window.__PARALLAX_READ_DEPRECATION_LOGGED = true;
      }
      return parallaxArea;
    }
  }
  return resolveActiveParallaxArea();
}

function resolveBackgroundForArea(areaId = null) {
  const store = getBackgroundStore();
  const area = resolveAreaById(areaId);
  const key = area?.id || areaId || null;
  const source = (typeof area?.background === 'object' && area.background)
    || (typeof area?.meta?.background === 'object' && area.meta.background)
    || (key && typeof window.CONFIG?.areas?.[key]?.background === 'object' && window.CONFIG.areas[key].background)
    || store[key]
    || (!key ? window.BACKGROUND : null)
    || window.BACKGROUND;
  return ensureBackgroundConfig(source, key || null);
}

function setBackgroundTime24h(value, areaId = null) {
  const area = resolveAreaById(areaId);
  const background = resolveBackgroundForArea(area?.id || areaId || null);
  const time = clampValue(coerceFiniteNumber(value) ?? background.sky.time24h ?? BACKGROUND_DEFAULTS.time24h, 0, 24);
  background.sky.time24h = time;

  const targetKey = area?.id || areaId || null;
  if (area) {
    area.background = normalizeBackgroundConfig(area.background || background, area.background || {});
    area.background.sky.time24h = time;
  }
  if (targetKey && window.CONFIG?.areas?.[targetKey]) {
    window.CONFIG.areas[targetKey].background = normalizeBackgroundConfig(window.CONFIG.areas[targetKey].background || background, window.CONFIG.areas[targetKey].background || {});
    window.CONFIG.areas[targetKey].background.sky.time24h = time;
  }

  return background.sky.time24h;
}

if (typeof window !== 'undefined') {
  window.setBackgroundTime24h = setBackgroundTime24h;
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

function setConfigCurrentWeapon(value) {
  window.CONFIG ||= {};
  window.CONFIG.knockback ||= {};
  window.CONFIG.knockback.currentWeapon = value || 'unarmed';
}

function applyWeaponDrawnState(target, weaponDrawn) {
  if (!target || typeof target !== 'object') return;
  const resolved = weaponDrawn != null
    ? !!weaponDrawn
    : (typeof target.weaponDrawn === 'boolean' ? target.weaponDrawn : true);
  target.weaponDrawn = resolved;
  target.renderProfile ||= {};
  target.renderProfile.weaponDrawn = resolved;
  target.renderProfile.weaponStowed = !resolved;
  if (target.renderProfile.character && typeof target.renderProfile.character === 'object') {
    target.renderProfile.character.weaponDrawn = resolved;
    target.renderProfile.character.weaponStowed = !resolved;
  }
  if (target.anim?.weapon && typeof target.anim.weapon === 'object') {
    target.anim.weapon.stowed = !resolved;
  }
}

function resetWeaponAnimState(fighter, { stow = false } = {}) {
  if (!fighter || typeof fighter !== 'object') return;
  fighter.anim ||= {};
  if (!fighter.anim.weapon || typeof fighter.anim.weapon !== 'object') {
    fighter.anim.weapon = { attachments: {}, gripPercents: {}, state: null, stowed: false };
  }
  fighter.anim.weapon.state = null;
  fighter.anim.weapon.attachments = {};
  fighter.anim.weapon.gripPercents = {};
  applyWeaponDrawnState(fighter, stow ? false : undefined);
}

function applyWeaponToRenderProfile(target, weaponKey, { resetAnim = true } = {}) {
  if (!target || typeof target !== 'object') return;
  target.renderProfile ||= {};
  target.renderProfile.weapon = weaponKey;
  if (target.renderProfile.character && typeof target.renderProfile.character === 'object') {
    target.renderProfile.character.weapon = weaponKey;
  }
  target.weapon = weaponKey;
  applyWeaponDrawnState(target);
  if (resetAnim) {
    resetWeaponAnimState(target);
  }
}

function syncWeaponRuntimeForCharacter(characterKey, weaponKey, { fighterKey = null, weaponDrawn = null } = {}) {
  const G = window.GAME || {};
  const normalizedCharacterKey = characterKey || 'player';
  const fighters = G.FIGHTERS || {};
  Object.entries(fighters).forEach(([id, fighter]) => {
    if (!fighter) return;
    const profile = fighter.renderProfile || {};
    const matchesCharacter = profile.characterKey === normalizedCharacterKey
      || (normalizedCharacterKey === 'player' && (fighter.isPlayer || id === 'player'));
    if (matchesCharacter || (fighterKey && id === fighterKey)) {
      applyWeaponToRenderProfile(fighter, weaponKey, { resetAnim: true });
      if (weaponDrawn != null) {
        applyWeaponDrawnState(fighter, weaponDrawn);
      }
    }
  });

  const templates = G.FIGHTER_TEMPLATES || {};
  Object.entries(templates).forEach(([id, template]) => {
    if (!template) return;
    const profile = template.renderProfile || {};
    const matchesCharacter = profile.characterKey === normalizedCharacterKey
      || (normalizedCharacterKey === 'player' && (template.isPlayer || id === 'player'));
    if (matchesCharacter || (fighterKey && id === fighterKey)) {
      applyWeaponToRenderProfile(template, weaponKey, { resetAnim: false });
      if (weaponDrawn != null) {
        applyWeaponDrawnState(template, weaponDrawn);
      }
    }
  });

  const stateMap = G.CHARACTER_STATE;
  if (stateMap && typeof stateMap === 'object') {
    Object.entries(stateMap).forEach(([id, profile]) => {
      const source = fighters[id]?.renderProfile || null;
      if (!profile || typeof profile !== 'object') {
        if ((fighterKey && id === fighterKey) || (source && (source.characterKey === normalizedCharacterKey || (normalizedCharacterKey === 'player' && id === 'player')))) {
          if (source) {
            try {
              stateMap[id] = JSON.parse(JSON.stringify(source));
            } catch (_err) {
              stateMap[id] = { ...source };
            }
          }
        }
        return;
      }
      const cachedKey = profile.characterKey || (id === normalizedCharacterKey ? normalizedCharacterKey : null);
      if (cachedKey === normalizedCharacterKey || (fighterKey && id === fighterKey)) {
        if (source) {
          try {
            stateMap[id] = JSON.parse(JSON.stringify(source));
          } catch (_err) {
            stateMap[id] = { ...source };
          }
          applyWeaponDrawnState(stateMap[id], weaponDrawn != null ? weaponDrawn : source.weaponDrawn);
        } else {
          const clone = { ...profile, weapon: weaponKey };
          if (clone.character && typeof clone.character === 'object') {
            clone.character = { ...clone.character, weapon: weaponKey };
          }
          applyWeaponDrawnState(clone, weaponDrawn);
          stateMap[id] = clone;
        }
      }
    });
  }

  const selectedFighterKey = fighterKey || G.selectedFighter || null;
  if (selectedFighterKey) {
    window.CONFIG ||= {};
    window.CONFIG.fighters ||= {};
    const fighterConfig = window.CONFIG.fighters[selectedFighterKey] ||= {};
    fighterConfig.weapon = weaponKey;
    if (weaponDrawn != null) {
      fighterConfig.weaponDrawn = weaponDrawn;
    }
  }
}

function syncWeaponDrawnState({ fighterKey = null, weaponDrawn = null, characterKey = null } = {}) {
  const G = window.GAME || {};
  const normalizedCharacterKey = characterKey || 'player';
  const fighters = G.FIGHTERS || {};
  const resolvedDrawn = weaponDrawn != null ? !!weaponDrawn : null;

  Object.entries(fighters).forEach(([id, fighter]) => {
    if (!fighter) return;
    const profile = fighter.renderProfile || {};
    const matchesCharacter = profile.characterKey === normalizedCharacterKey
      || (normalizedCharacterKey === 'player' && (fighter.isPlayer || id === 'player'));
    if (matchesCharacter || (fighterKey && id === fighterKey)) {
      const drawState = resolvedDrawn != null
        ? resolvedDrawn
        : (typeof fighter.weaponDrawn === 'boolean' ? fighter.weaponDrawn : true);
      applyWeaponDrawnState(fighter, drawState);
    }
  });

  const templates = G.FIGHTER_TEMPLATES || {};
  Object.entries(templates).forEach(([id, template]) => {
    if (!template) return;
    const profile = template.renderProfile || {};
    const matchesCharacter = profile.characterKey === normalizedCharacterKey
      || (normalizedCharacterKey === 'player' && (template.isPlayer || id === 'player'));
    if (matchesCharacter || (fighterKey && id === fighterKey)) {
      const drawState = resolvedDrawn != null
        ? resolvedDrawn
        : (typeof template.weaponDrawn === 'boolean' ? template.weaponDrawn : true);
      applyWeaponDrawnState(template, drawState);
    }
  });

  const stateMap = G.CHARACTER_STATE;
  if (stateMap && typeof stateMap === 'object') {
    Object.entries(stateMap).forEach(([id, profile]) => {
      const source = fighters[id]?.renderProfile || null;
      const cachedKey = profile?.characterKey || (id === normalizedCharacterKey ? normalizedCharacterKey : null);
      if (cachedKey === normalizedCharacterKey || (fighterKey && id === fighterKey)) {
        const drawState = resolvedDrawn != null
          ? resolvedDrawn
          : (profile?.weaponDrawn != null ? profile.weaponDrawn : source?.weaponDrawn);
        if (source) {
          try {
            stateMap[id] = JSON.parse(JSON.stringify(source));
          } catch (_err) {
            stateMap[id] = { ...source };
          }
          applyWeaponDrawnState(stateMap[id], drawState);
        } else if (profile && typeof profile === 'object') {
          const clone = { ...profile };
          applyWeaponDrawnState(clone, drawState);
          stateMap[id] = clone;
        }
      }
    });
  }

  const selectedFighterKey = fighterKey || G.selectedFighter || null;
  if (selectedFighterKey && resolvedDrawn != null) {
    window.CONFIG ||= {};
    window.CONFIG.fighters ||= {};
    const fighterConfig = window.CONFIG.fighters[selectedFighterKey] ||= {};
    fighterConfig.weaponDrawn = resolvedDrawn;
  }
}

if (typeof window !== 'undefined') {
  window.syncWeaponDrawnState = syncWeaponDrawnState;
  window.syncWeaponRuntimeForCharacter = syncWeaponRuntimeForCharacter;
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

function applySelectedWeaponSelection(rawValue, { triggerPreview = true } = {}) {
  const trimmed = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
  const normalizedGameValue = trimmed && trimmed.length ? trimmed : null;
  const normalizedConfigValue = normalizedGameValue || 'unarmed';

  window.GAME ||= {};
  window.GAME.selectedWeapon = normalizedGameValue;
  setConfigCurrentWeapon(window.GAME.selectedWeapon);

  const characters = window.CONFIG?.characters;
  const selectedCharacter = window.GAME.selectedCharacter || 'player';
  const previousWeapon = (selectedCharacter && characters && characters[selectedCharacter])
    ? characters[selectedCharacter].weapon
    : null;

  if (selectedCharacter && characters && characters[selectedCharacter]) {
    characters[selectedCharacter].weapon = normalizedConfigValue;
  }

  const previousNormalized = (typeof previousWeapon === 'string' && previousWeapon.trim().length)
    ? previousWeapon.trim()
    : 'unarmed';
  const hasChanged = previousNormalized !== normalizedConfigValue;

  if (hasChanged) {
    scheduleConfigUpdatedEvent();
  }

  if (triggerPreview && hasChanged) {
    const fighterName = window.GAME?.selectedFighter || currentSelectedFighter || null;
    if (fighterName) {
      requestFighterPreview(fighterName);
    } else {
      requestFighterPreview(null);
    }
  }
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

  applySelectedWeaponSelection(weaponSelect.value, { triggerPreview: false });

  if (!weaponSelect.dataset.initialized) {
    weaponSelect.addEventListener('change', (event) => {
      applySelectedWeaponSelection(event.target.value);
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
      currentSelectedFighter = null;
      window.GAME.selectedCharacter = null;
      window.GAME.selectedFighter = null;
      window.GAME.selectedWeapon = null;
      setConfigCurrentWeapon(null);
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
        setConfigCurrentWeapon(null);
      }

      const defaults = getDefaultAbilityAssignments();
      setAbilitySelection(defaults, { syncDropdowns: true });
      requestFighterPreview(null);
      return;
    }
    const charData = map[selectedChar];
    // Sync fighter, weapon, cosmetics, and appearance
    window.GAME.selectedCharacter = selectedChar;
    window.GAME.selectedFighter = charData.fighter;
    currentSelectedFighter = charData.fighter || null;
    applySelectedWeaponSelection(charData.weapon || '', { triggerPreview: false });
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

    requestFighterPreview(charData.fighter);

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
  initAppSettingsBindings();
});
import { initNpcSystems, updateNpcSystems, getActiveNpcFighters } from './npc.js?v=2';
import { initPresets, ensureAltSequenceUsesKickAlt } from './presets.js?v=6';
import { initFighters } from './fighter.js?v=8';
import { initControls } from './controls.js?v=7';
import { initCombat } from './combat.js?v=19';
import { updatePoses, resolveStancePose, resolveStanceKey } from './animator.js?v=5';
import { renderAll, LIMB_COLORS } from './render.js?v=4';
import { initCamera, updateCamera } from './camera.js?v=5';
import { initManualZoom } from './manual-zoom.js?v=1';
import { initHitDetect, runHitDetect } from './hitdetect.js?v=1';
import { initSprites, renderSprites } from './sprites.js?v=8';
import { initDebugPanel, updateDebugPanel } from './debug-panel.js?v=1';
import { $$, show } from './dom-utils.js?v=1';
import { initTouchControls } from './touch-controls.js?v=1';
import initArchTouchInput from './arch-touch-input.js?v=1';
import { initBountySystem, updateBountySystem, getBountyState } from './bounty.js?v=1';
import { initAllObstructionPhysics, updateObstructionPhysics } from './obstruction-physics.js?v=1';
import { syncCamera as syncThreeCamera } from './three-camera-sync.js?v=1';

// Visualsmap loader for 3D grid-based scenes
let visualsmapLoaderModule = null;
async function getVisualsmapLoader() {
  if (!visualsmapLoaderModule) {
    visualsmapLoaderModule = await import('../renderer/visualsmapLoader.js');
  }
  return visualsmapLoaderModule;
}

// Optional 3D renderer modules (lazy-loaded to avoid breaking boot if assets aren't hosted)
const rendererModuleState = {
  promise: null,
  error: null,
  exports: null,
};

// Lazy-loading helpers for external Three.js dependencies
const externalScriptPromises = new Map();
// Try ES module sources first for better compatibility with GLTFLoader
const THREE_MODULE_SOURCES = [
  '../vendor/three/three.module.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.module.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js',
  'https://unpkg.com/three@0.160.0/build/three.module.js',
];
// Classic/UMD builds as fallback (note: deprecated in r150+, to be removed in future versions)
const THREE_SCRIPT_SOURCES = [
  '../vendor/three/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js',
  'https://unpkg.com/three@0.160.0/build/three.min.js',
];
// ES module sources for BufferGeometryUtils (required by GLTFLoader for some geometries)
const BUFFER_GEOMETRY_UTILS_MODULE_SOURCES = [
  '../vendor/three/BufferGeometryUtils.module.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js',
  'https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js',
];
// Classic/UMD wrapper for BufferGeometryUtils
const BUFFER_GEOMETRY_UTILS_SCRIPT_SOURCES = [
  '../vendor/three/BufferGeometryUtils.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/utils/BufferGeometryUtils.js',
  'https://unpkg.com/three@0.160.0/examples/js/utils/BufferGeometryUtils.js',
];
// ES module sources for GLTFLoader (preferred for compatibility)
const GLTF_LOADER_MODULE_SOURCES = [
  '../vendor/three/GLTFLoader.module.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/examples/jsm/loaders/GLTFLoader.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
  'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
];
// Classic/UMD wrapper (requires ES module support for dynamic import)
const GLTF_LOADER_SCRIPT_SOURCES = [
  '../vendor/three/GLTFLoader.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/0.160.0/loaders/GLTFLoader.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/js/loaders/GLTFLoader.js',
  'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js',
];

function loadExternalScriptOnce(url) {
  if (externalScriptPromises.has(url)) return externalScriptPromises.get(url);

  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = url;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = (event) => reject(new Error(`Failed to load ${url}: ${event?.message || 'network error'}`));
    document.head.appendChild(script);
  });

  externalScriptPromises.set(url, promise);
  return promise;
}

async function loadScriptFromSources(label, sources) {
  const errors = [];
  for (const url of sources) {
    try {
      await loadExternalScriptOnce(url);
      return url;
    } catch (error) {
      errors.push({ url, error });
      console.warn(`[app] ${label} load failed from ${url}:`, error?.message || error);
    }
  }

  const message = `${label} failed to load from all sources`;
  const aggregate = new Error(message);
  aggregate.causes = errors;
  throw aggregate;
}

const externalModulePromises = new Map();

async function importModuleFromSources(label, sources, onLoad) {
  const errors = [];
  for (const url of sources) {
    const existing = externalModulePromises.get(url);
    const promise = existing || import(/* webpackIgnore: true */ url);
    externalModulePromises.set(url, promise);

    try {
      const module = await promise;
      if (typeof onLoad === 'function') {
        try {
          onLoad(module, url);
        } catch (handlerError) {
          console.warn(`[app] ${label} post-load handler failed for ${url}:`, handlerError);
        }
      }
      return module;
    } catch (error) {
      errors.push({ url, error });
      console.warn(`[app] ${label} module load failed from ${url}:`, error?.message || error);
    }
  }

  const message = `${label} module failed to load from all sources`;
  const aggregate = new Error(message);
  aggregate.causes = errors;
  throw aggregate;
}

const threeGlobalState = {
  promise: null,
  error: null,
  gltfLoaderCtor: null, // Fallback storage for GLTFLoader constructor when THREE is non-extensible
  bufferGeometryUtils: null, // Fallback storage for BufferGeometryUtils when THREE is non-extensible
};

// Safe global accessor for GLTFLoader constructor
// Returns the constructor whether it's attached to THREE or stored in fallback
if (typeof globalThis.getThreeGLTFLoaderCtor !== 'function') {
  globalThis.getThreeGLTFLoaderCtor = function() {
    // Prefer THREE.GLTFLoader if available (normal case)
    if (globalThis.THREE && globalThis.THREE.GLTFLoader) {
      return globalThis.THREE.GLTFLoader;
    }
    // Fall back to stored constructor if THREE is non-extensible
    return threeGlobalState.gltfLoaderCtor;
  };
}

// Safe global accessor for BufferGeometryUtils
// Returns the utils whether attached to THREE or stored in fallback
if (typeof globalThis.getThreeBufferGeometryUtils !== 'function') {
  globalThis.getThreeBufferGeometryUtils = function() {
    // Prefer THREE.BufferGeometryUtils if available (normal case)
    if (globalThis.THREE && globalThis.THREE.BufferGeometryUtils) {
      return globalThis.THREE.BufferGeometryUtils;
    }
    // Fall back to stored utils if THREE is non-extensible
    return threeGlobalState.bufferGeometryUtils;
  };
}

async function ensureThreeGlobals() {
  if (globalThis.THREE?.GLTFLoader) {
    // Version guard: log info if THREE already exists
    const version = globalThis.THREE.REVISION || 'unknown';
    console.log(`[app] Three.js r${version} already loaded - reusing existing instance`);
    return globalThis.THREE;
  }
  if (threeGlobalState.error) return null;
  if (threeGlobalState.promise) return threeGlobalState.promise;

  threeGlobalState.promise = (async () => {
    if (!globalThis.THREE) {
      // Try ES module first for better GLTFLoader compatibility
      try {
        await importModuleFromSources('Three.js ES', THREE_MODULE_SOURCES, (module) => {
          const threeModule = module?.default || module;
          if (threeModule && !globalThis.THREE) {
            // ES module namespaces are frozen by spec, so create an extensible copy
            // to allow attaching GLTFLoader and BufferGeometryUtils
            if (!Object.isExtensible(threeModule)) {
              console.log(`[app] Creating extensible copy of THREE module namespace`);
              globalThis.THREE = Object.assign({}, threeModule);
            } else {
              globalThis.THREE = threeModule;
            }
            console.log(`[app] Three.js r${(globalThis.THREE.REVISION || 'unknown')} loaded from ES module`);
          }
        });
      } catch (moduleError) {
        console.warn('[app] Three.js ES module sources failed, trying classic/UMD fallbacks');
        await loadScriptFromSources('Three.js', THREE_SCRIPT_SOURCES);
        if (globalThis.THREE) {
          console.log(`[app] Three.js r${globalThis.THREE.REVISION || 'unknown'} loaded from local/CDN script`);
        }
      }
    } else {
      // THREE already exists - check version compatibility
      const existingVersion = globalThis.THREE.REVISION || 'unknown';
      console.log(`[app] Three.js r${existingVersion} already exists in global scope - reusing`);
    }

    if (!globalThis.THREE) {
      throw new Error('Three.js failed to initialize');
    }

    // Check if THREE object is extensible and create extensible copy if needed
    const isExtensible = Object.isExtensible(globalThis.THREE);
    const isSealed = Object.isSealed(globalThis.THREE);
    const isFrozen = Object.isFrozen(globalThis.THREE);
    console.log(`[app] THREE object state: extensible=${isExtensible}, sealed=${isSealed}, frozen=${isFrozen}`);

    if (!isExtensible) {
      console.log('[app] Creating extensible copy of non-extensible THREE object');
      // Create an extensible copy to allow attaching GLTFLoader and BufferGeometryUtils
      globalThis.THREE = Object.assign({}, globalThis.THREE);
      console.log('[app] ✓ THREE object is now extensible');
    }

    // Load BufferGeometryUtils if not already available (required by GLTFLoader for some geometries)
    if (!globalThis.THREE.BufferGeometryUtils && !threeGlobalState.bufferGeometryUtils) {
      try {
        await importModuleFromSources('BufferGeometryUtils ES', BUFFER_GEOMETRY_UTILS_MODULE_SOURCES, (module) => {
          const utils = module?.BufferGeometryUtils || module?.default || module;
          if (utils && globalThis.THREE && !globalThis.THREE.BufferGeometryUtils) {
            try {
              globalThis.THREE.BufferGeometryUtils = utils;
              console.log('[app] BufferGeometryUtils loaded from ES module and attached to THREE');
            } catch (attachError) {
              console.warn('[app] Cannot attach BufferGeometryUtils to THREE object:', attachError.message);
              // Store in fallback
              threeGlobalState.bufferGeometryUtils = utils;
              console.log('[app] BufferGeometryUtils loaded from ES module and stored in fallback (access via getThreeBufferGeometryUtils)');
            }
          }
        });
      } catch (moduleError) {
        console.warn('[app] BufferGeometryUtils ES module sources failed, trying classic/UMD fallbacks');
        try {
          await loadScriptFromSources('BufferGeometryUtils', BUFFER_GEOMETRY_UTILS_SCRIPT_SOURCES);
          if (globalThis.THREE.BufferGeometryUtils) {
            console.log('[app] BufferGeometryUtils loaded from local/CDN script');
          } else if (globalThis.BufferGeometryUtils) {
            // Script may have set it globally but not on THREE
            const utils = globalThis.BufferGeometryUtils;
            try {
              globalThis.THREE.BufferGeometryUtils = utils;
              console.log('[app] BufferGeometryUtils loaded from UMD script and attached to THREE');
            } catch (attachError) {
              console.warn('[app] Cannot attach BufferGeometryUtils to THREE object:', attachError.message);
              threeGlobalState.bufferGeometryUtils = utils;
              console.log('[app] BufferGeometryUtils loaded from UMD script and stored in fallback (access via getThreeBufferGeometryUtils)');
            }
          }
        } catch (scriptError) {
          console.warn('[app] BufferGeometryUtils fallback failed - GLTFLoader may have issues with certain geometries:', scriptError);
        }
      }
    } else {
      console.log('[app] BufferGeometryUtils already available');
    }

    if (!globalThis.THREE.GLTFLoader) {
      // Try ES module first for better compatibility with BufferGeometryUtils
      try {
        await importModuleFromSources('GLTFLoader ES', GLTF_LOADER_MODULE_SOURCES, (module) => {
          const ctor = module?.GLTFLoader || module?.default;
          if (ctor && globalThis.THREE && !globalThis.THREE.GLTFLoader) {
            try {
              globalThis.THREE.GLTFLoader = ctor;
              console.log('[app] GLTFLoader loaded from ES module and attached to THREE');
            } catch (attachError) {
              // Cannot attach to THREE (may be frozen/sealed/non-extensible) - store constructor in fallback
              console.warn('[app] Cannot attach GLTFLoader to THREE object:', attachError.message);
              threeGlobalState.gltfLoaderCtor = ctor;
              console.log('[app] GLTFLoader loaded from ES module and stored in fallback (access via getThreeGLTFLoaderCtor)');
            }
          }
        });
      } catch (moduleError) {
        console.warn('[app] GLTFLoader ES module sources failed, trying classic/UMD fallbacks');
        await loadScriptFromSources('GLTFLoader', GLTF_LOADER_SCRIPT_SOURCES);
        if (globalThis.THREE.GLTFLoader) {
          console.log('[app] GLTFLoader loaded from local/CDN script');
        } else if (globalThis.GLTFLoader) {
          // Script loader may have set GLTFLoader globally but not on THREE
          const ctor = globalThis.GLTFLoader;
          try {
            globalThis.THREE.GLTFLoader = ctor;
            console.log('[app] GLTFLoader loaded from UMD script and attached to THREE');
          } catch (attachError) {
            // Cannot attach to THREE (may be frozen/sealed/non-extensible) - store constructor in fallback
            console.warn('[app] Cannot attach GLTFLoader to THREE object:', attachError.message);
            threeGlobalState.gltfLoaderCtor = ctor;
            console.log('[app] GLTFLoader loaded from UMD script and stored in fallback (access via getThreeGLTFLoaderCtor)');
          }
        }
      }
    } else {
      console.log('[app] GLTFLoader already available');
    }

    // Check if GLTFLoader is available via either method
    const loaderCtor = globalThis.THREE.GLTFLoader || threeGlobalState.gltfLoaderCtor;
    if (!loaderCtor) {
      throw new Error('GLTFLoader failed to initialize - check BufferGeometryUtils availability');
    }
    
    // Verify BufferGeometryUtils is available (required by GLTFLoader)
    const bufferGeomUtils = globalThis.THREE.BufferGeometryUtils || threeGlobalState.bufferGeometryUtils;
    if (!bufferGeomUtils) {
      console.warn('[app] ⚠ BufferGeometryUtils not found - GLTFLoader may fail on certain geometry types');
      console.warn('[app] Note: ES module GLTFLoader has BufferGeometryUtils bundled, so this may not affect loading');
    } else {
      const source = globalThis.THREE.BufferGeometryUtils ? 'THREE.BufferGeometryUtils' : 'fallback getter';
      console.log(`[app] ✓ BufferGeometryUtils available via ${source}`);
    }

    return globalThis.THREE;
  })();

  try {
    return await threeGlobalState.promise;
  } catch (error) {
    threeGlobalState.error = error;
    console.warn('[app] Failed to ensure Three.js globals:', error);
    return null;
  }
}

function getRendererModuleStatus() {
  if (rendererModuleState.exports) return 'loaded';
  if (rendererModuleState.error) return 'failed';
  if (rendererModuleState.promise) return 'loading';
  return 'not_loaded';
}

function rendererSupportsThree() {
  return typeof rendererModuleState.exports?.isSupported === 'function'
    ? rendererModuleState.exports.isSupported()
    : false;
}

async function ensureRendererModules() {
  if (rendererModuleState.exports) return rendererModuleState.exports;
  if (rendererModuleState.error) return null;
  if (rendererModuleState.promise) return rendererModuleState.promise;

  rendererModuleState.promise = (async () => {
    try {
      const three = await ensureThreeGlobals();
      // Check if GLTFLoader is available via either method (attached or fallback)
      const loaderCtor = three?.GLTFLoader || threeGlobalState.gltfLoaderCtor;
      if (!three || !loaderCtor) {
        throw new Error('Three.js not available for renderer');
      }
      console.log('[app] 3D renderer modules ready - GLTFLoader available via', three.GLTFLoader ? 'THREE.GLTFLoader' : 'fallback getter');
      const [rendererModule, adapterModule] = await Promise.all([
        import('../renderer/index.js'),
        import('../renderer/rendererAdapter.js'),
      ]);

      rendererModuleState.exports = {
        isSupported: rendererModule?.isSupported || (() => false),
        createRenderer: rendererModule?.createRenderer || null,
        adaptScene3dToRenderer: adapterModule?.adaptScene3dToRenderer || null,
      };
      return rendererModuleState.exports;
    } catch (error) {
      rendererModuleState.error = error;
      console.warn('[app] Failed to load 3D renderer modules:', error);
      return null;
    }
  })();

  return rendererModuleState.promise;
}

// 3D Background Renderer State
// TODO: Requires global THREE to be loaded (via CDN or bundler). See docs/renderer-README.md
let GAME_RENDERER_3D = null;
let GAME_RENDER_ADAPTER = null; // For single scene3d.sceneUrl loading (legacy)
let GAME_VISUALSMAP_ADAPTER = null; // For grid-based visualsmap loading
let THREE_BG_CONTAINER = null;
let THREE_BG_RESIZE_HANDLER = null;

// Setup canvas
const cv = $$('#game');
const stage = $$('#gameStage');
const cx = cv?.getContext('2d', { alpha: true });
if (cv) cv.style.background = 'transparent';
window.GAME ||= {};
window.GAME.dynamicInstances = []; // Array for dynamically spawned instances
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

function shouldEnableArchHud() {
  const archCfg = window.CONFIG?.hud?.arch;
  if (archCfg && archCfg.enabled === false) return false;
  return rootElement.classList.contains('is-touch');
}

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

window.GAME.coordinateCapture = {
  active: false,
  lastValues: null,
  awaitingTap: false,
  countdownActive: false,
  countdownTimer: null,
  pendingValues: null,
  locked: false,
};

const coordinateOverlay = document.getElementById('coordinateOverlay');
const coordinateStartBtn = document.getElementById('btnCoordinateCapture');
const coordinateDismissBtn = document.getElementById('coordinateOverlayDismiss');
const coordinateArmingOverlay = document.getElementById('coordinateArming');
const coordinateCountdown = document.getElementById('coordinateCountdown');
const coordinateCountdownNumber = document.getElementById('coordinateCountdownNumber');
const coordinateCopyButtons = coordinateOverlay?.querySelectorAll?.('[data-copy-source]');
const coordinateValueElements = {
  canvas: document.getElementById('coordValueCanvas'),
  world: document.getElementById('coordValueWorld'),
  ratio: document.getElementById('coordValueRatio'),
};
const stageEl = document.getElementById('gameStage');
const doc = document;

function isStageFullscreen() {
  if (!stageEl) return false;
  return doc.fullscreenElement === stageEl || doc.webkitFullscreenElement === stageEl;
}

async function requestStageFullscreen() {
  if (!stageEl) return false;
  const requestFs = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen || stageEl.msRequestFullscreen;
  if (!requestFs) return false;
  if (isStageFullscreen()) return true;
  try {
    await requestFs.call(stageEl);
    return true;
  } catch (err) {
    console.warn('[coordinate-capture] Fullscreen request failed', err);
    return false;
  }
}

if (coordinateOverlay) {
  coordinateOverlay.tabIndex = -1;
}

function isCoordinateCaptureActive() {
  return !!window.GAME?.coordinateCapture?.active;
}

function formatCoordPair(x, y, precision = 1) {
  return `${x.toFixed(precision)}, ${y.toFixed(precision)}`;
}

function clearCoordinateCountdown() {
  if (window.GAME.coordinateCapture.countdownTimer) {
    clearTimeout(window.GAME.coordinateCapture.countdownTimer);
    window.GAME.coordinateCapture.countdownTimer = null;
  }

  if (coordinateCountdownNumber) {
    coordinateCountdownNumber.textContent = '3';
  }
  if (coordinateCountdown) {
    coordinateCountdown.hidden = true;
  }
}

function updateCoordinateOverlayVisibility() {
  if (!coordinateOverlay) return;
  const shouldShow = isCoordinateCaptureActive()
    && !window.GAME.coordinateCapture.awaitingTap
    && !window.GAME.coordinateCapture.countdownActive;

  coordinateOverlay.hidden = !shouldShow;
  coordinateOverlay.setAttribute('aria-hidden', String(!shouldShow));
  if (shouldShow) {
    coordinateOverlay.focus({ preventScroll: true });
  }
}

function buildCoordinateSnapshot() {
  const { x, y, worldX, worldY } = window.GAME.MOUSE;
  const ratioX = cv.width ? x / cv.width : 0;
  const ratioY = cv.height ? y / cv.height : 0;

  return {
    canvas: formatCoordPair(x, y),
    world: formatCoordPair(worldX, worldY),
  ratio: `${ratioX.toFixed(4)}, ${ratioY.toFixed(4)}`,
  };
}

function applyCoordinateValues(formatted) {
  window.GAME.coordinateCapture.lastValues = formatted;

  if (coordinateValueElements.canvas) coordinateValueElements.canvas.textContent = formatted.canvas;
  if (coordinateValueElements.world) coordinateValueElements.world.textContent = formatted.world;
  if (coordinateValueElements.ratio) coordinateValueElements.ratio.textContent = formatted.ratio;
}

function setCoordinateCaptureActive(active) {
  const next = !!active;
  window.GAME.coordinateCapture.active = next;

  if (!next) {
    window.GAME.coordinateCapture.awaitingTap = false;
    window.GAME.coordinateCapture.countdownActive = false;
    window.GAME.coordinateCapture.pendingValues = null;
    window.GAME.coordinateCapture.lastValues = null;
    window.GAME.coordinateCapture.locked = false;
    clearCoordinateCountdown();
    if (coordinateArmingOverlay) coordinateArmingOverlay.hidden = true;
    updateCoordinateOverlayVisibility();
    return;
  }

  window.GAME.coordinateCapture.lastValues = null;
  window.GAME.coordinateCapture.pendingValues = null;
  window.GAME.coordinateCapture.locked = false;
  window.GAME.coordinateCapture.awaitingTap = true;
  window.GAME.coordinateCapture.countdownActive = false;
  clearCoordinateCountdown();

  Object.values(coordinateValueElements).forEach((el) => {
    if (el) el.textContent = '—';
  });

  if (coordinateArmingOverlay) {
    coordinateArmingOverlay.hidden = false;
  }

  updateCoordinateOverlayVisibility();
}

function capturePointerCoordinates(event) {
  if (!cv || !coordinateOverlay || !isCoordinateCaptureActive()) return;
  if (window.GAME.coordinateCapture.lastValues) return;
  updateMousePosition(event);

  const formatted = buildCoordinateSnapshot();
  applyCoordinateValues(formatted);
}

function finishCoordinateCountdown() {
  window.GAME.coordinateCapture.countdownActive = false;
  clearCoordinateCountdown();
  if (coordinateArmingOverlay) {
    coordinateArmingOverlay.hidden = true;
  }

  if (!isCoordinateCaptureActive()) {
    updateCoordinateOverlayVisibility();
    return;
  }

  updateCoordinateOverlayVisibility();

  if (window.GAME.coordinateCapture.pendingValues) {
    applyCoordinateValues(window.GAME.coordinateCapture.pendingValues);
    window.GAME.coordinateCapture.locked = true;
    window.GAME.coordinateCapture.pendingValues = null;
  }
}

function startCoordinateCountdown(event) {
  if (!isCoordinateCaptureActive()) return;
  if (!window.GAME.coordinateCapture.awaitingTap || window.GAME.coordinateCapture.countdownActive) return;

  if (event) {
    event.stopPropagation();
    event.preventDefault();
    updateMousePosition(event);
  }

  window.GAME.coordinateCapture.pendingValues = buildCoordinateSnapshot();
  window.GAME.coordinateCapture.awaitingTap = false;
  window.GAME.coordinateCapture.countdownActive = true;

  if (coordinateCountdownNumber) {
    coordinateCountdownNumber.textContent = '3';
  }
  if (coordinateCountdown) {
    coordinateCountdown.hidden = false;
  }

  let remaining = 3;
  const tick = () => {
    remaining -= 1;
    if (remaining > 0 && isCoordinateCaptureActive()) {
      if (coordinateCountdownNumber) {
        coordinateCountdownNumber.textContent = String(remaining);
      }
      window.GAME.coordinateCapture.countdownTimer = setTimeout(tick, 1000);
    } else {
      finishCoordinateCountdown();
    }
  };

  window.GAME.coordinateCapture.countdownTimer = setTimeout(tick, 1000);
}

async function copyCoordinateValue(sourceId, triggerBtn) {
  const el = document.getElementById(sourceId);
  const text = el?.textContent?.trim();
  if (!text || text === '—') return;
  try {
    await navigator.clipboard.writeText(text);
    if (triggerBtn) {
      const original = triggerBtn.textContent;
      triggerBtn.textContent = 'Copied!';
      setTimeout(() => {
        triggerBtn.textContent = original;
      }, 800);
    }
  } catch (error) {
    console.warn('[coordinate-capture] Failed to copy', error);
  }
}

function initCoordinateCaptureOverlay() {
  if (!coordinateOverlay || !coordinateStartBtn || !coordinateDismissBtn) return;

  coordinateStartBtn.addEventListener('click', async () => {
    await requestStageFullscreen();
    setCoordinateCaptureActive(true);
  });

  coordinateDismissBtn.addEventListener('click', (event) => {
    event.stopPropagation();
    setCoordinateCaptureActive(false);
  });

  coordinateArmingOverlay?.addEventListener('pointerdown', (event) => {
    startCoordinateCountdown(event);
  });

  coordinateOverlay.addEventListener('pointerdown', (event) => {
    if (!isCoordinateCaptureActive()) return;
    const isInteractive = event.target.closest('.coordinate-overlay__copy, .coordinate-overlay__close');
    if (isInteractive) return;
    capturePointerCoordinates(event);
  });

  coordinateCopyButtons?.forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const source = btn.getAttribute('data-copy-source');
      if (source) {
        copyCoordinateValue(source, btn);
      }
    });
  });
}

initCoordinateCaptureOverlay();

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
const RENDER_ORDER = [
  'HITBOX',
  'LEG_L_UPPER',
  'LEG_L_LOWER',
  'WEAPON_L',
  'ARM_L_UPPER',
  'ARM_L_LOWER',
  'TORSO',
  'HEAD',
  'LEG_R_UPPER',
  'LEG_R_LOWER',
  'WEAPON_R',
  'ARM_R_UPPER',
  'ARM_R_LOWER',
  'WEAPON'
];
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
const combatInfo = $$('#combatInfo');
const bountyHud = $$('#bountyHud');
const bountyStars = $$('#bountyStars');
const statusInfo = $$('#statusInfo');
const reloadBtn = $$('#btnReloadCfg');
const fullscreenBtn = $$('#btnFullscreen');
const actionButtonsContainer = document.querySelector('.controls-overlay .action-buttons');
const actionHudSvg = actionButtonsContainer?.querySelector('.action-hud-bg');
const actionHudPath = actionButtonsContainer?.querySelector('.action-hud-path');
const actionButtonRefs = {
  jump: document.getElementById('btnJump'),
  attackA: document.getElementById('btnAttackA'),
  attackB: document.getElementById('btnAttackB'),
  attackC: document.getElementById('btnAttackC'),
};
const fpsHud = $$('#fpsHud');
const coordHud = $$('#coordHud');
const boneKeyList = $$('#boneKeyList');
const helpBtn = $$('#btnHelp');
const helpPanel = $$('#helpPanel');
const teleportBtn = $$('#btnTeleportSpawn');

const enemyIndicatorLayer = stageEl ? document.createElement('div') : null;
const enemyIndicatorMap = new Map();
if (enemyIndicatorLayer && stageEl) {
  enemyIndicatorLayer.className = 'enemy-indicators-layer';
  enemyIndicatorLayer.setAttribute('aria-hidden', 'true');
  stageEl.appendChild(enemyIndicatorLayer);
}

const DEFAULT_BUTTON_LAYOUT = {
  jump: { left: '15%', top: '72%', rotate: '-12deg' },
  attackA: { left: '40%', top: '44%', rotate: '-6deg' },
  attackB: { left: '58%', top: '38%', rotate: '6deg' },
  attackC: { left: '82%', top: '68%', rotate: '12deg' },
};

const DEFAULT_BOTTOM_HUD_CONFIG = {
  width: 360,
  height: 200,
  edgeHeight: 90,
  apexHeight: 140,
  offsetY: 0,
  scale: 1,
  scaleWithActor: true,
  buttons: DEFAULT_BUTTON_LAYOUT,
};

const DEFAULT_ENEMY_INDICATOR_CONFIG = {
  width: 96,
  depth: 28,
  depthStep: 6,
  spacing: 8,
  topPadding: 4,
  offsetY: 6,
  strokeWidth: 2,
  colors: {
    health: '#f87171',
    stamina: '#38bdf8',
    footing: '#facc15',
  },
  showFooting: true,
  scaleWithActor: true,
};

let bottomHudConfigCache = null;
let enemyIndicatorConfigCache = null;
let enemyIndicatorConfigVersion = 0;
let hudScaleSignature = null;
let archTouchHandle = null;

refreshBottomHudConfig();
refreshEnemyIndicatorConfig();
syncHudScaleFactors({ force: true });

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
      initFighters(cv, cx, { spawnNpc: false });
      initSelectionDropdowns();
      if (previousFighter) {
        requestFighterPreview(previousFighter);
      } else {
        requestFighterPreview(null);
      }
      scheduleConfigUpdatedEvent();
      if (statusInfo) statusInfo.textContent = 'Config reloaded';
    } catch (e){
      if (statusInfo) statusInfo.textContent = 'Config reload failed';
      console.error(e);
    }
  });
}

if (teleportBtn) {
  teleportBtn.addEventListener('click', () => {
    const success = teleportPlayerAboveSpawn(100);
    if (!success) {
      console.warn('[teleport] Unable to teleport player – fighter not initialized yet');
    }
  });
}

if (fullscreenBtn && stageEl){
  const requestFs = stageEl.requestFullscreen || stageEl.webkitRequestFullscreen || stageEl.msRequestFullscreen;
  const exitFs = doc.exitFullscreen || doc.webkitExitFullscreen || doc.msExitFullscreen;

  const updateFullscreenUi = () => {
    const isFull = isStageFullscreen();
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
      const isFull = isStageFullscreen();
      if (!isFull){
        await requestStageFullscreen();
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
const toggleShowSpriteOrigins = $$('#toggleShowSpriteOrigins');
const toggleShowBones = $$('#toggleShowBones');
const toggleShowHitbox = $$('#toggleShowHitbox');

if (toggleShowSprites) {
  toggleShowSprites.checked = window.RENDER_DEBUG?.showSprites !== false;
  toggleShowSprites.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showSprites = e.target.checked;
  });
}

if (toggleShowSpriteOrigins) {
  toggleShowSpriteOrigins.checked = window.RENDER_DEBUG?.showSpriteOrigins || false;
  toggleShowSpriteOrigins.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showSpriteOrigins = e.target.checked;
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

const toggleShowRangeCollider = $$('#toggleShowRangeCollider');
if (toggleShowRangeCollider) {
  toggleShowRangeCollider.checked = window.RENDER_DEBUG?.showRangeCollider || false;
  toggleShowRangeCollider.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showRangeCollider = e.target.checked;
  });
}

const rangeColliderRotationOffset = $$('#rangeColliderRotationOffset');
const rangeRotationValue = $$('#rangeRotationValue');
if (rangeColliderRotationOffset && rangeRotationValue) {
  rangeColliderRotationOffset.value = window.RENDER_DEBUG?.rangeColliderRotationOffset || 0;
  rangeRotationValue.textContent = `${rangeColliderRotationOffset.value}°`;
  rangeColliderRotationOffset.addEventListener('input', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.rangeColliderRotationOffset = Number(e.target.value);
    rangeRotationValue.textContent = `${e.target.value}°`;
  });
}

const toggleShowAttackColliders = $$('#toggleShowAttackColliders');
if (toggleShowAttackColliders) {
  toggleShowAttackColliders.checked = window.RENDER_DEBUG?.showAttackColliders || false;
  toggleShowAttackColliders.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showAttackColliders = e.target.checked;
  });
}

const toggleShowVelocityArrow = $$('#toggleShowVelocityArrow');
if (toggleShowVelocityArrow) {
  toggleShowVelocityArrow.checked = window.RENDER_DEBUG?.showVelocityArrow || false;
  toggleShowVelocityArrow.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showVelocityArrow = e.target.checked;
  });
}

const toggleShowPOIs = $$('#toggleShowPOIs');
if (toggleShowPOIs) {
  toggleShowPOIs.checked = window.RENDER_DEBUG?.showPOIs !== false; // Default to true
  toggleShowPOIs.addEventListener('change', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.showPOIs = e.target.checked;
  });
}

const dashRotationOffset = $$('#dashRotationOffset');
const dashRotationValue = $$('#dashRotationValue');
if (dashRotationOffset && dashRotationValue) {
  dashRotationOffset.value = window.RENDER_DEBUG?.dashRotationOffset || 0;
  dashRotationValue.textContent = `${dashRotationOffset.value}°`;
  dashRotationOffset.addEventListener('input', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.dashRotationOffset = Number(e.target.value);
    dashRotationValue.textContent = `${e.target.value}°`;
  });
}

const dashImpulseMultiplier = $$('#dashImpulseMultiplier');
const dashImpulseValue = $$('#dashImpulseValue');
if (dashImpulseMultiplier && dashImpulseValue) {
  dashImpulseMultiplier.value = window.RENDER_DEBUG?.dashImpulseMultiplier || 5.0;
  dashImpulseValue.textContent = Number(dashImpulseMultiplier.value).toFixed(1);
  dashImpulseMultiplier.addEventListener('input', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.dashImpulseMultiplier = Number(e.target.value);
    dashImpulseValue.textContent = Number(e.target.value).toFixed(1);
  });
}

const dashFrictionMultiplier = $$('#dashFrictionMultiplier');
const dashFrictionValue = $$('#dashFrictionValue');
if (dashFrictionMultiplier && dashFrictionValue) {
  dashFrictionMultiplier.value = window.RENDER_DEBUG?.dashFrictionMultiplier || 0.01;
  dashFrictionValue.textContent = Number(dashFrictionMultiplier.value).toFixed(2);
  dashFrictionMultiplier.addEventListener('input', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.dashFrictionMultiplier = Number(e.target.value);
    dashFrictionValue.textContent = Number(e.target.value).toFixed(2);
  });
}

const dashWeightDrop = $$('#dashWeightDrop');
const dashWeightValue = $$('#dashWeightValue');
if (dashWeightDrop && dashWeightValue) {
  dashWeightDrop.value = window.RENDER_DEBUG?.dashWeightDrop || 0;
  dashWeightValue.textContent = Number(dashWeightDrop.value).toFixed(1);
  dashWeightDrop.addEventListener('input', (e) => {
    window.RENDER_DEBUG = window.RENDER_DEBUG || {};
    window.RENDER_DEBUG.dashWeightDrop = Number(e.target.value);
    dashWeightValue.textContent = Number(e.target.value).toFixed(1);
  });
}

// Head Tracking Controls
const toggleHeadTracking = $$('#toggleHeadTracking');
if (toggleHeadTracking) {
  toggleHeadTracking.checked = window.CONFIG?.headTracking?.enabled !== false;
  toggleHeadTracking.addEventListener('change', (e) => {
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.headTracking = window.CONFIG.headTracking || {};
    window.CONFIG.headTracking.enabled = e.target.checked;
  });
}

const headTrackingMode = $$('#headTrackingMode');
if (headTrackingMode) {
  headTrackingMode.value = window.CONFIG?.headTracking?.mode || 'relative';
  headTrackingMode.addEventListener('change', (e) => {
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.headTracking = window.CONFIG.headTracking || {};
    window.CONFIG.headTracking.mode = e.target.value;
  });
}

const toggleSnapBehind = $$('#toggleSnapBehind');
if (toggleSnapBehind) {
  toggleSnapBehind.checked = window.CONFIG?.headTracking?.snapBehind !== false;
  toggleSnapBehind.addEventListener('change', (e) => {
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.headTracking = window.CONFIG.headTracking || {};
    window.CONFIG.headTracking.snapBehind = e.target.checked;
  });
}

const headOffsetDeg = $$('#headOffsetDeg');
const headOffsetValue = $$('#headOffsetValue');
if (headOffsetDeg && headOffsetValue) {
  headOffsetDeg.value = window.CONFIG?.headTracking?.offsetDeg || 90;
  headOffsetValue.textContent = `${headOffsetDeg.value}°`;
  headOffsetDeg.addEventListener('input', (e) => {
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.headTracking = window.CONFIG.headTracking || {};
    window.CONFIG.headTracking.offsetDeg = Number(e.target.value);
    headOffsetValue.textContent = `${e.target.value}°`;
  });
}

const maxRelativeDeg = $$('#maxRelativeDeg');
const maxRelativeValue = $$('#maxRelativeValue');
if (maxRelativeDeg && maxRelativeValue) {
  maxRelativeDeg.value = window.CONFIG?.headTracking?.maxRelativeDeg || 90;
  maxRelativeValue.textContent = `${maxRelativeDeg.value}°`;
  maxRelativeDeg.addEventListener('input', (e) => {
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.headTracking = window.CONFIG.headTracking || {};
    window.CONFIG.headTracking.maxRelativeDeg = Number(e.target.value);
    maxRelativeValue.textContent = `${e.target.value}°`;
  });
}

const joystickDeadzone = $$('#joystickDeadzone');
const deadzoneValue = $$('#deadzoneValue');
if (joystickDeadzone && deadzoneValue) {
  joystickDeadzone.value = window.CONFIG?.headTracking?.joystickDeadzone || 0.15;
  deadzoneValue.textContent = Number(joystickDeadzone.value).toFixed(2);
  joystickDeadzone.addEventListener('input', (e) => {
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.headTracking = window.CONFIG.headTracking || {};
    window.CONFIG.headTracking.joystickDeadzone = Number(e.target.value);
    deadzoneValue.textContent = Number(e.target.value).toFixed(2);
  });
}

const toggleHeadDebug = $$('#toggleHeadDebug');
if (toggleHeadDebug) {
  toggleHeadDebug.checked = window.CONFIG?.headTracking?.debug || false;
  toggleHeadDebug.addEventListener('change', (e) => {
    window.CONFIG = window.CONFIG || {};
    window.CONFIG.headTracking = window.CONFIG.headTracking || {};
    window.CONFIG.headTracking.debug = e.target.checked;
  });
}

function getNestedConfigValue(path, fallback = null) {
  if (!path || !window.CONFIG) return fallback;
  const parts = path.split('.');
  let target = window.CONFIG;
  for (const part of parts) {
    if (!target || typeof target !== 'object') return fallback;
    target = target[part];
  }
  return target == null ? fallback : target;
}

function setNestedConfigValue(path, value) {
  if (!path) return;
  const parts = path.split('.');
  const last = parts.pop();
  if (!last) return;
  window.CONFIG ||= {};
  let target = window.CONFIG;
  for (const part of parts) {
    if (!target[part] || typeof target[part] !== 'object') {
      target[part] = {};
    }
    target = target[part];
  }
  target[last] = value;
  scheduleConfigUpdatedEvent();
}

function initAppSettingsBindings() {
  const bindings = [
    { id: 'actorScale', path: 'actor.scale', type: 'range', parser: parseFloat, onChange: () => syncHudScaleFactors({ force: true }) },
    { id: 'groundRatio', path: 'groundRatio', type: 'range', parser: parseFloat },
    { id: 'handMultiplier', path: 'colliders.handMultiplier', type: 'range', parser: parseFloat },
    { id: 'footMultiplier', path: 'colliders.footMultiplier', type: 'range', parser: parseFloat },
    { id: 'wAuth', path: 'movement.authoredWeight', type: 'range', parser: parseFloat },
    { id: 'wPhys', path: 'movement.physicsWeight', type: 'range', parser: parseFloat },
    { id: 'ikCalvesOnly', path: 'ik.calvesOnly', type: 'checkbox', parser: (v) => !!v },
    { id: 'lockFacing', path: 'movement.lockFacingDuringAttack', type: 'checkbox', parser: (v) => !!v },
  ];

  bindings.forEach((binding) => {
    const el = document.getElementById(binding.id);
    if (!el) return;

    const current = getNestedConfigValue(binding.path, binding.type === 'checkbox' ? el.checked : el.value);
    if (binding.type === 'checkbox') {
      el.checked = !!current;
    } else if (current != null) {
      const num = Number(current);
      el.value = Number.isFinite(num) ? num : el.value;
    }

    const handler = (event) => {
      const rawValue = binding.type === 'checkbox'
        ? event.target.checked
        : binding.parser?.(event.target.value) ?? event.target.value;
      const coerced = binding.parser ? binding.parser(rawValue) : rawValue;
      if (binding.type !== 'checkbox' && !Number.isFinite(coerced)) return;

      setNestedConfigValue(binding.path, coerced);
      if (typeof binding.onChange === 'function') {
        binding.onChange(coerced, el);
      }
    };

    const eventName = binding.type === 'checkbox' ? 'change' : 'input';
    el.addEventListener(eventName, handler);
  });
}

// Re-init presets on external config updates
document.addEventListener('config:updated', ()=>{
  initPresets();
  ensureAltSequenceUsesKickAlt();
  applyRenderOrder();
  refreshBottomHudConfig();
  refreshEnemyIndicatorConfig();
  syncHudScaleFactors({ force: true });
});

// Fighter selection and settings management
let currentSelectedFighter = null;

function determinePreviewFighter(preferredName) {
  const C = window.CONFIG || {};
  const fighters = C.fighters || {};

  if (preferredName && fighters[preferredName]) {
    return preferredName;
  }

  const selected = window.GAME?.selectedFighter;
  if (selected && fighters[selected]) {
    return selected;
  }

  const playerCharacterFighter = C.characters?.player?.fighter;
  if (playerCharacterFighter && fighters[playerCharacterFighter]) {
    return playerCharacterFighter;
  }

  if (fighters.TLETINGAN) {
    return 'TLETINGAN';
  }

  const fighterKeys = Object.keys(fighters);
  return fighterKeys.length ? fighterKeys[0] : null;
}

function requestFighterPreview(preferredName) {
  const fighterName = determinePreviewFighter(preferredName);
  if (fighterName) {
    scheduleFighterPreview(fighterName);
  }
}

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
    requestFighterPreview(previousSelection);
  } else {
    fighterSelect.value = '';
    if (!previousSelection) {
      hideFighterSettings();
    }
    requestFighterPreview(null);
  }

  // Handle selection change
  if (!fighterSelect.dataset.initialized) {
    fighterSelect.addEventListener('change', (e) => {
      const selectedFighter = e.target.value;
      currentSelectedFighter = selectedFighter || null;
      window.GAME ||= {};
      const previousPaletteFighter = window.GAME.selectedBodyColorsFighter;
      window.GAME.selectedFighter = selectedFighter;
      if (!selectedFighter) {
        delete window.GAME.selectedBodyColors;
        delete window.GAME.selectedBodyColorsFighter;
        delete window.GAME.selectedCosmetics;
        delete window.GAME.selectedAppearance;
        hideFighterSettings();
        requestFighterPreview(null);
        return;
      }

      if (previousPaletteFighter && previousPaletteFighter !== selectedFighter) {
        delete window.GAME.selectedBodyColors;
        delete window.GAME.selectedBodyColorsFighter;
      }
      delete window.GAME.selectedCosmetics;
      delete window.GAME.selectedAppearance;

      showFighterSettings(selectedFighter);
      requestFighterPreview(selectedFighter);
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
    initFighters(cv, cx, { spawnNpc: false });
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
    initFighters(cv, cx, { spawnNpc: false });
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

  const stanceAccessor = `CONFIG.poses[${JSON.stringify(resolveStanceKey(config))}]`;

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
    lines.push(`      Stance: Object.assign(clone(${stanceAccessor}), { resetFlipsBefore: true }),`);
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
    lines.push(`      Stance: clone(${stanceAccessor}),`);
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
        requestFighterPreview(fighterName);
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

function coerceNumber(value, fallback) {
  if (value === null || value === undefined || value === '') return fallback;
  const numeric = typeof value === 'string' ? Number(value.trim()) : Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, min, max) {
  if (!Number.isFinite(value)) {
    if (Number.isFinite(min)) return min;
    if (Number.isFinite(max)) return max;
    return value;
  }
  let result = value;
  if (Number.isFinite(min)) result = Math.max(min, result);
  if (Number.isFinite(max)) result = Math.min(max, result);
  return result;
}

function formatPercentValue(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Number.isFinite(value)) {
    const normalized = Math.abs(value) <= 1 ? value * 100 : value;
    return `${normalized}%`;
  }
  return fallback;
}

function formatDegreesValue(value, fallback) {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (Number.isFinite(value)) {
    return `${value}deg`;
  }
  return fallback;
}

function normalizeButtonLayout(rawLayout = {}) {
  const layout = {};
  for (const key of Object.keys(DEFAULT_BUTTON_LAYOUT)) {
    const base = DEFAULT_BUTTON_LAYOUT[key];
    const spec = rawLayout[key] || {};
    layout[key] = {
      left: formatPercentValue(spec.left ?? spec.x ?? spec.xPercent, base.left),
      top: formatPercentValue(spec.top ?? spec.y ?? spec.yPercent, base.top),
      rotate: formatDegreesValue(spec.rotate ?? spec.rotateDeg ?? spec.rotation, base.rotate),
    };
  }
  return layout;
}

function computeBottomHudConfig() {
  const raw = window.CONFIG?.hud?.bottomButtons || {};
  const defaults = DEFAULT_BOTTOM_HUD_CONFIG;
  const width = clampNumber(coerceNumber(raw.width, defaults.width), 220, 720);
  const height = clampNumber(coerceNumber(raw.height, defaults.height), 140, 320);
  const edgeHeight = clampNumber(coerceNumber(raw.edgeHeight, defaults.edgeHeight), 24, height);
  const apexHeight = clampNumber(coerceNumber(raw.apexHeight, defaults.apexHeight), edgeHeight + 8, height + 220);
  const offsetY = coerceNumber(raw.offsetY, defaults.offsetY) || 0;
  const scale = Number.isFinite(raw.scale) ? Math.max(0.3, raw.scale) : defaults.scale;
  const scaleWithActor = raw.scaleWithActor !== false;
  const buttons = normalizeButtonLayout(raw.buttons || raw.buttonLayout || {});
  return { width, height, edgeHeight, apexHeight, offsetY, scale, scaleWithActor, buttons };
}

function getBottomHudConfig() {
  if (!bottomHudConfigCache) {
    bottomHudConfigCache = computeBottomHudConfig();
  }
  return bottomHudConfigCache;
}

function refreshBottomHudConfig() {
  bottomHudConfigCache = computeBottomHudConfig();
  applyBottomHudCss(bottomHudConfigCache);
  applyButtonLayout(bottomHudConfigCache.buttons);
  updateHudBackgroundPath(bottomHudConfigCache);
}

function applyBottomHudCss(config) {
  if (!config || !document?.documentElement?.style) return;
  const root = document.documentElement.style;
  root.setProperty('--hud-panel-width', `${config.width}px`);
  root.setProperty('--hud-panel-height', `${config.height}px`);
  root.setProperty('--hud-panel-offset-y', `${config.offsetY}px`);
  const buttonSize = Math.max(54, config.height * 0.45);
  root.setProperty('--hud-button-diameter', `${buttonSize}px`);
  root.setProperty('--action-size', `${config.height}px`);
}

function applyButtonLayout(layout) {
  if (!layout) return;
  for (const [key, el] of Object.entries(actionButtonRefs)) {
    if (!el) continue;
    const spec = layout[key];
    applyButtonVar(el, '--btn-left', spec?.left);
    applyButtonVar(el, '--btn-top', spec?.top);
    applyButtonVar(el, '--btn-rotate', spec?.rotate);
  }
}

function applyButtonVar(el, varName, value) {
  if (!el || !varName) return;
  if (typeof value === 'string' && value.trim()) {
    el.style.setProperty(varName, value.trim());
  } else {
    el.style.removeProperty(varName);
  }
}

function updateHudBackgroundPath(config) {
  if (!actionHudPath || !actionHudSvg || !config) return;
  const startY = Math.max(0, config.height - config.edgeHeight);
  const apexY = Math.max(0, config.height - config.apexHeight);
  const path = `M 0 ${startY} Q ${config.width / 2} ${apexY} ${config.width} ${startY} L ${config.width} ${config.height} L 0 ${config.height} Z`;
  actionHudPath.setAttribute('d', path);
  actionHudSvg.setAttribute('viewBox', `0 0 ${config.width} ${config.height}`);
}

function resolveGlobalActorScale() {
  return Number.isFinite(window.CONFIG?.actor?.scale) ? window.CONFIG.actor.scale : 1;
}

function resolveSelectedFighterScale() {
  const selected = window.GAME?.selectedFighter;
  if (!selected) return 1;
  const fighterConfig = window.CONFIG?.fighters?.[selected];
  return Number.isFinite(fighterConfig?.actor?.scale) ? fighterConfig.actor.scale : 1;
}

function syncHudScaleFactors({ force } = {}) {
  const config = getBottomHudConfig();
  const actorScale = config.scaleWithActor === false
    ? 1
    : resolveGlobalActorScale() * resolveSelectedFighterScale();
  const hudScale = Number.isFinite(config.scale) ? config.scale : 1;
  const signature = `${actorScale.toFixed(4)}|${hudScale.toFixed(4)}`;
  if (!force && hudScaleSignature === signature) return;
  hudScaleSignature = signature;
  if (!document?.documentElement?.style) return;
  const root = document.documentElement.style;
  root.setProperty('--actor-scale', actorScale.toFixed(4));
  root.setProperty('--hud-panel-scale', hudScale.toFixed(4));
}

function computeEnemyIndicatorConfig() {
  const raw = window.CONFIG?.hud?.enemyIndicators || {};
  const defaults = DEFAULT_ENEMY_INDICATOR_CONFIG;
  const width = clampNumber(coerceNumber(raw.width, defaults.width), 30, 220);
  const depth = clampNumber(coerceNumber(raw.depth, defaults.depth), 4, 160);
  const depthStep = clampNumber(coerceNumber(raw.depthStep, defaults.depthStep), 0, depth);
  const spacing = clampNumber(coerceNumber(raw.spacing, defaults.spacing), 2, 60);
  const topPadding = clampNumber(coerceNumber(raw.topPadding, defaults.topPadding), 0, 60);
  const offsetY = coerceNumber(raw.offsetY, defaults.offsetY);
  const strokeWidth = clampNumber(coerceNumber(raw.strokeWidth, defaults.strokeWidth), 1, 6);
  const scaleWithActor = raw.scaleWithActor !== false;
  const colors = {
    health: typeof raw.colors?.health === 'string' ? raw.colors.health : defaults.colors.health,
    stamina: typeof raw.colors?.stamina === 'string' ? raw.colors.stamina : defaults.colors.stamina,
    footing: typeof raw.colors?.footing === 'string' ? raw.colors.footing : defaults.colors.footing,
  };
  const allowedStats = ['health', 'stamina', 'footing'];
  let stats = Array.isArray(raw.stats) && raw.stats.length
    ? raw.stats.filter((stat) => allowedStats.includes(stat))
    : (raw.showFooting === false ? ['health', 'stamina'] : allowedStats.slice());
  if (!stats.length) {
    stats = ['health', 'stamina'];
  }
  return { width, depth, depthStep, spacing, topPadding, offsetY, strokeWidth, colors, stats, scaleWithActor };
}

function getEnemyIndicatorConfig() {
  if (!enemyIndicatorConfigCache) {
    enemyIndicatorConfigCache = computeEnemyIndicatorConfig();
  }
  return enemyIndicatorConfigCache;
}

function refreshEnemyIndicatorConfig() {
  enemyIndicatorConfigCache = computeEnemyIndicatorConfig();
  enemyIndicatorConfigVersion++;
  if (document?.documentElement?.style && Number.isFinite(enemyIndicatorConfigCache.strokeWidth)) {
    document.documentElement.style.setProperty('--enemy-indicator-stroke', `${enemyIndicatorConfigCache.strokeWidth}px`);
  }
  enemyIndicatorMap.forEach((entry) => {
    entry.needsPathRefresh = true;
  });
}

function ensureEnemyIndicatorEntry(id) {
  if (!id || !enemyIndicatorLayer) return null;
  let entry = enemyIndicatorMap.get(id);
  if (!entry) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.classList.add('enemy-indicator');
    svg.setAttribute('aria-hidden', 'true');
    enemyIndicatorLayer.appendChild(svg);
    entry = { el: svg, paths: {}, lengths: {}, lastScale: null, version: -1, needsPathRefresh: true };
    enemyIndicatorMap.set(id, entry);
  }
  return entry;
}

function rebuildEnemyIndicatorPaths(entry, scale) {
  const config = getEnemyIndicatorConfig();
  const stats = config.stats || [];
  if (!entry || !entry.el || !stats.length) return;
  const effectiveScale = Math.max(0.25, Number.isFinite(scale) ? scale : 1);
  const width = Math.max(24, config.width) * effectiveScale;
  const spacing = Math.max(2, config.spacing) * effectiveScale;
  const topPadding = Math.max(0, config.topPadding) * effectiveScale;
  const depth = Math.max(2, config.depth) * effectiveScale;
  const depthStep = Math.max(0, config.depthStep) * effectiveScale;
  let maxY = topPadding;
  entry.paths ||= {};
  entry.lengths ||= {};
  for (let i = 0; i < stats.length; i++) {
    const stat = stats[i];
    const startY = topPadding + i * spacing;
    const arcDepth = Math.max(2, depth - (i * depthStep));
    const controlY = startY + arcDepth;
    const pathData = `M 0 ${startY} Q ${width / 2} ${controlY} ${width} ${startY}`;
    let path = entry.paths[stat];
    if (!path) {
      path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.classList.add(`arc-${stat}`);
      entry.el.appendChild(path);
      entry.paths[stat] = path;
    }
    path.setAttribute('d', pathData);
    path.setAttribute('stroke-width', config.strokeWidth);
    path.setAttribute('stroke', config.colors[stat] || '#fff');
    path.style.display = 'none';
    try {
      entry.lengths[stat] = path.getTotalLength();
    } catch (_err) {
      entry.lengths[stat] = width;
    }
    maxY = Math.max(maxY, controlY);
  }
  for (const stat of Object.keys(entry.paths)) {
    if (!stats.includes(stat)) {
      entry.paths[stat].remove();
      delete entry.paths[stat];
      delete entry.lengths[stat];
    }
  }
  const height = maxY + (config.strokeWidth * 2);
  entry.el.setAttribute('viewBox', `0 0 ${width} ${height}`);
  entry.el.setAttribute('width', width);
  entry.el.setAttribute('height', height);
  entry.width = width;
  entry.height = height;
  entry.lastScale = effectiveScale;
  entry.version = enemyIndicatorConfigVersion;
  entry.needsPathRefresh = false;
}

function resolveNpcScale(npc) {
  if (!npc) return resolveGlobalActorScale();
  const fighterName = npc.renderProfile?.fighterName;
  const fighterConfig = fighterName ? window.CONFIG?.fighters?.[fighterName] : null;
  const fighterScale = Number.isFinite(fighterConfig?.actor?.scale) ? fighterConfig.actor.scale : 1;
  return resolveGlobalActorScale() * fighterScale;
}

function resolveNpcHalfHeight(npc) {
  if (Number.isFinite(npc?.hitbox?.h)) {
    return npc.hitbox.h / 2;
  }
  const fighterName = npc?.renderProfile?.fighterName;
  const fighterConfig = fighterName ? window.CONFIG?.fighters?.[fighterName] : null;
  const fallbackHeight = Number.isFinite(fighterConfig?.parts?.hitbox?.h)
    ? fighterConfig.parts.hitbox.h
    : Number.isFinite(window.CONFIG?.parts?.hitbox?.h)
      ? window.CONFIG.parts.hitbox.h
      : 80;
  return (fallbackHeight * resolveNpcScale(npc)) / 2;
}

function resolveNpcFootPosition(npc) {
  const x = Number.isFinite(npc?.hitbox?.x) ? npc.hitbox.x : (npc?.pos?.x ?? 0);
  const centerY = Number.isFinite(npc?.hitbox?.y) ? npc.hitbox.y : (npc?.pos?.y ?? 0);
  const y = centerY + resolveNpcHalfHeight(npc);
  return { x, y };
}

function resolveHealthRatio(entity) {
  const health = entity?.health;
  if (!health) return 1;
  const max = Number.isFinite(health.max) ? Math.max(1, health.max) : (Number.isFinite(health.current) ? Math.max(1, health.current) : 100);
  const current = Number.isFinite(health.current) ? clampNumber(health.current, 0, max) : max;
  return max > 0 ? current / max : 1;
}

function resolveStaminaRatio(entity) {
  const stamina = entity?.stamina;
  if (!stamina) return 1;
  const max = Number.isFinite(stamina.max) ? Math.max(1, stamina.max) : (Number.isFinite(stamina.current) ? Math.max(1, stamina.current) : 100);
  const current = Number.isFinite(stamina.current) ? clampNumber(stamina.current, 0, max) : max;
  return max > 0 ? current / max : 1;
}

function resolveFootingRatio(entity) {
  const footing = Number.isFinite(entity?.footing) ? entity.footing : 100;
  return clampNumber(footing, 0, 100) / 100;
}

function updateIndicatorPath(entry, statKey, ratio) {
  const path = entry?.paths?.[statKey];
  const length = entry?.lengths?.[statKey];
  if (!path || !Number.isFinite(length)) {
    return 0;
  }
  if (ratio >= 0.999) {
    path.style.display = 'none';
    return 0;
  }
  const clamped = Math.max(0, Math.min(1, ratio));
  const drawn = length * clamped;
  path.style.display = '';
  path.setAttribute('stroke-dasharray', `${drawn} ${length}`);
  return 1;
}

function getCanvasMetrics() {
  if (!cv) return null;
  const canvasConfig = window.CONFIG?.canvas || {};
  const width = Number.isFinite(cv.width) ? cv.width : (Number.isFinite(canvasConfig.w) ? canvasConfig.w : 720);
  const height = Number.isFinite(cv.height) ? cv.height : (Number.isFinite(canvasConfig.h) ? canvasConfig.h : 460);
  let cssWidth = width;
  let cssHeight = height;
  try {
    const rect = cv.getBoundingClientRect();
    if (rect?.width) cssWidth = rect.width;
    if (rect?.height) cssHeight = rect.height;
  } catch (_err) {
    // Ignore measurement errors
  }
  return { width, height, cssWidth, cssHeight };
}

function updateEnemyIndicators() {
  if (!enemyIndicatorLayer) return;
  const npcs = getActiveNpcFighters();
  if (!npcs || !npcs.length) {
    enemyIndicatorMap.forEach((entry) => {
      entry.el.classList.remove('enemy-indicator--visible');
      entry.el.style.display = 'none';
    });
    return;
  }
  const metrics = getCanvasMetrics();
  if (!metrics) return;
  const camera = window.GAME?.CAMERA || {};
  const zoom = Math.max(Number.isFinite(camera.zoom) ? camera.zoom : 1, 0.05);
  const camX = Number.isFinite(camera.x) ? camera.x : 0;
  const groundLine = computeGroundYFromConfig(window.CONFIG, metrics.height);
  const pivotY = Number.isFinite(groundLine) ? groundLine : metrics.height;
  const verticalOffset = pivotY * (1 - zoom);
  const scaleX = metrics.cssWidth / metrics.width;
  const scaleY = metrics.cssHeight / metrics.height;
  const config = getEnemyIndicatorConfig();
  const offsetY = Number.isFinite(config.offsetY) ? config.offsetY : 6;
  const activeIds = new Set();
  for (const npc of npcs) {
    if (!npc || npc.isDead) continue;
    let id = npc.id || npc.renderProfile?.characterKey;
    if (!id) {
      if (!npc.__hudIndicatorId) {
        npc.__hudIndicatorId = `npc-${Math.random().toString(36).slice(2)}`;
      }
      id = npc.__hudIndicatorId;
    }
    const entry = ensureEnemyIndicatorEntry(id);
    if (!entry) continue;
    activeIds.add(id);
    const npcScale = config.scaleWithActor === false ? 1 : resolveNpcScale(npc);
    if (entry.needsPathRefresh || entry.version !== enemyIndicatorConfigVersion || Math.abs((entry.lastScale || 1) - npcScale) > 0.05) {
      rebuildEnemyIndicatorPaths(entry, npcScale);
    }
    if (!entry.width || !entry.height) continue;
    const foot = resolveNpcFootPosition(npc);
    const screenX = (foot.x - camX) * zoom;
    const screenY = (foot.y * zoom) + verticalOffset;
    const cssX = screenX * scaleX;
    const cssY = screenY * scaleY;
    const translateX = cssX - (entry.width / 2);
    const translateY = cssY + (offsetY * scaleY);
    entry.el.style.transform = `translate(${translateX.toFixed(2)}px, ${translateY.toFixed(2)}px)`;
    let visiblePaths = 0;
    visiblePaths += updateIndicatorPath(entry, 'health', resolveHealthRatio(npc));
    visiblePaths += updateIndicatorPath(entry, 'stamina', resolveStaminaRatio(npc));
    if (config.stats.includes('footing')) {
      visiblePaths += updateIndicatorPath(entry, 'footing', resolveFootingRatio(npc));
    } else if (entry.paths.footing) {
      entry.paths.footing.style.display = 'none';
    }
    if (visiblePaths > 0) {
      entry.el.style.display = 'block';
      entry.el.classList.add('enemy-indicator--visible');
    } else {
      entry.el.classList.remove('enemy-indicator--visible');
      entry.el.style.display = 'none';
    }
  }
  enemyIndicatorMap.forEach((entry, id) => {
    if (!activeIds.has(id)) {
      entry.el.classList.remove('enemy-indicator--visible');
      entry.el.style.display = 'none';
      entry.needsPathRefresh = true;
    }
  });
}

function updateHUD(){
  syncHudScaleFactors();
  updateEnemyIndicators();
  const G = window.GAME;
  const P = G.FIGHTERS?.player;
  if (!P) return;
  const S = P.stamina;
  if (S && staminaFill){
    const ratio = S.max ? Math.max(0, Math.min(1, S.current / S.max)) : 0;
    const pct = Math.round(ratio * 100);
    staminaFill.style.width = `${pct}%`;
    staminaFill.classList.toggle('low', ratio <= 0.25);
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

  // Combat info display
  if (combatInfo) {
    const combat = G.playerCombat;
    const attackState = P.attack;

    if (combat && attackState && attackState.active && attackState.context) {
      const context = attackState.context;
      const abilityName = context.ability?.name || context.abilityId || 'Unknown';
      const attackName = context.attack?.name || context.attackId || 'Unknown';
      const phase = attackState.currentPhase || 'Unknown';

      combatInfo.innerHTML = `<span class="ability">${abilityName}</span> › <span class="attack">${attackName}</span> › <span class="phase">${phase}</span>`;
      combatInfo.classList.add('active');
    } else {
      combatInfo.classList.remove('active');
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
  const registry = window.GAME?.mapRegistry;
  if (registry && (typeof registry.getActiveArea === 'function' || typeof registry.getArea === 'function')) {
    try {
      const direct = typeof registry.getActiveArea === 'function'
        ? registry.getActiveArea()
        : null;
      if (direct) {
        return direct;
      }
    } catch (error) {
      console.warn?.('[map] Failed to read active area from registry', error);
    }
    try {
      const activeId = typeof registry.getActiveAreaId === 'function'
        ? registry.getActiveAreaId()
        : window.GAME?.currentAreaId;
      if (activeId && typeof registry.getArea === 'function') {
        const fallback = registry.getArea(activeId);
        if (fallback) {
          return fallback;
        }
      }
    } catch (error) {
      console.warn?.('[map] Failed to resolve registry area by id', error);
    }
  }

  // Fallback to CONFIG.areas (preferred) or legacy PARALLAX (deprecated)
  const currentAreaId = window.GAME?.currentAreaId;
  if (currentAreaId && window.CONFIG?.areas?.[currentAreaId]) {
    return window.CONFIG.areas[currentAreaId];
  }
  
  const parallax = window.PARALLAX;
  if (parallax?.currentAreaId && parallax?.areas) {
    if (!window.__PARALLAX_READ_DEPRECATION_LOGGED) {
      console.warn('[app.js] Reading from window.PARALLAX is deprecated. Use window.CONFIG.areas or MapRegistry instead. See docs/NOTICE_PARALLAX_REMOVAL.md');
      window.__PARALLAX_READ_DEPRECATION_LOGGED = true;
    }
    return parallax.areas[parallax.currentAreaId] || null;
  }

  return null;
}

function coerceFiniteNumber(value) {
  if (value === null || value === undefined) {
    return null;
  }
  const normalized = typeof value === 'string' ? value.trim() : value;
  if (normalized === '') {
    return null;
  }
  const numeric = Number(normalized);
  return Number.isFinite(numeric) ? numeric : null;
}

function resolveLayerParallaxFactor(layer) {
  if (!layer || typeof layer !== 'object') {
    return 1;
  }
  const candidates = [layer.parallax, layer.parallaxSpeed, layer.meta?.parallax];
  for (const value of candidates) {
    const numeric = coerceFiniteNumber(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return 1;
}

function resolveLayerOffsetY(layer) {
  if (!layer || typeof layer !== 'object') {
    return 0;
  }
  const candidates = [layer.yOffset, layer.offsetY, layer.meta?.offsetY];
  for (const value of candidates) {
    const numeric = coerceFiniteNumber(value);
    if (numeric !== null) {
      return numeric;
    }
  }
  return 0;
}

function clampValue(value, min, max) {
  if (!Number.isFinite(value)) return Number.isFinite(min) ? min : 0;
  const clampedMin = Number.isFinite(min) ? min : value;
  const clampedMax = Number.isFinite(max) ? max : value;
  if (clampedMin > clampedMax) return clampedMin;
  return Math.min(Math.max(value, clampedMin), clampedMax);
}

function resolveLayerGroundSeesaw(layer) {
  const spec = layer?.meta?.groundSeesaw ?? layer?.groundSeesaw;
  if (!spec) {
    return { enabled: false, amplitudeDeg: 0, cameraInfluence: 1, pivotYOffset: 0 };
  }

  const enabled = spec.enabled !== false;
  const amplitudeDeg = clampValue(
    coerceFiniteNumber(spec.amplitudeDeg ?? spec.amplitude) ?? 0,
    0,
    45,
  );
  const cameraInfluence = clampValue(
    coerceFiniteNumber(spec.cameraInfluence ?? spec.cameraFactor ?? spec.intensity ?? 1) ?? 1,
    0,
    5,
  );
  const pivotYOffset = coerceFiniteNumber(
    spec.pivotYOffset ?? spec.pivotY ?? spec.pivotFromGround ?? 0,
  ) || 0;

  return { enabled, amplitudeDeg, cameraInfluence, pivotYOffset };
}

function computeGroundSeesawAngle(seesaw, camX, worldWidth) {
  if (!seesaw?.enabled) return 0;
  const usableWidth = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : null;
  if (!usableWidth) return 0;

  const centerX = usableWidth * 0.5;
  const normalized = clampValue(
    ((coerceFiniteNumber(camX) ?? 0) - centerX) / Math.max(1, usableWidth * 0.5),
    -1,
    1,
  );
  if (!seesaw.amplitudeDeg || Math.abs(normalized) < 1e-4) {
    return 0;
  }

  const amplitudeRad = (seesaw.amplitudeDeg * Math.PI) / 180;
  return normalized * seesaw.cameraInfluence * amplitudeRad;
}

function resolveStretchQuadSpec(inst) {
  const spec = inst?.meta?.drumSkin || inst?.meta?.groundSpan || inst?.meta?.stretchQuad;
  if (!spec) return null;

  const targetLayerId = typeof spec.targetLayerId === 'string' && spec.targetLayerId.trim()
    ? spec.targetLayerId.trim()
    : null;
  const height = coerceFiniteNumber(
    spec.height ?? spec.span ?? spec.topHeight ?? spec.topAboveGround,
  );
  if (!targetLayerId || !Number.isFinite(height) || height <= 0) {
    return null;
  }

  const topOffset = coerceFiniteNumber(spec.topOffset ?? spec.topYOffset ?? spec.yOffset ?? 0) || 0;
  const slices = clampValue(
    Math.round(coerceFiniteNumber(spec.slices ?? spec.strips ?? spec.steps ?? 24) || 24),
    4,
    80,
  );
  return { targetLayerId, height, topOffset, slices };
}

function resolveQuadTemplate(prefab) {
  const parts = prefabParts(prefab);
  for (const entry of parts) {
    const tpl = entry?.part?.propTemplate;
    if (tpl && typeof tpl === 'object') {
      const width = Number(tpl.w);
      const height = Number(tpl.h);
      if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
        return {
          width,
          height,
          url: typeof tpl.url === 'string' ? tpl.url : null,
          anchorXPct: Number.isFinite(tpl.anchorXPct) ? tpl.anchorXPct : 50,
          anchorYPct: Number.isFinite(tpl.anchorYPct) ? tpl.anchorYPct : 100,
        };
      }
    }
  }
  return null;
}

function drawImageTrapezoid(cx, img, {
  baseCenterX,
  baseY,
  topCenterX,
  topY,
  baseWidth,
  topWidth,
  slices = 24,
}) {
  if (!cx) return false;
  if (!img || !img.complete || img.__broken || img.naturalWidth <= 0 || img.naturalHeight <= 0) {
    return false;
  }

  const clampedSlices = Math.max(4, Math.min(80, Math.round(slices)));
  const leftBottom = baseCenterX - baseWidth / 2;
  const rightBottom = baseCenterX + baseWidth / 2;
  const leftTop = topCenterX - topWidth / 2;
  const rightTop = topCenterX + topWidth / 2;

  for (let i = 0; i < clampedSlices; i++) {
    const t0 = i / clampedSlices;
    const t1 = (i + 1) / clampedSlices;
    const y0 = lerpValue(baseY, topY, t0);
    const y1 = lerpValue(baseY, topY, t1);
    const left0 = lerpValue(leftBottom, leftTop, t0);
    const left1 = lerpValue(leftBottom, leftTop, t1);
    const right0 = lerpValue(rightBottom, rightTop, t0);
    const right1 = lerpValue(rightBottom, rightTop, t1);

    const destY = Math.min(y0, y1);
    const destH = Math.max(1, Math.abs(y1 - y0));
    const destLeft = Math.min(left0, left1);
    const destRight = Math.max(right0, right1);
    const destW = Math.max(1, destRight - destLeft);

    const srcY = img.naturalHeight * t0;
    const srcH = img.naturalHeight * (t1 - t0);

    cx.drawImage(img, 0, srcY, img.naturalWidth, srcH, destLeft, destY, destW, destH);
  }
  return true;
}

function teleportPlayerAboveSpawn(offset = 100) {
  const game = window.GAME || {};
  const player = game.FIGHTERS?.player;
  if (!player) {
    return false;
  }

  const spawnMeta = game.FIGHTER_SPAWNS?.player || {};
  const spawnPoint = game.spawnPoints?.player || {};
  const currentPos = player.pos || { x: 0, y: 0 };

  const spawnX = Number.isFinite(spawnMeta.x)
    ? spawnMeta.x
    : (Number.isFinite(spawnPoint.x) ? spawnPoint.x : (Number.isFinite(currentPos.x) ? currentPos.x : 0));
  const baseY = Number.isFinite(spawnMeta.y)
    ? spawnMeta.y
    : (Number.isFinite(spawnPoint.y) ? spawnPoint.y : (Number.isFinite(currentPos.y) ? currentPos.y : 0));

  const offsetMagnitude = Math.abs(Number(offset) || 0);
  const targetY = baseY - offsetMagnitude;

  player.pos = { x: spawnX, y: targetY };
  if (player.vel) {
    player.vel.x = 0;
    player.vel.y = 0;
  }
  player.onGround = false;
  player.prevOnGround = false;
  player.recovering = false;
  player.recoveryTime = 0;
  if (Number.isFinite(baseY)) {
    player.recoveryTargetY = baseY;
  }

  if (player.attack) {
    player.attack.active = false;
    player.attack.currentActiveKeys = [];
    if (player.attack.lunge) {
      player.attack.lunge.active = false;
      player.attack.lunge.paused = false;
      player.attack.lunge.distance = 0;
    }
  }
  if (player.combo) {
    player.combo.active = false;
    player.combo.sequenceIndex = 0;
    player.combo.attackDelay = 0;
  }
  if (player.aiInput) {
    player.aiInput.left = false;
    player.aiInput.right = false;
    player.aiInput.jump = false;
  }

  game.CAMERA?.makeAware?.({ reason: 'teleport', duration: 0.4 });
  return true;
}

const PREFAB_IMAGE_CACHE = new Map();
const PREFAB_FALLBACK_LOG = new Set();

function loadPrefabImage(url) {
  if (!url || typeof url !== 'string') return null;
  const existing = PREFAB_IMAGE_CACHE.get(url);
  if (existing?.img) {
    return existing.img;
  }
  if (existing?.failed) {
    return null;
  }

  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.referrerPolicy = 'no-referrer';
  img.decoding = 'async';
  img.addEventListener('error', () => {
    PREFAB_IMAGE_CACHE.set(url, { img: null, failed: true });
  });
  img.src = url;

  PREFAB_IMAGE_CACHE.set(url, { img });
  return img;
}

function prefabParts(prefab) {
  const parts = [];
  if (!prefab || typeof prefab !== 'object') {
    return parts;
  }

  const addPart = (part, source) => {
    if (!part || typeof part !== 'object') return;
    parts.push({ part, source });
  };

  if (prefab.base) {
    addPart(prefab.base, 'base');
  }

  if (Array.isArray(prefab.parts)) {
    prefab.parts.forEach((part, index) => addPart(part, `part_${index}`));
  }

  return parts;
}

function prefabPartSortKey(entry) {
  const layer = (entry?.part?.layer || '').toString().toLowerCase();
  const z = Number(entry?.part?.z);
  const rotationBias = Number(entry?.part?.drawOrder ?? entry?.part?.order ?? 0);
  const layerPriority =
    layer === 'near'
      ? 3
      : layer === 'foreground'
        ? 2
        : layer === 'mid'
          ? 1
          : 0;
  return layerPriority * 10_000 + (Number.isFinite(z) ? z : 0) * 100 + rotationBias;
}

function lerpValue(a, b, t) {
  if (!Number.isFinite(a)) a = 0;
  if (!Number.isFinite(b)) b = 0;
  return a + (b - a) * t;
}

function degToRad(deg) {
  if (!Number.isFinite(deg)) return 0;
  return (deg * Math.PI) / 180;
}

function radToDeg(rad) {
  if (!Number.isFinite(rad)) return 0;
  const oneDegRad = degToRad(1);
  if (!oneDegRad) return 0;
  return rad / oneDegRad;
}

function normalizeSandboxPosition(position) {
  if (!position || typeof position !== 'object') {
    return { x: 0, y: 0 };
  }
  const x = Number(position.x);
  const y = Number(position.y);
  return {
    x: Number.isFinite(x) ? x : 0,
    y: Number.isFinite(y) ? y : 0,
  };
}

function normalizeSandboxScale(scale) {
  if (!scale || typeof scale !== 'object') {
    return { x: 1, y: 1 };
  }
  const x = Number(scale.x);
  const y = Number(scale.y);
  const resolvedX = Number.isFinite(x) && x !== 0 ? x : 1;
  const resolvedY = Number.isFinite(y) && y !== 0 ? y : (Number.isFinite(x) && x !== 0 ? x : 1);
  return { x: resolvedX, y: resolvedY };
}

function computePoseAnchor(template) {
  const width = Number.isFinite(template?.w) ? template.w : 100;
  const height = Number.isFinite(template?.h) ? template.h : 100;
  if (template?.pivot === 'bottom') {
    return { ax: width * 0.5, ay: height };
  }
  if (template?.pivot === 'top') {
    return { ax: width * 0.5, ay: 0 };
  }
  if (template?.pivot === 'center') {
    return { ax: width * 0.5, ay: height * 0.5 };
  }
  const anchorXPct = Number.isFinite(template?.anchorXPct) ? template.anchorXPct : 50;
  const anchorYPct = Number.isFinite(template?.anchorYPct) ? template.anchorYPct : 100;
  return {
    ax: width * anchorXPct * 0.01,
    ay: height * anchorYPct * 0.01,
  };
}

function easeNormalizedValue(mode, t) {
  const value = clampValue(Number(t), 0, 1);
  if (mode === 'smoothstep') {
    return value * value * (3 - 2 * value);
  }
  if (mode === 'quadInOut') {
    if (value < 0.5) {
      return 2 * value * value;
    }
    return 1 - Math.pow(-2 * value + 2, 2) / 2;
  }
  return value;
}

function computeTFromDx(kfMeta, dxScreen) {
  const rawRadius = Number.isFinite(kfMeta?.radiusPx)
    ? kfMeta.radiusPx
    : (Number.isFinite(kfMeta?.radius) ? kfMeta.radius : 600);
  const radiusPx = Math.max(1, rawRadius);
  const rawT = -Number(dxScreen || 0) / radiusPx;
  return {
    t: clampValue(rawT, -1, 1),
    radiusPx,
  };
}

function evalKfPose(kf, t) {
  if (!kf || typeof kf !== 'object') {
    return {
      t,
      dx: 0,
      dy: 0,
      scaleX: 1,
      rotZdeg: 0,
      translateSpace: 'screen',
      order: 'scaleThenRotate',
    };
  }

  const easeMode = kf.ease || 'smoothstep';
  const left = kf.left || {};
  const center = kf.center || {};
  const right = kf.right || {};
  let from;
  let to;
  let progress;
  if (t <= 0) {
    progress = easeNormalizedValue(easeMode, (t || 0) + 1);
    from = left;
    to = center;
  } else {
    progress = easeNormalizedValue(easeMode, t || 0);
    from = center;
    to = right;
  }

  return {
    t,
    dx: lerpValue(from.dx || 0, to.dx || 0, progress),
    dy: lerpValue(from.dy || 0, to.dy || 0, progress),
    scaleX: lerpValue(from.scaleX ?? 1, to.scaleX ?? 1, progress),
    rotZdeg: lerpValue(from.rotZdeg || 0, to.rotZdeg || 0, progress),
    translateSpace: kf.translateSpace || 'screen',
    order: kf.transformOrder || 'scaleThenRotate',
  };
}

function applyPoseToContext(ctx, pose) {
  if (!pose || !ctx) return;
  const dx = Number(pose.dx) || 0;
  const dy = Number(pose.dy) || 0;
  const sx = Number.isFinite(pose.scaleX) ? pose.scaleX : 1;
  const rotation = degToRad(pose.rotZdeg || 0);
  const space = pose.translateSpace || 'screen';
  const order = pose.order || 'scaleThenRotate';

  if (space === 'screen') {
    ctx.translate(dx, dy);
  }

  if (order === 'scaleThenRotate') {
    if (sx !== 1) ctx.scale(sx, 1);
    if (rotation) ctx.rotate(rotation);
  } else {
    if (rotation) ctx.rotate(rotation);
    if (sx !== 1) ctx.scale(sx, 1);
  }

  if (space === 'local') {
    ctx.translate(dx, dy);
  }
}

function isPlayerSpawnInstance(inst) {
  return Array.isArray(inst?.tags) && inst.tags.includes('spawn:player');
}

function drawPrefabPlaceholder(cx, left, top, width, height, { label, tint } = {}) {
  const fill = tint || 'rgba(148, 163, 184, 0.28)';
  const stroke = 'rgba(100, 116, 139, 0.6)';
  cx.save();
  cx.fillStyle = fill;
  cx.strokeStyle = stroke;
  cx.lineWidth = 1.5;
  cx.fillRect(left, top, width, height);
  cx.strokeRect(left, top, width, height);
  if (label) {
    cx.fillStyle = '#e2e8f0';
    cx.font = '12px ui-monospace,Menlo,Consolas';
    cx.textBaseline = 'top';
    cx.fillText(label, left + 6, top + 6);
  }
  cx.restore();
}

function drawPrefabAsciiFallback(cx, left, top, lineHeight, lines) {
  if (!Array.isArray(lines) || !lines.length) return;
  const fontSize = Math.max(10, Math.min(14, lineHeight * 0.8));
  cx.save();
  cx.fillStyle = '#facc15';
  cx.font = `${fontSize}px ui-monospace,Menlo,Consolas`;
  cx.textBaseline = 'top';
  lines.forEach((line, index) => {
    cx.fillText(line, left + 6, top + 6 + index * lineHeight);
  });
  cx.restore();
}

function drawPrefabInstance(cx, inst, layer, groundY) {
  if (!inst) return;
  const prefab = inst.prefab;
  const pos = inst.position || {};
  const baseX = Number(pos.x) || 0;
  const baseY = Number(pos.y) || 0;
  const instanceScaleX = Number.isFinite(inst?.scale?.x)
    ? inst.scale.x
    : (Number.isFinite(inst?.scale?.y) ? inst.scale.y : 1);
  const instanceScaleY = Number.isFinite(inst?.scale?.y)
    ? inst.scale.y
    : instanceScaleX;
  const layerScale = Number.isFinite(layer?.scale) ? layer.scale : 1;
  const scaleX = instanceScaleX * layerScale;
  const scaleY = instanceScaleY * layerScale;
  const instRotationDeg = Number(inst?.rotationDeg) || 0;
  const instRotationRad = (instRotationDeg * Math.PI) / 180;

  const parts = prefabParts(prefab);
  const hasRenderableParts = parts.some((entry) => {
    const tpl = entry?.part?.propTemplate;
    return tpl && typeof tpl === 'object' && Number.isFinite(tpl.w) && Number.isFinite(tpl.h);
  });

  const drawFallbackBlock = (reason = 'missing') => {
    const baseWidth = Number(inst?.meta?.original?.w || inst?.meta?.original?.width) || 140;
    const baseHeight = Number(inst?.meta?.original?.h || inst?.meta?.original?.height) || 100;
    const width = Math.max(24, baseWidth * scaleX);
    const height = Math.max(24, baseHeight * scaleY);
    cx.save();
    cx.translate(baseX, groundY + baseY);
    if (instRotationRad) cx.rotate(instRotationRad);
    const left = -width / 2;
    const top = -height;
    const tint = reason === 'asset'
      ? 'rgba(148, 163, 184, 0.22)'
      : 'rgba(252, 211, 77, 0.28)';
    drawPrefabPlaceholder(cx, left, top, width, height, { label: inst.prefabId || prefab?.id || 'prefab', tint });
    if (prefab?.isFallback && Array.isArray(prefab.boxLines)) {
      drawPrefabAsciiFallback(cx, left, top, 14, prefab.boxLines);
    }
    cx.restore();

    const fallbackKey = prefab?.meta?.fallback?.prefabId || inst.prefabId || null;
    if (prefab?.isFallback && fallbackKey && !PREFAB_FALLBACK_LOG.has(fallbackKey)) {
      PREFAB_FALLBACK_LOG.add(fallbackKey);
      window.bootDiagnostics?.fallback?.(
        `Prefab ${fallbackKey} missing – displaying ASCII placeholder.`
      );
    }
  };

  if (!prefab || !hasRenderableParts) {
    drawFallbackBlock('asset');
    return;
  }

  const sortedParts = parts.sort((a, b) => prefabPartSortKey(a) - prefabPartSortKey(b));

  cx.save();
  cx.translate(baseX, groundY + baseY);
  if (instRotationRad) cx.rotate(instRotationRad);

  let drewAny = false;
  for (const entry of sortedParts) {
    const part = entry?.part;
    if (!part || typeof part !== 'object') continue;
    const template = part.propTemplate && typeof part.propTemplate === 'object' ? part.propTemplate : null;
    const relX = Number(part.relX) || 0;
    const relY = Number(part.relY) || 0;
    const partScaleX = scaleX * (Number.isFinite(part.scaleX) ? part.scaleX : 1);
    const partScaleY = scaleY * (Number.isFinite(part.scaleY) ? part.scaleY : (Number.isFinite(part.scaleX) ? part.scaleX : 1));
    const partRotationDeg = Number(part.rotationDeg) || 0;
    const partRotationRad = (partRotationDeg * Math.PI) / 180;

    if (!template) {
      cx.save();
      cx.translate(relX * scaleX, relY * scaleY);
      if (partRotationRad) cx.rotate(partRotationRad);
      drawPrefabPlaceholder(cx, -60, -120, 120 * partScaleX, 120 * partScaleY, {
        label: inst.prefabId || 'prefab',
      });
      cx.restore();
      continue;
    }

    const width = Math.max(1, Number(template.w) || 0) * partScaleX;
    const height = Math.max(1, Number(template.h) || 0) * partScaleY;
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      continue;
    }

    const anchorXPct = Number.isFinite(template.anchorXPct) ? template.anchorXPct : 50;
    const anchorYPct = Number.isFinite(template.anchorYPct) ? template.anchorYPct : 100;
    const anchorX = width * anchorXPct / 100;
    const anchorY = height * anchorYPct / 100;
    const url = typeof template.url === 'string' ? template.url : null;
    const img = loadPrefabImage(url);
    const ready = img && img.complete && !img.__broken && img.naturalWidth > 0 && img.naturalHeight > 0;

    cx.save();
    cx.translate(relX * scaleX, relY * scaleY);
    if (partRotationRad) cx.rotate(partRotationRad);

    if (ready) {
      cx.drawImage(img, -anchorX, -anchorY, width, height);
      drewAny = true;
    } else {
      drawPrefabPlaceholder(cx, -anchorX, -anchorY, width, height, {
        label: template.id || inst.prefabId || prefab.structureId || 'prefab',
        tint: 'rgba(148, 163, 184, 0.18)',
      });
    }

    cx.restore();
  }

  cx.restore();

  if (!drewAny) {
    drawFallbackBlock('asset');
  }
}

function createEditorPreviewSandbox() {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

  // Module-level variable for tracking logged layers
  const loggedLayers = new Set();

  const state = {
    canvas,
    ctx,
    layers: [],
    layerLookup: new Map(),
    instances: [],
    colliders: [],
    drumSkins: [],
    groundOffset: 140,
    ready: false,
    registry: null,
    detachRegistry: null,
  };

  const sandboxPartOrder = (part) => {
    const layer = (part?.layer || '').toString().toLowerCase();
    if (layer === 'far') return 0;
    if (layer === 'near') return 2;
    return 1;
  };

  const normalizeLayer = (layer, index) => {
    const safe = layer && typeof layer === 'object' ? layer : {};
    const id = typeof safe.id === 'string' && safe.id.trim() ? safe.id : `layer_${index}`;
    const name = typeof safe.name === 'string' && safe.name.trim() ? safe.name : `Layer ${index + 1}`;
    const parallaxSpeed = Number.isFinite(safe.parallaxSpeed)
      ? safe.parallaxSpeed
      : (Number.isFinite(safe.parallax) ? safe.parallax : 1);
    const offsetY = Number(safe.offsetY ?? safe.yOffset) || 0;
    const separation = Number(safe.separation ?? safe.sep) || 0;
    const scale = Number.isFinite(safe.scale) ? safe.scale : 1;
    const type = typeof safe.type === 'string' ? safe.type : 'gameplay';
    return { id, name, parallaxSpeed, offsetY, separation, scale, type, order: index };
  };

  const normalizeInstance = (inst, index, layerLookup) => {
    if (!inst || typeof inst !== 'object') return null;
    const rawLayerId = typeof inst.layerId === 'string' && inst.layerId.trim() ? inst.layerId : null;
    if (!rawLayerId || !layerLookup.has(rawLayerId)) return null;
    const prefab = inst.prefab && typeof inst.prefab === 'object' ? inst.prefab : null;
    const prefabId = typeof inst.prefabId === 'string' && inst.prefabId.trim()
      ? inst.prefabId
      : (prefab?.id && typeof prefab.id === 'string' ? prefab.id : `prefab_${index}`);
    const instanceId = typeof inst.instanceId === 'string' && inst.instanceId.trim()
      ? inst.instanceId.trim()
      : (inst.id != null ? String(inst.id) : `inst_${index}`);
    const tags = Array.isArray(inst.tags) ? inst.tags.slice() : [];
    const meta = inst.meta && typeof inst.meta === 'object' ? inst.meta : undefined;
    return {
      id: instanceId,
      prefabId,
      layerId: rawLayerId,
      position: normalizeSandboxPosition(inst.position),
      scale: normalizeSandboxScale(inst.scale),
      rotationDeg: Number(inst.rotationDeg) || 0,
      tags,
      prefab,
      meta,
    };
  };

  const normalizeCollider = (collider, index) => {
    if (!collider || typeof collider !== 'object') return null;
    const left = Number(collider.left);
    const width = Number(collider.width);
    const height = Number(collider.height);
    if (!Number.isFinite(left) || !Number.isFinite(width) || width <= 0) return null;
    if (!Number.isFinite(height) || height <= 0) return null;
    const topOffset = Number(collider.topOffset);
    const materialTypeRaw = typeof collider.materialType === 'string' ? collider.materialType.trim() : '';
    const metaMaterialType = typeof collider.meta?.materialType === 'string' ? collider.meta.materialType.trim() : '';
    const legacyStepSoundRaw = typeof collider.stepSound === 'string' ? collider.stepSound.trim() : '';
    const legacyMetaStepSound = typeof collider.meta?.stepSound === 'string' ? collider.meta.stepSound.trim() : '';
    const materialType = materialTypeRaw || metaMaterialType || legacyStepSoundRaw || legacyMetaStepSound || '';
    return {
      id: typeof collider.id === 'string' && collider.id.trim() ? collider.id.trim() : `col_${index}`,
      left,
      width,
      height,
      topOffset: Number.isFinite(topOffset) ? topOffset : 0,
      label: typeof collider.label === 'string' ? collider.label : '',
      materialType: materialType || null,
    };
  };

  const normalizeDrumSkinLayer = (drum, index, layerLookup) => {
    if (!drum || typeof drum !== 'object') return null;
    const layerA = typeof drum.layerA === 'string' && layerLookup.has(drum.layerA)
      ? drum.layerA
      : (layerLookup.keys().next().value || null);
    const layerB = typeof drum.layerB === 'string' && layerLookup.has(drum.layerB)
      ? drum.layerB
      : layerA;
    if (!layerA || !layerB) return null;
    const heightA = coerceFiniteNumber(drum.heightA) ?? 0;
    const heightB = coerceFiniteNumber(drum.heightB) ?? 0;
    const prefabId = typeof drum.prefabId === 'string' ? drum.prefabId.trim() : '';
    const textureId = typeof drum.textureId === 'string' ? drum.textureId.trim() : '';
    const prefabRef = textureId || prefabId;
    const imageURL = typeof drum.imageURL === 'string' ? drum.imageURL.trim() : '';
    const tileScale = coerceFiniteNumber(drum.tileScale) ?? 1;
    const visible = drum.visible !== false;
    const id = drum.id ?? index + 1;
    return {
      id,
      layerA,
      layerB,
      heightA,
      heightB,
      prefabId: prefabRef,
      textureId: prefabRef,
      imageURL,
      tileScale,
      visible,
    };
  };

  const resetState = () => {
    state.layers = [];
    state.layerLookup = new Map();
    state.instances = [];
    state.colliders = [];
    state.drumSkins = [];
    state.ready = false;
    state.groundOffset = 140;
  };

  const setArea = (area) => {
    if (!area || typeof area !== 'object') {
      resetState();
      return;
    }

    const normalizedLayers = Array.isArray(area.layers)
      ? area.layers.map((layer, index) => normalizeLayer(layer, index))
      : [];
    const layerLookup = new Map();
    normalizedLayers.forEach((layer, index) => {
      layerLookup.set(layer.id, { layer, order: index });
    });
    const normalizedInstances = Array.isArray(area.instances)
      ? area.instances.map((inst, index) => normalizeInstance(inst, index, layerLookup)).filter(Boolean)
      : [];
    const normalizedColliders = Array.isArray(area.colliders)
      ? area.colliders.map((col, index) => normalizeCollider(col, index)).filter(Boolean)
      : [];
    const normalizedDrumSkins = Array.isArray(area.drumSkins)
      ? area.drumSkins.map((drum, index) => normalizeDrumSkinLayer(drum, index, layerLookup)).filter(Boolean)
      : [];

    state.layers = normalizedLayers;
    state.layerLookup = layerLookup;
    state.instances = normalizedInstances;
    state.colliders = normalizedColliders;
    state.drumSkins = normalizedDrumSkins;
    const offset = Number(area?.ground?.offset);
    state.groundOffset = Number.isFinite(offset) ? offset : 140;

    // Capture proximity scale from area
    const proximityScale = area?.proximityScale ?? area?.meta?.proximityScale ?? 1;
    state.proximityScale = Number.isFinite(proximityScale) && proximityScale > 0 ? proximityScale : 1;
    console.log('[preview-sandbox] Captured proximityScale:', state.proximityScale, 'from area:', {
      direct: area?.proximityScale,
      meta: area?.meta?.proximityScale,
      final: state.proximityScale
    });

    state.ready = state.layers.length > 0;

    // Initialize physics for dynamic obstructions
    initAllObstructionPhysics(state.instances, window.CONFIG);
  };

  const detachRegistry = () => {
    if (typeof state.detachRegistry === 'function') {
      try {
        state.detachRegistry();
      } catch (_err) {
        // ignore
      }
    }
    state.detachRegistry = null;
  };

  const attachToRegistry = (registry) => {
    if (!registry || typeof registry.on !== 'function') {
      if (state.registry) {
        detachRegistry();
        state.registry = null;
        resetState();
      }
      return;
    }
    if (registry === state.registry) {
      return;
    }
    detachRegistry();
    state.registry = registry;
    state.detachRegistry = registry.on('active-area-changed', (area) => {
      setArea(area || null);
    });
    if (typeof registry.getActiveArea === 'function') {
      const active = registry.getActiveArea();
      setArea(active || null);
    }
  };

  const drawPlaceholder = (inst, layerScale, zoom, rootScreenX, rootScreenY, instRotRad) => {
    const prefab = inst.prefab;
    const baseWidth = Number(inst?.meta?.original?.w || inst?.meta?.original?.width) || 140;
    const baseHeight = Number(inst?.meta?.original?.h || inst?.meta?.original?.height) || 100;
    const scaleX = layerScale * zoom * (inst.scale?.x || 1);
    const scaleY = layerScale * zoom * (inst.scale?.y || inst.scale?.x || 1);
    const width = Math.max(24, baseWidth * scaleX);
    const height = Math.max(24, baseHeight * scaleY);
    ctx.save();
    ctx.translate(rootScreenX, rootScreenY);
    if (instRotRad) ctx.rotate(instRotRad);
    const left = -width / 2;
    const top = -height;
    const tint = prefab?.isFallback ? 'rgba(252, 211, 77, 0.28)' : 'rgba(148, 163, 184, 0.22)';
    drawPrefabPlaceholder(ctx, left, top, width, height, { label: inst.prefabId || prefab?.id || 'prefab', tint });
    if (prefab?.isFallback && Array.isArray(prefab.boxLines)) {
      drawPrefabAsciiFallback(ctx, left, top, 14, prefab.boxLines);
    }
    ctx.restore();
  };

  const drawFarBackground = (viewWidth, viewHeight) => {
    const background = resolveBackgroundForArea();
    const stops = computeSkyGradientStops(background);
    const gradient = ctx.createLinearGradient(0, 0, 0, viewHeight);
    gradient.addColorStop(0, stops.top);
    gradient.addColorStop(0.5, stops.mid);
    gradient.addColorStop(1, stops.bottom);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, viewWidth, viewHeight);

    const tilePortion = Number.isFinite(background?.layout?.tilePortion)
      ? Math.min(Math.max(background.layout.tilePortion, 0), 1)
      : 0;
    if (tilePortion <= 0) return;

    const tileHeight = viewHeight * tilePortion;
    const startY = viewHeight - tileHeight;
    const tileUrl = background?.tiles?.url;
    const tileImg = tileUrl ? loadPrefabImage(tileUrl) : null;
    const ready = tileImg && tileImg.complete && !tileImg.__broken && tileImg.naturalWidth > 0 && tileImg.naturalHeight > 0;
    let pattern = null;
    const scale = Number.isFinite(background?.tiles?.scale) ? background.tiles.scale : BACKGROUND_DEFAULTS.tileScale;
    const offsetY = Number.isFinite(background?.tiles?.offsetY) ? background.tiles.offsetY : BACKGROUND_DEFAULTS.tileOffsetY;

    if (ready) {
      pattern = ctx.createPattern(tileImg, 'repeat');
      if (pattern && typeof DOMMatrix !== 'undefined') {
        const matrix = new DOMMatrix();
        matrix.a = scale;
        matrix.d = scale;
        matrix.f = offsetY;
        pattern.setTransform(matrix);
      }
    }

    ctx.save();
    ctx.fillStyle = pattern || background?.tiles?.fallbackColor || stops.bottom;
    if (pattern) ctx.fillStyle = pattern;
    ctx.fillRect(0, startY, viewWidth, tileHeight);

    const featherHeight = Math.min(tileHeight * 0.35, 120);
    if (featherHeight > 0) {
      const fade = ctx.createLinearGradient(0, startY, 0, startY + featherHeight);
      fade.addColorStop(0, stops.bottom);
      fade.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fade;
      ctx.fillRect(0, startY, viewWidth, featherHeight);
    }
    ctx.restore();
  };

  const renderScene = ({ width, height, camX = 0, zoom = 1, groundY, camOrigin = 'left', worldWidth }) => {
    if (!state.ready || !ctx) {
      return { rendered: false, groundLine: null };
    }
    const effectiveZoom = Math.max(Number.isFinite(zoom) ? zoom : 1, 0.05);
    const viewWidth = Math.max(1, Number(width) || state.canvas?.width || 1);
    const viewHeight = Math.max(1, Number(height) || state.canvas?.height || 1);
    const cameraInputX = Number.isFinite(camX) ? camX : 0;
    const camWorldWidth = viewWidth / effectiveZoom;
    const usableWorldWidth = Number.isFinite(worldWidth) ? worldWidth : camWorldWidth;
    const camOriginMode = camOrigin === 'center' ? 'center' : 'left';
    const cameraLeftX =
      camOriginMode === 'center' ? cameraInputX - camWorldWidth * 0.5 : cameraInputX;
    const dpr = window.devicePixelRatio || 1;
    const pixelWidth = Math.round(viewWidth);
    const pixelHeight = Math.round(viewHeight);
    const targetWidth = Math.max(1, Math.round(pixelWidth));
    const targetHeight = Math.max(1, Math.round(pixelHeight));
    const deviceWidth = targetWidth * dpr;
    const deviceHeight = targetHeight * dpr;
    if (canvas.width !== deviceWidth || canvas.height !== deviceHeight) {
      canvas.width = deviceWidth;
      canvas.height = deviceHeight;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewWidth, viewHeight);
    const derivedAreaGround = state.ready && Number.isFinite(state.groundOffset)
      ? viewHeight - state.groundOffset
      : null;
    const resolvedGround = Number.isFinite(groundY)
      ? groundY
      : (Number.isFinite(derivedAreaGround) ? derivedAreaGround : computeGroundYFromConfig(window.CONFIG, viewHeight));
    const fallbackOffset = Number.isFinite(state.groundOffset) ? state.groundOffset : 140;
    const groundLine = Number.isFinite(resolvedGround)
      ? resolvedGround
      : (viewHeight - fallbackOffset);
    drawFarBackground(viewWidth, viewHeight);

    const drawDrumSkinLayer = (drum) => {
      if (!drum || drum.visible === false) return;
      const layerAEntry = state.layerLookup.get(drum.layerA);
      const layerBEntry = state.layerLookup.get(drum.layerB);
      if (!layerAEntry || !layerBEntry) return;
      const layerA = layerAEntry.layer;
      const layerB = layerBEntry.layer;
      const parallaxA = resolveLayerParallaxFactor(layerA);
      const parallaxB = resolveLayerParallaxFactor(layerB);
      const offsetA = (layerA.offsetY || 0) * effectiveZoom;
      const offsetB = (layerB.offsetY || 0) * effectiveZoom;
      const heightA = (Number(drum.heightA) || 0) * effectiveZoom;
      const heightB = (Number(drum.heightB) || 0) * effectiveZoom;
      const yA = groundLine + offsetA + heightA;
      const yB = groundLine + offsetB + heightB;
      const leftA = -cameraLeftX * parallaxA * effectiveZoom;
      const rightA = leftA + usableWorldWidth * effectiveZoom;
      const leftB = -cameraLeftX * parallaxB * effectiveZoom;
      const rightB = leftB + usableWorldWidth * effectiveZoom;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(leftA, yA);
      ctx.lineTo(rightA, yA);
      ctx.lineTo(rightB, yB);
      ctx.lineTo(leftB, yB);
      ctx.closePath();

      const img = drum.imageURL ? loadPrefabImage(drum.imageURL) : null;
      const ready = img && img.complete && !img.__broken && img.naturalWidth > 0 && img.naturalHeight > 0;
      if (ready) {
        const pattern = ctx.createPattern(img, 'repeat');
        if (pattern && typeof DOMMatrix !== 'undefined') {
          const scale = Number.isFinite(drum.tileScale) && drum.tileScale > 0 ? drum.tileScale : 1;
          const matrix = new DOMMatrix();
          matrix.a = scale;
          matrix.d = scale;
          pattern.setTransform(matrix);
        }
        if (pattern) {
          ctx.fillStyle = pattern;
          ctx.fill();
        }
      } else {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.18)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.45)';
        ctx.stroke();
      }
      ctx.restore();
    };

    state.drumSkins?.forEach(drawDrumSkinLayer);

    ctx.save();
    ctx.translate(0, viewHeight * 0.46);
    ctx.beginPath();
    ctx.moveTo(0, 20);
    const steps = 24;
    const step = viewWidth / steps;
    for (let i = 0; i <= steps; i++) {
      const h = i % 2 === 0 ? -28 : -46;
      ctx.lineTo(i * step, h);
    }
    ctx.lineTo(viewWidth, 20);
    ctx.closePath();
    ctx.fillStyle = 'rgba(22,51,33,0.9)';
    ctx.fill();
    ctx.restore();

    const renderList = [];
    // Only render static map instances (not dynamic props like bottles)
    for (const inst of state.instances) {
      const lookup = state.layerLookup.get(inst.layerId);
      if (!lookup) continue;
      renderList.push({ inst, layer: lookup.layer, order: lookup.order });
    }
    renderList.sort((a, b) => a.order - b.order);

    for (const { inst, layer } of renderList) {
      if (!layer) continue;
      if (isPlayerSpawnInstance(inst)) {
        continue;
      }
      const prefab = inst.prefab;
      const pos = inst.position || { x: 0, y: 0 };
      const parallax = Number.isFinite(layer.parallaxSpeed) ? layer.parallaxSpeed : 1;
      const baseLayerScale = Number.isFinite(layer.scale) ? layer.scale : 1;
      const proximityScale = Number.isFinite(state.proximityScale) && state.proximityScale > 0 ? state.proximityScale : 1;
      const layerScale = baseLayerScale * proximityScale;

      // Debug proximity scale application (log once per layer)
      if (!loggedLayers.has(layer.id)) {
        console.log(`[preview-sandbox] Layer "${layer.id}": baseScale=${baseLayerScale}, proximityScale=${proximityScale}, finalScale=${layerScale}`);
        loggedLayers.add(layer.id);
      }

      const instRotRad = degToRad(inst.rotationDeg || 0);
      const baseOffset = (pos.x - cameraLeftX * parallax) * effectiveZoom * proximityScale;
      const rootScreenX = baseOffset;
      const rootScreenY = groundLine + (layer.offsetY || 0) * effectiveZoom * proximityScale + pos.y * effectiveZoom * proximityScale;
      const dxScreen = baseOffset;
      const seesaw = resolveLayerGroundSeesaw(layer);
      const tiltRad = computeGroundSeesawAngle(seesaw, cameraInputX, usableWorldWidth);
      const pivotY = groundLine + seesaw.pivotYOffset;

      ctx.save();
      if (tiltRad) {
        ctx.translate(0, pivotY);
        ctx.rotate(tiltRad);
        ctx.translate(0, -pivotY);
      }

      if (!prefab || !prefab.parts || !prefab.parts.length) {
        drawPlaceholder(inst, layerScale, effectiveZoom, rootScreenX, rootScreenY, instRotRad);
        ctx.restore();
        continue;
      }

      const spanSpec = resolveStretchQuadSpec(inst);
      const targetLayerEntry = spanSpec ? state.layerLookup.get(spanSpec.targetLayerId) : null;
      if (spanSpec && targetLayerEntry) {
        const targetLayer = targetLayerEntry.layer;
        const template = resolveQuadTemplate(prefab);
        if (template) {
          const targetParallax = Number.isFinite(targetLayer?.parallaxSpeed) ? targetLayer.parallaxSpeed : 1;
          const instScaleX = Number.isFinite(inst?.scale?.x)
            ? inst.scale.x
            : (Number.isFinite(inst?.scale?.y) ? inst.scale.y : 1);
          const instScaleY = Number.isFinite(inst?.scale?.y)
            ? inst.scale.y
            : (Number.isFinite(inst?.scale?.x) ? inst.scale.x : 1);
          const baseScaleX = instScaleX * layerScale * effectiveZoom;
          const baseScaleY = instScaleY * layerScale * effectiveZoom;
          const targetLayerBaseScale = Number.isFinite(targetLayer?.scale) ? targetLayer.scale : 1;
          const topScaleX = instScaleX * targetLayerBaseScale * proximityScale * effectiveZoom;
          const topScaleY = instScaleY * targetLayerBaseScale * proximityScale * effectiveZoom;

          const baseWidth = template.width * baseScaleX;
          const baseHeight = template.height * baseScaleY;
          const topWidth = template.width * topScaleX;
          const topHeight = template.height * topScaleY;
          const anchorXPct = template.anchorXPct ?? 50;
          const anchorYPct = template.anchorYPct ?? 100;
          const baseAnchorX = baseWidth * anchorXPct / 100;
          const baseAnchorY = baseHeight * anchorYPct / 100;
          const topAnchorX = topWidth * anchorXPct / 100;
          const topAnchorY = topHeight * anchorYPct / 100;

          const baseCenterX = rootScreenX - baseAnchorX + baseWidth / 2;
          const baseY = rootScreenY - baseAnchorY + baseHeight;
          const topCenterX = (pos.x - cameraLeftX * targetParallax) * effectiveZoom * proximityScale - topAnchorX + topWidth / 2;
          const topGroundY = groundLine
            + (targetLayer?.offsetY || 0) * effectiveZoom * proximityScale
            + (pos.y + spanSpec.topOffset) * effectiveZoom * proximityScale;
          const topY = topGroundY - spanSpec.height * effectiveZoom * proximityScale - topAnchorY + topHeight;

          const img = loadPrefabImage(template.url);
          const drawn = drawImageTrapezoid(ctx, img, {
            baseCenterX,
            baseY,
            topCenterX,
            topY,
            baseWidth,
            topWidth,
            slices: spanSpec.slices,
          });
          if (drawn) {
            ctx.restore();
            continue;
          }
        }
      }

      if (prefab.isImage) {
        const part = prefab.parts[0];
        const template = part?.propTemplate || {};
        const img = loadPrefabImage(template.url);
        const ready = img && img.complete && !img.__broken && img.naturalWidth > 0 && img.naturalHeight > 0;
        const width = Number.isFinite(template.w) ? template.w : (img?.naturalWidth || 100);
        const height = Number.isFinite(template.h) ? template.h : (img?.naturalHeight || 100);
        const { ax, ay } = computePoseAnchor(template);
        ctx.save();
        ctx.translate(rootScreenX, rootScreenY);
        ctx.scale(layerScale * effectiveZoom * (inst.scale?.x || 1), layerScale * effectiveZoom * (inst.scale?.y || inst.scale?.x || 1));
        if (instRotRad) ctx.rotate(instRotRad);
        if (ready) {
          ctx.drawImage(img, -ax, -ay, width, height);
        } else {
          drawPrefabPlaceholder(ctx, -ax, -ay, width, height, {
            label: inst.prefabId || prefab?.id || 'prefab',
            tint: 'rgba(148, 163, 184, 0.18)',
          });
        }
        ctx.restore();
        ctx.restore();
        continue;
      }

      const parts = [...prefab.parts].sort((a, b) => {
        const layerDelta = sandboxPartOrder(a) - sandboxPartOrder(b);
        if (layerDelta) return layerDelta;
        const aZ = Number(a?.z) || 0;
        const bZ = Number(b?.z) || 0;
        return aZ - bZ;
      });
      const rootPart = parts.find((part) => part?.layer === 'near') || parts[0];
      const rootTemplate = rootPart?.propTemplate || null;
      if (!rootTemplate) {
        drawPlaceholder(inst, layerScale, effectiveZoom, rootScreenX, rootScreenY, instRotRad);
        ctx.restore();
        continue;
      }
      const rootRelY = Number(rootPart?.relY) || 0;
      const { t: sharedT } = computeTFromDx(rootTemplate.kf || {}, dxScreen);
      const rootPose = evalKfPose(rootTemplate.kf || {}, sharedT);

      for (const part of parts) {
        const template = part?.propTemplate || null;
        const relX = Number(part?.relX) || 0;
        const relY = Number(part?.relY) || 0;
        const partPose = evalKfPose(template?.kf || {}, sharedT);
        const width = Number.isFinite(template?.w) ? template.w : 100;
        const height = Number.isFinite(template?.h) ? template.h : 100;
        const { ax, ay } = computePoseAnchor(template || {});
        ctx.save();
        ctx.translate(rootScreenX, rootScreenY - rootRelY * layerScale * effectiveZoom);
        ctx.scale(layerScale * effectiveZoom * (inst.scale?.x || 1), layerScale * effectiveZoom * (inst.scale?.y || inst.scale?.x || 1));
        if (instRotRad) ctx.rotate(instRotRad);
        applyPoseToContext(ctx, rootPose);
        ctx.translate(relX, -relY);
        applyPoseToContext(ctx, partPose);
        const img = template?.url ? loadPrefabImage(template.url) : null;
        const ready = img && img.complete && !img.__broken && img.naturalWidth > 0 && img.naturalHeight > 0;
        if (ready) {
          ctx.drawImage(img, -ax, -ay, width, height);
        } else {
          drawPrefabPlaceholder(ctx, -ax, -ay, width, height, {
            label: part?.name || inst.prefabId || prefab?.id || 'prefab',
            tint: 'rgba(148, 163, 184, 0.18)',
          });
        }
        ctx.restore();
      }

      ctx.restore();
    }

    ctx.save();
    ctx.strokeStyle = 'rgba(250,204,21,0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, groundLine + 0.5);
    ctx.lineTo(viewWidth, groundLine + 0.5);
    ctx.stroke();
    ctx.restore();

    return { rendered: true, groundLine };
  };

  const renderAndBlit = (targetCtx, options) => {
    const result = renderScene(options || {});
    if (!result?.rendered || !targetCtx) {
      return { rendered: false, groundY: result?.groundLine ?? null };
    }
    targetCtx.save();
    targetCtx.setTransform(1, 0, 0, 1, 0, 0);
    targetCtx.drawImage(canvas, 0, 0, options.width, options.height);
    targetCtx.restore();
    return { rendered: true, groundY: result.groundLine };
  };

  /**
   * Add a dynamic instance (prop) to the game world.
   * @param {Object} instance - The instance to add, with properties:
   *   @property {string} id - Unique identifier for the prop.
   *   @property {string} prefabId - Identifier for the prefab type.
   *   @property {Object} prefab - Prefab data for the prop.
   *   @property {Object} position - Position of the prop ({ x: number, y: number }).
   *   @property {Object} scale - Scale of the prop ({ x: number, y: number }).
   *   @property {number} rotationDeg - Rotation in degrees.
   *   @property {Array<string>} tags - Tags for categorization.
   *   @property {Object} meta - Additional metadata.
   * @returns {boolean} True if the instance was successfully added, false otherwise.
   */
  const addDynamicInstance = (instance) => {
    if (!instance || typeof instance !== 'object') {
      console.warn('[props] Invalid prop instance provided');
      return false;
    }

    // Get the global props array
    const game = window.GAME || {};
    if (!game.dynamicInstances) {
      game.dynamicInstances = [];
    }

    // Props don't need layer normalization - they render in gameplay space
    // Just ensure basic structure is present
    const prop = {
      id: instance.id || `prop_${game.dynamicInstances.length}`,
      prefabId: instance.prefabId,
      prefab: instance.prefab,
      position: instance.position || { x: 0, y: 0 },
      scale: instance.scale || { x: 1, y: 1 },
      rotationDeg: instance.rotationDeg || 0,
      tags: instance.tags || [],
      meta: instance.meta || {},
    };

    // Initialize physics state (props use fighter-style physics)
    prop.physics = {
      vel: { x: 0, y: 0 },
      onGround: false,
      drag: 0.2, // Default drag coefficient
      restitution: 0.3, // Default bounce factor
    };

    // Add to the global props array
    game.dynamicInstances.push(prop);

    console.log('[props] Prop added:', prop.id, prop);
    console.log('[props] Total props:', game.dynamicInstances.length);
    return true;
  };

  return {
    attachToRegistry,
    setArea,
    renderAndBlit,
    isReady: () => state.ready,
    addDynamicInstance,
  };
}

const EDITOR_PREVIEW_SANDBOX = createEditorPreviewSandbox();

function installPreviewSandboxRegistryBridge() {
  const GAME = (window.GAME = window.GAME || {});

  // Expose the sandbox for dynamic instance spawning
  GAME.editorPreview = EDITOR_PREVIEW_SANDBOX;

  const attach = (registry) => {
    try {
      EDITOR_PREVIEW_SANDBOX.attachToRegistry(registry);
    } catch (error) {
      console.error('[preview-sandbox] Failed to attach to registry', error);
    }
  };

  let registryValue = GAME.mapRegistry || null;
  if (registryValue) {
    attach(registryValue);
  }

  try {
    Object.defineProperty(GAME, 'mapRegistry', {
      configurable: true,
      enumerable: true,
      get() {
        return registryValue;
      },
      set(value) {
        registryValue = value;
        if (value) {
          attach(value);
        }
      },
    });
  } catch (_err) {
    const existing = GAME.__onMapRegistryReadyForCamera;
    GAME.__onMapRegistryReadyForCamera = (registry) => {
      attach(registry);
      if (typeof existing === 'function' && existing !== GAME.__onMapRegistryReadyForCamera) {
        try {
          existing(registry);
        } catch (callbackError) {
          console.warn('[preview-sandbox] Registry callback failed', callbackError);
        }
      }
    };
  }
}

installPreviewSandboxRegistryBridge();

function drawEditorPreviewMap(cx, { camX, groundY, worldWidth }) {
  const area = resolveActiveParallaxArea();
  if (!area) return;

  const rawLayers = Array.isArray(area.layers) ? area.layers : [];
  if (!rawLayers.length) return;

  const instancesByLayer = new Map();
  // Only render static map instances (props render separately)
  const staticInstances = Array.isArray(area.instances) ? area.instances : [];
  for (const inst of staticInstances) {
    const layerId = inst?.layerId;
    if (!layerId) continue;
    const list = instancesByLayer.get(layerId) || [];
    list.push(inst);
    instancesByLayer.set(layerId, list);
  }

  const orderedLayers = rawLayers
    .map((layer, index) => ({ layer, index }))
    .sort((a, b) => {
      const aZ = coerceFiniteNumber(a.layer?.z);
      const bZ = coerceFiniteNumber(b.layer?.z);
      const aOrder = aZ !== null ? aZ : a.index;
      const bOrder = bZ !== null ? bZ : b.index;
      return aOrder - bOrder;
    });

  const layerById = new Map();
  orderedLayers.forEach(({ layer }) => {
    if (layer?.id) {
      layerById.set(layer.id, layer);
    }
  });

  orderedLayers.forEach(({ layer }) => {
    const layerId = layer?.id;
    if (!layerId) return;
    const instances = instancesByLayer.get(layerId);
    if (!instances?.length) return;

    const parallax = resolveLayerParallaxFactor(layer);
    const yOffset = resolveLayerOffsetY(layer);
    const seesaw = resolveLayerGroundSeesaw(layer);
    const tiltRad = computeGroundSeesawAngle(seesaw, camX, worldWidth);
    const pivotY = groundY + seesaw.pivotYOffset;
    cx.save();
    cx.translate((1 - parallax) * camX, yOffset);
    if (tiltRad) {
      cx.translate(0, pivotY);
      cx.rotate(tiltRad);
      cx.translate(0, -pivotY);
    }
    cx.globalAlpha = 1;

    for (const inst of instances) {
      const spanSpec = resolveStretchQuadSpec(inst);
      const targetLayer = spanSpec ? layerById.get(spanSpec.targetLayerId) : null;
      if (spanSpec && targetLayer) {
        const template = resolveQuadTemplate(inst.prefab);
        if (template) {
          const instScaleX = Number.isFinite(inst?.scale?.x)
            ? inst.scale.x
            : (Number.isFinite(inst?.scale?.y) ? inst.scale.y : 1);
          const instScaleY = Number.isFinite(inst?.scale?.y)
            ? inst.scale.y
            : (Number.isFinite(inst?.scale?.x) ? inst.scale.x : 1);
          const baseScaleX = instScaleX * layer.scale;
          const baseScaleY = instScaleY * layer.scale;
          const topScaleX = instScaleX * (Number.isFinite(targetLayer?.scale) ? targetLayer.scale : 1);
          const topScaleY = instScaleY * (Number.isFinite(targetLayer?.scale) ? targetLayer.scale : 1);

          const baseWidth = template.width * baseScaleX;
          const baseHeight = template.height * baseScaleY;
          const topWidth = template.width * topScaleX;
          const topHeight = template.height * topScaleY;
          const anchorXPct = template.anchorXPct ?? 50;
          const anchorYPct = template.anchorYPct ?? 100;
          const baseAnchorX = baseWidth * anchorXPct / 100;
          const baseAnchorY = baseHeight * anchorYPct / 100;
          const topAnchorX = topWidth * anchorXPct / 100;
          const topAnchorY = topHeight * anchorYPct / 100;

          const baseCenterX = inst.position.x - baseAnchorX + baseWidth / 2;
          const baseY = groundY + inst.position.y - baseAnchorY + baseHeight;
          const parallaxDelta = (parallax - resolveLayerParallaxFactor(targetLayer)) * camX;
          const offsetDeltaY = (resolveLayerOffsetY(targetLayer) - yOffset) + spanSpec.topOffset;
          const topCenterX = inst.position.x + parallaxDelta - topAnchorX + topWidth / 2;
          const topY = baseY + offsetDeltaY - spanSpec.height - topAnchorY + topHeight;

          const img = loadPrefabImage(template.url);
          const drawn = drawImageTrapezoid(cx, img, {
            baseCenterX,
            baseY,
            topCenterX,
            topY,
            baseWidth,
            topWidth,
            slices: spanSpec.slices,
          });
          if (drawn) {
            continue;
          }
        }
      }

      drawPrefabInstance(cx, inst, layer, groundY);
    }

    cx.restore();
  });
}

function drawEditorPreviewOverlays(cx, { groundY, worldWidth, zoom = 1 }) {
  cx.strokeStyle = 'rgba(255,255,255,.15)';
  cx.beginPath();
  cx.moveTo(0, groundY);
  cx.lineTo(worldWidth, groundY);
  cx.stroke();

  const preview = window.GAME?.editorPreview;
  const collider = preview?.groundCollider;
  if (collider) {
    const left = Number.isFinite(collider.left) ? collider.left : 0;
    const width = Number.isFinite(collider.width)
      ? collider.width
      : (Number.isFinite(collider.right) ? collider.right - left : null);
    const top = Number.isFinite(collider.top) ? collider.top : groundY;
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
      const top = groundY + (Number.isFinite(topOffset) ? topOffset : 0);
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
}

function drawStage(){
  if (!cx) return;
  const C = window.CONFIG || {};
  const camera = window.GAME?.CAMERA || {};
  const camX = camera.x || 0;
  const worldW = camera.worldWidth || 1600;
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : 1;
  cx.clearRect(0,0,cv.width,cv.height);
  // Removed opaque background fill to allow 3D canvas to show through
  const previewResult = EDITOR_PREVIEW_SANDBOX.renderAndBlit(cx, {
    width: cv.width,
    height: cv.height,
    camX,
    zoom,
    worldWidth: worldW,
  });

  const gyFallback = computeGroundYFromConfig(C, cv?.height);
  const gy = Number.isFinite(previewResult?.groundY) ? previewResult.groundY : gyFallback;
  const previewRendered = !!previewResult?.rendered;

  cx.save();
  const pivotY = Number.isFinite(gy) ? gy : cv.height;
  cx.translate(0, pivotY);
  cx.scale(zoom, zoom);
  cx.translate(-camX, -pivotY);

  if (!previewRendered) {
    drawEditorPreviewMap(cx, { camX, groundY: gy, worldWidth: worldW });
  }

  drawEditorPreviewOverlays(cx, { groundY: gy, worldWidth: worldW, zoom });
  cx.restore();

  cx.fillStyle = '#93c5fd';
  cx.fillText('KHY Modular Build', 14, 22);
}

/**
 * Render all dynamically spawned bottles (props) in world space.
 * Uses the same camera transform as fighters for consistent positioning.
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 */
function renderBottles(ctx) {
  if (!ctx || !window.GAME?.dynamicInstances) return;

  const camera = window.GAME?.CAMERA || {};
  const camX = camera.x || 0;
  const zoom = Number.isFinite(camera.zoom) ? camera.zoom : 1;
  const groundY = computeGroundYFromConfig(window.CONFIG || {}, cv?.height);

  // Use the same camera transform as fighters
  ctx.save();
  const pivotY = Number.isFinite(groundY) ? groundY : cv.height;
  ctx.translate(0, pivotY);
  ctx.scale(zoom, zoom);
  ctx.translate(-camX, -pivotY);

  // Render each bottle
  for (const inst of window.GAME.dynamicInstances) {
    if (!inst || !inst.position) continue;

    const prefab = inst.prefab;
    if (!prefab || !prefab.parts || !prefab.parts.length) continue;

    const pos = inst.position;
    const scaleX = inst.scale?.x || 1;
    const scaleY = inst.scale?.y || scaleX;
    const rotRad = (inst.rotationDeg || 0) * Math.PI / 180;

    // Get first part with a propTemplate
    const part = prefab.parts.find(p => p?.propTemplate);
    const template = part?.propTemplate;

    if (!template || !template.url) {
      console.warn('[renderBottles] No template or URL for bottle:', inst.id);
      continue;
    }

    const img = loadPrefabImage(template.url);
    const ready = img && img.complete && !img.__broken && img.naturalWidth > 0 && img.naturalHeight > 0;
    const width = Number.isFinite(template.w) ? template.w : (img?.naturalWidth || 100);
    const height = Number.isFinite(template.h) ? template.h : (img?.naturalHeight || 100);

    // Compute anchor point
    const ax = width * ((template.anchorXPct ?? 50) / 100);
    const ay = height * ((template.anchorYPct ?? 100) / 100);

    ctx.save();
    ctx.translate(pos.x, pos.y);  // pos.y is already relative to ground in world coords
    ctx.scale(scaleX, scaleY);
    if (rotRad) ctx.rotate(rotRad);

    if (ready) {
      ctx.drawImage(img, -ax, -ay, width, height);
    } else {
      // Placeholder
      ctx.fillStyle = 'rgba(148, 163, 184, 0.3)';
      ctx.fillRect(-ax, -ay, width, height);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.6)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-ax, -ay, width, height);
    }
    ctx.restore();
  }

  // Draw origin dots if checkbox is checked
  const showBottleOrigins = document.getElementById('showBottleOriginsCheckbox')?.checked;
  if (showBottleOrigins) {
    for (const inst of window.GAME.dynamicInstances) {
      if (!inst || !inst.position) continue;
      const pos = inst.position;

      ctx.save();
      ctx.fillStyle = 'rgba(255, 0, 255, 0.9)';
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);  // pos.y is already in world coords
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
  }

  ctx.restore();
}

let last = performance.now();
let fpsLast = performance.now();
let frames = 0;
function loop(t){
  const dt = (t - last) / 1000; last = t;
  if (window.GAME?.combat) window.GAME.combat.tick(dt);
  updateNpcSystems(dt);
  updateBountySystem(dt);

  // Update prop physics (bottles, etc.) using shared physics system
  const props = window.GAME?.dynamicInstances || [];
  if (props.length > 0) {
    updateObstructionPhysics(props, window.CONFIG, dt);
  }

  updatePoses();
  updateCamera(cv);
  drawStage();
  renderBottles(cx);
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
    lastComputedFPS = fps; // Store for debug panel
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
  const groundLine = computeGroundYFromConfig(window.CONFIG, cv?.height);
  const pivotY = Number.isFinite(groundLine) ? groundLine : cv.height;
  const verticalOffset = pivotY * (1 - zoom);
  window.GAME.MOUSE.worldX = pixelX / zoom + camX;
  window.GAME.MOUSE.worldY = (pixelY - verticalOffset) / zoom;
  window.GAME.MOUSE.hasPosition = true;
}

if (cv) {
  cv.addEventListener('mousemove', (e) => {
    if (isCoordinateCaptureActive()) return;
    updateMousePosition(e);
    window.GAME.MOUSE.isInCanvas = true;
  });

  cv.addEventListener('mouseenter', (e) => {
    if (isCoordinateCaptureActive()) return;
    updateMousePosition(e);
    window.GAME.MOUSE.isInCanvas = true;
  });

  cv.addEventListener('mouseleave', () => {
    window.GAME.MOUSE.isInCanvas = false;
  });

  // Mirror the global controls.js bindings: left click = Slot A, Shift+left = Slot B, right click = Slot C
  const canvasMouseBindings = { 0: null, 1: null, 2: null };

  cv.addEventListener('mousedown', (e) => {
    e.preventDefault();
    if (isCoordinateCaptureActive()) return;
    window.GAME.MOUSE.isDown = true;

    if (!window.GAME.combat) {
      canvasMouseBindings[e.button] = null;
      return;
    }

    let slotKey = null;
    if (e.button === 0) {
      slotKey = e.shiftKey ? 'B' : 'A';
    } else if (e.button === 2) {
      slotKey = 'C';
    }

    canvasMouseBindings[e.button] = slotKey;
    if (slotKey) {
      window.GAME.combat.slotDown(slotKey);
    }
  });

  cv.addEventListener('mouseup', (e) => {
    e.preventDefault();
    if (isCoordinateCaptureActive()) return;
    window.GAME.MOUSE.isDown = false;

    if (!window.GAME.combat) {
      canvasMouseBindings[e.button] = null;
      return;
    }

    const slotKey = canvasMouseBindings[e.button];
    canvasMouseBindings[e.button] = null;

    if (slotKey) {
      window.GAME.combat.slotUp(slotKey);
    } else if (e.button === 0) {
      // Fallback: ensure left-click slots are released if binding context was lost
      window.GAME.combat.slotUp('A');
      window.GAME.combat.slotUp('B');
    } else if (e.button === 2) {
      window.GAME.combat.slotUp('C');
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

// ============================================================================
// 3D / Runtime Debug Panel
// TODO: See docs/renderer-README.md for renderer module documentation
// ============================================================================

// State for debug panel
let gameDebugPanelInitialized = false;
let gameDebugPanelElement = null;
let gameDebugPanelUpdateHandle = null;
let lastGLTFLoadStatus = { success: null, timestamp: null, error: null };
let lastComputedFPS = 0;
const CAMERA_TRANSLATION_CLAMP = 1000000;
const CAMERA_ROTATION_CLAMP_DEG = 7200;
const cameraControlInputs = {
  position: {},
  rotation: {}
};
let cameraControlStatusEl = null;
let gameDebugInfoContainer = null;

function getActiveThreeCamera() {
  return GAME_RENDERER_3D?.camera || null;
}

function applyCameraTranslation(axis, rawValue) {
  const cam = getActiveThreeCamera();
  if (!cam || !cam.position) return;

  const clamped = clampNumber(Number(rawValue), -CAMERA_TRANSLATION_CLAMP, CAMERA_TRANSLATION_CLAMP);
  cam.position[axis] = clamped;
  if (typeof cam.updateMatrixWorld === 'function') {
    cam.updateMatrixWorld();
  }
}

function applyCameraRotation(axis, rawDegrees) {
  const cam = getActiveThreeCamera();
  if (!cam || !cam.rotation) return;

  const clampedDegrees = clampNumber(Number(rawDegrees), -CAMERA_ROTATION_CLAMP_DEG, CAMERA_ROTATION_CLAMP_DEG);
  cam.rotation[axis] = degToRad(clampedDegrees);
  if (typeof cam.updateMatrixWorld === 'function') {
    cam.updateMatrixWorld();
  }
  if (typeof cam.updateProjectionMatrix === 'function') {
    cam.updateProjectionMatrix();
  }
}

function createCameraControlRow(type, axis, label) {
  const row = document.createElement('div');
  Object.assign(row.style, {
    display: 'grid',
    gridTemplateColumns: '90px 1fr 90px',
    gap: '8px',
    alignItems: 'center'
  });

  const labelEl = document.createElement('div');
  labelEl.textContent = label;
  Object.assign(labelEl.style, {
    color: '#aaa',
    fontSize: '11px'
  });

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = type === 'rotation' ? -CAMERA_ROTATION_CLAMP_DEG : -CAMERA_TRANSLATION_CLAMP;
  slider.max = type === 'rotation' ? CAMERA_ROTATION_CLAMP_DEG : CAMERA_TRANSLATION_CLAMP;
  slider.step = type === 'rotation' ? '0.1' : '0.5';

  const input = document.createElement('input');
  input.type = 'number';
  input.min = slider.min;
  input.max = slider.max;
  input.step = type === 'rotation' ? '0.1' : '0.01';
  Object.assign(input.style, {
    width: '100%',
    background: '#111',
    color: '#e0e0e0',
    border: '1px solid #444',
    borderRadius: '3px',
    padding: '2px 6px',
    fontSize: '11px'
  });

  slider.addEventListener('input', () => {
    input.value = slider.value;
    if (type === 'rotation') {
      applyCameraRotation(axis, slider.value);
    } else {
      applyCameraTranslation(axis, slider.value);
    }
  });

  input.addEventListener('input', () => {
    const numeric = Number(input.value);
    if (!Number.isFinite(numeric)) return;
    slider.value = clampNumber(numeric, Number(slider.min), Number(slider.max));
    if (type === 'rotation') {
      applyCameraRotation(axis, slider.value);
    } else {
      applyCameraTranslation(axis, slider.value);
    }
  });

  cameraControlInputs[type][axis] = { slider, input };

  row.appendChild(labelEl);
  row.appendChild(slider);
  row.appendChild(input);

  return row;
}

function syncCameraControlState() {
  const cam = getActiveThreeCamera();
  const hasCamera = Boolean(cam);
  if (cameraControlStatusEl) {
    cameraControlStatusEl.textContent = hasCamera
      ? 'Live editing camera position & rotation (deg)' : '3D camera unavailable';
    cameraControlStatusEl.style.color = hasCamera ? '#9f9' : '#f99';
  }

  const axes = ['x', 'y', 'z'];
  axes.forEach((axis) => {
    const pos = cameraControlInputs.position[axis];
    const rot = cameraControlInputs.rotation[axis];

    if (pos) {
      pos.slider.disabled = !hasCamera;
      pos.input.disabled = !hasCamera;
      if (hasCamera && document.activeElement !== pos.input) {
        const value = Number(cam.position?.[axis]) || 0;
        pos.slider.value = clampNumber(value, Number(pos.slider.min), Number(pos.slider.max));
        pos.input.value = value.toFixed(3);
      }
    }

    if (rot) {
      rot.slider.disabled = !hasCamera;
      rot.input.disabled = !hasCamera;
      if (hasCamera && document.activeElement !== rot.input) {
        const degrees = radToDeg(Number(cam.rotation?.[axis]) || 0);
        const clamped = clampNumber(degrees, Number(rot.slider.min), Number(rot.slider.max));
        rot.slider.value = clamped;
        rot.input.value = clamped.toFixed(3);
      }
    }
  });
}

/**
 * Initialize the 3D/Runtime debug panel.
 * Creates a panel below #gameStage showing real-time 3D renderer status.
 * Panel is collapsible with state persisted in sessionStorage.
 */
function initGameDebugPanel() {
  if (gameDebugPanelInitialized) return;
  
  try {
    // Find gameStage element
    const gameStage = document.getElementById('gameStage');
    const insertTarget = gameStage || document.body;
    
    // Create panel container
    const panel = document.createElement('div');
    panel.id = 'gameDebugPanel';
    
    // Apply inline styles for the panel container
    Object.assign(panel.style, {
      position: 'relative',
      width: '100%',
      maxWidth: '800px',
      margin: '8px auto',
      backgroundColor: '#1a1a1a',
      border: '1px solid #444',
      borderRadius: '4px',
      fontFamily: 'monospace',
      fontSize: '12px',
      color: '#e0e0e0',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
    });
    
    // Create header with toggle button
    const header = document.createElement('div');
    Object.assign(header.style, {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '8px 12px',
      backgroundColor: '#2a2a2a',
      borderBottom: '1px solid #444',
      cursor: 'pointer'
    });
    
    const title = document.createElement('div');
    title.textContent = '3D / Runtime Debug';
    Object.assign(title.style, {
      fontWeight: 'bold',
      fontSize: '13px'
    });
    
    const toggleBtn = document.createElement('button');
    toggleBtn.textContent = '▼';
    toggleBtn.setAttribute('aria-label', 'Toggle debug panel');
    toggleBtn.setAttribute('tabindex', '0');
    Object.assign(toggleBtn.style, {
      background: 'none',
      border: '1px solid #555',
      color: '#e0e0e0',
      cursor: 'pointer',
      padding: '2px 8px',
      borderRadius: '3px',
      fontSize: '12px'
    });
    
    header.appendChild(title);
    header.appendChild(toggleBtn);
    
    // Create body with debug info
    const body = document.createElement('div');
    body.id = 'gameDebugPanelBody';
    Object.assign(body.style, {
      padding: '12px',
      maxHeight: '400px',
      overflowY: 'auto',
      display: 'block'
    });

    // Camera manipulation controls
    const cameraControls = document.createElement('div');
    cameraControls.id = 'gameDebugCameraControls';
    Object.assign(cameraControls.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '10px',
      paddingBottom: '12px',
      borderBottom: '1px solid #333',
      marginBottom: '12px'
    });

    const cameraTitle = document.createElement('div');
    cameraTitle.textContent = 'Camera translation & rotation (deg)';
    Object.assign(cameraTitle.style, {
      fontWeight: 'bold',
      fontSize: '12px'
    });

    cameraControlStatusEl = document.createElement('div');
    Object.assign(cameraControlStatusEl.style, {
      fontSize: '11px',
      color: '#999'
    });

    const cameraGrid = document.createElement('div');
    Object.assign(cameraGrid.style, {
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    });

    cameraGrid.appendChild(createCameraControlRow('position', 'x', 'Translate X'));
    cameraGrid.appendChild(createCameraControlRow('position', 'y', 'Translate Y'));
    cameraGrid.appendChild(createCameraControlRow('position', 'z', 'Translate Z'));
    cameraGrid.appendChild(createCameraControlRow('rotation', 'x', 'Rotate X (deg)'));
    cameraGrid.appendChild(createCameraControlRow('rotation', 'y', 'Rotate Y (deg)'));
    cameraGrid.appendChild(createCameraControlRow('rotation', 'z', 'Rotate Z (deg)'));

    const cameraClampHint = document.createElement('div');
    cameraClampHint.textContent = `Clamps: ±${CAMERA_TRANSLATION_CLAMP.toLocaleString()} units, ±${CAMERA_ROTATION_CLAMP_DEG}°`;
    Object.assign(cameraClampHint.style, {
      fontSize: '10px',
      color: '#777'
    });

    cameraControls.appendChild(cameraTitle);
    cameraControls.appendChild(cameraControlStatusEl);
    cameraControls.appendChild(cameraGrid);
    cameraControls.appendChild(cameraClampHint);

    body.appendChild(cameraControls);

    gameDebugInfoContainer = document.createElement('div');
    gameDebugInfoContainer.id = 'gameDebugInfoGrid';
    body.appendChild(gameDebugInfoContainer);
    
    // Create action buttons container in header
    const actionsContainer = document.createElement('div');
    Object.assign(actionsContainer.style, {
      display: 'flex',
      gap: '6px',
      marginLeft: 'auto',
      marginRight: '8px'
    });
    
    // Reload 3D button
    const reloadBtn = document.createElement('button');
    reloadBtn.textContent = 'Reload 3D';
    reloadBtn.setAttribute('tabindex', '0');
    Object.assign(reloadBtn.style, {
      background: '#3a5a7a',
      border: 'none',
      color: '#fff',
      cursor: 'pointer',
      padding: '4px 10px',
      borderRadius: '3px',
      fontSize: '11px'
    });
    reloadBtn.addEventListener('click', handleReload3D);
    
    // Dispose 3D button
    const disposeBtn = document.createElement('button');
    disposeBtn.textContent = 'Dispose 3D';
    disposeBtn.setAttribute('tabindex', '0');
    Object.assign(disposeBtn.style, {
      background: '#7a3a3a',
      border: 'none',
      color: '#fff',
      cursor: 'pointer',
      padding: '4px 10px',
      borderRadius: '3px',
      fontSize: '11px'
    });
    disposeBtn.addEventListener('click', handleDispose3D);
    
    // Open 3D in new tab button
    const openBtn = document.createElement('button');
    openBtn.textContent = 'Open 3D ↗';
    openBtn.id = 'gameDebugOpen3DBtn';
    openBtn.setAttribute('tabindex', '0');
    Object.assign(openBtn.style, {
      background: '#5a7a3a',
      border: 'none',
      color: '#fff',
      cursor: 'pointer',
      padding: '4px 10px',
      borderRadius: '3px',
      fontSize: '11px'
    });
    openBtn.addEventListener('click', handleOpen3D);
    
    actionsContainer.appendChild(reloadBtn);
    actionsContainer.appendChild(disposeBtn);
    actionsContainer.appendChild(openBtn);
    header.insertBefore(actionsContainer, toggleBtn);
    
    // Status message line for action feedback
    const statusLine = document.createElement('div');
    statusLine.id = 'gameDebugStatusLine';
    Object.assign(statusLine.style, {
      padding: '6px 12px',
      backgroundColor: '#2a4a2a',
      color: '#8f8',
      fontSize: '11px',
      borderBottom: '1px solid #444',
      display: 'none'
    });
    
    panel.appendChild(header);
    panel.appendChild(statusLine);
    panel.appendChild(body);
    
    // Insert after gameStage or at end of body
    if (gameStage && gameStage.nextSibling) {
      insertTarget.parentNode.insertBefore(panel, gameStage.nextSibling);
    } else if (gameStage) {
      gameStage.parentNode.appendChild(panel);
    } else {
      insertTarget.appendChild(panel);
    }
    
    // Set up toggle functionality
    const collapsed = sessionStorage.getItem('gameDebugPanelCollapsed') === 'true';
    if (collapsed) {
      body.style.display = 'none';
      statusLine.style.display = 'none';
      toggleBtn.textContent = '▶';
    }
    
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isCollapsed = body.style.display === 'none';
      body.style.display = isCollapsed ? 'block' : 'none';
      statusLine.style.display = isCollapsed ? 'block' : 'none';
      toggleBtn.textContent = isCollapsed ? '▼' : '▶';
      sessionStorage.setItem('gameDebugPanelCollapsed', isCollapsed ? 'false' : 'true');
    });
    
    header.addEventListener('click', (e) => {
      if (e.target === header || e.target === title) {
        toggleBtn.click();
      }
    });
    
    gameDebugPanelElement = panel;
    gameDebugPanelInitialized = true;
    
    // Start update loop
    startGameDebugPanelUpdates();
    
    console.log('[app] 3D/Runtime debug panel initialized');
  } catch (error) {
    console.error('[app] Failed to initialize game debug panel:', error);
  }
}

/**
 * Start the update loop for the debug panel.
 * Updates display values ~4x per second.
 */
function startGameDebugPanelUpdates() {
  if (gameDebugPanelUpdateHandle) return;
  
  let lastUpdate = 0;
  const UPDATE_INTERVAL = 250; // Update 4x per second
  
  const update = () => {
    const now = performance.now();
    if (now - lastUpdate >= UPDATE_INTERVAL) {
      updateGameDebugPanel();
      lastUpdate = now;
    }
    gameDebugPanelUpdateHandle = requestAnimationFrame(update);
  };
  
  gameDebugPanelUpdateHandle = requestAnimationFrame(update);
}

/**
 * Update the debug panel with current runtime values.
 */
function updateGameDebugPanel() {
  if (!gameDebugPanelElement) return;
  
  try {
    const body = document.getElementById('gameDebugPanelBody');
    if (!body || body.style.display === 'none') return;

    const infoContainer = gameDebugInfoContainer || document.getElementById('gameDebugInfoGrid');
    if (!infoContainer) return;

    syncCameraControlState();

    // Gather status information
    const bootStatus = window.GAME?.bootComplete ? 'booted' : 'booting...';
    const moduleStatus = getRendererModuleStatus();
    const threeJsStatus = moduleStatus === 'loaded'
      ? (rendererSupportsThree() ? 'available' : 'missing')
      : moduleStatus.replace('_', ' ');
    
    let rendererStatus = 'not initialized';
    if (GAME_RENDERER_3D) {
      rendererStatus = GAME_RENDERER_3D.initialized ? 'initialized' : 'initializing...';
    }
    if (window.GAME?.renderer3d && !GAME_RENDERER_3D) {
      rendererStatus = 'error';
    }
    
    const registry = window.GAME?.mapRegistry;
    const activeArea = registry && typeof registry.getActiveArea === 'function' 
      ? registry.getActiveArea() 
      : null;
    const activeAreaId = activeArea?.id || window.GAME?.currentAreaId || '—';
    const scene3dUrl = activeArea?.scene3d?.sceneUrl || '—';
    
    const gltfStatus = lastGLTFLoadStatus.success === true 
      ? `✓ Success (${new Date(lastGLTFLoadStatus.timestamp).toLocaleTimeString()})`
      : lastGLTFLoadStatus.success === false
      ? `✗ Failed (${lastGLTFLoadStatus.error || 'unknown error'})`
      : '—';
    
    let cameraInfo = '—';
    if (GAME_RENDERER_3D?.camera) {
      const cam = GAME_RENDERER_3D.camera;
      const pos = cam.position || {};
      const fov = cam.fov || '—';
      cameraInfo = `pos: (${fmt(pos.x, 1)}, ${fmt(pos.y, 1)}, ${fmt(pos.z, 1)}), fov: ${fov}`;
    }
    
    const canvas2D = cv;
    const canvas2DSize = canvas2D 
      ? `${canvas2D.width} × ${canvas2D.height}` 
      : '—';
    
    let canvas3DSize = '—';
    if (GAME_RENDERER_3D?.renderer?.domElement) {
      const el = GAME_RENDERER_3D.renderer.domElement;
      canvas3DSize = `${el.width} × ${el.height}`;
    }
    
    const fpsDisplay = lastComputedFPS || 0;
    
    // Update "Open 3D" button state
    const openBtn = document.getElementById('gameDebugOpen3DBtn');
    if (openBtn) {
      if (scene3dUrl && scene3dUrl !== '—') {
        openBtn.disabled = false;
        openBtn.style.opacity = '1';
        openBtn.style.cursor = 'pointer';
      } else {
        openBtn.disabled = true;
        openBtn.style.opacity = '0.5';
        openBtn.style.cursor = 'not-allowed';
      }
    }
    
    // Build HTML
    const html = `
      <div style="display: grid; grid-template-columns: 180px 1fr; gap: 8px 12px; line-height: 1.6;">
        <div style="color: #999;">App boot status:</div>
        <div>${bootStatus}</div>
        
        <div style="color: #999;">Three.js status:</div>
        <div>${threeJsStatus}</div>
        
        <div style="color: #999;">Renderer status:</div>
        <div>${rendererStatus}</div>
        
        <div style="color: #999;">Active area ID:</div>
        <div style="word-break: break-all;">${activeAreaId}</div>
        
        <div style="color: #999;">Active scene3d URL:</div>
        <div style="word-break: break-all; font-size: 11px;">${scene3dUrl}</div>
        
        <div style="color: #999;">GLTF load status:</div>
        <div>${gltfStatus}</div>
        
        <div style="color: #999;">Camera info:</div>
        <div style="font-size: 11px;">${cameraInfo}</div>
        
        <div style="color: #999;">2D canvas size:</div>
        <div>${canvas2DSize}</div>
        
        <div style="color: #999;">3D canvas size:</div>
        <div>${canvas3DSize}</div>
        
        <div style="color: #999;">FPS:</div>
        <div>${fpsDisplay}</div>
      </div>
    `;

    infoContainer.innerHTML = html;
  } catch (error) {
    console.error('[app] Error updating game debug panel:', error);
  }
}

/**
 * Handle "Reload 3D" action.
 * Re-loads the current area's scene3d into the renderer.
 */
async function handleReload3D() {
  console.log('[app] Reload 3D action triggered');

  try {
    const rendererModules = await ensureRendererModules();
    const adaptScene3dToRenderer = rendererModules?.adaptScene3dToRenderer;
    if (typeof adaptScene3dToRenderer !== 'function') {
      showDebugPanelStatus('3D renderer unavailable', 'error');
      console.warn('[app] Cannot reload 3D: renderer module unavailable');
      return;
    }

    const registry = window.GAME?.mapRegistry;
    const activeArea = registry && typeof registry.getActiveArea === 'function'
      ? registry.getActiveArea()
      : null;
    
    if (!activeArea || !activeArea.scene3d || !activeArea.scene3d.sceneUrl) {
      showDebugPanelStatus('No active scene3d to reload', 'error');
      console.warn('[app] No active scene3d to reload');
      return;
    }
    
    if (!GAME_RENDERER_3D) {
      showDebugPanelStatus('Renderer not initialized', 'error');
      console.warn('[app] Cannot reload 3D: renderer not initialized');
      return;
    }
    
    // Dispose previous adapter
    if (GAME_RENDER_ADAPTER && typeof GAME_RENDER_ADAPTER.dispose === 'function') {
      GAME_RENDER_ADAPTER.dispose();
      GAME_RENDER_ADAPTER = null;
    }
    
    // Reload scene
    showDebugPanelStatus('Reloading 3D scene...', 'info');
    
    adaptScene3dToRenderer(GAME_RENDERER_3D, activeArea.scene3d)
      .then(adapter => {
        GAME_RENDER_ADAPTER = adapter;
        if (adapter && !adapter.error) {
          lastGLTFLoadStatus = { success: true, timestamp: Date.now(), error: null };
          showDebugPanelStatus('✓ 3D scene reloaded successfully', 'success');
          console.log('[app] 3D scene reloaded successfully');
        } else {
          lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: adapter?.error || 'unknown' };
          showDebugPanelStatus('✗ Failed to reload 3D scene', 'error');
          console.warn('[app] Failed to reload 3D scene:', adapter?.error);
        }
      })
      .catch(error => {
        lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: error.message };
        showDebugPanelStatus('✗ Error reloading 3D scene', 'error');
        console.error('[app] Error reloading 3D scene:', error);
      });
  } catch (error) {
    console.error('[app] Error in handleReload3D:', error);
    showDebugPanelStatus('✗ Error during reload', 'error');
  }
}

/**
 * Handle "Dispose 3D" action.
 * Disposes the adapter and renderer, cleaning up resources.
 */
function handleDispose3D() {
  console.log('[app] Dispose 3D action triggered');

  try {
    let disposed = false;

    // Dispose adapters
    if (GAME_RENDER_ADAPTER && typeof GAME_RENDER_ADAPTER.dispose === 'function') {
      GAME_RENDER_ADAPTER.dispose();
      GAME_RENDER_ADAPTER = null;
      disposed = true;
      console.log('[app] 3D adapter disposed');
    }

    if (GAME_VISUALSMAP_ADAPTER && typeof GAME_VISUALSMAP_ADAPTER.dispose === 'function') {
      GAME_VISUALSMAP_ADAPTER.dispose();
      GAME_VISUALSMAP_ADAPTER = null;
      disposed = true;
      console.log('[app] Visualsmap adapter disposed');
    }
    
    // Dispose renderer
    if (GAME_RENDERER_3D && typeof GAME_RENDERER_3D.dispose === 'function') {
      GAME_RENDERER_3D.dispose();
      GAME_RENDERER_3D = null;
      window.GAME.renderer3d = null;
      disposed = true;
      console.log('[app] 3D renderer disposed');
    }
    
    if (disposed) {
      showDebugPanelStatus('✓ 3D resources disposed', 'success');
    } else {
      showDebugPanelStatus('No 3D resources to dispose', 'info');
      console.log('[app] No 3D resources to dispose');
    }
  } catch (error) {
    console.error('[app] Error disposing 3D:', error);
    showDebugPanelStatus('✗ Error during dispose', 'error');
  }
}

/**
 * Handle "Open 3D in new tab" action.
 * Opens the current scene3d URL in a new browser tab.
 */
function handleOpen3D() {
  console.log('[app] Open 3D in new tab action triggered');
  
  try {
    const registry = window.GAME?.mapRegistry;
    const activeArea = registry && typeof registry.getActiveArea === 'function'
      ? registry.getActiveArea()
      : null;
    
    const sceneUrl = activeArea?.scene3d?.sceneUrl;
    
    if (!sceneUrl || sceneUrl === '—') {
      showDebugPanelStatus('No scene3d URL available', 'error');
      console.warn('[app] No scene3d URL to open');
      return;
    }
    
    window.open(sceneUrl, '_blank', 'noopener,noreferrer');
    showDebugPanelStatus('✓ Opened in new tab', 'success');
    console.log('[app] Opened scene3d in new tab:', sceneUrl);
  } catch (error) {
    console.error('[app] Error opening 3D in new tab:', error);
    showDebugPanelStatus('✗ Error opening new tab', 'error');
  }
}

/**
 * Show a status message in the debug panel.
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 */
function showDebugPanelStatus(message, type = 'info') {
  const statusLine = document.getElementById('gameDebugStatusLine');
  if (!statusLine) return;
  
  statusLine.textContent = message;
  statusLine.style.display = 'block';
  
  // Color based on type
  if (type === 'success') {
    statusLine.style.backgroundColor = '#2a4a2a';
    statusLine.style.color = '#8f8';
  } else if (type === 'error') {
    statusLine.style.backgroundColor = '#4a2a2a';
    statusLine.style.color = '#f88';
  } else {
    statusLine.style.backgroundColor = '#2a3a4a';
    statusLine.style.color = '#8cf';
  }
  
  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusLine.style.display = 'none';
  }, 3000);
}

// Helper function for formatting numbers (reuse from existing code)
function fmt(val, decimals = 0) {
  if (val == null || !Number.isFinite(val)) return '—';
  return Number(val).toFixed(decimals);
}

function boot(){
  try {
    if (statusInfo) statusInfo.textContent = 'Booted';
    initPresets();
    ensureAltSequenceUsesKickAlt();
    initFighters(cv, cx, { spawnNpc: false });
    initNpcSystems();
    initBountySystem();
    initControls();
    initCombat();
    initHitDetect();
    initDebugPanel();
    initTouchControls();
    if (shouldEnableArchHud()) {
      archTouchHandle?.destroy?.();
      archTouchHandle = initArchTouchInput({
        input: window.GAME?.input || null,
        config: window.CONFIG?.hud?.arch,
        enabled: true,
      });
    }
    initSelectionDropdowns();
    initGameDebugPanel(); // Initialize 3D/Runtime debug panel
    requestAnimationFrame(loop);
    setTimeout(()=>{ const p=$$('#interactPrompt'); show(p,true); setTimeout(()=>show(p,false),1200); }, 600);
    // Mark boot as complete for debug panel
    window.GAME.bootComplete = true;
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
  try {
    if (typeof window !== 'undefined' && typeof window.__waitForLoadoutReady === 'function') {
      await window.__waitForLoadoutReady();
    }
  } catch (error) {
    console.warn('[app] Loadout stage failed to resolve', error);
  }

  // Initialize 3D background renderer (optional, requires global THREE)
  // TODO: Ensure THREE is loaded globally before this runs (via CDN or bundler)
  // See docs/renderer-README.md for usage and requirements
  try {
    const rendererModules = await ensureRendererModules();
    const createRenderer = rendererModules?.createRenderer;
    const adaptScene3dToRenderer = rendererModules?.adaptScene3dToRenderer;

    if (rendererSupportsThree() && typeof createRenderer === 'function') {
      console.log('[app] Three.js detected - initializing 3D background renderer');

      // Get or create container for 3D canvas
      const stageEl = document.getElementById('gameStage');
      if (!stageEl) {
        console.warn('[app] gameStage element not found - skipping 3D background setup');
      } else {
        // Create or reuse #3d-background container
        THREE_BG_CONTAINER = document.getElementById('3d-background');
        if (!THREE_BG_CONTAINER) {
          THREE_BG_CONTAINER = document.createElement('div');
          THREE_BG_CONTAINER.id = '3d-background';
          THREE_BG_CONTAINER.style.position = 'absolute';
          THREE_BG_CONTAINER.style.left = '0';
          THREE_BG_CONTAINER.style.top = '0';
          THREE_BG_CONTAINER.style.width = '100%';
          THREE_BG_CONTAINER.style.height = '100%';
          THREE_BG_CONTAINER.style.zIndex = '0';
          THREE_BG_CONTAINER.style.overflow = 'hidden';
          stageEl.insertBefore(THREE_BG_CONTAINER, stageEl.firstChild);
        }

        // Ensure stage is above 3D background
        if (!stageEl.style.zIndex || parseInt(stageEl.style.zIndex) < 1) {
          stageEl.style.zIndex = '1';
        }

        // Get dimensions
        const rect = stageEl.getBoundingClientRect();
        const width = rect.width || 800;
        const height = rect.height || 600;

        // Create renderer
        GAME_RENDERER_3D = createRenderer({
          container: THREE_BG_CONTAINER,
          width,
          height,
          pixelRatio: window.devicePixelRatio || 1,
          clearColor: 0x0b1220 // Match default background color
        });

        // Initialize renderer
        await GAME_RENDERER_3D.init();

        // Configure renderer canvas to not intercept pointer events
        if (GAME_RENDERER_3D.renderer?.domElement) {
          GAME_RENDERER_3D.renderer.domElement.style.position = 'absolute';
          GAME_RENDERER_3D.renderer.domElement.style.left = '0';
          GAME_RENDERER_3D.renderer.domElement.style.top = '0';
          GAME_RENDERER_3D.renderer.domElement.style.width = '100%';
          GAME_RENDERER_3D.renderer.domElement.style.height = '100%';
          GAME_RENDERER_3D.renderer.domElement.style.pointerEvents = 'none';
          GAME_RENDERER_3D.renderer.domElement.style.zIndex = '0';
        }

        // Start animation loop
        if (typeof GAME_RENDERER_3D.start === 'function') {
          GAME_RENDERER_3D.start();
        }

        // Add camera synchronization (Pattern A: move 3D camera with game camera)
        if (typeof GAME_RENDERER_3D.on === 'function') {
          GAME_RENDERER_3D.on('frame', () => {
            try {
              const gameCamera = window.GAME?.CAMERA;
              if (gameCamera && GAME_RENDERER_3D) {
                syncThreeCamera({
                  renderer: GAME_RENDERER_3D,
                  gameCamera: gameCamera,
                  config: {
                    parallaxFactor: 0.5,   // Half-speed parallax for depth effect
                    cameraHeight: 30,       // Elevated view angle
                    cameraDistance: 50,     // Distance from scene
                    lookAtOffsetY: 0        // Look at ground level
                  }
                });
              }
            } catch (err) {
              // Silently handle sync errors to avoid breaking render loop
              if (window.DEBUG_CAMERA_SYNC) {
                console.warn('[app] Camera sync error:', err);
              }
            }
          });
        }

        // Add resize handler
        THREE_BG_RESIZE_HANDLER = () => {
          if (!GAME_RENDERER_3D || !THREE_BG_CONTAINER) return;
          const rect = stageEl.getBoundingClientRect();
          const width = rect.width || 800;
          const height = rect.height || 600;
          if (typeof GAME_RENDERER_3D.resize === 'function') {
            GAME_RENDERER_3D.resize(width, height);
          }
          if (GAME_RENDERER_3D.renderer) {
            GAME_RENDERER_3D.renderer.setPixelRatio(window.devicePixelRatio || 1);
          }
        };
        window.addEventListener('resize', THREE_BG_RESIZE_HANDLER);

        // Hook into MapRegistry to load scene3d when active area changes
        const registry = window.GAME?.mapRegistry;
        if (registry && typeof registry.on === 'function') {
          registry.on('active-area-changed', async (area) => {
            try {
              // Dispose previous adapters if exist
              if (GAME_RENDER_ADAPTER && typeof GAME_RENDER_ADAPTER.dispose === 'function') {
                GAME_RENDER_ADAPTER.dispose();
                GAME_RENDER_ADAPTER = null;
              }
              if (GAME_VISUALSMAP_ADAPTER && typeof GAME_VISUALSMAP_ADAPTER.dispose === 'function') {
                GAME_VISUALSMAP_ADAPTER.dispose();
                GAME_VISUALSMAP_ADAPTER = null;
              }

              // Load visualsmap if available (preferred)
              if (area && area.visualsMap) {
                try {
                  console.log('[app] Loading visualsmap for area:', area.id, area.visualsMap);
                  const visualsmapLoader = await getVisualsmapLoader();
                  const gameplayMapUrl = area.source || ''; // URL of the gameplaymap.json
                  GAME_VISUALSMAP_ADAPTER = await visualsmapLoader.loadVisualsMap(GAME_RENDERER_3D, area, gameplayMapUrl);
                  window.GAME.visualsmapAdapter = GAME_VISUALSMAP_ADAPTER; // Expose for debugging
                  if (GAME_VISUALSMAP_ADAPTER && GAME_VISUALSMAP_ADAPTER.objects.length > 0) {
                    console.log('[app] Visualsmap loaded successfully:', GAME_VISUALSMAP_ADAPTER.objects.length, 'objects');
                    lastGLTFLoadStatus = { success: true, timestamp: Date.now(), error: null };
                  } else {
                    console.warn('[app] Visualsmap loaded but no objects found');
                    lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: 'No objects loaded' };
                  }
                } catch (error) {
                  console.error('[app] Error loading visualsmap:', error);
                  lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: error.message };
                }
              }
              // Fallback: Load single scene3d.sceneUrl if available and no visualsMap
              else if (area && area.scene3d && area.scene3d.sceneUrl && typeof adaptScene3dToRenderer === 'function') {
                console.log('[app] Loading 3D scene for area:', area.id, area.scene3d.sceneUrl);
                GAME_RENDER_ADAPTER = await adaptScene3dToRenderer(GAME_RENDERER_3D, area.scene3d);
                window.GAME.renderAdapter = GAME_RENDER_ADAPTER; // Expose for debugging
                if (GAME_RENDER_ADAPTER && !GAME_RENDER_ADAPTER.error) {
                  console.log('[app] 3D scene loaded successfully');
                  lastGLTFLoadStatus = { success: true, timestamp: Date.now(), error: null };
                } else {
                  console.warn('[app] Failed to load 3D scene:', GAME_RENDER_ADAPTER?.error);
                  lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: GAME_RENDER_ADAPTER?.error || 'unknown' };
                }
              }
            } catch (error) {
              console.error('[app] Error loading 3D scene:', error);
              lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: error.message };
            }
          });

          // Try to load initial area
          try {
            const activeArea = typeof registry.getActiveArea === 'function'
              ? registry.getActiveArea()
              : null;
            const fallbackAreaId = window.GAME?.currentAreaId || window.CONFIG?.areas;
            const areaToLoad = activeArea || (fallbackAreaId && typeof registry.getArea === 'function'
              ? registry.getArea(fallbackAreaId)
              : null);

            // DEBUG: Log area properties
            console.log('[app] Initial area to load:', areaToLoad?.id, 'has visualsMap:', !!areaToLoad?.visualsMap, 'has scene3d:', !!areaToLoad?.scene3d);
            if (areaToLoad) {
              console.log('[app] Area properties:', Object.keys(areaToLoad));
            }

            // Load visualsmap if available (preferred)
            if (areaToLoad && areaToLoad.visualsMap) {
              console.log('[app] Loading initial visualsmap:', areaToLoad.id);
              const visualsmapLoader = await getVisualsmapLoader();
              const gameplayMapUrl = areaToLoad.source || '';
              GAME_VISUALSMAP_ADAPTER = await visualsmapLoader.loadVisualsMap(GAME_RENDERER_3D, areaToLoad, gameplayMapUrl);
              window.GAME.visualsmapAdapter = GAME_VISUALSMAP_ADAPTER; // Expose for debugging
              if (GAME_VISUALSMAP_ADAPTER && GAME_VISUALSMAP_ADAPTER.objects.length > 0) {
                lastGLTFLoadStatus = { success: true, timestamp: Date.now(), error: null };
              } else {
                lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: 'No objects loaded' };
              }
            }
            // Fallback: Load single scene3d.sceneUrl if available and no visualsMap
            else if (areaToLoad && areaToLoad.scene3d && areaToLoad.scene3d.sceneUrl && typeof adaptScene3dToRenderer === 'function') {
              console.log('[app] Loading initial 3D scene:', areaToLoad.id);
              GAME_RENDER_ADAPTER = await adaptScene3dToRenderer(GAME_RENDERER_3D, areaToLoad.scene3d);
              window.GAME.renderAdapter = GAME_RENDER_ADAPTER; // Expose for debugging
              if (GAME_RENDER_ADAPTER && !GAME_RENDER_ADAPTER.error) {
                lastGLTFLoadStatus = { success: true, timestamp: Date.now(), error: null };
              } else {
                lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: GAME_RENDER_ADAPTER?.error || 'unknown' };
              }
            }
          } catch (error) {
            console.warn('[app] Failed to load initial 3D scene:', error);
            lastGLTFLoadStatus = { success: false, timestamp: Date.now(), error: error.message };
          }
        }

        // Expose for debugging
        window.GAME.renderer3d = GAME_RENDERER_3D;
        window.GAME.visualsmapAdapter = GAME_VISUALSMAP_ADAPTER;
        window.GAME.renderAdapter = GAME_RENDER_ADAPTER;
        console.log('[app] 3D background renderer initialized successfully');
      }
    } else {
      if (rendererModuleState.error) {
        console.warn('[app] 3D renderer modules failed to load - skipping 3D background renderer');
      } else {
        console.log('[app] Three.js not available - skipping 3D background renderer');
      }
    }
  } catch (error) {
    console.error('[app] Failed to initialize 3D background renderer:', error);
    console.warn('[app] Game will continue without 3D background');
  }

  boot();
})();
