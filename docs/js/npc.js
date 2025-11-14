// npc.js — wanderer NPC systems for modular build

const DEFAULT_WORLD_WIDTH = 1600;
const NPC_IDS = ['npc', 'npc2'];

const DASH_TRAIL_TEMPLATE = {
  enabled: true,
  positions: [],
  maxLength: 8,
  interval: 0.18,
  timer: 0,
};

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function randomInRange(min, max) {
  return min + Math.random() * (max - min);
}

function ensureGameState() {
  const G = (window.GAME ||= {});
  const counts = (G.HIT_COUNTS ||= {});
  counts.player ||= { handL: 0, handR: 0, footL: 0, footR: 0, body: 0 };
  counts.npc ||= { handL: 0, handR: 0, footL: 0, footR: 0, body: 0 };
  const perNpc = (counts.npcs ||= {});
  for (const id of NPC_IDS) {
    perNpc[id] ||= { body: 0, handL: 0, handR: 0, footL: 0, footR: 0 };
  }
  return G;
}

function ensureNpcCollections(G) {
  const systems = (G.NPC ||= {});
  const wanderers = (systems.wanderers ||= {});
  for (const id of NPC_IDS) {
    const entry = (wanderers[id] ||= {});
    const dashTrail = (entry.dashTrail ||= JSON.parse(JSON.stringify(DASH_TRAIL_TEMPLATE)));
    dashTrail.positions ||= [];
    dashTrail.maxLength = Number.isFinite(dashTrail.maxLength) ? dashTrail.maxLength : DASH_TRAIL_TEMPLATE.maxLength;
    dashTrail.interval = Number.isFinite(dashTrail.interval) ? dashTrail.interval : DASH_TRAIL_TEMPLATE.interval;
    dashTrail.timer = Number.isFinite(dashTrail.timer) ? dashTrail.timer : 0;

    const attackTrail = (entry.attackTrail ||= {
      enabled: false,
      colliders: { handL: [], handR: [], footL: [], footR: [] },
      maxLength: 6,
      interval: 0.02,
      timer: 0,
    });
    attackTrail.enabled = false;
    attackTrail.maxLength = Number.isFinite(attackTrail.maxLength) ? attackTrail.maxLength : 6;
    attackTrail.interval = Number.isFinite(attackTrail.interval) ? attackTrail.interval : 0.02;
    attackTrail.timer = Number.isFinite(attackTrail.timer) ? attackTrail.timer : 0;
    const colliders = (attackTrail.colliders ||= {});
    colliders.handL ||= [];
    colliders.handR ||= [];
    colliders.footL ||= [];
    colliders.footR ||= [];
  }
  return systems;
}

function computeGroundY(config) {
  const canvasH = config.canvas?.h || 460;
  const groundRatio = config.groundRatio ?? 0.7;
  return Math.round(canvasH * groundRatio) - 1;
}

function getWorldWidth(config) {
  return config.world?.width || config.camera?.worldWidth || DEFAULT_WORLD_WIDTH;
}

function ensureNpcDefaults(npc, id) {
  if (!npc || typeof npc !== 'object') return;
  npc.mode = 'wander';
  npc.cooldown = 0;
  npc.vel = npc.vel || { x: 0, y: 0 };
  npc.pos = npc.pos || { x: 0, y: 0 };
  npc.attack = npc.attack || {};
  npc.attack.active = false;
  npc.attack.currentPhase = null;
  npc.attack.currentActiveKeys = [];
  npc.attack.strikeLanded = false;
  npc.combo = npc.combo || {};
  npc.combo.active = false;
  npc.combo.sequenceIndex = 0;
  npc.combo.attackDelay = 0;
  npc.ai = npc.ai || {};
  npc.ai.mode = 'wander';
  npc.ai.role = 'wanderer';
  npc.aiInput = null;
  npc.aiButtonPresses = null;

  const wander = (npc.wander ||= {});
  const startX = Number.isFinite(wander.anchorX) ? wander.anchorX : npc.pos.x ?? 0;
  wander.anchorX = startX;
  wander.range = Number.isFinite(wander.range) ? Math.max(48, wander.range) : 240;
  wander.targetX = Number.isFinite(wander.targetX) ? wander.targetX : startX;
  wander.waitTimer = Number.isFinite(wander.waitTimer) ? wander.waitTimer : randomInRange(0.6, 1.6);
  wander.speed = Number.isFinite(wander.speed) ? Math.max(20, wander.speed) : null;
  wander.id = id;
}

function pickWanderTarget(wander, worldWidth, margin) {
  const anchor = Number.isFinite(wander.anchorX) ? wander.anchorX : 0;
  const range = Math.max(48, Math.min(wander.range || 240, worldWidth * 0.45));
  const minX = clamp(anchor - range, margin, worldWidth - margin);
  const maxX = clamp(anchor + range, margin, worldWidth - margin);
  return randomInRange(minX, maxX);
}

function updateDashTrail(trail, npc, dt) {
  if (!trail?.enabled) return;
  if (Math.abs(npc.vel?.x || 0) > 5) {
    trail.timer += dt;
    if (trail.timer >= trail.interval) {
      trail.timer = 0;
      trail.positions.unshift({
        x: npc.pos.x,
        y: npc.pos.y,
        facingRad: npc.facingRad || 0,
        alpha: 1,
      });
      if (trail.positions.length > trail.maxLength) {
        trail.positions.length = trail.maxLength;
      }
    }
  } else {
    trail.timer = 0;
  }
  for (const pos of trail.positions) {
    pos.alpha = Math.max(0, pos.alpha - dt * 1.5);
  }
  trail.positions = trail.positions.filter((pos) => pos.alpha > 0);
}

function updateNpcWanderer(npc, entry, dt) {
  const C = window.CONFIG || {};
  const wander = npc.wander || {};
  const groundY = computeGroundY(C);
  const worldWidth = getWorldWidth(C);
  const margin = 40;
  const baseSpeed = (C.movement?.maxSpeedX || 420) * 0.28;
  const speed = wander.speed != null ? wander.speed : baseSpeed;
  wander.speed = speed;

  wander.waitTimer -= dt;
  if (wander.waitTimer <= 0) {
    const dx = (wander.targetX ?? npc.pos.x) - npc.pos.x;
    if (Math.abs(dx) <= 4) {
      wander.targetX = pickWanderTarget(wander, worldWidth, margin);
      wander.waitTimer = randomInRange(1.2, 3.4);
      npc.vel.x = 0;
    } else {
      const dir = dx > 0 ? 1 : -1;
      npc.vel.x = dir * speed;
      npc.pos.x += npc.vel.x * dt;
      npc.facingRad = dir >= 0 ? 0 : Math.PI;
    }
  } else {
    npc.vel.x *= 0.6;
    if (Math.abs(npc.vel.x) < 1) npc.vel.x = 0;
  }

  const clampedX = clamp(npc.pos.x, margin, worldWidth - margin);
  if (clampedX !== npc.pos.x) {
    npc.pos.x = clampedX;
    npc.vel.x = 0;
    wander.targetX = pickWanderTarget(wander, worldWidth, margin);
    wander.waitTimer = randomInRange(0.8, 2.2);
  }

  npc.pos.y = groundY;
  npc.onGround = true;
  npc.vel.y = 0;
  if (npc.stamina) {
    npc.stamina.isDashing = false;
    if (Number.isFinite(npc.stamina.max)) {
      const max = npc.stamina.max;
      npc.stamina.current = Math.min(max, Math.max(0, npc.stamina.current ?? max));
    }
  }

  updateDashTrail(entry?.dashTrail, npc, dt);
}

function updateNpcHud(G) {
  const hud = document.getElementById('aiHud');
  if (!hud || hud.style.display === 'none') return;
  const fighters = G.FIGHTERS || {};
  const lines = [];
  let any = false;
  for (const id of NPC_IDS) {
    const npc = fighters[id];
    if (!npc) continue;
    any = true;
    const wander = npc.wander || {};
    lines.push(
      `${id}: mode=${npc.mode || 'wander'} x=${(npc.pos?.x ?? 0).toFixed(1)} target=${(wander.targetX ?? npc.pos?.x ?? 0).toFixed(1)} wait=${Math.max(0, wander.waitTimer ?? 0).toFixed(2)}`,
    );
  }
  hud.textContent = any ? ['NPC_ENABLED: true', ...lines].join('\n') : 'NPC unavailable';
}

export function initNpcSystems() {
  const G = ensureGameState();
  const systems = ensureNpcCollections(G);
  for (const id of NPC_IDS) {
    const npc = G.FIGHTERS?.[id];
    if (!npc) continue;
    ensureNpcDefaults(npc, id);
    const entry = systems.wanderers[id];
    if (entry?.dashTrail) {
      entry.dashTrail.positions.length = 0;
      entry.dashTrail.timer = 0;
    }
  }
  updateNpcHud(G);
}

export function updateNpcSystems(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const G = ensureGameState();
  const systems = ensureNpcCollections(G);
  let updated = false;
  for (const id of NPC_IDS) {
    const npc = G.FIGHTERS?.[id];
    if (!npc) continue;
    ensureNpcDefaults(npc, id);
    const entry = systems.wanderers[id];
    updateNpcWanderer(npc, entry, dt);
    updated = true;
  }
  if (updated) {
    updateNpcHud(G);
  }
}

export function getNpcDashTrail() {
  const G = ensureGameState();
  const systems = ensureNpcCollections(G);
  const trails = [];
  for (const id of NPC_IDS) {
    const entry = systems.wanderers[id];
    if (!entry?.dashTrail) continue;
    trails.push({ id, dashTrail: entry.dashTrail });
  }
  return trails;
}

export function getNpcAttackTrail() {
  const G = ensureGameState();
  const systems = ensureNpcCollections(G);
  const trails = [];
  for (const id of NPC_IDS) {
    const entry = systems.wanderers[id];
    if (!entry?.attackTrail) continue;
    trails.push({ id, attackTrail: entry.attackTrail });
  }
  return trails;
}

export function recordNpcAttackTrailSample(_colliders, _dt) {
  // Wanderers do not attack; retain function for compatibility.
}

export function fadeNpcAttackTrail(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const G = ensureGameState();
  const systems = ensureNpcCollections(G);
  for (const id of NPC_IDS) {
    const entry = systems.wanderers[id];
    const attackTrail = entry?.attackTrail;
    if (!attackTrail?.enabled) continue;
    for (const list of Object.values(attackTrail.colliders || {})) {
      for (const sample of list) {
        sample.alpha = Math.max(0, (sample.alpha ?? 0) - dt * 4);
      }
      const filtered = list.filter((sample) => (sample.alpha ?? 0) > 0);
      list.length = 0;
      list.push(...filtered);
    }
  }
}

export function updateNpcDebugHud() {
  updateNpcHud(ensureGameState());
}

export function getNpcBodyRadius() {
  const C = window.CONFIG || {};
  const wHalf = (C.parts?.hitbox?.w || 40) * (C.actor?.scale || 1) * 0.5;
  const hHalf = (C.parts?.hitbox?.h || 80) * (C.actor?.scale || 1) * 0.5;
  return Math.sqrt(wHalf * wHalf + hHalf * hHalf);
}
