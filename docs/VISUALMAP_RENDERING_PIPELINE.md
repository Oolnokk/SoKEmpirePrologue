# Visual Map Rendering Pipeline

## Overview

The visual map rendering pipeline loads and displays 3D scenes in the game using Three.js, GLTFLoader, and BufferGeometryUtils. This document describes the architecture, common issues, and troubleshooting steps.

## Architecture

### Components

1. **Three.js Core** (`docs/vendor/three/three.module.js`) - v0.160.0
   - Provides 3D rendering capabilities
   - Manages scenes, cameras, renderers, and lighting

2. **GLTFLoader** (`docs/vendor/three/GLTFLoader.module.js`)
   - Loads GLTF/GLB 3D model files
   - Parses mesh geometry, materials, and scene hierarchy
   - Depends on BufferGeometryUtils for certain geometry operations

3. **BufferGeometryUtils** (`docs/vendor/three/BufferGeometryUtils.module.js`)
   - Provides geometry manipulation utilities
   - Used by GLTFLoader for merging and processing geometries
   - Critical for loading complex multi-mesh models

4. **Renderer Module** (`src/renderer/Renderer.js`)
   - Lightweight wrapper around Three.js
   - Provides safe initialization and fallback mechanisms
   - Enhanced with diagnostics for GLTF loading

5. **Visualsmap Loader** (`docs/renderer/visualsmapLoader.js`)
   - Loads grid-based visual maps
   - Converts grid coordinates to 3D world positions
   - Places towers, ground segments, and decorations

## Loading Flow

### Initialization Sequence

```
1. app.js calls ensureThreeGlobals()
2. Three.js core is loaded (ES module or CDN)
3. BufferGeometryUtils is loaded and attached/stored
4. GLTFLoader is loaded and attached/stored
5. Renderer module is initialized
6. Visualsmap or scene3d is loaded based on area config
```

### Visualsmap Loading

```
1. Area config specifies visualsMap path
2. visualsmapLoader fetches the JSON file
3. For each grid cell with an asset:
   a. Load asset config (e.g., tower-config.json)
   b. Load GLTF model from asset config
   c. Clone model for each placement
   d. Apply scale, position, rotation
   e. Add to scene
4. All objects are tracked for disposal
```

## Common Issues

### Issue 1: "Cannot attach BufferGeometryUtils to THREE object"

**Symptom**: Console warning about non-extensible THREE object

**Cause**: When Three.js is loaded in certain ways (e.g., via UMD, frozen object), it becomes non-extensible and properties cannot be added.

**Solution**: The app now uses a fallback storage mechanism:
- BufferGeometryUtils is stored in `threeGlobalState.bufferGeometryUtils`
- Accessed via `globalThis.getThreeBufferGeometryUtils()`
- GLTFLoader loaded as ES module has its own copy bundled, so it still works

**Impact**: Minimal - ES module GLTFLoader has BufferGeometryUtils bundled internally

### Issue 2: "BufferGeometryUtils not found - GLTFLoader may fail"

**Symptom**: Warning message in console

**Cause**: BufferGeometryUtils couldn't be attached to THREE object

**Solution**: 
1. Check if THREE object is extensible: `Object.isExtensible(THREE)`
2. Use fallback accessor: `getThreeBufferGeometryUtils()`
3. ES module GLTFLoader works independently

**Prevention**: Always load Three.js addons as ES modules when possible

### Issue 3: Only one tower appears, ground segments missing

**Symptom**: Fewer 3D objects than expected in scene

**Possible Causes**:
1. GLTF loading failures (check console for errors)
2. Asset config files not found (404 errors)
3. Model cloning issues (all instances share same transform)
4. Geometry parsing failures in GLTFLoader

**Debugging Steps**:
1. Open browser DevTools console
2. Look for GLTF loading diagnostics:
   ```
   [Renderer] ✓ GLTF loaded successfully: <url>
   [Renderer]   - Scene children: <count>
   [Renderer]   - Total meshes: <count>
   [Renderer]   - Geometry types: <types>
   ```
3. Check visualsmapLoader output:
   ```
   [visualsmapLoader] Placed <type> at (<row>,<col>) -> world(<x>, <y>, <z>)
   ```
4. Verify asset configs exist and have correct gltfPath
5. Use `docs/gltf-diagnostics.html` to test individual models

### Issue 4: GLTF loads but no meshes found

**Symptom**: Console shows "GLTF loaded but contains no meshes"

**Possible Causes**:
1. GLTF file is empty or corrupted
2. Geometry parsing failed silently
3. Meshes have zero vertices

**Debugging Steps**:
1. Open GLTF/GLB file in a 3D viewer (e.g., https://gltf-viewer.donmccurdy.com/)
2. Check file size (should be > 0 bytes)
3. Use gltf-diagnostics.html to inspect scene hierarchy
4. Check for GLTFLoader errors during parsing

## Diagnostics Tools

### 1. GLTF Diagnostics Page (`docs/gltf-diagnostics.html`)

Interactive test page that:
- Loads Three.js, GLTFLoader, BufferGeometryUtils as ES modules
- Tests individual GLTF/GLB models
- Shows detailed diagnostics (mesh count, geometry types, etc.)
- Displays models in 3D viewport

**Usage**:
```bash
# Serve locally (required for file:// limitations)
python -m http.server 8000
# Open http://localhost:8000/docs/gltf-diagnostics.html
```

### 2. Enhanced Console Logging

The renderer now logs detailed information for each GLTF load:

```javascript
[Renderer] ✓ GLTF loaded successfully: ./assets/3D/tower.glb
[Renderer]   - Scene children: 1
[Renderer]   - Total meshes: 3
[Renderer]   - Geometry types: BufferGeometry
```

### 3. Runtime Checks

Check THREE object state at runtime:

```javascript
// In browser console
console.log('Extensible:', Object.isExtensible(THREE));
console.log('Sealed:', Object.isSealed(THREE));
console.log('Frozen:', Object.isFrozen(THREE));
console.log('BufferGeometryUtils:', getThreeBufferGeometryUtils());
console.log('GLTFLoader:', getThreeGLTFLoaderCtor());
```

## Prerequisites

### Three.js Version

- **Required**: Three.js v0.160.0 or compatible
- **Location**: `docs/vendor/three/`
- **Verification**: Check `THREE.REVISION` in console

### Browser Compatibility

- **Modern browsers** with ES6 module support
- **WebGL** enabled
- **Local server** required for file:// protocol (due to CORS)

### Asset Requirements

1. **GLTF/GLB Models**
   - Valid GLTF 2.0 format
   - Meshes with BufferGeometry
   - Materials compatible with THREE.MeshStandardMaterial

2. **Asset Config Files**
   - Located in `docs/config/assets/`
   - JSON format with gltfPath, baseScale, yOffset, etc.
   - Example: `tower-config.json`, `sidewalk-config.json`

3. **Visualsmap Files**
   - JSON format with rows, cols, layerStates
   - Referenced from gameplay map via `visualsMap` property
   - Example: `defaultdistrict3d_visualsmap.json`

## Troubleshooting Steps

### Step 1: Verify Environment

1. Open browser DevTools console
2. Check for Three.js initialization messages:
   ```
   [app] Three.js r160 loaded from ES module
   [app] THREE object state: extensible=true, sealed=false, frozen=false
   [app] ✓ BufferGeometryUtils available via THREE.BufferGeometryUtils
   [app] 3D background renderer initialized successfully
   ```

### Step 2: Test Individual Models

1. Open `docs/gltf-diagnostics.html`
2. Click "Load Tower GLB" or other test buttons
3. Check console for loading diagnostics
4. Verify model appears in viewport

### Step 3: Check Asset Configs

1. Navigate to `docs/config/assets/`
2. Verify asset config files exist (e.g., `tower-config.json`)
3. Check gltfPath points to valid GLTF/GLB file
4. Verify file paths are correct (relative to base URL)

### Step 4: Inspect Network Requests

1. Open DevTools Network tab
2. Reload page
3. Look for failed requests (404, 500 errors)
4. Check GLTF/GLB file loads successfully
5. Verify asset config JSONs load

### Step 5: Examine Scene Hierarchy

In browser console:
```javascript
// Get renderer and scene
const renderer = window.GAME?.renderer3d;
const scene = renderer?.scene;

// Count children
console.log('Scene children:', scene?.children.length);

// List all objects
scene?.traverse((obj) => {
  if (obj.isMesh) {
    console.log('Mesh:', obj.name, obj.geometry, obj.material);
  }
});
```

## Performance Considerations

### Model Optimization

- Keep polygon count reasonable (< 10k triangles per model)
- Use texture compression (KTX2, Basis Universal)
- Reuse materials across meshes
- Use instancing for repeated objects (future enhancement)

### Loading Strategy

- Models are loaded once and cloned for each placement
- Clone includes geometry and materials to avoid shared state
- Async loading prevents blocking the main thread
- Progress events for large files (not yet fully implemented)

## Future Enhancements

1. **Instancing**: Use THREE.InstancedMesh for repeated objects (e.g., sidewalk segments)
2. **LOD**: Level-of-detail system for distant objects
3. **Texture Streaming**: Load textures on-demand
4. **Caching**: Cache loaded GLTF models in localStorage/IndexedDB
5. **Error Recovery**: Retry failed loads, show placeholder meshes
6. **Loading UI**: Progress bars and status indicators

## References

- [Three.js Documentation](https://threejs.org/docs/)
- [GLTF 2.0 Specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [GLTFLoader Documentation](https://threejs.org/docs/#examples/en/loaders/GLTFLoader)
- [BufferGeometryUtils Documentation](https://threejs.org/docs/#examples/en/utils/BufferGeometryUtils)

## Version History

- **2024-12**: Initial documentation
  - Added fallback storage for BufferGeometryUtils
  - Enhanced GLTF loading diagnostics
  - Created gltf-diagnostics.html test page
  - Documented common issues and troubleshooting
