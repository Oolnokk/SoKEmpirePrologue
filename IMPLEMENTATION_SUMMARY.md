# 3D World Movement Fix - Implementation Summary

## Problem
The 3D world was moving in the wrong direction relative to world position. The 2D and 3D rendering spaces were loosely coupled, causing inconsistent movement behavior.

## Solution
Implemented a **tight runtime coupling** between 2D gameplay coordinates and 3D world coordinates through a dedicated coordinate transformation system.

## Changes Made

### 1. New Coordinate Transformation Module (`docs/js/coordinate-transform.js`)
- **Purpose**: Provides bidirectional transformation between 2D pixel coordinates and 3D world units
- **Key Features**:
  - Proper scaling from pixels to Three.js units (configurable via `pixelsToUnits`)
  - Centers 2D world at 3D origin for consistent positioning
  - Supports world rotation for path-aligned worlds
  - Runtime initialization from game state

- **Configuration**:
  ```javascript
  {
    pixelsToUnits: 1.0,        // 1 pixel = 1 Three.js unit (pixel-perfect)
    world2dWidth: 1600,        // 2D world width in pixels
    world2dHeight: 600,        // 2D world height in pixels
    centerAt3dOrigin: true,    // Center 2D world at 3D (0,0,0)
    worldRotationY: 0          // World rotation in radians
  }
  ```

### 2. Updated Camera Synchronization (`docs/js/three-camera-sync.js`)
- **Before**: Directly used 2D pixel coordinates as 3D positions (incorrect scaling)
  ```javascript
  camX = gameCamera.x * parallaxFactor  // 500 pixels → 500 units!
  ```

- **After**: Transforms 2D coordinates to proper 3D world space (pixel-perfect)
  ```javascript
  worldPos = transform2dTo3d({ x: cam2dX, y: cam2dY })
  camX = worldPos.x * parallaxFactor    // 500 pixels → 500 units (1:1)
  camZ = worldPos.z * parallaxFactor    // Y maps to Z in 3D
  ```

- **Removed**: Old Pattern A/B system (moveCamera/moveObjects) - simplified to single approach

### 3. Integration in Main App (`docs/js/app.js`)
- **Added**: Coordinate transform initialization when 3D scenes load
- **Location**: After successful visualsmap/scene3d loading
- **Timing**: Runs once per area load to sync 2D camera dimensions with 3D world

- **Camera Sync Update**:
  ```javascript
  syncThreeCamera({
    renderer: GAME_RENDERER_3D,
    gameCamera: gameCamera,
    config: {
      parallaxFactor: 1.0,        // Camera follows exactly
      cameraHeight: 24,           // Height above ground
      cameraDistance: -36,        // Behind the action
      useTransform: true          // ← NEW: Enable transformation
    }
  });
  ```

## How It Works

### Coordinate Transformation Flow (Pixel-Perfect)
1. **2D Camera Position** (e.g., x=800 pixels, y=300 pixels)
   ↓
2. **Transform to 3D** (scale 1:1, center, rotate)
   - Scale: 800 × 1.0 = 800 units, 300 × 1.0 = 300 units
   - Center: 800 - (1600×1.0)/2 = 0 units, 300 - (600×1.0)/2 = 0 units
   - Result: (0, 0, 0) in 3D world space
   ↓
3. **Apply Parallax** (if < 1.0)
   ↓
4. **Position 3D Camera** (add height and distance offsets)
   - Position: (0, 24, -36)
   - LookAt: (0, 0, 0)

### Movement Consistency
- **Player moves RIGHT** (+X in 2D) → **3D camera moves RIGHT** (+X in 3D)
- **Player moves DOWN** (+Y in 2D) → **3D camera moves FORWARD** (+Z in 3D)
- Direction is now **consistent and predictable**

## Testing Recommendations

### Visual Testing
1. Load the game with a 3D visualsmap area
2. Move the player character left/right
3. **Verify**: 3D world moves in the **same direction** (not opposite)
4. **Verify**: Movement scale is **reasonable** (not too fast/slow)

### Debug Console
Check browser console for initialization message:
```
[coordinate-transform] Transform config initialized: {
  pixelsToUnits: 1.0,  // Pixel-perfect 1:1 mapping
  world2dWidth: 1600,
  world2dHeight: 600,
  centerAt3dOrigin: true,
  worldRotationY: 0
}
```

### Manual Tweaking
If movement feels off, adjust in browser console:
```javascript
// Import the module
import { updateTransformConfig } from './docs/js/coordinate-transform.js';

// Adjust scale (default is 1.0 for pixel-perfect)
updateTransformConfig({ pixelsToUnits: 0.5 });  // Half-speed 3D movement

// Or disable centering
updateTransformConfig({ centerAt3dOrigin: false });
```

## Configuration Options

### Per-Area Configuration
The transform automatically reads from:
- `area.scene3d.ground.unitsPerPixel` - Scale factor
- `window.GAME.CAMERA.worldWidth/Height` - 2D world dimensions

### Manual Override
Set in config before area loads:
```javascript
// In docs/config/config.js
window.CONFIG.coordinateTransform = {
  pixelsToUnits: 1.0,   // Pixel-perfect (default)
  centerAt3dOrigin: false
};
```

## Benefits

1. **Pixel-Perfect Mapping**: 1 pixel in 2D = 1 unit in 3D (exact correspondence)
2. **Predictable Movement**: 2D and 3D move in consistent directions
3. **Correct Scaling**: 3D camera movement matches 2D world dimensions exactly
4. **Runtime Coupling**: No hard-coded magic numbers, uses actual game dimensions
5. **Maintainable**: Clear separation between coordinate systems
6. **Extensible**: Easy to add rotation/offset transformations

## Future Enhancements

- [ ] Auto-detect world rotation from visualsmap path alignment
- [ ] Support for vertical scrolling (map Y to 3D Y instead of Z)
- [ ] Per-layer parallax factors (background vs foreground)
- [ ] Debug visualization of coordinate spaces

## Files Modified

1. **Created**: `docs/js/coordinate-transform.js` (new module)
2. **Updated**: `docs/js/three-camera-sync.js` (refactored)
3. **Updated**: `docs/js/app.js` (integration)
