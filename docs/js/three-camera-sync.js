/**
 * Three.js Camera Synchronization Helper
 *
 * Provides tight runtime coupling between 2D gameplay camera and 3D world camera.
 * Uses coordinate space transformation to ensure consistent movement and positioning.
 *
 * Key improvements:
 * - Proper coordinate transformation from 2D pixels to 3D world units
 * - Consistent movement direction between 2D and 3D
 * - Runtime coupling via coordinate space manager
 */

import { transform2dTo3d, getTransformConfig } from './coordinate-transform.js';

/**
 * Configuration for camera synchronization
 */
export const CAMERA_SYNC_CONFIG = {
  // Camera positioning (relative to transformed 2D position)
  cameraHeight: 30,         // Y position of 3D camera (height above ground)
  cameraDistance: 50,       // Z offset from transformed position (negative = behind)

  // Look-at target offset (where the camera points)
  lookAtOffsetY: 0,         // Y offset for look-at target
  lookAtOffsetZ: 0,         // Z offset for look-at target (forward/back)

  // Parallax effect (0-1, where 1 = camera follows exactly, 0 = no follow)
  parallaxFactor: 1.0,      // How much the 3D camera follows 2D camera

  // Use coordinate transformation (recommended: true)
  useTransform: true,       // Enable proper coordinate space transformation
};

/**
 * Update 3D camera position based on 2D game camera
 *
 * @param {Object} renderer - The 3D renderer instance
 * @param {Object} gameCamera - The 2D game camera object with x, y properties
 * @param {Object} config - Optional configuration overrides
 */
export function syncCameraPosition(renderer, gameCamera, config = {}) {
  if (!renderer || !gameCamera) return;

  // Merge config with defaults
  const cfg = { ...CAMERA_SYNC_CONFIG, ...config };

  // Get 2D camera position
  const cam2dX = gameCamera.x || 0;
  const cam2dY = gameCamera.y || 0;

  // Transform 2D camera position to 3D world position
  let worldPos;
  if (cfg.useTransform) {
    // Use coordinate transformation for proper 2D-to-3D mapping
    const transformCfg = getTransformConfig();
    worldPos = transform2dTo3d({ x: cam2dX, y: cam2dY }, transformCfg);
  } else {
    // Legacy behavior: direct pixel-to-unit mapping with parallax
    worldPos = {
      x: cam2dX * cfg.parallaxFactor,
      y: 0,
      z: 0
    };
  }

  // Apply parallax factor to the transformed position
  const parallaxX = worldPos.x * cfg.parallaxFactor;
  const parallaxZ = worldPos.z * cfg.parallaxFactor;

  // Calculate 3D camera position
  // Position camera at the transformed location, offset by height and distance
  // IMPORTANT: Negate X to fix direction (moving right in 2D = camera right in 3D)
  const camX = -parallaxX;  // Sign flip to match 2D movement direction
  const camY = cfg.cameraHeight;
  const camZ = parallaxZ + cfg.cameraDistance;

  // Calculate look-at target (where the camera should point)
  // Look at the transformed position on the ground plane
  const lookAtX = -parallaxX;  // Also negate lookAt X to match camera
  const lookAtY = cfg.lookAtOffsetY;
  const lookAtZ = parallaxZ + cfg.lookAtOffsetZ;

  // Update renderer camera parameters
  if (typeof renderer.setCameraParams === 'function') {
    renderer.setCameraParams({
      position: { x: camX, y: camY, z: camZ },
      lookAt: { x: lookAtX, y: lookAtY, z: lookAtZ }
    });
  }
}

/**
 * Main sync function - synchronizes 3D camera with 2D game camera
 *
 * @param {Object} options - Sync options
 * @param {Object} options.renderer - The 3D renderer instance
 * @param {Object} options.gameCamera - The 2D game camera
 * @param {Object} options.config - Optional configuration overrides
 */
export function syncCamera(options = {}) {
  const { renderer, gameCamera, config } = options;

  if (!gameCamera) {
    console.warn('[camera-sync] No game camera provided');
    return;
  }

  if (!renderer) {
    console.warn('[camera-sync] No renderer provided');
    return;
  }

  // Always use camera sync (simplified from old Pattern A/B system)
  syncCameraPosition(renderer, gameCamera, config);
}

/**
 * Example usage in game loop:
 *
 * import { syncCamera, CAMERA_SYNC_CONFIG } from './three-camera-sync.js';
 * import { initTransformConfig } from './coordinate-transform.js';
 *
 * // Initialize coordinate transformation (once, when 3D scene loads):
 * initTransformConfig({
 *   camera2d: window.GAME.CAMERA,
 *   scene3d: area.scene3d,
 *   worldRotation: 0 // Set if world is rotated to align with gameplay path
 * });
 *
 * // In your frame/update loop (or renderer 'frame' event):
 * renderer3d.on('frame', () => {
 *   const gameCamera = window.GAME?.CAMERA;
 *   if (gameCamera) {
 *     syncCamera({
 *       renderer: renderer3d,
 *       gameCamera: gameCamera,
 *       config: {
 *         parallaxFactor: 1.0,      // 1.0 = camera follows exactly
 *         cameraHeight: 24,         // Height above ground
 *         cameraDistance: -36,      // Negative = behind the action
 *         useTransform: true        // Enable coordinate transformation
 *       }
 *     });
 *   }
 * });
 */

export default syncCamera;
