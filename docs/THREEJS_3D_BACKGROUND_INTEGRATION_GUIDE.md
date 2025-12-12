# Integrating a Three.js 3D Scene as a 2D Game Background

This guide explains how to properly integrate a Three.js 3D scene as a background layer behind your 2D side-scrolling game. It covers the essential setup, common pitfalls, and best practices for layering 3D content beneath 2D gameplay elements.

## Table of Contents

1. [3D Editor Setup Essentials](#3d-editor-setup-essentials)
2. [What Can Break When Reusing the 3D Scene](#what-can-break-when-reusing-the-3d-scene)
3. [Correctly Layering the 3D Scene Behind a 2D Game](#correctly-layering-the-3d-scene-behind-a-2d-game)
4. [Why Three.js Is Still Required](#why-threejs-is-still-required)
5. [Integration Checklist](#integration-checklist)

## 3D Editor Setup Essentials

A Three.js-based editor like [3Dmapbuilder.html](3Dmapbuilder.html) sets up a full 3D rendering context. Understanding these initialization steps is crucial for replicating the setup in your game.

### Loading Three.js

The editor ensures the Three.js library is available (via module import or script tag). If Three.js fails to load, the editor falls back to 2D-only mode.

```javascript
import { isSupported } from '../src/renderer/index.js';

if (!isSupported()) {
  console.warn('Three.js not available - falling back to 2D mode');
}
```

### Creating a Scene and Camera

The editor creates a `THREE.Scene()` and typically a `THREE.PerspectiveCamera` with suitable field of view (FOV), aspect ratio, and near/far clipping planes.

**Example camera setup:**
```javascript
const camera = new THREE.PerspectiveCamera(
  45,                              // FOV in degrees
  container.width / container.height, // aspect ratio
  0.1,                             // near clipping plane
  500                              // far clipping plane
);
camera.position.set(0, 30, 50);    // Position camera above and behind
camera.lookAt(0, 0, 0);            // Look at scene origin
```

This camera setup ensures the 3D content is visible from an appropriate angle.

### Initializing the Renderer

A `THREE.WebGLRenderer` is created with antialiasing enabled for smoother edges:

```javascript
const renderer = new THREE.WebGLRenderer({ 
  antialias: true,
  alpha: true  // Enable transparency if needed
});
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);  // High-DPI displays
renderer.outputColorSpace = THREE.SRGBColorSpace;  // Correct color rendering
```

**Critical:** The renderer's canvas (`renderer.domElement`) must be attached to the DOM:

```javascript
container.appendChild(renderer.domElement);
```

If this canvas element is not added to the DOM, nothing will appear on screen.

### Lighting and Scene Content

The editor adds lights and default objects for visible content:

```javascript
// Ambient light for base illumination
const hemisphereLight = new THREE.HemisphereLight(0xffffff, 0x444444, 0.6);
scene.add(hemisphereLight);

// Directional light for shadows
const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
directionalLight.position.set(10, 50, 10);
directionalLight.castShadow = true;
scene.add(directionalLight);

// Ground plane (rotated flat)
const groundGeometry = new THREE.PlaneGeometry(100, 100);
const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
const ground = new THREE.Mesh(groundGeometry, groundMaterial);
ground.rotation.x = -Math.PI / 2;  // Rotate to horizontal
ground.receiveShadow = true;
scene.add(ground);
```

### Animation Loop

The editor starts a render loop via `requestAnimationFrame`:

```javascript
function animate() {
  requestAnimationFrame(animate);
  renderer.render(scene, camera);
}
animate();
```

**This loop is crucial** — without it, the scene would only render once or not update.

### Handling Resizing

The editor listens for window resize events:

```javascript
window.addEventListener('resize', () => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});
```

Without this, the 3D canvas might not fill the intended area or maintain correct proportions.

### DOM Layering for 3D vs 2D

In the editor's UI, the 3D viewport canvas is placed behind the 2D editing canvas:

```html
<div id="container" style="position: relative;">
  <!-- 3D canvas (background) -->
  <div id="threeViewport" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;"></div>
  
  <!-- 2D canvas (foreground) -->
  <canvas id="editorCanvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: transparent;"></canvas>
</div>
```

The 2D canvas has a transparent background so the 3D scene shows through underneath.

## What Can Break When Reusing the 3D Scene

When integrating the 3D scene into a new page (e.g., as a background for a side-scroller), several things can go wrong if you don't replicate the editor's setup exactly:

### 1. Missing Three.js or Scene Initialization

**Problem:** The exported scene data isn't self-rendering — it needs Three.js to interpret and draw it.

**Solution:** Include the Three.js library and recreate the scene, camera, and renderer in your game page.

```javascript
// Check for Three.js availability
import { isSupported } from '../src/renderer/index.js';

if (!isSupported()) {
  console.error('Three.js required for 3D background');
}
```

### 2. No Camera or Incorrect Camera Setup

**Problem:** Not positioning the camera or calling `camera.lookAt` can leave the camera inside an object or facing away, resulting in a blank screen.

**Solution:** Replicate the editor's camera configuration:

```javascript
renderer.setCameraParams({
  position: { x: 0, y: 30, z: 50 },
  lookAt: { x: 0, y: 0, z: 0 },
  fov: 45
});
```

### 3. Canvas Not Added or Layered Wrong

**Problem:** The Three.js canvas isn't inserted into the DOM at the correct place, or it has incorrect z-index.

**Solution:** Place the 3D canvas behind the game elements:

```javascript
// Create background container
const backgroundDiv = document.createElement('div');
backgroundDiv.id = '3d-background';
backgroundDiv.style.cssText = `
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
`;

// Insert before game content
gameContainer.insertBefore(backgroundDiv, gameContainer.firstChild);

// Attach renderer canvas
backgroundDiv.appendChild(renderer.domElement);
```

### 4. No Transparency or Wrong Background

**Problem:** Renderer or game canvas isn't transparent when it should be, showing solid colors instead of the 3D scene.

**Solution:** Enable alpha channel and set appropriate backgrounds:

```javascript
// Enable transparency in renderer
const renderer = new THREE.WebGLRenderer({ alpha: true });

// Set scene background or leave transparent
scene.background = new THREE.Color(0x0f172a);  // Or null for transparency

// Ensure 2D canvas doesn't block view
gameCanvas.style.background = 'transparent';
```

### 5. No Animation Loop

**Problem:** The 3D scene isn't continuously rendering, making it static or blank.

**Solution:** Tie into your game loop or use `requestAnimationFrame`:

```javascript
function gameLoop() {
  // Update game logic
  updateGame();
  
  // Render 3D background
  renderer.render(scene, camera);
  
  // Render 2D game
  render2DGame();
  
  requestAnimationFrame(gameLoop);
}
gameLoop();
```

### 6. No Resize Handling

**Problem:** Failing to handle resize can break aspect ratio or leave black bars.

**Solution:** Update camera and renderer on resize:

```javascript
window.addEventListener('resize', () => {
  const width = gameContainer.clientWidth;
  const height = gameContainer.clientHeight;
  
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
});
```

### 7. Coordinate Space Mismatch

**Problem:** 3D world doesn't align with 2D game coordinates, making the background look misaligned.

**Solution:** Use the same coordinate mapping as the editor. The [Gameplay Map Editor](gameplay-map-editor.html) aligns the 3D world with the 2D gameplay grid:

```javascript
// Example: Convert 2D game coordinates to 3D world position
function convertTo3DPosition(gameX, gameY) {
  // Use the same scale as visual map (e.g., 1 grid unit = 2 meters)
  const scale = 2.0;
  return {
    x: gameX * scale,
    y: 0,  // Ground level
    z: gameY * scale
  };
}
```

### 8. Layering and Z-Index Issues

**Problem:** 3D canvas doesn't sit behind the game, overlapping UI or blocking input.

**Solution:** Establish correct stacking context:

```javascript
// Game container
gameContainer.style.position = 'relative';
gameContainer.style.zIndex = '1';

// 3D background
backgroundDiv.style.position = 'absolute';
backgroundDiv.style.zIndex = '0';

// Ensure 3D canvas doesn't block input
renderer.domElement.style.pointerEvents = 'none';
```

### 9. Pointer Events Blocking Input

**Problem:** The Three.js canvas intercepts mouse/touch events, preventing clicks in your game's UI.

**Solution:** Disable pointer events on the 3D canvas:

```javascript
renderer.domElement.style.pointerEvents = 'none';
```

### 10. Z-Fighting (Depth Conflicts)

**Problem:** Flickering between surfaces due to z-fighting.

**Solution:** Use reasonable near/far clipping planes and keep 2D/3D rendering separate:

```javascript
const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 500);
```

By rendering 3D and 2D to separate canvases with proper layering, you avoid z-fighting between them.

## Correctly Layering the 3D Scene Behind a 2D Game

To integrate the 3D scene as a background, render it to a canvas that sits behind your 2D game elements.

### Using Separate Layers

The simplest method is two HTML elements:
1. Three.js canvas (background)
2. Game canvas or DOM elements (foreground)

```html
<div id="gameStage" style="position: relative; width: 100%; height: 100vh;">
  <!-- 3D Background -->
  <div id="3d-background" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;"></div>
  
  <!-- 2D Game -->
  <canvas id="gameCanvas" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; background: transparent;"></canvas>
  
  <!-- UI Elements -->
  <div id="gameUI" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 2;"></div>
</div>
```

### CSS Positioning

Style the 3D canvas to fill the screen behind the game:

```css
#3d-background {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none; /* Don't block game input */
}

#gameCanvas {
  position: relative;
  z-index: 1;
  background: transparent;
}
```

### Transparent Game Canvas or Layers

If your 2D game is rendered on a canvas, ensure it has a transparent background:

```javascript
// Canvas 2D context - don't clear with opaque color
ctx.clearRect(0, 0, canvas.width, canvas.height);  // Transparent clear

// Or if using fillRect, use transparent color
ctx.fillStyle = 'rgba(0, 0, 0, 0)';
```

### Pointer Events and Interactivity

Disable pointer events on the 3D canvas so it doesn't block input:

```javascript
renderer.domElement.style.pointerEvents = 'none';
```

Your 2D game will receive input as normal, while the 3D background remains purely visual.

### Synchronizing Game Camera with 3D Camera

As the player moves in your side-scroller, update the 3D camera to create parallax:

#### Method 1: Move the 3D Camera

```javascript
function updateBackgroundCamera(gameCamera) {
  // Calculate 3D camera position based on game camera
  const scale = 0.5;  // Parallax factor
  const x = gameCamera.x * scale;
  const z = 50;  // Fixed distance from scene
  
  renderer.setCameraParams({
    position: { x, y: 30, z },
    lookAt: { x, y: 0, z: 0 }
  });
}
```

#### Method 2: Move 3D Objects

Keep the camera fixed and translate the 3D world:

```javascript
function updateBackgroundWorld(gameCamera) {
  worldRoot.position.x = -gameCamera.x * 0.5;
}
```

The first method (moving camera) is usually more straightforward for side-scrolling.

### Checking Layer Order in Browser DevTools

Use DevTools to inspect elements and verify:
1. Three.js canvas exists and is visible
2. It has lower z-index than game elements
3. It's positioned correctly (covers the intended area)

## Why Three.js Is Still Required

Even if the editor produces visual output, you still need Three.js to render the scene in your game.

### Scene Data vs. Scene Rendering

The editor exports a JSON describing object positions, dimensions, colors, etc., or a `THREE.Scene` object in memory. **This is just the description** of the 3D world — Three.js is the engine that draws it with WebGL.

Without Three.js, the JSON or scene object has no way to display itself. It's comparable to having a 3D model file — you still need a 3D viewer to see it.

```javascript
// Load scene descriptor
const scene3dDescriptor = await fetch('/config/maps/visualsmaps/mymap.json').then(r => r.json());

// Three.js is required to render it
import { createRenderer } from '../src/renderer/index.js';
import { adaptScene3dToRenderer } from '../src/map/rendererAdapter.js';

const renderer = createRenderer({ container: backgroundDiv });
await renderer.init();

const adapted = await adaptScene3dToRenderer(renderer, scene3dDescriptor);
renderer.start();
```

### No "Baked" Graphics

Unless the editor provided an actual image or video (which it doesn't, since it's interactive), there's nothing for the browser to draw on its own. The Three.js canvas is dynamically drawn each frame.

When you integrate into your game, you need to instantiate Three.js and rerun the setup to render the scene in real time.

### Reusing the Editor's Code

You have two choices:

1. **Use the renderer module** (recommended):
   ```javascript
   import { createRenderer } from '../src/renderer/index.js';
   import { adaptScene3dToRenderer } from '../src/map/rendererAdapter.js';
   ```

2. **Write your own Three.js initialization** that loads the editor's exported data

The renderer module approach is recommended as it provides safe fallbacks when Three.js is unavailable. See [renderer-README.md](renderer-README.md) for full API documentation.

## Integration Checklist

To achieve an identical appearance and behavior for the 3D scene in your side-scrolling game, follow this checklist:

### 1. Include Three.js and Initialization Code

- [ ] Load Three.js library (same version as editor if possible)
- [ ] Import or write setup code for scene, camera, renderer, lights, and objects
- [ ] Set camera FOV, near/far clipping, and position matching the editor

**Example:**
```javascript
import { createRenderer } from '../src/renderer/index.js';

const renderer = createRenderer({
  container: document.getElementById('3d-background'),
  width: window.innerWidth,
  height: window.innerHeight,
  clearColor: 0x0f172a
});

await renderer.init();
```

### 2. Build or Load the 3D Scene Content

- [ ] Use editor's output data (JSON) to add meshes to the scene
- [ ] Create same ground, structures, decorations with matching geometry/materials
- [ ] Add lights matching the editor (hemisphere light, directional light, etc.)

**Example:**
```javascript
import { adaptScene3dToRenderer } from '../src/map/rendererAdapter.js';

const scene3d = {
  sceneUrl: '/config/maps/visualsmaps/defaultdistrict3d_visualsmap.glb',
  ground: { planeZ: 0, unitsPerPixel: 1 }
};

const adapted = await adaptScene3dToRenderer(renderer, scene3d);
```

### 3. Match Coordinate Alignment

- [ ] Apply same world rotation/scaling as editor to align with 2D plane
- [ ] Use same unit conversions (CELL_SIZE, etc.) for consistent distances
- [ ] Ensure 3D coordinates correspond correctly to 2D pixel/unit positions

**Example:**
```javascript
// If editor rotates worldRoot to align orientation
worldRoot.rotation.y = Math.PI / 2;
```

### 4. Create Container and Insert Renderer Canvas

- [ ] Create HTML element (div) to hold the Three.js canvas
- [ ] Position it behind game content (first element or low z-index)
- [ ] Style with absolute positioning (top:0, left:0, width:100%, height:100%)
- [ ] Append renderer.domElement to container
- [ ] Ensure game's main layer has higher z-index

**Example:**
```javascript
const backgroundDiv = document.createElement('div');
backgroundDiv.id = '3d-background';
backgroundDiv.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 0;';
gameContainer.insertBefore(backgroundDiv, gameContainer.firstChild);
backgroundDiv.appendChild(renderer.domElement);
```

### 5. Enable Transparency if Needed

- [ ] Set `{ alpha: true }` when creating WebGLRenderer if transparency needed
- [ ] Set scene.background to color or null as appropriate
- [ ] Ensure 2D canvas doesn't paint opaque background over 3D scene

**Example:**
```javascript
const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
scene.background = new THREE.Color(0x0f172a);  // Or null for full transparency
```

### 6. Start the Render Loop

- [ ] Invoke animation loop to continuously render scene
- [ ] Integrate with game's loop or use requestAnimationFrame
- [ ] Call renderer.render(scene, camera) every frame

**Example:**
```javascript
renderer.start();  // Uses internal requestAnimationFrame loop

// Or integrate with game loop
function gameLoop() {
  renderer.render(scene, camera);  // Manual render
  requestAnimationFrame(gameLoop);
}
```

### 7. Handle Resizing and Aspect Ratio

- [ ] Attach resize handler to update 3D renderer
- [ ] Update camera.aspect and call camera.updateProjectionMatrix()
- [ ] Call renderer.setSize(newWidth, newHeight)

**Example:**
```javascript
window.addEventListener('resize', () => {
  const width = container.clientWidth;
  const height = container.clientHeight;
  renderer.resize(width, height);
});
```

### 8. Layering and CSS

- [ ] Apply CSS to enforce 3D canvas behind game content
- [ ] Use position: absolute (or fixed) for 3D canvas
- [ ] Set game canvas/elements with higher z-index
- [ ] Set pointer-events: none on renderer.domElement

**Example:**
```javascript
renderer.domElement.style.pointerEvents = 'none';
renderer.domElement.style.zIndex = '0';
gameCanvas.style.zIndex = '1';
```

### 9. Replicate Camera Positioning Logic

- [ ] Copy editor's camera auto-adjustment logic if present
- [ ] Position camera to look at center of gameplay path
- [ ] Set appropriate height/distance for desired view

**Example:**
```javascript
renderer.setCameraParams({
  position: { x: 0, y: 30, z: 50 },
  lookAt: { x: 0, y: 0, z: 0 }
});
```

### 10. Test and Tune

- [ ] Test on various devices and window sizes
- [ ] Verify performance is acceptable (simplify scene if needed)
- [ ] Check that 3D aligns with 2D gameplay visually
- [ ] Verify UI and interactive elements still work
- [ ] Adjust camera offset or world alignment as needed

## Additional Resources

- [Renderer Module API Documentation](renderer-README.md) - Complete API reference
- [3D Map Builder](3Dmapbuilder.html) - Visual map creation tool
- [Gameplay Map Editor](gameplay-map-editor.html) - Grid-based gameplay editing
- [Migration Guide](DEPRECATED_PARALLAX_TO_3D_MIGRATION.md) - Migrating from 2D parallax
- [Three.js Offline Test](three-offline-test.html) - Test Three.js integration

## Example: Complete Integration

Here's a complete example of integrating the 3D background into a game:

```javascript
import { createRenderer, isSupported } from '../src/renderer/index.js';
import { adaptScene3dToRenderer } from '../src/map/rendererAdapter.js';

// Check Three.js support
if (!isSupported()) {
  console.warn('Three.js not available - 3D background disabled');
  // Fall back to 2D-only mode
  return;
}

// Setup 3D background container
const gameContainer = document.getElementById('gameStage');
const backgroundDiv = document.createElement('div');
backgroundDiv.id = '3d-background';
backgroundDiv.style.cssText = `
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
`;
gameContainer.insertBefore(backgroundDiv, gameContainer.firstChild);

// Create renderer
const renderer = createRenderer({
  container: backgroundDiv,
  width: window.innerWidth,
  height: window.innerHeight,
  clearColor: 0x0f172a
});

// Initialize
await renderer.init();

// Handle ready event
renderer.on('ready', (event) => {
  if (event.supported) {
    console.log('3D background initialized');
  } else {
    console.warn('Renderer in no-op mode');
  }
});

// Load scene from area configuration
const area = mapRegistry.getArea('defaultdistrict3d');
if (area.scene3d && area.scene3d.sceneUrl) {
  const adapted = await adaptScene3dToRenderer(renderer, area.scene3d);
  
  if (adapted.root) {
    console.log('3D scene loaded and rendered');
  }
}

// Start rendering
renderer.start();

// Disable pointer events on 3D canvas
renderer.domElement.style.pointerEvents = 'none';

// Sync camera with game
renderer.on('frame', () => {
  // Update 3D camera position based on game camera
  const gameCamera = window.GAME.camera;
  if (gameCamera) {
    const parallaxFactor = 0.5;
    renderer.setCameraParams({
      position: {
        x: gameCamera.x * parallaxFactor,
        y: 30,
        z: 50
      },
      lookAt: {
        x: gameCamera.x * parallaxFactor,
        y: 0,
        z: 0
      }
    });
  }
});

// Handle window resize
window.addEventListener('resize', () => {
  renderer.resize(window.innerWidth, window.innerHeight);
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
  renderer.dispose();
});
```

## Troubleshooting

### 3D Background Not Visible

1. **Check Three.js is loaded**: `console.log(globalThis.THREE)`
2. **Verify canvas is in DOM**: Inspect element in DevTools
3. **Check z-index**: Ensure 3D container has lower z-index than game
4. **Verify render loop is running**: Add console.log in frame event
5. **Check camera position**: Camera might be inside an object

### Performance Issues

1. **Reduce polygon count**: Simplify 3D models
2. **Disable shadows**: Set `castShadow` and `receiveShadow` to false
3. **Lower resolution**: Reduce renderer pixel ratio
4. **Limit draw distance**: Reduce camera far clipping plane

### Input Not Working

1. **Check pointer-events**: Set `pointer-events: none` on 3D canvas
2. **Verify z-index**: Ensure game elements are above 3D background
3. **Check stacking context**: Parent must be positioned (relative/absolute)

## Conclusion

Integrating a Three.js 3D scene as a 2D game background requires careful attention to:
- Proper Three.js initialization and setup
- Correct DOM layering and CSS positioning
- Synchronized camera movement with game logic
- Transparent backgrounds and input handling

By following this guide and checklist, you can achieve a rich 3D backdrop that enhances your 2D game without interfering with gameplay or UI interactions.

For implementation examples, see the [3D Map Builder](3Dmapbuilder.html) and [Gameplay Map Editor](gameplay-map-editor.html) which demonstrate these techniques in practice.
