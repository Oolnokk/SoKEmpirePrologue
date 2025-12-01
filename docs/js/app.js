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
    const parallaxArea = window.PARALLAX?.areas?.[areaId];
    if (parallaxArea) return parallaxArea;
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
      initFighters(cv, cx);
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
  dashImpulseMultiplier.value = window.RENDER_DEBUG?.dashImpulseMultiplier || 10.0;
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

  const parallax = window.PARALLAX;
  if (parallax?.currentAreaId && parallax?.areas) {
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
    state.ready = state.layers.length > 0;
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
      const layerScale = Number.isFinite(layer.scale) ? layer.scale : 1;
      const instRotRad = degToRad(inst.rotationDeg || 0);
      const baseOffset = (pos.x - cameraLeftX * parallax) * effectiveZoom;
      const rootScreenX = baseOffset;
      const rootScreenY = groundLine + (layer.offsetY || 0) * effectiveZoom + pos.y * effectiveZoom;
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
          const topScaleX = instScaleX * (Number.isFinite(targetLayer?.scale) ? targetLayer.scale : 1) * effectiveZoom;
          const topScaleY = instScaleY * (Number.isFinite(targetLayer?.scale) ? targetLayer.scale : 1) * effectiveZoom;

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
          const topCenterX = (pos.x - cameraLeftX * targetParallax) * effectiveZoom - topAnchorX + topWidth / 2;
          const topGroundY = groundLine
            + (targetLayer?.offsetY || 0) * effectiveZoom
            + (pos.y + spanSpec.topOffset) * effectiveZoom;
          const topY = topGroundY - spanSpec.height * effectiveZoom - topAnchorY + topHeight;

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

  return {
    attachToRegistry,
    setArea,
    renderAndBlit,
    isReady: () => state.ready,
  };
}

const EDITOR_PREVIEW_SANDBOX = createEditorPreviewSandbox();

function installPreviewSandboxRegistryBridge() {
  const GAME = (window.GAME = window.GAME || {});

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
  if (Array.isArray(area.instances)) {
    for (const inst of area.instances) {
      const layerId = inst?.layerId;
      if (!layerId) continue;
      const list = instancesByLayer.get(layerId) || [];
      list.push(inst);
      instancesByLayer.set(layerId, list);
    }
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
  cx.fillStyle = '#0b1220';
  cx.fillRect(0,0,cv.width,cv.height);
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
  const groundLine = computeGroundYFromConfig(window.CONFIG, cv?.height);
  const pivotY = Number.isFinite(groundLine) ? groundLine : cv.height;
  const verticalOffset = pivotY * (1 - zoom);
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

  // Mirror the global controls.js bindings: left click = Slot A, Shift+left = Slot B, right click = Slot C
  const canvasMouseBindings = { 0: null, 1: null, 2: null };

  cv.addEventListener('mousedown', (e) => {
    e.preventDefault();
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
    if (shouldEnableArchHud()) {
      archTouchHandle?.destroy?.();
      archTouchHandle = initArchTouchInput({
        input: window.GAME?.input || null,
        config: window.CONFIG?.hud?.arch,
        enabled: true,
      });
    }
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
  try {
    if (typeof window !== 'undefined' && typeof window.__waitForLoadoutReady === 'function') {
      await window.__waitForLoadoutReady();
    }
  } catch (error) {
    console.warn('[app] Loadout stage failed to resolve', error);
  }
  boot();
})();
