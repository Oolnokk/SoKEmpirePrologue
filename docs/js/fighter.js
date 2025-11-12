// fighter.js — initialize fighters in STANCE; set facingSign (player right, npc left)
import { degToRad } from './math-utils.js?v=1';

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

  function makeF(id, x, faceSign, y){
    const spawnY = Number.isFinite(y) ? y : gy - 1;
    return {
      id, isPlayer: id==='player',
      pos:{ x, y: spawnY }, vel:{ x:0, y:0 },
      onGround:true, prevOnGround:true, facingRad: 0, facingSign: faceSign,
      footing: 50, ragdoll:false, stamina:{ current:100, max:100, drainRate:40, regenRate:25, minToDash:10 },
      jointAngles: { ...stanceRad },
      walk:{ phase:0, amp:0 },
      attack:{ active:false, preset:null, slot:null },
      combo:{ active:false, sequenceIndex:0, attackDelay:0 }
    };
  }

  G.FIGHTERS = {
    player: makeF('player', playerSpawnX, 1, playerSpawnY),
    npc:    makeF('npc',    npcSpawnX, -1, npcSpawnY)
  };
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
