# 3D Preview Feature

## Overview

The map editor now includes a "Preview 3D Procedural" button that allows you to quickly preview procedurally-generated 3D assets from the `docs/assets/3D/` directory. This feature provides a lightweight test harness for visualizing glTF/GLB models anchored to the scene3d ground plane.

## Usage

### Basic Usage

1. Open the map editor: `docs/map-editor.html`
2. Click the **"Preview 3D Procedural"** button in the top toolbar
3. The 2D canvas will be replaced with a 3D view showing multiple instances of the tower asset
4. Click the button again (now labeled "Stop 3D Preview") to return to 2D editing mode

### Keyboard Shortcuts

When the 3D preview is active, you can use these keyboard shortcuts to experiment with camera parallax:

- **1** - Move camera to the left (left parallax view)
- **2** - Center camera (center view)
- **3** - Move camera to the right (right parallax view)

This mimics the left/right camera behavior that would be used in a stereoscopic or parallax rendering system.

## Technical Details

### Architecture

The 3D preview feature is implemented as a self-contained module:

- **Module**: `docs/js/scene3d-preview.js`
- **Dependencies**: Three.js and GLTFLoader loaded from unpkg.com CDN
- **Integration**: Added to `docs/map-editor.html` as an ES module script

### Configuration

The preview uses these default settings:

```javascript
{
  sceneUrl: './assets/3D/tower_commercial3D.glb',
  fallbackUrl: './assets/3D/scene3d-demo.gltf',
  ground: {
    planeZ: 0,
    unitsPerPixel: 1,
  },
  camera: {
    projection: 'perspective',
    fov: 50,
  },
  instanceCount: 8,
  spacing: 220,
  lighting: 'basic',
}
```

### API

The module exports these functions:

#### `startPreview(opts)`

Starts the 3D preview with the given configuration.

**Parameters:**
- `opts.containerElement` - Required. DOM element to render into
- `opts.sceneUrl` - URL to GLTF/GLB file
- `opts.fallbackUrl` - Fallback URL if primary fails
- `opts.ground` - Ground plane config `{ planeZ, unitsPerPixel }`
- `opts.camera` - Camera config `{ projection, fov }`
- `opts.instanceCount` - Number of model instances to create
- `opts.spacing` - Spacing between instances in pixels

**Returns:** Promise that resolves with `{ success, instanceCount }`

#### `stopPreview()`

Stops the preview and cleans up all Three.js resources.

#### `toggleCameraSide(side)`

Adjusts camera position for parallax preview.

**Parameters:**
- `side` - String: 'left', 'right', or 'center'

#### `isPreviewActive()`

Returns `true` if preview is currently active.

## Asset Requirements

The feature expects 3D assets in the `docs/assets/3D/` directory:

- **Primary asset**: `tower_commercial3D.glb` (or `.gltf`)
- **Fallback asset**: `scene3d-demo.gltf`

If the primary asset is not found, the system automatically falls back to the demo asset.

## Compatibility

### Browser Support

- Modern browsers with ES6 module support
- WebGL support required
- Three.js r158 compatible

### Non-Breaking Design

The 3D preview feature is designed to be completely non-intrusive:

- Only activated when the button is clicked
- Does not modify the 2D editor state
- Preserves all existing map editor functionality
- Falls back gracefully if Three.js fails to load
- Properly restores 2D canvas when stopped

## Troubleshooting

### Three.js Fails to Load

If you see errors about blocked CDN resources:

1. Check your browser's content security policy
2. Verify network connectivity
3. Check browser console for detailed error messages
4. Ensure ad blockers aren't blocking unpkg.com

### Models Don't Appear

If the 3D view is blank:

1. Verify the asset files exist in `docs/assets/3D/`
2. Check browser console for GLTF loading errors
3. Ensure the glTF/GLB files are valid
4. Try the fallback demo asset

### Performance Issues

If the preview is slow:

1. Reduce `instanceCount` in the configuration
2. Close other browser tabs
3. Ensure hardware acceleration is enabled
4. Check that your GPU drivers are up to date

## Development

### Running Tests

```bash
npm test
```

The test suite includes:
- Module export validation
- Configuration structure tests
- Integration tests with map-editor.html
- Cleanup verification

### Extending

To add new features to the 3D preview:

1. Modify `docs/js/scene3d-preview.js`
2. Add corresponding tests in `tests/scene3d-preview.test.js`
3. Update integration in `docs/map-editor.html` if needed
4. Run tests and linter before committing

## Future Enhancements

Possible future improvements:

- [ ] Support for multiple asset types
- [ ] Interactive camera controls (orbit, zoom)
- [ ] Lighting controls
- [ ] Grid plane customization
- [ ] Animation playback
- [ ] Screenshot/export functionality
- [ ] Real-time asset hot-reloading
