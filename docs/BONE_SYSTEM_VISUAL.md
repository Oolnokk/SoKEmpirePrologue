# Bone System Visual Reference

## Quick Function Reference Table

| Function | File | Lines | Modifies Bones? | Purpose |
|----------|------|-------|-----------------|---------|
| `computeAnchorsForFighter()` | render.js | 81-173 | ✅ YES (creates) | Main bone computation from joint angles |
| `updatePoses()` | animator.js | 32-44 | ✅ YES (via angles) | Updates joint angles that drive bones |
| `getBones()` | sprites.js | 77-116 | ✅ YES (creates) | Alternative bone creation for sprites |
| `setPoseValue()` | debug-panel.js | 275-294 | ✅ YES (via angles) | Debug manual angle editing |
| `pushPoseOverride()` | animator.js | 46 | ⚠️ INDIRECT | Sets animation overrides |
| `computeWalkPose()` | animator.js | 13-27 | ⚠️ INDIRECT | Generates walk poses |
| `drawBoneSprite()` | sprites.js | 223-284 | ❌ NO (reads) | Renders sprite on bone |
| `drawSegment()` | render.js | 216-238 | ❌ NO (reads) | Debug skeleton rendering |
| `renderSprites()` | sprites.js | 286-327 | ❌ NO (reads) | Main sprite render loop |
| `basis()` | math-utils.js | 23-32 | ❌ NO (utility) | Computes orientation vectors |
| `segPos()` | math-utils.js | 42-45 | ❌ NO (utility) | Calculates segment end position |
| `withAX()` | math-utils.js | 57-91 | ❌ NO (utility) | Applies local offsets |
| `angle()` | math-utils.js | 130-134 | ❌ NO (utility) | Computes angle from points |

---

## Bone Computation Pipeline

```
┌───────────────────────────────────────────────────────────────────────┐
│                         FRAME START                                    │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  INPUT GATHERING                                                       │
├───────────────────────────────────────────────────────────────────────┤
│  • User keyboard/gamepad input (controls.js)                          │
│  • Attack button presses → combat.js                                  │
│  • Movement velocity updates                                          │
│  • Debug panel manual edits                                           │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  POSE SELECTION (animator.js::updatePoses)                            │
├───────────────────────────────────────────────────────────────────────┤
│  Priority order:                                                       │
│  1. Check F.anim.override (from attacks)                              │
│     └─ If valid and not expired → use override pose                   │
│  2. Check movement speed                                              │
│     └─ If moving fast enough → computeWalkPose()                      │
│  3. Fallback to CONFIG.poses.Stance                                   │
│                                                                        │
│  Selected pose (in degrees) → converted to radians                    │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  JOINT ANGLE SMOOTHING (animator.js::updatePoses)                     │
├───────────────────────────────────────────────────────────────────────┤
│  For each joint (torso, shoulders, elbows, hips, knees):              │
│    current = F.jointAngles[key]                                       │
│    target = targetPose[key]                                           │
│    F.jointAngles[key] = damp(current, target, lambda=10, dt)          │
│                                                                        │
│  Result: F.jointAngles = {                                            │
│    torso: 0.174,      // radians                                      │
│    lShoulder: -2.094,                                                 │
│    lElbow: -2.094,                                                    │
│    rShoulder: -1.134,                                                 │
│    rElbow: -2.443,                                                    │
│    lHip: 1.919,                                                       │
│    lKnee: 0.698,                                                      │
│    rHip: 0.524,                                                       │
│    rKnee: 0.698                                                       │
│  }                                                                     │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  BONE COMPUTATION (render.js::computeAnchorsForFighter)               │
├───────────────────────────────────────────────────────────────────────┤
│  Step 1: Hitbox & Base Positions                                      │
│    • centerX = F.pos.x                                                │
│    • centerY = F.pos.y (ground level)                                 │
│    • torsoAttach = hitbox position with config offset                 │
│    • hipBase = torsoAttach + torso origin offset                      │
│                                                                        │
│  Step 2: Torso                                                        │
│    • torsoAng = F.jointAngles.torso (absolute)                        │
│    • torsoTop = segPos(hipBase, L.torso, torsoAng)                    │
│    • shoulderBase = torsoTop + shoulder offset                        │
│    • neckBase = torsoTop + neck offset                                │
│                                                                        │
│  Step 3: Arms (hierarchical angles)                                   │
│    • lUpperAng = torsoAng + F.jointAngles.lShoulder                   │
│    • lLowerAng = lUpperAng - F.jointAngles.lElbow  (SIGN FIX!)       │
│    • lElbow = segPos(shoulderBase, L.armU, lUpperAng)                 │
│    • lWrist = segPos(lElbow, L.armL, lLowerAng)                       │
│    • (same for right arm)                                             │
│                                                                        │
│  Step 4: Legs                                                         │
│    • lHipAng = F.jointAngles.lHip (+ torsoAng if legsFollow)          │
│    • lKneeAng = lHipAng - F.jointAngles.lKnee  (SIGN FIX!)           │
│    • lKnee = segPos(hipBase, L.legU, lHipAng)                         │
│    • lAnkle = segPos(lKnee, L.legL, lKneeAng)                         │
│    • (same for right leg)                                             │
│                                                                        │
│  Step 5: Head                                                         │
│    • head = { x: neckBase, len: headLen, ang: torsoAng }              │
│                                                                        │
│  Step 6: Character Mirroring (if facing left)                         │
│    • if (cos(F.facingRad) < 0):                                       │
│        for each bone:                                                 │
│          bone.x = centerX*2 - bone.x                                  │
│          bone.endX = centerX*2 - bone.endX                            │
│          bone.ang = -bone.ang                                         │
│                                                                        │
│  Result: G.ANCHORS_OBJ.player = {                                     │
│    torso: { x, y, len, ang, endX, endY },                             │
│    head: { x, y, len, ang, endX, endY },                              │
│    arm_L_upper: { x, y, len, ang, endX, endY },                       │
│    arm_L_lower: { x, y, len, ang, endX, endY },                       │
│    ... (all 10 bones)                                                 │
│  }                                                                     │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│  RENDERING                                                             │
├───────────────────────────────────────────────────────────────────────┤
│  Debug Skeleton (if RENDER_DEBUG.showBones):                          │
│    • drawStick(ctx, bones)                                            │
│      └─ for each bone: drawSegment(ctx, boneKey, bones)               │
│         └─ draws colored lines and joints                             │
│                                                                        │
│  Sprites (if RENDER_DEBUG.showSprites):                               │
│    • renderSprites(ctx)                                               │
│      └─ getBones(C, G, fname) → reads G.ANCHORS_OBJ                   │
│      └─ builds z-ordered render queue                                 │
│      └─ for each part: drawBoneSprite(ctx, asset, bone, ...)          │
│         └─ positions sprite at bone position                          │
│         └─ rotates sprite to bone angle                               │
│         └─ scales sprite to bone length                               │
└───────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌───────────────────────────────────────────────────────────────────────┐
│                         FRAME END                                      │
└───────────────────────────────────────────────────────────────────────┘
```

---

## Hierarchical Angle Accumulation

```
                    ABSOLUTE ANGLE
                         │
                         ▼
                    ┌─────────┐
                    │  TORSO  │  torsoAng (absolute from F.jointAngles.torso)
                    └────┬────┘
                         │
         ┌───────────────┼───────────────┐
         │               │               │
         ▼               ▼               ▼
    ┌─────────┐    ┌─────────┐    ┌─────────┐
    │   HEAD  │    │L SHOULDER│   │R SHOULDER│
    └─────────┘    └────┬────┘    └────┬────┘
    ang=torsoAng        │               │
                  + lShoulder      + rShoulder
                        │               │
                        ▼               ▼
                   ┌─────────┐    ┌─────────┐
                   │ L ELBOW │    │ R ELBOW │
                   └─────────┘    └─────────┘
                  upperAng        upperAng
                  - lElbow        - rElbow
                  (SIGN FIX!)     (SIGN FIX!)


                    ┌─────────┐
                    │  TORSO  │
                    └────┬────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
         ┌─────────┐           ┌─────────┐
         │  L HIP  │           │  R HIP  │
         └────┬────┘           └────┬────┘
         lHip (+torso?)        rHip (+torso?)
              │                     │
              ▼                     ▼
         ┌─────────┐           ┌─────────┐
         │ L KNEE  │           │ R KNEE  │
         └─────────┘           └─────────┘
         hipAng                hipAng
         - lKnee               - rKnee
         (SIGN FIX!)           (SIGN FIX!)
```

**Key Points:**
- Torso angle is absolute (from joint angles directly)
- Shoulders are relative to torso: `torsoAng + shoulderRel`
- Elbows are relative to upper arm: `upperAng - elbowRel` (subtraction!)
- Hips can be absolute or follow torso (config dependent)
- Knees are relative to upper leg: `hipAng - kneeRel` (subtraction!)

---

## Bone Object Structure In-Depth

```javascript
// Each bone in G.ANCHORS_OBJ.player:
{
  x: 360.5,        // World-space X of bone START point
  y: 280.3,        // World-space Y of bone START point
  len: 45.2,       // Length of the bone segment
  ang: 0.174,      // Angle in radians (0 = up, clockwise positive)
  endX: 368.2,     // World-space X of bone END point (computed)
  endY: 235.1      // World-space Y of bone END point (computed)
}

// Computation:
// endX = x + len * sin(ang)
// endY = y - len * cos(ang)  // Note: negative cos for "up" = 0
```

---

## Math Utilities in Detail

### `basis(ang)` - Orientation Vectors

```
Input: ang = 0.785 (45°)

Output:
  fx = sin(0.785) = 0.707   // Forward X component
  fy = -cos(0.785) = -0.707 // Forward Y component (up convention)
  rx = cos(0.785) = 0.707   // Right X component
  ry = sin(0.785) = 0.707   // Right Y component

Visual (in screen space where Y increases downward):
     -Y (up)
      ↑
      │  ╱ forward vector (fx, fy)
      │ ╱
      │╱____→ +X (right)
      ╱│
     ╱ │     right vector (rx, ry)
    ╱  │
       ↓
      +Y (down)
```

### `segPos(x, y, len, ang)` - Segment End Position

```
Given:
  Start: (100, 200)
  Length: 50
  Angle: π/2 (90°, pointing right)

Process:
  basis = { fx: 1, fy: 0, rx: 0, ry: 1 }
  endX = 100 + 50 * 1 = 150
  endY = 200 + 50 * 0 = 200

Result: [150, 200]
```

### `withAX(x, y, ang, ax, ay, len, units)` - Local Offsets

```
Given:
  Base position: (100, 200)
  Bone angle: 0 (up)
  Offset: ax=5, ay=10 in pixels
  
Process:
  basis = { fx: 0, fy: -1, rx: 1, ry: 0 }
  dx = 5 * 0 + 10 * 1 = 10
  dy = 5 * -1 + 10 * 0 = -5
  
Result: [110, 195]

If units='percent' and len=100:
  ax = 5 * 100 = 500
  ay = 10 * 100 = 1000
  (then apply as above)
```

---

## Walk Cycle Animation

```
Walk Phase Progression:
  time ──────────────────────────────────>
  
  phase = 0    π/2     π      3π/2    2π
          │     │      │       │      │
  sine:  -1     0     +1       0     -1
          │     │      │       │      │
  value:  0    0.5     1      0.5     0
          │     │      │       │      │
  
  Leg positions interpolate between:
    Pose A (value=0): lHip=0°,   lKnee=45°
    Pose B (value=1): lHip=180°, lKnee=90°
    
  At phase=π/4 (value=0.5):
    lHip = lerp(0, 180, 0.5) = 90°
    lKnee = lerp(45, 90, 0.5) = 67.5°
```

---

## Coordinate System & Angle Convention

```
             0° (0 rad)
               ↑ UP
               │
               │
  270°←────────┼────────→90°
  (3π/2)       │      (π/2)
               │
               │
               ↓ DOWN
            180° (π)

Screen coordinates:
  Origin (0,0) is top-left
  +X is right
  +Y is down (!)
  
But angles measure from "up" direction:
  0° points toward -Y (screen up)
  90° points toward +X (screen right)
  180° points toward +Y (screen down)
  270° points toward -X (screen left)
```

---

## Character Mirroring Logic

```
Original (facing right, facingSign=1):
      
      O  ← head (x=360)
     /|\ ← torso (x=360)
    / | \
   L  |  R ← arms (L at x=320, R at x=400)
      |
     / \
    L   R ← legs (L at x=340, R at x=380)
    
    centerX = 360

Mirrored (facing left, facingSign=-1):
      
      O  ← head (x=360, unchanged center)
     /|\ ← torso (x=360)
    / | \
   R  |  L ← arms (R at x=320, L at x=400, swapped!)
      |
     / \
    R   L ← legs (R at x=340, L at x=380, swapped!)
    
Formula for each bone:
  bone.x = centerX * 2 - bone.x
  bone.ang = -bone.ang
  
Example for L arm at x=320:
  newX = 360 * 2 - 320 = 720 - 320 = 400
  (now on right side)
  
Angle example for bone at +45°:
  newAng = -45° = -0.785 rad
  (mirror angle across vertical axis)
```

---

## Performance Characteristics

| Operation | Frequency | Cost | Notes |
|-----------|-----------|------|-------|
| `updatePoses()` | Once per frame | Low | Updates 9 joint angles |
| `computeAnchorsForFighter()` | Once per frame per fighter | Medium | Creates 10 bone objects |
| `renderSprites()` | Once per frame | High | 10+ sprite draws with transforms |
| `drawStick()` | Once per frame (if enabled) | Low | Simple line drawing |
| `getBones()` | Once per frame (sprites only) | Low | Reads existing bones |

**Optimization notes:**
- Bones are fully recomputed each frame (no caching)
- Joint angle interpolation is cheap (just multiplication)
- Sprite rendering is most expensive (canvas transforms + draws)
- Debug skeleton is very cheap (just lines and circles)

---

## Common Bone Manipulation Patterns

### 1. Playing an Attack Animation
```javascript
// In combat.js or similar:
const attackPose = {
  torso: 45,
  rShoulder: -90,
  rElbow: -30,
  // ... other joints
};

pushPoseOverride('player', attackPose, 250); // 250ms duration

// This will cause updatePoses() to use this pose
// which will update F.jointAngles
// which will be read by computeAnchorsForFighter()
// resulting in new bone positions
```

### 2. Manual Debug Pose Editing
```javascript
// In debug-panel.js:
function onSliderChange(joint, degValue) {
  const radValue = degValue * Math.PI / 180;
  
  // Directly modify joint angle:
  fighter.jointAngles[joint] = radValue;
  
  // Push short override to prevent animation from overwriting:
  setPoseValue(fighter, joint, radValue);
}
```

### 3. Walking Animation
```javascript
// In animator.js:
function computeWalkPose(F, C) {
  // Update phase based on speed:
  F.walk.phase += dt * frequency * 2 * Math.PI;
  
  // Interpolate between keyframes:
  const t = (Math.sin(F.walk.phase) + 1) / 2;
  const pose = {
    lHip: lerp(poseA.lHip, poseB.lHip, t),
    lKnee: lerp(poseA.lKnee, poseB.lKnee, t),
    // ... other joints
  };
  
  return pose; // Will be applied by updatePoses()
}
```

---

## Debugging Bone Issues

### Common Issues and Solutions:

**Issue:** Limbs pointing wrong direction
- **Cause:** Angle convention mismatch
- **Solution:** Verify using "up" = 0 convention, check sign of elbow/knee angles

**Issue:** Limbs incorrect length
- **Cause:** Config values not scaled properly
- **Solution:** Check `C.actor.scale`, `C.parts.*.length` values

**Issue:** Limbs disconnected
- **Cause:** Offset computation error
- **Solution:** Verify `withAX()` calls, check offset units (px vs percent)

**Issue:** Character faces wrong direction
- **Cause:** Mirroring not applied or applied incorrectly
- **Solution:** Check `F.facingRad` or `F.facingSign`, verify mirror logic

**Issue:** Jerky animation
- **Cause:** Damping too fast or delta time incorrect
- **Solution:** Adjust lambda in `updatePoses()`, verify `dt` calculation

### Debug Tools:

1. **Freeze Angles Checkbox** (`CONFIG.debug.freezeAngles`)
   - Stops `updatePoses()` from running
   - Allows manual pose inspection

2. **Debug Panel Transform Display**
   - Shows live bone positions and angles
   - Updates every frame

3. **Debug Skeleton Rendering** (`RENDER_DEBUG.showBones`)
   - Visualizes bone structure with colored lines
   - Each bone has unique color

4. **Console Logging**
   - Enable in specific functions to trace data flow
   - Check `G.ANCHORS_OBJ.player` in console

---

## Future Extensions

Potential areas for expansion:

1. **Inverse Kinematics (IK)**
   - Compute joint angles from target positions
   - Useful for foot placement, hand reaching

2. **Physics Integration**
   - Ragdoll mode for knockdowns
   - Collision response

3. **Blend Trees**
   - Smooth transitions between poses
   - Layered animations

4. **Weapon Bones**
   - Additional bones for held items
   - Attach to hand bones dynamically

5. **Facial Animation**
   - Sub-bones for head (eyes, mouth)
   - Expression system

---

*Visual reference document generated for SoK Empire Prologue bone system.*
*Companion to BONE_SYSTEM_MAPPING.md*
*Last updated: 2025-11-06*
