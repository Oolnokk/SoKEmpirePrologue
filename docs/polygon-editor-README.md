# Polygon Editor

A powerful 3D polygon editor for creating 6-faced objects with face-based editing and image plane attachment.

## Features

### Core Functionality
- **6-Faced Polygon Creation**: Create box-shaped polygons with 6 selectable faces
- **Face-Based Editing**: Edit individual faces with precise 2D transformations
- **Image Plane Attachment**: Attach transparent PNG images to faces
- **Camera-Based Z-Ordering**: Automatic depth sorting for transparent planes
- **Import/Export**: Save and load polygon configurations as JSON

### Face Editing
- **Translate X/Y**: Move faces in their local 2D space
- **Scale X/Y**: Independently scale faces on each axis
- **Rotate**: Rotate faces around their normal vector
- Touch/click selection with visual feedback

### Image Plane System
- **Transparent Planes**: Attach PNG images with full alpha channel support
- **Independent Transform**: Each plane has its own 2D transform (offset, scale, rotation)
- **Multiple Planes**: Attach multiple images to a single face
- **Z-Order Management**: Planes automatically sort by camera distance
- **Touch Pass-Through**: Click through planes to select faces underneath

## Usage

### Getting Started
1. Open `polygon-editor.html` in a web browser
2. Click "**+ Create Polygon**" to add a new 6-faced polygon to the scene

### Navigation
- **Click**: Select a face (faces highlight green when polygon is selected)
- **Drag**: Rotate camera view
- **Right-drag**: Pan camera
- **Scroll**: Zoom in/out
- **Delete key**: Remove selected polygon

### Editing Faces
1. Click on any face to select it
2. Use the **Selected Face** panel to adjust:
   - Choose which face to edit (Front/Back/Left/Right/Top/Bottom)
   - Translate X/Y: Position adjustment
   - Scale X/Y: Size adjustment (0.1 to 3.0)
   - Rotation: -180° to 180°

### Attaching Images
1. Select a face
2. In the **Attach Image Plane** panel:
   - Click on an available image to attach it to the selected face
   - Use **Plane Transform** controls to adjust:
     - Offset X/Y: Position relative to face
     - Scale X/Y: Size of the image plane
     - Rotation: Rotation around face normal
3. Multiple images can be attached to the same face
4. Select planes from the **Attached Planes** list to edit them
5. Click "**Remove Selected**" to delete a plane

### Import/Export
- **Export**: Click "Export" button to save polygons as JSON
- **Import**: Click "Import" button to load a previously saved configuration

## Technical Details

### Renderer
The editor uses Three.js with a setup that mimics the game demo renderer:
- PerspectiveCamera with 45° FOV
- Hemisphere + Directional lighting
- Shadow mapping enabled
- Grid helper and axes for reference
- OrbitControls for camera manipulation

### Polygon Structure
Each polygon consists of:
- 6 faces (Front, Back, Left, Right, Top, Bottom)
- Each face is a separate plane mesh for easy selection
- Individual transform data per face
- Array of attached image planes per face

### Image Planes
- Rendered with `MeshBasicMaterial` for performance
- Transparent rendering with `alphaTest: 0.1`
- `depthWrite: false` to prevent z-fighting
- Dynamic `renderOrder` based on camera distance
- Independent from scene lighting

### Data Format
Export JSON structure:
```json
{
  "polygons": [
    {
      "id": "polygon_1",
      "position": { "x": 0, "y": 1, "z": 0 },
      "size": { "width": 1, "height": 1, "depth": 1 },
      "faces": [
        {
          "name": "front",
          "transform": {
            "x": 0,
            "y": 0,
            "scaleX": 1,
            "scaleY": 1,
            "rotation": 0
          },
          "planes": [
            {
              "imagePath": "assets/props/bottle_tall.png",
              "imageName": "bottle_tall.png",
              "transform": {
                "x": 0,
                "y": 0,
                "scaleX": 1,
                "scaleY": 1,
                "rotation": 0
              }
            }
          ]
        }
      ]
    }
  ]
}
```

## Available Images

The editor loads images from `docs/assets/`:
- Weapons (greatswords, spears, daggers, etc.)
- HUD elements (arch-bar, line segments)
- Props (bottles, etc.)
- Fighter sprites
- Cosmetics

To add more images, add PNG files to the `docs/assets/` directory and update the `imagePaths` array in the `loadAvailableImages()` function.

## Browser Compatibility

Requires a modern browser with:
- WebGL support
- ES6 module support
- Three.js r160 (loaded from CDN)

Tested on Chrome, Firefox, and Safari.

## Tips

- Start with a single polygon to understand the face system
- Use the Face selector dropdown to switch between faces quickly
- Planes can extend beyond face boundaries - use negative/positive offsets
- Z-ordering updates automatically as you move the camera
- Export frequently to avoid losing work
- Face transforms affect attached planes automatically

## Limitations

- Image list is currently hardcoded (can be extended)
- Polygon position/size cannot be edited after creation
- No undo/redo functionality
- Texture loading is asynchronous (slight delay when importing)
