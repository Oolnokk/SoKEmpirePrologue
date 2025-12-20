/**
 * Coordinate Space Transformation
 *
 * Provides runtime coupling between 2D gameplay coordinates and 3D world coordinates.
 * This ensures predictable, consistent movement and positioning across both rendering systems.
 *
 * Coordinate Systems:
 * - 2D Gameplay: Grid-unit coordinates (e.g., 0-1600 grid units wide)
 *   - Origin: Top-left of game world
 *   - X-axis: Right is positive
 *   - Y-axis: Down is positive (standard 2D canvas)
 *
 * - 3D World: Three.js units (typically grid-based with cellSize=30)
 *   - Origin: Center of the world (0, 0, 0)
 *   - X-axis: Right is positive
 *   - Y-axis: Up is positive (3D up)
 *   - Z-axis: Forward is negative (camera looks along -Z)
 */

/**
 * Configuration for coordinate space transformation
 */
export const TRANSFORM_CONFIG = {
  // Scale factor from 2D gameplay grid units to 3D world units
  // Default: 1 grid unit = 1 Three.js unit (grid-perfect mapping)
  pixelsToUnits: 1.0,

  // 2D world dimensions in grid units (for centering calculations)
  world2dWidth: 1600,
  world2dHeight: 600,

  // Whether to center the 2D world at 3D origin (true) or align origins (false)
  centerAt3dOrigin: true,

  // World rotation in radians (for path alignment)
  worldRotationY: 0,
};

/**
 * Transform a 2D gameplay position to 3D world position
 *
 * @param {Object} pos2d - 2D position {x, y}
 * @param {Object} config - Optional configuration overrides
 * @returns {Object} 3D position {x, y, z}
 */
export function transform2dTo3d(pos2d, config = {}) {
  if (!pos2d || typeof pos2d !== 'object') {
    return { x: 0, y: 0, z: 0 };
  }

  // Merge with defaults, but use runtime camera dimensions if available
  const gameCamera = (typeof window !== 'undefined') ? window.GAME?.CAMERA : null;
  const runtimeWidth = gameCamera?.worldWidth;
  const runtimeHeight = gameCamera?.worldHeight;

  const cfg = {
    ...TRANSFORM_CONFIG,
    // Override with runtime dimensions if available and not explicitly overridden
    ...(runtimeWidth && !config.world2dWidth ? { world2dWidth: runtimeWidth } : {}),
    ...(runtimeHeight && !config.world2dHeight ? { world2dHeight: runtimeHeight } : {}),
    ...config
  };

  // Get 2D position
  const x2d = typeof pos2d.x === 'number' ? pos2d.x : 0;
  const y2d = typeof pos2d.y === 'number' ? pos2d.y : 0;

  // Scale from grid units to 3D units
  // IMPORTANT: Invert X for correct side-scrolling direction
  // (moving right in 2D should make 3D world scroll left)
  let x3d = x2d * cfg.pixelsToUnits * -1;  // Negative scale for inversion
  let z3d = y2d * cfg.pixelsToUnits;

  // Center at 3D origin if configured
  if (cfg.centerAt3dOrigin) {
    const centerOffsetX = (cfg.world2dWidth * cfg.pixelsToUnits) / 2;
    const centerOffsetZ = (cfg.world2dHeight * cfg.pixelsToUnits) / 2;
    x3d += centerOffsetX;  // Add instead of subtract due to negation
    z3d -= centerOffsetZ;
  }

  // Apply world rotation if needed
  if (cfg.worldRotationY !== 0) {
    const cos = Math.cos(cfg.worldRotationY);
    const sin = Math.sin(cfg.worldRotationY);
    const rotatedX = x3d * cos - z3d * sin;
    const rotatedZ = x3d * sin + z3d * cos;
    x3d = rotatedX;
    z3d = rotatedZ;
  }

  // Optional debug logging (enable with window.DEBUG_COORDINATE_TRANSFORM = true)
  if (typeof window !== 'undefined' && window.DEBUG_COORDINATE_TRANSFORM) {
    console.log('[coordinate-transform]', {
      input: { x: x2d, y: y2d },
      config: { worldWidth: cfg.world2dWidth, worldHeight: cfg.world2dHeight, pixelsToUnits: cfg.pixelsToUnits },
      centerOffset: cfg.centerAt3dOrigin ? (cfg.world2dWidth * cfg.pixelsToUnits) / 2 : 0,
      output: { x: x3d, z: z3d }
    });
  }

  return {
    x: x3d,
    y: 0, // 2D gameplay is flat, so Y is always at ground level
    z: z3d
  };
}

/**
 * Transform a 3D world position to 2D gameplay position
 * (Inverse transformation for debugging/mapping)
 *
 * @param {Object} pos3d - 3D position {x, y, z}
 * @param {Object} config - Optional configuration overrides
 * @returns {Object} 2D position {x, y}
 */
export function transform3dTo2d(pos3d, config = {}) {
  if (!pos3d || typeof pos3d !== 'object') {
    return { x: 0, y: 0 };
  }

  // Merge with defaults
  const cfg = { ...TRANSFORM_CONFIG, ...config };

  let x3d = typeof pos3d.x === 'number' ? pos3d.x : 0;
  let z3d = typeof pos3d.z === 'number' ? pos3d.z : 0;

  // Reverse world rotation if needed
  if (cfg.worldRotationY !== 0) {
    const cos = Math.cos(-cfg.worldRotationY);
    const sin = Math.sin(-cfg.worldRotationY);
    const rotatedX = x3d * cos - z3d * sin;
    const rotatedZ = x3d * sin + z3d * cos;
    x3d = rotatedX;
    z3d = rotatedZ;
  }

  // Reverse centering if configured
  if (cfg.centerAt3dOrigin) {
    const centerOffsetX = (cfg.world2dWidth * cfg.pixelsToUnits) / 2;
    const centerOffsetZ = (cfg.world2dHeight * cfg.pixelsToUnits) / 2;
    x3d += centerOffsetX;
    z3d += centerOffsetZ;
  }

  // Scale from 3D units back to grid units
  const x2d = x3d / cfg.pixelsToUnits;
  const y2d = z3d / cfg.pixelsToUnits;

  return { x: x2d, y: y2d };
}

/**
 * Initialize transform config from game state
 * Call this once when the 3D scene is loaded to sync with actual world dimensions
 *
 * @param {Object} options - Initialization options
 * @param {Object} options.camera2d - 2D camera object with worldWidth/worldHeight
 * @param {Object} options.scene3d - 3D scene config with ground.unitsPerPixel
 * @param {number} options.worldRotation - World rotation in radians (from visualsmap)
 * @returns {Object} Updated transform config
 */
export function initTransformConfig(options = {}) {
  const { camera2d, scene3d, worldRotation } = options;

  // Update from 2D camera dimensions
  if (camera2d) {
    if (typeof camera2d.worldWidth === 'number') {
      TRANSFORM_CONFIG.world2dWidth = camera2d.worldWidth;
    }
    if (typeof camera2d.worldHeight === 'number') {
      TRANSFORM_CONFIG.world2dHeight = camera2d.worldHeight;
    }
  }

  // Update from 3D scene config
  if (scene3d?.ground?.unitsPerPixel) {
    TRANSFORM_CONFIG.pixelsToUnits = scene3d.ground.unitsPerPixel;
  }

  // Update world rotation
  if (typeof worldRotation === 'number') {
    TRANSFORM_CONFIG.worldRotationY = worldRotation;
  }

  console.log('[coordinate-transform] Transform config initialized:', TRANSFORM_CONFIG);

  return { ...TRANSFORM_CONFIG };
}

/**
 * Get current transform configuration (with runtime dimensions if available)
 *
 * @returns {Object} Current transform config
 */
export function getTransformConfig() {
  // Always pull runtime dimensions from camera if available
  const gameCamera = (typeof window !== 'undefined') ? window.GAME?.CAMERA : null;
  const runtimeWidth = gameCamera?.worldWidth;
  const runtimeHeight = gameCamera?.worldHeight;

  return {
    ...TRANSFORM_CONFIG,
    // Override with runtime dimensions if available
    ...(runtimeWidth ? { world2dWidth: runtimeWidth } : {}),
    ...(runtimeHeight ? { world2dHeight: runtimeHeight } : {})
  };
}

/**
 * Update transform configuration at runtime
 *
 * @param {Object} updates - Configuration updates
 */
export function updateTransformConfig(updates = {}) {
  Object.assign(TRANSFORM_CONFIG, updates);
  console.log('[coordinate-transform] Transform config updated:', TRANSFORM_CONFIG);
}
