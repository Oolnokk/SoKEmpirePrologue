/**
 * Visualsmap loader for runtime game
 * Loads grid-based visual maps and converts them to 3D scene objects
 */

import { projectToGroundPlane } from './scene3d.js';

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
 * Performance-optimized logger that only logs in development mode
 * This prevents console overhead in production
 */
const devLog = (() => {
  const isDev = isDevelopmentMode();
  return {
    log: isDev ? console.log.bind(console) : () => {},
    warn: console.warn.bind(console), // Always show warnings
    error: console.error.bind(console) // Always show errors
  };
})();

/**
 * Clear the visualsmap index cache. Useful for development or when
 * index.json is updated and needs to be reloaded.
 * @public
 */
export function clearVisualsmapCache() {
  VISUALSMAP_INDEX_CACHE.loaded = false;
  VISUALSMAP_INDEX_CACHE.assets = null;
  VISUALSMAP_INDEX_CACHE.baseUrl = null;
  devLog.log('[visualsmapLoader] ✓ Cache cleared');
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
    devLog.warn('[visualsmapLoader] Could not resolve visualsMapPath, returning original:', visualsMapPath, err);
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
    devLog.warn('[visualsmapLoader] Cannot resolve asset path: no baseURI available, returning original:', assetPath);
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
  
  devLog.log(`[visualsmapLoader] Resolved asset path: "${assetPath}" → "${resolvedPath}"`);
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
    devLog.warn('[visualsmapLoader] Failed to derive docs base from', refUrl, err);
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
    devLog.warn('[visualsmapLoader] Failed to derive config base from', refUrl, err);
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
    devLog.log('[visualsmapLoader] ↻ Using cached visualsmap index');
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
    devLog.warn('[visualsmapLoader] ✗ Could not resolve visualsmap index path');
    return null;
  }

  devLog.log(`[visualsmapLoader] Loading visualsmap index: ${resolvedPath}`);

  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) {
      devLog.warn(`[visualsmapLoader] ✗ Failed to load visualsmap index (${response.status} ${response.statusText})`);
      return null;
    }

    const indexJson = await response.json();
    const baseUrl = new URL('./', resolvedPath).href;
    const assetMap = new Map();

    // Optimized: Use for...of loop instead of nested forEach for better performance
    // This avoids creating multiple function contexts and allows early exit if needed
    const sections = ['segments', 'structures', 'decorations'];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const list = indexJson?.[section];
      if (!Array.isArray(list)) continue;
      
      for (let j = 0; j < list.length; j++) {
        const asset = list[j];
        if (!asset?.id) continue;
        // Preserve original object shape while tagging the source base
        assetMap.set(asset.id, { ...asset, __visualsmapIndexBase: baseUrl });
      }
    }

    VISUALSMAP_INDEX_CACHE.loaded = true;
    VISUALSMAP_INDEX_CACHE.assets = assetMap;
    VISUALSMAP_INDEX_CACHE.baseUrl = baseUrl;

    devLog.log(`[visualsmapLoader] ✓ Loaded visualsmap index with ${assetMap.size} assets`);

    return { assets: assetMap, baseUrl };
  } catch (error) {
    devLog.warn('[visualsmapLoader] ✗ Error loading visualsmap index:', error);
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

  devLog.log(`[visualsmapLoader] Loading asset config for "${assetType}": ${resolvedPath}`);
  
  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) {
      devLog.warn(`[visualsmapLoader] ✗ Failed to load asset config: ${configPath} (${response.status} ${response.statusText})`);
      return null;
    }
    const config = await response.json();
    devLog.log(`[visualsmapLoader] ✓ Loaded asset config for "${assetType}":`, config);
    return config;
  } catch (error) {
    devLog.warn(`[visualsmapLoader] ✗ Error loading asset config ${configPath}:`, error);
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
 * Load and place objects from visualsmap
 * @param {Object} renderer - The renderer instance
 * @param {Object} area - Area configuration with visualsMap path
 * @param {string} gameplayMapUrl - URL of the gameplaymap.json
 * @returns {Promise<Object>} { objects: Array, dispose: Function }
 */
export async function loadVisualsMap(renderer, area, gameplayMapUrl) {
  if (!area?.visualsMap) {
    devLog.log('[visualsmapLoader] No visualsMap in area config');
    return { objects: [], dispose: () => {} };
  }

  try {
    // Resolve and load visualsmap
    const visualsMapUrl = resolveVisualsMapPath(area.visualsMap, gameplayMapUrl);
    devLog.log('[visualsmapLoader] ========================================');
    devLog.log('[visualsmapLoader] Starting visualsmap load for area:', area.id);
    devLog.log('[visualsmapLoader] - Gameplay map URL:', gameplayMapUrl);
    devLog.log('[visualsmapLoader] - Visualsmap path:', area.visualsMap);
    devLog.log('[visualsmapLoader] - Resolved URL:', visualsMapUrl);

    const response = await fetch(visualsMapUrl);
    if (!response.ok) {
      devLog.warn(`[visualsmapLoader] ✗ Failed to load visualsmap: ${visualsMapUrl} (${response.status} ${response.statusText})`);
      return { objects: [], dispose: () => {} };
    }

    const visualsMap = await response.json();
    devLog.log('[visualsmapLoader] ✓ Visualsmap JSON loaded successfully');
    devLog.log('[visualsmapLoader] - Grid size:', visualsMap.rows, 'x', visualsMap.cols);
    devLog.log('[visualsmapLoader] - Layers:', Object.keys(visualsMap.layerStates || {}));

    const { rows = 20, cols = 20, layerStates = {}, gameplayPath, alignWorldToPath = false } = visualsMap;
    const visualsMapBase = visualsMapUrl ? new URL('./', visualsMapUrl).href : '';
    const docsBase = deriveDocsBase(visualsMapUrl) || deriveDocsBase(gameplayMapUrl) || null;
    const configBase = deriveConfigBase(visualsMapUrl) || deriveConfigBase(gameplayMapUrl) || visualsMapBase || null;

    // Prefer inline asset definitions from visualsmap JSON when available
    // Optimized: Use for loops instead of nested forEach for better performance
    const inlineAssetMap = new Map();
    const sections = ['segments', 'structures', 'decorations'];
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const list = visualsMap.assets?.[section];
      if (Array.isArray(list)) {
        for (let j = 0; j < list.length; j++) {
          const asset = list[j];
          if (asset?.id) inlineAssetMap.set(asset.id, asset);
        }
      }
    }
    const usingInlineAssets = inlineAssetMap.size > 0;
    if (usingInlineAssets) {
      devLog.log('[visualsmapLoader] Using inline asset definitions from visualsmap JSON');
    }

    // Load visualsmap index when inline assets are unavailable so runtime
    // placements match editor defaults (orientation, rotations, scales).
    let visualsmapIndexAssets = null;
    if (!usingInlineAssets) {
      const indexResult = await loadVisualsmapIndex(docsBase || visualsMapBase || null);
      visualsmapIndexAssets = indexResult?.assets || null;
      if (visualsmapIndexAssets?.size) {
        devLog.log(`[visualsmapLoader] Using visualsmap index assets (count: ${visualsmapIndexAssets.size})`);
      }
    }

    // Use the global grid unit world size configuration (default 30)
    const cellSize = (typeof window !== 'undefined' && window.GRID_UNIT_WORLD_SIZE) || 30;
    devLog.log(`[visualsmapLoader] Using cellSize: ${cellSize} (from GRID_UNIT_WORLD_SIZE)`);
    const loadedObjects = [];
    const assetCache = new Map();
    const gltfCache = new Map();

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
      devLog.log(`[visualsmapLoader] Path yaw (deg): ${((pathYawRad * 180) / Math.PI).toFixed(2)}`);
    }

    // Process layers in order: ground, structure, decoration
    const layerOrder = ['ground', 'structure', 'decoration'];

    for (const layerName of layerOrder) {
      const layer = layerStates[layerName];
      if (!layer || !Array.isArray(layer)) continue;

      devLog.log(`[visualsmapLoader] Processing layer: ${layerName}`);

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
              devLog.log(`[visualsmapLoader] ✓ Using inline asset config for ${cell.type}`);
            } else if (indexConfig) {
              assetCache.set(cell.type, indexConfig);
              devLog.log(`[visualsmapLoader] ✓ Using visualsmap index config for ${cell.type}`);
            } else {
                const config = await loadAssetConfig(cell.type, configBase);
              assetCache.set(cell.type, config);

              if (config) {
                devLog.log(`[visualsmapLoader] ✓ Loaded config for ${cell.type}:`, config.gltfPath || 'no gltfPath');
              } else {
                devLog.warn(`[visualsmapLoader] ✗ Failed to load config for ${cell.type}`);
              }
            }
          }

          const assetConfig = assetCache.get(cell.type);
          if (!assetConfig) {
            devLog.warn(`[visualsmapLoader] ✗ No config for asset type: ${cell.type} at (${row},${col})`);
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
            devLog.warn(`[visualsmapLoader] ✗ No gltfPath for asset: ${cell.type} at (${row},${col})`);
            devLog.warn(`[visualsmapLoader]   Asset config:`, assetConfig);
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
              devLog.warn(`[visualsmapLoader] ✗ Failed to load GLTF: ${gltfUrl}`);
              continue;
            }

            // Validate that baseObject has geometry
            let meshCount = 0;
            baseObject.traverse((child) => {
              if (child.isMesh) meshCount++;
            });
            
            if (meshCount === 0) {
              devLog.warn(`[visualsmapLoader] ⚠ GLTF has no meshes: ${gltfUrl}`);
            }

            // Clone the loaded GLTF so every cell keeps its own transform
            const object = baseObject.clone(true);
            object.traverse((child) => {
              if (child.isMesh && child.material && typeof child.material.clone === 'function') {
                child.material = child.material.clone();
              }
            });
            if (!object) {
              devLog.warn(`[visualsmapLoader] ✗ Failed to clone GLTF: ${gltfUrl}`);
              continue;
            }

            // Get base rotations from asset config (these set the model's "zero" orientation)
            const extraConfig = assetConfig.extra || assetConfig.extraConfig || {};
            const baseRotationX = extraConfig.rotationX || 0;
            const baseRotationY = extraConfig.rotationY || 0;
            const baseRotationZ = extraConfig.rotationZ || 0;

            // Apply base rotations first (model initialization - sets coordinate system)
            // These rotations define the model's "zero" orientation in object space
            if (baseRotationX !== 0) {
              object.rotateX((baseRotationX * Math.PI) / 180);
            }
            if (baseRotationY !== 0) {
              object.rotateY((baseRotationY * Math.PI) / 180);
            }
            if (baseRotationZ !== 0) {
              object.rotateZ((baseRotationZ * Math.PI) / 180);
            }

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
            const finalOrientationRad = ((orientationDeg * Math.PI) / 180) - pathAdjustment;
            if (finalOrientationRad !== 0) {
              object.rotateY(finalOrientationRad);
            }

            // Add object to renderer
            renderer.add(object);
            loadedObjects.push(object);

            // Log only first few placements per layer to avoid spam, then summary
            const LOG_SAMPLE_INTERVAL = 20; // Log every Nth placement to reduce console spam
            const isFirstInLayer = loadedObjects.length % LOG_SAMPLE_INTERVAL === 1;
            if (isFirstInLayer || loadedObjects.length <= 5) {
              devLog.log(`[visualsmapLoader]   Placed ${cell.type} at grid(${row},${col}) -> world(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
            }
          } catch (error) {
            devLog.warn(`[visualsmapLoader] ✗ Error loading object at (${row},${col}):`, error);
          }
        }
      }
    }

    devLog.log('[visualsmapLoader] ========================================');
    devLog.log(`[visualsmapLoader] ✓ VISUALSMAP LOAD COMPLETE`);
    devLog.log(`[visualsmapLoader] - Total objects placed: ${loadedObjects.length}`);
    
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
    
    devLog.log(`[visualsmapLoader] - Grid cells by layer:`, byLayer);
    devLog.log(`[visualsmapLoader] - Unique asset types loaded:`, assetCache.size);
    devLog.log(`[visualsmapLoader] - Unique GLTF files cached:`, gltfCache.size);
    devLog.log(`[visualsmapLoader] - Renderer scene.children count:`, renderer.scene?.children?.length || 0);
    devLog.log('[visualsmapLoader] ========================================');

    // Position camera aligned with gameplay path for side-scrolling view
    const gridCenterX = 0;
    const gridCenterZ = 0;

    const gridWidth = (cols - 1) * cellSize;
    const gridDepth = (rows - 1) * cellSize;

    // For side-scrolling gameplay aligned to path:
    // - When alignWorldToPath is true, the path is rotated to align with +X axis
    // - Camera should be positioned to the side (negative Z) looking at the path
    // - This creates a side view where the path runs left-to-right across the screen
    let cameraX, cameraY, cameraZ, lookAtX, lookAtY, lookAtZ;

    if (alignWorldToPath && gameplayPath?.start && gameplayPath?.end) {
      // Side-scrolling camera aligned with gameplay path
      // Position camera to the side of the path (negative Z = south)
      cameraX = gridCenterX; // Center on the path horizontally
      cameraY = cellSize * 0.8; // Height to see the ground plane and structures
      cameraZ = -cellSize * 1.2; // Distance from path (negative Z = viewer side)

      // Look at the center of the path
      lookAtX = gridCenterX;
      lookAtY = cellSize * 0.3; // Look slightly above ground level
      lookAtZ = gridCenterZ;

      devLog.log(`[visualsmapLoader] Setting side-scrolling camera aligned with gameplay path:`);
      devLog.log(`[visualsmapLoader] - Path aligned to +X axis (left-to-right)`);
      devLog.log(`[visualsmapLoader] - Camera viewing from side (negative Z)`);
    } else {
      // Fallback: top-down view of entire grid
      const cameraDistance = Math.max(gridWidth, gridDepth) * 0.3;
      cameraX = gridCenterX;
      cameraY = cameraDistance * 1.5;
      cameraZ = gridCenterZ - cameraDistance;
      lookAtX = gridCenterX;
      lookAtY = 0;
      lookAtZ = gridCenterZ;

      devLog.log(`[visualsmapLoader] Setting top-down camera to view entire grid:`);
    }

    devLog.log(`[visualsmapLoader] - Grid center: (${gridCenterX}, 0, ${gridCenterZ})`);
    devLog.log(`[visualsmapLoader] - Grid size: ${gridWidth} x ${gridDepth}, cellSize: ${cellSize}`);
    devLog.log(`[visualsmapLoader] - Camera position: (${cameraX.toFixed(1)}, ${cameraY.toFixed(1)}, ${cameraZ.toFixed(1)})`);
    devLog.log(`[visualsmapLoader] - Camera look-at: (${lookAtX.toFixed(1)}, ${lookAtY.toFixed(1)}, ${lookAtZ.toFixed(1)})`);

    renderer.setCameraParams({
      position: { x: cameraX, y: cameraY, z: cameraZ },
      lookAt: { x: lookAtX, y: lookAtY, z: lookAtZ }
    });

    // Verify camera was set correctly
    if (renderer.camera) {
      devLog.log(`[visualsmapLoader] ✓ Camera actual position after set:`, renderer.camera.position);
      devLog.log(`[visualsmapLoader] ✓ Camera type:`, renderer.camera.type);
    }

    // Add lighting to the scene
    devLog.log(`[visualsmapLoader] Adding scene lighting`);
    const ambientLight = new renderer.THREE.AmbientLight(0xffffff, 0.6);
    renderer.add(ambientLight);
    loadedObjects.push(ambientLight); // Track for disposal

    const directionalLight = new renderer.THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(gridCenterX + 500, 1000, gridCenterZ - 500);
    directionalLight.target.position.set(gridCenterX, 0, gridCenterZ);
    renderer.add(directionalLight);
    renderer.add(directionalLight.target);
    loadedObjects.push(directionalLight, directionalLight.target); // Track for disposal

    return {
      objects: loadedObjects,
      dispose: () => {
        loadedObjects.forEach(obj => renderer.remove(obj));
        loadedObjects.length = 0;
      }
    };
  } catch (error) {
    devLog.error('[visualsmapLoader] Error loading visualsmap:', error);
    return { objects: [], dispose: () => {} };
  }
}
