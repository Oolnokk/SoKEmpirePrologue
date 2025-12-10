# Migration Guide: Legacy Parallax to 3D Visual Maps

This guide helps you migrate from the legacy 2D parallax pipeline to the current 3D visual maps workflow.

## Overview

The legacy parallax system used layered 2D sprites with parallax scrolling. The current system uses:
- **3D glTF models** for ground segments and structures
- **Grid-based placement** with a 20×20 tile system
- **Visual map JSON** stored in `/config/maps/visualsmaps/`
- **Separation** between gameplay data and visual representation

## Key Differences

| Legacy Parallax | Current 3D Visual Maps |
|-----------------|------------------------|
| Layered 2D sprites | 3D glTF/GLB models |
| Parallax scrolling | Perspective-correct 3D rendering |
| Combined gameplay+visuals | Separated GameplayMap + EnvironmentMap |
| `docs/assets/parallax/` | `docs/assets/3D/` |
| No standard format | JSON schema with versioning |

## Migration Steps

### 1. Export Existing Parallax Map

If you have an existing parallax map from the old editor:

1. Open the old parallax editor
2. Export the map as JSON
3. Note the layer structure and instance positions

### 2. Prepare 3D Assets

Convert your 2D sprites to 3D models or source new ones:

1. **Ground segments**: Roads, sidewalks, terrain tiles
   - Place glTF files in `docs/assets/3D/ground_segments/`
   - Recommended scale: 0.25×0.25×0.25
   
2. **Structures**: Buildings, towers, props
   - Place glTF files in `docs/assets/3D/structures/`
   - Scale varies by asset

### 3. Register Assets in Index

Edit `/config/maps/visualsmaps/index.json`:

```json
{
  "version": "1.0.0",
  "segments": [
    {
      "id": "my_road",
      "label": "My Road",
      "layer": "ground",
      "gltfPath": "assets/3D/ground_segments/my_road.gltf",
      "baseScale": { "x": 0.25, "y": 0.25, "z": 0.25 },
      "yOffset": 0,
      "forwardOffsetDeg": 0,
      "instanceDefaults": { 
        "orientation": 0, 
        "scaleX": 1, "scaleY": 1, "scaleZ": 1,
        "offsetX": 0, "offsetY": 0 
      },
      "extraConfig": { "rotationX": -90 }
    }
  ],
  "structures": [
    {
      "id": "my_building",
      "label": "My Building",
      "layer": "structure",
      "gltfPath": "assets/3D/structures/my_building.gltf",
      "baseScale": { "x": 0.2, "y": 0.2, "z": 0.2 },
      "yOffset": 0.12,
      "forwardOffsetDeg": 0,
      "instanceDefaults": { 
        "orientation": 0,
        "scaleX": 1, "scaleY": 1, "scaleZ": 1,
        "offsetX": 0, "offsetY": 0 
      },
      "extraConfig": { "rotationX": 90 }
    }
  ]
}
```

### 4. Create Visual Map

1. Open [3D Map Editor](map-editor.html)
2. Select ground layer and place road/sidewalk tiles
3. Select structure layer and place buildings
4. Use orientation buttons (↑→↓←) to rotate tiles
5. Adjust per-instance scaling and offsets as needed
6. Set gameplay path start/end for side-scroller axis
7. Click "Generate JSON" and copy the output
8. Save to `/config/maps/visualsmaps/mymap_visualsmap.json`

### 5. Adjust scene3d.sceneUrl Paths

The runtime now canonicalizes scene3d URLs. Update your area descriptors:

**Before (relative path):**
```javascript
{
  scene3d: {
    sceneUrl: "./assets/3D/mymap.glb"
  }
}
```

**After (will be auto-resolved to):**
```javascript
{
  scene3d: {
    sceneUrl: "/config/maps/visualsmaps/assets/3D/mymap.glb"
  }
}
```

Or use an absolute path:
```javascript
{
  scene3d: {
    sceneUrl: "/docs/assets/3D/mymap.glb"
  }
}
```

### 6. Update GameplayMap References

If you have gameplay collision data, keep it separate:

- **Visual data**: `/config/maps/visualsmaps/mymap_visualsmap.json`
- **Gameplay data**: `/config/maps/gameplaymaps/mymap_gameplaymap.json` or layout files

The runtime can load both independently.

## Common Patterns

### Converting Layer Offsets

Legacy parallax `yOffset` and `parallax` speed map to 3D coordinates:

- **Ground layer** (parallax ~1.0): Place at Z=0, yOffset=0
- **Background** (parallax <1.0): Not directly supported; use 3D depth instead
- **Foreground** (parallax >1.0): Use decoration layer with positive yOffset

### Orientation Mapping

| Legacy Direction | 3D Orientation | Editor Button |
|------------------|----------------|---------------|
| Facing right     | 0°             | ↑ (North)     |
| Facing down      | 90°            | → (East)      |
| Facing left      | 180°           | ↓ (South)     |
| Facing up        | 270°           | ← (West)      |

### Instance Positioning

Legacy `slot` system maps to grid coordinates:
- **slot**: Horizontal position (0-19 in new grid)
- **nudgeX**: Fine-tune offset (use `offsetX` in new system)
- **offsetY**: Vertical offset (still supported)

## Troubleshooting

### Assets Not Loading

1. Check browser console for 404 errors
2. Verify gltfPath in index.json matches actual file location
3. Ensure glTF files are valid (use [glTF Validator](https://github.khronos.org/glTF-Validator/))

### Orientation Issues

1. Check `extraConfig.rotationX` in asset definition
2. Try adjusting `forwardOffsetDeg` if buildings face wrong way
3. Use editor preview to test before exporting

### Scale Issues

1. Adjust `baseScale` in asset definition (not per-instance scale)
2. Use `scaleX/Y/Z` per-instance multipliers for fine-tuning
3. Ground segments typically use 0.25, structures use 0.2-0.6

## Further Reading

- [3D Map Builder Guide](3Dmapbuilder.html) - Full editor documentation
- [3D Scene Bridge](3d-parallel-renderer.md) - How scene3d metadata works
- [Map Registry API](../src/map/MapRegistry.js) - Runtime area loading

## Questions?

If you encounter issues not covered here, check the code comments in:
- `src/map/scene3d.js` - URL resolution logic
- `src/map/MapRegistry.js` - Area validation
- `docs/map-editor.html` - Editor implementation
