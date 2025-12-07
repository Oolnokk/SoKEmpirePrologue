// hitdetect.js — basic hit detection between player and NPC bodies
import { applyAirborneSpinImpulse, applyHitReactionRagdoll, triggerFullRagdoll } from './physics.js?v=2';
import { getFootingMitigation, getStatProfile } from './stat-hooks.js?v=1';
import { getActiveNpcFighters } from './npc.js?v=2';
import { markFighterDead } from './fighter.js?v=8';
import { reportPlayerAggression, reportNpcDefeated, reportPlayerDeath } from './bounty.js?v=1';
import { playAttackHitSound } from './hit-audio.js?v=1';

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function getBalanceScalar(key, fallback = 1) {
  if (typeof window === 'undefined') return fallback;
  const balance = window.CONFIG?.balance;
  const value = balance?.[key];
  return Number.isFinite(value) ? Number(value) : fallback;
}

function resolveAttackDamage(attack) {
  const candidates = [
    attack?.context?.damage?.health,
    attack?.context?.attackProfile?.damage?.health,
    attack?.damage?.health,
    attack?.damage,
  ];
  for (const value of candidates) {
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function resolveWeaponType(config, attack, attacker) {
  const candidates = [
    attack?.context?.attack?.type,
    attack?.context?.ability?.type,
    attack?.context?.variant?.type,
    attack?.type,
    attacker?.weaponType,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim()) return candidate;
  }

  const weaponKey = attacker?.weapon
    || attack?.context?.weapon
    || config?.knockback?.currentWeapon
    || null;
  const weaponTypes = config?.knockback?.weaponTypes || {};
  const weaponCombos = config?.weaponCombos || {};
  const fromKnockback = weaponKey ? weaponTypes[weaponKey]?.type : null;
  const fromCombo = weaponKey ? weaponCombos[weaponKey]?.type : null;
  if (typeof fromKnockback === 'string' && fromKnockback) return fromKnockback;
  if (typeof fromCombo === 'string' && fromCombo) return fromCombo;
  if (weaponKey === 'unarmed') return 'blunt';
  return null;
}

function triggerAttackHitSound(config, attacker, attack) {
  const weaponType = resolveWeaponType(config, attack, attacker);
  const damage = resolveAttackDamage(attack);
  try {
    void playAttackHitSound({ weaponType, damage });
  } catch (error) {
    console.warn('[hitdetect] Failed to play hit sound', error);
  }
}

function ensureDebugState() {
  const G = (window.GAME ||= {});
  const state = (G.HITDEBUG ||= {
    player: { lastPhase: null, collidedThisPhase: false },
    perNpc: {},
    lastColliders: [],
  });
  state.player ||= { lastPhase: null, collidedThisPhase: false };
  state.perNpc ||= {};
  state.lastColliders ||= [];
  return state;
}

function getNpcDebugState(debug, npcId) {
  const map = debug.perNpc || (debug.perNpc = {});
  const entry = map[npcId] || (map[npcId] = {
    playerPhase: null,
    playerCollided: false,
    npcPhase: null,
    npcCollided: false,
  });
  return entry;
}

export function initHitDetect() {
  ensureDebugState();
}

function getBodyRadius(config) {
  const wHalf = (config.parts?.hitbox?.w || 40) * (config.actor?.scale || 1) * 0.5;
  const hHalf = (config.parts?.hitbox?.h || 80) * (config.actor?.scale || 1) * 0.5;
  return Math.sqrt(wHalf * wHalf + hHalf * hHalf);
}

function getPresetNameFromAttack(attack) {
  if (!attack) return '';
  if (attack.context?.preset) return String(attack.context.preset);
  if (attack.preset) return String(attack.preset);
  if (attack.context?.attackId) return String(attack.context.attackId);
  return '';
}

function getAttackReach(presetName) {
  const upper = presetName.toUpperCase();
  if (upper.startsWith('SLAM')) return 120;
  if (upper.startsWith('KICK')) return 85;
  if (upper.startsWith('PUNCH')) return 70;
  return 80;
}

function resolveKnockbackBase(config, presetName) {
  if (!presetName) return 180;
  const moves = config.moves || {};
  const presets = config.presets || {};
  const move = moves[presetName];
  if (move?.knockbackBase) return move.knockbackBase;
  const preset = presets[presetName];
  if (preset?.knockbackBase) return preset.knockbackBase;
  if (preset?.durations?.knockbackBase) return preset.durations.knockbackBase;
  return 180;
}

function calculateKnockback(config, presetName, defenderFooting, multiplier = 1) {
  const base = resolveKnockbackBase(config, presetName) * (multiplier || 1);
  const weaponKey = config.knockback?.currentWeapon || 'unarmed';
  const weaponType = config.knockback?.weaponTypes?.[weaponKey];
  const weaponMult = weaponType?.multiplier || 1;
  const maxFooting = config.knockback?.maxFooting || 100;
  const footingRatio = clamp(defenderFooting / maxFooting, 0, 1);
  const footingModifier = 2 - footingRatio;
  return base * weaponMult * footingModifier;
}

function computeFootingDamage(config, footingBefore, force, defender) {
  const maxFooting = config.knockback?.maxFooting || 100;
  const clampedFooting = clamp(
    Number.isFinite(footingBefore) ? footingBefore : maxFooting,
    0,
    maxFooting,
  );
  const stabilityRatio = maxFooting > 0 ? clampedFooting / maxFooting : 0;
  const normalizedForce = Math.max(0, force) / (config.knockback?.referenceForce || 220);
  const baseLoss = 4 + normalizedForce * 4.5;
  const instabilityBonus = 1 + (1 - stabilityRatio) * 0.75;
  const footingDamageMultiplier = getBalanceScalar('footingDamage', 1);
  let totalLoss = baseLoss * instabilityBonus * footingDamageMultiplier;
  if (defender) {
    const statProfile = getStatProfile(defender);
    const mitigation = getFootingMitigation(statProfile);
    totalLoss *= mitigation;
  }
  return clamp(totalLoss, 0, maxFooting);
}

function resolveAirborneMultiplier(config) {
  const raw = config?.knockback?.airborneMultiplier;
  if (!Number.isFinite(raw)) return 5;
  return Math.max(0, raw);
}

function applyKnockback(target, angle, force, { verticalScale = 0.2, config } = {}) {
  if (!target || !Number.isFinite(force) || force === 0) return;
  const effectiveConfig = config || window.CONFIG || {};
  const airborne = target.onGround === false;
  const multiplier = airborne ? resolveAirborneMultiplier(effectiveConfig) : 1;
  const finalForce = force * multiplier;
  target.vel = target.vel || { x: 0, y: 0 };
  target.vel.x += Math.cos(angle) * finalForce;
  target.vel.y += Math.sin(angle) * finalForce * verticalScale;

  const duration = Math.max(0.18, Math.min(0.9, 0.18 + Math.abs(finalForce) / 240));
  target.knockback ||= { timer: 0, magnitude: 0, direction: angle };
  target.knockback.timer = Math.max(target.knockback.timer || 0, duration);
  target.knockback.magnitude = Math.max(target.knockback.magnitude || 0, Math.abs(finalForce));
  target.knockback.direction = angle;

  if (airborne && Math.abs(finalForce) > 0) {
    const horizontalComponent = Math.cos(angle);
    applyAirborneSpinImpulse(target, effectiveConfig, {
      force: finalForce,
      direction: horizontalComponent,
    });
  }
}

function handlePlayerHitsNpc(G, config, player, npc, debug, distance, bodyRadius) {
  if (!npc || npc.isDead) return;
  const attack = player.attack || {};
  const phase = attack.currentPhase || 'Stance';
  const playerDebug = debug.player || (debug.player = { lastPhase: null, collidedThisPhase: false });
  const npcDebug = getNpcDebugState(debug, npc.id || 'npc');
  if (playerDebug.lastPhase !== phase) {
    playerDebug.lastPhase = phase;
    playerDebug.collidedThisPhase = false;
  }
  if (npcDebug.playerPhase !== phase) {
    npcDebug.playerPhase = phase;
    npcDebug.playerCollided = false;
  }
  if (!attack.active || !phase.toLowerCase().includes('strike')) {
    return;
  }

  const presetName = getPresetNameFromAttack(attack);
  const reach = getAttackReach(presetName) + bodyRadius;
  if (distance > reach || npcDebug.playerCollided) return;

  npcDebug.playerCollided = true;
  debug.lastColliders = [`${npc.id || 'npc'}-body`];

  const multiplier = attack.context?.multipliers?.knockback || 1;
  const force = calculateKnockback(config, presetName, npc.footing ?? 100, multiplier);
  const angle = Math.atan2(npc.pos.y - player.pos.y, npc.pos.x - player.pos.x);
  const footingBefore = npc.footing ?? (config.knockback?.maxFooting ?? 100);
  applyKnockback(npc, angle, force, { verticalScale: 0.2, config });
  const footingLoss = computeFootingDamage(config, footingBefore, force, npc);
  npc.footing = Math.max(0, footingBefore - footingLoss);
  applyHitReactionRagdoll(npc, config, { angle, force, footingBefore });
  const aggression = npc.aggression || (npc.aggression = {});
  if (!aggression.triggered) {
    aggression.triggered = true;
    const delay = Number.isFinite(aggression.wakeDelay) ? aggression.wakeDelay : 0.4;
    aggression.wakeTimer = Math.max(aggression.wakeTimer || 0, delay);
  }
  if (!aggression.active) {
    npc.mode = 'alert';
  }
  if (!attack.strikeLanded) {
    attack.strikeLanded = true;
  }
  const counts = G.HIT_COUNTS?.npc;
  if (counts) {
    counts.body = (counts.body || 0) + 1;
  }
  reportPlayerAggression(npc);

  const healthBefore = Number.isFinite(npc.health?.current) ? npc.health.current : null;
  const onHit = attack.context?.onHit;
  if (typeof onHit === 'function') {
    try {
      onHit(npc, ['body']);
    } catch (error) {
      console.warn('[hitdetect] player onHit handler error', error);
    }
  }
  triggerAttackHitSound(config, player, attack);

  const healthAfter = Number.isFinite(npc.health?.current) ? npc.health.current : healthBefore;
  if (!npc.isDead && Number.isFinite(healthAfter) && healthAfter <= 0) {
    markFighterDead(npc, { killerId: player.id, cause: 'combat' });
    triggerFullRagdoll(npc, config, { angle, force });
    reportNpcDefeated(npc);
  }
}

function handleNpcHitsPlayer(G, config, player, npc, debug, distance, bodyRadius) {
  if (!player || player.isDead) return;
  const attack = npc.attack || {};
  const phase = attack.currentPhase || 'Stance';
  const npcDebug = getNpcDebugState(debug, npc.id || 'npc');
  if (npcDebug.npcPhase !== phase) {
    npcDebug.npcPhase = phase;
    npcDebug.npcCollided = false;
  }
  if (!attack.active || !phase || !phase.toLowerCase().includes('strike')) return;

  const presetName = getPresetNameFromAttack(attack);
  const reach = getAttackReach(presetName) + bodyRadius;
  if (distance > reach || npcDebug.npcCollided) return;

  npcDebug.npcCollided = true;
  const force = calculateKnockback(config, presetName, player.footing ?? 50, 1);
  const angle = Math.atan2(player.pos.y - npc.pos.y, player.pos.x - npc.pos.x);
  const footingBefore = player.footing ?? (config.knockback?.maxFooting ?? 50);
  applyKnockback(player, angle, force, { verticalScale: 0.25, config });
  const footingLoss = computeFootingDamage(config, footingBefore, force, player);
  player.footing = Math.max(0, footingBefore - footingLoss);
  applyHitReactionRagdoll(player, config, { angle, force, footingBefore });
  if (!attack.strikeLanded) {
    attack.strikeLanded = true;
  }
  const counts = G.HIT_COUNTS?.player;
  if (counts) {
    counts.body = (counts.body || 0) + 1;
  }

  const healthBefore = Number.isFinite(player.health?.current) ? player.health.current : null;
  const onHit = attack.onHit;
  if (typeof onHit === 'function') {
    try {
      onHit(player, ['body']);
    } catch (error) {
      console.warn('[hitdetect] npc onHit handler error', error);
    }
  }
  triggerAttackHitSound(config, npc, attack);

  const healthAfter = Number.isFinite(player.health?.current) ? player.health.current : healthBefore;
  if (!player.isDead && Number.isFinite(healthAfter) && healthAfter <= 0) {
    markFighterDead(player, { killerId: npc.id, cause: 'combat' });
    triggerFullRagdoll(player, config, { angle, force });
    reportPlayerDeath();
  }
}

export function runHitDetect() {
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  const P = G.FIGHTERS?.player;
  const npcs = getActiveNpcFighters();
  if (!P || !npcs.length) return;

  const debug = ensureDebugState();
  const bodyRadius = getBodyRadius(C);
  for (const npc of npcs) {
    const dx = (P.pos?.x ?? 0) - (npc.pos?.x ?? 0);
    const dy = (P.pos?.y ?? 0) - (npc.pos?.y ?? 0);
    const distance = Math.hypot(dx, dy);
    handlePlayerHitsNpc(G, C, P, npc, debug, distance, bodyRadius);
    if (!npc.isDead) {
      handleNpcHitsPlayer(G, C, P, npc, debug, distance, bodyRadius);
    }
  }
}
