// fighter-roster.js — centralized fighter roster + hit count utilities

function ensureGameState() {
  return (window.GAME ||= {});
}

function ensureHitStore(G) {
  const store = (G.HIT_COUNTS ||= {});
  store.fighters ||= {};
  return store;
}

export function ensureFighterRoster(G = ensureGameState()) {
  const roster = (G.fighterRoster ||= {});
  roster.instances ||= {};
  roster.order ||= [];
  roster.groups ||= { player: null, npcs: [] };
  roster.metadata ||= {};
  G.FIGHTERS ||= {};
  ensureHitStore(G);
  return roster;
}

export function resetFighterRoster(G = ensureGameState()) {
  const roster = ensureFighterRoster(G);
  roster.instances = {};
  roster.metadata = {};
  roster.order = [];
  roster.groups = { player: null, npcs: [] };
  G.FIGHTERS = {};
  return roster;
}

function applyAlias(target, alias, canonicalId) {
  if (!alias || alias === canonicalId) return;
  try {
    Object.defineProperty(target, alias, {
      configurable: true,
      enumerable: false,
      get() {
        return target[canonicalId] || null;
      },
      set(value) {
        target[canonicalId] = value;
      },
    });
  } catch (_error) {
    target[alias] = target[canonicalId];
  }
}

export function ensureHitCountsForFighter(fighterId, { includeBody = true } = {}, G = ensureGameState()) {
  if (!fighterId) return null;
  const store = ensureHitStore(G);
  const counts = (store.fighters[fighterId] ||= { handL: 0, handR: 0, footL: 0, footR: 0 });
  if (includeBody && counts.body == null) {
    counts.body = 0;
  }
  return counts;
}

export function getHitCountsForFighter(fighterId, G = ensureGameState()) {
  if (!fighterId) return null;
  const store = ensureHitStore(G);
  return store.fighters?.[fighterId] || null;
}

export function registerFighterInstance(instance, options = {}, G = ensureGameState()) {
  if (!instance || !instance.id) {
    throw new Error('[fighter-roster] Cannot register fighter without an id');
  }
  const roster = ensureFighterRoster(G);
  const { id } = instance;
  roster.instances[id] = instance;
  if (!roster.order.includes(id)) {
    roster.order.push(id);
  }
  roster.metadata[id] = { ...(roster.metadata[id] || {}), ...(options.metadata || {}) };
  G.FIGHTERS[id] = instance;

  const counts = ensureHitCountsForFighter(id, { includeBody: true }, G);

  if (options.group === 'player') {
    roster.groups.player = id;
    G.HIT_COUNTS.player = counts;
    applyAlias(G.FIGHTERS, 'player', id);
  } else if (options.group === 'npc') {
    const npcs = roster.groups.npcs;
    if (!npcs.includes(id)) {
      npcs.push(id);
    }
    if (npcs.length === 1) {
      G.HIT_COUNTS.npc = counts;
      applyAlias(G.FIGHTERS, 'npc', id);
    }
  }

  if (options.alias) {
    applyAlias(G.FIGHTERS, options.alias, id);
  }

  return instance;
}

export function getFighterById(fighterId, G = ensureGameState()) {
  if (!fighterId) return null;
  const roster = ensureFighterRoster(G);
  return roster.instances?.[fighterId] || null;
}

export function getPlayerFighter(G = ensureGameState()) {
  const roster = ensureFighterRoster(G);
  const id = roster.groups.player;
  return id ? roster.instances?.[id] || null : null;
}

export function listFighterIds(G = ensureGameState()) {
  const roster = ensureFighterRoster(G);
  return roster.order.slice();
}

export function listNpcIds(G = ensureGameState()) {
  const roster = ensureFighterRoster(G);
  return roster.groups.npcs.slice();
}

export function setFighterMetadata(fighterId, metadata = {}, G = ensureGameState()) {
  if (!fighterId) return;
  const roster = ensureFighterRoster(G);
  roster.metadata[fighterId] = { ...(roster.metadata[fighterId] || {}), ...metadata };
}

export function getFighterMetadata(fighterId, G = ensureGameState()) {
  if (!fighterId) return null;
  const roster = ensureFighterRoster(G);
  return roster.metadata?.[fighterId] || null;
}

export function forEachNpc(G = ensureGameState(), callback = () => {}) {
  const roster = ensureFighterRoster(G);
  roster.groups.npcs.forEach((id) => {
    const fighter = roster.instances[id];
    if (fighter) {
      callback(fighter, id, roster.metadata[id] || {});
    }
  });
}

export function clearFighterRosterAliases(G = ensureGameState()) {
  if (!G.FIGHTERS) return;
  for (const key of Object.keys(G.FIGHTERS)) {
    const descriptor = Object.getOwnPropertyDescriptor(G.FIGHTERS, key);
    if (descriptor && !descriptor.enumerable && descriptor.get) {
      delete G.FIGHTERS[key];
    }
  }
}
