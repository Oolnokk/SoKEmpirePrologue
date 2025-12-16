# Testing the Unified 3D/2D Scaling System

## Overview
This document describes how to test the unified scaling system that ensures 3D and 2D elements scale together at the same rate, regardless of aspect ratio.

## Changes Made

### 1. Configuration (docs/config/config.js)
- Added `REFERENCE_HEIGHT` constant (600px)
- Added `window.getUniformScale(currentHeight)` helper function
- Added `CONFIG.camera.referenceHeight` configuration option

### 2. 3D Renderer (docs/renderer/Renderer.js)
- Added `baseCameraDistance` property to track reference camera distance
- Modified `resize()` method to calculate uniform scale and adjust camera distance
- Formula: `newDistance = baseDistance / uniformScale`
- FOV remains constant at 50 degrees

### 3. 2D Sprite Rendering (docs/js/sprites.js)
- Modified `renderSprites()` to calculate uniform scale
- Applied to effective zoom: `effectiveZoom = zoom * uniformScale`
- Reads from `GAME.CAMERA.uniformScale` if available

### 4. Camera Sync (docs/js/app.js)
- Modified resize handler to calculate and store uniform scale
- Stored in `GAME.CAMERA.uniformScale` for cross-system access
- Initialized on renderer creation

## How to Test

### Setup
1. Open `docs/index.html` in a modern web browser
2. Ensure the game loads properly with both 3D background and 2D sprites visible

### Test 1: Aspect Ratio Changes
**Objective**: Verify that 3D and 2D elements maintain consistent relative sizes

**Steps**:
1. Open the browser's developer tools (F12)
2. Enable responsive design mode / device toolbar
3. Test the following aspect ratios:
   - Wide: 1920x600 (3.2:1)
   - Standard: 1280x720 (16:9)
   - Square: 800x800 (1:1)
   - Tall: 600x1000 (0.6:1)

**Expected Result**:
- 3D objects and 2D sprites should appear at the same relative size
- No visual "pop" or discontinuity when resizing
- Ground plane alignment should remain consistent

### Test 2: Zoom Controls
**Objective**: Verify zoom affects both 3D and 2D equally

**Steps**:
1. Use the game's zoom controls (if available) or adjust `GAME.CAMERA.zoom` in console
2. Try different zoom values: 0.5, 0.75, 1.0, 1.25, 1.5

**Expected Result**:
- Both 3D and 2D should zoom in/out together
- Relative sizes should remain consistent
- No misalignment between 3D and 2D layers

### Test 3: Window Resize
**Objective**: Verify smooth scaling during live window resize

**Steps**:
1. Drag the browser window to resize it
2. Try both making it wider/narrower and taller/shorter
3. Observe the visual behavior during the resize

**Expected Result**:
- Smooth transitions without visual artifacts
- No "jumping" or misalignment
- Consistent element sizes maintained

### Test 4: Developer Console Verification
**Objective**: Verify the uniform scale is calculated correctly

**Steps**:
1. Open browser console (F12)
2. Check the uniform scale value:
   ```javascript
   console.log('Uniform Scale:', window.GAME?.CAMERA?.uniformScale);
   console.log('Canvas Height:', document.querySelector('canvas')?.height);
   console.log('Reference Height:', window.CONFIG?.camera?.referenceHeight || 600);
   ```

**Expected Result**:
- Uniform scale should equal `canvasHeight / referenceHeight`
- For 720px height with 600px reference: scale should be 1.2
- For 600px height with 600px reference: scale should be 1.0
- For 480px height with 600px reference: scale should be 0.8

### Test 5: Camera Position Check
**Objective**: Verify 3D camera distance adjusts correctly

**Steps**:
1. Open browser console (F12)
2. Get the renderer instance:
   ```javascript
   const renderer = window.GAME_RENDERER_3D;
   console.log('Base Camera Distance:', renderer?.baseCameraDistance);
   console.log('Current Camera Z:', renderer?.camera?.position.z);
   console.log('Uniform Scale:', window.GAME?.CAMERA?.uniformScale);
   ```

**Expected Result**:
- Camera Z position should equal `baseCameraDistance / uniformScale`
- As viewport gets taller (uniformScale > 1), camera should move closer (lower Z)
- As viewport gets shorter (uniformScale < 1), camera should move farther (higher Z)

## Troubleshooting

### Issue: 3D and 2D sizes don't match
**Check**:
- Verify `GAME.CAMERA.uniformScale` is set correctly
- Check that both renderer resize and sprite rendering are using the scale
- Inspect console for any JavaScript errors

### Issue: Zoom doesn't work correctly
**Check**:
- Verify `effectiveZoom = zoom * uniformScale` in sprites.js
- Check that existing zoom controls are still functional
- Ensure GAME.CAMERA.zoom is being set properly

### Issue: Visual artifacts during resize
**Check**:
- Verify resize handler is properly calculating uniform scale
- Check that camera position updates are smooth
- Look for any race conditions between 3D and 2D updates

## Success Criteria

The implementation is successful if:
- ✅ 3D and 2D elements maintain consistent relative sizes across all aspect ratios
- ✅ Zooming affects both systems equally
- ✅ No visual "pop" or discontinuity when resizing
- ✅ Existing gameplay and camera controls continue to work as expected
- ✅ No regressions in automated tests (311 passing, 23 pre-existing failures unchanged)

## Technical Details

### Uniform Scale Formula
```
uniformScale = currentHeight / referenceHeight
```

### 3D Camera Distance Adjustment
```
newDistance = baseCameraDistance / uniformScale
```

### 2D Effective Zoom
```
effectiveZoom = zoom * uniformScale
```

### Reference Points
- Both 3D and 2D use the same canvas dimensions
- Ground line calculation: `computeGroundY(C, { canvasHeight })`
- Transform origin for 2D: `(-effectiveZoom * camX, groundLine * (1 - effectiveZoom))`

## Files Modified
- `docs/config/config.js` - Reference height and helper function
- `docs/renderer/Renderer.js` - 3D camera distance adjustment
- `docs/js/sprites.js` - 2D sprite uniform scaling
- `docs/js/app.js` - Resize handler and initialization
- `src/renderer/Renderer.js` - Mirror of docs changes

## Notes
- The system is backward compatible with existing zoom controls
- Reference height is configurable via `CONFIG.camera.referenceHeight`
- Uniform scale is stored in `GAME.CAMERA.uniformScale` for cross-system access
- No changes needed to scene3d.js - camera distance adjustment handles it
