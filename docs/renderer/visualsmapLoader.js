/**
 * Visualsmap loader for runtime game
 * Loads grid-based visual maps and converts them to 3D scene objects
 */

import { projectToGroundPlane } from './scene3d.js';

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

  // Resolve relative to gameplaymap location
  const base = gameplayMapUrl.substring(0, gameplayMapUrl.lastIndexOf('/') + 1);
  return base + visualsMapPath;
}

/**
 * Resolve asset path (handles absolute and relative paths, GitHub Pages compatible)
 * Uses the same resolution logic as rendererAdapter.js for consistent behavior
 * @param {string} assetPath - Path from asset config
 * @param {string} [baseContext] - Optional base context (unused, kept for API compatibility)
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

  // Use current page location as base
  const baseUrl = (typeof window !== 'undefined' && window.location.href) ||
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
 * Load asset configuration
 * @param {string} assetType - Type of asset (e.g., "tower", "sidewalk")
 * @returns {Promise<Object>} Asset configuration
 */
async function loadAssetConfig(assetType) {
  const configPath = `config/assets/${assetType}-config.json`;
  const resolvedPath = resolveAssetPath(configPath);

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
function gridToWorld(row, col, rows, cols, cellSize, gameplayPath, alignToPath) {
  // Calculate center of grid
  const gridCenterRow = rows / 2;
  const gridCenterCol = cols / 2;

  // Position relative to grid center
  const relRow = row - gridCenterRow;
  const relCol = col - gridCenterCol;

  if (alignToPath && gameplayPath?.start && gameplayPath?.end) {
    // Gameplay path defines the horizontal axis
    // Calculate path direction
    const pathRow = (gameplayPath.start.row + gameplayPath.end.row) / 2;
    const pathStartCol = gameplayPath.start.col;
    const pathEndCol = gameplayPath.end.col;

    // Offset from path
    const alongPath = (col - pathStartCol) * cellSize;
    const awayFromPath = (pathRow - row) * cellSize; // Negative row offset = positive Z (into screen)

    return {
      x: alongPath,
      y: 0, // Ground level
      z: awayFromPath
    };
  }

  // Default: no path alignment
  // X increases to the right, Z increases away from camera (up on grid)
  return {
    x: relCol * cellSize,
    y: 0,
    z: -relRow * cellSize // Negative because row 0 is at top (back) of scene
  };
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
    const cellSize = 100; // Default cell size in world units
    const loadedObjects = [];
    const assetCache = new Map();
    const gltfCache = new Map();

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

          // Load asset config if not cached
          if (!assetCache.has(cell.type)) {
            const config = await loadAssetConfig(cell.type);
            assetCache.set(cell.type, config);
            
            if (config) {
              console.log(`[visualsmapLoader] ✓ Loaded config for ${cell.type}:`, config.gltfPath || 'no gltfPath');
            } else {
              console.warn(`[visualsmapLoader] ✗ Failed to load config for ${cell.type}`);
            }
          }

          const assetConfig = assetCache.get(cell.type);
          if (!assetConfig) {
            console.warn(`[visualsmapLoader] ✗ No config for asset type: ${cell.type} at (${row},${col})`);
            continue;
          }

          // Resolve GLTF path
          const gltfUrl = resolveAssetPath(assetConfig.gltfPath);
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

            // Calculate world position
            const worldPos = gridToWorld(row, col, rows, cols, cellSize, gameplayPath, alignWorldToPath);

            // DEBUG: Log first few positions to verify grid placement
            if (loadedObjects.length < 5) {
              console.log(`[visualsmapLoader] Position ${loadedObjects.length}: (${row},${col}) → world (${worldPos.x}, ${worldPos.y}, ${worldPos.z})`);
            }

            // Apply base scale
            const baseScale = assetConfig.baseScale || { x: 1, y: 1, z: 1 };
            const instanceScale = {
              x: (cell.scaleX || 1) * baseScale.x,
              y: (cell.scaleY || 1) * baseScale.y,
              z: (cell.scaleZ || 1) * baseScale.z
            };
            object.scale.set(instanceScale.x, instanceScale.y, instanceScale.z);

            // Apply position with offsets
            const yOffset = assetConfig.yOffset || 0;
            const xOffset = (cell.offsetX || 0) * cellSize;
            const zOffset = (cell.offsetY || 0) * cellSize;
            object.position.set(
              worldPos.x + xOffset,
              worldPos.y + yOffset,
              worldPos.z + zOffset
            );

            // Apply rotation
            // Cell orientation is in degrees (0, 90, 180, 270)
            const orientationDeg = cell.orientation ?? assetConfig.instanceDefaults?.orientation ?? 0;
            const orientationRad = (orientationDeg * Math.PI) / 180;
            const rotationX = assetConfig.extra?.rotationX || 0;
            const rotationXRad = (rotationX * Math.PI) / 180;

            object.rotation.x += rotationXRad;
            object.rotation.y += orientationRad;

            // Add to renderer
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

    // Position camera to view the entire grid
    const gridCenterX = (cols / 2) * cellSize;

    // Calculate actual grid center Z based on how gridToWorld positions cells
    let gridCenterZ;
    if (alignWorldToPath && gameplayPath?.start && gameplayPath?.end) {
      const pathRow = (gameplayPath.start.row + gameplayPath.end.row) / 2;
      // Grid spans from row 0 to row (rows-1)
      // Z for row 0: (pathRow - 0) * cellSize
      // Z for row (rows-1): (pathRow - (rows-1)) * cellSize
      const minZ = (pathRow - (rows - 1)) * cellSize;
      const maxZ = (pathRow - 0) * cellSize;
      gridCenterZ = (minZ + maxZ) / 2;
    } else {
      gridCenterZ = 0;
    }

    const gridWidth = cols * cellSize;
    const gridDepth = rows * cellSize;

    // Position camera elevated and back to see the whole scene
    // Much closer view to account for small model scales (0.2-0.25)
    const cameraDistance = Math.max(gridWidth, gridDepth) * 0.25;
    const cameraX = gridCenterX;
    const cameraY = cameraDistance * 0.6;
    const cameraZ = gridCenterZ - cameraDistance * 0.8;

    console.log(`[visualsmapLoader] Setting camera position to view grid:`);
    console.log(`[visualsmapLoader] - Grid center: (${gridCenterX}, 0, ${gridCenterZ})`);
    console.log(`[visualsmapLoader] - Grid size: ${gridWidth} x ${gridDepth}`);
    console.log(`[visualsmapLoader] - Camera position: (${cameraX}, ${cameraY}, ${cameraZ})`);

    renderer.setCameraParams({
      position: { x: cameraX, y: cameraY, z: cameraZ },
      lookAt: { x: gridCenterX, y: 0, z: gridCenterZ }
    });

    // Add lighting to the scene
    console.log(`[visualsmapLoader] Adding scene lighting`);
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
    console.error('[visualsmapLoader] Error loading visualsmap:', error);
    return { objects: [], dispose: () => {} };
  }
}
