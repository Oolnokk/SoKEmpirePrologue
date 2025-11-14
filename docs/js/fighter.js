// fighter.js — initialize fighters in STANCE; set facingSign (player right, npc left)
import { degToRad } from './math-utils.js?v=1';
import { pickFighterName } from './fighter-utils.js?v=1';
import { getStatProfile } from './stat-hooks.js?v=1';

function clone(value) {
  if (value == null) return value;
  try {
    if (typeof structuredClone === 'function') {
      return structuredClone(value);
    }
  } catch (_err) {
    // Ignore and fallback to JSON clone below
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_err) {
    return value;
  }
}

function randomHueDegrees() {
  const hue = Math.floor(Math.random() * 360);
  return hue > 180 ? hue - 360 : hue;
}

const SPAWN_PREFAB_SETS = {
  player: new Set([
    'player_spawn',
    'spawn_player',
    'player-start',
    'player-spawn',
    'spawn-hero',
    'hero_spawn',
    'hero-spawn',
    'player_spawnpoint',
  ]),
  npc: new Set([
    'npc_spawn',
    'spawn_npc',
    'npc-start',
    'npc-spawn',
    'enemy_spawn',
    'spawn_enemy',
    'enemy-spawn',
    'enemy_spawnpoint',
  ]),
  generic: new Set([
    'spawn',
    'spawn_point',
    'spawnpoint',
    'spawn-marker',
    'spawn_generic',
    'spawn-default',
    'spawn-both',
  ]),
};

function degPoseToRad(p){ if(!p) return {}; const o={}; for (const k of ['torso','head','lShoulder','lElbow','rShoulder','rElbow','lHip','lKnee','rHip','rKnee']){ if (p[k]!=null) o[k]=degToRad(p[k]); } return o; }

export function initFighters(cv, cx){
  const G = (window.GAME ||= {});
  const C = (window.CONFIG || {});
  const W = C.canvas || { w: 720, h: 460, scale: 1 };
  const gy = Math.round((C.groundRatio||0.7) * (C.canvas?.h || W.h || 460));
  const stance = C.poses?.Stance || { torso:10, lShoulder:-120, lElbow:-120, rShoulder:-65, rElbow:-140, lHip:110, lKnee:40, rHip:30, rKnee:40 };
  const stanceRad = degPoseToRad(stance);
  if (stanceRad.head == null) stanceRad.head = stanceRad.torso ?? 0;

  const DEFAULT_FIGHTER_SPACING = 120;
  const defaultPlayerX = (C.canvas?.w||720) * 0.5 - DEFAULT_FIGHTER_SPACING * 0.5;
  const defaultNpcX = defaultPlayerX + DEFAULT_FIGHTER_SPACING;

  function normalizeSpawnValue(value) {
    return Number.isFinite(value) ? value : null;
  }

  function extractSpawnCoords(inst) {
    const original = inst?.meta?.original ?? {};
    const currentPos = inst?.position || original.position || {};
    const x = normalizeSpawnValue(currentPos?.x ?? original.x);

    let y = normalizeSpawnValue(currentPos?.y);
    if (y == null) {
      if (Number.isFinite(original.position?.y)) {
        y = normalizeSpawnValue(original.position.y);
      } else if (Number.isFinite(original.y)) {
        y = normalizeSpawnValue(original.y);
      } else if (Number.isFinite(original.offsetY)) {
        y = normalizeSpawnValue(-original.offsetY);
      }
    }

    return { x, y };
  }

  function normalizeStats(rawStats) {
    const baseline = Number.isFinite(rawStats?.baseline) ? rawStats.baseline : 10;
    const strength = Number.isFinite(rawStats?.strength) ? rawStats.strength : baseline;
    const agility = Number.isFinite(rawStats?.agility) ? rawStats.agility : baseline;
    const endurance = Number.isFinite(rawStats?.endurance) ? rawStats.endurance : baseline;
    const stats = {
      baseline,
      strength,
      agility,
      endurance,
    };
    if (Number.isFinite(rawStats?.maxHealth)) {
      stats.maxHealth = rawStats.maxHealth;
    }
    if (Number.isFinite(rawStats?.maxStamina)) {
      stats.maxStamina = rawStats.maxStamina;
    }
    return stats;
  }

  function resolveActiveArea() {
    const registry = G.mapRegistry;
    if (!registry || typeof registry.getActiveArea !== 'function') return null;
    const direct = registry.getActiveArea?.();
    if (direct) return direct;
    const activeId = registry.getActiveAreaId?.() ?? G.currentAreaId;
    if (!activeId || typeof registry.getArea !== 'function') return null;
    return registry.getArea(activeId);
  }

  function deriveSpawnRole(inst) {
    const meta = inst?.meta?.original ?? {};
    const explicit = meta.spawnRole ?? meta.spawnrole ?? meta.spawn?.role ?? inst?.spawnRole;
    if (typeof explicit === 'string') {
      const normalized = explicit.trim().toLowerCase();
      if (normalized === 'player' || normalized === 'hero') return 'player';
      if (normalized === 'npc' || normalized === 'enemy') return 'npc';
      if (normalized === 'generic' || normalized === 'both') return 'generic';
    }

    const rawTags = meta.tags;
    if (Array.isArray(rawTags)) {
      for (const tag of rawTags) {
        if (typeof tag !== 'string') continue;
        const normalized = tag.trim().toLowerCase();
        if (normalized === 'spawn:player') return 'player';
        if (normalized === 'spawn:npc' || normalized === 'spawn:enemy') return 'npc';
        if (normalized === 'spawn' || normalized === 'spawn:generic') return 'generic';
      }
    }

    const prefabId = (inst?.prefabId ?? meta.prefabId ?? inst?.prefab?.id ?? '').toString().toLowerCase();
    if (!prefabId) return null;

    if (SPAWN_PREFAB_SETS.player.has(prefabId)) return 'player';
    if (SPAWN_PREFAB_SETS.npc.has(prefabId)) return 'npc';
    if (SPAWN_PREFAB_SETS.generic.has(prefabId)) return 'generic';
    return null;
  }

  function computeSpawnPositions() {
    const area = resolveActiveArea();
    if (!area || !Array.isArray(area.instances)) {
      return { player: null, npc: null };
    }

    const generic = [];
    let player = null;
    let npc = null;

    for (const inst of area.instances) {
      const role = deriveSpawnRole(inst);
      if (!role) continue;
      const coords = extractSpawnCoords(inst);
      if (coords.x == null) continue;

      if (role === 'player' && player == null) {
        player = { x: coords.x, y: coords.y };
      } else if (role === 'npc' && npc == null) {
        npc = { x: coords.x, y: coords.y };
      } else if (role === 'generic') {
        generic.push({ x: coords.x, y: coords.y });
      }
    }

    generic.sort((a, b) => (a.x ?? 0) - (b.x ?? 0));

    if (player == null && generic.length) {
      player = { ...generic[0] };
    }

    if (npc == null) {
      if (generic.length > 1) {
        npc = { ...generic[1] };
      } else if (generic.length === 1 && player != null) {
        npc = {
          x: player.x != null ? player.x + DEFAULT_FIGHTER_SPACING : null,
          y: player.y,
        };
      }
    }

    return { player, npc };
  }

  const areaSpawns = computeSpawnPositions();
  const playerSpawn = areaSpawns.player;
  const npcSpawn = areaSpawns.npc;
  const normalizedPlayerSpawnX = normalizeSpawnValue(playerSpawn?.x);
  const normalizedNpcSpawnX = normalizeSpawnValue(npcSpawn?.x);
  const playerSpawnX = normalizedPlayerSpawnX ?? defaultPlayerX;
  const npcSpawnX = normalizedNpcSpawnX
    ?? (normalizedPlayerSpawnX != null
      ? normalizedPlayerSpawnX + DEFAULT_FIGHTER_SPACING
      : defaultNpcX);
  const playerSpawnYOffset = normalizeSpawnValue(playerSpawn?.y) ?? 0;
  const npcSpawnYOffset = normalizeSpawnValue(npcSpawn?.y);
  const resolvedNpcYOffset = npcSpawnYOffset ?? playerSpawnYOffset ?? 0;
  const playerSpawnY = gy - 1 + playerSpawnYOffset;
  const npcSpawnY = gy - 1 + resolvedNpcYOffset;

  const fallbackFighterName = pickFighterName(C);
  const characters = C.characters || {};

  if (characters.enemy1) {
    const npcCharacter = clone(characters.enemy1);
    const cosmetics = npcCharacter.cosmetics || (npcCharacter.cosmetics = {});
    const slots = cosmetics.slots || (cosmetics.slots = {});
    const pantsSlot = { ...(slots.legs || {}) };
    const baseHsv = pantsSlot.hsv ? { ...pantsSlot.hsv } : {};
    const randomHue = randomHueDegrees();
    const randomizedHsv = {
      ...baseHsv,
      h: randomHue,
    };
    if (randomizedHsv.s == null) randomizedHsv.s = baseHsv.s ?? 0.6;
    if (randomizedHsv.v == null) randomizedHsv.v = baseHsv.v ?? 0;
    pantsSlot.hsv = randomizedHsv;
    slots.legs = pantsSlot;
    characters.npc = npcCharacter;
    console.log('[initFighters] Generated npc character from enemy1 with pants hue', randomHue);
  }
  const characterKeys = Object.keys(characters);
  const npcDefaultCharacterKey = characters.npc
    ? 'npc'
    : characterKeys.find(key => key !== 'player') || characterKeys[0] || null;
  const previousCharacterStateRaw = G.CHARACTER_STATE || {};
  const previousCharacterState = {};
  for (const [id, profile] of Object.entries(previousCharacterStateRaw)) {
    if (id === 'npc' && characters.npc) {
      const prevKey = profile?.characterKey;
      if (prevKey && prevKey !== 'npc') {
        continue;
      }
    }
    previousCharacterState[id] = clone(profile);
  }

  function resolveCharacterKey(id) {
    const prevKey = previousCharacterState?.[id]?.characterKey;
    if (prevKey && characters[prevKey]) return prevKey;
    if (characters[id]) return id;
    if (id === 'player' && characters.player) return 'player';
    if (id !== 'player' && npcDefaultCharacterKey && characters[npcDefaultCharacterKey]) {
      return npcDefaultCharacterKey;
    }
    return null;
  }

  function resolveFighterKey(name) {
    if (!name) return null;
    const trimmed = String(name).trim();
    if (!trimmed) return null;
    if (C.fighters?.[trimmed]) return trimmed;
    const lower = trimmed.toLowerCase();
    if (!lower) return null;
    const fighters = Object.keys(C.fighters || {});
    for (const key of fighters) {
      if (key.toLowerCase() === lower) {
        return key;
      }
    }
    return null;
  }

  function resolveFighterName(id, characterData, prevProfile) {
    let selectedFighter = typeof G.selectedFighter === 'string'
      ? G.selectedFighter.trim()
      : '';
    if (
      selectedFighter &&
      C.fighters?.[selectedFighter] &&
      id === 'player'
    ) {
      return selectedFighter;
    }

    selectedFighter = resolveFighterKey(selectedFighter);
    if (
      selectedFighter &&
      id === 'player'
    ) {
      return selectedFighter;
    }

    selectedFighter = resolveFighterKey(selectedFighter);
    if (
      selectedFighter &&
      (id === 'player' || prevProfile?.characterKey === 'player')
    ) {
      return selectedFighter;
    }

    const configFighter = resolveFighterKey(characterData?.fighter);
    if (configFighter) return configFighter;

    const prevFighter = resolveFighterKey(prevProfile?.fighterName);
    if (prevFighter) return prevFighter;

    return fallbackFighterName;
  }

  function makeF(id, x, faceSign, y){
    const spawnY = Number.isFinite(y) ? y : gy - 1;
    const isPlayer = id === 'player';

    const prevProfile = previousCharacterState && previousCharacterState[id]
      ? clone(previousCharacterState[id])
      : null;
    let characterKey = prevProfile?.characterKey;
    const hasNpcCharacter = Boolean(characters.npc);
    if (id === 'npc' && hasNpcCharacter) {
      characterKey = 'npc';
    }
    if (!characterKey || !characters[characterKey]) {
      characterKey = resolveCharacterKey(id);
    }
    let characterData = null;
    if (id === 'npc' && hasNpcCharacter) {
      characterData = clone(characters.npc);
    } else if (characterKey && characters[characterKey]) {
      characterData = clone(characters[characterKey]);
    } else if (prevProfile?.character) {
      characterData = clone(prevProfile.character);
    }

    const fighterName = resolveFighterName(id, characterData, prevProfile);
    if (
      fighterName &&
      characterData &&
      resolveFighterKey(characterData.fighter) !== fighterName
    ) {
      characterData = { ...characterData, fighter: fighterName };
    }
    const bodyColorsBase = prevProfile?.bodyColors
      ?? (characterData?.bodyColors ? clone(characterData.bodyColors) : null);
    const cosmeticsBase = prevProfile?.cosmetics
      ?? (characterData?.cosmetics ? clone(characterData.cosmetics) : null);
    const appearanceBase = prevProfile?.appearance
      ?? (characterData?.appearance ? clone(characterData.appearance) : null);
    const weaponBase = prevProfile?.weapon ?? characterData?.weapon ?? null;
    const abilityBase = Array.isArray(prevProfile?.slottedAbilities)
      ? prevProfile.slottedAbilities.slice()
      : (Array.isArray(characterData?.slottedAbilities)
        ? characterData.slottedAbilities.slice()
        : []);

    const stats = normalizeStats(characterData?.stats);
    const statProfile = getStatProfile(stats);

    const renderProfile = {
      fighterName,
      characterKey: characterKey ?? null,
      character: characterData || null,
      bodyColors: bodyColorsBase ? clone(bodyColorsBase) : null,
      cosmetics: cosmeticsBase ? clone(cosmeticsBase) : null,
      appearance: appearanceBase ? clone(appearanceBase) : null,
      weapon: weaponBase,
      slottedAbilities: abilityBase,
      stats,
      statProfile,
    };

    const baselineStat = stats.baseline ?? 10;
    const enduranceStat = stats.endurance ?? baselineStat;
    const agilityStat = stats.agility ?? baselineStat;
    const staminaDrainRateMultiplier = Number.isFinite(statProfile?.staminaDrainRateMultiplier)
      ? statProfile.staminaDrainRateMultiplier
      : 1;
    const staminaRegenRateMultiplier = Number.isFinite(statProfile?.staminaRegenRateMultiplier)
      ? statProfile.staminaRegenRateMultiplier
      : 1;
    const dashThresholdMultiplier = Number.isFinite(statProfile?.dashStaminaThresholdMultiplier)
      ? statProfile.dashStaminaThresholdMultiplier
      : 1;

    const maxHealth = Number.isFinite(stats.maxHealth)
      ? stats.maxHealth
      : Math.round(100 + (enduranceStat - baselineStat) * 6);
    const maxStamina = Number.isFinite(stats.maxStamina)
      ? stats.maxStamina
      : Math.round(100 + (enduranceStat - baselineStat) * 5);
    const staminaDrainRate = Math.max(15, Math.round(40 * staminaDrainRateMultiplier));
    const staminaRegenRate = Math.max(12, Math.round(25 * staminaRegenRateMultiplier));
    const staminaMinToDash = Math.max(6, Math.round(10 * dashThresholdMultiplier));
    const healthRegenRate = Number.isFinite(statProfile?.healthRegenPerSecond)
      ? statProfile.healthRegenPerSecond
      : 0;

    return {
      id,
      isPlayer,
      pos: { x, y: spawnY },
      vel: { x: 0, y: 0 },
      onGround: true,
      prevOnGround: true,
      landedImpulse: 0,
      facingRad: faceSign < 0 ? Math.PI : 0,
      facingSign: faceSign,
      footing: isPlayer ? 50 : 100,
      ragdoll: false,
      ragdollTime: 0,
      ragdollVel: { x: 0, y: 0 },
      recovering: false,
      recoveryTime: 0,
      recoveryDuration: 0.8,
      recoveryStartAngles: {},
      recoveryStartY: 0,
      recoveryTargetY: spawnY,
      jointAngles: { ...stanceRad },
      walk: { phase: 0, amp: 0 },
      renderProfile,
      stats,
      statProfile,
      health: {
        current: maxHealth,
        max: maxHealth,
        regenRate: healthRegenRate,
      },
      stamina: {
        current: maxStamina,
        max: maxStamina,
        min: -maxStamina,
        drainRate: staminaDrainRate,
        regenRate: staminaRegenRate,
        minToDash: staminaMinToDash,
        isDashing: false,
        exhausted: false,
        exhaustionRatio: 0,
      },
      attack: {
        active: false,
        preset: null,
        slot: null,
        facingRadAtPress: 0,
        dirSign: faceSign,
        downTime: 0,
        holdStartTime: 0,
        holdWindupDuration: 0,
        isHoldRelease: false,
        strikeLanded: false,
        currentPhase: null,
        currentActiveKeys: [],
        sequence: [],
        durations: [],
        phaseIndex: 0,
        timer: 0,
        lunge: {
          active: false,
          paused: false,
          distance: 0,
          targetDistance: 60,
          speed: 400,
          lungeVel: { x: 0, y: 0 },
        },
      },
      aim: {
        targetAngle: 0,
        currentAngle: 0,
        torsoOffset: 0,
        shoulderOffset: 0,
        hipOffset: 0,
        active: false,
      },
      combo: {
        active: false,
        sequenceIndex: 0,
        attackDelay: 0,
      },
      trailColor: isPlayer ? 'cyan' : 'red',
      input: isPlayer ? { left: false, right: false, jump: false, dash: false } : null,
      ai: !isPlayer
        ? {
            mode: 'approach',
            timer: 0,
            cooldown: 0,
          }
        : null,
    };
  }

  G.FIGHTERS = {
    player: makeF('player', playerSpawnX, 1, playerSpawnY),
    npc:    makeF('npc',    npcSpawnX, -1, npcSpawnY)
  };
  G.spawnPoints = {
    player: {
      x: playerSpawnX,
      y: playerSpawnY,
      yOffset: playerSpawnYOffset,
      source: playerSpawn ?? null,
    },
    npc: {
      x: npcSpawnX,
      y: npcSpawnY,
      yOffset: resolvedNpcYOffset,
      source: npcSpawn ?? null,
    },
  };
  const characterState = {};
  for (const [fighterId, fighter] of Object.entries(G.FIGHTERS)) {
    if (!fighter) continue;
    characterState[fighterId] = fighter.renderProfile ? clone(fighter.renderProfile) : null;
  }
  G.CHARACTER_STATE = characterState;
  if (G.editorPreview) {
    G.editorPreview.spawn = {
      player: {
        x: playerSpawnX,
        yOffset: playerSpawnYOffset,
        worldY: playerSpawnY,
      },
      npc: {
        x: npcSpawnX,
        yOffset: resolvedNpcYOffset,
        worldY: npcSpawnY,
      },
    };
  }
  console.log('[initFighters] Fighters initialized', G.FIGHTERS);
}
