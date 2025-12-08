const clone = (value) => {
  if (value == null) return value;
  if (typeof globalThis.structuredClone === 'function') {
    try { return globalThis.structuredClone(value); } catch { /* ignore */ }
  }
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const normalizeSpawnPoints = (spawnPoints = []) => (Array.isArray(spawnPoints) ? spawnPoints : []);
const normalizeGroupLibrary = (groupLibrary = {}) => (groupLibrary && typeof groupLibrary === 'object'
  ? groupLibrary
  : {});

const resolveSpawnerId = (spawner) => {
  const rawId = typeof spawner?.spawnerId === 'string' && spawner.spawnerId.trim()
    ? spawner.spawnerId.trim()
    : (typeof spawner?.id === 'string' && spawner.id.trim() ? spawner.id.trim() : null);
  return rawId || null;
};

const attachGroupToSpawner = (spawner, groupLibrary) => {
  if (!spawner || typeof spawner !== 'object') return null;
  const spawnerId = resolveSpawnerId(spawner);
  if (!spawnerId) return null;

  const normalizedGroupLibrary = normalizeGroupLibrary(groupLibrary);
  const inlineGroup = spawner.group && typeof spawner.group === 'object' ? clone(spawner.group) : null;
  const groupId = spawner.groupId || spawner.meta?.groupId || inlineGroup?.id || null;
  const libraryGroup = groupId && normalizedGroupLibrary[groupId]
    ? clone(normalizedGroupLibrary[groupId])
    : null;
  const resolvedGroup = inlineGroup || libraryGroup;

  return {
    ...clone(spawner),
    id: spawnerId,
    spawnerId,
    groupId: groupId || resolvedGroup?.id || null,
    groupMeta: resolvedGroup || null,
  };
};

export class SpawnService {
  constructor({ logger = console } = {}) {
    this._logger = logger;
    this._spawns = new Map();
    this._activeAreaId = null;
  }

  registerArea(areaId, spawnPoints = [], { groupLibrary = {} } = {}) {
    if (!areaId || typeof areaId !== 'string') {
      throw new Error('areaId must be a non-empty string');
    }
    const enriched = [];
    const index = {};
    for (const spawner of normalizeSpawnPoints(spawnPoints)) {
      const record = attachGroupToSpawner(spawner, groupLibrary);
      if (!record) continue;
      enriched.push(record);
      index[record.spawnerId] = record;
    }
    this._spawns.set(areaId, {
      spawners: enriched,
      spawnersById: index,
      groupLibrary: normalizeGroupLibrary(groupLibrary),
    });
    if (!this._activeAreaId) {
      this._activeAreaId = areaId;
    }
    return { spawners: enriched, spawnersById: index };
  }

  registerFromArea(areaDescriptor = null) {
    const areaId = typeof areaDescriptor?.id === 'string' ? areaDescriptor.id : null;
    if (!areaId) return { spawners: [], spawnersById: {} };
    const spawnPoints = normalizeSpawnPoints(areaDescriptor.spawners);
    const groupLibrary = normalizeGroupLibrary(areaDescriptor.groupLibrary || areaDescriptor.groups);
    return this.registerArea(areaId, spawnPoints, { groupLibrary });
  }

  setActiveArea(areaId) {
    if (areaId == null) {
      this._activeAreaId = null;
      return true;
    }
    if (!this._spawns.has(areaId)) {
      return false;
    }
    this._activeAreaId = areaId;
    return true;
  }

  getActiveAreaId() {
    return this._activeAreaId;
  }

  getSpawners(areaId = null, { type = null } = {}) {
    const resolvedId = areaId || this._activeAreaId;
    if (!resolvedId) return [];
    const record = this._spawns.get(resolvedId);
    if (!record) return [];
    if (!type) return record.spawners.map((spawner) => clone(spawner));
    const normalizedType = String(type).toLowerCase();
    return record.spawners
      .filter((spawner) => {
        const resolvedType = (spawner.type || spawner.kind || 'npc').toString().toLowerCase();
        return resolvedType === normalizedType;
      })
      .map((spawner) => clone(spawner));
  }

  getSpawner(areaId = null, spawnerId = null) {
    const resolvedId = areaId || this._activeAreaId;
    const resolvedSpawnerId = resolveSpawnerId({ spawnerId });
    if (!resolvedId || !resolvedSpawnerId) return null;
    const record = this._spawns.get(resolvedId);
    if (!record) return null;
    const spawner = record.spawnersById[resolvedSpawnerId] || null;
    return spawner ? clone(spawner) : null;
  }

  hasSpawners(areaId = null, { type = null } = {}) {
    const spawners = this.getSpawners(areaId, { type });
    return Array.isArray(spawners) && spawners.length > 0;
  }
}

export function translateAreaToSpawnPayload(areaDescriptor = null) {
  if (!areaDescriptor || typeof areaDescriptor !== 'object') {
    return { areaId: null, spawnPoints: [], groupLibrary: {} };
  }
  const areaId = typeof areaDescriptor.id === 'string' ? areaDescriptor.id : null;
  const spawnPoints = normalizeSpawnPoints(areaDescriptor.spawners);
  const groupLibrary = normalizeGroupLibrary(areaDescriptor.groupLibrary || areaDescriptor.groups);
  return { areaId, spawnPoints, groupLibrary };
}
