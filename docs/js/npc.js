// npc.js — Reimplements the NPC systems from the monolith build in a modular form

import { initCombatForFighter } from './combat.js?v=19';
import { ensureFighterPhysics, updateFighterPhysics, resolveFighterBodyCollisions } from './physics.js?v=1';
import { updateFighterFootsteps } from './footstep-audio.js?v=1';
import { applyHealthRegenFromStats, applyStaminaTick, getStatProfile } from './stat-hooks.js?v=1';
import { ensureNpcAbilityDirector, updateNpcAbilityDirector } from './npcAbilityDirector.js?v=1';
import { removeNpcFighter } from './fighter.js?v=8';
import {
  getFighterColliders,
  isPointInsideCircularCollider,
  isPointInsideConeCollider,
  resolveFighterPerceptionColliders,
} from './colliders.js?v=1';
import { computeGroundY } from './ground-utils.js?v=1';
import { resolveStancePose } from './animator.js?v=5';

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function resolveActiveArea() {
  const registry = window.GAME?.mapRegistry || window.__MAP_REGISTRY__;
  if (!registry || typeof registry.getActiveArea !== 'function') return null;
  return registry.getActiveArea();
}

function clampXToPlayableBounds(x, playableBounds = null) {
  if (!playableBounds || !Number.isFinite(playableBounds.left) || !Number.isFinite(playableBounds.right)) {
    return x;
  }
  return clamp(x, playableBounds.left, playableBounds.right);
}

function resolveNpcPathingConfig(state) {
  const ai = state?.ai || {};
  const config = ai.pathing ?? ai.path ?? null;
  if (!config) return null;
  if (typeof config === 'string') return { name: config };
  if (typeof config === 'object') return config;
  return null;
}

function ensureNpcPathState(state) {
  const pathState = state.aiPathState || {};
  state.aiPathState = pathState;
  if (!Number.isInteger(pathState.sequenceIndex)) {
    pathState.sequenceIndex = 0;
  }
  return pathState;
}

function resolveNpcPathTarget(state, area) {
  const config = resolveNpcPathingConfig(state);
  if (!config || !area) return null;
  const playableBounds = area.playableBounds || null;
  const allTargets = Array.isArray(area.pathTargets) ? area.pathTargets : [];
  let candidates = allTargets;
  if (config.name) {
    candidates = candidates.filter((target) => target?.name === config.name);
  }
  if (!candidates.length) return null;

  const pathState = ensureNpcPathState(state);
  const arriveRadius = Number.isFinite(config.arriveRadius)
    ? Math.max(1, config.arriveRadius)
    : 6;
  const ordered = candidates.filter((target) => Number.isFinite(target?.order)).sort((a, b) => a.order - b.order);

  let target = null;
  if (ordered.length) {
    const index = ((pathState.sequenceIndex ?? 0) % ordered.length + ordered.length) % ordered.length;
    target = ordered[index];
    const goalX = clampXToPlayableBounds(target.position?.x ?? state.pos.x, playableBounds);
    const arrived = Math.abs(goalX - (state.pos?.x ?? 0)) <= arriveRadius;
    if (arrived) {
      pathState.sequenceIndex = (index + 1) % ordered.length;
      target = ordered[pathState.sequenceIndex];
    } else {
      pathState.sequenceIndex = index;
    }
  } else {
    const posX = state.pos?.x ?? 0;
    target = candidates.reduce((best, candidate) => {
      const goalX = clampXToPlayableBounds(candidate?.position?.x ?? posX, playableBounds);
      const distance = Math.abs(goalX - posX);
      if (!best) return { candidate, distance };
      return distance < best.distance ? { candidate, distance } : best;
    }, null)?.candidate || null;
  }

  if (!target) return null;
  const goalX = clampXToPlayableBounds(target.position?.x ?? state.pos.x, playableBounds);
  return {
    ...target,
    goalX,
    arriveRadius,
  };
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
  npcSystems.perNpc ||= {};
  return npcSystems;
}

function ensureNpcPerceptionState(state) {
  if (!state) return null;
  const perception = state.perception || (state.perception = {});
  perception.colliders ||= {};
  return perception;
}

function resolveNpcAttackRange(state, combat) {
  const planned = state?.plannedAbility;
  if (planned?.active && Number.isFinite(planned.range)) {
    return planned.range;
  }

  if (combat && typeof combat.getCurrentAttack === 'function') {
    const currentAttack = combat.getCurrentAttack();
    if (currentAttack?.attackData?.range) {
      return currentAttack.attackData.range;
    }
  }

  const ai = state?.ai || {};
  if (Number.isFinite(ai.attackRange)) {
    return ai.attackRange;
  }

  return 70;
}

function updateNpcPerceptionColliders(state, config = null, combat = null) {
  const perception = ensureNpcPerceptionState(state);
  if (!perception) return null;

  const attackRange = resolveNpcAttackRange(state, combat);
  const overrides = config ?? window.CONFIG?.npc?.perception ?? {};

  const rangeScaledOverrides = {
    ...overrides,
    detection: {
      ...(overrides.detection || {}),
      radius: attackRange * 1.5,
    },
    vision: {
      ...(overrides.vision || {}),
      range: attackRange * 2,
    }
  };

  perception.colliders = resolveFighterPerceptionColliders(state, rangeScaledOverrides);
  perception.attackRange = attackRange;
  return perception.colliders;
}

function resolveNpcDeathDestroyDelay(state) {
  if (state && Number.isFinite(state.deathDestroyDelay)) {
    return Math.max(0, state.deathDestroyDelay);
  }
  const configDelay = window.CONFIG?.npc?.deathDestroyDelay;
  if (Number.isFinite(configDelay)) {
    return Math.max(0, configDelay);
  }
  return 0;
}

function destroyNpcInstance(state) {
  if (!state || state.destroyed) return false;
  const id = state.id || 'npc';
  state.destroyed = true;
  unregisterNpcFighter(id);
  removeNpcFighter(id);
  return true;
}

function ensureNpcVisualState(state) {
  if (!state) return null;
  const G = ensureGameState();
  const npcSystems = ensureNpcContainers(G);
  const perNpc = npcSystems.perNpc || (npcSystems.perNpc = {});
  const id = state.id || 'npc';
  const entry = perNpc[id] || (perNpc[id] = {
    id,
    dashTrail: clone(DASH_TRAIL_TEMPLATE),
    attackTrail: clone(ATTACK_TRAIL_TEMPLATE),
  });
  if (!entry.dashTrail) {
    entry.dashTrail = clone(DASH_TRAIL_TEMPLATE);
  }
  if (!entry.attackTrail) {
    entry.attackTrail = clone(ATTACK_TRAIL_TEMPLATE);
  }
  entry.id = id;
  return entry;
}

function ensureNpcInputState(state) {
  if (!state) return {};
  const input = state.aiInput || {
    buttonA: { down: false },
    buttonB: { down: false },
    buttonC: { down: false },
    left: false,
    right: false,
    weaponDrawn: true,
  };
  if (!state.aiInput) state.aiInput = input;
  input.buttonA ||= { down: false };
  input.buttonB ||= { down: false };
  input.buttonC ||= { down: false };
  // Sync weaponDrawn with state (check renderProfile first like animator does)
  const stateWeaponDrawn = state.renderProfile?.weaponDrawn ?? state.weaponDrawn ?? true;
  input.weaponDrawn = stateWeaponDrawn;
  return input;
}

function ensurePlannedAbilityState(state) {
  if (!state) return null;
  const planned = state.plannedAbility || (state.plannedAbility = {
    active: false,
    slotKey: null,
    abilityId: null,
    attackId: null,
    range: null,
    minRange: null,
    maxRange: null,
    holdDuration: null,
    isHoldRelease: false,
    conditions: null,
    chargeOutsideRange: false,
    chargingStarted: false,
    readyToRelease: false,
  });
  return planned;
}

function createPlannedAbility(state, options = {}) {
  if (!state) return null;
  const planned = ensurePlannedAbilityState(state);
  planned.active = true;
  planned.slotKey = options.slotKey || 'A';
  planned.abilityId = options.abilityId || null;
  planned.attackId = options.attackId || null;
  planned.range = Number.isFinite(options.range) ? options.range : 70;
  planned.minRange = Number.isFinite(options.minRange) ? options.minRange : 0;
  planned.maxRange = Number.isFinite(options.maxRange) ? options.maxRange : planned.range;
  planned.holdDuration = Number.isFinite(options.holdDuration) ? options.holdDuration : null;
  planned.isHoldRelease = !!options.isHoldRelease;
  planned.conditions = options.conditions || null;
  planned.chargeOutsideRange = !!options.chargeOutsideRange;
  planned.chargingStarted = false;
  planned.readyToRelease = false;
  return planned;
}

function clearPlannedAbility(state) {
  if (!state?.plannedAbility) return;
  const planned = state.plannedAbility;
  planned.active = false;
  planned.slotKey = null;
  planned.abilityId = null;
  planned.attackId = null;
  planned.range = null;
  planned.minRange = null;
  planned.maxRange = null;
  planned.holdDuration = null;
  planned.isHoldRelease = false;
  planned.conditions = null;
  planned.chargeOutsideRange = false;
  planned.chargingStarted = false;
  planned.readyToRelease = false;
}

function evaluatePlannedAbilityConditions(state, player) {
  const planned = state?.plannedAbility;
  if (!planned || !planned.active) return { canStart: false, canRelease: false, inRange: false };

  const dx = (player?.pos?.x ?? state.pos.x) - state.pos.x;
  const absDx = Math.abs(dx);
  const inMaxRange = absDx <= planned.maxRange;
  const inMinRange = absDx >= planned.minRange;
  const inRange = inMaxRange && inMinRange;

  let canStart = false;
  let canRelease = false;

  if (planned.isHoldRelease) {
    if (planned.chargeOutsideRange) {
      canStart = !planned.chargingStarted;
      canRelease = planned.chargingStarted && inRange;
    } else {
      canStart = inRange && !planned.chargingStarted;
      canRelease = planned.chargingStarted && inRange;
    }
  } else {
    canStart = inRange;
    canRelease = false;
  }

  if (planned.conditions) {
    if (typeof planned.conditions === 'function') {
      const result = planned.conditions(state, player, { dx, absDx, inRange });
      if (result === false) {
        canStart = false;
        canRelease = false;
      } else if (typeof result === 'object') {
        if (result.canStart !== undefined) canStart = result.canStart;
        if (result.canRelease !== undefined) canRelease = result.canRelease;
      }
    }
  }

  return { canStart, canRelease, inRange, absDx };
}

function ensureNpcPressRegistry(state) {
  if (!state) return {};
  state.aiButtonPresses ||= {};
  return state.aiButtonPresses;
}

function resolveObstructionJumpSettings(config) {
  const settings = config?.npc?.obstructionJump || {};
  const clampNumber = (value, fallback, min = 0) => {
    if (!Number.isFinite(value)) return fallback;
    return Math.max(min, value);
  };
  return {
    initialDelay: clampNumber(settings.initialDelay, 10, 0),
    blockedDuration: clampNumber(settings.blockedDuration, 0.9, 0.1),
    cooldown: clampNumber(settings.cooldown, 3.2, 0),
    minVelocity: clampNumber(settings.minVelocity, 45, 0),
    minProgress: clampNumber(settings.minProgress, 4, 0),
    minDistance: clampNumber(settings.minDistance, 36, 0),
  };
}

function ensureObstructionJumpState(state, config) {
  if (!state) return null;
  const tracker = state.obstructionJump || (state.obstructionJump = {});
  if (!Number.isFinite(tracker.blockedTimer)) tracker.blockedTimer = 0;
  if (!Number.isFinite(tracker.cooldown)) tracker.cooldown = 0;
  if (!Number.isFinite(tracker.initialDelay)) {
    const settings = resolveObstructionJumpSettings(config);
    tracker.initialDelay = settings.initialDelay;
  }
  if (!Number.isFinite(tracker.prevPosX) && Number.isFinite(state.pos?.x)) {
    tracker.prevPosX = state.pos.x;
  }
  tracker.blockedRecently = !!tracker.blockedRecently;
  return tracker;
}

function processObstructionJumpPre(state, input, dt, context) {
  if (!state || !input) return null;
  const { config, dx, attackActive, desiredDir } = context;
  const settings = resolveObstructionJumpSettings(config);
  const tracker = ensureObstructionJumpState(state, config);
  if (!tracker) return null;

  tracker.initialDelay = Math.max(0, (tracker.initialDelay ?? settings.initialDelay) - dt);
  tracker.cooldown = Math.max(0, (tracker.cooldown || 0) - dt);

  const hasDistance = Math.abs(dx) > settings.minDistance;
  const wantsAdvance = desiredDir !== 0 && !attackActive && !state.ragdoll && !state.recovering;
  if (tracker.blockedRecently && wantsAdvance && hasDistance && state.onGround) {
    tracker.blockedTimer += dt;
  } else if (tracker.blockedTimer > 0) {
    tracker.blockedTimer = Math.max(0, tracker.blockedTimer - dt * 1.5);
  }

  let triggered = false;
  if (
    wantsAdvance
    && hasDistance
    && tracker.blockedTimer >= settings.blockedDuration
    && tracker.cooldown <= 0
    && tracker.initialDelay <= 0
  ) {
    input.jump = true;
    tracker.cooldown = settings.cooldown;
    tracker.blockedTimer = 0;
    tracker.lastAttemptDir = desiredDir;
    triggered = true;
  }

  tracker.pendingDesiredDir = desiredDir;
  tracker.pendingDistance = Math.abs(dx);
  tracker.pendingSettings = settings;

  return { triggered, settings };
}

function processObstructionJumpPost(state) {
  if (!state?.obstructionJump) return;
  const tracker = state.obstructionJump;
  const settings = tracker.pendingSettings || resolveObstructionJumpSettings(window.CONFIG || {});
  const desiredDir = Number.isFinite(tracker.pendingDesiredDir) ? tracker.pendingDesiredDir : 0;
  const distance = Number.isFinite(tracker.pendingDistance) ? tracker.pendingDistance : 0;
  const hasDistance = distance > settings.minDistance;
  const prevPosX = Number.isFinite(tracker.prevPosX) ? tracker.prevPosX : state.pos?.x ?? 0;
  const currentPosX = Number.isFinite(state.pos?.x) ? state.pos.x : prevPosX;
  const displacement = Math.abs(currentPosX - prevPosX);
  const horizontalSpeed = Math.abs(state.vel?.x || 0);
  const blockedNow = desiredDir !== 0
    && hasDistance
    && state.onGround
    && !state.ragdoll
    && !state.recovering
    && horizontalSpeed < settings.minVelocity
    && displacement < settings.minProgress;
  tracker.blockedRecently = blockedNow;
  tracker.prevPosX = currentPosX;
  delete tracker.pendingDesiredDir;
  delete tracker.pendingDistance;
  delete tracker.pendingSettings;
}

function randomRange(min, max) {
  if (!Number.isFinite(min) || !Number.isFinite(max)) return min || 0;
  if (max <= min) return min;
  return min + Math.random() * (max - min);
}

function resolveNpcPatienceDuration(state) {
  const ai = state?.ai || {};
  const value = Number.isFinite(ai.patience) ? ai.patience : null;
  const fallback = 6;
  if (value == null) return fallback;
  return Math.max(0, value);
}

function resolveNpcRetreatDuration(state) {
  const ai = state?.ai || {};
  const value = Number.isFinite(ai.retreatDuration) ? ai.retreatDuration : null;
  const fallback = 0.75;
  if (value == null) return fallback;
  return Math.max(0, value);
}

function resolveNpcSafeShuffleDistance(state, nearDist) {
  const ai = state?.ai || {};
  if (Number.isFinite(ai.safeShuffleDistance)) {
    return Math.max(nearDist, ai.safeShuffleDistance);
  }
  return nearDist * 1.35;
}

function ensureNpcShuffleState(state) {
  const shuffle = (state.shuffle ||= {});
  if (!Number.isFinite(shuffle.timer)) shuffle.timer = 0;
  if (!Number.isFinite(shuffle.interval)) shuffle.interval = 0.6;
  if (!Number.isFinite(shuffle.direction) || shuffle.direction === 0) {
    shuffle.direction = Math.random() < 0.5 ? -1 : 1;
  }
  if (!Number.isFinite(shuffle.speedScale)) shuffle.speedScale = 0.35;
  shuffle.originDistance = Number.isFinite(shuffle.originDistance)
    ? shuffle.originDistance
    : null;
  shuffle.pendingFlip = !!shuffle.pendingFlip;
  return shuffle;
}

function resetNpcShuffle(state, hintDirection = 0) {
  const shuffle = ensureNpcShuffleState(state);
  shuffle.interval = randomRange(0.45, 0.9);
  const preferred = hintDirection !== 0 ? Math.sign(hintDirection) : (Math.random() < 0.5 ? -1 : 1);
  shuffle.direction = preferred === 0 ? 1 : preferred;
  shuffle.timer = shuffle.interval;
  shuffle.pendingFlip = false;
  shuffle.originDistance = null;
  return shuffle;
}

function ensureNpcDefenseState(state) {
  const defense = (state.aiDefense ||= {});
  if (!Number.isFinite(defense.timer)) defense.timer = 0;
  if (!Number.isFinite(defense.cooldown)) defense.cooldown = 0;
  defense.pending = !!defense.pending;
  defense.requested = !!defense.requested;
  defense.active = !!defense.active;
  defense.threat = !!defense.threat;
  defense.retreatDir = Number.isFinite(defense.retreatDir) ? defense.retreatDir : 0;
  return defense;
}

function resolveNpcReactionWindow(state) {
  const ai = state?.ai || {};
  const reaction = ai.reactionWindow;
  let min = 0.08;
  let max = 0.28;
  if (Array.isArray(reaction) && reaction.length) {
    min = Number.isFinite(reaction[0]) ? Math.max(0, reaction[0]) : min;
    max = Number.isFinite(reaction[1]) ? Math.max(min, reaction[1]) : Math.max(min, max);
  } else if (reaction && typeof reaction === 'object') {
    if (Number.isFinite(reaction.min)) min = Math.max(0, reaction.min);
    if (Number.isFinite(reaction.max)) max = Math.max(min, reaction.max);
  } else if (Number.isFinite(reaction)) {
    min = 0;
    max = Math.max(0, reaction);
  }
  if (max < min) max = min;
  return { min, max };
}

function resolveNpcDefendRange(state, nearDist) {
  const ai = state?.ai || {};
  if (Number.isFinite(ai.defendRange)) {
    return Math.max(0, ai.defendRange);
  }
  return nearDist * 1.05;
}

function updateNpcDefenseScheduling(state, player, dt, { dx, absDx, nearDist }) {
  if (!state || !player) {
    return { activate: false, threat: false, retreatDir: 0 };
  }
  const defense = ensureNpcDefenseState(state);
  const reaction = resolveNpcReactionWindow(state);
  const range = resolveNpcDefendRange(state, nearDist);
  const attack = player.attack || {};
  const playerPhase = attack.currentPhase || null;
  const playerWindingUp = playerPhase === 'Windup' || playerPhase === 'Charge';
  const playerStriking = playerPhase === 'Strike' || playerPhase === 'Impact';
  const playerRecovering = playerPhase === 'Recoil';
  const comboActive = !!player.combo?.active;
  const threat = (attack.active || playerWindingUp || playerStriking || comboActive) && !playerRecovering;
  const inRange = absDx <= range;
  const shouldReact = threat && inRange;

  defense.cooldown = Math.max(0, (defense.cooldown || 0) - dt);
  defense.threat = shouldReact;

  if (!shouldReact) {
    defense.pending = false;
    defense.timer = 0;
    if (!defense.active) {
      defense.requested = false;
      defense.retreatDir = 0;
    }
  } else if (!defense.pending && !defense.active && !defense.requested && defense.cooldown <= 0) {
    defense.timer = randomRange(reaction.min, reaction.max);
    defense.pending = true;
    defense.retreatDir = dx >= 0 ? -1 : 1;
  }

  if (defense.pending) {
    defense.timer = Math.max(0, defense.timer - dt);
    if (defense.timer <= 0) {
      defense.pending = false;
      defense.requested = true;
    }
  }

  return {
    activate: defense.requested,
    threat: shouldReact,
    retreatDir: defense.retreatDir || (dx >= 0 ? -1 : 1),
    range,
  };
}

function initRetreatDebug(state) {
  // Initialize position tracking for retreat debugging (only if not already tracking)
  if (!state || state.retreatDebug?.pos0) return; // Already tracking

  if (!state.retreatDebug) {
    state.retreatDebug = {};
  }
  state.retreatDebug.pos0 = { x: state.pos?.x || 0, y: state.pos?.y || 0, time: 0 };
  state.retreatDebug.pos3 = null;
  state.retreatDebug.pos4 = null;
  state.retreatDebug.tracked3 = false;
  state.retreatDebug.tracked4 = false;
  state.retreatDebug.mode = state.mode;
  console.log(`[NPC Retreat Debug] Started tracking for ${state.id} at position (${state.retreatDebug.pos0.x.toFixed(1)}, ${state.retreatDebug.pos0.y.toFixed(1)})`);
}

// ============================================================================
// Behavior Phase System - Replaces mode-based approach with phase-based cycle
// ============================================================================

function ensureNpcBehaviorPhase(state) {
  const phase = (state.behaviorPhase ||= {});
  phase.current = phase.current || 'decide';
  phase.timer = Number.isFinite(phase.timer) ? phase.timer : 0;
  phase.plannedAbility = phase.plannedAbility || null;
  phase.holdInputActive = !!phase.holdInputActive;
  phase.comboProgress = Number.isFinite(phase.comboProgress) ? phase.comboProgress : 0;
  phase.comboMaxHits = Number.isFinite(phase.comboMaxHits) ? phase.comboMaxHits : 4;
  phase.approachTimeout = Number.isFinite(phase.approachTimeout) ? phase.approachTimeout : 5.0;
  phase.lastHitCount = Number.isFinite(phase.lastHitCount) ? phase.lastHitCount : 0;
  phase.finisherAttempted = !!phase.finisherAttempted;
  return phase;
}

function resetBehaviorPhase(state, newPhase = 'decide') {
  const phase = ensureNpcBehaviorPhase(state);
  phase.current = newPhase;
  phase.timer = 0;
  if (newPhase === 'decide') {
    phase.plannedAbility = null;
    phase.holdInputActive = false;
    phase.comboProgress = 0;
    phase.lastHitCount = 0;
    phase.finisherAttempted = false;
  }
}

function getRandomAbility(combat, excludeDefensive = true) {
  if (!combat || typeof combat.getAbilityForSlot !== 'function') {
    return null;
  }

  const slots = ['A', 'B', 'C'];
  const weights = ['light', 'heavy'];
  const abilities = [];

  for (const slotKey of slots) {
    for (const weight of weights) {
      const ability = combat.getAbilityForSlot(slotKey, weight);
      if (!ability) continue;

      // Exclude defensive abilities (Held C) if requested
      if (excludeDefensive && ability.trigger === 'defensive') continue;
      // Exclude defensive heavy abilities
      if (excludeDefensive && slotKey === 'C' && weight === 'heavy') continue;

      abilities.push({
        slotKey,
        weight,
        ability,
        type: ability.type,
        trigger: ability.trigger,
        id: ability.id,
      });
    }
  }

  if (abilities.length === 0) return null;

  const randomIndex = Math.floor(Math.random() * abilities.length);
  return abilities[randomIndex];
}

function getAbilityRange(combat, abilityDescriptor) {
  if (!combat || !abilityDescriptor) return 70; // Default range

  const ability = abilityDescriptor.ability;
  if (!ability) return 70;

  // Get attack definition to find range
  const attackId = ability.attack || ability.defaultAttack || ability.id;
  const attackDef = typeof combat.getAttackDef === 'function'
    ? combat.getAttackDef(attackId)
    : null;

  return attackDef?.attackData?.range || 70;
}

function isHoldReleaseHeavy(abilityDescriptor) {
  if (!abilityDescriptor) return false;
  return abilityDescriptor.trigger === 'hold-release' && abilityDescriptor.weight === 'heavy';
}

function isComboAbility(abilityDescriptor) {
  if (!abilityDescriptor) return false;
  // Combo abilities are light-weight attacks that chain into sequences
  // Quick attacks are single-hit abilities
  return abilityDescriptor.weight === 'light' && abilityDescriptor.type !== 'quick';
}

function isQuickAttack(abilityDescriptor) {
  if (!abilityDescriptor) return false;
  return abilityDescriptor.type === 'quick';
}

// Phase handlers
function updateDecidePhase(state, combat, dt) {
  const phase = ensureNpcBehaviorPhase(state);

  // Set mode for decide phase (stand still while deciding)
  state.mode = 'approach'; // Approach mode to start moving toward player

  if (!phase.plannedAbility) {
    // Pick random ability (excluding defensive heavy)
    const randomAbility = getRandomAbility(combat, true);
    if (!randomAbility) {
      // No valid abilities found, wait and try again
      phase.timer += dt;
      if (phase.timer > 1.0) phase.timer = 0;
      return;
    }

    phase.plannedAbility = randomAbility;

    // Set attack range based on ability
    const range = getAbilityRange(combat, randomAbility);
    const perception = ensureNpcPerceptionState(state);
    if (perception) {
      perception.attackRange = range;
    }
    if (state.ai) {
      state.ai.attackRange = range;
    }
  }

  // Move to approach phase
  resetBehaviorPhase(state, 'approach');
}

function updateApproachPhase(state, combat, player, dt, absDx) {
  const phase = ensureNpcBehaviorPhase(state);

  // Set mode for approach phase
  state.mode = 'approach';

  if (!phase.plannedAbility) {
    // No ability planned, go back to decide
    resetBehaviorPhase(state, 'decide');
    return;
  }

  phase.timer += dt;

  // Check if hold-release heavy ability - activate hold input at start
  if (!phase.holdInputActive && isHoldReleaseHeavy(phase.plannedAbility)) {
    phase.holdInputActive = true;
    pressNpcButton(state, combat, phase.plannedAbility.slotKey, 999); // Long hold
  }

  // Check transition conditions
  const range = getAbilityRange(combat, phase.plannedAbility);
  const inRange = absDx <= range;
  const timeout = phase.timer >= phase.approachTimeout;

  if (inRange || timeout) {
    resetBehaviorPhase(state, 'attack');
  }
}

function updateAttackPhase(state, combat, dt) {
  const phase = ensureNpcBehaviorPhase(state);

  if (!phase.plannedAbility) {
    resetBehaviorPhase(state, 'retreat');
    return;
  }

  const ability = phase.plannedAbility;

  // Handle different ability types
  if (isHoldReleaseHeavy(ability)) {
    // Hold-release: Keep approaching while holding, then release
    if (phase.holdInputActive) {
      // Still holding - keep approaching to close distance
      state.mode = 'approach';

      // Release the hold immediately upon entering attack phase
      releaseNpcButton(state, combat, ability.slotKey);
      phase.holdInputActive = false;
    } else {
      // Released - now in attack animation, stand still
      state.mode = 'attack';
    }

    // Wait for attack to execute, then move to retreat
    phase.timer += dt;
    if (phase.timer > 0.5) {
      resetBehaviorPhase(state, 'retreat');
    }
  } else if (isComboAbility(ability)) {
    // Combo: Attempt all 4 attacks, checking if at least one strike lands per attack
    const comboState = combat && typeof combat.getComboState === 'function'
      ? combat.getComboState()
      : null;

    if (!comboState) {
      // No combo state, just do a quick attack and move on
      if (phase.comboProgress === 0) {
        pressNpcButton(state, combat, ability.slotKey, 0.12);
        phase.comboProgress = 1;
      }
      phase.timer += dt;
      if (phase.timer > 0.5) {
        resetBehaviorPhase(state, 'retreat');
      }
      return;
    }

    // Track total strikes landed (can be multiple per attack)
    const currentHits = Number.isFinite(comboState.hits) ? comboState.hits : 0;

    // Attempt next combo attack if we haven't reached max
    if (phase.comboProgress < phase.comboMaxHits) {
      const attack = state.attack || {};
      const comboActive = !!comboState.active;
      const attackActive = !!attack.active;

      // Wait for attack to finish before next input
      if (!attackActive && !comboActive) {
        // Check if the previous attack landed at least one strike
        if (phase.comboProgress > 0) {
          // Get hit count before this attack started
          const lastHitCount = Number.isFinite(phase.lastHitCount) ? phase.lastHitCount : 0;

          if (currentHits <= lastHitCount) {
            // No strikes landed from the previous attack, retreat
            resetBehaviorPhase(state, 'retreat');
            return;
          }
        }

        // Save current hit count before pressing next attack
        phase.lastHitCount = currentHits;

        // Press next combo attack
        const pressed = pressNpcButton(state, combat, ability.slotKey, 0.12);
        if (pressed) {
          phase.comboProgress++;
        }
      }
    } else {
      // All 4 combo attacks attempted, check if last attack landed
      const initialHits = Number.isFinite(phase.lastHitCount) ? phase.lastHitCount : 0;

      if (currentHits > initialHits) {
        // Last attack landed, all 4 attacks successful!
        // Try a random quick attack to trigger finisher
        if (!phase.finisherAttempted) {
          const quickSlots = ['A', 'B'];
          const randomQuick = quickSlots[Math.floor(Math.random() * quickSlots.length)];
          pressNpcButton(state, combat, randomQuick, 0.12);
          phase.finisherAttempted = true;
        }
      }

      // Move to retreat after combo sequence
      phase.timer += dt;
      if (phase.timer > 0.5) {
        resetBehaviorPhase(state, 'retreat');
      }
    }
  } else {
    // Quick attack: Perform once
    if (phase.timer === 0) {
      pressNpcButton(state, combat, ability.slotKey, 0.12);
    }

    phase.timer += dt;
    if (phase.timer > 0.5) {
      resetBehaviorPhase(state, 'retreat');
    }
  }
}

function updateRetreatPhase(state, dt, absDx, dx) {
  const phase = ensureNpcBehaviorPhase(state);
  phase.timer += dt;

  // Use existing retreat logic
  state.mode = 'retreat';

  // Set retreat timer if not already set
  if (!Number.isFinite(state.retreatTimer) || state.retreatTimer <= 0) {
    state.retreatTimer = resolveNpcRetreatDuration(state);
    initRetreatDebug(state);
  }

  // Check if retreat is complete
  if (state.retreatTimer <= 0 || phase.timer > 2.0) {
    resetBehaviorPhase(state, 'shuffle');
    resetNpcShuffle(state, dx >= 0 ? -1 : 1);
  }
}

function updateShufflePhase(state, dt) {
  const phase = ensureNpcBehaviorPhase(state);
  phase.timer += dt;

  // Use existing shuffle logic
  state.mode = 'shuffle';

  // Set patience timer if not already set
  if (!Number.isFinite(state.patienceTimer) || state.patienceTimer <= 0) {
    state.patienceTimer = resolveNpcPatienceDuration(state) * 0.5;
  }

  // After shuffle period, return to decide phase
  if (state.patienceTimer <= 0 || phase.timer > 3.0) {
    resetBehaviorPhase(state, 'decide');
  }
}

function triggerNpcPatienceWindow(state, { hintDir = 0 } = {}) {
  if (!state) return;
  const patience = resolveNpcPatienceDuration(state);
  if (patience <= 0) return;
  const retreat = resolveNpcRetreatDuration(state);
  const currentPatience = Number.isFinite(state.patienceTimer) ? state.patienceTimer : 0;
  const currentRetreat = Number.isFinite(state.retreatTimer) ? state.retreatTimer : 0;
  state.patienceTimer = Math.max(currentPatience, patience);
  state.retreatTimer = Math.max(currentRetreat, retreat);
  resetNpcShuffle(state, hintDir);
  state.mode = 'retreat';
  initRetreatDebug(state);
}

function getNpcFighterList(G) {
  const fighters = G.FIGHTERS || {};
  const list = [];
  for (const fighter of Object.values(fighters)) {
    if (!fighter) continue;
    if (fighter.isPlayer) continue;
    if (fighter.id === 'player') continue;
    list.push(fighter);
  }
  return list;
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
  } else if (slotKey === 'C') {
    input.buttonC.down = false;
  }
  // Removed: combat.slotUp(slotKey) - let handleButtons() process input naturally
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
  } else if (slotKey === 'C') {
    input.buttonC.down = true;
  }
  // Removed: combat.slotDown(slotKey) - let handleButtons() process input naturally
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

function ensureNpcCombat(G, state) {
  if (!state) return null;
  const id = state.id || resolveNpcIdFromGame(G, state) || 'npc';
  state.id = id;
  const map = (G.npcCombatMap ||= {});
  if (map[id]) return map[id];
  const combat = initCombatForFighter(id, {
    fighterLabel: id,
    poseTarget: id,
    autoProcessInput: true,  // Changed: Let combat system process input like player
    neutralizeInputMovement: false,
    storeKey: `npcCombat:${id}`,
    inputSource: () => ensureNpcInputState(state),
  });
  map[id] = combat;
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
  aim.headWorldTarget = Number.isFinite(aim.headWorldTarget) ? aim.headWorldTarget : null;
  aim.headTrackingOnly = !!aim.headTrackingOnly;
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

function ensureNpcGroupState(state) {
  if (!state) return null;
  const group = (state.group ||= {});
  group.id = group.id || null;
  group.leaderId = group.leaderId || null;
  group.isLeader = !!group.isLeader;
  group.members = Array.isArray(group.members) ? group.members : [];
  group.followDistance = Number.isFinite(group.followDistance) ? group.followDistance : 80;
  group.formationSpacing = Number.isFinite(group.formationSpacing) ? group.formationSpacing : 60;
  return group;
}

function resolveGroupLeader(G, groupId) {
  if (!groupId) return null;
  const npcs = getNpcFighterList(G);
  const groupMembers = npcs.filter(npc => npc.group?.id === groupId && !npc.isDead);
  if (!groupMembers.length) return null;

  const currentLeader = groupMembers.find(npc => npc.group?.isLeader);
  if (currentLeader && !currentLeader.isDead) {
    return currentLeader;
  }

  const firstAlive = groupMembers.find(npc => !npc.isDead);
  if (firstAlive) {
    ensureNpcGroupState(firstAlive);
    firstAlive.group.isLeader = true;
    groupMembers.forEach(npc => {
      if (npc !== firstAlive) {
        ensureNpcGroupState(npc);
        npc.group.isLeader = false;
        npc.group.leaderId = firstAlive.id;
      }
    });
    return firstAlive;
  }

  return null;
}

function updateGroupLeadership(G, state) {
  const group = ensureNpcGroupState(state);
  if (!group.id) return null;

  const leader = resolveGroupLeader(G, group.id);
  if (!leader) return null;

  if (leader.id === state.id) {
    group.isLeader = true;
    group.leaderId = null;
  } else {
    group.isLeader = false;
    group.leaderId = leader.id;
  }

  return leader;
}

function ensureNpcStaminaAwareness(state) {
  if (!state?.stamina) return null;
  const stamina = state.stamina;
  // Implementation note: we considered wiring this stamina caution either
  // through combat cost guards or the global stamina tick, but keeping it on
  // the NPC state keeps the behavior modular and avoids side-effects for the
  // player controller.
  stamina.prev = Number.isFinite(stamina.prev)
    ? stamina.prev
    : Number.isFinite(stamina.current)
      ? stamina.current
      : 0;
  stamina.exhaustionCount = Number.isFinite(stamina.exhaustionCount)
    ? stamina.exhaustionCount
    : 0;
  stamina.recovering = !!stamina.recovering;
  stamina.reengageRatio = Number.isFinite(stamina.reengageRatio)
    ? clamp(stamina.reengageRatio, 0.1, 0.95)
    : 0.6;
  return stamina;
}

function clearNpcPresses(state, combat) {
  if (!state) return;
  const presses = state.aiButtonPresses;
  if (!presses) return;
  for (const key of Object.keys(presses)) {
    if (presses[key]?.down) {
      releaseNpcButton(state, combat, key);
    }
  }
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
  if (phaseName === 'Stance') return clone(resolveStancePose(C));
  return null;
}

function resolveNpcIdFromGame(G, state) {
  if (!state) return 'npc';
  if (state.id && state.id !== 'npc') return state.id;
  const fighters = G?.FIGHTERS || {};
  for (const [key, fighter] of Object.entries(fighters)) {
    if (fighter === state) {
      return key;
    }
  }
  return state.id || 'npc';
}

function resolveNpcPoseTarget(state) {
  if (!state || typeof state !== 'object') return 'npc';
  const fighters = window.GAME?.FIGHTERS || {};
  const fallback = resolveNpcIdFromGame(window.GAME || {}, state) || state.id || 'npc';
  const target = state.poseTarget || state.id || fallback;
  if (target && !fighters[target] && fallback && fighters[fallback]) {
    console.warn(`[npc] Pose target '${target}' not found; using '${fallback}' instead.`);
    return fallback;
  }
  if (target && fighters[target]) return target;
  if (fallback && fighters[fallback]) return fallback;
  console.warn(`[npc] Pose target '${target || fallback || 'npc'}' not found; defaulting to 'npc'.`);
  return 'npc';
}

function applyNpcLayerOverrides(state, attack, overrides, stageDurMs) {
  if (!Array.isArray(overrides) || overrides.length === 0) return;
  const poseTarget = resolveNpcPoseTarget(state);
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
    const handle = pushPoseLayerOverride(poseTarget, layerId, pose, opts);
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

  const poseTarget = resolveNpcPoseTarget(state);

  if (poseDef) {
    const { layerOverrides, ...primaryPose } = poseDef;
    pushPoseOverride(poseTarget, primaryPose, durMs, { suppressWalk: true });
    applyNpcLayerOverrides(state, attack, layerOverrides, durMs);
  } else if (phaseName === 'Stance') {
    const stance = resolvePoseForPhase(null, 'Stance');
    if (stance) {
      pushPoseOverride(poseTarget, stance, durMs, { suppressWalk: false });
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
      const poseTarget = resolveNpcPoseTarget(state);
      pushPoseOverride(poseTarget, stance, 180, { suppressWalk: false });
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
        state.comboPatienceQueued = true;
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

function normalizeRad(angle) {
  const TAU = Math.PI * 2;
  let out = angle % TAU;
  if (out <= -Math.PI) out += TAU;
  if (out > Math.PI) out -= TAU;
  return out;
}

function getNpcHeadLimits(state) {
  const C = window.CONFIG || {};
  const limits = state?.limits?.head || C.limits?.head || {};
  const relMin = normalizeRad(((limits.relMin ?? -75) * Math.PI) / 180);
  const relMax = normalizeRad(((limits.relMax ?? 75) * Math.PI) / 180);
  const min = Math.min(relMin, relMax);
  const max = Math.max(relMin, relMax);
  return { min, max };
}

function resetNpcAimingOffsets(aim) {
  aim.active = false;
  aim.torsoOffset = 0;
  aim.shoulderOffset = 0;
  aim.hipOffset = 0;
  aim.headWorldTarget = null;
  aim.headTrackingOnly = false;
  aim.currentAngle = 0;
}

function updateNpcPassiveHeadTracking(state, player) {
  const aim = ensureAimState(state);
  const perception = evaluateNpcPerception(state, player);
  const canTrack = perception?.vision && perception?.hearing;
  if (!canTrack) {
    resetNpcAimingOffsets(aim);
    return;
  }

  const dx = (player.pos?.x ?? state.pos.x) - state.pos.x;
  const dy = (player.pos?.y ?? state.pos.y) - state.pos.y;
  const worldAim = normalizeRad(Math.atan2(dy, dx));
  const facingRad = Number.isFinite(state.facingRad) ? state.facingRad : 0;
  const { min, max } = getNpcHeadLimits(state);
  const relative = normalizeRad(worldAim - facingRad);
  const withinLimits = relative >= min && relative <= max;

  aim.active = true;
  aim.currentAngle = 0;
  aim.torsoOffset = 0;
  aim.shoulderOffset = 0;
  aim.hipOffset = 0;
  aim.headTrackingOnly = true;
  aim.headWorldTarget = withinLimits ? worldAim : null;
}

  function updateNpcAiming(state, player, { aggressionActive } = {}) {
    const aim = ensureAimState(state);
    const aggression = ensureNpcAggressionState(state);
    const isAggressive = aggressionActive ?? aggression.active;

    if (!isAggressive || state.nonCombatRagdoll) {
      aim.active = false;
      aim.torsoOffset = 0;
      aim.shoulderOffset = 0;
      aim.hipOffset = 0;
      aim.headWorldTarget = null;
      aim.headTrackingOnly = false;
      return;
  }
  if (!player) {
    resetNpcAimingOffsets(aim);
    return;
  }

    if (!aggression.active) {
      updateNpcPassiveHeadTracking(state, player);
      return;
    }

  const dx = (player.pos?.x ?? state.pos.x) - state.pos.x;
  const dy = (player.pos?.y ?? state.pos.y) - state.pos.y;
  const targetAngle = Math.atan2(dy, dx);
  const relative = targetAngle - (state.facingRad || 0);
  const wrapped = ((relative + Math.PI) % TWO_PI) - Math.PI;

  const onGround = state.onGround !== false;
  const isAttacking = !!(state.attack?.active);

  if (onGround && !isAttacking) {
    aim.active = false;
    aim.torsoOffset = 0;
    aim.shoulderOffset = 0;
    aim.hipOffset = 0;
    aim.headTrackingOnly = true;
    const C = window.CONFIG || {};
    const facingRad = Number.isFinite(state.facingRad) ? state.facingRad : 0;
    const worldAim = Math.atan2(dy, dx);
    const { min, max } = getNpcHeadLimits(state);
    const headRelative = normalizeRad(worldAim - facingRad);
    const withinLimits = headRelative >= min && headRelative <= max;
    aim.headWorldTarget = withinLimits ? worldAim : null;
    return;
  }

  aim.active = true;
  aim.headTrackingOnly = false;
  const smoothing = 0.12;
  aim.currentAngle = Number.isFinite(aim.currentAngle) ? aim.currentAngle : 0;
  aim.currentAngle += (wrapped - aim.currentAngle) * smoothing;
  const aimDeg = (aim.currentAngle * 180) / Math.PI;
  const C = window.CONFIG || {};
  const aimingCfg = C.aiming || {};
  aim.torsoOffset = clamp(aimDeg * 0.5, -(aimingCfg.maxTorsoAngle || 45), aimingCfg.maxTorsoAngle || 45);
  aim.shoulderOffset = clamp(aimDeg * 0.7, -(aimingCfg.maxShoulderAngle || 65), aimingCfg.maxShoulderAngle || 65);
  aim.hipOffset = 0;
}

function updateDashTrail(visualEntry, state, dt) {
  const dashTrail = visualEntry?.dashTrail;
  if (!dashTrail || !dashTrail.enabled) return;
  // Dash trail disabled - dashing removed from game
  for (const pos of dashTrail.positions) {
    pos.alpha -= dt * 3;
  }
  dashTrail.positions = dashTrail.positions.filter((pos) => pos.alpha > 0);
}

function fadeNpcDashTrail(visualEntry, dt) {
  const dashTrail = visualEntry?.dashTrail;
  if (!dashTrail) return;
  for (const pos of dashTrail.positions || []) {
    pos.alpha -= dt * 3;
  }
  dashTrail.positions = (dashTrail.positions || []).filter((pos) => pos.alpha > 0);
}

function updateNpcAttackTrail(visualEntry, state, dt) {
  if (!visualEntry) return;
  if (!state) {
    fadeNpcAttackTrailEntry(visualEntry, dt);
    return;
  }
  if (state.attack?.active) {
    const fighterId = state.id || 'npc';
    recordNpcAttackTrailSample(null, dt, fighterId);
    return;
  }
  fadeNpcAttackTrailEntry(visualEntry, dt);
}

function regenerateStamina(state, dt) {
  if (!state || state.isDead) return;
  applyStaminaTick(state, dt);
  const profile = getStatProfile(state);
  applyHealthRegenFromStats(state, dt, profile);
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

function updateNpcMovement(G, state, dt, abilityIntent = null) {
  const C = window.CONFIG || {};
  const player = G.FIGHTERS?.player;
  if (!player || !state) return;

  const activeArea = resolveActiveArea();
  const playableBounds = activeArea?.playableBounds || null;

  const visuals = ensureNpcVisualState(state);

  if (state.isDead) {
    const previousDeadTime = Number.isFinite(state.deadTime) ? state.deadTime : 0;
    state.deadTime = previousDeadTime + dt;
    updateFighterPhysics(state, C, dt, { input: null, attackActive: false });
    updateFighterFootsteps(state, C, dt);
    fadeNpcDashTrail(visuals, dt);
    fadeNpcAttackTrailEntry(visuals, dt);
    const destroyDelay = resolveNpcDeathDestroyDelay(state);
    if (!state.destroyed && state.deadTime >= destroyDelay) {
      destroyNpcInstance(state);
    }
    return;
  }

  ensureFighterPhysics(state, C);

  const combat = ensureNpcCombat(G, state);
  const attack = ensureAttackState(state);
  const combo = ensureComboState(state);
  const input = ensureNpcInputState(state);
  const aggression = ensureNpcAggressionState(state);
  const stamina = ensureNpcStaminaAwareness(state);
  const ai = state.ai || (state.ai = {});
  const panicThreshold = Number.isFinite(ai.panicThreshold)
    ? clamp(ai.panicThreshold, 0, 1)
    : 0.3;
  if (stamina && Number.isFinite(ai.staminaReengageRatio)) {
    stamina.reengageRatio = clamp(ai.staminaReengageRatio, 0.1, 0.95);
  }
  const health = state.health;
  const healthMax = Number.isFinite(health?.max) ? health.max : Number.isFinite(health?.current) ? Math.max(health.current, 0) : 0;
  const healthCurrent = Number.isFinite(health?.current) ? Math.max(0, health.current) : healthMax;
  const healthRatio = healthMax > 0 ? healthCurrent / healthMax : 1;
  const isPanicking = healthRatio <= panicThreshold;
  ai.isPanicking = isPanicking;
  let enteredRecovery = false;
  let exitedRecovery = false;

  if (stamina) {
    const currentStamina = Number.isFinite(stamina.current) ? stamina.current : 0;
    const previousStamina = Number.isFinite(stamina.prev) ? stamina.prev : currentStamina;
    if (isPanicking) {
      if (stamina.recovering || stamina.exhaustionCount) {
        stamina.recovering = false;
        stamina.exhaustionCount = 0;
        exitedRecovery = true;
      }
    } else if (!stamina.recovering && currentStamina <= 0 && previousStamina > 0) {
      stamina.recovering = true;
      stamina.exhaustionCount += 1;
      enteredRecovery = true;
    }
  }

  if (enteredRecovery) {
    clearNpcPresses(state, combat);
    if (attack?.active) {
      resetAttackState(state);
    }
    if (combo) {
      combo.active = false;
      combo.sequenceIndex = 0;
      combo.attackDelay = 0;
    }
    state.mode = 'recover';
    state.cooldown = Math.max(state.cooldown || 0, 0.5);
    if (state.stamina) {
      
    }
  }

  updateNpcAutomatedInput(state, combat, dt);

  const attackActive = aggression.active && (typeof combat?.isFighterAttacking === 'function'
    ? combat.isFighterAttacking()
    : !!attack?.active);

  if (state.ragdoll || state.recovering) {
    updateFighterPhysics(state, C, dt, { input: null, attackActive: false });
    updateFighterFootsteps(state, C, dt);
    if (state.ragdoll && aggression.triggered && !aggression.active) {
      aggression.wakeTimer = Math.max(0, (aggression.wakeTimer || 0) - dt);
      if (aggression.wakeTimer <= 0) {
        aggression.active = true;
        aggression.wakeTimer = 0;
      }
    }
    updateNpcAiming(state, player, { aggressionActive: aggression.active });
    updateDashTrail(visuals, state, dt);
    updateNpcAttackTrail(visuals, state, dt);
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
      state.weaponDrawn = true;
      if (!state.renderProfile) state.renderProfile = {};
      state.renderProfile.weaponDrawn = true;
      state.renderProfile.weaponStowed = false;
    }
  }

  if (aggression.active) {
    state.weaponDrawn = true;
    if (!state.renderProfile) state.renderProfile = {};
    state.renderProfile.weaponDrawn = true;
    state.renderProfile.weaponStowed = false;
  } else if (!aggression.triggered) {
    state.weaponDrawn = false;
    if (!state.renderProfile) state.renderProfile = {};
    state.renderProfile.weaponDrawn = false;
    state.renderProfile.weaponStowed = true;
  }

  input.left = false;
  input.right = false;
  input.jump = false;

  const groupLeader = updateGroupLeadership(G, state);
  const group = ensureNpcGroupState(state);
  const isFollower = group.id && !group.isLeader && groupLeader;
  const pathTarget = !aggression.active && !isFollower ? resolveNpcPathTarget(state, activeArea) : null;

  if (!aggression.active) {
    state.nonCombatRagdoll = !state.ragdoll && !state.recovering;
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
    

    if (isFollower && groupLeader) {
      const dxLeader = groupLeader.pos.x - state.pos.x;
      const absDxLeader = Math.abs(dxLeader);
      const followDist = group.followDistance || 80;
      const arriveRadius = 20;

      if (absDxLeader > followDist + arriveRadius) {
        input.left = dxLeader < 0;
        input.right = dxLeader > 0;
        state.mode = 'follow';
      } else if (absDxLeader < followDist - arriveRadius) {
        input.left = dxLeader > 0;
        input.right = dxLeader < 0;
        state.mode = 'follow';
      } else {
        state.mode = 'idle';
      }
    } else if (pathTarget) {
      const arriveRadius = pathTarget.arriveRadius ?? 6;
      const dxPath = pathTarget.goalX - state.pos.x;
      input.left = dxPath < -arriveRadius;
      input.right = dxPath > arriveRadius;
      state.mode = input.left || input.right ? 'patrol' : 'idle';
    }

    if (stamina) {
      stamina.recovering = false;
      stamina.exhaustionCount = 0;
      stamina.prev = Number.isFinite(stamina.current) ? stamina.current : stamina.prev;
    }
  } else {
    state.nonCombatRagdoll = false;
  }

  const primaryTargetX = pathTarget?.goalX ?? (player.pos?.x ?? state.pos.x);
  const dx = primaryTargetX - state.pos.x;
  const absDx = Math.abs(dx);
  const nearDist = Number.isFinite(ai.attackRange) ? Math.max(30, ai.attackRange) : 70;
  const safeShuffleDist = resolveNpcSafeShuffleDistance(state, nearDist);
  const isPressing = ['A', 'B', 'C'].some((key) => !!state.aiButtonPresses?.[key]?.down);
  const intent = abilityIntent || state.aiAbilityIntent || null;
  const heavyIntent = intent?.heavy || null;
  const heavyState = intent?.heavyState || null;
  const defensiveActive = !!intent?.defensiveActive;
  const defensiveRequested = !!intent?.defensiveRequested;
  const defensiveType = intent?.defensiveType || null;
  const defensiveRetreatDir = Number.isFinite(intent?.defensiveRetreatDir)
    ? intent.defensiveRetreatDir
    : dx >= 0 ? -1 : 1;
  const suppressBasicAttacks = !!intent?.suppressBasicAttacks;

  const defenseState = ensureNpcDefenseState(state);
  const shuffleState = ensureNpcShuffleState(state);
  const wasDefending = defenseState.active;

  state.comboPatienceQueued = !!state.comboPatienceQueued;
  state.heavyPatienceQueued = !!state.heavyPatienceQueued;
  state.heavyAttemptActive = !!state.heavyAttemptActive;
  state.patienceTimer = Math.max(0, Number.isFinite(state.patienceTimer) ? state.patienceTimer - dt : 0);
  state.retreatTimer = Math.max(0, Number.isFinite(state.retreatTimer) ? state.retreatTimer - dt : 0);
  shuffleState.timer = Math.max(0, Number.isFinite(shuffleState.timer) ? shuffleState.timer - dt : 0);

  // Update retreat position tracking for debugging
  if (state.retreatDebug && state.retreatDebug.pos0) {
    state.retreatDebug.pos0.time += dt;
    const elapsed = state.retreatDebug.pos0.time;
    const currentPos = { x: state.pos?.x || 0, y: state.pos?.y || 0 };

    // Track position at 3 seconds
    if (elapsed >= 3.0 && !state.retreatDebug.tracked3) {
      state.retreatDebug.pos3 = { ...currentPos, time: elapsed };
      state.retreatDebug.tracked3 = true;
      const dx3 = state.retreatDebug.pos3.x - state.retreatDebug.pos0.x;
      const dy3 = state.retreatDebug.pos3.y - state.retreatDebug.pos0.y;
      const dist3 = Math.sqrt(dx3 * dx3 + dy3 * dy3);
      console.log(`[NPC Retreat Debug] ${state.id} at 3s: pos=(${state.retreatDebug.pos3.x.toFixed(1)}, ${state.retreatDebug.pos3.y.toFixed(1)}), distance from start=${dist3.toFixed(1)}, mode=${state.mode}`);
    }

    // Track position at 4 seconds
    if (elapsed >= 4.0 && !state.retreatDebug.tracked4) {
      state.retreatDebug.pos4 = { ...currentPos, time: elapsed };
      state.retreatDebug.tracked4 = true;

      // Calculate distances
      const dx3 = state.retreatDebug.pos3 ? (state.retreatDebug.pos3.x - state.retreatDebug.pos0.x) : 0;
      const dy3 = state.retreatDebug.pos3 ? (state.retreatDebug.pos3.y - state.retreatDebug.pos0.y) : 0;
      const dist3 = Math.sqrt(dx3 * dx3 + dy3 * dy3);

      const dx4 = state.retreatDebug.pos4.x - state.retreatDebug.pos0.x;
      const dy4 = state.retreatDebug.pos4.y - state.retreatDebug.pos0.y;
      const dist4 = Math.sqrt(dx4 * dx4 + dy4 * dy4);

      console.log(`[NPC Retreat Debug] ${state.id} at 4s: pos=(${state.retreatDebug.pos4.x.toFixed(1)}, ${state.retreatDebug.pos4.y.toFixed(1)}), distance from start=${dist4.toFixed(1)}, mode=${state.mode}`);

      // Check if position at 4s is farther than at 3s (continuing to retreat)
      if (dist4 > dist3) {
        console.warn(`[NPC Retreat Debug] ⚠️ BREAKPOINT: ${state.id} is STILL RETREATING at 4s (farther than 3s position)`);
        console.log(`[NPC Retreat Debug] Verbose Data:`, {
          npcId: state.id,
          pos0: state.retreatDebug.pos0,
          pos3: state.retreatDebug.pos3,
          pos4: state.retreatDebug.pos4,
          dist3: dist3.toFixed(1),
          dist4: dist4.toFixed(1),
          currentMode: state.mode,
          retreatTimer: state.retreatTimer?.toFixed(2),
          patienceTimer: state.patienceTimer?.toFixed(2),
          cooldown: state.cooldown?.toFixed(2),
          velocity: { x: state.vel?.x?.toFixed(1), y: state.vel?.y?.toFixed(1) },
          stamina: state.stamina,
          aggression: state.aggression,
          heavyState: state.aiLastHeavyState,
        });
      } else {
        console.log(`[NPC Retreat Debug] ✓ ${state.id} stopped retreating (4s position closer than 3s position)`);
      }

      // Clear tracking after 4s check
      state.retreatDebug = null;
    }
  }

  if (defensiveActive) {
    defenseState.active = true;
    defenseState.requested = false;
    defenseState.retreatDir = defensiveRetreatDir;
  } else if (!defenseState.threat && defenseState.active) {
    defenseState.active = false;
    defenseState.cooldown = Math.max(defenseState.cooldown, resolveNpcRetreatDuration(state) * 0.8);
  } else if (!defenseState.threat) {
    defenseState.active = false;
  }
  if (defensiveRequested) {
    defenseState.requested = true;
    if (!defenseState.pending) {
      defenseState.retreatDir = defensiveRetreatDir;
    }
  } else if (!defenseState.threat && !defenseState.active) {
    defenseState.requested = false;
    if (wasDefending) {
      defenseState.cooldown = Math.max(defenseState.cooldown, resolveNpcRetreatDuration(state));
    }
  }

  const previousHeavyState = state.aiLastHeavyState || null;
  if (heavyState !== previousHeavyState) {
    if (heavyState && ['retreat', 'charge', 'approach'].includes(heavyState)) {
      state.heavyAttemptActive = true;
    }
    if (heavyState === 'recover' && previousHeavyState !== 'recover') {
      state.heavyPatienceQueued = true;
      state.heavyAttemptActive = false;
    } else if ((!heavyState || heavyState === 'idle') && state.heavyAttemptActive) {
      state.heavyPatienceQueued = true;
      state.heavyAttemptActive = false;
    }
    state.aiLastHeavyState = heavyState || null;
  }

  if (state.comboPatienceQueued && !combo.active && !attack.active) {
    triggerNpcPatienceWindow(state, { hintDir: dx >= 0 ? -1 : 1 });
    state.comboPatienceQueued = false;
  }
  if (state.heavyPatienceQueued) {
    triggerNpcPatienceWindow(state, { hintDir: dx >= 0 ? -1 : 1 });
    state.heavyPatienceQueued = false;
  }

  // Old retreat/shuffle transition logic removed - now handled by phase system

  if (aggression.active) {
    state.cooldown = Math.max(0, (state.cooldown || 0) - dt);

    // Initialize behavior phase system
    const phase = ensureNpcBehaviorPhase(state);

    if (attackActive) {
      input.left = false;
      input.right = false;
    } else {
      const recovering = stamina?.recovering && !isPanicking;
      input.left = false;
      input.right = false;

      // Check for interrupts that override normal phase behavior
      let interrupted = false;

      // Interrupt: Stamina recovery
      if (recovering) {
        state.mode = 'recover';
        input.right = dx < 0;
        input.left = dx > 0;
        state.cooldown = Math.max(state.cooldown, 0.4);
        interrupted = true;
      }

      // Interrupt: Defensive behavior (being attacked)
      if (!interrupted && !recovering && (defenseState.active || defenseState.requested || defensiveActive)) {
        state.mode = 'defend';
        // Reset to decide phase after defense ends to start fresh cycle
        if (phase.current !== 'decide' && !defenseState.active) {
          resetBehaviorPhase(state, 'decide');
        }
        interrupted = true;
      }

      // Normal phase-based behavior (not interrupted)
      if (!interrupted) {
        // Update current phase
        switch (phase.current) {
          case 'decide':
            updateDecidePhase(state, combat, dt);
            break;
          case 'approach':
            updateApproachPhase(state, combat, player, dt, absDx);
            break;
          case 'attack':
            updateAttackPhase(state, combat, dt);
            break;
          case 'retreat':
            updateRetreatPhase(state, dt, absDx, dx);
            break;
          case 'shuffle':
            updateShufflePhase(state, dt);
            break;
          default:
            // Unknown phase, reset to decide
            resetBehaviorPhase(state, 'decide');
            break;
        }
      }

      // Set movement input based on current mode (which phases set)
      if (state.mode === 'approach') {
        input.right = dx > 0;
        input.left = dx < 0;
      } else if (state.mode === 'retreat') {
        input.right = dx < 0;
        input.left = dx > 0;
      } else if (state.mode === 'defend') {
        const retreatDir = defenseState.retreatDir || defensiveRetreatDir || (dx >= 0 ? -1 : 1);
        if (defensiveType === 'evade') {
          input.left = retreatDir < 0;
          input.right = retreatDir > 0;
        } else {
          input.left = false;
          input.right = false;
        }
      } else if (state.mode === 'shuffle') {
        if (!Number.isFinite(shuffleState.originDistance)) {
          shuffleState.originDistance = absDx;
        }
        const deviation = Math.abs(absDx - (shuffleState.originDistance || absDx));
        const maxDeviation = nearDist * 0.5;
        if (deviation >= maxDeviation) {
          shuffleState.pendingFlip = true;
        }
        if (shuffleState.timer <= 0 || shuffleState.pendingFlip) {
          const hint = deviation >= maxDeviation
            ? (absDx - (shuffleState.originDistance || absDx))
            : dx >= 0 ? -1 : 1;
          resetNpcShuffle(state, hint);
        }
        input.left = shuffleState.direction < 0;
        input.right = shuffleState.direction > 0;
      } else if (state.mode === 'recover') {
        input.right = dx < 0;
        input.left = dx > 0;
      }
    }

    const recovering = stamina?.recovering && !isPanicking;
    if (state.mode === 'attack' && !attackActive && !isPressing && !recovering) {
      // Attack finished but still in attack mode - handled by attack phase now
      // Don't override the phase system's decisions
    }
  }

  if (stamina) {
    const max = Number.isFinite(stamina.max) ? stamina.max : 100;
    const recoveryThreshold = max * (stamina.reengageRatio || 0.6);
    const current = Number.isFinite(stamina.current) ? stamina.current : 0;
    if (!isPanicking && stamina.recovering && current >= recoveryThreshold) {
      stamina.recovering = false;
      stamina.exhaustionCount = 0;
      exitedRecovery = true;
    }
    stamina.prev = Number.isFinite(stamina.current) ? stamina.current : stamina.prev;
  }

  if (exitedRecovery && state.mode === 'recover') {
    state.mode = 'approach';
    state.cooldown = Math.max(state.cooldown, 0.25);
  }

  const desiredDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  processObstructionJumpPre(state, input, dt, {
    config: C,
    dx,
    attackActive,
    desiredDir,
  });

  updateFighterPhysics(state, C, dt, { input, attackActive });
  updateFighterFootsteps(state, C, dt);
  if (state.mode === 'shuffle') {
    const maxShuffleSpeed = (C.movement?.maxSpeedX || 140) * (shuffleState.speedScale || 0.35);
    state.vel.x = clamp(state.vel.x, -maxShuffleSpeed, maxShuffleSpeed);
  }
  processObstructionJumpPost(state);

  if (playableBounds) {
    state.pos.x = clamp(state.pos.x, playableBounds.left, playableBounds.right);
  }

  state.facingRad = dx >= 0 ? 0 : Math.PI;

  regenerateStamina(state, dt);
  updateDashTrail(visuals, state, dt);
  updateNpcAttackTrail(visuals, state, dt);
  updateNpcAiming(state, player, { aggressionActive: aggression.active });
}

function updateNpcHud(G) {
  const hud = document.getElementById('aiHud');
  if (!hud || hud.style.display === 'none') return;
  const player = G.FIGHTERS?.player;
  const npcs = getNpcFighterList(G);
  if (!player) {
    hud.textContent = 'Player unavailable';
    return;
  }
  if (!npcs.length) {
    hud.textContent = 'NPC unavailable';
    return;
  }
  const primary = npcs.find((npc) => !npc.isDead) || npcs[0];
  const dx = (player.pos?.x ?? 0) - (primary.pos?.x ?? 0);
  const status = primary.isDead ? 'DEAD' : primary.mode || 'n/a';
  hud.textContent = [
    `NPC_COUNT: ${npcs.length}`,
    `primary: ${primary.id || 'npc'}`,
    `state: ${status}`,
    `attack.active: ${!!primary.attack?.active}`,
    `combo.active: ${!!primary.combo?.active} idx: ${primary.combo?.sequenceIndex ?? 0}`,
    `cooldown: ${(primary.cooldown || 0).toFixed(2)}`,
    `dx to player: ${dx.toFixed(1)}`,
  ].join('\n');
}

export function initNpcSystems() {
  const G = ensureGameState();
  const npcs = getNpcFighterList(G);
  if (!npcs.length) return;
  ensureNpcContainers(G);
  for (const npc of npcs) {
    registerNpcFighter(npc, { immediateAggro: true });
  }
}

export function updateNpcSystems(dt) {
  if (!Number.isFinite(dt) || dt <= 0) return;
  const G = ensureGameState();
  const npcs = getNpcFighterList(G);
  if (!npcs.length) {
    updateNpcHud(G);
    return;
  }
  const player = G.FIGHTERS?.player;
  const isFighterEngaged = (fighter) => {
    if (!fighter) return false;
    if (fighter.aggression?.active) return true;
    if (fighter.attack?.active) return true;
    if (fighter.combo?.active) return true;
    return false;
  };
  const aggressiveNpcs = [];
  const engagedPassiveNpcs = [];
  const playerEngaged = isFighterEngaged(player);
  for (const npc of npcs) {
    const combat = ensureNpcCombat(G, npc);
    if (combat?.tick && !npc.isDead) combat.tick(dt);
    ensureNpcInputState(npc);
    let abilityIntent = null;
    if (!npc.isDead) {
      ensureNpcAbilityDirector(npc, combat);
      const dx = (player?.pos?.x ?? npc.pos?.x ?? 0) - (npc.pos?.x ?? 0);
      const absDx = Math.abs(dx);
      const nearDist = Number.isFinite(npc.ai?.attackRange)
        ? Math.max(30, npc.ai.attackRange)
        : 70;
      const defenseRequest = updateNpcDefenseScheduling(npc, player, dt, { dx, absDx, nearDist });
      const pressButton = (slotKey, hold) => pressNpcButton(npc, combat, slotKey, hold);
      const releaseButton = (slotKey) => releaseNpcButton(npc, combat, slotKey);
      abilityIntent = updateNpcAbilityDirector({
        state: npc,
        combat,
        dt,
        player,
        pressButton,
        releaseButton,
        absDx,
        dx,
        aggressionActive: !!npc.aggression?.active,
        attackActive: !!npc.attack?.active,
        isBusy: typeof combat?.isFighterBusy === 'function' ? combat.isFighterBusy() : !!npc.attack?.active,
        defenseRequest,
      });
    }
    updateNpcMovement(G, npc, dt, abilityIntent);
    updateNpcPerceptionColliders(npc, null, combat);

    if (npc.aggression?.active) {
      aggressiveNpcs.push(npc);
    } else if (isFighterEngaged(npc)) {
      engagedPassiveNpcs.push(npc);
    }
  }
  if ((player && !player.destroyed) || npcs.length > 1) {
    const aggressiveColliders = [...aggressiveNpcs];
    const engagedPassiveColliders = engagedPassiveNpcs.filter((npc, index) => {
      if (playerEngaged && isFighterEngaged(npc)) return true;
      if (aggressiveNpcs.some((other) => other !== npc && isFighterEngaged(other))) return true;
      return engagedPassiveNpcs.some((other, otherIndex) => otherIndex !== index && isFighterEngaged(other));
    });
    const fighters = [
      ...(
        player
          ? [player]
          : []
      ),
      ...aggressiveColliders,
      ...engagedPassiveColliders,
    ];
    if (fighters.length > 1) {
      resolveFighterBodyCollisions(fighters, window.CONFIG || {}, { iterations: 2 });
    }
  }
  updateNpcHud(G);
}

export function getNpcDashTrail() {
  const npcSystems = ensureNpcContainers(ensureGameState());
  return Object.values(npcSystems.perNpc || {}).map((entry) => ({ id: entry.id, trail: entry.dashTrail }));
}

export function getNpcAttackTrail() {
  const npcSystems = ensureNpcContainers(ensureGameState());
  return Object.values(npcSystems.perNpc || {}).map((entry) => ({ id: entry.id, trail: entry.attackTrail }));
}

function fadeNpcAttackTrailEntry(visualEntry, dt) {
  const attackTrail = visualEntry?.attackTrail;
  if (!attackTrail) return;
  for (const key of Object.keys(attackTrail.colliders || {})) {
    const list = attackTrail.colliders[key];
    for (const sample of list) {
      sample.alpha -= dt * 4;
    }
    attackTrail.colliders[key] = list.filter((sample) => sample.alpha > 0);
  }
}

function resolveWeaponColliderPoint(fighter, key) {
  if (!fighter?.anim?.weapon?.state) return null;
  const id = key.slice('weapon:'.length);
  if (!id) return null;
  for (const bone of fighter.anim.weapon.state.bones || []) {
    for (const collider of bone?.colliders || []) {
      if (!collider || collider.id !== id) continue;
      const center = collider.center || { x: 0, y: 0 };
      const radius = Math.max(8, Math.max(Number(collider.width) || 0, Number(collider.height) || 0) * 0.5);
      return { x: center.x, y: center.y, radius };
    }
  }
  return null;
}

export function recordNpcAttackTrailSample(colliders, dt, fighterId) {
  const G = ensureGameState();
  const fighter = fighterId ? G.FIGHTERS?.[fighterId] : null;
  if (!fighter) return;
  const visuals = ensureNpcVisualState(fighter);
  const attackTrail = visuals.attackTrail;
  const attack = fighter.attack;
  if (!attackTrail?.enabled || !attack?.active) return;
  attackTrail.timer += dt;
  if (attackTrail.timer < attackTrail.interval) return;
  attackTrail.timer = 0;
  const sourceColliders = colliders || getFighterColliders(fighterId);
  let keys = attack.currentActiveKeys || [];
  if ((!keys || keys.length === 0) && attack.currentPhase?.toLowerCase().includes('strike')) {
    keys = getPresetActiveColliders(attack.context?.preset || attack.preset);
  }
  if (!Array.isArray(keys) || keys.length === 0) return;
  attackTrail.colliders ||= {};
  for (const key of keys) {
    let pos = sourceColliders?.[key];
    let radius = sourceColliders?.[`${key}Radius`];
    if ((!pos || !Number.isFinite(radius)) && key.startsWith('weapon:')) {
      const resolved = resolveWeaponColliderPoint(fighter, key);
      if (resolved) {
        pos = { x: resolved.x, y: resolved.y };
        radius = resolved.radius;
      }
    }
    if (!pos) continue;
    if (!Number.isFinite(radius)) {
      radius = 12;
    }
    const list = attackTrail.colliders[key] || (attackTrail.colliders[key] = []);
    list.unshift({ x: pos.x, y: pos.y, radius, alpha: 1 });
    if (list.length > attackTrail.maxLength) list.length = attackTrail.maxLength;
  }
  fadeNpcAttackTrailEntry(visuals, dt);
}

export function fadeNpcAttackTrail(dt, fighterId) {
  const G = ensureGameState();
  if (fighterId) {
    const fighter = G.FIGHTERS?.[fighterId];
    if (!fighter) return;
    const visuals = ensureNpcVisualState(fighter);
    fadeNpcAttackTrailEntry(visuals, dt);
    return;
  }
  const npcSystems = ensureNpcContainers(G);
  for (const entry of Object.values(npcSystems.perNpc || {})) {
    fadeNpcAttackTrailEntry(entry, dt);
  }
}

export function updateNpcDebugHud() {
  updateNpcHud(ensureGameState());
}

export function getNpcBodyRadius() {
  const C = window.CONFIG || {};
  return resolveBodyRadius(C);
}

export function evaluateNpcPerception(npc, target) {
  if (!npc || !target) return { vision: false, hearing: false };
  const point = target.pos || target.position || target;
  if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) {
    return { vision: false, hearing: false };
  }
  const colliders = npc?.perception?.colliders || updateNpcPerceptionColliders(npc);
  const vision = isPointInsideConeCollider(point, colliders?.vision);
  const hearing = isPointInsideCircularCollider(point, colliders?.hearing);
  return { vision, hearing };
}

export function registerNpcFighter(state, { immediateAggro = false } = {}) {
  if (!state) return;
  const G = ensureGameState();
  const resolvedId = resolveNpcIdFromGame(G, state);
  state.id = resolvedId;
  if (!state.poseTarget || state.poseTarget === 'npc') {
    state.poseTarget = resolvedId;
  }
  ensureNpcVisualState(state);
  const combat = ensureNpcCombat(G, state);
  ensureAttackState(state);
  ensureComboState(state);
  ensureAimState(state);
  ensureNpcInputState(state);
  ensureNpcPressRegistry(state);
  ensureNpcStaminaAwareness(state);
  ensureNpcAbilityDirector(state, combat);
  ensureNpcPerceptionState(state);
  const aggression = ensureNpcAggressionState(state);
  if (immediateAggro) {
    aggression.triggered = true;
    aggression.active = true;
    aggression.wakeTimer = 0;
    state.mode = 'approach';
  } else if (!aggression.active && !aggression.triggered) {
    state.mode = 'idle';
  }
  state.cooldown = aggression.active
    ? (Number.isFinite(state.cooldown) ? state.cooldown : state.ai?.cooldown || 0)
    : 0;
}

export function unregisterNpcFighter(id) {
  if (!id || id === 'player') return;
  const G = ensureGameState();
  const npcSystems = ensureNpcContainers(G);
  if (npcSystems.perNpc) {
    delete npcSystems.perNpc[id];
  }
  if (G.npcCombatMap) {
    delete G.npcCombatMap[id];
  }
}

export function getActiveNpcFighters() {
  return getNpcFighterList(ensureGameState());
}

export function createNpcPlannedAbility(state, options) {
  return createPlannedAbility(state, options);
}

export function clearNpcPlannedAbility(state) {
  return clearPlannedAbility(state);
}

export function evaluateNpcPlannedAbilityConditions(state, player) {
  return evaluatePlannedAbilityConditions(state, player);
}
