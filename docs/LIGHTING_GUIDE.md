# 3D Lighting and Effects Guide

## Overview

The 3D rendering system now supports darkness and lighting effects, creating more atmospheric and visually interesting scenes. This guide explains how to use the new lighting features.

## Lighting System

### Basic Scene Lighting

The renderer now includes an integrated lighting system with two main components:

1. **Ambient Light**: Provides overall illumination, preventing complete darkness
2. **Directional Light**: Simulates sunlight or moonlight, creating shadows and depth

### Enabling Lighting

Lighting is automatically enabled when loading a visualsmap, but can also be controlled manually:

```javascript
// Enable lighting with custom settings
renderer.enableLighting({
  ambientIntensity: 0.3,      // 0-1, lower = darker shadows
  ambientColor: 0x404060,      // Hex color (bluish for night)
  directionalIntensity: 0.6,   // 0-1, main light strength
  directionalColor: 0xfff8e7,  // Hex color (warm for sunlight)
  directionalPosition: { x: 5, y: 10, z: 7.5 },
  castShadows: true            // Enable shadow rendering
});

// Disable lighting (return to unlit rendering)
renderer.disableLighting();
```

### Material Updates

Objects loaded before lighting is enabled need their materials updated to respond to lights:

```javascript
renderer.updateMaterialsForLighting(object);
```

This converts basic materials to physically-based materials that interact with lights and cast shadows.

## Light Decorations

### Light Sphere Decoration

A new decoration type has been added: the **Light Sphere**. This is an emissive sphere that acts as a light source in the scene.

### Asset Configuration

The light sphere is defined in the visualsmap configuration:

```json
{
  "id": "light_sphere",
  "label": "Light Sphere",
  "layer": "decoration",
  "gltfFileName": "../../../assets/3D/decorations/light_sphere.gltf",
  "baseScale": { "x": 0.3, "y": 0.3, "z": 0.3 },
  "yOffset": 1.5,
  "instanceDefaults": {
    "orientation": 0,
    "scaleX": 1,
    "scaleY": 1,
    "scaleZ": 1,
    "offsetX": 0,
    "offsetY": 0,
    "lightIntensity": 1.0
  },
  "extraConfig": {
    "isLight": true,
    "lightColor": 16776940,
    "lightDistance": 10,
    "lightDecay": 2
  }
}
```

### Intensity Parameter

Each light sphere instance can have a custom intensity:

```json
{
  "type": "light_sphere",
  "orientation": 0,
  "scaleX": 1,
  "scaleY": 1,
  "scaleZ": 1,
  "offsetX": 0,
  "offsetY": 0,
  "lightIntensity": 1.5  // Custom intensity (0.0 to 2.0+ typical range)
}
```

- `lightIntensity: 0.5` - Dim light
- `lightIntensity: 1.0` - Normal brightness (default)
- `lightIntensity: 2.0` - Bright light

### Light Configuration Parameters

In the `extraConfig` section:

- `isLight`: Set to `true` to enable point light emission
- `lightColor`: Hex color value (e.g., 16776940 = 0xFFFF88 = warm yellow)
- `lightDistance`: Maximum range of light effect (world units)
- `lightDecay`: How quickly light fades with distance (2 = physically accurate)

### Adding Point Lights Programmatically

You can also add point lights directly in code:

```javascript
const pointLight = renderer.addPointLight({
  color: 0xffffcc,        // Warm white
  intensity: 1.0,         // Light strength
  distance: 10,           // Range in world units
  decay: 2,               // Falloff rate
  position: { x: 0, y: 2, z: 0 },
  castShadow: false       // Enable/disable shadows
});

// Remove a point light
renderer.removePointLight(pointLight);
```

## Atmospheric Effects

### Creating Different Moods

**Daytime Scene:**
```javascript
renderer.enableLighting({
  ambientIntensity: 0.5,
  ambientColor: 0x87CEEB,      // Sky blue
  directionalIntensity: 1.0,
  directionalColor: 0xFFFAF0,  // Bright warm light
  castShadows: true
});
```

**Nighttime Scene:**
```javascript
renderer.enableLighting({
  ambientIntensity: 0.2,
  ambientColor: 0x1a1a2e,      // Dark blue
  directionalIntensity: 0.3,
  directionalColor: 0x9999ff,  // Moonlight blue
  castShadows: true
});
```

**Indoor/Cave:**
```javascript
renderer.enableLighting({
  ambientIntensity: 0.1,       // Very dark
  ambientColor: 0x0f0f0f,
  directionalIntensity: 0.2,
  directionalColor: 0xff8844,  // Warm torch light
  castShadows: true
});
// Add point lights for torches/lamps
```

## Shadow Quality

The renderer uses soft shadows (PCFSoftShadowMap) for better visual quality. Shadow resolution is set to 2048x2048 for the main directional light and 512x512 for point lights.

## Performance Considerations

- **Lighting**: Minimal performance impact, always enabled by default
- **Shadows**: Moderate impact, especially with multiple shadow-casting lights
- **Point Lights**: Each light has a small performance cost; limit to 10-20 for best performance
- **Material Updates**: One-time cost when converting materials

## Integration with Visualsmaps

When loading a visualsmap, lighting is automatically:
1. Enabled with appropriate settings
2. Applied to all loaded objects
3. Configured for decorations marked as light sources

The system handles material conversion and light placement automatically based on the asset configuration.

## Troubleshooting

**Objects appear too dark:**
- Increase `ambientIntensity` or `directionalIntensity`
- Ensure `updateMaterialsForLighting()` was called on all objects

**Shadows not appearing:**
- Set `castShadows: true` in lighting config
- Enable `receiveShadow` on ground/floor objects
- Check that objects have proper geometry

**Light decorations not working:**
- Verify `isLight: true` in asset's `extraConfig`
- Check that `lightIntensity` is set in instance defaults or cell data
- Ensure `renderer.addPointLight` method is available

## Examples

See the `defaultdistrict3D_visualsmap.json` configuration for a complete example of lighting setup with light sphere decorations.
