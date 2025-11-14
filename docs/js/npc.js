// npc.js — Reimplements the NPC systems from the monolith build in a modular form

import { initCombatForFighter } from './combat.js?v=19';
import { ensureFighterPhysics, updateFighterPhysics } from './physics.js?v=1';

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const DEFAULT_WORLD_WIDTH = 1600;
const TWO_PI = Math.PI * 2;

const DEFAULT_DURATION_KEY_FALLBACKS = {
  toWindup: 320,
  toStrike: 160,
  toRecoil: 180,
  toStance: 120,
  toSlam: 160,
};

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
  G.npcCombat = combat;
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

function ensureNpcAggressionState(state) {
  if (!state) return {};
  const aggression = (state.aggression ||= {});
  aggression.triggered = !!aggression.triggered;
  aggression.active = !!aggression.active;
  aggression.wakeDelay = Number.isFinite(aggression.wakeDelay)
    ? aggression.wakeDelay
    : 0.4;
  if (!Number.isFinite(aggression.wakeTimer)) {
    aggression.wakeTimer = aggression.triggered ? aggression.wakeDelay : 0;
  }
  return aggression;
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

const PRIMARY_DURATION_KEYS = {
  Windup: ['toWindup'],
  Strike: ['toStrike'],
  Recoil: ['toRecoil'],
  Stance: ['toStance'],
  Slam: ['toStrike', 'toSlam'],
};

function deriveDurationKeyCandidates(poseName) {
  if (!poseName || typeof poseName !== 'string') return [];
  const trimmed = poseName.trim();
  if (!trimmed) return [];
  const candidates = [];
  const canonical = trimmed.replace(/\s+/g, '');
  const base = PRIMARY_DURATION_KEYS[canonical];
  if (Array.isArray(base)) candidates.push(...base);

  const match = canonical.match(/^(Windup|Strike|Recoil|Stance)(.+)$/i);
  if (match) {
    const [, prefix, suffix] = match;
    const cap = prefix[0].toUpperCase() + prefix.slice(1).toLowerCase();
    candidates.push(`to${cap}${suffix}`);
    candidates.push(`to${cap}`);
  }

  if (!PRIMARY_DURATION_KEYS[canonical]) {
    const cap = canonical[0].toUpperCase() + canonical.slice(1);
    candidates.push(`to${cap}`);
  }

  return [...new Set(candidates)];
}

function resolveDurationMsForPose(poseName, presetDurations, fallbackDurations) {
  const sources = [];
  if (presetDurations) sources.push(presetDurations);
  if (fallbackDurations && fallbackDurations !== presetDurations) {
    sources.push(fallbackDurations);
  }
  const config = window.CONFIG || {};
  const globalDurations = config.durations;
  if (globalDurations) sources.push(globalDurations);
  const attackDefaultDurations = config.attacks?.defaults?.durations;
  if (attackDefaultDurations) sources.push(attackDefaultDurations);

  const keys = deriveDurationKeyCandidates(poseName);
  let zeroDurationDetected = false;

  for (const key of keys) {
    if (!key) continue;
    for (const source of sources) {
      if (!source) continue;
      const value = source?.[key];
      if (!Number.isFinite(value)) continue;
      if (value > 0) return value;
      if (value === 0) zeroDurationDetected = true;
    }
  }

  for (const key of keys) {
    if (!key) continue;
    const normalizedKey = key.replace(/\d+$/, '');
    const fallback = DEFAULT_DURATION_KEY_FALLBACKS[key]
      ?? DEFAULT_DURATION_KEY_FALLBACKS[normalizedKey];
    if (Number.isFinite(fallback) && fallback > 0) {
      return fallback;
    }
  }

  return zeroDurationDetected ? 1 : 0;
}

function cancelNpcLayerHandles(attack) {
  if (!attack?.layerHandles) return;
  while (attack.layerHandles.length) {
    const handle = attack.layerHandles.pop();
    try {
      if (handle && typeof handle.cancel === 'function') handle.cancel();
    } catch (err) {
      console.warn('[npc] Failed to cancel NPC layer override', err);
    }
  }
}

function resolvePreset(presetName) {
  if (!presetName) return null;
  const C = window.CONFIG || {};
  return (
    C.presets?.[presetName]
    || C.moves?.[presetName]
    || C.attacks?.presets?.[presetName]
    || null
  );
}

function resolvePoseForPhase(preset, phaseName) {
  if (!phaseName) return null;
  if (preset?.poses?.[phaseName]) return clone(preset.poses[phaseName]);
  const C = window.CONFIG || {};
  if (C.poses?.[phaseName]) return clone(C.poses[phaseName]);
  if (phaseName === 'Stance' && C.poses?.Stance) return clone(C.poses.Stance);
  return null;
}

function applyNpcLayerOverrides(attack, overrides, stageDurMs) {
  if (!Array.isArray(overrides) || overrides.length === 0) return;
  overrides.forEach((layer, index) => {
    if (!layer || layer.enabled === false) return;
    const pose = layer.pose ? clone(layer.pose) : {};
    const opts = {
      mask: layer.mask || layer.joints,
      priority: layer.priority,
      suppressWalk: layer.suppressWalk,
      useAsBase: layer.useAsBase,
      durMs: Number.isFinite(layer.durMs)
        ? layer.durMs
        : Number.isFinite(layer.durationMs)
          ? layer.durationMs
          : Number.isFinite(layer.dur)
            ? layer.dur
            : stageDurMs,
      delayMs: Number.isFinite(layer.delayMs)
        ? layer.delayMs
        : Number.isFinite(layer.offsetMs)
          ? layer.offsetMs
          : 0,
    };
    const layerId = layer.id || `npc-layer-${index}`;
    const handle = pushPoseLayerOverride('npc', layerId, pose, opts);
    if (handle && typeof handle.cancel === 'function') {
      attack.layerHandles.push(handle);
    }
  });
}

function applyNpcPoseForCurrentPhase(state, { force = false } = {}) {
  const attack = ensureAttackState(state);
  if (!force && !attack.active) return;

  const sequence = Array.isArray(attack.sequence) ? attack.sequence : [];
  if (!sequence.length) return;

  const idx = Math.max(0, Math.min(attack.phaseIndex, sequence.length - 1));
  const phaseName = sequence[idx] || 'Stance';
  if (!force && attack.lastAppliedPhase === phaseName && attack.lastPhaseIndex === idx) return;

  const preset = resolvePreset(attack.preset);
  const poseDef = resolvePoseForPhase(preset, phaseName);
  const durSec = Array.isArray(attack.durations) ? attack.durations[idx] : null;
  const durMs = Number.isFinite(durSec) ? Math.max(1, durSec * 1000) : 300;

  cancelNpcLayerHandles(attack);

  if (poseDef) {
    const { layerOverrides, ...primaryPose } = poseDef;
    pushPoseOverride('npc', primaryPose, durMs, { suppressWalk: true });
    applyNpcLayerOverrides(attack, layerOverrides, durMs);
  } else if (phaseName === 'Stance') {
    const stance = resolvePoseForPhase(null, 'Stance');
    if (stance) {
      pushPoseOverride('npc', stance, durMs, { suppressWalk: false });
    }
  }

  attack.lastAppliedPhase = phaseName;
  attack.lastPhaseIndex = idx;
}

function resetAttackState(state) {
  const attack = ensureAttackState(state);
  const wasActive = attack.active;
  cancelNpcLayerHandles(attack);
  attack.active = false;
  attack.preset = null;
  attack.sequence = [];
  attack.durations = [];
  attack.phaseIndex = 0;
  attack.timer = 0;
  attack.currentPhase = null;
  attack.currentActiveKeys = [];
  attack.strikeLanded = false;
  attack.isHoldRelease = false;
  attack.holdWindupDuration = 0;
  attack.lunge.active = false;
  attack.lastAppliedPhase = null;
  attack.lastPhaseIndex = -1;
  if (wasActive) {
    const stance = resolvePoseForPhase(null, 'Stance');
    if (stance) {
      pushPoseOverride('npc', stance, 180, { suppressWalk: false });
    }
  }
}

function startNpcQuickAttack(state, presetName) {
  const C = window.CONFIG || {};
  const attack = ensureAttackState(state);
  const combo = ensureComboState(state);
  const preset = C.presets?.[presetName];

  attack.active = true;
  attack.preset = presetName;
  attack.phaseIndex = 0;
  attack.timer = 0;
  attack.currentActiveKeys = [];
  attack.strikeLanded = false;
  attack.currentPhase = null;
  attack.isHoldRelease = false;
  attack.holdWindupDuration = 0;

  if (preset?.sequence) {
    attack.sequence = [];
    attack.durations = [];
    const fallbackDurations = getPresetDurations(presetName) || {};
    for (const step of preset.sequence) {
      const pose = typeof step === 'string'
        ? step
        : step?.pose || step?.poseKey || 'Stance';
      attack.sequence.push(pose);
      let durMs = 0;
      if (step && typeof step === 'object') {
        if (Number.isFinite(step.durMs)) {
          durMs = step.durMs;
        } else if (Number.isFinite(step.durationMs)) {
          durMs = step.durationMs;
        } else if (Number.isFinite(step.dur)) {
          durMs = step.dur;
        }
        if (!durMs && step.durKey) {
          const durs = preset.durations || fallbackDurations || C.durations || {};
          durMs = durs[step.durKey] || 0;
        }
      }
      if (!durMs) {
        durMs = resolveDurationMsForPose(pose, preset.durations, fallbackDurations);
      }
      attack.durations.push((durMs || 0) / 1000);
    }
  } else {
    const durs = getPresetDurations(presetName) || {};
    const w = durs.toWindup || 0;
    const s = durs.toStrike || 0;
    const r = durs.toRecoil || 0;
    const st = durs.toStance || 0;
    attack.sequence = ['Windup', 'Strike', 'Recoil', 'Stance'];
    attack.durations = [w, s, r, st].map((ms) => (ms || 0) / 1000);
  }

  combo.attackDelay = 0;
  attack.lastAppliedPhase = null;
  attack.lastPhaseIndex = -1;
  applyNpcPoseForCurrentPhase(state, { force: true });
}

function startNpcHoldReleaseAttack(state, presetName, windupMs) {
  const attack = ensureAttackState(state);
  const durs = getPresetDurations(presetName) || {};
  const windup = Number(windupMs) || 1000;
  attack.active = true;
  attack.preset = presetName;
  attack.sequence = ['Windup', 'Strike', 'Recoil', 'Stance'];
  attack.durations = [windup / 1000, (durs.toStrike || 0) / 1000, (durs.toRecoil || 0) / 1000, (durs.toStance || 0) / 1000];
  attack.phaseIndex = 0;
  attack.timer = 0;
  attack.currentActiveKeys = [];
  attack.isHoldRelease = true;
  attack.holdWindupDuration = windup;
  attack.strikeLanded = false;
  attack.currentPhase = null;
  attack.lastAppliedPhase = null;
  attack.lastPhaseIndex = -1;
  applyNpcPoseForCurrentPhase(state, { force: true });
}

function updateNpcAttack(G, state, dt) {
  const combo = ensureComboState(state);
  const attack = ensureAttackState(state);
  const MOVE = G.FIGHTERS?.player;
  const C = window.CONFIG || {};

  if (combo.active && !attack.active) {
    combo.attackDelay -= dt;
    if (combo.attackDelay <= 0) {
      combo.sequenceIndex += 1;
      if (combo.sequenceIndex < 4) {
        const preset = C.combo?.sequence?.[combo.sequenceIndex];
        startNpcQuickAttack(state, preset || 'KICK');
        combo.attackDelay = 0.15;
      } else if (combo.sequenceIndex === 4) {
        const idx = 0;
        const preset = C.combo?.altSequence?.[idx] || C.combo?.sequence?.[idx] || 'KICK';
        startNpcQuickAttack(state, preset);
        combo.attackDelay = 0.15;
        combo.sequenceIndex += 1;
      } else {
        combo.active = false;
        combo.sequenceIndex = 0;
      }
    }
  }

  if (!attack.active) {
    applyNpcPoseForCurrentPhase(state);
    return;
  }

  attack.timer += dt;
  while (attack.phaseIndex < attack.durations.length && attack.timer >= attack.durations[attack.phaseIndex]) {
    attack.timer -= attack.durations[attack.phaseIndex];
    const oldPhase = attack.sequence[attack.phaseIndex];
    attack.phaseIndex += 1;
    if (attack.phaseIndex >= attack.durations.length) {
      resetAttackState(state);
      if (combo.active) combo.attackDelay = 0.15;
      return;
    }
    const newPhase = attack.sequence[attack.phaseIndex];
    if (newPhase === 'Strike' && oldPhase !== 'Strike') {
      attack.strikeLanded = false;
      attack.currentPhase = 'Strike';
      attack.currentActiveKeys = getPresetActiveColliders(attack.preset);
      attack.lunge.active = true;
      attack.lunge.paused = false;
      attack.lunge.distance = 0;
      const dx = (MOVE?.pos?.x ?? state.pos.x) - state.pos.x;
      const dy = (MOVE?.pos?.y ?? state.pos.y) - state.pos.y;
      const aimAngle = Math.atan2(dy, dx);
      const lungeSpeed = attack.lunge.speed;
      attack.lunge.lungeVel.x = Math.cos(aimAngle) * lungeSpeed;
      attack.lunge.lungeVel.y = Math.sin(aimAngle) * lungeSpeed * 0.3;
    } else if (newPhase === 'Recoil' && oldPhase === 'Strike') {
      if (!attack.strikeLanded) {
        combo.hits = 0;
      }
      attack.currentPhase = 'Recoil';
    }
  }

  const phaseName = attack.sequence[attack.phaseIndex];
  if (phaseName === 'Strike') {
    attack.currentPhase = 'Strike';
    attack.currentActiveKeys = getPresetActiveColliders(attack.preset);
  } else {
    attack.currentActiveKeys = [];
    attack.currentPhase = phaseName || null;
  }
  applyNpcPoseForCurrentPhase(state);
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

  ensureFighterPhysics(state, C);

  const combat = ensureNpcCombat(G);
  const attack = ensureAttackState(state);
  const combo = ensureComboState(state);
  const input = ensureNpcInputState(state);
  const aggression = ensureNpcAggressionState(state);
  updateNpcAutomatedInput(state, combat, dt);

  const attackActive = aggression.active && (typeof combat?.isFighterAttacking === 'function'
    ? combat.isFighterAttacking()
    : !!attack?.active);

  if (state.ragdoll || state.recovering) {
    updateFighterPhysics(state, C, dt, { input: null, attackActive: false });
    if (state.ragdoll && aggression.triggered && !aggression.active) {
      aggression.wakeTimer = Math.max(0, (aggression.wakeTimer || 0) - dt);
      if (aggression.wakeTimer <= 0) {
        aggression.active = true;
        aggression.wakeTimer = 0;
      }
    }
    updateNpcAiming(state, player);
    updateDashTrail(npcSystems, state, dt);
    regenerateStamina(state, dt);
    return;
  }

  if (aggression.triggered && !aggression.active) {
    aggression.wakeTimer = Math.max(0, (aggression.wakeTimer || 0) - dt);
    if (aggression.wakeTimer <= 0) {
      aggression.active = true;
      aggression.wakeTimer = 0;
      state.mode = 'approach';
      state.cooldown = 0;
    }
  }

  input.left = false;
  input.right = false;
  input.jump = false;

  if (!aggression.active) {
    if (combo) {
      combo.active = false;
      combo.sequenceIndex = 0;
      combo.attackDelay = 0;
    }
    if (attack?.active) {
      resetAttackState(state);
    }
    const presses = state.aiButtonPresses;
    if (presses) {
      for (const key of Object.keys(presses)) {
        if (presses[key]?.down) {
          releaseNpcButton(state, combat, key);
        }
      }
    }
    input.buttonA.down = false;
    input.buttonB.down = false;
    state.mode = aggression.triggered ? 'alert' : 'idle';
    state.cooldown = 0;
    state.stamina.isDashing = false;
  }

  const dx = (player.pos?.x ?? state.pos.x) - state.pos.x;
  const absDx = Math.abs(dx);
  const nearDist = 70;
  const isPressing = !!state.aiButtonPresses?.A?.down || !!state.aiButtonPresses?.B?.down;

  if (aggression.active) {
    state.cooldown = Math.max(0, (state.cooldown || 0) - dt);
    if (attackActive) {
      state.stamina.isDashing = false;
      input.left = false;
      input.right = false;
    } else {
      if (state.mode === 'attack') {
        state.mode = 'evade';
        state.timer = 0.3;
        state.cooldown = Math.max(state.cooldown, 0.35);
      } else if (absDx <= nearDist && state.cooldown <= 0 && !isPressing) {
        if (pressNpcButton(state, combat, 'A', 0.12)) {
          state.mode = 'attack';
          state.cooldown = 0.45;
        }
      }

      if (state.mode === 'approach') {
        input.right = dx > 0;
        input.left = dx < 0;
        state.stamina.isDashing = absDx > nearDist * 1.2;
      } else if (state.mode === 'evade') {
        const dashReady = state.stamina.current >= state.stamina.minToDash;
        state.stamina.isDashing = dashReady;
        input.right = dx < 0;
        input.left = dx > 0;
        state.timer = (state.timer || 0) - dt;
        if (state.timer <= 0) {
          state.mode = 'approach';
          state.stamina.isDashing = false;
        }
      } else {
        state.stamina.isDashing = false;
      }
    }

    if (state.mode === 'attack' && !attackActive && !isPressing) {
      state.mode = 'approach';
    }
  } else {
    state.stamina.isDashing = false;
  }

  updateFighterPhysics(state, C, dt, { input, attackActive });

  state.facingRad = dx >= 0 ? 0 : Math.PI;

  regenerateStamina(state, dt);
  updateDashTrail(npcSystems, state, dt);
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
  const aggression = ensureNpcAggressionState(npc);
  if (!aggression.active && !aggression.triggered) {
    npc.mode = 'idle';
  } else {
    npc.mode = npc.mode || npc.ai?.mode || 'approach';
  }
  npc.cooldown = aggression.active
    ? (Number.isFinite(npc.cooldown) ? npc.cooldown : npc.ai?.cooldown || 0)
    : 0;
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
