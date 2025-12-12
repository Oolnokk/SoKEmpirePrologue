Local fallback location for Three.js runtime scripts.

## Files Included

This directory contains Three.js v0.160.0 to provide local fallbacks when CDNs are unavailable or blocked.

### Three.js Core
* `three.min.js` - Minified classic globals build (655KB) - **WORKING** ✓
* `three.module.js` - ES module build (1.3MB, unminified for debugging) - **WORKING** ✓

### GLTFLoader Addon (INCOMPLETE)
* `GLTFLoader.js` - Wrapper script that dynamically imports the ES module
* `GLTFLoader.module.js` - ES module build with modified imports (106KB)

**Note:** The GLTFLoader currently has unmet dependencies (BufferGeometryUtils). The application will fall back to CDN sources for GLTF loading, or operate without 3D backgrounds if all sources fail. The core three.js library works correctly from local vendor files.

## Loading Behavior

The loader in `docs/js/app.js` attempts to load Three.js in this order:
1. Local classic globals build (`./vendor/three/three.min.js`)
2. Local ES module build (`./vendor/three/three.module.js`)
3. Multiple public CDNs (cdnjs, jsdelivr, unpkg)

For GLTFLoader, the same fallback pattern applies.

## Updating Three.js

To update to a newer version:

1. Install the desired version via npm:
   ```bash
   npm install three@<version>
   ```

2. Copy the files to this directory:
   ```bash
   cp node_modules/three/build/three.min.js docs/vendor/three/
   cp node_modules/three/build/three.module.js docs/vendor/three/
   cp node_modules/three/examples/jsm/loaders/GLTFLoader.js docs/vendor/three/GLTFLoader.module.js
   ```

3. Update the version references in `docs/js/app.js` CDN URLs if needed.

Note: The `GLTFLoader.js` wrapper file in this directory should remain compatible across three.js versions as long as the ES module structure stays the same.
