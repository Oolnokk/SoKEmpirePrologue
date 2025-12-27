/**
 * Visualsmap loader for runtime game
 * Loads grid-based visual maps and converts them to 3D scene objects
 */

import { applyAssetRotations } from './gltfTransforms.js';
import { DayNightSystem } from '../lighting/DayNightSystem.js';
import { isTowerStructure } from '../lighting/TowerLightingIntegration.js';
import { createCandleLight } from '../lighting/CandleLight.js';
import { transform2dTo3d, getTransformConfig } from '../js/coordinate-transform.js';

const DEFAULT_GAMEPLAY_PATH_LOOK_AT = Object.freeze({
  offsetY: 0.3, // Grid units; scaled by cellSize at runtime
  offsetZ: 0,
});

const VISUALSMAP_INDEX_CACHE = {
  loaded: false,
  assets: null,
  baseUrl: null,
};

const DEFAULT_VISUALSMAP_CONFIG = Object.freeze({
  textureBasePath: './assets/images/',
  interior: {
    maskColor: '#000000',
    maskPadding: 0.1,
    wallHeight: 8,
    cubeOpacity: 0.22,
    backwallDepth: 0.25,
    backwallGridColor: '#1f2937'
  }
});

/**
 * Detect if running in development mode (file protocol or localhost)
 * @returns {boolean} True if in development mode
 */
function isDevelopmentMode() {
  if (typeof window === 'undefined') return false;
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  return protocol === 'file:' || hostname === 'localhost' || hostname === '127.0.0.1';
}

/**
 * Clear the visualsmap index cache. Useful for development or when
 * index.json is updated and needs to be reloaded.
 * @public
 */
export function clearVisualsmapCache() {
  VISUALSMAP_INDEX_CACHE.loaded = false;
  VISUALSMAP_INDEX_CACHE.assets = null;
  VISUALSMAP_INDEX_CACHE.baseUrl = null;
  console.log('[visualsmapLoader] ✓ Cache cleared');
}

/**
 * Resolve visualsMap path relative to gameplaymap location
 * @param {string} visualsMapPath - Path from gameplaymap.json
 * @param {string} gameplayMapUrl - URL of the gameplaymap.json file
 * @returns {string} Resolved absolute URL
 */
function resolveVisualsMapPath(visualsMapPath, gameplayMapUrl) {
  if (!visualsMapPath) return null;

  // If already absolute URL
  if (/^https?:\/\//.test(visualsMapPath)) {
    return visualsMapPath;
  }

  // Resolve relative to gameplaymap location using URL API so "../" segments
  // are normalized (the editor exports visualsMap paths relative to the gameplay
  // map file, and the site is hosted under /main/docs/ in production).
  try {
    const base = gameplayMapUrl || (typeof window !== 'undefined' ? window.location.href : '');
    return new URL(visualsMapPath, base).href;
  } catch (err) {
    console.warn('[visualsmapLoader] Could not resolve visualsMapPath, returning original:', visualsMapPath, err);
    return visualsMapPath;
  }
}

/**
 * Resolve asset path (handles absolute and relative paths, GitHub Pages compatible)
 * Uses the same resolution logic as rendererAdapter.js for consistent behavior
 * @param {string} assetPath - Path from asset config
 * @param {string} [baseContext] - Optional base context to resolve relative paths against
 * @returns {string} Resolved path
 */
function resolveAssetPath(assetPath, baseContext = null) {
  if (!assetPath) return null;

  // Matches URL schemes like http:, https:, file:, data:, etc.
  const URL_SCHEME_REGEX = /^[a-z][a-z0-9+.-]*:/i;
  
  // If already a complete URL (http://, https://, etc.), return as-is
  if (URL_SCHEME_REGEX.test(assetPath)) {
    return assetPath;
  }

  // Use provided context or current page location as base
  const baseUrl = baseContext ||
    (typeof window !== 'undefined' && window.location.href) ||
    (typeof document !== 'undefined' && document.baseURI) || '';

  if (!baseUrl) {
    console.warn('[visualsmapLoader] Cannot resolve asset path: no baseURI available, returning original:', assetPath);
    return assetPath;
  }

  // For absolute paths starting with '/', treat them as relative to the current directory
  // This handles GitHub Pages deployment where files are in a subdirectory (e.g., /SoKEmpirePrologue/docs/)
  // Instead of treating '/assets/...' as root-relative, we treat it as relative to the current page's directory
  let resolvedPath;
  
  if (assetPath.startsWith('/')) {
    // Strip the leading '/' and resolve as a relative path
    const relativeUrl = assetPath.substring(1);
    resolvedPath = new URL(relativeUrl, baseUrl).href;
  } else {
    // For relative paths (including those without './' or '../'), use standard URL resolution
    resolvedPath = new URL(assetPath, baseUrl).href;
  }
  
  console.log(`[visualsmapLoader] Resolved asset path: "${assetPath}" → "${resolvedPath}"`);
  return resolvedPath;
}

/**
 * Derive the docs root (up to and including the `docs` segment) so that
 * absolute-looking asset paths like "/config/..." can be resolved inside the
 * deployed site structure rather than the domain root.
 *
 * Example:
 *   ref: https://host/SoKEmpirePrologue/docs/config/maps/foo.json
 *   returns: https://host/SoKEmpirePrologue/docs/
 *
 * @param {string} refUrl
 * @returns {string|null}
 */
function deriveDocsBase(refUrl) {
  if (!refUrl) return null;
  try {
    const url = new URL(refUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const docsIdx = segments.indexOf('docs');
    if (docsIdx === -1) return null;

    const docsPath = `/${segments.slice(0, docsIdx + 1).join('/')}/`;
    url.pathname = docsPath;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch (err) {
    console.warn('[visualsmapLoader] Failed to derive docs base from', refUrl, err);
    return null;
  }
}

/**
 * Derive the /config/ root from a reference URL so asset requests resolve to
 * the sibling config folder instead of the page location. Example:
 *   ref: https://host/SoKEmpirePrologue/docs/config/maps/visualsmaps/foo.json
 *   returns: https://host/SoKEmpirePrologue/docs/config/
 *
 * @param {string} refUrl
 * @returns {string|null}
 */
function deriveConfigBase(refUrl) {
  if (!refUrl) return null;
  try {
    const url = new URL(refUrl);
    const segments = url.pathname.split('/').filter(Boolean);
    const configIdx = segments.lastIndexOf('config');
    if (configIdx === -1) return null;

    const configPath = `/${segments.slice(0, configIdx + 1).join('/')}/`;
    url.pathname = configPath;
    url.search = '';
    url.hash = '';
    return url.href;
  } catch (err) {
    console.warn('[visualsmapLoader] Failed to derive config base from', refUrl, err);
    return null;
  }
}

function getVisualsmapConfig() {
  const userConfig = (typeof window !== 'undefined' && window.CONFIG?.visualsmap) || {};
  const interior = userConfig.interior || {};
  return {
    textureBasePath: userConfig.textureBasePath || DEFAULT_VISUALSMAP_CONFIG.textureBasePath,
    interior: {
      maskColor: interior.maskColor || DEFAULT_VISUALSMAP_CONFIG.interior.maskColor,
      maskPadding: Number.isFinite(interior.maskPadding)
        ? interior.maskPadding
        : DEFAULT_VISUALSMAP_CONFIG.interior.maskPadding,
      wallHeight: Number.isFinite(interior.wallHeight)
        ? interior.wallHeight
        : DEFAULT_VISUALSMAP_CONFIG.interior.wallHeight,
      cubeOpacity: Number.isFinite(interior.cubeOpacity)
        ? interior.cubeOpacity
        : DEFAULT_VISUALSMAP_CONFIG.interior.cubeOpacity,
      backwallDepth: Number.isFinite(interior.backwallDepth)
        ? interior.backwallDepth
        : DEFAULT_VISUALSMAP_CONFIG.interior.backwallDepth,
      backwallGridColor: interior.backwallGridColor || DEFAULT_VISUALSMAP_CONFIG.interior.backwallGridColor
    }
  };
}

function normalizeTags(raw) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((tag) => (typeof tag === 'string' ? tag.trim() : ''))
    .filter(Boolean);
}

function normalizeBounds(rawBounds, rows, cols) {
  if (!rawBounds || typeof rawBounds !== 'object') return null;
  const clampRow = (value) => Math.min(Math.max(Math.round(Number(value)), 0), rows - 1);
  const clampCol = (value) => Math.min(Math.max(Math.round(Number(value)), 0), cols - 1);

  const minRow = clampRow(rawBounds.minRow ?? rawBounds.startRow ?? rawBounds.rowStart ?? rawBounds.row);
  const maxRow = clampRow(rawBounds.maxRow ?? rawBounds.endRow ?? rawBounds.rowEnd ?? rawBounds.row ?? minRow);
  const minCol = clampCol(rawBounds.minCol ?? rawBounds.startCol ?? rawBounds.colStart ?? rawBounds.col);
  const maxCol = clampCol(rawBounds.maxCol ?? rawBounds.endCol ?? rawBounds.colEnd ?? rawBounds.col ?? minCol);

  return {
    minRow: Math.min(minRow, maxRow),
    maxRow: Math.max(minRow, maxRow),
    minCol: Math.min(minCol, maxCol),
    maxCol: Math.max(minCol, maxCol),
  };
}

function resolveActiveArea(visualsMap, rows, cols) {
  const activeTiles = Array.isArray(visualsMap?.activeTiles)
    ? visualsMap.activeTiles
      .map((tile) => ({ row: Number(tile?.row), col: Number(tile?.col) }))
      .filter((tile) => Number.isFinite(tile.row) && Number.isFinite(tile.col))
    : [];

  let bounds = normalizeBounds(visualsMap?.activeBounds || visualsMap?.activeArea, rows, cols);

  if (!bounds && activeTiles.length) {
    const minRow = Math.max(Math.min(...activeTiles.map((tile) => Math.round(tile.row))), 0);
    const maxRow = Math.min(Math.max(...activeTiles.map((tile) => Math.round(tile.row))), rows - 1);
    const minCol = Math.max(Math.min(...activeTiles.map((tile) => Math.round(tile.col))), 0);
    const maxCol = Math.min(Math.max(...activeTiles.map((tile) => Math.round(tile.col))), cols - 1);
    bounds = { minRow, maxRow, minCol, maxCol };
  }

  if (!bounds) {
    bounds = { minRow: 0, maxRow: rows - 1, minCol: 0, maxCol: cols - 1 };
  }

  // Ensure bounds match grid size in case of partial specification
  bounds = {
    minRow: Math.max(0, Math.min(bounds.minRow, rows - 1)),
    maxRow: Math.max(0, Math.min(bounds.maxRow, rows - 1)),
    minCol: Math.max(0, Math.min(bounds.minCol, cols - 1)),
    maxCol: Math.max(0, Math.min(bounds.maxCol, cols - 1)),
  };

  return {
    bounds,
    tiles: activeTiles,
  };
}

function computeWorldBounds(activeBounds, rows, cols, cellSize, pathYawRad, alignWorldToPath) {
  const corners = [
    gridToWorld(activeBounds.minRow, activeBounds.minCol, rows, cols, cellSize, pathYawRad, alignWorldToPath),
    gridToWorld(activeBounds.maxRow, activeBounds.maxCol, rows, cols, cellSize, pathYawRad, alignWorldToPath),
    gridToWorld(activeBounds.minRow, activeBounds.maxCol, rows, cols, cellSize, pathYawRad, alignWorldToPath),
    gridToWorld(activeBounds.maxRow, activeBounds.minCol, rows, cols, cellSize, pathYawRad, alignWorldToPath),
  ];

  const xs = corners.map((corner) => corner.x);
  const zs = corners.map((corner) => corner.z);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minZ = Math.min(...zs);
  const maxZ = Math.max(...zs);

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    centerX: (minX + maxX) / 2,
    centerZ: (minZ + maxZ) / 2,
    width: Math.max(maxX - minX, cellSize),
    depth: Math.max(maxZ - minZ, cellSize),
  };
}

function resolveTextureConfig(textures, key) {
  const entry = textures && typeof textures === 'object' ? textures[key] : null;
  if (!entry) return null;

  const descriptor = typeof entry === 'string' ? { image: entry } : entry;
  if (!descriptor?.image && !descriptor?.url) return null;

  return {
    image: descriptor.image || descriptor.url,
    mode: descriptor.mode === 'stretch' ? 'stretch' : 'tile',
    repeat: descriptor.repeat && typeof descriptor.repeat === 'object' ? descriptor.repeat : null,
  };
}

function loadTexture(renderer, url) {
  return new Promise((resolve) => {
    const loader = new renderer.THREE.TextureLoader();
    loader.load(url, (texture) => resolve(texture), undefined, () => resolve(null));
  });
}

async function buildTexturedPlane(renderer, {
  boundsWorld,
  cellSize,
  textureConfig,
  orientation,
  baseContext,
}) {
  const resolvedUrl = resolveAssetPath(textureConfig.image, baseContext);
  if (!resolvedUrl) return null;

  const texture = await loadTexture(renderer, resolvedUrl);
  if (!texture) {
    console.warn('[visualsmapLoader] ✗ Failed to load texture for interior surface:', resolvedUrl);
    return null;
  }

  if (textureConfig.mode === 'stretch') {
    texture.wrapS = renderer.THREE.ClampToEdgeWrapping;
    texture.wrapT = renderer.THREE.ClampToEdgeWrapping;
    texture.repeat.set(1, 1);
  } else {
    texture.wrapS = renderer.THREE.RepeatWrapping;
    texture.wrapT = renderer.THREE.RepeatWrapping;
    const repeatX = Number.isFinite(textureConfig.repeat?.x)
      ? textureConfig.repeat.x
      : Math.max(1, Math.round(boundsWorld.width / cellSize));
    const repeatY = Number.isFinite(textureConfig.repeat?.y)
      ? textureConfig.repeat.y
      : Math.max(1, Math.round(boundsWorld.depth / cellSize));
    texture.repeat.set(repeatX, repeatY);
  }

  const material = new renderer.THREE.MeshStandardMaterial({
    map: texture,
    side: renderer.THREE.DoubleSide,
  });

  const planeGeometry = new renderer.THREE.PlaneGeometry(boundsWorld.width, boundsWorld.depth);
  const plane = new renderer.THREE.Mesh(planeGeometry, material);

  if (orientation === 'ground') {
    plane.rotation.x = -Math.PI / 2;
    plane.position.set(boundsWorld.centerX, 0.005, boundsWorld.centerZ);
  } else {
    plane.position.set(boundsWorld.centerX, boundsWorld.depth / 2, 0);
  }

  return plane;
}

async function buildInteriorVisuals(renderer, {
  boundsWorld,
  cellSize,
  activeTiles,
  config,
  textures,
  baseContext,
  rows,
  cols,
  pathYawRad,
  alignWorldToPath,
}) {
  const interior = config.interior;
  const group = new renderer.THREE.Group();
  const padding = Math.max(0, interior.maskPadding) * cellSize;

  const outerHalfWidth = (boundsWorld.width / 2) + padding * 2;
  const outerHalfDepth = (boundsWorld.depth / 2) + padding * 2;
  const innerHalfWidth = (boundsWorld.width / 2) + padding;
  const innerHalfDepth = (boundsWorld.depth / 2) + padding;

  const shape = new renderer.THREE.Shape();
  shape.moveTo(-outerHalfWidth, -outerHalfDepth);
  shape.lineTo(outerHalfWidth, -outerHalfDepth);
  shape.lineTo(outerHalfWidth, outerHalfDepth);
  shape.lineTo(-outerHalfWidth, outerHalfDepth);
  shape.lineTo(-outerHalfWidth, -outerHalfDepth);

  const hole = new renderer.THREE.Path();
  hole.moveTo(-innerHalfWidth, -innerHalfDepth);
  hole.lineTo(innerHalfWidth, -innerHalfDepth);
  hole.lineTo(innerHalfWidth, innerHalfDepth);
  hole.lineTo(-innerHalfWidth, innerHalfDepth);
  hole.lineTo(-innerHalfWidth, -innerHalfDepth);
  shape.holes.push(hole);

  const maskGeometry = new renderer.THREE.ShapeGeometry(shape);
  maskGeometry.rotateX(-Math.PI / 2);
  const maskMaterial = new renderer.THREE.MeshBasicMaterial({
    color: interior.maskColor,
    side: renderer.THREE.DoubleSide,
    depthWrite: true,
  });
  const mask = new renderer.THREE.Mesh(maskGeometry, maskMaterial);
  mask.position.set(boundsWorld.centerX, 0.02, boundsWorld.centerZ);
  group.add(mask);

  const wallHeight = Math.max(interior.wallHeight * cellSize, cellSize);
  const wallThickness = Math.max(cellSize * 0.08, 0.05);
  const wallMaterial = new renderer.THREE.MeshBasicMaterial({ color: interior.maskColor, side: renderer.THREE.DoubleSide });

  const walls = [
    { width: wallThickness, depth: boundsWorld.depth + (padding * 2), x: boundsWorld.minX - padding - (wallThickness / 2), z: boundsWorld.centerZ },
    { width: wallThickness, depth: boundsWorld.depth + (padding * 2), x: boundsWorld.maxX + padding + (wallThickness / 2), z: boundsWorld.centerZ },
    { width: boundsWorld.width + (padding * 2), depth: wallThickness, x: boundsWorld.centerX, z: boundsWorld.minZ - padding - (wallThickness / 2) },
    { width: boundsWorld.width + (padding * 2), depth: wallThickness, x: boundsWorld.centerX, z: boundsWorld.maxZ + padding + (wallThickness / 2) },
  ];

  walls.forEach((wall) => {
    const geom = new renderer.THREE.BoxGeometry(wall.width, wallHeight, wall.depth);
    const mesh = new renderer.THREE.Mesh(geom, wallMaterial.clone());
    mesh.position.set(wall.x, wallHeight / 2, wall.z);
    group.add(mesh);
  });

  const backwall = new renderer.THREE.GridHelper(
    Math.max(boundsWorld.width, cellSize),
    Math.max(2, Math.round(boundsWorld.width / cellSize)),
    interior.backwallGridColor,
    interior.backwallGridColor,
  );
  backwall.rotation.x = Math.PI / 2;
  backwall.position.set(boundsWorld.centerX, boundsWorld.depth / 2, 0);
  group.add(backwall);

  const textureConfigs = {
    ground: resolveTextureConfig(textures, 'ground'),
    backwall: resolveTextureConfig(textures, 'backwall'),
  };

  if (textureConfigs.ground) {
    const groundPlane = await buildTexturedPlane(renderer, {
      boundsWorld,
      cellSize,
      textureConfig: textureConfigs.ground,
      orientation: 'ground',
      baseContext,
    });
    if (groundPlane) group.add(groundPlane);
  }

  if (textureConfigs.backwall) {
    const wallBounds = { ...boundsWorld, depth: Math.max(boundsWorld.depth, cellSize) };
    const backwallPlane = await buildTexturedPlane(renderer, {
      boundsWorld: wallBounds,
      cellSize,
      textureConfig: textureConfigs.backwall,
      orientation: 'backwall',
      baseContext,
    });
    if (backwallPlane) {
      backwallPlane.position.z = 0 - (config.interior.backwallDepth * cellSize);
      group.add(backwallPlane);
    }
  }

  if (activeTiles.length) {
    const cubeGeom = new renderer.THREE.BoxGeometry(cellSize, cellSize, cellSize);
    const cubeMat = new renderer.THREE.MeshBasicMaterial({
      color: interior.maskColor,
      transparent: true,
      opacity: interior.cubeOpacity,
      depthWrite: false,
    });

    activeTiles.forEach((tile) => {
      const pos = gridToWorld(tile.row, tile.col, rows, cols, cellSize, pathYawRad, alignWorldToPath);
      const mesh = new renderer.THREE.Mesh(cubeGeom, cubeMat.clone());
      mesh.position.set(pos.x, cellSize / 2, pos.z);
      group.add(mesh);
    });
  }

  renderer.add(group);
  return group;
}

/**
 * Load the shared visualsmap index so runtime placement can mirror editor
 * defaults (orientation, base rotations, forward offsets, etc.).
 *
 * @param {string|null} baseContext - Base URL used to resolve the index path
 * @returns {Promise<{ assets: Map<string, any>, baseUrl: string }|null>}
 */
async function loadVisualsmapIndex(baseContext = null) {
  // In development mode, skip cache to always fetch fresh data
  // In production, use cache for performance
  const isDev = isDevelopmentMode();
  
  if (!isDev && VISUALSMAP_INDEX_CACHE.loaded && VISUALSMAP_INDEX_CACHE.assets) {
    console.log('[visualsmapLoader] ↻ Using cached visualsmap index');
    return {
      assets: VISUALSMAP_INDEX_CACHE.assets,
      baseUrl: VISUALSMAP_INDEX_CACHE.baseUrl,
    };
  }

  // Add cache-busting parameter in development mode
  const indexPath = isDev 
    ? `config/maps/visualsmaps/index.json?t=${Date.now()}`
    : 'config/maps/visualsmaps/index.json';
  const resolvedPath = resolveAssetPath(indexPath, baseContext);

  if (!resolvedPath) {
    console.warn('[visualsmapLoader] ✗ Could not resolve visualsmap index path');
    return null;
  }

  console.log(`[visualsmapLoader] Loading visualsmap index: ${resolvedPath}`);

  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) {
      console.warn(`[visualsmapLoader] ✗ Failed to load visualsmap index (${response.status} ${response.statusText})`);
      return null;
    }

    const indexJson = await response.json();
    const baseUrl = new URL('./', resolvedPath).href;
    const assetMap = new Map();

    ['segments', 'structures', 'decorations'].forEach((section) => {
      const list = indexJson?.[section];
      if (!Array.isArray(list)) return;
      list.forEach((asset) => {
        if (!asset?.id) return;
        // Preserve original object shape while tagging the source base
        assetMap.set(asset.id, { ...asset, __visualsmapIndexBase: baseUrl });
      });
    });

    VISUALSMAP_INDEX_CACHE.loaded = true;
    VISUALSMAP_INDEX_CACHE.assets = assetMap;
    VISUALSMAP_INDEX_CACHE.baseUrl = baseUrl;

    console.log(`[visualsmapLoader] ✓ Loaded visualsmap index with ${assetMap.size} assets`);

    return { assets: assetMap, baseUrl };
  } catch (error) {
    console.warn('[visualsmapLoader] ✗ Error loading visualsmap index:', error);
    return null;
  }
}

/**
 * Load asset configuration
 * @param {string} assetType - Type of asset (e.g., "tower", "sidewalk")
 * @returns {Promise<Object>} Asset configuration
 */
async function loadAssetConfig(assetType, baseContext = null) {
  const configPath = `config/assets/${assetType}-config.json`;
  const resolvedPath = resolveAssetPath(configPath, baseContext);

  console.log(`[visualsmapLoader] Loading asset config for "${assetType}": ${resolvedPath}`);
  
  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) {
      console.warn(`[visualsmapLoader] ✗ Failed to load asset config: ${configPath} (${response.status} ${response.statusText})`);
      return null;
    }
    const config = await response.json();
    console.log(`[visualsmapLoader] ✓ Loaded asset config for "${assetType}":`, config);
    return config;
  } catch (error) {
    console.warn(`[visualsmapLoader] ✗ Error loading asset config ${configPath}:`, error);
    return null;
  }
}

function getCandleLightDefaults() {
  const defaults = (typeof window !== 'undefined' && window.CONFIG?.lighting?.candleDefaults) || {};
  return {
    topWidth: defaults.topWidth ?? 0.8,
    topDepth: defaults.topDepth ?? 0.8,
    bottomWidth: defaults.bottomWidth ?? 0.5,
    bottomDepth: defaults.bottomDepth ?? 0.5,
    height: defaults.height ?? 1.5,
    color: defaults.color ?? 0xffbb66,
    emissiveIntensity: defaults.emissiveIntensity ?? 1.2,
    opacity: defaults.opacity ?? 0.8,
    rotationYDeg: defaults.rotationYDeg ?? 90,
    scale: defaults.scale ?? 1.2,
    nightEmissive: defaults.nightEmissive ?? 0xffbb66,
    nightIntensity: defaults.nightIntensity ?? 1.2,
    dayEmissive: defaults.dayEmissive ?? 0x000000,
    dayIntensity: defaults.dayIntensity ?? 0.0,
  };
}

function resolveCandleOffset(candleConfig, assetConfig) {
  const baseOffset = { x: 0, y: 0, z: 0, ...(candleConfig?.offset || {}) };
  const attachmentId = candleConfig?.attachmentId;

  if (attachmentId && Array.isArray(assetConfig?.extra?.attachmentPoints)) {
    const attachment = assetConfig.extra.attachmentPoints.find(point => point.id === attachmentId);
    if (attachment?.offset) {
      baseOffset.x += attachment.offset.x ?? 0;
      baseOffset.y += attachment.offset.y ?? 0;
      baseOffset.z += attachment.offset.z ?? 0;
    }
  }

  return baseOffset;
}

function resolveCandleScale(scaleConfig, defaultScale) {
  if (typeof scaleConfig === 'number') {
    return { x: scaleConfig, y: scaleConfig, z: scaleConfig };
  }

  if (scaleConfig && typeof scaleConfig === 'object') {
    return {
      x: scaleConfig.x ?? defaultScale,
      y: scaleConfig.y ?? defaultScale,
      z: scaleConfig.z ?? defaultScale,
    };
  }

  return { x: defaultScale, y: defaultScale, z: defaultScale };
}

function resolveRotationY(rotationDeg, fallbackDeg) {
  const rotation = Number.isFinite(rotationDeg) ? rotationDeg : fallbackDeg;
  return Number.isFinite(rotation) ? (rotation * Math.PI) / 180 : 0;
}

/**
 * Convert grid coordinates to world coordinates
 * Grid: (row, col) where row 0 is top
 * World: (x, y, z) where y is vertical, x is horizontal, z is depth
 *
 * @param {number} row - Grid row
 * @param {number} col - Grid column
 * @param {number} rows - Total rows in grid
 * @param {number} cols - Total columns in grid
 * @param {number} cellSize - Size of each grid cell in world units
 * @param {Object} gameplayPath - Gameplay path {start: {row, col}, end: {row, col}}
 * @param {boolean} alignToPath - Whether to align world to gameplay path
 * @returns {Object} World position {x, y, z}
 */
function gridToWorld(row, col, rows, cols, cellSize, pathYawRad, alignToPath) {
  // Match editor centering: grid spans from -(N-1)/2 .. +(N-1)/2
  const halfRows = (rows - 1) / 2;
  const halfCols = (cols - 1) / 2;

  const relRow = row - halfRows;
  const relCol = col - halfCols;

  let x = relCol * cellSize;
  let z = -relRow * cellSize; // Negative because row 0 is top

  if (alignToPath && Number.isFinite(pathYawRad)) {
    // Rotate world so gameplay path aligns to +X (editor behavior rotates the root)
    const cos = Math.cos(-pathYawRad);
    const sin = Math.sin(-pathYawRad);
    const rx = x * cos - z * sin;
    const rz = x * sin + z * cos;
    x = rx;
    z = rz;
  }

  return { x, y: 0, z };
}

/**
 * Build the set of grid cells touched by the gameplay path
 * @param {Object} gameplayPath
 * @param {number} rows
 * @param {number} cols
 * @returns {Set<string>}
 */
function collectPathCells(gameplayPath, rows, cols) {
  const cells = new Set();
  if (!gameplayPath?.start || !gameplayPath?.end) return cells;

  const startRow = Math.min(Math.max(Math.round(gameplayPath.start.row), 0), rows - 1);
  const startCol = Math.min(Math.max(Math.round(gameplayPath.start.col), 0), cols - 1);
  const endRow = Math.min(Math.max(Math.round(gameplayPath.end.row), 0), rows - 1);
  const endCol = Math.min(Math.max(Math.round(gameplayPath.end.col), 0), cols - 1);

  const steps = Math.max(Math.abs(endRow - startRow), Math.abs(endCol - startCol), 1);
  for (let i = 0; i <= steps; i++) {
    const t = steps === 0 ? 0 : i / steps;
    const r = Math.round(startRow + (endRow - startRow) * t);
    const c = Math.round(startCol + (endCol - startCol) * t);
    cells.add(`${r},${c}`);
  }

  return cells;
}

function resolveGameplayPathLookAtConfig(visualsMap) {
  const lookAt = visualsMap?.gameplayPathLookAt || {};
  const offsetY = Number.isFinite(Number(lookAt.offsetY)) ? Number(lookAt.offsetY) : DEFAULT_GAMEPLAY_PATH_LOOK_AT.offsetY;
  const offsetZ = Number.isFinite(Number(lookAt.offsetZ)) ? Number(lookAt.offsetZ) : DEFAULT_GAMEPLAY_PATH_LOOK_AT.offsetZ;
  return { offsetY, offsetZ };
}

/**
 * Load and place objects from visualsmap
 * @param {Object} renderer - The renderer instance
 * @param {Object} area - Area configuration with visualsMap path
 * @param {string} gameplayMapUrl - URL of the gameplaymap.json
 * @returns {Promise<Object>} { objects: Array, dispose: Function }
 */
export async function loadVisualsMap(renderer, area, gameplayMapUrl) {
  if (!area?.visualsMap) {
    console.log('[visualsmapLoader] No visualsMap in area config');
    return { objects: [], dispose: () => {} };
  }

  try {
    // Resolve and load visualsmap
    const visualsMapUrl = resolveVisualsMapPath(area.visualsMap, gameplayMapUrl);
    console.log('[visualsmapLoader] ========================================');
    console.log('[visualsmapLoader] Starting visualsmap load for area:', area.id);
    console.log('[visualsmapLoader] - Gameplay map URL:', gameplayMapUrl);
    console.log('[visualsmapLoader] - Visualsmap path:', area.visualsMap);
    console.log('[visualsmapLoader] - Resolved URL:', visualsMapUrl);

    const response = await fetch(visualsMapUrl);
    if (!response.ok) {
      console.warn(`[visualsmapLoader] ✗ Failed to load visualsmap: ${visualsMapUrl} (${response.status} ${response.statusText})`);
      return { objects: [], dispose: () => {} };
    }

    const visualsMap = await response.json();
    console.log('[visualsmapLoader] ✓ Visualsmap JSON loaded successfully');
    console.log('[visualsmapLoader] - Grid size:', visualsMap.rows, 'x', visualsMap.cols);
    console.log('[visualsmapLoader] - Layers:', Object.keys(visualsMap.layerStates || {}));

    const visualsmapConfig = getVisualsmapConfig();
    const tags = normalizeTags(visualsMap.tags);
    const isInteriorVisualsMap = tags.some((tag) => tag.toLowerCase() === 'interior');
    const { rows = 20, cols = 20, layerStates = {}, gameplayPath, alignWorldToPath = false } = visualsMap;
    const activeArea = resolveActiveArea(visualsMap, rows, cols);
    const pathLookAtConfig = resolveGameplayPathLookAtConfig(visualsMap);
    const visualsMapBase = visualsMapUrl ? new URL('./', visualsMapUrl).href : '';
    const docsBase = deriveDocsBase(visualsMapUrl) || deriveDocsBase(gameplayMapUrl) || null;
    const configBase = deriveConfigBase(visualsMapUrl) || deriveConfigBase(gameplayMapUrl) || visualsMapBase || null;

    // Prefer inline asset definitions from visualsmap JSON when available
    const inlineAssetMap = new Map();
    ['segments', 'structures', 'decorations'].forEach(section => {
      const list = visualsMap.assets?.[section];
      if (Array.isArray(list)) {
        list.forEach(asset => {
          if (asset?.id) inlineAssetMap.set(asset.id, asset);
        });
      }
    });
    const usingInlineAssets = inlineAssetMap.size > 0;
    if (usingInlineAssets) {
      console.log('[visualsmapLoader] Using inline asset definitions from visualsmap JSON');
    }

    // Load visualsmap index when inline assets are unavailable so runtime
    // placements match editor defaults (orientation, rotations, scales).
    let visualsmapIndexAssets = null;
    if (!usingInlineAssets) {
      const indexResult = await loadVisualsmapIndex(docsBase || visualsMapBase || null);
      visualsmapIndexAssets = indexResult?.assets || null;
      if (visualsmapIndexAssets?.size) {
        console.log(`[visualsmapLoader] Using visualsmap index assets (count: ${visualsmapIndexAssets.size})`);
      }
    }

    // Use the global grid unit world size configuration
    const cellSize = (typeof window !== 'undefined' && window.GRID_UNIT_WORLD_SIZE)
      || window.CONFIG?.mapEditor?.tileSize
      || window.CONFIG?.map?.gridUnit;
    console.log(`[visualsmapLoader] Using cellSize: ${cellSize} (from GRID_UNIT_WORLD_SIZE)`);
    const loadedObjects = [];
    const assetCache = new Map();
    const gltfCache = new Map();
    const pathGroundSamples = [];

    // Precompute path yaw to rotate world like the editor (world root rotated)
    let pathYawRad = null;
    if (alignWorldToPath && gameplayPath?.start && gameplayPath?.end) {
      const halfRows = (rows - 1) / 2;
      const halfCols = (cols - 1) / 2;
      const startX = (gameplayPath.start.col - halfCols) * cellSize;
      const startZ = -(gameplayPath.start.row - halfRows) * cellSize;
      const endX = (gameplayPath.end.col - halfCols) * cellSize;
      const endZ = -(gameplayPath.end.row - halfRows) * cellSize;
      const dx = endX - startX;
      const dz = endZ - startZ;
      pathYawRad = Math.atan2(dz, dx);
      console.log(`[visualsmapLoader] Path yaw (deg): ${((pathYawRad * 180) / Math.PI).toFixed(2)}`);
    }

    const pathCells = collectPathCells(gameplayPath, rows, cols);

    // Process layers in order: ground, structure, decoration
    const layerOrder = ['ground', 'structure', 'decoration'];

    for (const layerName of layerOrder) {
      const layer = layerStates[layerName];
      if (!layer || !Array.isArray(layer)) continue;

      console.log(`[visualsmapLoader] Processing layer: ${layerName}`);

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = layer[row]?.[col];
          if (!cell || !cell.type) continue;

          // Load asset config if not cached; prefer inline or visualsmap index metadata
          if (!assetCache.has(cell.type)) {
            const inlineConfig = inlineAssetMap.get(cell.type) || null;
            const indexConfig = !inlineConfig && visualsmapIndexAssets?.get(cell.type) || null;
            if (inlineConfig) {
              assetCache.set(cell.type, inlineConfig);
              console.log(`[visualsmapLoader] ✓ Using inline asset config for ${cell.type}`);
            } else if (indexConfig) {
              assetCache.set(cell.type, indexConfig);
              console.log(`[visualsmapLoader] ✓ Using visualsmap index config for ${cell.type}`);
            } else {
                const config = await loadAssetConfig(cell.type, configBase);
              assetCache.set(cell.type, config);

              if (config) {
                console.log(`[visualsmapLoader] ✓ Loaded config for ${cell.type}:`, config.gltfPath || 'no gltfPath');
              } else {
                console.warn(`[visualsmapLoader] ✗ Failed to load config for ${cell.type}`);
              }
            }
          }

          const assetConfig = assetCache.get(cell.type);
          if (!assetConfig) {
            console.warn(`[visualsmapLoader] ✗ No config for asset type: ${cell.type} at (${row},${col})`);
            continue;
          }
          const inlineAsset = inlineAssetMap.has(cell.type);

          // Resolve GLTF path
          const gltfCandidate = assetConfig.gltfPath || assetConfig.gltfFileName;
          const gltfBase = inlineAsset
            ? visualsMapBase
            : (assetConfig.__visualsmapIndexBase || docsBase || visualsMapBase || configBase || null);
          const gltfUrl = resolveAssetPath(gltfCandidate, gltfBase);
          if (!gltfUrl) {
            console.warn(`[visualsmapLoader] ✗ No gltfPath for asset: ${cell.type} at (${row},${col})`);
            console.warn(`[visualsmapLoader]   Asset config:`, assetConfig);
            continue;
          }

          // Load GLTF once per URL, then clone for each placement so we can place
          // multiple instances without Three.js re-parenting them out of the scene.
          if (!gltfCache.has(gltfUrl)) {
            gltfCache.set(gltfUrl, (async () => {
              const base = await renderer.loadGLTF(gltfUrl);
              return base;
            })());
          }

          try {
            const baseObject = await gltfCache.get(gltfUrl);
            if (!baseObject) {
              console.warn(`[visualsmapLoader] ✗ Failed to load GLTF: ${gltfUrl}`);
              continue;
            }

            // Validate that baseObject has geometry
            let meshCount = 0;
            baseObject.traverse((child) => {
              if (child.isMesh) meshCount++;
            });
            
            if (meshCount === 0) {
              console.warn(`[visualsmapLoader] ⚠ GLTF has no meshes: ${gltfUrl}`);
            }

            // Clone the loaded GLTF so every cell keeps its own transform
            const object = baseObject.clone(true);
            object.traverse((child) => {
              if (child.isMesh && child.material && typeof child.material.clone === 'function') {
                child.material = child.material.clone();
              }
            });
            if (!object) {
              console.warn(`[visualsmapLoader] ✗ Failed to clone GLTF: ${gltfUrl}`);
              continue;
            }

            // Log object structure for debugging
            console.log(`[visualsmapLoader] Object structure for ${cell.type}:`, {
              type: object.type,
              children: object.children.length,
              rotation: object.rotation,
              scale: object.scale,
              position: object.position
            });

            // Apply base rotations using shared utility (ensures consistency across all tools)
            const appliedRotations = applyAssetRotations(object, assetConfig, true);
            console.log(`[visualsmapLoader] Applied rotations to ${cell.type}:`, appliedRotations);
            console.log(`[visualsmapLoader] After rotation - rotation:`, object.rotation, 'scale:', object.scale);

            // Get offsets in grid units (pre-rotation)
            const gridOffsetX = cell.offsetX ?? assetConfig.instanceDefaults?.offsetX ?? 0;
            const gridOffsetY = cell.offsetY ?? assetConfig.instanceDefaults?.offsetY ?? 0;

            const freePlacement = (cell.position && typeof cell.position === 'object') ? {
              x: Number(cell.position.x),
              y: Number(cell.position.y),
              z: Number(cell.position.z ?? cell.position.depth ?? cell.position.yOffset),
            } : null;

            // Calculate world position with pre-rotation offsets applied in grid space
            // offsetX = column offset, offsetY = row offset (in grid coordinates)
            // These need to be applied BEFORE rotation to maintain editor-defined positions
            const effectiveCol = col + (Number.isFinite(freePlacement?.x) ? freePlacement.x : gridOffsetX);
            const effectiveRow = row + (Number.isFinite(freePlacement?.z) ? freePlacement.z : gridOffsetY);
            const worldPos = gridToWorld(effectiveRow, effectiveCol, rows, cols, cellSize, pathYawRad, alignWorldToPath);

            // Apply base scale with GRID_UNIT_WORLD_SIZE factor
            // Inline editor exports express baseScale in grid units; legacy configs keep previous scaling
            const baseScale = assetConfig.baseScale || { x: 1, y: 1, z: 1 };
            const baseScaleFactor = inlineAsset ? cellSize : (300 / cellSize);
            const instanceScale = {
              x: (cell.scaleX ?? assetConfig.instanceDefaults?.scaleX ?? 1) * baseScale.x * baseScaleFactor,
              y: (cell.scaleY ?? assetConfig.instanceDefaults?.scaleY ?? 1) * baseScale.y * baseScaleFactor,
              z: (cell.scaleZ ?? assetConfig.instanceDefaults?.scaleZ ?? 1) * baseScale.z * baseScaleFactor
            };
            object.scale.set(instanceScale.x, instanceScale.y, instanceScale.z);

            // Apply position with Y offset (vertical offset is not affected by rotation)
            const freeHeightOffset = Number.isFinite(freePlacement?.y) ? freePlacement.y * cellSize : 0;
            const yOffset = ((assetConfig.yOffset || 0) * (inlineAsset ? cellSize : 1)) + freeHeightOffset;
            if (layerName === 'ground' && pathCells.size && pathCells.has(`${row},${col}`)) {
              pathGroundSamples.push({
                x: worldPos.x,
                y: worldPos.y + yOffset,
                z: worldPos.z,
              });
            }
            object.position.set(
              worldPos.x,
              worldPos.y + yOffset,
              worldPos.z
            );

            // Cell orientation is additive relative to the asset's zero (as defined by the
            // visualsmap index / instanceDefaults). The editor treats 0 as the asset's base
            // orientation, so runtime must add the cell's stored delta to that base.
            const baseOrientationDeg = assetConfig.instanceDefaults?.orientation ?? 0;
            const cellOrientationDeg = cell.orientation ?? 0;
            const orientationDeg = baseOrientationDeg + cellOrientationDeg + (assetConfig.forwardOffsetDeg || 0);

            // Path yaw adjustment: when world is rotated to align path, counter-rotate objects
            const pathAdjustment = (alignWorldToPath && Number.isFinite(pathYawRad)) ? pathYawRad : 0;

            // Apply orientation and path alignment (world-space rotation)
            // Use rotateOnWorldAxis to rotate around world Y (vertical) regardless of template's rotationX
            const finalOrientationRad = ((orientationDeg * Math.PI) / 180) - pathAdjustment;
            if (finalOrientationRad !== 0) {
              object.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), finalOrientationRad);
            }

            // Tag object with asset type for later identification (day/night system, etc.)
            object.userData.assetType = cell.type;
            object.name = object.name || cell.type;

            // Add object to renderer
            renderer.add(object);
            loadedObjects.push(object);

            // Log only first few placements per layer to avoid spam, then summary
            const LOG_SAMPLE_INTERVAL = 20; // Log every Nth placement to reduce console spam
            const isFirstInLayer = loadedObjects.length % LOG_SAMPLE_INTERVAL === 1;
            if (isFirstInLayer || loadedObjects.length <= 5) {
              console.log(`[visualsmapLoader]   Placed ${cell.type} at grid(${row},${col}) -> world(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
            }
          } catch (error) {
            console.warn(`[visualsmapLoader] ✗ Error loading object at (${row},${col}):`, error);
          }
        }
      }
    }

    console.log('[visualsmapLoader] ========================================');
    console.log(`[visualsmapLoader] ✓ VISUALSMAP LOAD COMPLETE`);
    console.log(`[visualsmapLoader] - Total objects placed: ${loadedObjects.length}`);
    
    // Summary by layer
    const byLayer = {};
    for (const layerName of layerOrder) {
      const layer = layerStates[layerName];
      if (!layer || !Array.isArray(layer)) continue;
      
      let cellCount = 0;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const cell = layer[row]?.[col];
          if (cell && cell.type) cellCount++;
        }
      }
      
      if (cellCount > 0) {
        byLayer[layerName] = cellCount;
      }
    }
    
    console.log(`[visualsmapLoader] - Grid cells by layer:`, byLayer);
    console.log(`[visualsmapLoader] - Unique asset types loaded:`, assetCache.size);
    console.log(`[visualsmapLoader] - Unique GLTF files cached:`, gltfCache.size);
    console.log(`[visualsmapLoader] - Renderer scene.children count:`, renderer.scene?.children?.length || 0);
    console.log('[visualsmapLoader] ========================================');

    const worldBounds = computeWorldBounds(activeArea.bounds, rows, cols, cellSize, pathYawRad, alignWorldToPath);
    const gridCenterX = worldBounds.centerX;
    const gridCenterZ = worldBounds.centerZ;

    if (isInteriorVisualsMap) {
      const interiorGroup = await buildInteriorVisuals(renderer, {
        boundsWorld: worldBounds,
        cellSize,
        activeTiles: activeArea.tiles,
        config: visualsmapConfig,
        textures: visualsMap.textures || {},
        baseContext: visualsmapConfig.textureBasePath || visualsMapBase || configBase,
        rows,
        cols,
        pathYawRad,
        alignWorldToPath,
      });
      if (interiorGroup) {
        loadedObjects.push(interiorGroup);
      }
    }

    const gridWidth = worldBounds.width;
    const gridDepth = worldBounds.depth;

    const lookAtOffsetsWorld = {
      y: pathLookAtConfig.offsetY * cellSize,
      z: pathLookAtConfig.offsetZ * cellSize,
    };

    const gameplayPathTarget = (() => {
      if (!pathGroundSamples.length) {
        return { x: gridCenterX, y: lookAtOffsetsWorld.y, z: gridCenterZ + lookAtOffsetsWorld.z };
      }

      const totals = pathGroundSamples.reduce((acc, pos) => {
        acc.x += pos.x;
        acc.y += pos.y;
        acc.z += pos.z;
        return acc;
      }, { x: 0, y: 0, z: 0 });

      const count = Math.max(pathGroundSamples.length, 1);
      return {
        x: totals.x / count,
        y: (totals.y / count) + lookAtOffsetsWorld.y,
        z: (totals.z / count) + lookAtOffsetsWorld.z,
      };
    })();

    console.log(`[visualsmapLoader] Gameplay path look-at samples: ${pathGroundSamples.length}, offsets (y:${lookAtOffsetsWorld.y.toFixed(2)}, z:${lookAtOffsetsWorld.z.toFixed(2)})`);

    // Position camera aligned with gameplay path for side-scrolling view
    // For side-scrolling gameplay aligned to path:
    // - When alignWorldToPath is true, the path is rotated to align with +X axis
    // - Camera should be positioned to the side (negative Z) looking at the path
    // - This creates a side view where the path runs left-to-right across the screen
    let cameraX, cameraY, cameraZ, lookAtX, lookAtY, lookAtZ;
    const { x: targetX, y: targetY, z: targetZ } = gameplayPathTarget;

    if (alignWorldToPath && gameplayPath?.start && gameplayPath?.end) {
      // Side-scrolling camera aligned with gameplay path
      // Position camera to the side of the path (negative Z = south)
      cameraX = gridCenterX; // Center on the path horizontally
      cameraY = cellSize * 0.8; // Height to see the ground plane and structures
      cameraZ = -cellSize * 1.2; // Distance from path (negative Z = viewer side)

      // Look at the gameplay path sample
      lookAtX = targetX;
      lookAtY = targetY;
      lookAtZ = targetZ;

      console.log(`[visualsmapLoader] Setting side-scrolling camera aligned with gameplay path:`);
      console.log(`[visualsmapLoader] - Path aligned to +X axis (left-to-right)`);
      console.log(`[visualsmapLoader] - Camera viewing from side (negative Z)`);
    } else {
      // Fallback: top-down view of entire grid
      const cameraDistance = Math.max(gridWidth, gridDepth) * 0.3;
      cameraX = gridCenterX;
      cameraY = cameraDistance * 1.5;
      cameraZ = gridCenterZ - cameraDistance;
      lookAtX = targetX;
      lookAtY = targetY;
      lookAtZ = targetZ;

      console.log(`[visualsmapLoader] Setting top-down camera to view entire grid:`);
    }

    console.log(`[visualsmapLoader] - Grid center: (${gridCenterX}, 0, ${gridCenterZ})`);
    console.log(`[visualsmapLoader] - Grid size: ${gridWidth} x ${gridDepth}, cellSize: ${cellSize}`);
    console.log(`[visualsmapLoader] - Camera position: (${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}, ${cameraZ.toFixed(1)})`);
    console.log(`[visualsmapLoader] - Camera look-at: (${lookAtX.toFixed(1)}, ${lookAtY.toFixed(1)}, ${lookAtZ.toFixed(1)})`);

    renderer.setCameraParams({
      position: { x: cameraX, y: cameraY, z: cameraZ },
      lookAt: { x: lookAtX, y: lookAtY, z: lookAtZ }
    });

    // Verify camera was set correctly
    if (renderer.camera) {
      console.log(`[visualsmapLoader] ✓ Camera actual position after set:`, renderer.camera.position);
      console.log(`[visualsmapLoader] ✓ Camera type:`, renderer.camera.type);
    }

    // Initialize day/night lighting system (night by default)
    console.log(`[visualsmapLoader] Initializing day/night lighting system`);
    const dayNightSystem = new DayNightSystem({
      defaultToNight: true,
      transitionDuration: 2000
    });

    // Add ambient and directional lights
    const ambientLight = new renderer.THREE.AmbientLight(0xffffff, 0.6);
    renderer.add(ambientLight);
    loadedObjects.push(ambientLight);

    const directionalLight = new renderer.THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(gridCenterX + 500, 1000, gridCenterZ - 500);
    directionalLight.target.position.set(gridCenterX, 0, gridCenterZ);
    renderer.add(directionalLight);
    renderer.add(directionalLight.target);
    loadedObjects.push(directionalLight, directionalLight.target);

    // Track all materials for lighting tint application
    const sceneMaterials = [];

    // Collect all materials from loaded objects
    for (const obj of loadedObjects) {
      obj.traverse((child) => {
        if (child.material) {
          // Store original color if not already stored
          if (Array.isArray(child.material)) {
            child.material.forEach(mat => {
              if (!mat.userData.originalColor) {
                mat.userData.originalColor = mat.color ? mat.color.clone() : new renderer.THREE.Color(0xffffff);
              }
              sceneMaterials.push(mat);
            });
          } else {
            if (!child.material.userData.originalColor) {
              child.material.userData.originalColor = child.material.color ? child.material.color.clone() : new renderer.THREE.Color(0xffffff);
            }
            sceneMaterials.push(child.material);
          }
        }
      });
    }

    console.log(`[visualsmapLoader] Collected ${sceneMaterials.length} materials for lighting tint`);

    // Update lights, sky, and material tints when day/night changes
    const updateSceneLighting = () => {
      const config = dayNightSystem.getCurrentLightingConfig();
      ambientLight.color.setHex(config.ambientColor);
      ambientLight.intensity = config.ambientIntensity;
      directionalLight.intensity = config.hemisphereIntensity * 1.5;

      // Update sky background color
      if (renderer.scene && renderer.scene.background) {
        renderer.scene.background.setHex(config.skyColor);
      }

      // Apply lighting tint to all materials (makes sprites and unlit materials respond to lighting)
      const tintColor = new renderer.THREE.Color(config.ambientColor);
      const tintIntensity = Math.max(config.ambientIntensity, 0.15); // Minimum 15% brightness

      for (const mat of sceneMaterials) {
        if (mat.userData.originalColor) {
          // Blend original color with ambient tint
          const blendedColor = mat.userData.originalColor.clone();
          blendedColor.lerp(tintColor, 1 - tintIntensity);
          mat.color.copy(blendedColor);
          mat.needsUpdate = true;
        }
      }
    };

    dayNightSystem.on('timeChange', updateSceneLighting);
    updateSceneLighting(); // Set initial state

    // Hook into renderer's frame update to update day/night transitions
    let lastUpdateTime = 0;
    const UPDATE_INTERVAL = 100; // Update lighting every 100ms (10 FPS for lighting)

    const frameUpdateHandler = ({ time }) => {
      dayNightSystem.update(0); // deltaTime handled internally by DayNightSystem

      // Update lighting during transitions or periodically for continuous time changes
      const shouldUpdate = dayNightSystem.isTransitioning || (time - lastUpdateTime > UPDATE_INTERVAL);
      if (shouldUpdate) {
        updateSceneLighting();
        lastUpdateTime = time;
      }
    };
    renderer.on('frame', frameUpdateHandler);

    console.log(`[visualsmapLoader] Adding candle lights from asset configs`);
    const candleDefaults = getCandleLightDefaults();
    let candleLightCount = 0;

    for (const obj of loadedObjects) {
      if (obj.isLight) continue;

      const assetType = obj.userData?.assetType;
      if (!assetType || !isTowerStructure(assetType)) continue;

      const assetConfig = assetCache.get(assetType);
      const candleLights = assetConfig?.extra?.candleLights;
      if (!Array.isArray(candleLights) || candleLights.length === 0) continue;

      for (const candleConfig of candleLights) {
        const options = {
          ...candleDefaults,
          ...(candleConfig.options || {}),
        };

        const candleLight = candleConfig.withGlow
          ? createCandleLightWithGlow(renderer.THREE, options)
          : createCandleLight(renderer.THREE, options);

        const offset = resolveCandleOffset(candleConfig, assetConfig);
        obj.updateMatrixWorld(true);
        const worldPos = obj.localToWorld(new renderer.THREE.Vector3(offset.x, offset.y, offset.z));
        candleLight.position.copy(worldPos);

        const scale = resolveCandleScale(candleConfig.scale, candleDefaults.scale);
        candleLight.scale.set(scale.x, scale.y, scale.z);

        candleLight.rotation.y = resolveRotationY(candleConfig.rotationYDeg, candleDefaults.rotationYDeg);

        renderer.add(candleLight);
        loadedObjects.push(candleLight);

        const lightingConfig = candleConfig.lighting || {};
        dayNightSystem.registerEmissiveObject(candleLight, {
          nightEmissive: lightingConfig.nightEmissive ?? options.color ?? candleDefaults.nightEmissive,
          nightIntensity: lightingConfig.nightIntensity ?? options.emissiveIntensity ?? candleDefaults.nightIntensity,
          dayEmissive: lightingConfig.dayEmissive ?? candleDefaults.dayEmissive,
          dayIntensity: lightingConfig.dayIntensity ?? candleDefaults.dayIntensity,
        });

        candleLightCount++;
      }
    }
    console.log(`[visualsmapLoader] ✓ Added ${candleLightCount} candle lights from asset configs`);

    // Store day/night system reference for external control
    if (typeof window !== 'undefined') {
      window.dayNightSystem = dayNightSystem;
      console.log(`[visualsmapLoader] ✓ Day/night system available via window.dayNightSystem`);
      console.log(`[visualsmapLoader]   Usage: window.dayNightSystem.toggle() to switch day/night`);
    }

    const gameplayDebugGroup = new renderer.THREE.Group();
    gameplayDebugGroup.name = 'gameplayDebug';
    gameplayDebugGroup.visible = false;
    renderer.add(gameplayDebugGroup);
    loadedObjects.push(gameplayDebugGroup);

    // Create gameplay path visualization (hidden by default)
    const pathGroup = new renderer.THREE.Group();
    pathGroup.name = 'gameplayPath';
    gameplayDebugGroup.add(pathGroup);

    const gameplaySpawnerGroup = new renderer.THREE.Group();
    gameplaySpawnerGroup.name = 'gameplaySpawners';
    gameplayDebugGroup.add(gameplaySpawnerGroup);

    const targetGroup = new renderer.THREE.Group();
    targetGroup.name = 'gameplayPathTargets';
    gameplayDebugGroup.add(targetGroup);

    const poiGroup = new renderer.THREE.Group();
    poiGroup.name = 'gameplayPois';
    gameplayDebugGroup.add(poiGroup);

    let pathStartWorld = null;
    let pathEndWorld = null;
    let pathVisible = false;
    let gameplayElementsVisible = false;

    const gameplayMarkers = {
      spawners: [],
      targets: [],
      pois: [],
    };

    const resolveOverlayConfig = () => {
      const cfg = (typeof window !== 'undefined' ? window.CONFIG?.debug?.gameplayOverlay : null) || {};
      return {
        spawnerColor: cfg.spawnerColor || '#22c55e',
        spawnerRadius: Number(cfg.spawnerRadius) || 0.24,
        targetColor: cfg.targetColor || '#38bdf8',
        targetRadius: Number(cfg.targetRadius) || 0.2,
        poiStroke: cfg.poiStroke || '#f472b6',
        poiFill: cfg.poiFill || 'rgba(244, 114, 182, 0.08)',
        poiHeight: Number(cfg.poiHeight) || 0.3,
        labelBackground: cfg.labelBackground || 'rgba(0, 0, 0, 0.75)',
        labelColor: cfg.labelColor || '#e5e7eb',
      };
    };

    const clearGroup = (group) => {
      if (!group) return;
      while (group.children.length > 0) {
        const child = group.children[0];
        group.remove(child);
      }
    };

    const resolveTransform = () => {
      const config = typeof getTransformConfig === 'function' ? getTransformConfig() : {};
      const unitsPerPixel = area?.scene3d?.ground?.unitsPerPixel;
      return {
        ...config,
        ...(Number.isFinite(unitsPerPixel) ? { pixelsToUnits: unitsPerPixel } : {}),
      };
    };

    const toWorldVector = (point2d) => {
      if (!point2d) return null;
      const sourcePoint = {
        x: Number(point2d.x) || 0,
        y: Number(point2d.y) || 0,
      };
      const transformConfig = resolveTransform();
      const pos3d = transform2dTo3d(sourcePoint, transformConfig);
      const vec = new renderer.THREE.Vector3(pos3d.x, pos3d.y, pos3d.z);

      if (alignWorldToPath && Number.isFinite(pathYawRad)) {
        vec.applyAxisAngle(new renderer.THREE.Vector3(0, 1, 0), -pathYawRad);
      }

      return vec;
    };

    const spawnerGroup = new renderer.THREE.Group();
    spawnerGroup.name = 'spawners';
    spawnerGroup.visible = false;
    renderer.add(spawnerGroup);
    loadedObjects.push(spawnerGroup);

    const spawnerMarkerGeom = new renderer.THREE.SphereGeometry(0.1 * cellSize, 12, 12);
    const spawnerMarkerMat = new renderer.THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0ea5e9,
      emissiveIntensity: 0.4,
    });
    let spawnerWorldPositions = [];
    let spawnersVisible = false;

    function buildGameplayPath3D() {
      // Clear existing path objects
      while (pathGroup.children.length > 0) {
        pathGroup.remove(pathGroup.children[0]);
      }

      if (!gameplayPath?.start || !gameplayPath?.end) {
        console.log('[visualsmapLoader] No gameplay path defined');
        return;
      }

      // Materials matching map editor style
      const lineMat = new renderer.THREE.LineBasicMaterial({ color: 0xfbbf24 }); // Yellow
      const startMat = new renderer.THREE.MeshStandardMaterial({
        color: 0x22c55e,
        emissive: 0x16a34a,
        emissiveIntensity: 0.25
      }); // Green
      const endMat = new renderer.THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xb91c1c,
        emissiveIntensity: 0.25
      }); // Red
      const markerGeom = new renderer.THREE.SphereGeometry(0.12 * cellSize, 14, 14);

      // Helper to create marker at grid position
      function createMarker(gridRow, gridCol, material) {
        const worldPos = gridToWorld(gridRow, gridCol, rows, cols, cellSize, pathYawRad, alignWorldToPath);
        const marker = new renderer.THREE.Mesh(markerGeom, material);
        marker.position.set(worldPos.x, 0.18 * cellSize, worldPos.z);
        marker.castShadow = false;
        marker.receiveShadow = true;
        pathGroup.add(marker);
        return worldPos;
      }

      // Create start and end markers
      const startPos = createMarker(gameplayPath.start.row, gameplayPath.start.col, startMat);
      const endPos = createMarker(gameplayPath.end.row, gameplayPath.end.col, endMat);
      pathStartWorld = new renderer.THREE.Vector3(startPos.x, 0.18 * cellSize, startPos.z);
      pathEndWorld = new renderer.THREE.Vector3(endPos.x, 0.18 * cellSize, endPos.z);

      // Draw line between start and end
      const points = [
        new renderer.THREE.Vector3(startPos.x, 0.18 * cellSize, startPos.z),
        new renderer.THREE.Vector3(endPos.x, 0.18 * cellSize, endPos.z)
      ];
      const lineGeom = new renderer.THREE.BufferGeometry().setFromPoints(points);
      const line = new renderer.THREE.Line(lineGeom, lineMat);
      pathGroup.add(line);

      console.log('[visualsmapLoader] ✓ Gameplay path visualization created');
    }

    function buildGameplaySpawnerMarkers() {
      clearGroup(gameplaySpawnerGroup);
      gameplayMarkers.spawners.length = 0;

      const overlayConfig = resolveOverlayConfig();
      const spawners = Array.isArray(area?.spawners) ? area.spawners : [];
      if (!spawners.length) return;

      const radius = overlayConfig.spawnerRadius * cellSize;
      const geometry = new renderer.THREE.SphereGeometry(radius, 14, 14);
      const emissiveColor = new renderer.THREE.Color(overlayConfig.spawnerColor);
      const material = new renderer.THREE.MeshStandardMaterial({
        color: emissiveColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.4,
      });

      for (const spawner of spawners) {
        const worldPos = toWorldVector(spawner.position || { x: spawner.x, y: spawner.y });
        if (!worldPos) continue;

        const mesh = new renderer.THREE.Mesh(geometry, material);
        mesh.position.copy(worldPos);
        gameplaySpawnerGroup.add(mesh);

        gameplayMarkers.spawners.push({
          id: spawner.spawnerId || spawner.id || spawner.name || 'spawner',
          label: spawner.name || spawner.spawnerId || spawner.id || 'Spawner',
          worldPosition: mesh.position.clone(),
        });
      }
    }

    function buildPathTargetMarkers() {
      clearGroup(targetGroup);
      gameplayMarkers.targets.length = 0;

      const overlayConfig = resolveOverlayConfig();
      const targets = Array.isArray(area?.pathTargets) ? area.pathTargets : [];
      if (!targets.length) return;

      const radius = overlayConfig.targetRadius * cellSize;
      const geometry = new renderer.THREE.SphereGeometry(radius, 12, 12);
      const emissiveColor = new renderer.THREE.Color(overlayConfig.targetColor);
      const material = new renderer.THREE.MeshStandardMaterial({
        color: emissiveColor,
        emissive: emissiveColor,
        emissiveIntensity: 0.4,
      });

      for (const target of targets) {
        const worldPos = toWorldVector(target.position || { x: target.x, y: target.y });
        if (!worldPos) continue;

        const mesh = new renderer.THREE.Mesh(geometry, material);
        mesh.position.copy(worldPos);
        targetGroup.add(mesh);

        gameplayMarkers.targets.push({
          id: target.name || target.id || 'target',
          label: target.name || target.id || 'Path Target',
          order: target.order ?? null,
          worldPosition: mesh.position.clone(),
        });
      }
    }

    function buildPoiOutlines() {
      clearGroup(poiGroup);
      gameplayMarkers.pois.length = 0;

      const overlayConfig = resolveOverlayConfig();
      const pois = Array.isArray(area?.pois) ? area.pois : [];
      if (!pois.length) return;

      const strokeColor = new renderer.THREE.Color(overlayConfig.poiStroke);
      const material = new renderer.THREE.LineBasicMaterial({
        color: strokeColor,
        transparent: true,
        opacity: 0.9,
      });
      const heightOffset = overlayConfig.poiHeight * cellSize;

      for (const poi of pois) {
        const bounds = poi.bounds || {};
        const left = Number.isFinite(bounds.left) ? bounds.left : 0;
        const right = Number.isFinite(bounds.right) ? bounds.right : (left + (Number(bounds.width) || 0));
        const top = Number.isFinite(bounds.topOffset) ? bounds.topOffset : 0;
        const bottom = Number.isFinite(bounds.bottom) ? bounds.bottom : (top + (Number(bounds.height) || 0));

        const corners2d = [
          { x: left, y: top },
          { x: right, y: top },
          { x: right, y: bottom },
          { x: left, y: bottom },
        ];
        const corners3d = corners2d.map(toWorldVector).filter(Boolean);
        if (corners3d.length !== 4) continue;

        const elevated = corners3d.map((corner) => {
          const clone = corner.clone();
          clone.y += heightOffset;
          return clone;
        });

        const geometry = new renderer.THREE.BufferGeometry().setFromPoints([
          ...elevated,
          elevated[0],
        ]);
        const line = new renderer.THREE.Line(geometry, material);
        poiGroup.add(line);

        gameplayMarkers.pois.push({
          id: poi.id || poi.name || 'poi',
          label: poi.label || poi.name || 'POI',
          corners: elevated.map((v) => v.clone()),
        });
      }
    }

    function buildGameplayElements() {
      buildGameplayPath3D();
      buildGameplaySpawnerMarkers();
      buildPathTargetMarkers();
      buildPoiOutlines();
    }

    // Build the path visualization and gameplay markers
    buildGameplayElements();

    function resolveSpawnerId(spawner, fallbackIndex) {
      if (!spawner) return fallbackIndex != null ? `spawner_${fallbackIndex}` : 'spawner';
      if (typeof spawner.spawnerId === 'string' && spawner.spawnerId.trim()) return spawner.spawnerId.trim();
      if (typeof spawner.id === 'string' && spawner.id.trim()) return spawner.id.trim();
      if (typeof spawner.name === 'string' && spawner.name.trim()) return spawner.name.trim();
      return fallbackIndex != null ? `spawner_${fallbackIndex}` : 'spawner';
    }

    function resolveSpawnerPosition(spawner) {
      if (!spawner) return null;

      const hasGridCoords = Number.isFinite(spawner.row) && Number.isFinite(spawner.col);
      if (hasGridCoords) {
        const world = gridToWorld(spawner.row, spawner.col, rows, cols, cellSize, pathYawRad, alignWorldToPath);
        return new renderer.THREE.Vector3(world.x, 0.18 * cellSize, world.z);
      }

      const rawPos = (spawner.position && typeof spawner.position === 'object') ? spawner.position : spawner;
      const x = Number(rawPos.x);
      const y = Number(rawPos.y);
      const z = Number(rawPos.z ?? rawPos.depth);

      if (!Number.isFinite(x)) return null;

      const worldY = Number.isFinite(y) ? y : 0.18 * cellSize;
      const worldZ = Number.isFinite(z) ? z : 0;
      return new renderer.THREE.Vector3(x, worldY, worldZ);
    }

    function collectSpawnerSources() {
      const areaId = area?.id || window.GAME?.currentAreaId || null;
      const spawnService = window.GAME?.spawnService;
      const serviceSpawners = spawnService?.getSpawners && areaId ? spawnService.getSpawners(areaId) : [];
      const sceneSpawnPoints = Array.isArray(area?.scene?.spawnPoints) ? area.scene.spawnPoints : [];
      const areaSpawners = Array.isArray(area?.spawners) ? area.spawners : [];
      return [...serviceSpawners, ...sceneSpawnPoints, ...areaSpawners];
    }

    function buildSpawnerMarkers() {
      while (spawnerGroup.children.length > 0) {
        spawnerGroup.remove(spawnerGroup.children[0]);
      }
      spawnerWorldPositions = [];

      const spawners = collectSpawnerSources();
      if (!spawners.length) {
        console.log('[visualsmapLoader] No spawners found for visualization');
        return;
      }

      const seen = new Set();
      spawners.forEach((spawner, index) => {
        const id = resolveSpawnerId(spawner, index + 1);
        if (seen.has(id)) return;
        seen.add(id);

        const worldPos = resolveSpawnerPosition(spawner);
        if (!worldPos) return;

        const marker = new renderer.THREE.Mesh(spawnerMarkerGeom, spawnerMarkerMat.clone());
        marker.position.copy(worldPos);
        marker.castShadow = false;
        marker.receiveShadow = true;
        marker.userData.spawnerId = id;
        spawnerGroup.add(marker);

        const label = spawner.name || spawner.label || id;
        spawnerWorldPositions.push({ id, label, world: worldPos.clone() });
      });

      console.log(`[visualsmapLoader] Spawner markers built: ${spawnerWorldPositions.length}`);
    }

    buildSpawnerMarkers();

    // Method to toggle path visibility
    function setPathVisible(visible) {
      pathVisible = !!visible;
      gameplayElementsVisible = !!visible;
      gameplayDebugGroup.visible = gameplayElementsVisible;
      pathGroup.visible = pathVisible;
      gameplaySpawnerGroup.visible = gameplayElementsVisible;
      targetGroup.visible = gameplayElementsVisible;
      poiGroup.visible = gameplayElementsVisible;
      console.log(`[visualsmapLoader] Gameplay map debug visibility: ${gameplayDebugGroup.visible}`);
    }

    function setGameplayElementsVisible(visible) {
      setPathVisible(visible);
    }

    function setSpawnersVisible(visible) {
      spawnersVisible = !!visible;
      spawnerGroup.visible = spawnersVisible;
      console.log(`[visualsmapLoader] Spawner visibility: ${spawnerGroup.visible}`);
    }

    function getSpawnerScreenPositions(options = {}) {
      if (!spawnersVisible) {
        return { visible: false, spawners: [] };
      }

      const canvasEl = options.canvas || null;
      const overlayConfig = resolveOverlayConfig();

      const spawners = spawnerWorldPositions.map((spawner) => {
        const screen = projectPointToCanvas(spawner.world, canvasEl);
        if (!screen) return null;
        return { ...spawner, screen };
      }).filter(Boolean);

      return {
        visible: spawnersVisible && spawners.length > 0,
        spawners,
        colors: {
          spawnerColor: overlayConfig.spawnerColor,
          spawnerRadius: overlayConfig.spawnerRadius,
          labelBackground: overlayConfig.labelBackground,
          labelColor: overlayConfig.labelColor,
        },
      };
    }

    function projectPointToCanvas(worldVec, targetCanvas) {
      if (!worldVec || !renderer?.camera || !renderer?.renderer?.domElement) return null;

      const domEl = renderer.renderer.domElement;
      const cssWidth = domEl.clientWidth || domEl.width || renderer.width;
      const cssHeight = domEl.clientHeight || domEl.height || renderer.height;
      if (!cssWidth || !cssHeight) return null;

      const projected = worldVec.clone().project(renderer.camera);
      const screenX = (projected.x + 1) * 0.5 * cssWidth;
      const screenY = (1 - (projected.y + 1) * 0.5) * cssHeight;

      const canvasEl = targetCanvas || (typeof document !== 'undefined' ? document.getElementById('game') : null);
      if (!canvasEl || !canvasEl.getBoundingClientRect) {
        return { x: screenX, y: screenY };
      }

      const rect = canvasEl.getBoundingClientRect();
      if (!rect.width || !rect.height) {
        return { x: screenX, y: screenY };
      }

      const scaleX = canvasEl.width / rect.width;
      const scaleY = canvasEl.height / rect.height;
      return {
        x: screenX * scaleX,
        y: screenY * scaleY,
      };
    }

    function getPathScreenLine(options = {}) {
      const canvasEl = options.canvas || null;

      // Always compute projection data (needed for groundY calculation)
      // The visible flag indicates if the debug overlay should be rendered
      if (!pathStartWorld || !pathEndWorld) {
        return { visible: false };
      }

      const start = projectPointToCanvas(pathStartWorld, canvasEl);
      const end = projectPointToCanvas(pathEndWorld, canvasEl);
      if (!start || !end) {
        return { visible: false };
      }

      const valid = Number.isFinite(start.x) && Number.isFinite(start.y)
        && Number.isFinite(end.x) && Number.isFinite(end.y);
      if (!valid) {
        return { visible: false };
      }

      // Calculate 3D world distance between path endpoints
      const dx3dWorld = pathEndWorld.x - pathStartWorld.x;
      const dz3dWorld = pathEndWorld.z - pathStartWorld.z;
      const distance3dWorld = Math.sqrt(dx3dWorld * dx3dWorld + dz3dWorld * dz3dWorld);

      return {
        visible: pathVisible, // For debug rendering - controlled by checkbox
        start,
        end,
        // 3D world info (in Three.js units)
        world3d: {
          start: { x: pathStartWorld.x, z: pathStartWorld.z },
          end: { x: pathEndWorld.x, z: pathEndWorld.z },
          distance: distance3dWorld
        }
      };
    }

    function getGameplayElementsScreenData(options = {}) {
      if (!gameplayElementsVisible) {
        return { visible: false };
      }

      const canvasEl = options.canvas || null;
      const overlayConfig = resolveOverlayConfig();

      const spawners = gameplayMarkers.spawners.map((spawner) => {
        const screen = projectPointToCanvas(spawner.worldPosition, canvasEl);
        if (!screen) return null;
        return { ...spawner, screen };
      }).filter(Boolean);

      const targets = gameplayMarkers.targets.map((target) => {
        const screen = projectPointToCanvas(target.worldPosition, canvasEl);
        if (!screen) return null;
        return { ...target, screen };
      }).filter(Boolean);

      const pois = gameplayMarkers.pois.map((poi) => {
        const points = poi.corners.map((corner) => projectPointToCanvas(corner, canvasEl)).filter(Boolean);
        if (points.length !== poi.corners.length) return null;
        return { ...poi, points };
      }).filter(Boolean);

      return {
        visible: true,
        spawners,
        targets,
        pois,
        colors: overlayConfig,
      };
    }

    return {
      objects: loadedObjects,
      dayNightSystem: dayNightSystem,
      setPathVisible: setPathVisible,
      setGameplayElementsVisible,
      setSpawnersVisible,
      getPathScreenLine,
      getSpawnerScreenPositions,
      getGameplayElementsScreenData,
      getPathExtents: () => {
        if (!pathStartWorld || !pathEndWorld) {
          return null;
        }
        return {
          start: { x: pathStartWorld.x, z: pathStartWorld.z },
          end: { x: pathEndWorld.x, z: pathEndWorld.z },
          minX: Math.min(pathStartWorld.x, pathEndWorld.x),
          maxX: Math.max(pathStartWorld.x, pathEndWorld.x),
          minZ: Math.min(pathStartWorld.z, pathEndWorld.z),
          maxZ: Math.max(pathStartWorld.z, pathEndWorld.z),
          spanX: Math.abs(pathEndWorld.x - pathStartWorld.x),
          spanZ: Math.abs(pathEndWorld.z - pathStartWorld.z)
        };
      },
      dispose: () => {
        renderer.off('frame', frameUpdateHandler);
        dayNightSystem.dispose();
        loadedObjects.forEach(obj => renderer.remove(obj));
        loadedObjects.length = 0;
      }
    };
  } catch (error) {
    console.error('[visualsmapLoader] Error loading visualsmap:', error);
    return {
      objects: [],
      dispose: () => {},
      setPathVisible: () => {},
      setGameplayElementsVisible: () => {},
      setSpawnersVisible: () => {},
      getPathScreenLine: () => ({ visible: false }),
      getSpawnerScreenPositions: () => ({ visible: false, spawners: [] }),
      getGameplayElementsScreenData: () => ({ visible: false }),
    };
  }
}
