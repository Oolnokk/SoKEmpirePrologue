# Time of Day System Guide

## Overview

The Time of Day system provides dynamic lighting and atmospheric changes throughout a 24-hour cycle. It includes:

- **Time progression** through dawn, day, dusk, and night periods
- **Smooth transitions** between time periods with color interpolation
- **Dynamic lighting** that affects ambient and directional lights
- **Emissive object support** for objects that glow (torches, lanterns, etc.)
- **Configurable parameters** for speed, starting time, and transitions

## Quick Start

### Basic Usage

```javascript
import { createRenderer } from './src/renderer/index.js';

// Create renderer with time of day enabled
const renderer = createRenderer({
  container: document.getElementById('canvas-container'),
  timeOfDay: {
    enabled: true,
    startHour: 12,        // Start at noon
    speed: 1.0,           // 1 game hour per real minute
    emissiveConfigUrl: './config/emissive-config.json',
  },
});

await renderer.init();
renderer.start();
```

### Time Control

```javascript
// Get current time state
const state = renderer.getTimeOfDayState();
console.log(`Current hour: ${state.hour}`);
console.log(`Current period: ${state.period}`);

// Set specific hour
renderer.setTimeOfDayHour(18); // Set to 6 PM (dusk)

// Change time speed
renderer.setTimeOfDaySpeed(2.0); // 2x speed

// Pause/resume time
renderer.setTimeOfDayEnabled(false); // Pause
renderer.setTimeOfDayEnabled(true);  // Resume
```

## Time Periods

The system includes four distinct time periods:

### Dawn (5:00 - 7:00)
- Warm, soft lighting with oranges and pinks
- Ambient: Soft orange (#ffa873), intensity 0.5
- Directional: Orange-pink (#ffb380), intensity 0.6
- Emissive multiplier: 0.7 (lights still visible)

### Day (7:00 - 17:00)
- Bright, neutral lighting
- Ambient: White (#ffffff), intensity 0.8
- Directional: White (#ffffff), intensity 1.0
- Emissive multiplier: 0.2 (lights less visible)

### Dusk (17:00 - 19:00)
- Warm, dimming lighting with oranges and purples
- Ambient: Orange (#ffaa66), intensity 0.4
- Directional: Orange-red (#ff8844), intensity 0.5
- Emissive multiplier: 0.8 (lights becoming prominent)

### Night (19:00 - 5:00)
- Dark, cool lighting with blues
- Ambient: Cool blue (#334466), intensity 0.2
- Directional: Dark blue (#445577), intensity 0.3
- Emissive multiplier: 1.5 (lights highly visible)

## Emissive Objects

### Configuration Format

Create a JSON configuration file (e.g., `emissive-config.json`):

```json
{
  "structures": {
    "torch": {
      "emissive": true,
      "emissiveColor": "#ffaa00",
      "emissiveIntensity": 2.0,
      "emissiveTextures": ["torch_flame", "flame"],
      "emissiveSprites": [0]
    },
    "campfire": {
      "emissive": true,
      "emissiveColor": "#ff6600",
      "emissiveIntensity": 1.5
    }
  },
  "decorations": {
    "lantern": {
      "emissive": true,
      "emissiveColor": "#ffffaa",
      "emissiveIntensity": 1.8
    }
  }
}
```

### Configuration Options

- **emissive** (boolean): Enable emissive properties for this object
- **emissiveColor** (string): Hex color code for the emissive glow
- **emissiveIntensity** (number): Base intensity (multiplied by time of day)
- **emissiveTextures** (array): Names of textures that should emit light
- **emissiveSprites** (array): Indices of sprites that should emit light

### Applying Emissive Properties

```javascript
// After loading a 3D object
const torch = await renderer.loadGLTF('./models/torch.glb');
renderer.add(torch);

// Apply emissive properties based on config
renderer.applyEmissiveProperties(torch, 'torch', 'structures');
```

## Advanced Usage

### Direct Module Access

```javascript
import { TimeOfDay, LightingManager, EmissiveManager } from './src/renderer/index.js';

// Create time of day instance
const timeOfDay = new TimeOfDay({
  startHour: 6,
  speed: 2.0,
  transitionDuration: 0.5,
  enabled: true,
});

// Listen for time changes
timeOfDay.on('change', (data) => {
  console.log(`Time changed: ${data.hour}, Period: ${data.period}`);
  console.log('Lighting properties:', data.properties);
});

// Listen for period changes
timeOfDay.on('periodChange', (data) => {
  console.log(`Period changed from ${data.from} to ${data.to}`);
});

// Update time in your animation loop
function animate(deltaTime) {
  timeOfDay.update(deltaTime);
  // ... render scene
}
```

### Custom Lighting Manager

```javascript
import { LightingManager } from './src/renderer/index.js';

const lightingManager = new LightingManager(renderer, timeOfDay, {
  enabled: true,
});

lightingManager.init();

// Set custom directional light position
lightingManager.setDirectionalLightPosition(100, 200, 100);

// Temporarily disable lighting updates
lightingManager.setEnabled(false);
```

### Custom Emissive Manager

```javascript
import { EmissiveManager } from './src/renderer/index.js';

const emissiveManager = new EmissiveManager(renderer, timeOfDay, {
  enabled: true,
});

emissiveManager.init();

// Set config directly without loading from file
emissiveManager.setConfig({
  structures: {
    custom_light: {
      emissive: true,
      emissiveColor: '#ff0000',
      emissiveIntensity: 3.0,
    },
  },
  decorations: {},
});

// Apply to an object
emissiveManager.applyEmissiveProperties(myObject, 'custom_light', 'structures');

// Remove emissive properties
emissiveManager.removeEmissiveProperties(myObject);
```

## Configuration Options Reference

### Renderer TimeOfDay Options

```javascript
{
  timeOfDay: {
    enabled: true,              // Enable time of day system
    startHour: 12,              // Starting hour (0-24)
    speed: 1.0,                 // Time progression speed (game hours per real minute)
    transitionDuration: 0.5,    // Duration of transitions between periods in game hours
    emissiveConfigUrl: './config/emissive-config.json', // URL to emissive config
  }
}
```

### TimeOfDay Constructor Options

```javascript
{
  startHour: 12,           // Starting hour (0-24)
  speed: 1.0,              // Time progression speed
  transitionDuration: 0.5, // Transition duration in hours
  enabled: true,           // Enable time progression
}
```

### LightingManager Constructor Options

```javascript
{
  enabled: true, // Enable lighting updates
}
```

### EmissiveManager Constructor Options

```javascript
{
  enabled: true, // Enable emissive updates
}
```

## Performance Considerations

The time of day system is designed to be performant:

1. **Efficient Updates**: Lighting is only updated when time changes
2. **Material Caching**: Original material properties are cached to avoid recalculation
3. **Event-Driven**: Uses events to minimize unnecessary updates
4. **Configurable Speed**: Control update frequency with time speed

### Optimization Tips

- Use reasonable time speeds (1.0-10.0) to avoid excessive updates
- Limit the number of emissive objects in a scene
- Disable time progression when not needed
- Use coarser transition durations for less frequent updates

## Examples

### Pausing Time During Cutscenes

```javascript
// Pause time
renderer.setTimeOfDayEnabled(false);

// Play cutscene
await playCutscene();

// Resume time
renderer.setTimeOfDayEnabled(true);
```

### Creating a Time-Lapse Effect

```javascript
// Speed up time significantly
renderer.setTimeOfDaySpeed(20.0);

// After time-lapse
renderer.setTimeOfDaySpeed(1.0);
```

### Syncing Time with Gameplay

```javascript
// Get time state
const state = renderer.getTimeOfDayState();

// Trigger gameplay events based on time
if (state.period === 'night') {
  spawnNightEnemies();
} else if (state.period === 'day') {
  increaseSolarPower();
}
```

### Custom Period Actions

```javascript
renderer.timeOfDay.on('periodChange', (data) => {
  if (data.to === 'night') {
    console.log('Night has fallen!');
    playNightAmbientSound();
    showMoon();
  } else if (data.to === 'day') {
    console.log('The sun has risen!');
    playDayAmbientSound();
    hideMoon();
  }
});
```

## Troubleshooting

### Time Not Progressing

- Check if time is enabled: `renderer.setTimeOfDayEnabled(true)`
- Ensure the renderer animation loop is running: `renderer.start()`
- Verify speed is not set to 0: `renderer.setTimeOfDaySpeed(1.0)`

### Lighting Not Changing

- Ensure Three.js is properly loaded
- Check that the renderer is initialized
- Verify lights were created during initialization

### Emissive Objects Not Glowing

- Check that emissive config is loaded
- Verify object IDs match the config
- Ensure materials support emissive properties (MeshStandardMaterial, MeshPhongMaterial)
- Check that emissiveTextures match your model's texture names

### Performance Issues

- Reduce time speed if updates are too frequent
- Limit the number of tracked emissive objects
- Use simpler materials where possible
- Consider disabling time progression in complex scenes

## API Reference

See the source files for complete API documentation:

- `src/renderer/TimeOfDay.js` - Time progression system
- `src/renderer/LightingManager.js` - Scene lighting management
- `src/renderer/EmissiveManager.js` - Emissive object management
- `src/renderer/Renderer.js` - Main renderer with time of day integration

## Demo

View the interactive demo at `docs/time-of-day-demo.html` to see the system in action with live controls.
