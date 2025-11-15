import { spawnAdditionalNpc, removeNpcFighter, reviveFighter } from './fighter.js?v=8';
import { getActiveNpcFighters, registerNpcFighter, unregisterNpcFighter } from './npc.js?v=2';

const DEFAULT_BOUNTY_CONFIG = {
  spawnIntervalSeconds: 20,
  baseWaveSize: 1,
  extraPerStar: 1,
  killWaveMultiplier: 0.4,
  maxWaveSize: 5,
  maxActive: 4,
  loseSightDistance: 520,
  loseSightDuration: 5,
  deathCleanupDelay: 3,
  playerRespawnDelay: 4,
  idleRespawnDelay: 15,
  starKillThresholds: [0, 3, 7, 12, 18],
  maxStars: 5,
};

const DEFAULT_BOUNTY_TEMPLATE_ID = 'citywatch_watchman';

function getBountyNpcTemplateId() {
  const raw = window.CONFIG?.bounty?.npcTemplateId;
  if (typeof raw === 'string' && raw.trim().length) {
    return raw.trim();
  }
  return DEFAULT_BOUNTY_TEMPLATE_ID;
}

function getBountyConfig() {
  const raw = window.CONFIG?.bounty || {};
  return {
    ...DEFAULT_BOUNTY_CONFIG,
    ...raw,
  };
}

function ensureBountyState() {
  const G = (window.GAME ||= {});
  const state = (G.BOUNTY ||= {
    active: false,
    stars: 0,
    wave: 0,
    kills: 0,
    spawnTimer: 0,
    loseSightTimer: 0,
    playerRespawnTimer: 0,
    idleRespawnTimer: 0,
    cleanupQueue: [],
    lastAggroNpcId: null,
    lastReason: null,
    playerDied: false,
  });
  state.cleanupQueue ||= [];
  return state;
}

function scheduleCleanup(state, npcId, delay) {
  if (!npcId) return;
  const queue = (state.cleanupQueue ||= []);
  const normalizedDelay = Math.max(0, delay || 0);
  const existing = queue.find((entry) => entry?.id === npcId);
  if (existing) {
    existing.delay = Math.min(existing.delay ?? normalizedDelay, normalizedDelay);
    if (!Number.isFinite(existing.timer) || existing.timer > existing.delay) {
      existing.timer = 0;
    }
    return;
  }
  queue.push({ id: npcId, timer: 0, delay: normalizedDelay });
}

function startBounty(state, reason) {
  if (!state.active) {
    state.active = true;
    state.wave = 0;
    state.kills = 0;
    state.spawnTimer = 0;
  }
  state.stars = Math.max(state.stars || 0, 1);
  state.loseSightTimer = 0;
  state.idleRespawnTimer = 0;
  state.playerRespawnTimer = 0;
  state.playerDied = false;
  state.lastReason = reason || null;
}

function endBounty(state, reason) {
  if (!state.active && state.stars === 0) {
    state.lastReason = reason || null;
    return;
  }
  state.active = false;
  state.stars = 0;
  state.wave = 0;
  state.spawnTimer = 0;
  state.loseSightTimer = 0;
  state.idleRespawnTimer = 0;
  state.playerRespawnTimer = 0;
  state.playerDied = false;
  state.lastReason = reason || null;
  const config = getBountyConfig();
  const npcs = getActiveNpcFighters();
  for (const npc of npcs) {
    if (!npc) continue;
    scheduleCleanup(state, npc.id, config.deathCleanupDelay * 0.5);
  }
}

function updateStars(state, config) {
  if (!state.active) return;
  const thresholds = Array.isArray(config.starKillThresholds) ? config.starKillThresholds : [];
  const maxStars = Number.isFinite(config.maxStars) ? config.maxStars : DEFAULT_BOUNTY_CONFIG.maxStars;
  let stars = 1;
  for (let i = 0; i < thresholds.length; i += 1) {
    if (state.kills >= thresholds[i]) {
      stars = Math.max(stars, i + 1);
    }
  }
  state.stars = Math.max(1, Math.min(stars, maxStars));
}

function spawnWave(state, config) {
  const templateId = getBountyNpcTemplateId();
  const baseNpc = window.GAME?.FIGHTERS?.npc;
  if (baseNpc && (baseNpc.templateId !== templateId || baseNpc.spawnMetadata?.templateId !== templateId)) {
    applyNpcTemplate(templateId);
  }

  const npcs = getActiveNpcFighters();
  const aliveCount = npcs.filter((npc) => npc && !npc.isDead).length;
  const maxActive = Math.max(1, Number.isFinite(config.maxActive) ? config.maxActive : DEFAULT_BOUNTY_CONFIG.maxActive);
  const availableSlots = Math.max(0, maxActive - aliveCount);
  if (availableSlots <= 0) return;

  const starBonus = Math.max(0, state.stars - 1) * (config.extraPerStar || 0);
  const killBonus = Math.floor(state.kills * (config.killWaveMultiplier || 0));
  let waveSize = Math.round((config.baseWaveSize || 1) + starBonus + killBonus);
  waveSize = Math.max(1, Math.min(waveSize, config.maxWaveSize || waveSize));
  waveSize = Math.min(waveSize, availableSlots);
  if (waveSize <= 0) return;

  const spawn = window.GAME?.spawnPoints?.npc || { x: 0, y: 0 };
  const spacing = 60;
  for (let i = 0; i < waveSize; i += 1) {
    const offset = (i - (waveSize - 1) / 2) * spacing;
    const npc = spawnAdditionalNpc({
      x: (spawn.x ?? 0) + offset,
      y: spawn.y ?? 0,
      facingSign: -1,
      waveId: state.wave + 1,
      templateId: getBountyNpcTemplateId(),
    });
    if (!npc) continue;
    registerNpcFighter(npc, { immediateAggro: true });
    const aggression = npc.aggression || (npc.aggression = {});
    aggression.triggered = true;
    aggression.active = true;
    aggression.wakeTimer = 0;
    npc.mode = 'approach';
  }
  state.wave += 1;
  state.spawnTimer = 0;
}

function processCleanup(state, dt, config) {
  if (!Array.isArray(state.cleanupQueue) || !state.cleanupQueue.length) return;
  const remaining = [];
  for (const entry of state.cleanupQueue) {
    const next = { ...entry, timer: (entry.timer || 0) + dt };
    const fighter = entry.id ? window.GAME?.FIGHTERS?.[entry.id] : null;
    const shouldRemove = next.timer >= (entry.delay || config.deathCleanupDelay || 0) || !fighter;
    if (shouldRemove && entry.id) {
      unregisterNpcFighter(entry.id);
      removeNpcFighter(entry.id);
    } else {
      remaining.push(next);
    }
  }
  state.cleanupQueue = remaining;
}

function updateLoseSightTimer(state, config, player, dt) {
  if (!player) return;
  const npcs = getActiveNpcFighters().filter((npc) => npc && !npc.isDead);
  if (!npcs.length) {
    state.loseSightTimer += dt;
    return;
  }
  let closest = Infinity;
  for (const npc of npcs) {
    const dx = (player.pos?.x ?? 0) - (npc.pos?.x ?? 0);
    const dy = (player.pos?.y ?? 0) - (npc.pos?.y ?? 0);
    const dist = Math.hypot(dx, dy);
    if (dist < closest) closest = dist;
  }
  if (!Number.isFinite(closest) || closest > (config.loseSightDistance || DEFAULT_BOUNTY_CONFIG.loseSightDistance)) {
    state.loseSightTimer += dt;
  } else {
    state.loseSightTimer = 0;
  }
}

export function initBountySystem() {
  ensureBountyState();
}

/**
 * Advance the bounty system timers for the current frame.
 *
 * Responsibilities:
 *  - Remove defeated NPCs once their cleanup delay expires.
 *  - Handle delayed player revival when they are killed during a bounty.
 *  - Spawn new NPC waves while the bounty is active and escalate star ratings.
 *  - Track line-of-sight and gracefully wind the system down when the player escapes.
 *  - Keep at least one idle NPC around when the world is calm so future bounties can trigger quickly.
 */
export function updateBountySystem(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const state = ensureBountyState();
  const config = getBountyConfig();
  processCleanup(state, dt, config);

  const player = window.GAME?.FIGHTERS?.player;
  if (player?.isDead) {
    state.playerRespawnTimer += dt;
    if (state.playerRespawnTimer >= (config.playerRespawnDelay || DEFAULT_BOUNTY_CONFIG.playerRespawnDelay)) {
      reviveFighter(player);
      state.playerRespawnTimer = 0;
      state.playerDied = false;
    }
  } else {
    state.playerRespawnTimer = 0;
    state.playerDied = false;
  }

  if (state.active) {
    state.spawnTimer += dt;
    if (state.spawnTimer >= (config.spawnIntervalSeconds || DEFAULT_BOUNTY_CONFIG.spawnIntervalSeconds)) {
      spawnWave(state, config);
    }
    updateLoseSightTimer(state, config, player, dt);
    if (state.loseSightTimer >= (config.loseSightDuration || DEFAULT_BOUNTY_CONFIG.loseSightDuration)) {
      endBounty(state, 'lost-sight');
    }
  } else {
    state.spawnTimer = 0;
    state.loseSightTimer = 0;
    const aliveIdle = getActiveNpcFighters().filter((npc) => npc && !npc.isDead);
    if (aliveIdle.length > 0) {
      state.idleRespawnTimer = 0;
    } else {
      state.idleRespawnTimer += dt;
      if (state.idleRespawnTimer >= (config.idleRespawnDelay || DEFAULT_BOUNTY_CONFIG.idleRespawnDelay)) {
        const spawn = window.GAME?.spawnPoints?.npc || { x: 0, y: 0 };
        const npc = spawnAdditionalNpc({ x: spawn.x ?? 0, y: spawn.y ?? 0, facingSign: -1, templateId: getBountyNpcTemplateId() });
        if (npc) {
          registerNpcFighter(npc, { immediateAggro: false });
          state.idleRespawnTimer = 0;
        }
      }
    }
  }
}

export function reportPlayerAggression(npc) {
  if (!npc) return;
  const state = ensureBountyState();
  state.lastAggroNpcId = npc.id || null;
  startBounty(state, 'player-aggro');
}

export function reportNpcDefeated(npc) {
  if (!npc) return;
  const state = ensureBountyState();
  const config = getBountyConfig();
  if (state.active) {
    state.kills += 1;
    updateStars(state, config);
    state.spawnTimer = Math.min(state.spawnTimer, (config.spawnIntervalSeconds || DEFAULT_BOUNTY_CONFIG.spawnIntervalSeconds) * 0.5);
  }
  scheduleCleanup(state, npc.id, config.deathCleanupDelay ?? DEFAULT_BOUNTY_CONFIG.deathCleanupDelay);
}

export function reportPlayerDeath() {
  const state = ensureBountyState();
  state.playerRespawnTimer = 0;
  state.playerDied = true;
  endBounty(state, 'player-death');
}

export function getBountyState() {
  return ensureBountyState();
}
