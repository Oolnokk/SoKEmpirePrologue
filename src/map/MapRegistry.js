/**
 * MapRegistry maintains a registry of map areas without leaking implementation
 * details to the rest of the runtime. The class is intentionally lightweight so
 * the map system can fail in isolation without cascading errors into other
 * toolchains.
 */

import { normalizeScene3dConfig } from './scene3d.js';

const clone = (value) => {
  if (typeof globalThis.structuredClone === 'function') {
    return globalThis.structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
};

export class MapRegistryError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'MapRegistryError';
    if (details) {
      this.details = details;
    }
  }
}

export class MapRegistry {
  constructor({ logger = console } = {}) {
    this._logger = logger;
    this._areas = new Map();
    this._activeAreaId = null;
    this._listeners = new Map();
  }

  /**
   * Subscribe to registry events. Returns an unsubscribe function.
   */
  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new MapRegistryError('Event handler must be a function');
    }
    const listeners = this._listeners.get(event) || new Set();
    listeners.add(handler);
    this._listeners.set(event, listeners);
    return () => listeners.delete(handler);
  }

  _emit(event, payload) {
    const listeners = this._listeners.get(event);
    if (!listeners) return;
    for (const handler of listeners) {
      try {
        handler(payload);
      } catch (error) {
        this._logger.warn?.('[MapRegistry] listener error', error);
      }
    }
  }

  /**
   * Register a single area descriptor.
   */
  registerArea(areaId, descriptor) {
    const { area, warnings } = this._prepareArea(areaId, descriptor);
    warnings.forEach((w) => this._logger.warn?.(`[MapRegistry] ${w}`));

    this._areas.set(areaId, area);
    this._emit('area-registered', area);
    if (!this._activeAreaId) {
      this._activeAreaId = areaId;
      this._emit('active-area-changed', area);
    }
    return area;
  }

  /**
   * Register multiple areas from an object map (compatible with CONFIG.areas).
   */
  registerAreas(areaMap) {
    if (!areaMap || typeof areaMap !== 'object') {
      throw new MapRegistryError('Area map must be an object');
    }
    const staged = [];
    for (const [areaId, descriptor] of Object.entries(areaMap)) {
      const record = this._prepareArea(areaId, descriptor);
      staged.push({ ...record, areaId });
    }
    const results = {};
    for (const { areaId, area, warnings } of staged) {
      warnings.forEach((w) => this._logger.warn?.(`[MapRegistry] ${w}`));
      this._areas.set(areaId, area);
      this._emit('area-registered', area);
      results[areaId] = area;
      if (!this._activeAreaId) {
        this._activeAreaId = areaId;
        this._emit('active-area-changed', area);
      }
    }
    return results;
  }

  _prepareArea(areaId, descriptor) {
    if (!areaId || typeof areaId !== 'string') {
      throw new MapRegistryError('Area id must be a non-empty string');
    }
    if (!descriptor || typeof descriptor !== 'object') {
      throw new MapRegistryError('Area descriptor must be an object');
    }

    const normalizedDescriptor = normalizeAreaDescriptor(descriptor);
    const { warnings, errors } = validateAreaDescriptor(normalizedDescriptor);
    if (errors.length) {
      throw new MapRegistryError(`Invalid area descriptor for "${areaId}"`, {
        errors,
      });
    }

    const area = deepFreeze(clone({ ...normalizedDescriptor, id: areaId }));
    return { area, warnings };
  }

  /**
   * Remove a single area by id.
   */
  removeArea(areaId) {
    if (!this._areas.has(areaId)) return false;
    this._areas.delete(areaId);
    this._emit('area-removed', areaId);
    if (this._activeAreaId === areaId) {
      this._activeAreaId = this._areas.size ? this._areas.keys().next().value : null;
      this._emit('active-area-changed', this.getActiveArea());
    }
    return true;
  }

  hasArea(areaId) {
    return this._areas.has(areaId);
  }

  getArea(areaId) {
    return this._areas.get(areaId) || null;
  }

  getInstance(areaId, instanceId) {
    if (!areaId || !instanceId) return null;
    const area = this.getArea(areaId);
    if (!area || typeof area !== 'object') return null;
    const lookup = area.instancesById || null;
    if (!lookup || typeof lookup !== 'object') return null;
    return lookup[instanceId] ?? null;
  }

  getActiveInstance(instanceId) {
    if (!instanceId) return null;
    const activeAreaId = this.getActiveAreaId();
    if (!activeAreaId) return null;
    return this.getInstance(activeAreaId, instanceId);
  }

  getActiveAreaId() {
    return this._activeAreaId;
  }

  getActiveArea() {
    return this._activeAreaId ? this.getArea(this._activeAreaId) : null;
  }

  setActiveArea(areaId) {
    if (areaId == null) {
      this._activeAreaId = null;
      this._emit('active-area-changed', null);
      return true;
    }
    if (!this._areas.has(areaId)) {
      return false;
    }
    if (this._activeAreaId === areaId) {
      return true;
    }
    this._activeAreaId = areaId;
    this._emit('active-area-changed', this.getActiveArea());
    return true;
  }

  toJSON() {
    const result = {};
    for (const [id, descriptor] of this._areas.entries()) {
      result[id] = clone(descriptor);
    }
    return result;
  }
}

function validateAreaDescriptor(descriptor) {
  const warnings = [];
  const errors = [];

  if (descriptor.scene3d !== undefined) {
    validateScene3d(descriptor.scene3d, warnings, errors);
  }

  if (!Array.isArray(descriptor.layers)) {
    errors.push('"layers" must be an array');
  }
  if (descriptor.layers && descriptor.layers.length === 0) {
    warnings.push('Area declares no parallax layers');
  }
  if (!Array.isArray(descriptor.instances) && !Array.isArray(descriptor.props)) {
    warnings.push('Area declares neither "instances" nor "props" – runtime may need one');
  }
  if (descriptor.tilers && !Array.isArray(descriptor.tilers)) {
    warnings.push('"tilers" should be an array when provided');
  }
  if (descriptor.drumSkins && !Array.isArray(descriptor.drumSkins)) {
    warnings.push('"drumSkins" should be an array when provided');
  }

  let seenInstanceIds = null;
  if (Array.isArray(descriptor.instances)) {
    seenInstanceIds = new Set();
    descriptor.instances.forEach((inst, index) => {
      if (!inst || typeof inst !== 'object') {
        warnings.push(`Instance at index ${index} is not an object`);
        return;
      }
      const rawId = typeof inst.instanceId === 'string' ? inst.instanceId.trim() : '';
      if (!rawId) {
        errors.push(`Instance at index ${index} missing "instanceId"`);
        return;
      }
      if (seenInstanceIds.has(rawId)) {
        errors.push(`Duplicate instanceId "${rawId}"`);
      } else {
        seenInstanceIds.add(rawId);
      }
    });
  }

  if (descriptor.instancesById && typeof descriptor.instancesById === 'object') {
    const indexKeys = new Set(Object.keys(descriptor.instancesById));
    if (seenInstanceIds) {
      for (const id of seenInstanceIds) {
        if (!indexKeys.has(id)) {
          errors.push(`instancesById missing mapping for "${id}"`);
        }
      }
      for (const key of indexKeys) {
        if (!seenInstanceIds.has(key)) {
          warnings.push(`instancesById entry "${key}" has no matching instance`);
        }
      }
    } else {
      warnings.push('instancesById provided without instances array');
    }
  }

  let seenSpawnerIds = null;
  if (descriptor.spawners) {
    if (!Array.isArray(descriptor.spawners)) {
      warnings.push('"spawners" should be an array when provided');
    } else {
      seenSpawnerIds = new Set();
      descriptor.spawners.forEach((spawner, index) => {
        if (!spawner || typeof spawner !== 'object') {
          warnings.push(`Spawner at index ${index} is not an object`);
          return;
        }
        const rawId = typeof spawner.spawnerId === 'string' && spawner.spawnerId.trim()
          ? spawner.spawnerId.trim()
          : typeof spawner.id === 'string' && spawner.id.trim()
            ? spawner.id.trim()
            : '';
        if (!rawId) {
          warnings.push(`Spawner at index ${index} missing "spawnerId"`);
          return;
        }
        if (seenSpawnerIds.has(rawId)) {
          errors.push(`Duplicate spawnerId "${rawId}"`);
        } else {
          seenSpawnerIds.add(rawId);
        }
      });
    }
  }

  if (descriptor.spawnersById && typeof descriptor.spawnersById === 'object') {
    const indexKeys = new Set(Object.keys(descriptor.spawnersById));
    if (seenSpawnerIds) {
      for (const id of seenSpawnerIds) {
        if (!indexKeys.has(id)) {
          errors.push(`spawnersById missing mapping for "${id}"`);
        }
      }
      for (const key of indexKeys) {
        if (!seenSpawnerIds.has(key)) {
          warnings.push(`spawnersById entry "${key}" has no matching spawner`);
        }
      }
    } else if (!descriptor.spawners) {
      warnings.push('spawnersById provided without spawners array');
    }
  }

  return { warnings, errors };
}

function normalizeAreaDescriptor(descriptor) {
  const cloned = clone(descriptor);
  if (cloned.scene3d !== undefined) {
    cloned.scene3d = normalizeScene3dConfig(cloned.scene3d);
  }
  return cloned;
}

function validateScene3d(scene3d, warnings, errors) {
  if (!scene3d || typeof scene3d !== 'object') {
    errors.push('"scene3d" must be an object when provided');
    return;
  }

  if (!scene3d.sceneUrl) {
    warnings.push('scene3d provided without "sceneUrl"; 3D renderer will skip asset loading');
  } else if (typeof scene3d.sceneUrl !== 'string') {
    errors.push('scene3d.sceneUrl must be a string when provided');
  } else {
    const lowerUrl = scene3d.sceneUrl.toLowerCase();
    const usesGlTf = lowerUrl.endsWith('.glb') || lowerUrl.endsWith('.gltf');
    if (!usesGlTf) {
      warnings.push('scene3d.sceneUrl should typically point to a glTF binary (.glb); double-check for typos like .gib');
    }
  }

  if (scene3d.ground) {
    if (typeof scene3d.ground.planeZ !== 'number' || Number.isNaN(scene3d.ground.planeZ)) {
      errors.push('scene3d.ground.planeZ must be a number');
    }
    if (typeof scene3d.ground.unitsPerPixel !== 'number' || Number.isNaN(scene3d.ground.unitsPerPixel)) {
      errors.push('scene3d.ground.unitsPerPixel must be a number');
    }
  }

  if (scene3d.render) {
    const allowed = ['none', 'flat'];
    if (!allowed.includes(scene3d.render.lighting)) {
      warnings.push(`scene3d.render.lighting should be one of ${allowed.join(', ')}; falling back to "none"`);
    }
    if (scene3d.render.materials && scene3d.render.materials !== 'unlit') {
      warnings.push('scene3d.render.materials enforces "unlit" only to keep surfaces simple');
    }
  }
}

function deepFreeze(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  Object.freeze(obj);
  for (const value of Object.values(obj)) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      deepFreeze(value);
    }
  }
  return obj;
}

export default MapRegistry;
