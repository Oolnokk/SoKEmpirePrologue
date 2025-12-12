Local fallback location for Three.js runtime scripts.

## Files Included

This directory contains Three.js v0.160.0 to provide local fallbacks when CDNs are unavailable or blocked.

### Three.js Core
* `three.min.js` - Minified classic globals build (655KB) - **WORKING** ✓
* `three.module.js` - ES module build (1.3MB, unminified for debugging) - **WORKING** ✓

### GLTFLoader Addon
* `GLTFLoader.js` - Wrapper script that dynamically imports the ES module - **WORKING** ✓
* `GLTFLoader.module.js` - ES module build with modified imports (106KB) - **WORKING** ✓

### BufferGeometryUtils (Required by GLTFLoader)
* `BufferGeometryUtils.js` - UMD/classic wrapper - **WORKING** ✓
* `BufferGeometryUtils.module.js` - ES module build (32KB) - **WORKING** ✓

## Loading Behavior

The loader in `docs/js/app.js` attempts to load Three.js in this order:
1. Local classic globals build (`./vendor/three/three.min.js`)
2. Local ES module build (`./vendor/three/three.module.js`)
3. Multiple public CDNs (cdnjs, jsdelivr, unpkg)

For GLTFLoader, the same fallback pattern applies.

## BufferGeometryUtils Installation

The BufferGeometryUtils files have been successfully installed from Three.js v0.160.0 via npm. The imports have been updated to reference the local `three.module.js` file.

### How it was installed

```bash
npm install three@0.160.0
cp node_modules/three/examples/jsm/utils/BufferGeometryUtils.js docs/vendor/three/BufferGeometryUtils.module.js
# Updated import from 'three' to './three.module.js'
```

### Verification

Test the integration:

1. Open `docs/three-offline-test.html` in a web browser
2. Check the console output and test results
3. Verify the GLTF model loads and displays correctly
4. All tests should show SUCCESS with no stub warnings

## Updating Three.js to a Newer Version

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
   cp node_modules/three/examples/jsm/utils/BufferGeometryUtils.js docs/vendor/three/BufferGeometryUtils.module.js
   ```

3. Update imports in both loader files:
   - In `GLTFLoader.module.js`: Change `from 'three'` to `from './three.module.js'`
   - In `GLTFLoader.module.js`: Change `from '../utils/BufferGeometryUtils.js'` to `from './BufferGeometryUtils.module.js'`
   - In `BufferGeometryUtils.module.js`: Change `from 'three'` to `from './three.module.js'`

4. Update the version references in `docs/js/app.js` CDN URLs if needed.

Note: The wrapper files (`GLTFLoader.js` and `BufferGeometryUtils.js`) in this directory should remain compatible across three.js versions as long as the ES module structure stays the same.
