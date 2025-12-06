# Debug Panel Documentation

## Overview

The debug panel is a comprehensive tool for inspecting and editing the game's bone transforms and configuration in real-time. It provides live updates every frame and allows agents to programmatically access transform data without needing to visually inspect the rendered skeleton.

## Features

### 1. Live Bone Transforms Display

Shows the final world-space transforms for all bones after all pose, physics, and blending logic has been applied:

- **Start Position**: The (x, y) coordinates of the bone's starting point
- **End Position**: The (x, y) coordinates of the bone's ending point  
- **Angle**: The bone's rotation angle in degrees

All values are displayed in a readable table format and update every frame.

Bones displayed:
- Torso
- Head
- Left Upper Arm, Left Lower Arm
- Right Upper Arm, Right Lower Arm
- Left Upper Leg, Left Lower Leg
- Right Upper Leg, Right Lower Leg

### 2. Sprite Transform Display

Shows sprite anchor positions and transform information:

- **Anchor Position**: The (x, y) position of the sprite's anchor point
- **Scale**: The sprite's scale factors (scaleX × scaleY)
- **Rotation**: The sprite's rotation angle in degrees

### 3. Live Pose Editor

Provides input boxes for editing all joint angles in real-time:

**Joint Angles (in degrees):**
- Torso
- Left Shoulder (relative)
- Left Elbow (relative)
- Right Shoulder (relative)
- Right Elbow (relative)
- Left Hip
- Left Knee (relative)
- Right Hip
- Right Knee (relative)

Changes are applied immediately to the character and trigger a re-render.

### 4. Config Value Editor

Allows editing of key configuration values:

- **Actor Scale**: Overall character scale (0.5 - 1.5)
- **Ground Ratio**: Vertical position of ground plane (0.5 - 0.95)
- **Authored Weight**: Weight of authored poses in blending (0 - 1)
- **Physics Weight**: Weight of physics simulation in blending (0 - 1)

### 5. Copy JSON Button

Exports the current pose and configuration to the clipboard in the exact format used in `config.js`. The exported JSON includes:

```json
{
  "pose": {
    "torso": 10,
    "lShoulder": -120,
    "lElbow": -120,
    "rShoulder": -65,
    "rElbow": -140,
    "lHip": 110,
    "lKnee": 40,
    "rHip": 30,
    "rKnee": 40
  },
  "config": {
    "actor": { "scale": 0.70 },
    "groundRatio": 0.70,
    "movement": {
      "authoredWeight": 0.6,
      "physicsWeight": 0.4
    },
    "parts": { ... },
    "hierarchy": { ... },
    "ik": { ... }
  },
  "bones": {
    "torso": {
      "start": { "x": "296.08", "y": "326.39" },
      "end": { "x": "296.19", "y": "306.79" },
      "angle": "0.31"
    },
    ...
  }
}
```

This allows agents to:
- Copy and share pose configurations
- Test different pose setups programmatically
- Verify bone transforms numerically without visual inspection

## Usage

### Opening/Closing the Panel

1. Click the **🔍 Debug** button in the top-right corner of the game UI
2. The button will change to **✕ Debug** when the panel is open
3. Click again to hide the panel

### Editing Poses

1. Open the debug panel
2. Find the joint angle you want to modify in the "Pose Editor" section
3. Click on the input field and enter a new value (in degrees)
4. The character will update immediately to reflect the change

### Editing Config Values

1. Open the debug panel
2. Find the config value you want to modify in the "Config Values" section
3. Click on the input field and enter a new value
4. Changes that affect rendering (like Actor Scale or Ground Ratio) will update the display

### Copying Pose/Config Data

1. Open the debug panel
2. Click the **📋 Copy JSON** button in the panel header
3. The button will briefly show **✓ Copied!** to confirm success
4. The JSON data is now in your clipboard and can be pasted into code or shared

## Integration with Game Loop

The debug panel integrates seamlessly with the game's render loop:

1. `initDebugPanel()` is called during game initialization
2. `updateDebugPanel()` is called every frame in the game loop
3. Transform data is read from `window.GAME.ANCHORS_OBJ` after all animations are applied
4. Pose edits are pushed as temporary overrides using `pushPoseOverride()`

## Agent-Friendly Design

The debug panel is designed to be accessible to AI agents:

- **Numeric Access**: All bone transforms are available as numeric values
- **Standard Format**: JSON export uses the same format as `config.js`
- **Clipboard API**: Easy programmatic access to current state
- **Frame-by-frame Updates**: Real-time data for testing and verification
- **No Visual Inspection Needed**: All data is available as structured numbers

## Debug Flags

### window.DEBUG_COSMETICS_TRACE

Enable detailed logging for cosmetics placement and offset resolution:

```javascript
// In browser console:
window.DEBUG_COSMETICS_TRACE = true;
```

When enabled, logs detailed information for each sprite drawn:
- Style key and normalized key
- Effective style (xformUnits)
- Xform table and resolved xform values
- Meta offset resolution
- Offset units (px vs percent)
- Raw ax/ay values from style.xform or meta.offset
- Final offsetSpec with isPercent flags
- Calculated offsetX/offsetY in pixels
- Bone length
- Final sprite position

**Use case**: Debugging cosmetic positioning issues, verifying that ax/ay offsets from style.xform are being applied correctly, checking offset precedence between style.xform and asset.meta.offset.

**Example output**:
```javascript
[COSMETICS_TRACE] drawBoneSprite {
  styleKey: "head",
  normalizedKey: "head",
  effectiveStyle: { xformUnits: "percent" },
  xformTable: { head: { ax: -1.2, ay: -0.6, scaleX: 1.5, scaleY: 1.5 } },
  xform: { ax: -1.2, ay: -0.6, scaleX: 1.5, scaleY: 1.5 },
  metaOffset: null,
  offsetUnits: "percent",
  rawAx: -1.2,
  rawAy: -0.6,
  offsetSpec: { ax: -1.2, ay: -0.6, axIsPercent: true, ayIsPercent: true },
  offsetX: -48,
  offsetY: -24,
  boneLen: 40,
  finalPos: { x: 248, y: 300 }
}
```

## Technical Details

### Module Location
- JavaScript: `docs/js/debug-panel.js`
- CSS: `docs/styles.css` (debug panel section)
- HTML: `docs/index.html` (debug panel markup)

### Dependencies
- Uses the same angle conversion system as `render.js` (radians with "up" as zero)
- Reads bone data from `window.GAME.ANCHORS_OBJ`
- Integrates with `animator.js` for pose overrides

### Performance
- Updates are throttled by checking if panel is visible
- Only updates DOM when panel is open
- Minimal impact on game performance (~1-2ms per frame when open)
