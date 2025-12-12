/**
 * BufferGeometryUtils - UMD/Classic Wrapper for Three.js v0.160.0
 * 
 * This file provides backward compatibility by dynamically importing the ES module
 * and exposing it to the global THREE.BufferGeometryUtils object.
 * 
 * For modern ES6 imports, use BufferGeometryUtils.module.js directly.
 * 
 * TODO: This is a wrapper around a stub file. See BufferGeometryUtils.module.js for replacement instructions.
 */

// Check if THREE is available globally
if (typeof THREE === 'undefined' && typeof globalThis.THREE === 'undefined') {
  console.warn('BufferGeometryUtils.js: THREE not found in global scope. Load three.js first.');
} else {
  // Use globalThis.THREE if available (more reliable)
  const THREEJS = typeof THREE !== 'undefined' ? THREE : globalThis.THREE;
  
  // Import the ES module version and expose it globally
  import('./BufferGeometryUtils.module.js')
    .then(function(module) {
      if (module) {
        // Attach all exports to THREE.BufferGeometryUtils
        THREEJS.BufferGeometryUtils = {
          toTrianglesDrawMode: module.toTrianglesDrawMode,
          mergeBufferGeometries: module.mergeBufferGeometries,
          mergeVertices: module.mergeVertices,
          _isStub: module._isStub
        };
        
        if (typeof THREE !== 'undefined') {
          THREE.BufferGeometryUtils = THREEJS.BufferGeometryUtils;
        }
        if (typeof globalThis.THREE !== 'undefined') {
          globalThis.THREE.BufferGeometryUtils = THREEJS.BufferGeometryUtils;
        }
        
        if (module._isStub) {
          console.warn('[BufferGeometryUtils] Stub loaded - replace with actual Three.js v0.160.0 file');
        } else {
          console.log('[BufferGeometryUtils] Attached to THREE global');
        }
      } else {
        console.error('[BufferGeometryUtils] Failed to load ES module');
      }
    })
    .catch(function(error) {
      console.error('[BufferGeometryUtils] Failed to load ES module:', error);
    });
}
