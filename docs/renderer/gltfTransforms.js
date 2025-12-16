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
 * Apply base scale to a GLTF object from extraConfig.
 * This is a pre-normalization scale that affects the model before bounding box calculation.
 *
 * @param {THREE.Object3D} object - The GLTF scene/group to scale
 * @param {Object} extraConfig - The asset's extra config (with scaleX/Y/Z)
 * @param {boolean} debug - Whether to log debug info
 * @returns {Object} - The scale values that were applied
 */
export function applyBaseScale(object, extraConfig = {}, debug = false) {
  const scaleX = extraConfig.scaleX || 1;
  const scaleY = extraConfig.scaleY || 1;
  const scaleZ = extraConfig.scaleZ || 1;

  if (debug && (scaleX !== 1 || scaleY !== 1 || scaleZ !== 1)) {
    console.log('[gltfTransforms] Applying scale:', {
      x: scaleX,
      y: scaleY,
      z: scaleZ
    });
  }

  object.scale.set(scaleX, scaleY, scaleZ);

  return { x: scaleX, y: scaleY, z: scaleZ };
}

/**
 * Apply base position offset to a GLTF object from extraConfig.
 * This is a pre-normalization offset applied to the GLTF root.
 *
 * @param {THREE.Object3D} object - The GLTF scene/group to offset
 * @param {Object} extraConfig - The asset's extra config (with offsetX/Y/Z)
 * @param {boolean} debug - Whether to log debug info
 * @returns {Object} - The offset values that were applied
 */
export function applyBaseOffset(object, extraConfig = {}, debug = false) {
  const offsetX = extraConfig.offsetX || 0;
  const offsetY = extraConfig.offsetY || 0;
  const offsetZ = extraConfig.offsetZ || 0;

  if (debug && (offsetX !== 0 || offsetY !== 0 || offsetZ !== 0)) {
    console.log('[gltfTransforms] Applying offset:', {
      x: offsetX,
      y: offsetY,
      z: offsetZ
    });
  }

  object.position.set(offsetX, offsetY, offsetZ);

  return { x: offsetX, y: offsetY, z: offsetZ };
}

/**
 * Apply all transforms from asset config (rotation, scale, offset).
 * CRITICAL: Must be called BEFORE normalization to ensure correct bounding box.
 * Supports both 'extra' and 'extraConfig' property naming.
 *
 * @param {THREE.Object3D} object - The GLTF scene/group to transform
 * @param {Object} assetConfig - The full asset config object
 * @param {boolean} debug - Whether to log debug info
 * @returns {Object} - Object containing all applied transforms
 */
export function applyAssetTransforms(object, assetConfig, debug = false) {
  const extraConfig = assetConfig.extra || assetConfig.extraConfig || {};

  // Apply in order: scale -> rotation -> offset
  // This order ensures the rotation is about the scaled geometry's center
  const scale = applyBaseScale(object, extraConfig, debug);
  const rotation = applyBaseRotations(object, extraConfig, debug);
  const offset = applyBaseOffset(object, extraConfig, debug);

  return { rotation, scale, offset };
}

/**
 * Apply base rotations from asset config, supporting both 'extra' and 'extraConfig' properties.
 * This is a convenience wrapper around applyBaseRotations that handles both naming conventions.
 *
 * @deprecated Use applyAssetTransforms for complete transform support
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
