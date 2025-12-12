/**
 * GLTFLoader wrapper for classic script tag loading
 * This file provides backward compatibility by dynamically importing the ES module
 * and exposing it to the global THREE object.
 * 
 * For modern ES6 imports, use GLTFLoader.module.js directly.
 * 
 * Note: This wrapper uses dynamic import() which requires the script to be loaded
 * as a module (type="module") or the browser must support dynamic imports in classic scripts.
 */

// Check if THREE is available globally
if (typeof THREE === 'undefined' && typeof globalThis.THREE === 'undefined') {
  console.warn('GLTFLoader.js: THREE not found in global scope. Load three.js first.');
} else {
  // Use globalThis.THREE if available (more reliable)
  const THREEJS = typeof THREE !== 'undefined' ? THREE : globalThis.THREE;
  
  // Import the ES module version and expose it globally
  import('./GLTFLoader.module.js')
    .then(function(module) {
      if (module && module.GLTFLoader) {
        THREEJS.GLTFLoader = module.GLTFLoader;
        if (typeof THREE !== 'undefined') THREE.GLTFLoader = module.GLTFLoader;
        if (typeof globalThis.THREE !== 'undefined') globalThis.THREE.GLTFLoader = module.GLTFLoader;
        console.log('[GLTFLoader] Attached to THREE global');
      } else {
        console.error('[GLTFLoader] Failed to extract GLTFLoader from module');
      }
    })
    .catch(function(error) {
      console.error('[GLTFLoader] Failed to load ES module:', error);
    });
}
