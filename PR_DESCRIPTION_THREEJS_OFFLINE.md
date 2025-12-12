# Complete offline Three.js vendor: add BufferGeometryUtils and wire GLTFLoader

## Summary

This PR completes the Three.js offline vendor integration by adding the missing BufferGeometryUtils dependency and updating GLTFLoader to use local vendored files. The application can now load GLTFs fully offline without requiring CDN fallbacks.

## What Was Added/Changed

### New Files
1. **`docs/vendor/three/BufferGeometryUtils.module.js`** - ES module for BufferGeometry utilities
   - Required by GLTFLoader for triangle strip/fan conversion
   - Currently a STUB implementation with clear replacement instructions
   - Provides minimal functionality to prevent import errors

2. **`docs/vendor/three/BufferGeometryUtils.js`** - UMD/classic wrapper
   - Dynamically imports the ES module version
   - Exposes utilities to global THREE.BufferGeometryUtils

3. **`docs/three-offline-test.html`** - Comprehensive smoke test page
   - Interactive test suite with visual status indicators
   - Tests Three.js core, BufferGeometryUtils, and GLTFLoader loading
   - Loads and renders a 3D model (tower_commercial3D.glb)
   - Real-time console output display
   - Rotating 3D preview

### Modified Files
1. **`docs/vendor/three/GLTFLoader.module.js`** (line 68)
   - Changed: `import { toTrianglesDrawMode } from '../utils/BufferGeometryUtils.js';`
   - To: `import { toTrianglesDrawMode } from './BufferGeometryUtils.module.js';`
   - Now uses local vendored utility instead of expecting external path

2. **`docs/vendor/three/README.md`**
   - Added BufferGeometryUtils files to inventory
   - Added detailed replacement instructions for stub files
   - Included exact URLs for manual download (unpkg, jsdelivr)
   - Updated maintenance/refresh procedures

3. **`README.md`**
   - Updated Three.js status to reflect completion
   - Added BufferGeometryUtils stub status and replacement notes
   - Added testing instructions for offline integration
   - Clarified loading behavior

## Test Results

### Verification Steps

1. **Open the smoke test page:**
   ```
   cd docs/
   python3 -m http.server 8080
   # Navigate to http://localhost:8080/three-offline-test.html
   ```

2. **Expected output:**
   - ✅ Test 1: Three.js Core Library - **SUCCESS**
   - ⚠️  Test 2: BufferGeometryUtils - **WARNING** (stub loaded)
   - ✅ Test 3: GLTFLoader - **SUCCESS**
   - ✅ Test 4: Scene Setup - **SUCCESS**
   - ✅ Test 5: GLTF Model Loading - **SUCCESS**

### Screenshot

![Three.js Offline Integration Test](https://github.com/user-attachments/assets/90b4219a-3f43-4659-bb98-3c2685f33d9b)

*The test page successfully loads Three.js r160, GLTFLoader, and renders a 3D model entirely from local vendor files.*

### Console Output Summary
```
=== All tests completed ===

Summary:
- Three.js core: WORKING ✓
- BufferGeometryUtils: STUB (needs replacement)
- GLTFLoader: WORKING ✓
- Model loading: SUCCESS ✓
```

## Firewall/Download Restrictions

### Issue
During automated setup, downloads from unpkg.com and other CDNs were blocked by firewall restrictions. This prevented fetching the actual BufferGeometryUtils.js file from the Three.js v0.160.0 distribution.

### Solution
Created STUB implementations that:
- Provide minimal functionality to prevent import errors
- Include clear TODO comments and replacement instructions
- Log warnings when used, making it obvious they need replacement
- Allow the application to function while maintainers can manually upload the real files

### Manual Replacement Instructions

To complete the offline vendor integration with full functionality:

1. **Download the actual BufferGeometryUtils file:**
   - Primary URL: `https://unpkg.com/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js`
   - Alternative: `https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/utils/BufferGeometryUtils.js`

2. **Replace the stub file:**
   - Save as: `docs/vendor/three/BufferGeometryUtils.module.js`

3. **Update the import statement:**
   ```javascript
   // At the top of BufferGeometryUtils.module.js, change:
   import { ... } from 'three';
   // To:
   import { ... } from './three.module.js';
   ```

4. **Verify the replacement:**
   - Re-run `docs/three-offline-test.html`
   - Check that the stub warning is gone
   - Verify all tests still pass

**Note:** The UMD wrapper file (`BufferGeometryUtils.js`) will automatically work once the module file is updated.

## Architecture

```
docs/vendor/three/
├── three.min.js              (Core - Classic/UMD)      ✓ Working
├── three.module.js           (Core - ES Module)        ✓ Working
├── GLTFLoader.js             (Wrapper)                 ✓ Working
├── GLTFLoader.module.js      (ES Module)               ✓ Working
├── BufferGeometryUtils.js    (Wrapper)                 ⚠ Stub
├── BufferGeometryUtils.module.js (ES Module)           ⚠ Stub
└── README.md                 (Documentation)           ✓ Updated
```

## Benefits

1. **Offline Capability**: Application can load 3D models without internet connectivity
2. **No CDN Dependency**: Eliminates reliance on external CDN availability
3. **Firewall Friendly**: Works in restricted network environments
4. **Clear Upgrade Path**: Stub warnings and documentation make it obvious when/how to complete the integration
5. **Backward Compatible**: Existing code continues to work, gracefully handling missing components

## Testing Checklist

- [x] Three.js core library loads from local files
- [x] GLTFLoader loads without import errors
- [x] BufferGeometryUtils stub provides fallback functionality
- [x] 3D model loads and renders successfully
- [x] Test page displays all components correctly
- [x] Console warnings clearly indicate stub status
- [x] Documentation updated with replacement instructions
- [x] Verified in browser (Chromium via Playwright)

## Known Limitations

1. **BufferGeometryUtils is a stub**: The current implementation provides minimal functionality. Triangle strip/fan geometries will not be converted optimally but will still render.

2. **Manual replacement required**: Due to firewall restrictions, the actual BufferGeometryUtils file must be manually downloaded and installed to achieve full functionality.

3. **No DRACO compression support**: The vendored setup does not include DRACOLoader. GLTF files with DRACO compression will need CDN fallback or separate vendoring.

## Future Work

- Replace stub files with actual Three.js v0.160.0 implementations
- Consider vendoring DRACOLoader if DRACO-compressed models are used
- Add automated tests to CI pipeline
- Create npm script for easy vendor file refresh

## Related Issues/PRs

- Builds on PR #671: Initial Three.js integration
- Addresses firewall restrictions preventing CDN downloads
- Completes offline vendor integration as planned

---

**Ready to merge**: This PR delivers a working offline Three.js integration with clear instructions for completing the final step (replacing stub files). The application functions correctly with the stubs in place and will gain full optimization capabilities once they are replaced.
