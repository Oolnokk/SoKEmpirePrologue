export class GeometryServiceError extends Error {
  constructor(message, details = undefined) {
    super(message);
    this.name = 'GeometryServiceError';
    if (details) {
      this.details = details;
    }
  }
}

function toNumber(value, fallback = NaN) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function computeColliderBounds(colliders) {
  if (!Array.isArray(colliders) || colliders.length === 0) {
    return null;
  }
  let minLeft = Infinity;
  let maxRight = -Infinity;
  for (const col of colliders) {
    if (!col || typeof col !== 'object') continue;
    const left = toNumber(col.left, NaN);
    const width = toNumber(col.width, NaN);
    if (!Number.isFinite(left) || !Number.isFinite(width)) continue;
    const right = left + width;
    minLeft = Math.min(minLeft, Math.min(left, right));
    maxRight = Math.max(maxRight, Math.max(left, right));
  }
  if (!Number.isFinite(minLeft) || !Number.isFinite(maxRight) || maxRight <= minLeft) {
    return null;
  }
  return { left: minLeft, right: maxRight };
}

function normalizeExplicitPlayableBounds(rawBounds) {
  const safe = rawBounds && typeof rawBounds === 'object' ? rawBounds : null;
  const left = toNumber(safe?.left ?? safe?.min, NaN);
  const right = toNumber(safe?.right ?? safe?.max, NaN);
  if (!Number.isFinite(left) || !Number.isFinite(right) || right <= left) {
    return null;
  }
  const source = typeof safe?.source === 'string' ? safe.source : 'explicit';
  return { left, right, source };
}

function validateGeometry(playableBounds, colliders, { allowDerivedPlayableBounds = false } = {}) {
  const errors = [];
  if (!playableBounds) {
    errors.push('Missing playableBounds – geometry service requires explicit left/right bounds');
  } else if (playableBounds.source === 'legacy:derived' && !allowDerivedPlayableBounds) {
    errors.push('Playable bounds were derived from colliders; provide explicit bounds to continue');
  }

  if (!Array.isArray(colliders) || colliders.length === 0) {
    errors.push('No colliders provided – geometry service requires at least one collider');
  }

  if (errors.length) {
    throw new GeometryServiceError('Invalid geometry payload', { errors });
  }
}

export class GeometryService {
  constructor({ logger = console } = {}) {
    this._logger = logger;
    this._geometries = new Map();
    this._activeAreaId = null;
  }

  registerGeometry(areaId, geometry, { allowDerivedPlayableBounds = false } = {}) {
    if (!areaId || typeof areaId !== 'string') {
      throw new GeometryServiceError('Area id must be a non-empty string');
    }
    if (!geometry || typeof geometry !== 'object') {
      throw new GeometryServiceError('Geometry payload must be an object');
    }
    const playableBounds = normalizeExplicitPlayableBounds(geometry.playableBounds);
    const colliders = Array.isArray(geometry.colliders) ? geometry.colliders.filter(Boolean) : [];

    validateGeometry(playableBounds, colliders, { allowDerivedPlayableBounds });

    const normalized = {
      playableBounds,
      colliders,
      source: geometry.source || 'geometry-service',
    };

    this._geometries.set(areaId, normalized);
    if (!this._activeAreaId) {
      this._activeAreaId = areaId;
    }
    return normalized;
  }

  setActiveArea(areaId) {
    if (areaId == null) {
      this._activeAreaId = null;
      return true;
    }
    if (!this._geometries.has(areaId)) {
      return false;
    }
    this._activeAreaId = areaId;
    return true;
  }

  getGeometry(areaId) {
    return this._geometries.get(areaId) || null;
  }

  getActiveGeometry() {
    return this._activeAreaId ? this.getGeometry(this._activeAreaId) : null;
  }

  getActivePlayableBounds() {
    return this.getActiveGeometry()?.playableBounds ?? null;
  }

  getActiveColliders() {
    return this.getActiveGeometry()?.colliders ?? [];
  }
}

export function adaptSceneGeometry(sceneGeometry = {}) {
  const geometry = sceneGeometry?.geometry && typeof sceneGeometry.geometry === 'object'
    ? sceneGeometry.geometry
    : sceneGeometry;
  const playableBounds = geometry?.playableBounds ?? geometry?.bounds ?? null;
  const colliders = Array.isArray(geometry?.colliders) ? geometry.colliders : [];
  return { playableBounds, colliders, source: 'scene-geometry' };
}

export function adaptLegacyLayoutGeometry(layout = {}, warnings = []) {
  const colliders = Array.isArray(layout?.colliders) ? layout.colliders.filter(Boolean) : [];
  let playableBounds = normalizeExplicitPlayableBounds(layout?.playableBounds);
  if (!playableBounds) {
    const derived = computeColliderBounds(colliders);
    if (derived) {
      playableBounds = { ...derived, source: 'legacy:derived' };
      if (Array.isArray(warnings)) {
        warnings.push('playableBounds missing; derived from colliders for legacy compatibility');
      }
    } else if (Array.isArray(warnings)) {
      warnings.push('playableBounds missing and could not be derived from colliders');
    }
  }
  return { playableBounds, colliders, source: 'legacy-layout' };
}

export default GeometryService;
