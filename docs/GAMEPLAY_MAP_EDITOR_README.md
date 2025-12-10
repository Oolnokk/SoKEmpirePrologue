# Gameplay Map Editor - 3D Visual Map Feature

## Overview

The Gameplay Map Editor now supports loading 3D visual maps as a background reference. This feature allows designers to align gameplay elements (spawners, patrols, colliders, etc.) with their visual counterparts from the 3D environment.

## How to Use

1. **Open the Gameplay Map Editor**
   - Navigate to `docs/gameplay-map-editor.html` in your browser
   - Or access it from the main menu: "Open Gameplay Map Editor"

2. **Load a Visual Map**
   - Click the "🎨 Load Visual Map" button in the toolbar
   - Select a visual map JSON file from `docs/config/maps/visualsmaps/`
   - Example: `defaultdistrict3D_visualsmap.json`

3. **Alignment**
   - The 3D environment automatically aligns with the gameplayPath defined in the visual map
   - The gameplayPath (start/end points) from the visual map matches the horizontal ground line in the editor
   - Camera automatically positions to show the gameplay area

4. **Editing**
   - Place gameplay entities (spawners, patrols, colliders) on the 2D canvas
   - The 3D background helps visualize where these elements fit in the actual environment
   - The 2D canvas is transparent, allowing you to see the 3D scene beneath

5. **Clear Visual Map**
   - Click the "❌ Clear" button to remove the 3D background
   - This reverts to the standard 2D-only editing mode

## Visual Map Format

Visual maps must include a `gameplayPath` property:

```json
{
  "version": 4,
  "rows": 20,
  "cols": 20,
  "gameplayPath": {
    "start": { "row": 10, "col": 0 },
    "end": { "row": 10, "col": 19 }
  },
  "alignWorldToPath": true,
  "layerStates": {
    "ground": [...],
    "structure": [...],
    "decoration": [...]
  }
}
```

## Technical Details

### Alignment Logic

1. **Path Calculation**: The editor calculates the angle of the gameplayPath from start to end
2. **World Rotation**: If `alignWorldToPath` is true, the 3D world rotates so the path aligns horizontally
3. **Camera Positioning**: Camera centers on the gameplay path for optimal viewing
4. **Ground Line Matching**: The editor's 2D ground line represents the same gameplay axis as the 3D path

### Rendering

- **3D Viewport**: Behind the 2D canvas, rendered with Three.js
- **Layers**: Ground, structure, and decoration layers from the visual map are rendered as 3D meshes
- **Lighting**: Hemisphere and directional lighting for better depth perception
- **Transparency**: 2D canvas has transparent background to see through to 3D scene

### Coordinate System

- **Visual Map**: Grid-based (rows/cols), with configurable cell size
- **Gameplay Map**: World coordinates (x, y in world units)
- **Alignment**: The gameplayPath in the visual map corresponds to the ground line in the gameplay editor

## Browser Compatibility

The 3D feature requires:
- Modern browser with ES6 module support
- WebGL support for Three.js rendering
- Internet connection to load Three.js from CDN

If Three.js cannot be loaded (e.g., CDN blocked), the editor gracefully degrades to 2D-only mode with a message displayed.

## Limitations

- Visual map must have a valid `gameplayPath` with start/end points
- 3D rendering is for reference only - actual visual asset rendering is handled by the game engine
- Performance depends on visual map complexity (grid size, number of layers)

## Examples

See `docs/config/maps/visualsmaps/defaultdistrict3D_visualsmap.json` for a complete visual map example that can be loaded as a background reference.
