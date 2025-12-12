# Renderer Module

A lightweight, reusable renderer module that wraps Three.js when available and provides safe no-op fallbacks in non-rendering environments (e.g., test runners, Node).

## Overview

The renderer module provides a small, well-documented API for 3D rendering that can be consumed by:
- Game demo
- 3D map builder (docs/3Dmapbuilder.html)
- Gameplay map editor (docs/gameplay-map-editor.html)

**🎯 For integrating 3D backgrounds into the game demo, see the comprehensive [Three.js 3D Background Integration Guide](THREEJS_3D_BACKGROUND_INTEGRATION_GUIDE.md)** which covers layering, camera synchronization, and common pitfalls.

## Features

- **Runtime Detection**: Automatically detects `globalThis.THREE` availability
- **Safe Fallbacks**: Operates safely when Three.js is unavailable
- **Event System**: Simple hooks for 'ready', 'error', and 'frame' events
- **Adapter Pattern**: Integrates with existing scene3d configuration format
- **Minimal Dependencies**: No build changes required; uses runtime detection

## Installation

The renderer module is already available in the repository at `src/renderer/`. No additional dependencies or build steps are required.

## Basic Usage

### Checking Support

```javascript
import { isSupported } from '../src/renderer/index.js';

if (isSupported()) {
  console.log('Three.js is available!');
} else {
  console.log('Three.js not available - renderer will operate in no-op mode');
}
```

### Creating a Renderer

```javascript
import { createRenderer } from '../src/renderer/index.js';

// Get container element
const container = document.getElementById('viewport');

// Create renderer with options
const renderer = createRenderer({
  container: container,
  width: 800,
  height: 600,
  pixelRatio: window.devicePixelRatio,
  clearColor: 0x0f172a // Dark blue background
});

// Initialize
await renderer.init();

// Listen for ready event
renderer.on('ready', (event) => {
  if (event.supported) {
    console.log('Renderer initialized successfully');
  } else {
    console.log('Renderer in no-op mode (Three.js unavailable)');
  }
});

// Start animation loop
renderer.start();
```

## API Reference

### `isSupported()`

Returns `true` if Three.js (`globalThis.THREE`) is available, `false` otherwise.

### `createRenderer(options)`

Creates a new renderer instance.

**Options:**
- `container` (HTMLElement|null): Container element for the canvas. Can be `null` for off-screen rendering.
- `width` (number): Initial width in pixels (default: 800)
- `height` (number): Initial height in pixels (default: 600)
- `pixelRatio` (number): Pixel ratio for high-DPI displays (default: `window.devicePixelRatio` or 1)
- `clearColor` (number): Background color as hex (default: 0x000000)

### Renderer Methods

#### `init()`

Initializes the underlying renderer and attaches canvas to container when provided.

**Returns:** `Promise<void>`

```javascript
await renderer.init();
```

#### `resize(width, height)`

Adjusts renderer and camera to new dimensions.

```javascript
renderer.resize(1024, 768);

// Example: Resize on window resize
window.addEventListener('resize', () => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.resize(width, height);
});
```

#### `setCameraParams(params)`

Sets camera position, rotation, FOV, or replaces camera with a THREE.Camera instance.

**Parameters:**
- `params.position` (Object): Position {x, y, z}
- `params.rotation` (Object): Rotation {x, y, z}
- `params.lookAt` (Object): Point to look at {x, y, z}
- `params.fov` (number): Field of view (perspective only)
- `params.camera` (THREE.Camera): Use a specific camera instance

```javascript
// Set position and look at origin
renderer.setCameraParams({
  position: { x: 0, y: 10, z: 20 },
  lookAt: { x: 0, y: 0, z: 0 }
});

// Change FOV
renderer.setCameraParams({
  fov: 60
});

// Use a custom camera (when THREE is available)
if (isSupported()) {
  const customCamera = new THREE.OrthographicCamera(-10, 10, 10, -10, 0.1, 100);
  renderer.setCameraParams({ camera: customCamera });
}
```

#### `loadGLTF(url)`

Loads a GLTF/GLB model. Uses `THREE.GLTFLoader` when available.

**Returns:** `Promise<Object|null>` - Resolves to the loaded scene, or `null` if THREE is unavailable

```javascript
const scene = await renderer.loadGLTF('/config/maps/visualsmaps/mymodel.glb');

if (scene) {
  renderer.add(scene);
}
```

#### `add(object)`

Adds a THREE.Object3D to the scene.

```javascript
renderer.add(myObject3D);
```

#### `remove(object)`

Removes a THREE.Object3D from the scene.

```javascript
renderer.remove(myObject3D);
```

#### `start()`

Starts the animation loop. Automatically renders the scene every frame and emits 'frame' events.

```javascript
renderer.start();
```

#### `stop()`

Stops the animation loop.

```javascript
renderer.stop();
```

#### `dispose()`

Cleans up all resources, removes canvas from container, and disposes Three.js objects.

```javascript
renderer.dispose();
```

#### `on(event, callback)`

Registers an event handler.

**Events:**
- `'ready'`: Fired after initialization. Payload: `{ supported: boolean, renderer?: THREE.WebGLRenderer }`
- `'error'`: Fired on errors. Payload: `{ phase: string, error: Error, ...context }`
- `'frame'`: Fired every animation frame. Payload: `{ renderer: Renderer, time: number }`

```javascript
renderer.on('ready', (event) => {
  console.log('Ready:', event.supported);
});

renderer.on('error', (event) => {
  console.error('Error in', event.phase, event.error);
});

renderer.on('frame', (event) => {
  // Custom per-frame logic
  // e.g., update animations, process input
});
```

#### `off(event, callback)`

Unregisters an event handler.

```javascript
const handler = (event) => console.log(event);
renderer.on('frame', handler);
// Later...
renderer.off('frame', handler);
```

## Using the Adapter

The `rendererAdapter` provides integration between scene3d configuration and the renderer.

```javascript
import { createRenderer } from '../src/renderer/index.js';
import { adaptScene3dToRenderer } from '../src/map/rendererAdapter.js';

const renderer = createRenderer({ container: myContainer });
await renderer.init();

// Load a scene3d descriptor
const scene3dDescriptor = {
  sceneUrl: './mymap.glb',
  ground: {
    planeZ: 0,
    unitsPerPixel: 1
  }
};

// Adapt and load
const adapted = await adaptScene3dToRenderer(renderer, scene3dDescriptor, {
  position: { x: 0, y: 0, z: 0 },
  rotation: { x: 0, y: 0, z: 0 },
  scale: { x: 1, y: 1, z: 1 }
});

if (adapted.root) {
  console.log('Scene loaded and added to renderer');
}

renderer.start();

// Later, dispose the adapted scene
adapted.dispose();
```

## Integration Examples

### 3D Map Builder (docs/3Dmapbuilder.html)

To integrate the renderer into the 3D map builder:

1. Ensure Three.js is loaded globally (CDN or local):
   ```html
   <script src="https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.module.js" type="module"></script>
   ```

2. Import and initialize the renderer:
   ```javascript
   import { createRenderer } from '../src/renderer/index.js';
   
   const container = document.getElementById('viewport');
   const renderer = createRenderer({ 
     container,
     width: container.clientWidth,
     height: container.clientHeight,
     clearColor: 0x05070a
   });
   
   await renderer.init();
   renderer.start();
   ```

3. Load visual maps:
   ```javascript
   import { adaptScene3dToRenderer } from '../src/map/rendererAdapter.js';
   
   const scene3d = {
     sceneUrl: '/config/maps/visualsmaps/mymap.glb',
     ground: { planeZ: 0, unitsPerPixel: 1 }
   };
   
   const adapted = await adaptScene3dToRenderer(renderer, scene3d);
   ```

### Gameplay Map Editor (docs/gameplay-map-editor.html)

The gameplay map editor can use the renderer as a background reference:

1. Check for Three.js availability:
   ```javascript
   import { isSupported } from '../src/renderer/index.js';
   
   if (!isSupported()) {
     alert('Three.js not available. 3D preview disabled.');
     return;
   }
   ```

2. Initialize renderer in background mode:
   ```javascript
   const renderer = createRenderer({
     container: document.getElementById('3d-background'),
     clearColor: 0x0f172a
   });
   
   await renderer.init();
   renderer.start();
   ```

3. Load visual map when user selects one:
   ```javascript
   async function loadVisualMap(mapId) {
     const scene3d = await fetchScene3dConfig(mapId);
     const adapted = await adaptScene3dToRenderer(renderer, scene3d);
     // Now gameplay path overlays on top of 3D scene
   }
   ```

## Game Demo Integration

For the main game demo, the renderer can be initialized similarly and integrated with the existing camera and area systems.

```javascript
import { createRenderer } from './src/renderer/index.js';
import { adaptScene3dToRenderer } from './src/map/rendererAdapter.js';

// Initialize renderer
const renderer = createRenderer({
  container: gameContainer,
  width: window.innerWidth,
  height: window.innerHeight
});

await renderer.init();

// Load area's scene3d
const area = mapRegistry.getArea(areaId);
if (area.scene3d && area.scene3d.sceneUrl) {
  const adapted = await adaptScene3dToRenderer(renderer, area.scene3d);
}

// Start rendering
renderer.start();

// Sync camera with game logic
renderer.on('frame', () => {
  // Update camera position from game camera system
  renderer.setCameraParams({
    position: gameCamera.getPosition(),
    lookAt: gameCamera.getTarget()
  });
});
```

## Testing Without Three.js

The renderer gracefully handles the absence of Three.js:

```javascript
// In a Node test environment (no THREE):
import { isSupported, createRenderer } from '../src/renderer/index.js';

console.log(isSupported()); // false

const renderer = createRenderer({});
await renderer.init(); // No error, operates in no-op mode

renderer.add({ some: 'object' }); // Safe no-op
renderer.start(); // Safe no-op
renderer.dispose(); // Safe cleanup
```

## Best Practices

1. **Always check `isSupported()`** before attempting complex 3D operations
2. **Use event handlers** to respond to initialization and errors
3. **Clean up resources** with `dispose()` when done
4. **Resize on window changes** to maintain correct aspect ratio
5. **Handle load failures** gracefully (loadGLTF may return null)

## Troubleshooting

### Three.js not detected

**Problem:** `isSupported()` returns `false`

**Solution:** Ensure Three.js is loaded before the renderer module:
```html
<script>
  // Load THREE globally
  import('https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.module.js')
    .then(module => {
      globalThis.THREE = module;
      // Now initialize renderer
    });
</script>
```

### GLTFLoader not found

**Problem:** `loadGLTF()` returns `null` with warning about GLTFLoader

**Solution:** Load Three.js addons:
```html
<script type="module">
  import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.149.0/build/three.module.js';
  import { GLTFLoader } from 'https://cdn.jsdelivr.net/npm/three@0.149.0/examples/jsm/loaders/GLTFLoader.js';
  
  THREE.GLTFLoader = GLTFLoader;
  globalThis.THREE = THREE;
</script>
```

### Canvas not appearing

**Problem:** Canvas not added to container

**Solution:** Ensure container is a valid DOM element and `init()` has completed:
```javascript
const container = document.getElementById('viewport');
if (!container) {
  console.error('Container not found');
}

await renderer.init(); // Wait for initialization
// Canvas should now be in container
```

## Testing Integration

To verify that the 3D background integration is working correctly:

1. **Smoke Test Page**: Open [three-integration-smoke.html](three-integration-smoke.html) to run automated checks:
   - Three.js detection and version
   - GLTFLoader availability
   - Renderer and adapter module loading
   - Configuration validation

2. **Manual Verification**: Serve the docs locally and test:
   ```bash
   # From the repository root
   python -m http.server 8000
   # Then open http://localhost:8000/docs/index.html
   ```

3. **Console Checks**: Look for these messages in the browser console:
   - `[app] Three.js detected - initializing 3D background renderer`
   - `[app] 3D background renderer initialized successfully`
   - `[app] Loading 3D scene for area: <areaId>`
   - `[app] 3D scene loaded successfully`

4. **Visual Verification**:
   - 2D game elements should be transparent, showing 3D background underneath
   - 3D camera should follow game camera movement with parallax effect
   - Mouse/touch input should work on 2D elements (3D canvas has pointer-events: none)

## Additional Resources

- **[Three.js 3D Background Integration Guide](THREEJS_3D_BACKGROUND_INTEGRATION_GUIDE.md)** - Comprehensive guide for integrating 3D scenes as game backgrounds
- [3D Map Builder](3Dmapbuilder.html) - Visual map creation tool
- [Gameplay Map Editor](gameplay-map-editor.html) - Grid-based gameplay editing
- [Migration Guide](DEPRECATED_PARALLAX_TO_3D_MIGRATION.md) - Migrating from 2D parallax
- [Three.js Offline Test](three-offline-test.html) - Test Three.js integration
- [Three.js Integration Smoke Test](three-integration-smoke.html) - Automated integration verification

## License

This module is part of the SoK Empire Prologue project and follows the project's license.
