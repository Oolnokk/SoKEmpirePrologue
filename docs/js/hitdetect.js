// hitdetect.js — basic hit detection between player and NPC bodies

function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

function ensureDebugState() {
  const G = (window.GAME ||= {});
  const state = (G.HITDEBUG ||= {
    lastPhase: null,
    collidedThisPhase: false,
    npcLastPhase: null,
    npcCollidedThisPhase: false,
    lastColliders: [],
  });
  state.lastColliders ||= [];
  return state;
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

function enterRagdoll(target, knockbackAngle, force, verticalScale = 0.2) {
  if (target.ragdoll) return;
  target.ragdoll = true;
  target.ragdollTime = 0;
  target.ragdollVel = target.ragdollVel || { x: 0, y: 0 };
  target.vel = target.vel || { x: 0, y: 0 };
  target.vel.x += Math.cos(knockbackAngle) * force * 1.2;
  target.vel.y = Math.abs(Math.sin(knockbackAngle) * force * verticalScale);
  target.ragdollVel.x = target.vel.x;
  target.ragdollVel.y = target.vel.y;
}

function applyKnockback(target, angle, force, { verticalScale = 0.2 } = {}) {
  target.vel = target.vel || { x: 0, y: 0 };
  target.vel.x += Math.cos(angle) * force;
  target.vel.y += Math.sin(angle) * force * verticalScale;
}

function handlePlayerHitsNpc(G, config, player, npc, debug, distance, bodyRadius) {
  const attack = player.attack || {};
  const phase = attack.currentPhase || 'Stance';
  if (debug.lastPhase !== phase) {
    debug.lastPhase = phase;
    debug.collidedThisPhase = false;
  }
  if (!attack.active || !phase.toLowerCase().includes('strike')) {
    return;
  }

  const presetName = getPresetNameFromAttack(attack);
  const reach = getAttackReach(presetName) + bodyRadius;
  if (distance > reach || debug.collidedThisPhase) return;

  debug.collidedThisPhase = true;
  debug.lastColliders = ['npc-body'];
  const multiplier = attack.context?.multipliers?.knockback || 1;
  const force = calculateKnockback(config, presetName, npc.footing ?? 100, multiplier);
  const angle = Math.atan2(npc.pos.y - player.pos.y, npc.pos.x - player.pos.x);
  applyKnockback(npc, angle, force, { verticalScale: 0.2 });
  npc.footing = Math.max(0, (npc.footing ?? 100) - 2.5);
  if (npc.footing <= 0) {
    enterRagdoll(npc, angle, force, 0.3);
  }
  npc.stamina && (npc.stamina.isDashing = false);
  if (!attack.strikeLanded) {
    attack.strikeLanded = true;
  }
  const counts = G.HIT_COUNTS?.npc;
  if (counts) {
    counts.body = (counts.body || 0) + 1;
  }
  const onHit = attack.context?.onHit;
  if (typeof onHit === 'function') {
    try {
      onHit(npc, ['body']);
    } catch (error) {
      console.warn('[hitdetect] player onHit handler error', error);
    }
  }
}

function handleNpcHitsPlayer(G, config, player, npc, debug, distance, bodyRadius) {
  const attack = npc.attack || {};
  const phase = attack.currentPhase || 'Stance';
  if (debug.npcLastPhase !== phase) {
    debug.npcLastPhase = phase;
    debug.npcCollidedThisPhase = false;
  }
  if (!attack.active || !phase || !phase.toLowerCase().includes('strike')) return;

  const presetName = getPresetNameFromAttack(attack);
  const reach = getAttackReach(presetName) + bodyRadius;
  if (distance > reach || debug.npcCollidedThisPhase) return;

  debug.npcCollidedThisPhase = true;
  const force = calculateKnockback(config, presetName, player.footing ?? 50, 1);
  const angle = Math.atan2(player.pos.y - npc.pos.y, player.pos.x - npc.pos.x);
  applyKnockback(player, angle, force, { verticalScale: 0.25 });
  player.footing = Math.max(0, (player.footing ?? 50) - 2.5);
  if (player.footing <= 0) {
    enterRagdoll(player, angle, force, 0.35);
  }
  player.stamina && (player.stamina.isDashing = false);
  if (!attack.strikeLanded) {
    attack.strikeLanded = true;
  }
  const counts = G.HIT_COUNTS?.player;
  if (counts) {
    counts.body = (counts.body || 0) + 1;
  }
  const onHit = attack.onHit;
  if (typeof onHit === 'function') {
    try {
      onHit(player, ['body']);
    } catch (error) {
      console.warn('[hitdetect] npc onHit handler error', error);
    }
  }
}

export function runHitDetect() {
  const G = window.GAME || {};
  const C = window.CONFIG || {};
  const P = G.FIGHTERS?.player;
  const N = G.FIGHTERS?.npc;
  if (!P || !N) return;

  const debug = ensureDebugState();
  const bodyRadius = getBodyRadius(C);
  const dx = (P.pos?.x ?? 0) - (N.pos?.x ?? 0);
  const dy = (P.pos?.y ?? 0) - (N.pos?.y ?? 0);
  const distance = Math.hypot(dx, dy);

  handlePlayerHitsNpc(G, C, P, N, debug, distance, bodyRadius);
  handleNpcHitsPlayer(G, C, P, N, debug, distance, bodyRadius);
}
