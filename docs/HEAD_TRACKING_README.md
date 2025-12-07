# Head Tracking System Documentation

## Overview

The head tracking system allows characters' heads to follow aim direction (mouse or joystick) in real-time with smooth interpolation and configurable behavior. The system integrates with both the docs demo pages and can be extended to runtime code paths.

## Features

1. **Live Aim Tracking**: Head follows mouse position (desktop) or left joystick direction (mobile)
2. **Two Tracking Modes**:
   - **Relative Mode**: Head rotates relative to body facing with configurable limits
   - **Global Mode**: Head uses world-space rotation directly
3. **Behind-Character Snap**: Optionally snap head forward when aim is behind the character
4. **Smooth Interpolation**: Frame-rate independent exponential smoothing
5. **Configurable Parameters**: All settings exposed via CONFIG with live debug controls
6. **FACE Lock Compatible**: Face lock overrides take priority over aim-driven tracking

## Configuration

All head tracking configuration is in `docs/config/config.js` under `CONFIG.headTracking`:

```javascript
headTracking: {
  enabled: true,           // Enable/disable head tracking
  mode: 'relative',        // 'relative' or 'global' - relative rotates from body, global uses world angle
  offsetDeg: 90,           // Static offset applied to head angle (in degrees)
  maxRelativeDeg: 90,      // Maximum relative rotation from body facing (relative mode only)
  snapBehind: true,        // Snap head forward when aim is behind character
  joystickDeadzone: 0.15,  // Deadzone for joystick input (0-1)
  debug: false,            // Enable to log head tracking calculations
  smoothing: 8,            // Optional: override smoothing (defaults to aiming.smoothing)
}
```

### Configuration Options Explained

- **enabled**: Master switch for head tracking. When false, head follows torso rotation.
- **mode**: 
  - `'relative'`: Head rotation is computed relative to body facing and clamped to maxRelativeDeg
  - `'global'`: Head rotation uses world-space angle directly (with optional clamping)
- **offsetDeg**: Static offset added to computed head angle. Useful for character-specific adjustments.
- **maxRelativeDeg**: Maximum angle the head can rotate from body forward (relative mode only).
- **snapBehind**: When true, uses dot product check to detect if aim is behind character. If behind (dot < 0), head snaps to body forward instead of looking backwards.
- **joystickDeadzone**: Threshold below which joystick input is ignored for movement (but can still be used for aiming).
- **debug**: Enable console logging of head tracking calculations each frame.
- **smoothing**: Exponential smoothing factor. Higher = slower, smoother. Defaults to `aiming.smoothing` if not set.

## Coordinate System

The head tracking system handles coordinates consistently:

### World Space vs Screen Space

- **Mouse Input (Desktop)**: Uses world coordinates (`G.MOUSE.worldX`, `G.MOUSE.worldY`)
  - Screen coordinates are converted to world space by the app (accounting for camera position and zoom)
  - No additional conversion needed in head tracking code
- **Joystick Input (Mobile)**: Uses angle directly from `G.JOYSTICK.angle`
  - Joystick angle is already in world space (radians)
  - Deadzone filtering applied via `headTracking.joystickDeadzone`

### Angle Convention

All angles in the system follow this convention:
- **Zero angle**: Points UP (negative Y direction in screen space)
- **Positive rotation**: Clockwise
- **Range**: Normalized to -π to π radians internally
- **Forward vector**: `fx = sin(angle)`, `fy = -cos(angle)`
- **Right vector**: `rx = cos(angle)`, `ry = sin(angle)`

This matches the coordinate system documented in `docs/js/render.js`.

## How It Works

### Input Processing

1. **Desktop (Mouse)**:
   - Mouse position captured in world coordinates via `app.js`
   - Angle computed from fighter position to mouse position: `Math.atan2(dy, dx)`
   - Stored in `F.aim.headWorldTarget` via `convertAimToHeadRad()`

2. **Mobile (Joystick)**:
   - Joystick direction read from `G.JOYSTICK.angle`
   - Deadzone filter applied based on `headTracking.joystickDeadzone`
   - If above deadzone threshold (for aiming), angle stored in `G.AIMING.targetAngle`
   - Converted to head target via same path as mouse

### Head Rotation Calculation

The head tracking uses the same rotation calculation as torso aiming via the `computeAimRotation()` helper:

```
computeAimRotation(targetWorldAngle, baseAngle, currentRelativeAngle, params)
```

**Conceptual mapping**: 
- Neck acts as base bone (like hips for torso rotation)
- Head aims relative to neck (like torso aims relative to hips)

**Key parameters**:
- `scaleFactor: 1.0` for head (full tracking) vs `0.5` for torso (proportional)
- `maxAngleDeg`: From `maxRelativeDeg` config or head limits
- `smoothing`: Frame-rate independent exponential lerp
- `orientationSign`: Handles character mirroring (1 or -1)

### Behind-Snap Logic

When `snapBehind` is enabled:

```javascript
// Calculate forward vector from facing
const bodyForwardX = Math.cos(facingRad);
const bodyForwardY = Math.sin(facingRad);

// Calculate aim vector
const aimX = Math.cos(desiredWorld);
const aimY = Math.sin(desiredWorld);

// Dot product: if negative, aim is behind
const dot = bodyForwardX * aimX + bodyForwardY * aimY;

if (dot < 0) {
  return torsoDeg; // Snap to body forward
}
```

This ensures the head doesn't unnaturally rotate backwards.

### Priority System

Head rotation is determined in this priority order:

1. **FACE Lock**: If `G.FACE.active` is true, uses `G.FACE.rad` (highest priority)
2. **Aim-driven**: If `F.aim.active` and `F.aim.headWorldTarget` is set
3. **Fallback**: Head follows torso angle (no independent rotation)

This ensures manual face-lock overrides (from animations, cutscenes, etc.) always take precedence.

## Debug Controls

The Head Tracking Controls box in `docs/index.html` provides live adjustment of all parameters:

1. **Enable Head Tracking**: Master toggle
2. **Mode**: Switch between Relative and Global
3. **Snap Behind**: Toggle behind-snap behavior
4. **Head Offset Deg**: Adjust static offset (0-180°)
5. **Max Relative Deg**: Adjust maximum rotation limit (0-180°)
6. **Joystick Deadzone**: Adjust joystick threshold (0-1)
7. **Debug Logging**: Enable console output

All controls update `window.CONFIG.headTracking` immediately and take effect on the next frame.

### Debug Logging Output

Enable with `CONFIG.headTracking.debug = true` to see:

```
[HEAD TRACKING] mode: relative | snapBehind: true
  torso: 45.00° | target: 90.00°
  final head: 67.50° | offset: 90.00°
  smoothing: 8 | maxAngleDeg: 90
```

This shows:
- Current mode and snap setting
- Torso angle and target angle
- Final computed head angle and applied offset
- Active smoothing factor and angle limit

## Integration Points

### Docs Demo Integration

The head tracking is fully integrated into the docs demo:

- **Configuration**: `docs/config/config.js`
- **Core Logic**: `docs/js/animator.js` (computeHeadTargetDeg, computeAimRotation)
- **Input Handling**: `docs/js/app.js` (mouse), `docs/js/touch-controls.js` (joystick)
- **Face Lock API**: `docs/js/face-lock.js` (FACE lock integration)
- **Debug UI**: `docs/index.html` (Head Tracking Controls box)

### Runtime Integration

**Note**: The primary runtime is currently the docs/ codebase. The src/ directory contains minimal code (map building, config management) with only 7 files compared to 52 files in docs/js/. The head tracking system is fully functional in the main runtime (docs/).

If future runtime integration to separate src/ paths is needed:

1. Copy configuration structure from `docs/config/config.js` to runtime config
2. Port `computeHeadTargetDeg()` and `computeAimRotation()` functions to runtime
3. Hook into bone assembly/renderer where head angle is set
4. Ensure FACE lock compatibility is maintained
5. Adapt input sources (mouse/joystick) to runtime input system

The docs implementation serves as reference - the core algorithm is the same.

## Testing

Run head tracking tests:

```bash
npm run test:unit -- tests/head-torso-aim-mirror.test.js tests/head-aim-limits.test.js
```

Tests verify:
- `computeAimRotation()` helper exists and computes correctly
- Head tracking uses same logic as torso aim
- Smoothing is applied correctly over multiple frames
- Head uses scale factor 1.0 vs torso's 0.5
- Head limits and normalization work properly

## Known Behavior

### Character Mirroring

The system automatically handles character flip/mirroring:
- When facing left (facingRad ≈ π), orientationSign = -1
- When facing right (facingRad ≈ 0), orientationSign = 1
- Behind-snap check accounts for facing direction automatically
- No special handling needed in user code

### Smoothing Characteristics

The exponential smoothing means:
- Rapid aim changes are smoothed out (no snapping)
- Head gradually converges to target angle
- Never reaches target exactly (asymptotic approach)
- Frame-rate independent (same behavior at 30fps or 60fps)

### Edge Cases

1. **No aim input**: Head follows torso (no offset)
2. **Aim behind character with snapBehind=false**: Head can rotate backwards (may look unnatural)
3. **FACE lock active**: Aim input ignored, FACE lock angle used
4. **Head tracking disabled**: Head rigidly follows torso rotation

## Future Enhancements

Potential improvements to consider:

1. **Per-fighter overrides**: Allow specific fighters to customize head tracking
2. **Blend factor**: Partial head tracking (between 0 and 1)
3. **Velocity prediction**: Aim slightly ahead based on movement
4. **IK constraints**: More realistic neck rotation limits
5. **Animation blending**: Smooth transition between tracking and animation
6. **Look-at targets**: Track specific world points or entities

## Related Files

- `docs/config/config.js`: Configuration
- `docs/js/animator.js`: Core head tracking logic
- `docs/js/app.js`: Debug control wiring
- `docs/js/touch-controls.js`: Joystick deadzone
- `docs/js/face-lock.js`: Face lock API
- `docs/index.html`: Debug UI controls
- `tests/head-torso-aim-mirror.test.js`: Head tracking tests
- `tests/head-aim-limits.test.js`: Head angle limits tests
- `HEADTRACKING_CHANGES.md`: Development history
