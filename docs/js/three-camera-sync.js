/**
 * Three.js Camera Synchronization Helper
 * 
 * Provides patterns for synchronizing a 3D camera with a 2D side-scrolling game camera.
 * Supports two patterns:
 *   Pattern A: Move the 3D camera position based on game camera (parallax effect)
 *   Pattern B: Move 3D objects/root group while keeping camera fixed
 * 
 * Default: Pattern A (recommended for side-scrolling backgrounds)
 */

/**
 * Configuration for camera synchronization
 */
export const CAMERA_SYNC_CONFIG = {
  // Which pattern to use: 'moveCamera' (A) or 'moveObjects' (B)
  pattern: 'moveCamera',
  
  // Pattern A settings - parallax factors for camera movement
  parallaxFactor: 0.5,  // How much the 3D camera follows horizontal movement (0-1)
  verticalParallax: 0.3, // Vertical parallax factor (if game has vertical camera)
  
  // Camera positioning
  cameraHeight: 30,     // Y position of 3D camera (height above ground)
  cameraDistance: 50,   // Z distance from scene origin
  
  // Look-at target offset (where the camera points)
  lookAtOffsetY: 0,     // Y offset for look-at target
  
  // Pattern B settings - object movement factors
  objectMoveFactor: -0.5, // Inverse parallax for moving objects
};

/**
 * Update 3D camera position based on 2D game camera (Pattern A)
 * 
 * @param {Object} renderer - The 3D renderer instance
 * @param {Object} gameCamera - The 2D game camera object with x, y properties
 * @param {Object} config - Optional configuration overrides
 */
export function syncCameraPosition(renderer, gameCamera, config = {}) {
  if (!renderer || !gameCamera) return;
  
  // Merge config with defaults
  const cfg = { ...CAMERA_SYNC_CONFIG, ...config };
  
  // Calculate 3D camera position based on game camera
  const camX = (gameCamera.x || 0) * cfg.parallaxFactor;
  const camY = cfg.cameraHeight;
  const camZ = cfg.cameraDistance;
  
  // Calculate look-at target (point camera slightly ahead in scroll direction)
  const lookAtX = camX;
  const lookAtY = cfg.lookAtOffsetY;
  const lookAtZ = 0;
  
  // Update renderer camera parameters
  if (typeof renderer.setCameraParams === 'function') {
    renderer.setCameraParams({
      position: { x: camX, y: camY, z: camZ },
      lookAt: { x: lookAtX, y: lookAtY, z: lookAtZ }
    });
  }
}

/**
 * Update 3D scene objects position based on 2D game camera (Pattern B)
 * 
 * @param {Object} worldRoot - The root group/object containing all 3D scene objects
 * @param {Object} gameCamera - The 2D game camera object with x, y properties
 * @param {Object} config - Optional configuration overrides
 */
export function syncObjectPosition(worldRoot, gameCamera, config = {}) {
  if (!worldRoot || !gameCamera) return;
  
  // Merge config with defaults
  const cfg = { ...CAMERA_SYNC_CONFIG, ...config };
  
  // Move world root in opposite direction (inverse parallax)
  worldRoot.position.x = (gameCamera.x || 0) * cfg.objectMoveFactor;
  
  // Vertical movement if game camera has Y component
  if (gameCamera.y !== undefined) {
    worldRoot.position.z = (gameCamera.y || 0) * cfg.objectMoveFactor;
  }
}

/**
 * Main sync function that dispatches to appropriate pattern
 * 
 * @param {Object} options - Sync options
 * @param {Object} options.renderer - The 3D renderer instance (Pattern A)
 * @param {Object} options.worldRoot - The root scene object (Pattern B)
 * @param {Object} options.gameCamera - The 2D game camera
 * @param {Object} options.config - Optional configuration overrides
 */
export function syncCamera(options = {}) {
  const { renderer, worldRoot, gameCamera, config } = options;
  const cfg = { ...CAMERA_SYNC_CONFIG, ...config };
  
  if (!gameCamera) {
    console.warn('[camera-sync] No game camera provided');
    return;
  }
  
  if (cfg.pattern === 'moveCamera') {
    // Pattern A: Move the camera
    syncCameraPosition(renderer, gameCamera, cfg);
  } else if (cfg.pattern === 'moveObjects') {
    // Pattern B: Move the objects
    syncObjectPosition(worldRoot, gameCamera, cfg);
  } else {
    console.warn('[camera-sync] Unknown pattern:', cfg.pattern);
  }
}

/**
 * Example usage in game loop:
 * 
 * import { syncCamera } from './three-camera-sync.js';
 * 
 * // In your frame/update loop:
 * function updateFrame() {
 *   const gameCamera = window.GAME?.CAMERA;
 *   const renderer3d = window.GAME?.renderer3d;
 *   
 *   if (gameCamera && renderer3d) {
 *     syncCamera({
 *       renderer: renderer3d,
 *       gameCamera: gameCamera,
 *       config: {
 *         parallaxFactor: 0.5,  // Adjust for desired parallax effect
 *         cameraHeight: 30,
 *         cameraDistance: 50
 *       }
 *     });
 *   }
 * }
 * 
 * // Or integrate with renderer frame event:
 * renderer3d.on('frame', () => {
 *   syncCamera({
 *     renderer: renderer3d,
 *     gameCamera: window.GAME.CAMERA
 *   });
 * });
 */

export default syncCamera;
