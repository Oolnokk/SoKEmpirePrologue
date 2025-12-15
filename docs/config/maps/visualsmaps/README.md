# Visual Maps Directory

This directory contains visual map configuration files for the 3D map editors and game runtime.

## Files

### `index.json`

**Primary asset catalog** - Defines available 3D assets (segments, structures, decorations) for the map editors.

**Important:** This file is cached for performance. After editing, you need to:

1. **Development Mode** (localhost or file://): Regular refresh (F5) works
2. **Production Mode**: Hard refresh required:
   - Windows/Linux: `Ctrl + Shift + R` or `Ctrl + F5`
   - macOS: `Cmd + Shift + R`

**Structure:**
```json
{
  "version": "1.0.0",
  "description": "Index of available visual map assets",
  "maps": [
    {
      "id": "mapId",
      "name": "Display Name",
      "file": "filename.json"
    }
  ],
  "segments": [
    {
      "id": "assetId",
      "label": "Display Label",
      "layer": "ground",
      "gltfPath": "./path/to/model.gltf",
      "baseScale": { "x": 1, "y": 1, "z": 1 },
      "yOffset": 0,
      "forwardOffsetDeg": 0,
      "instanceDefaults": {
        "orientation": 0,
        "scaleX": 1,
        "scaleY": 1,
        "scaleZ": 1,
        "offsetX": 0,
        "offsetY": 0
      }
    }
  ],
  "structures": [ /* same format as segments */ ],
  "decorations": [ /* same format as segments */ ]
}
```

### Map Files (e.g., `defaultdistrict3D_visualsmap.json`)

Individual visual map definitions containing placed 3D assets on a grid.

**Structure:**
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
    "ground": [
      { "row": 0, "col": 0, "asset": "road", "orientation": 0 }
    ],
    "structure": [],
    "decoration": []
  }
}
```

## Caching Behavior

The game runtime (`docs/renderer/visualsmapLoader.js`) implements intelligent caching:

- **Development Mode** (file://, localhost, 127.0.0.1):
  - Cache disabled
  - Cache-busting query parameters added automatically
  - Changes visible immediately with regular refresh

- **Production Mode** (deployed sites):
  - Cache enabled for performance
  - Hard refresh required to see changes
  - Use manual cache clear if needed (see below)

## Manual Cache Clear

From browser console:
```javascript
import('./renderer/visualsmapLoader.js').then(m => m.clearVisualsmapCache());
```

Then reload the page to fetch fresh data.

## Usage

These files are loaded by:
1. **Runtime Game** (`docs/index.html`) - Renders 3D background
2. **3D Map Builder** (`docs/3Dmapbuilder.html`) - Creates/edits visual maps
3. **Map Editor** (`docs/map-editor.html`) - Shows visual map as reference

## Adding New Assets

1. Place your GLTF/GLB model file in `docs/assets/3D/` (appropriate subdirectory)
2. Edit `index.json` to add the asset definition
3. Hard refresh the map editor to see the new asset in the palette
4. Place instances of the asset in your visual map

## Troubleshooting

**Problem:** Changes to `index.json` not appearing in editor

**Solutions:**
1. Hard refresh browser (Ctrl+Shift+R)
2. Clear browser cache entirely
3. Verify you're editing the correct file (`docs/config/maps/visualsmaps/index.json`)
4. Check browser console for loading errors
5. Verify JSON syntax is valid

**Problem:** Assets not rendering in game

**Possible causes:**
1. GLTF file path incorrect
2. Model file missing or corrupted
3. Scale/offset values causing asset to be off-screen
4. Layer visibility toggled off

See `DIAGNOSIS_VISUALMAPS.md` in the root directory for detailed troubleshooting.
