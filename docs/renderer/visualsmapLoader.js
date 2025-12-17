/**
 * Visualsmap loader for runtime game
 * Loads grid-based visual maps and converts them to 3D scene objects
 */

import { projectToGroundPlane } from './scene3d.js';
import { applyAssetRotations } from './gltfTransforms.js';
import { DayNightSystem } from '../../src/lighting/DayNightSystem.js';
import { isTowerStructure } from '../../src/lighting/TowerLightingIntegration.js';
import { createCandleLight } from '../../src/lighting/CandleLight.js';

const DEFAULT_GAMEPLAY_PATH_LOOK_AT = Object.freeze({
  offsetY: 0.3, // Grid units; scaled by cellSize at runtime
  offsetZ: 0,
});

const VISUALSMAP_INDEX_CACHE = {
  loaded: false,
  assets: null,
  baseUrl: null,
};

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

function resolveFallbackGameplayPathTarget(area, lookAtOffsetsWorld, gridCenterX, gridCenterZ) {
  const groundPath = Array.isArray(area?.ground?.path) ? area.ground.path : null;
  if (groundPath && groundPath.length) {
    const sums = groundPath.reduce((acc, pt) => {
      const x = Number(pt?.x);
      const y = Number(pt?.y);
      if (Number.isFinite(x)) acc.x += x;
      if (Number.isFinite(y)) acc.y += y;
      acc.count += 1;
      return acc;
    }, { x: 0, y: 0, count: 0 });

    const count = Math.max(1, sums.count);
    const planeZ = Number(area?.scene3d?.ground?.planeZ);
    const zBase = Number.isFinite(planeZ) ? planeZ : gridCenterZ;
    return {
      x: sums.x / count,
      y: (sums.y / count) + lookAtOffsetsWorld.y,
      z: zBase + lookAtOffsetsWorld.z,
      source: 'areaGroundPath',
    };
  }

  return null;
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

    const { rows = 20, cols = 20, layerStates = {}, gameplayPath, alignWorldToPath = false } = visualsMap;
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

    // Use the global grid unit world size configuration (default 30)
    const cellSize = (typeof window !== 'undefined' && window.GRID_UNIT_WORLD_SIZE) || 30;
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

            // Calculate world position with pre-rotation offsets applied in grid space
            // offsetX = column offset, offsetY = row offset (in grid coordinates)
            // These need to be applied BEFORE rotation to maintain editor-defined positions
            const effectiveCol = col + gridOffsetX;
            const effectiveRow = row + gridOffsetY;
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
            const yOffset = (assetConfig.yOffset || 0) * (inlineAsset ? cellSize : 1);
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

    const gridCenterX = 0;
    const gridCenterZ = 0;

    const gridWidth = (cols - 1) * cellSize;
    const gridDepth = (rows - 1) * cellSize;

    const lookAtOffsetsWorld = {
      y: pathLookAtConfig.offsetY * cellSize,
      z: pathLookAtConfig.offsetZ * cellSize,
    };

    const fallbackGameplayPathTarget = resolveFallbackGameplayPathTarget(
      area,
      lookAtOffsetsWorld,
      gridCenterX,
      gridCenterZ
    );

    const gameplayPathTarget = (() => {
      if (!pathGroundSamples.length) {
        if (fallbackGameplayPathTarget) {
          return fallbackGameplayPathTarget;
        }
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
        source: 'pathGroundSamples',
      };
    })();

    console.log(`[visualsmapLoader] Gameplay path look-at samples: ${pathGroundSamples.length}, offsets (y:${lookAtOffsetsWorld.y.toFixed(2)}, z:${lookAtOffsetsWorld.z.toFixed(2)})`);
    if (fallbackGameplayPathTarget) {
      console.log(`[visualsmapLoader] Gameplay path fallback target from area.ground.path: (${fallbackGameplayPathTarget.x.toFixed(1)}, ${fallbackGameplayPathTarget.y.toFixed(1)}, ${fallbackGameplayPathTarget.z.toFixed(1)})`);
    }

    if (renderer) {
      renderer.userData = renderer.userData || {};
      renderer.userData.gameplayPathTarget = gameplayPathTarget;
    }

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
      lookAtX = cameraX;
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
      lookAtX = cameraX;
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

    // Add candle lights to all tower structures
    console.log(`[visualsmapLoader] Adding candle lights at tower positions`);
    let candleLightCount = 0;

    for (const obj of loadedObjects) {
      // Skip lights and other non-3D objects
      if (obj.isLight) continue;

      // Check if this is a tower structure
      if (obj.userData?.assetType && isTowerStructure(obj.userData.assetType)) {
        // Create candle light
        const candleLight = createCandleLight(renderer.THREE, {
          topWidth: 0.8,
          topDepth: 0.8,
          bottomWidth: 0.5,
          bottomDepth: 0.5,
          height: 1.5,
          color: 0xffbb66,
          emissiveIntensity: 1.2,
          opacity: 0.8
        });

        // Get tower's world position
        const worldPos = new renderer.THREE.Vector3();
        obj.getWorldPosition(worldPos);

        // Position candle at tower location
        candleLight.position.copy(worldPos);

        // Scale up by 1.2x (120%)
        candleLight.scale.set(1.2, 1.2, 1.2);

        // Rotate 90 degrees on Y axis
        candleLight.rotation.y = Math.PI / 2;

        // Add directly to scene (not as child)
        renderer.add(candleLight);
        loadedObjects.push(candleLight);

        // Register with day/night system
        dayNightSystem.registerEmissiveObject(candleLight, {
          nightEmissive: 0xffbb66,
          nightIntensity: 1.2,
          dayEmissive: 0x000000,
          dayIntensity: 0.0
        });

        candleLightCount++;
      }
    }
    console.log(`[visualsmapLoader] ✓ Added ${candleLightCount} candle lights at tower positions`);

    // Store day/night system reference for external control
    if (typeof window !== 'undefined') {
      window.dayNightSystem = dayNightSystem;
      console.log(`[visualsmapLoader] ✓ Day/night system available via window.dayNightSystem`);
      console.log(`[visualsmapLoader]   Usage: window.dayNightSystem.toggle() to switch day/night`);
    }

    return {
      objects: loadedObjects,
      dayNightSystem: dayNightSystem,
      gameplayPathTarget,
      dispose: () => {
        renderer.off('frame', frameUpdateHandler);
        dayNightSystem.dispose();
        loadedObjects.forEach(obj => renderer.remove(obj));
        loadedObjects.length = 0;
      }
    };
  } catch (error) {
    console.error('[visualsmapLoader] Error loading visualsmap:', error);
    return { objects: [], dispose: () => {} };
  }
}
