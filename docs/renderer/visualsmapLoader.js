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
 * Resolve asset path (handles absolute and relative paths)
 * @param {string} assetPath - Path from asset config
 * @returns {string} Resolved path
 */
function resolveAssetPath(assetPath) {
  if (!assetPath) return null;

  // If already absolute URL, return as-is
  if (/^https?:\/\//.test(assetPath)) {
    return assetPath;
  }

  // Use current page location as base
  const baseUrl = (typeof window !== 'undefined' && window.location.href) ||
                  (typeof document !== 'undefined' && document.baseURI) || '';

  if (!baseUrl) return assetPath;

  // Handle paths starting with '/' or '../'
  if (assetPath.startsWith('/')) {
    const relativeUrl = assetPath.substring(1);
    return new URL(relativeUrl, baseUrl).href;
  }

  return new URL(assetPath, baseUrl).href;
}

/**
 * Load asset configuration
 * @param {string} assetType - Type of asset (e.g., "tower", "sidewalk")
 * @returns {Promise<Object>} Asset configuration
 */
async function loadAssetConfig(assetType) {
  const configPath = `config/assets/${assetType}-config.json`;
  const resolvedPath = resolveAssetPath(configPath);

  try {
    const response = await fetch(resolvedPath);
    if (!response.ok) {
      console.warn(`[visualsmapLoader] Failed to load asset config: ${configPath}`);
      return null;
    }
    return await response.json();
  } catch (error) {
    console.warn(`[visualsmapLoader] Error loading asset config ${configPath}:`, error);
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
    console.log('[visualsmapLoader] Loading visualsmap from:', visualsMapUrl);

    const response = await fetch(visualsMapUrl);
    if (!response.ok) {
      console.warn('[visualsmapLoader] Failed to load visualsmap:', visualsMapUrl);
      return { objects: [], dispose: () => {} };
    }

    const visualsMap = await response.json();
    console.log('[visualsmapLoader] Visualsmap loaded:', visualsMap);

    const { rows = 20, cols = 20, layerStates = {}, gameplayPath, alignWorldToPath = false } = visualsMap;
    const cellSize = 100; // Default cell size in world units
    const loadedObjects = [];
    const assetCache = new Map();

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
          }

          const assetConfig = assetCache.get(cell.type);
          if (!assetConfig) {
            console.warn(`[visualsmapLoader] No config for asset type: ${cell.type}`);
            continue;
          }

          // Resolve GLTF path
          const gltfUrl = resolveAssetPath(assetConfig.gltfPath);
          if (!gltfUrl) {
            console.warn(`[visualsmapLoader] No gltfPath for asset: ${cell.type}`);
            continue;
          }

          // Load GLTF
          try {
            const object = await renderer.loadGLTF(gltfUrl);
            if (!object) {
              console.warn(`[visualsmapLoader] Failed to load GLTF: ${gltfUrl}`);
              continue;
            }

            // Calculate world position
            const worldPos = gridToWorld(row, col, rows, cols, cellSize, gameplayPath, alignWorldToPath);

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
            const orientationRad = ((cell.orientation || 0) * Math.PI) / 180;
            const rotationX = assetConfig.extra?.rotationX || 0;
            const rotationXRad = (rotationX * Math.PI) / 180;

            object.rotation.set(rotationXRad, orientationRad, 0);

            // Add to renderer
            renderer.add(object);
            loadedObjects.push(object);

            console.log(`[visualsmapLoader] Placed ${cell.type} at (${row},${col}) -> world(${worldPos.x.toFixed(1)}, ${worldPos.y.toFixed(1)}, ${worldPos.z.toFixed(1)})`);
          } catch (error) {
            console.warn(`[visualsmapLoader] Error loading object at (${row},${col}):`, error);
          }
        }
      }
    }

    console.log(`[visualsmapLoader] Loaded ${loadedObjects.length} objects from visualsmap`);

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
