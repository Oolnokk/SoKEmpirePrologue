// fighter.js — initialize fighters in STANCE; supports modular multi-instance roster
import { degToRad } from './math-utils.js?v=1';
import { pickFighterTypeName } from './fighter-utils.js?v=1';
import {
  resetFighterRoster,
  registerFighterInstance,
  ensureFighterRoster,
} from './fighter-roster.js?v=1';

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

  function makeSpawnEntry(inst, coords, index, role) {
    if (!coords) return null;
    return {
      x: coords.x,
      y: coords.y,
      source: inst || null,
      index,
      role,
    };
  }

  function computeSpawnPositions() {
    const area = resolveActiveArea();
    if (!area || !Array.isArray(area.instances)) {
      return { player: null, npcs: [], generic: [] };
    }

    const generic = [];
    let player = null;
    const npcList = [];

    area.instances.forEach((inst, index) => {
      const role = deriveSpawnRole(inst);
      if (!role) continue;
      const coords = extractSpawnCoords(inst);
      if (coords.x == null) continue;

      if (role === 'player' && player == null) {
        player = makeSpawnEntry(inst, coords, index, 'player');
      } else if (role === 'npc') {
        npcList.push(makeSpawnEntry(inst, coords, index, 'npc'));
      } else if (role === 'generic') {
        generic.push(makeSpawnEntry(inst, coords, index, 'generic'));
      }
    });

    generic.sort((a, b) => (a?.x ?? 0) - (b?.x ?? 0));

    if (player == null && generic.length) {
      player = { ...generic[0], role: 'player' };
    }

    return { player, npcs: npcList, generic };
  }

  const areaSpawns = computeSpawnPositions();
  const playerSpawn = areaSpawns.player;
  const npcSpawnCandidates = Array.isArray(areaSpawns.npcs) ? areaSpawns.npcs : [];
  const normalizedPlayerSpawnX = normalizeSpawnValue(playerSpawn?.x);
  const playerSpawnX = normalizedPlayerSpawnX ?? defaultPlayerX;
  const playerSpawnYOffset = normalizeSpawnValue(playerSpawn?.y) ?? 0;
  const playerSpawnY = gy - 1 + playerSpawnYOffset;
  const defaultNpcYOffset = playerSpawnYOffset;

  function resolveFighterKey(name) {
    if (!name || typeof name !== 'string') return null;
    const fighters = (window.CONFIG || {}).fighters || {};
    if (Object.prototype.hasOwnProperty.call(fighters, name)) return name;
    const lower = name.toLowerCase();
    return Object.keys(fighters).find((key) => key.toLowerCase() === lower) || null;
  }

  function resolveNpcRosterSpecs() {
    const C = window.CONFIG || {};
    const combat = C.combat || {};
    const rosterConfig = Array.isArray(combat.npcRoster) ? combat.npcRoster : null;
    const specs = [];

    function normalizeNpcEntry(entry, index) {
      const raw = (entry && typeof entry === 'object') ? { ...entry } : {};
      const id = raw.id || raw.instanceId || (index === 0 ? 'npc' : `npc:${index}`);
      const spawnIndex = Number.isFinite(raw.spawnIndex) ? raw.spawnIndex : index;
      const controller = typeof raw.controller === 'string'
        ? { type: raw.controller }
        : (raw.controller || {});
      controller.type = controller.type || 'ai';

      const fighterTypeCandidates = [
        raw.fighter,
        raw.fighterId,
        raw.fighterName,
        raw.template,
        raw.templateId,
        combat.defaultNpcFighter,
        combat.enemyFighter,
      ];
      let fighterTypeName = null;
      for (const candidate of fighterTypeCandidates) {
        fighterTypeName = resolveFighterKey(candidate);
        if (fighterTypeName) break;
      }
      if (!fighterTypeName) {
        fighterTypeName = pickFighterTypeName(C);
      }

      return {
        id,
        rosterIndex: index,
        spawnIndex,
        fighterType: fighterTypeName,
        controller,
        ai: raw.ai || null,
        cosmetics: raw.cosmetics || null,
        weapon: raw.weapon || null,
        abilities: raw.abilities || null,
        metadata: raw.metadata || {},
      };
    }

    if (rosterConfig && rosterConfig.length) {
      rosterConfig.forEach((entry, index) => {
        specs.push(normalizeNpcEntry(entry, index));
      });
    }

    if (!specs.length) {
      const defaultCount = Number.isFinite(combat.npcCount)
        ? Math.max(0, combat.npcCount)
        : null;
      const fallbackCount = defaultCount != null
        ? defaultCount
        : Math.max(1, npcSpawnCandidates.length || 0);
      for (let i = 0; i < fallbackCount; i += 1) {
        specs.push(normalizeNpcEntry({ id: i === 0 ? 'npc' : `npc:${i}` }, i));
      }
    }

    return specs;
  }

  function computeNpcSpawnEntries(npcSpecs, { defaultYOffset }) {
    const npcCandidates = npcSpawnCandidates.map((entry, index) => ({ ...entry, used: false, index }));
    const genericCandidates = areaSpawns.generic.map((entry, index) => ({ ...entry, used: false, index }));

    function takeCandidate(candidates, preferredIndex) {
      if (!Array.isArray(candidates) || !candidates.length) return null;
      if (Number.isFinite(preferredIndex)) {
        const match = candidates.find((candidate) => !candidate.used && candidate.index === preferredIndex);
        if (match) {
          match.used = true;
          return match;
        }
      }
      const first = candidates.find((candidate) => !candidate.used);
      if (first) {
        first.used = true;
        return first;
      }
      return null;
    }

    return npcSpecs.map((spec, index) => {
      const desiredIndex = Number.isFinite(spec.spawnIndex) ? spec.spawnIndex : index;
      let spawn = takeCandidate(npcCandidates, desiredIndex);
      if (!spawn) {
        spawn = takeCandidate(genericCandidates, desiredIndex);
      }
      if (!spawn) {
        const xBase = Number.isFinite(playerSpawnX)
          ? playerSpawnX + DEFAULT_FIGHTER_SPACING * (index + 1)
          : defaultNpcX + DEFAULT_FIGHTER_SPACING * index;
        spawn = {
          x: xBase,
          y: Number.isFinite(defaultYOffset) ? defaultYOffset : (defaultNpcYOffset ?? 0),
          source: null,
          index: desiredIndex,
          role: 'npc',
          synthetic: true,
        };
      }
      return { ...spawn, rosterIndex: index, preferredSpawnIndex: desiredIndex };
    });
  }

  function createFighterState(spec) {
    const spawnY = Number.isFinite(spec.spawnY) ? spec.spawnY : gy - 1;
    const faceSign = spec.facingSign ?? (spec.role === 'player' ? 1 : -1);
    const controller = spec.controller || { type: spec.role === 'player' ? 'player' : 'ai' };
    const isPlayer = spec.role === 'player' || controller.type === 'player';
    const aiState = !isPlayer
      ? {
          mode: 'approach',
          timer: 0,
          cooldown: 0,
          ...(spec.ai || {}),
        }
      : null;

    return {
      id: spec.instanceId,
      instanceId: spec.instanceId,
      rosterId: spec.instanceId,
      role: spec.role,
      fighterType: spec.fighterType,
      templateId: spec.templateId || spec.fighterType || spec.instanceId,
      spawnIndex: spec.spawnIndex ?? null,
      isPlayer,
      controller,
      loadout: {
        fighterType: spec.fighterType,
        cosmetics: spec.cosmetics || null,
        weapon: spec.weapon || null,
        abilities: spec.abilities || null,
      },
      pos: { x: spec.spawnX, y: spawnY },
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
      stamina: {
        current: 100,
        max: 100,
        drainRate: 40,
        regenRate: 25,
        minToDash: 10,
        isDashing: false,
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
      ai: aiState,
    };
  }

  resetFighterRoster(G);
  ensureFighterRoster(G);

  const playerFighterTypeName = resolveFighterKey(window.GAME?.selectedFighter)
    || resolveFighterKey(window.CONFIG?.combat?.playerFighter)
    || pickFighterTypeName(window.CONFIG || {});

  const playerState = createFighterState({
    instanceId: 'player',
    role: 'player',
    fighterType: playerFighterTypeName,
    templateId: playerFighterTypeName,
    spawnIndex: playerSpawn?.index ?? null,
    spawnX: playerSpawnX,
    spawnY: playerSpawnY,
    facingSign: 1,
    controller: { type: 'player' },
    cosmetics: window.GAME?.selectedCosmetics || null,
    weapon: window.GAME?.selectedWeapon || null,
    abilities: window.GAME?.selectedAbilities || null,
  });

  registerFighterInstance(playerState, {
    group: 'player',
    metadata: {
      role: 'player',
      spawnIndex: playerSpawn?.index ?? null,
      spawnSource: playerSpawn?.source || null,
      fighterType: playerFighterTypeName,
    },
  }, G);

  const npcSpecs = resolveNpcRosterSpecs();
  const npcSpawnEntries = computeNpcSpawnEntries(npcSpecs, {
    defaultYOffset: Number.isFinite(playerSpawn?.y)
      ? normalizeSpawnValue(playerSpawn?.y) ?? defaultNpcYOffset ?? 0
      : defaultNpcYOffset ?? 0,
  });

  npcSpecs.forEach((spec, index) => {
    const spawn = npcSpawnEntries[index] || {};
    const instanceId = spec.id || (index === 0 ? 'npc' : `npc:${index}`);
    const state = createFighterState({
      instanceId,
      role: 'npc',
      fighterType: spec.fighterType,
      templateId: spec.fighterType,
      spawnIndex: spawn.index ?? spec.spawnIndex ?? null,
      spawnX: Number.isFinite(spawn.x) ? spawn.x : (playerSpawnX + DEFAULT_FIGHTER_SPACING * (index + 1)),
      spawnY: Number.isFinite(spawn.y)
        ? gy - 1 + (normalizeSpawnValue(spawn.y) ?? (defaultNpcYOffset ?? 0))
        : (gy - 1 + (defaultNpcYOffset ?? 0)),
      facingSign: -1,
      controller: spec.controller,
      cosmetics: spec.cosmetics,
      weapon: spec.weapon,
      abilities: spec.abilities,
      ai: spec.ai,
    });

    registerFighterInstance(state, {
      group: 'npc',
      metadata: {
        role: 'npc',
        rosterIndex: spec.rosterIndex,
        spawnIndex: spawn.index ?? spec.spawnIndex ?? null,
        spawnSource: spawn.source || null,
        fighterType: spec.fighterType,
        preferredSpawnIndex: spawn.preferredSpawnIndex ?? spec.spawnIndex ?? null,
      },
    }, G);
  });

  const roster = ensureFighterRoster(G);
  const npcSpawnInfo = npcSpecs.map((spec, index) => {
    const spawn = npcSpawnEntries[index] || {};
    return {
      id: spec.id || (index === 0 ? 'npc' : `npc:${index}`),
      x: Number.isFinite(spawn.x) ? spawn.x : null,
      y: Number.isFinite(spawn.y)
        ? gy - 1 + (normalizeSpawnValue(spawn.y) ?? (defaultNpcYOffset ?? 0))
        : null,
      source: spawn.source || null,
      rosterIndex: spec.rosterIndex,
      preferredSpawnIndex: spawn.preferredSpawnIndex ?? spec.spawnIndex ?? null,
    };
  });

  G.spawnPoints = {
    player: {
      x: playerSpawnX,
      y: playerSpawnY,
      yOffset: playerSpawnYOffset,
      source: playerSpawn ?? null,
    },
    npcs: npcSpawnInfo,
  };
  if (npcSpawnInfo.length) {
    const primary = npcSpawnInfo[0];
    G.spawnPoints.npc = primary;
  }

  if (G.editorPreview) {
    G.editorPreview.spawn = {
      player: {
        x: playerSpawnX,
        yOffset: playerSpawnYOffset,
        worldY: playerSpawnY,
      },
      npcs: npcSpawnInfo.map((info) => ({
        id: info.id,
        x: info.x,
        worldY: info.y,
        source: info.source,
      })),
    };
    if (npcSpawnInfo.length) {
      const primary = npcSpawnInfo[0];
      G.editorPreview.spawn.npc = {
        x: primary.x,
        worldY: primary.y,
        source: primary.source,
      };
    }
  }

  console.log('[initFighters] Fighters initialized', roster.instances);
}
