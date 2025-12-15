/**
 * Shared GLTF Transform Utilities
 * Used by both visualsmapLoader.js and map-editor.html to ensure consistent
 * rotation and transform application across all tools.
 */

/**
 * Apply base rotations to a GLTF object from asset config.
 * CRITICAL: Must be called BEFORE any normalization/scaling to ensure
 * bounding box calculations are done on the rotated model.
 *
 * @param {THREE.Object3D} object - The GLTF scene/group to rotate
 * @param {Object} extraConfig - The asset's extra config (with rotationX/Y/Z in degrees)
 * @param {boolean} debug - Whether to log debug info
 * @returns {Object} - The rotation values that were applied (in degrees)
 */
export function applyBaseRotations(object, extraConfig = {}, debug = false) {
  const baseRotationX = extraConfig.rotationX || 0;
  const baseRotationY = extraConfig.rotationY || 0;
  const baseRotationZ = extraConfig.rotationZ || 0;

  if (debug && (baseRotationX !== 0 || baseRotationY !== 0 || baseRotationZ !== 0)) {
    console.log('[gltfTransforms] Applying rotations:', {
      x: baseRotationX,
      y: baseRotationY,
      z: baseRotationZ
    });
  }

  // Apply rotations using absolute setters (not additive methods like rotateX)
  // to avoid compounding with any rotations baked into the GLTF hierarchy.
  // Use 'XYZ' rotation order for consistency.
  object.rotation.set(
    (baseRotationX * Math.PI) / 180,
    (baseRotationY * Math.PI) / 180,
    (baseRotationZ * Math.PI) / 180,
    'XYZ'
  );

  return { x: baseRotationX, y: baseRotationY, z: baseRotationZ };
}

/**
 * Apply base rotations from asset config, supporting both 'extra' and 'extraConfig' properties.
 * This is a convenience wrapper around applyBaseRotations that handles both naming conventions.
 *
 * @param {THREE.Object3D} object - The GLTF scene/group to rotate
 * @param {Object} assetConfig - The full asset config object
 * @param {boolean} debug - Whether to log debug info
 * @returns {Object} - The rotation values that were applied (in degrees)
 */
export function applyAssetRotations(object, assetConfig, debug = false) {
  const extraConfig = assetConfig.extra || assetConfig.extraConfig || {};
  return applyBaseRotations(object, extraConfig, debug);
}

/**
 * Get rotation values from asset config without applying them.
 * Useful for checking what rotations will be applied.
 *
 * @param {Object} assetConfig - The asset config object
 * @returns {Object} - The rotation values (in degrees)
 */
export function getAssetRotations(assetConfig) {
  const extraConfig = assetConfig.extra || assetConfig.extraConfig || {};
  return {
    x: extraConfig.rotationX || 0,
    y: extraConfig.rotationY || 0,
    z: extraConfig.rotationZ || 0
  };
}
