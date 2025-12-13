# Runtime Visualsmap Rendering Parity Fix

## Problem Statement

The runtime game demo was only rendering a single prefab/scene instead of the full multi-object visualsmap (ground segments, towers, decorations) that the 3D Map Builder/Editor displays correctly.

### Root Causes Identified

1. **Missing area.source**: The `area.source` property (containing the URL of the gameplay map JSON file) was not being set when maps were loaded in `map-bootstrap.js`. This prevented `visualsmapLoader.js` from resolving visualsmap paths relative to the gameplay map location.

2. **Path Resolution Issues**: The `resolveAssetPath()` function in `visualsmapLoader.js` needed better handling of different path formats (absolute, relative, GitHub Pages deployment paths).

3. **Insufficient Diagnostics**: Lack of detailed logging made it difficult to identify where the loading process was failing.

## Changes Made

### 1. map-bootstrap.ts/js - Critical Fix
**File**: `docs/js-src/map-bootstrap.ts` and `docs/js/map-bootstrap.js`

Added line to set `area.source` after `convertLayoutToArea`:

```typescript
const area = convertLayoutToArea(layout, { areaId, areaName, prefabResolver });
// Set source URL so visualsmap paths can be resolved relative to this file
area.source = layoutUrl.href;
applyArea(area);
```

**Impact**: This ensures that when `visualsmapLoader.loadVisualsMap()` is called with `area.source` as the `gameplayMapUrl`, it can correctly resolve paths like `"../visualsmaps/defaultdistrict3D_visualsmap.json"` relative to the gameplay map's location.

### 2. visualsmapLoader.js - Enhanced Path Resolution
**File**: `docs/renderer/visualsmapLoader.js`

**Changes**:
- Updated `resolveAssetPath()` to handle GitHub Pages deployment paths correctly
- Added comprehensive logging for every path resolution
- Added progress tracking with summary statistics
- Enhanced error messages with HTTP status codes

**Key improvements**:
```javascript
// Before: Basic URL resolution
function resolveAssetPath(assetPath) {
  return new URL(assetPath, baseUrl).href;
}

// After: GitHub Pages compatible + detailed logging
function resolveAssetPath(assetPath, baseContext = null) {
  // Handle absolute paths starting with '/' by treating them as relative
  // (critical for GitHub Pages deployment)
  if (assetPath.startsWith('/')) {
    const relativeUrl = assetPath.substring(1);
    resolvedPath = new URL(relativeUrl, baseUrl).href;
  }
  console.log(`[visualsmapLoader] Resolved asset path: "${assetPath}" → "${resolvedPath}"`);
  return resolvedPath;
}
```

### 3. Renderer.js - GLTFLoader Diagnostics
**File**: `docs/renderer/Renderer.js`

**Changes**:
- Added diagnostics for GLTFLoader availability
- Added BufferGeometryUtils availability check
- Added scene.children count tracking in `add()` method
- Enhanced GLTF load logging with mesh counts and geometry types

**Example log output**:
```
[Renderer] Loading GLTF from: http://localhost:8000/docs/assets/3D/ground_segments/blocksegment.gltf
[Renderer] - Using LoaderCtor: GLTFLoader
[Renderer] - BufferGeometryUtils: available
[Renderer] ✓ GLTF loaded successfully: ...
[Renderer]   - Total meshes: 1
[Renderer]   - Geometry types: BufferGeometry
[Renderer] Added object to scene: 0 -> 1 children
```

### 4. app.js - Runtime Debugging Exposure
**File**: `docs/js/app.js`

**Changes**:
- Exposed `window.GAME.visualsmapAdapter` for runtime inspection
- Exposed `window.GAME.renderAdapter` for fallback scene inspection
- Updated adapters on every area load

**Usage**:
```javascript
// In browser console:
window.GAME.visualsmapAdapter.objects.length  // Number of 3D objects loaded
window.GAME.renderer3d.scene.children.length  // Objects in Three.js scene
```

## Testing

### Manual Testing Steps

1. **Start local server**:
   ```bash
   cd docs
   python -m http.server 8000
   ```

2. **Open the game demo**:
   Navigate to `http://localhost:8000/`

3. **Check browser console for visualsmap logs**:
   Look for these key messages:
   ```
   [visualsmapLoader] ========================================
   [visualsmapLoader] Starting visualsmap load for area: defaultdistrict3d
   [visualsmapLoader] - Gameplay map URL: http://localhost:8000/docs/config/maps/gameplaymaps/defaultdistrict3d_gameplaymap.json
   [visualsmapLoader] - Visualsmap path: ../visualsmaps/defaultdistrict3D_visualsmap.json
   [visualsmapLoader] - Resolved URL: http://localhost:8000/docs/config/maps/visualsmaps/defaultdistrict3D_visualsmap.json
   [visualsmapLoader] ✓ Visualsmap JSON loaded successfully
   [visualsmapLoader] - Grid size: 20 x 20
   [visualsmapLoader] ✓ VISUALSMAP LOAD COMPLETE
   [visualsmapLoader] - Total objects placed: 160
   ```

4. **Verify in browser console**:
   ```javascript
   window.GAME.visualsmapAdapter.objects.length  // Should be > 0 (e.g., 160)
   window.GAME.renderer3d.scene.children.length  // Should match objects count
   ```

5. **Visual verification**:
   - The 3D background should show multiple ground segments (roads, sidewalks)
   - Structures (towers) should be visible
   - The scene should match what's shown in the 3D Map Builder

### Expected Results

- **Console logs**: Detailed visualsmap loading progress with no errors
- **Objects placed**: 160+ objects (roads, sidewalks, towers from the defaultdistrict3D visualsmap)
- **Visual appearance**: Multi-object 3D scene matching the editor view

## Architecture Overview

```
Runtime Flow:
1. docs/index.html loads -> docs/js/app.js
2. app.js initializes 3D renderer (if Three.js available)
3. map-bootstrap loads gameplaymap JSON from CONFIG.layouts path
4. map-bootstrap sets area.source = gameplayMapUrl
5. app.js detects area.visualsMap and calls visualsmapLoader.loadVisualsMap()
6. visualsmapLoader resolves visualsmap path relative to area.source
7. visualsmapLoader loads asset configs (road, sidewalk, tower)
8. visualsmapLoader loads and places GLTF models for each grid cell
9. Objects added to renderer.scene via renderer.add()
```

## Files Modified

1. `docs/js-src/map-bootstrap.ts` - Set area.source
2. `docs/js/map-bootstrap.js` - Compiled output
3. `docs/renderer/visualsmapLoader.js` - Enhanced path resolution and diagnostics
4. `docs/renderer/Renderer.js` - Added GLTFLoader diagnostics
5. `docs/js/app.js` - Exposed adapters for debugging

## Related Files (Not Modified)

- `docs/config/maps/gameplaymaps/defaultdistrict3d_gameplaymap.json` - Contains `visualsMap` property
- `docs/config/maps/visualsmaps/defaultdistrict3D_visualsmap.json` - Grid-based visual map
- `docs/config/assets/*.json` - Asset configurations (road, sidewalk, tower)
- `docs/assets/3D/*.gltf` - GLTF 3D models

## Camera Configuration

The current camera configuration in `app.js` uses:
- `cameraHeight: 30` - Elevated view angle
- `cameraDistance: 50` - Distance from scene
- `parallaxFactor: 0.5` - Half-speed parallax for depth effect

These settings provide a ground-level view along the gameplay path, matching the editor's perspective.

## Debug Commands

Useful console commands for debugging:

```javascript
// Check visualsmap adapter status
window.GAME.visualsmapAdapter

// Count loaded objects
window.GAME.visualsmapAdapter?.objects?.length

// Check renderer scene
window.GAME.renderer3d?.scene?.children

// Check current area
window.GAME.mapRegistry?.getActiveArea()

// Check area source (should be the gameplay map URL)
window.GAME.mapRegistry?.getActiveArea()?.source
```

## Known Limitations

1. **BufferGeometryUtils Warning**: Some browsers may show a warning about BufferGeometryUtils not being attachable to the global THREE object. This is expected and the code handles it via fallback storage.

2. **File Protocol**: The visualsmap loader requires a web server (HTTP protocol) and won't work with `file://` URLs due to CORS restrictions.

3. **Asset Paths**: Asset paths must be relative to the config/assets directory or use absolute URLs.

## Future Enhancements

1. **Error Recovery**: Add graceful fallback when individual GLTF models fail to load
2. **Loading Progress**: Show loading progress indicator in the UI
3. **Debug Panel Controls**: Add "Reload Visualsmap" button in the game debug panel
4. **Performance**: Implement object culling for large visualsmaps
5. **Asset Preloading**: Cache frequently used GLTFs to reduce redundant fetches

## References

- Original issue: Runtime shows single prefab while editor shows full visualsmap
- Related docs: `docs/renderer-README.md`, `docs/VISUALMAP_RENDERING_PIPELINE.md`
- Three.js version: 0.160.0
