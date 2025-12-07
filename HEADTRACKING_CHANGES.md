# Head Tracking Changes - Mirror Torso Aim Calculation

## Summary

Modified head tracking to use the same rotation calculation logic as torso aiming. This ensures consistent behavior across body parts and makes the head rotate relative to the neck using the same mathematical approach that torso uses relative to hips.

## Conceptual Mapping

**Analogy: Neck as Hips, Head as Torso**

- **Neck** → Acts as the base bone (like **hips** for torso rotation)
- **Head** → Aims relative to neck (like **torso** aims relative to hips)

This mapping ensures head tracking mirrors torso aim behavior exactly.

## Changes Made

### 1. New Helper Function: `computeAimRotation()`

**Location:** `docs/js/animator.js` (lines ~2072-2120)

Extracted the core aim rotation calculation logic into a reusable helper function that:
- Calculates relative angle from target to base bone
- Normalizes angles to -π to π range
- Applies exponential smoothing (same as torso: `1 - exp(-smoothing * dt)`)
- Converts to degrees and applies orientation sign
- Scales the aim by a configurable factor
- Clamps to maximum angle limits

**Parameters:**
- `targetWorldAngleRad`: Target angle in world space
- `baseAngleRad`: Base bone angle (torso for head, hips for torso)
- `currentRelativeAngle`: Previous smoothed angle for continuity
- `params`: Configuration object with:
  - `dt`: Delta time for smoothing
  - `smoothing`: Smoothing factor (default 8)
  - `scaleFactor`: How much of the aim to apply (0.5 for torso, 1.0 for head)
  - `maxAngleDeg`: Maximum angle limit
  - `orientationSign`: Orientation sign for mirroring (±1)

### 2. Refactored `computeHeadTargetDeg()`

**Location:** `docs/js/animator.js` (lines ~2125-2210)

Modified to use `computeAimRotation()` with the following key features:

- **Smoothing:** Uses same exponential smoothing as torso aim
  - Config: `C.aiming.smoothing` or `C.headTracking.smoothing` (default: 8)
  - State tracked in `F.aim.headTrackingState.smoothedRelativeAngle`

- **Scale Factor:** 1.0 (full tracking)
  - Unlike torso which uses 0.5 (proportional tracking)
  - Head fully tracks the target for natural look

- **Angle Limits:** Reuses existing head limits from config
  - `C.limits.head.relMin` and `C.limits.head.relMax`
  - Converted to `maxAngleDeg` parameter

- **Orientation Sign:** Same logic as torso aim
  - Computed from `facingRad` cosine
  - Ensures proper mirroring when facing left/right

### 3. Debug Logging

**Enable via:** `CONFIG.headTracking.debug = true`

When enabled, logs head tracking calculations once per frame:
```
[HEAD TRACKING] Using computeAimRotation (mirrors torso aim):
  torso: 45.00° | target: 90.00°
  offset: 22.50° | final head: 67.50°
  smoothing: 8 | scaleFactor: 1.0 (full tracking)
```

### 4. Configuration Options

**Location:** `docs/config/config.js` (lines ~999-1002)

```javascript
headTracking: {
  offsetDeg: 0,       // Static offset applied to head angle
  // debug: false,    // Enable to log calculations
  // smoothing: 8,    // Override smoothing (defaults to aiming.smoothing)
}
```

### 5. Torso Aim Documentation

**Location:** `docs/js/animator.js` (lines ~2357-2363)

Added comment block marking the torso aim calculation as the reference implementation:
```javascript
// ============================================================================
// TORSO AIM CALCULATION (Player)
// This is the reference implementation for aim rotation calculation.
// Head tracking now mirrors this exact logic via computeAimRotation() helper.
// When modifying this calculation, ensure computeAimRotation() stays in sync.
// ============================================================================
```

## Testing

### New Test File: `tests/head-torso-aim-mirror.test.js`

**Tests:**
1. `computeAimRotation` helper exists and computes offsets correctly
2. `computeHeadTargetDeg` calls `computeAimRotation` (code inspection)
3. Documentation includes neck/hips and head/torso analogy
4. Smoothing is applied correctly across multiple frames
5. Head uses scaleFactor 1.0 vs torso's 0.5

**Run tests:**
```bash
npm run test:unit -- tests/head-torso-aim-mirror.test.js
```

### Existing Tests

All existing tests continue to pass, including:
- `tests/head-aim-limits.test.js` - Head angle limits and normalization

## How to Test In-Game

1. **Enable debug logging:**
   ```javascript
   CONFIG.headTracking.debug = true;
   ```

2. **Observe head tracking:**
   - Move mouse/aim around the player
   - Head should smoothly track the aim target
   - Check console for calculation details

3. **Compare with torso:**
   - Head should rotate relative to torso (neck as base)
   - Uses same smoothing curve as torso
   - Full tracking (1.0) vs torso proportional (0.5)

4. **Test edge cases:**
   - Rapid aim changes (smoothing should prevent snapping)
   - Facing direction changes (orientation sign should mirror correctly)
   - Extreme angles (should clamp to configured limits)

## Behavior Comparison

| Aspect | Old Behavior | New Behavior |
|--------|-------------|--------------|
| **Smoothing** | None (instant snap) | Exponential smoothing (mirrors torso) |
| **Calculation** | Simple clamping | Full torso aim logic |
| **Scale Factor** | N/A | 1.0 (full tracking) |
| **Base Reference** | Torso angle | Torso angle (as "hips" analogy) |
| **Orientation** | Basic normalization | Same sign logic as torso |
| **Code Reuse** | Independent code | Shared `computeAimRotation()` helper |

## Backward Compatibility

- All existing configuration options preserved
- `headTracking.offsetDeg` still works
- Head limits still respected
- No breaking changes to API or config format
- Old behavior can be restored by setting `smoothing: 0` (though not recommended)

## Files Modified

1. **docs/js/animator.js**
   - Added `computeAimRotation()` helper function
   - Refactored `computeHeadTargetDeg()` to use helper
   - Added documentation and debug logging
   - Added comment marking torso aim as reference

2. **docs/config/config.js**
   - Added commented configuration options for `headTracking`

3. **tests/head-torso-aim-mirror.test.js** (new)
   - Comprehensive test coverage for new behavior

4. **HEADTRACKING_CHANGES.md** (this file)
   - Documentation of changes

## Future Enhancements

Consider these potential improvements:
- Add config flag to disable smoothing (use old instant snap behavior)
- Allow per-fighter smoothing overrides
- Add blend factor between old and new behavior for gradual migration
- Expose `scaleFactor` as config option for partial head tracking

## Maintenance Notes

When modifying torso aim calculation in `updateAiming()`:
1. Review if changes should apply to head tracking
2. Update `computeAimRotation()` if core logic changes
3. Run both torso and head tracking tests
4. Consider adding integration tests for combined torso+head aiming
