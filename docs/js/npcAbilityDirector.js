function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

const SLOT_KEYS = ['A', 'B', 'C'];
const WEIGHTS = ['light', 'heavy'];

const QUICK_TRIGGER_HITS = 4;
const QUICK_PRESS_DURATION = 0.18;
const HEAVY_RETREAT_TIME = 0.65;
const HEAVY_MIN_COOLDOWN = 4;
const HEAVY_MIN_CHARGE_TIME = 0.5;
const HEAVY_MAX_CHARGE_TIME = 1.4;
const HEAVY_RETREAT_DISTANCE = 105;
const HEAVY_APPROACH_RANGE = 70;
const HEAVY_RECOVER_TIME = 0.6;
const DEFENSIVE_TRIGGER_THRESHOLD = 1.6;
const DEFENSIVE_RELEASE_THRESHOLD = 0.8;
const DEFENSIVE_METER_DECAY = 1.2;
const DEFENSIVE_METER_GAIN = 2.8;
const DEFENSIVE_MIN_COOLDOWN = 3;
const DEFENSIVE_HOLD_DURATION = 9999;

function signatureForComboState(combo) {
  if (!combo) return null;
  const hits = Number.isFinite(combo.hits) ? combo.hits : 0;
  const index = Number.isFinite(combo.sequenceIndex) ? combo.sequenceIndex : 0;
  const id = combo.lastAbilityId || 'none';
  const active = combo.active ? '1' : '0';
  return `${hits}|${index}|${id}|${active}`;
}

function buildAbilityDescriptor(slotKey, weight, ability) {
  if (!ability) return null;
  return {
    slotKey,
    weight,
    id: ability.id || null,
    type: ability.type || null,
    trigger: ability.trigger || null,
  };
}

function ensureDirectorState(state) {
  const director = (state.aiAbilityDirector ||= {
    slots: { quick: [], holdRelease: [], defensive: [] },
    quick: {
      lastSignature: null,
    },
    heavy: {
      state: 'idle',
      cooldown: 0,
      timer: 0,
      retreatTimer: 0,
      chargeTimer: 0,
      recoverTimer: 0,
      slotKey: null,
      retreatDir: 0,
      didPress: false,
    },
    defensive: {
      meter: 0,
      cooldown: 0,
      active: false,
      slotKey: null,
    },
    assignmentHash: null,
  });
  return director;
}

function syncAbilityAssignments(director, combat) {
  if (!combat || typeof combat.getAbilityForSlot !== 'function') {
    director.slots.quick = [];
    director.slots.holdRelease = [];
    director.slots.defensive = [];
    director.assignmentHash = null;
    return;
  }
  const descriptors = [];
  SLOT_KEYS.forEach((slotKey) => {
    WEIGHTS.forEach((weight) => {
      const ability = combat.getAbilityForSlot(slotKey, weight);
      const descriptor = buildAbilityDescriptor(slotKey, weight, ability);
      descriptors.push(descriptor);
    });
  });
  const hash = descriptors
    .map((desc) => (desc ? `${desc.slotKey}:${desc.weight}:${desc.id || 'none'}` : `${desc?.slotKey || 'null'}:${desc?.weight || 'null'}:null`))
    .join('|');
  if (hash === director.assignmentHash) return;
  director.assignmentHash = hash;
  director.slots.quick = descriptors.filter((desc) => desc && desc.type === 'quick');
  director.slots.holdRelease = descriptors.filter((desc) => desc && desc.trigger === 'hold-release');
  director.slots.defensive = descriptors.filter((desc) => desc && desc.trigger === 'defensive');
}

function chooseQuickSlot(director) {
  if (!Array.isArray(director.slots.quick) || director.slots.quick.length === 0) return null;
  const light = director.slots.quick.find((slot) => slot.weight === 'light');
  return light || director.slots.quick[0];
}

function updateQuickBehavior(director, context) {
  const { combat, pressButton, comboState, isBusy } = context;
  director.quick.lastSignature ||= null;
  if (!combat || !pressButton || isBusy) return;
  const target = chooseQuickSlot(director);
  if (!target) return;
  if (!comboState) {
    director.quick.lastSignature = null;
    return;
  }
  if (!comboState.active || !Number.isFinite(comboState.hits) || comboState.hits < QUICK_TRIGGER_HITS) {
    if (!comboState.active || comboState.hits < QUICK_TRIGGER_HITS) {
      director.quick.lastSignature = null;
    }
    return;
  }
  const signature = signatureForComboState(comboState);
  if (!signature || signature === director.quick.lastSignature) return;
  const pressed = pressButton(target.slotKey, QUICK_PRESS_DURATION);
  if (pressed) {
    director.quick.lastSignature = signature;
  }
}

function startHeavyRetreat(director, context, targetSlot) {
  const heavy = director.heavy;
  heavy.state = 'retreat';
  heavy.timer = 0;
  heavy.retreatTimer = 0;
  heavy.chargeTimer = 0;
  heavy.recoverTimer = 0;
  heavy.slotKey = targetSlot?.slotKey || 'A';
  heavy.retreatDir = context.dx >= 0 ? -1 : 1;
  heavy.didPress = false;
}

function updateHeavyBehavior(director, context) {
  const heavy = director.heavy;
  heavy.cooldown = Math.max(0, heavy.cooldown - context.dt);
  const targetSlot = director.slots.holdRelease[0] || null;
  if (!targetSlot) {
    heavy.state = 'idle';
    heavy.slotKey = null;
    return { mode: null };
  }
  const { isBusy, attackActive, aggressionActive, absDx, dt, pressButton, releaseButton } = context;
  const intent = { mode: null };
  const allowStart = !isBusy && !attackActive && aggressionActive && heavy.cooldown <= 0;
  if (heavy.state === 'idle' && allowStart && absDx <= HEAVY_RETREAT_DISTANCE) {
    startHeavyRetreat(director, context, targetSlot);
  }
  switch (heavy.state) {
    case 'retreat': {
      heavy.retreatTimer += dt;
      intent.mode = 'retreat';
      intent.retreatDir = heavy.retreatDir;
      intent.dash = true;
      intent.slotKey = heavy.slotKey;
      if (absDx >= HEAVY_RETREAT_DISTANCE || heavy.retreatTimer >= HEAVY_RETREAT_TIME) {
        heavy.state = 'charge';
      }
      break;
    }
    case 'charge': {
      intent.mode = 'hold';
      intent.slotKey = heavy.slotKey;
      if (!heavy.didPress && pressButton) {
        heavy.didPress = pressButton(heavy.slotKey, HEAVY_MAX_CHARGE_TIME + 0.25);
        heavy.chargeTimer = 0;
        if (!heavy.didPress) {
          heavy.state = 'idle';
          heavy.cooldown = 1.25;
          heavy.slotKey = null;
          break;
        }
      }
      heavy.chargeTimer += dt;
      if (heavy.didPress && heavy.chargeTimer >= HEAVY_MIN_CHARGE_TIME) {
        heavy.state = 'approach';
      }
      break;
    }
    case 'approach': {
      intent.mode = 'approach';
      intent.slotKey = heavy.slotKey;
      intent.targetRange = HEAVY_APPROACH_RANGE;
      intent.retreatDir = heavy.retreatDir;
      heavy.chargeTimer += dt;
      if (absDx <= HEAVY_APPROACH_RANGE || heavy.chargeTimer >= HEAVY_MAX_CHARGE_TIME) {
        if (releaseButton) releaseButton(heavy.slotKey);
        heavy.state = 'recover';
        heavy.recoverTimer = HEAVY_RECOVER_TIME;
      }
      break;
    }
    case 'recover': {
      intent.mode = 'recover';
      intent.slotKey = heavy.slotKey;
      intent.retreatDir = heavy.retreatDir;
      heavy.recoverTimer -= dt;
      if (heavy.recoverTimer <= 0) {
        heavy.state = 'idle';
        heavy.cooldown = HEAVY_MIN_COOLDOWN;
        heavy.slotKey = null;
        heavy.didPress = false;
      }
      break;
    }
    default: {
      heavy.state = 'idle';
      heavy.slotKey = null;
      heavy.didPress = false;
      break;
    }
  }
  return intent;
}

function updateDefensiveMeter(director, context) {
  const defensive = director.defensive;
  defensive.cooldown = Math.max(0, defensive.cooldown - context.dt);
  const { player, absDx, dt } = context;
  const playerAggressive = !!player?.attack?.active;
  const closeEnough = absDx <= 90;
  if (playerAggressive && closeEnough) {
    defensive.meter += DEFENSIVE_METER_GAIN * dt;
  } else {
    defensive.meter -= DEFENSIVE_METER_DECAY * dt;
  }
  defensive.meter = clamp(defensive.meter, 0, 5);
}

function updateDefensiveBehavior(director, context) {
  updateDefensiveMeter(director, context);
  const defensive = director.defensive;
  const intent = { active: false, slotKey: defensive.slotKey };
  const targetSlot = director.slots.defensive[0] || null;
  const { pressButton, releaseButton, stamina } = context;
  const staminaCurrent = Number.isFinite(stamina?.current) ? stamina.current : 0;
  const staminaMin = Number.isFinite(stamina?.minToDash) ? stamina.minToDash : 0;
  const staminaOk = staminaCurrent >= staminaMin;
  if (defensive.active) {
    intent.active = true;
    if (!staminaOk || defensive.meter < DEFENSIVE_RELEASE_THRESHOLD) {
      if (releaseButton && defensive.slotKey) {
        releaseButton(defensive.slotKey);
      }
      defensive.active = false;
      defensive.slotKey = null;
      defensive.cooldown = DEFENSIVE_MIN_COOLDOWN;
    }
    return intent;
  }
  defensive.slotKey = defensive.slotKey || (targetSlot ? targetSlot.slotKey : null);
  const canActivate = targetSlot && defensive.cooldown <= 0 && staminaOk && defensive.meter >= DEFENSIVE_TRIGGER_THRESHOLD;
  if (canActivate && pressButton) {
    const pressed = pressButton(targetSlot.slotKey, DEFENSIVE_HOLD_DURATION);
    if (pressed) {
      defensive.active = true;
      defensive.slotKey = targetSlot.slotKey;
      intent.active = true;
    }
  }
  return intent;
}

export function ensureNpcAbilityDirector(state, combat) {
  const director = ensureDirectorState(state);
  syncAbilityAssignments(director, combat);
  return director;
}

export function updateNpcAbilityDirector({
  state,
  combat,
  dt,
  player,
  pressButton,
  releaseButton,
  absDx = 0,
  dx = 0,
  aggressionActive = false,
  attackActive = false,
  isBusy = false,
}) {
  if (!state) return null;
  const director = ensureDirectorState(state);
  syncAbilityAssignments(director, combat);
  const stamina = state.stamina || {};
  const comboState = combat && typeof combat.getComboState === 'function'
    ? combat.getComboState()
    : null;
  updateQuickBehavior(director, {
    combat,
    pressButton,
    comboState,
    isBusy,
  });
  const heavyIntent = updateHeavyBehavior(director, {
    dt,
    dx,
    absDx,
    combat,
    pressButton,
    releaseButton,
    aggressionActive,
    attackActive,
    isBusy,
  });
  const defensiveIntent = updateDefensiveBehavior(director, {
    dt,
    player,
    absDx,
    pressButton,
    releaseButton,
    stamina,
  });

  const suppressBasicAttacks = Boolean(
    defensiveIntent.active
    || (heavyIntent && heavyIntent.mode && heavyIntent.mode !== null)
  );

  const intent = {
    suppressBasicAttacks,
    heavy: heavyIntent,
    defensiveActive: defensiveIntent.active,
  };
  state.aiAbilityIntent = intent;
  return intent;
}
