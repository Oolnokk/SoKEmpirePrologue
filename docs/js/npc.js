// npc.js — Reimplements the NPC systems from the monolith build in a modular form

import { initCombatForFighter } from './combat.js?v=19';

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const DEFAULT_WORLD_WIDTH = 1600;
const TWO_PI = Math.PI * 2;

const DASH_TRAIL_TEMPLATE = {
  enabled: true,
  positions: [],
  maxLength: 8,
  interval: 0.03,
  timer: 0,
};

const ATTACK_TRAIL_TEMPLATE = {
  enabled: true,
  colliders: {
    handL: [],
    handR: [],
    footL: [],
    footR: [],
  },
  maxLength: 6,
  interval: 0.02,
  timer: 0,
};

function clone(value) {
  return value ? JSON.parse(JSON.stringify(value)) : value;
}

function ensureGameState() {
  const G = (window.GAME ||= {});
  G.HIT_COUNTS ||= {
    player: { handL: 0, handR: 0, footL: 0, footR: 0 },
    npc: { handL: 0, handR: 0, footL: 0, footR: 0, body: 0 },
  };
  return G;
}

function ensureNpcContainers(G) {
  const npcSystems = (G.NPC ||= {});
  if (!npcSystems.dashTrail) {
    npcSystems.dashTrail = clone(DASH_TRAIL_TEMPLATE);
  }
  if (!npcSystems.attackTrail) {
    npcSystems.attackTrail = clone(ATTACK_TRAIL_TEMPLATE);
  }
  return npcSystems;
}

function ensureNpcInputState(state) {
  if (!state) return {};
  const input = state.aiInput || {
    buttonA: { down: false },
    buttonB: { down: false },
    left: false,
    right: false,
  };
  if (!state.aiInput) state.aiInput = input;
  input.buttonA ||= { down: false };
  input.buttonB ||= { down: false };
  return input;
}

function ensureNpcPressRegistry(state) {
  if (!state) return {};
  state.aiButtonPresses ||= {};
  return state.aiButtonPresses;
}

function releaseNpcButton(state, combat, slotKey) {
  if (!state || !combat) return;
  const presses = state.aiButtonPresses;
  if (!presses) return;
  const press = presses[slotKey];
  if (!press || !press.down) return;
  press.down = false;
  press.timer = 0;
  const input = ensureNpcInputState(state);
  if (slotKey === 'A') {
    input.buttonA.down = false;
  } else if (slotKey === 'B') {
    input.buttonB.down = false;
  }
  combat.slotUp(slotKey);
}

function pressNpcButton(state, combat, slotKey, holdSeconds = 0.12) {
  if (!state || !combat) return false;
  const presses = ensureNpcPressRegistry(state);
  const press = presses[slotKey] || (presses[slotKey] = { down: false, timer: 0 });
  if (press.down) return false;
  press.down = true;
  press.timer = Math.max(0, holdSeconds);
  const input = ensureNpcInputState(state);
  if (slotKey === 'A') {
    input.buttonA.down = true;
  } else if (slotKey === 'B') {
    input.buttonB.down = true;
  }
  combat.slotDown(slotKey);
  return true;
}

function updateNpcAutomatedInput(state, combat, dt) {
  if (!state || !combat) return;
  const presses = state.aiButtonPresses;
  if (!presses) return;
  for (const [slotKey, press] of Object.entries(presses)) {
    if (!press?.down) continue;
    press.timer -= dt;
    if (press.timer <= 0) {
      releaseNpcButton(state, combat, slotKey);
    }
  }
}

function ensureNpcCombat(G) {
  if (G.npcCombat) return G.npcCombat;
  const combat = initCombatForFighter('npc', {
    fighterLabel: 'npc',
    poseTarget: 'npc',
    autoProcessInput: false,
    neutralizeInputMovement: false,
    storeKey: 'npcCombat',
    inputSource: () => {
      const npc = G.FIGHTERS?.npc;
      return npc ? ensureNpcInputState(npc) : {};
    },
  });
  return combat;
}

function ensureAttackState(state) {
  const attack = (state.attack ||= {});
  attack.active = !!attack.active;
  attack.preset = attack.preset || null;
  attack.slot = attack.slot || null;
  attack.currentPhase = attack.currentPhase || null;
  attack.currentActiveKeys = Array.isArray(attack.currentActiveKeys)
    ? attack.currentActiveKeys
    : [];
  attack.strikeLanded = !!attack.strikeLanded;
  attack.isHoldRelease = !!attack.isHoldRelease;
  attack.chargeStage = Number.isFinite(attack.chargeStage) ? attack.chargeStage : 0;
  attack.context = attack.context || null;
  return attack;
}

function ensureComboState(state) {
  const combo = (state.combo ||= {});
  combo.active = !!combo.active;
  combo.sequenceIndex = Number.isFinite(combo.sequenceIndex) ? combo.sequenceIndex : 0;
  combo.attackDelay = Number.isFinite(combo.attackDelay) ? combo.attackDelay : 0;
  return combo;
}

function ensureAimState(state) {
  const aim = (state.aim ||= {});
  aim.targetAngle = Number.isFinite(aim.targetAngle) ? aim.targetAngle : 0;
  aim.currentAngle = Number.isFinite(aim.currentAngle) ? aim.currentAngle : 0;
  aim.torsoOffset = Number.isFinite(aim.torsoOffset) ? aim.torsoOffset : 0;
  aim.shoulderOffset = Number.isFinite(aim.shoulderOffset) ? aim.shoulderOffset : 0;
  aim.hipOffset = Number.isFinite(aim.hipOffset) ? aim.hipOffset : 0;
  aim.active = !!aim.active;
  return aim;
}

function computeGroundY(config) {
  const canvasH = config.canvas?.h || 460;
  const groundRatio = config.groundRatio ?? 0.7;
  return Math.round(canvasH * groundRatio) - 1;
}

function getWorldWidth(config) {
  return config.world?.width || config.camera?.worldWidth || DEFAULT_WORLD_WIDTH;
}

function getPresetActiveColliders(preset) {
  if (!preset) return [];
  const name = preset.toUpperCase();
  if (name.startsWith('KICK')) return ['footL', 'footR'];
  if (name.startsWith('PUNCH')) return ['handL', 'handR'];
  if (name.startsWith('SLAM')) return ['handL', 'handR', 'footL', 'footR'];
  return [];
}

function updateNpcAiming(state, player) {
  const aim = ensureAimState(state);
  if (!player) {
    aim.active = false;
    aim.torsoOffset = 0;
    aim.shoulderOffset = 0;
    aim.hipOffset = 0;
    return;
  }
  const shouldAim = !state.onGround;
  if (!shouldAim) {
    aim.active = false;
    aim.torsoOffset = 0;
    aim.shoulderOffset = 0;
    aim.hipOffset = 0;
    return;
  }
  aim.active = true;
  const dx = (player.pos?.x ?? state.pos.x) - state.pos.x;
  const dy = (player.pos?.y ?? state.pos.y) - state.pos.y;
  const targetAngle = Math.atan2(dy, dx);
  const relative = targetAngle - (state.facingRad || 0);
  const wrapped = ((relative + Math.PI) % TWO_PI) - Math.PI;
  const smoothing = 0.12;
  aim.currentAngle += (wrapped - aim.currentAngle) * smoothing;
  const aimDeg = (aim.currentAngle * 180) / Math.PI;
  const C = window.CONFIG || {};
  const aimingCfg = C.aiming || {};
  aim.torsoOffset = clamp(aimDeg * 0.5, -aimingCfg.maxTorsoAngle || 45, aimingCfg.maxTorsoAngle || 45);
  aim.shoulderOffset = clamp(aimDeg * 0.7, -aimingCfg.maxShoulderAngle || 65, aimingCfg.maxShoulderAngle || 65);
  aim.hipOffset = 0;
}

function updateDashTrail(npcSystems, state, dt) {
  const dashTrail = npcSystems.dashTrail;
  if (!dashTrail || !dashTrail.enabled) return;
  if (state.stamina?.isDashing && state.stamina.current > 0) {
    dashTrail.timer += dt;
    if (dashTrail.timer >= dashTrail.interval) {
      dashTrail.timer = 0;
      dashTrail.positions.unshift({
        x: state.pos.x,
        y: state.pos.y,
        facingRad: state.facingRad || 0,
        alpha: 1,
      });
      if (dashTrail.positions.length > dashTrail.maxLength) {
        dashTrail.positions.length = dashTrail.maxLength;
      }
    }
  }
  for (const pos of dashTrail.positions) {
    pos.alpha -= dt * 3;
  }
  dashTrail.positions = dashTrail.positions.filter((pos) => pos.alpha > 0);
}

function regenerateStamina(state, dt) {
  const stamina = state.stamina;
  if (!stamina) return;
  if (stamina.isDashing && stamina.current > 0) {
    stamina.current = Math.max(0, stamina.current - stamina.drainRate * dt);
    if (stamina.current <= 0) {
      stamina.isDashing = false;
    }
  } else {
    stamina.isDashing = false;
    stamina.current = Math.min(stamina.max, stamina.current + stamina.regenRate * dt);
  }
}

function resolveBodyRadius(config) {
  const wHalf = (config.parts?.hitbox?.w || 40) * (config.actor?.scale || 1) * 0.5;
  const hHalf = (config.parts?.hitbox?.h || 80) * (config.actor?.scale || 1) * 0.5;
  return Math.sqrt(wHalf * wHalf + hHalf * hHalf);
}

function updateNpcRagdoll(state, config, dt) {
  if (!state.ragdoll) return;
  const groundY = computeGroundY(config);
  state.ragdollTime += dt;
  state.vel.y += (config.movement?.gravity || 0) * dt * 1.8;
  state.pos.x += state.vel.x * dt;
  state.pos.y += state.vel.y * dt;
  const margin = 40;
  const worldWidth = getWorldWidth(config);
  state.pos.x = clamp(state.pos.x, margin, worldWidth - margin);
  if (state.pos.y >= groundY) {
    state.pos.y = groundY;
    if (state.vel.y > 0) state.vel.y = -state.vel.y * 0.2;
    state.onGround = true;
  } else {
    state.onGround = false;
  }
  if (state.onGround && state.ragdollTime > 2.5) {
    state.ragdoll = false;
    state.recovering = true;
    state.recoveryTime = 0;
    state.recoveryStartY = state.pos.y;
    state.recoveryTargetY = groundY;
  }
}

function updateNpcRecovery(state, config, dt) {
  if (!state.recovering) return;
  state.recoveryTime += dt;
  const t = Math.min(1, state.recoveryTime / (state.recoveryDuration || 0.8));
  const groundY = computeGroundY(config);
  const startY = Number.isFinite(state.recoveryStartY) ? state.recoveryStartY : groundY;
  state.pos.y = startY + (groundY - startY) * t;
  if (t >= 1) {
    state.recovering = false;
    state.recoveryTime = 0;
    state.footing = Math.max(state.footing, 30);
  }
}

function updateNpcMovement(G, npcSystems, state, dt) {
  const C = window.CONFIG || {};
  const player = G.FIGHTERS?.player;
  if (!player) return;

  const combat = ensureNpcCombat(G);
  const attack = ensureAttackState(state);
  ensureComboState(state);
  ensureNpcInputState(state);
  updateNpcAutomatedInput(state, combat, dt);

  if (state.ragdoll) {
    updateNpcRagdoll(state, C, dt);
    updateNpcRecovery(state, C, dt);
    updateNpcAiming(state, player);
    updateDashTrail(npcSystems, state, dt);
    regenerateStamina(state, dt);
    return;
  }

  updateNpcRecovery(state, C, dt);

  const attackActive = typeof combat?.isFighterAttacking === 'function'
    ? combat.isFighterAttacking()
    : !!attack?.active;
  state.cooldown = Math.max(0, (state.cooldown || 0) - dt);

  const dx = (player.pos?.x ?? state.pos.x) - state.pos.x;
  const absDx = Math.abs(dx);
  const maxSpeed = (C.movement?.maxSpeedX || 420) * 0.8;
  const nearDist = 70;
  const isPressing = !!state.aiButtonPresses?.A?.down || !!state.aiButtonPresses?.B?.down;

  if (attackActive) {
    state.vel.x = 0;
    state.facingRad = dx >= 0 ? 0 : Math.PI;
  } else {
    if (state.mode === 'attack') {
      state.mode = 'evade';
      state.timer = 0.3;
      state.cooldown = Math.max(state.cooldown, 0.35);
      state.vel.x = -(dx > 0 ? 1 : -1) * maxSpeed;
    } else if (absDx <= nearDist && state.cooldown <= 0 && !isPressing) {
      if (pressNpcButton(state, combat, 'A', 0.12)) {
        state.mode = 'attack';
        state.vel.x = 0;
        state.facingRad = dx >= 0 ? 0 : Math.PI;
        state.cooldown = 0.45;
      }
    }

    if (state.mode === 'approach') {
      if (absDx > nearDist) {
        state.vel.x = (dx > 0 ? 1 : -1) * maxSpeed;
      } else {
        state.vel.x = (dx > 0 ? 1 : -1) * maxSpeed * 0.3;
      }
      state.stamina.isDashing = false;
    } else if (state.mode === 'evade') {
      const dashMult = state.stamina.current >= state.stamina.minToDash
        ? C.movement?.dashSpeedMultiplier || 1.8
        : 1;
      state.vel.x = -(dx > 0 ? 1 : -1) * maxSpeed * dashMult;
      state.stamina.isDashing = dashMult > 1;
      state.timer = (state.timer || 0) - dt;
      if (state.timer <= 0) {
        state.mode = 'approach';
        state.stamina.isDashing = false;
      }
    }
  }

  if (state.mode === 'attack' && !attackActive && !isPressing) {
    state.mode = 'approach';
  }

  regenerateStamina(state, dt);
  updateDashTrail(npcSystems, state, dt);

  state.pos.x += (state.vel?.x || 0) * dt;
  state.pos.y += (state.vel?.y || 0) * dt;

  const margin = 40;
  const worldWidth = getWorldWidth(C);
  state.pos.x = clamp(state.pos.x, margin, worldWidth - margin);

  const groundY = computeGroundY(C);
  state.pos.y = groundY;
  state.onGround = true;
  state.vel.y = 0;
  state.facingRad = dx >= 0 ? 0 : Math.PI;

  updateNpcAiming(state, player);
}

function updateNpcHud(G) {
  const hud = document.getElementById('aiHud');
  if (!hud || hud.style.display === 'none') return;
  const npc = G.FIGHTERS?.npc;
  const player = G.FIGHTERS?.player;
  if (!npc || !player) {
    hud.textContent = 'NPC unavailable';
    return;
  }
  const dx = (player.pos?.x ?? 0) - (npc.pos?.x ?? 0);
  hud.textContent = [
    `NPC_ENABLED: true`,
    `mode: ${npc.mode || 'n/a'}`,
    `attack.active: ${!!npc.attack?.active}`,
    `combo.active: ${!!npc.combo?.active} idx: ${npc.combo?.sequenceIndex ?? 0}`,
    `cooldown: ${(npc.cooldown || 0).toFixed(2)}`,
    `dx to player: ${dx.toFixed(1)}`,
  ].join('\n');
}

export function initNpcSystems() {
  const G = ensureGameState();
  const npc = G.FIGHTERS?.npc;
  if (!npc) return;
  ensureNpcContainers(G);
  ensureNpcCombat(G);
  ensureAttackState(npc);
  ensureComboState(npc);
  ensureAimState(npc);
  ensureNpcInputState(npc);
  npc.mode = npc.mode || npc.ai?.mode || 'approach';
  npc.cooldown = Number.isFinite(npc.cooldown) ? npc.cooldown : npc.ai?.cooldown || 0;
}

export function updateNpcSystems(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const G = ensureGameState();
  const npc = G.FIGHTERS?.npc;
  if (!npc) return;
  const combat = ensureNpcCombat(G);
  if (combat?.tick) combat.tick(dt);
  const npcSystems = ensureNpcContainers(G);
  ensureNpcInputState(npc);
  updateNpcMovement(G, npcSystems, npc, dt);
  updateNpcHud(G);
}

export function getNpcDashTrail() {
  const G = window.GAME || {};
  return G.NPC?.dashTrail || null;
}

export function getNpcAttackTrail() {
  const G = window.GAME || {};
  return G.NPC?.attackTrail || null;
}

export function recordNpcAttackTrailSample(colliders, dt) {
  const G = window.GAME || {};
  const npc = G.FIGHTERS?.npc;
  const npcSystems = ensureNpcContainers(ensureGameState());
  const attackTrail = npcSystems.attackTrail;
  const attack = npc?.attack;
  if (!attackTrail?.enabled || !attack?.active) return;
  attackTrail.timer += dt;
  if (attackTrail.timer < attackTrail.interval) return;
  attackTrail.timer = 0;
  let keys = attack.currentActiveKeys || [];
  if ((!keys || keys.length === 0) && attack.currentPhase?.toLowerCase().includes('strike')) {
    keys = getPresetActiveColliders(attack.context?.preset || attack.preset);
  }
  if (!Array.isArray(keys) || keys.length === 0) return;
  for (const key of keys) {
    const pos = colliders?.[key];
    if (!pos) continue;
    const radius = colliders?.[`${key}Radius`] ?? 12;
    const list = attackTrail.colliders[key] || (attackTrail.colliders[key] = []);
    list.unshift({ x: pos.x, y: pos.y, radius, alpha: 1 });
    if (list.length > attackTrail.maxLength) list.length = attackTrail.maxLength;
  }
  for (const key of Object.keys(attackTrail.colliders)) {
    const list = attackTrail.colliders[key];
    for (const sample of list) {
      sample.alpha -= dt * 4;
    }
    attackTrail.colliders[key] = list.filter((sample) => sample.alpha > 0);
  }
}

export function fadeNpcAttackTrail(dt) {
  const npcSystems = ensureNpcContainers(ensureGameState());
  const attackTrail = npcSystems.attackTrail;
  if (!attackTrail) return;
  for (const key of Object.keys(attackTrail.colliders)) {
    const list = attackTrail.colliders[key];
    for (const sample of list) {
      sample.alpha -= dt * 4;
    }
    attackTrail.colliders[key] = list.filter((sample) => sample.alpha > 0);
  }
}

export function updateNpcDebugHud() {
  updateNpcHud(ensureGameState());
}

export function getNpcBodyRadius() {
  const C = window.CONFIG || {};
  return resolveBodyRadius(C);
}
