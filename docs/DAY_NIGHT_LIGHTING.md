# Day/Night Ambient Lighting System

This document describes the ambient day/night lighting system with emissive objects and decorations.

## Overview

The day/night lighting system provides:
- **Ambient lighting** that transitions between day and night states
- **Emissive candle lights** (trapezoidal frustums) that glow orangy pale yellow at night and turn black during the day
- **Automatic integration** with tower structures
- **Smooth transitions** between day and night with configurable duration
- **Point lights** for extra glow effect around candles

## Architecture

### Core Components

1. **DayNightSystem** (`src/lighting/DayNightSystem.js`)
   - Manages the global day/night state
   - Handles transitions between day and night
   - Controls emissive objects and their materials
   - Provides event system for state changes

2. **CandleLight** (`src/lighting/CandleLight.js`)
   - Creates trapezoidal frustum geometry for candle lights
   - Supports optional point light glow effect
   - Configurable size, color, and emissive properties

3. **TowerLightingIntegration** (`src/lighting/TowerLightingIntegration.js`)
   - Automatically detects tower structures
   - Adds candle lights as children of tower objects
   - Registers candle lights with the day/night system

4. **VisualsMapLoader Integration** (`docs/renderer/visualsmapLoader.js`)
   - Initializes day/night system when loading maps
   - Automatically adds candle lights defined in asset configs (e.g., `tower-config.json`) to tower structures
   - Updates ambient and directional lighting based on time of day

## Usage

### Basic Control

The day/night system is automatically initialized and made available globally when a map is loaded. The game now runs
through a single shared **game time** value (see below), so prefer using the shared time helpers instead of directly
mutating the lighting system.

```javascript
// Toggle between day and night
window.dayNightSystem.toggle();

// Set specific time of day
window.dayNightSystem.setTimeOfDay(true);  // Night
window.dayNightSystem.setTimeOfDay(false); // Day

// Immediate change (no transition)
window.dayNightSystem.setTimeOfDay(true, true);

// Preferred: update shared game time (updates background + lighting together)
window.setGameTime24h(18.5);
```

### Unified Game Time Flow

The canonical game time lives in `docs/js/app.js` and is shared across:

- Background skies (`background.sky.time24h` via `setBackgroundTime24h`)
- UI clock (`docs/js/render.js`)
- NPC schedules (`docs/js/npc.js`)
- Lighting (`window.dayNightSystem.setTimeOfDayHours`)

`loop()` advances time every frame by `dt * CONFIG.time.timeScale` (hours per second) unless
`CONFIG.time.paused` is set. The updated value is persisted to a runtime background store keyed by the active area
(MapRegistry areas are frozen, so runtime state is stored separately) and mirrored into the day/night lighting system
automatically. Manual changes (e.g., via the debug slider) should call `window.setGameTime24h` so all systems remain in
sync.

### Configuration

The system defaults to **night mode** with the following configuration:

```javascript
{
  defaultToNight: true,
  transitionDuration: 2000 // milliseconds
}
```

### Lighting Configurations

#### Night Configuration
- Ambient Color: `0x404060` (dark blue-gray)
- Ambient Intensity: `0.3`
- Sky Color: `0x1a1a2e` (very dark blue)
- Ground Color: `0x0a0a14` (nearly black)
- Hemisphere Intensity: `0.2`

#### Day Configuration
- Ambient Color: `0xffffff` (white)
- Ambient Intensity: `1.0`
- Sky Color: `0x87ceeb` (sky blue)
- Ground Color: `0x8b7355` (brown)
- Hemisphere Intensity: `0.6`

### Candle Light Properties

Each candle light is a **trapezoidal frustum** with defaults stored in `CONFIG.lighting.candleDefaults` (`docs/config/config.js`). Current values:

```javascript
{
  topWidth: 0.8,        // Width at top
  topDepth: 0.8,        // Depth at top
  bottomWidth: 0.5,     // Width at bottom
  bottomDepth: 0.5,     // Width at bottom
  height: 1.5,          // Total height
  color: 0xffbb66,      // Orangy pale yellow (candle light)
  emissiveIntensity: 1.2,
  opacity: 0.8,
  rotationYDeg: 90,
  scale: 1.2,
  nightEmissive: 0xffbb66,
  nightIntensity: 1.2,
  dayEmissive: 0x000000,
  dayIntensity: 0.0
}
```

#### Night State
- Emissive Color: `0xffbb66` (orangy pale yellow)
- Emissive Intensity: `1.2`
- Point Light: **ON** (visible glow)

#### Day State
- Emissive Color: `0x000000` (black)
- Emissive Intensity: `0.0`
- Point Light: **OFF** (no glow)

## Geometry Details

### Trapezoidal Frustum

The candle light uses a custom trapezoidal frustum geometry:
- **Shape**: Wider at the top, narrower at the bottom (like a truncated pyramid)
- **Rendering**: Double-sided with transparency
- **Material**: MeshStandardMaterial with emissive properties
- **Position**: Placed using per-asset config offsets (optionally anchored to attachment points)

### Structure

Each candle light is a Three.js Group containing:
1. **Mesh**: The trapezoidal frustum with emissive material
2. **PointLight**: Optional point light for glow effect (when `withGlow: true`)

### Configuring candle lights per asset

- Add candle definitions under `extra.candleLights` in the asset config (for example `docs/config/assets/tower-config.json`).
- Each entry can reference an `attachmentId` (from `extra.attachmentPoints`) and an additional `offset` to fine-tune placement in local object space.
- Rendering options go under `options` (passed to `createCandleLight`/`createCandleLightWithGlow`), while day/night emissive overrides live under `lighting`.
- The visuals map loader merges these entries with the defaults above and registers each candle with the day/night system automatically.

## Tower Detection

The system automatically detects tower structures based on asset type names containing:
- `tower`
- `building`
- `structure`
- `commercial`
- `residential`
- `industrial`

Detection is case-insensitive and works with the `userData.assetType` property set during map loading.

## Events

The DayNightSystem provides an event system for tracking state changes:

```javascript
// Listen for time of day changes
dayNightSystem.on('timeChange', ({ isNight }) => {
  console.log('Time changed to:', isNight ? 'night' : 'day');
});

// Listen for transition start
dayNightSystem.on('transitionStart', ({ isNight }) => {
  console.log('Transitioning to:', isNight ? 'night' : 'day');
});

// Listen for transition end
dayNightSystem.on('transitionEnd', ({ isNight }) => {
  console.log('Transition complete');
});

// Remove listener
dayNightSystem.off('timeChange', callback);
```

## Custom Emissive Objects

You can register custom objects with the day/night system:

```javascript
const myObject = new THREE.Mesh(geometry, material);

dayNightSystem.registerEmissiveObject(myObject, {
  nightEmissive: 0xff6600,   // Orange glow at night
  nightIntensity: 1.0,
  dayEmissive: 0x000000,     // Black during day
  dayIntensity: 0.0
});

// Unregister when done
dayNightSystem.unregisterEmissiveObject(myObject);
```

## Animation Loop Integration

The lighting system updates every frame via the renderer's frame event:

```javascript
renderer.on('frame', ({ time }) => {
  dayNightSystem.update(0);
});
```

This ensures smooth transitions and proper emissive material updates.

## Performance Considerations

- **Material Cloning**: Each tower gets its own cloned candle light, so materials can be updated independently
- **Batch Updates**: All emissive objects are updated together during transitions
- **Event-Driven**: Lighting only updates when time of day changes or during transitions
- **Efficient Transitions**: Uses cubic ease-in-out for smooth, performant animations

## Example: Manual Candle Light Creation

If you need to create candle lights manually:

```javascript
import { createCandleLight, createCandleLightWithGlow } from './src/lighting/CandleLight.js';

// Simple candle
const candle = createCandleLight(THREE, {
  topWidth: 1.0,
  height: 2.0,
  color: 0xffbb66
});

// Candle with glow
const candleWithGlow = createCandleLightWithGlow(THREE, {
  topWidth: 1.0,
  height: 2.0,
  lightIntensity: 2.0
});

// Add to scene
scene.add(candleWithGlow);

// Register with day/night system
dayNightSystem.registerEmissiveObject(
  candleWithGlow.children[0], // The mesh
  { nightEmissive: 0xffbb66, nightIntensity: 0.8 }
);
```

## Cleanup

The system automatically cleans up when maps are disposed:

```javascript
// The dispose function handles cleanup
const { dispose, dayNightSystem } = await loadVisualsMap(renderer, area, gameplayMapUrl);

// When done with the map
dispose(); // Removes frame handler, disposes day/night system, removes all objects
```

## Files

- `src/lighting/DayNightSystem.js` - Core day/night state management
- `src/lighting/CandleLight.js` - Candle light geometry creation
- `src/lighting/TowerLightingIntegration.js` - Tower detection and integration
- `docs/renderer/visualsmapLoader.js` - Map loading with lighting integration

## Future Enhancements

Potential improvements for the system:
- Time-based cycling (automatic day/night transitions)
- Multiple time periods (dawn, dusk, etc.)
- Weather effects integration
- Seasonal variations
- Candle flame animation (flickering)
- Shadow casting from candle lights
- Color temperature shifts
