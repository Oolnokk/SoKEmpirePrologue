/**
 * BufferGeometryUtils - Three.js v0.160.0
 * https://github.com/mrdoob/three.js/blob/r160/examples/jsm/utils/BufferGeometryUtils.js
 * 
 * TODO: This file needs to be replaced with the actual BufferGeometryUtils.js from Three.js v0.160.0
 * 
 * MAINTAINER INSTRUCTIONS:
 * Due to firewall restrictions, this file could not be automatically downloaded.
 * To complete the offline vendor integration, please manually download and replace this file:
 * 
 * 1. Download from: https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js
 * 2. Save as: docs/vendor/three/BufferGeometryUtils.module.js
 * 3. Verify the imports at the top match the pattern: import { ... } from 'three';
 * 4. Update the import to: import { ... } from './three.module.js';
 * 
 * The file exports several utility functions, most importantly:
 * - toTrianglesDrawMode(geometry, drawMode) - used by GLTFLoader for triangle strips/fans
 * - mergeBufferGeometries(geometries, useGroups)
 * - mergeVertices(geometry, tolerance)
 * 
 * TEMPORARY STUB: This provides minimal functionality to prevent import errors.
 */

import {
  BufferAttribute,
  BufferGeometry,
  InterleavedBufferAttribute,
  TriangleFanDrawMode,
  TriangleStripDrawMode,
  Vector3
} from './three.module.js';

/**
 * @param {BufferGeometry} geometry
 * @param {Number} drawMode
 * @return {BufferGeometry}
 */
export function toTrianglesDrawMode(geometry, drawMode) {
  console.warn('[BufferGeometryUtils] toTrianglesDrawMode stub called - using original geometry');
  console.warn('[BufferGeometryUtils] TODO: Replace this file with actual Three.js v0.160.0 BufferGeometryUtils.js');
  
  // Return the geometry unchanged as a fallback
  // The actual implementation converts triangle strips/fans to regular triangles
  return geometry;
}

/**
 * Stub implementation - merges an array of geometries
 * @param {Array<BufferGeometry>} geometries
 * @param {Boolean} useGroups
 * @return {BufferGeometry}
 */
export function mergeBufferGeometries(geometries, useGroups = false) {
  console.warn('[BufferGeometryUtils] mergeBufferGeometries stub called');
  console.warn('[BufferGeometryUtils] TODO: Replace this file with actual Three.js v0.160.0 BufferGeometryUtils.js');
  
  if (geometries.length === 0) return null;
  if (geometries.length === 1) return geometries[0];
  
  // Return first geometry as fallback
  return geometries[0];
}

/**
 * Stub implementation - merges vertices
 * @param {BufferGeometry} geometry
 * @param {Number} tolerance
 * @return {BufferGeometry}
 */
export function mergeVertices(geometry, tolerance = 1e-4) {
  console.warn('[BufferGeometryUtils] mergeVertices stub called');
  console.warn('[BufferGeometryUtils] TODO: Replace this file with actual Three.js v0.160.0 BufferGeometryUtils.js');
  
  return geometry;
}

// Add a property to indicate this is a stub
export const _isStub = true;
