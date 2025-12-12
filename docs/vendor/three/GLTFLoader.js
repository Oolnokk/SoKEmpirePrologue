/**
 * GLTFLoader wrapper for classic script tag loading
 * This file provides backward compatibility by dynamically importing the ES module
 * and exposing it to the global THREE object.
 * 
 * For modern ES6 imports, use GLTFLoader.module.js directly.
 */
(function() {
  'use strict';
  
  // Only execute if THREE is available globally
  if (typeof THREE === 'undefined') {
    console.warn('GLTFLoader.js: THREE not found in global scope. Load three.js first.');
    return;
  }
  
  // Import the ES module version and expose it globally
  import('./GLTFLoader.module.js')
    .then(function(module) {
      if (module && module.GLTFLoader) {
        THREE.GLTFLoader = module.GLTFLoader;
        console.log('GLTFLoader attached to THREE global');
      } else {
        console.error('GLTFLoader.js: Failed to extract GLTFLoader from module');
      }
    })
    .catch(function(error) {
      console.error('GLTFLoader.js: Failed to load ES module:', error);
    });
})();
