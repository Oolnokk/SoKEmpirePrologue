# Bone Functions Quick Reference

## Critical Functions (Directly Modify Bones)

### `computeAnchorsForFighter(F, C, fighterTypeName)`
📍 **Location:** `docs/js/render.js:81-173`  
⚡ **Called:** Every frame in `renderAll()`  
🎯 **Purpose:** Main bone computation pipeline  

**Reads:**
- `F.jointAngles.*` - All joint angles (radians)
- `F.pos.x, F.pos.y` - Fighter world position
- `F.facingRad` / `F.facingSign` - Facing direction

**Writes:**
- `G.ANCHORS_OBJ.player` - Bone object map
- `G.ANCHORS.player` - Legacy array format

**Process:**
1. Compute hitbox/base positions
2. Build torso from joint angle
3. Compute arms hierarchically (torso → shoulder → elbow)
4. Compute legs hierarchically (torso/hip → knee)
5. Apply character mirroring if facing left

---

### `updatePoses()`
📍 **Location:** `docs/js/animator.js:32-44`  
⚡ **Called:** Every frame before rendering  
🎯 **Purpose:** Update joint angles from animations  

**Reads:**
- `F.anim.override` - Attack/pose overrides
- `F.vel.x` - Movement velocity
- `CONFIG.poses.*` - Pose definitions
- `CONFIG.walk.*` - Walk animation config

**Writes:**
- `F.jointAngles.*` - All 9 joint angles (radians)

**Process:**
1. Check for pose override (attacks)
2. If no override, compute walk pose if moving
3. Fall back to stance pose
4. Apply exponential damping to smooth transition

**⚠️ IMPORTANT:** This is where joint angles get updated!

---

### `getBones(C, G, fname)`
📍 **Location:** `docs/js/sprites.js:77-116`  
⚡ **Called:** Once per frame in `renderSprites()`  
🎯 **Purpose:** Create bones for sprite rendering  

**Reads:**
- `G.ANCHORS_OBJ.player` - Preferred source (if available)
- `G.ANCHORS.player` - Fallback array-based positions

**Writes:**
- Returns new bone object map

**Process:**
- Returns existing `G.ANCHORS_OBJ` if available
- Otherwise constructs bones from anchor arrays
- Internal helper `boneFrom(start, end)` creates each bone

---

## Support Functions (Indirect Effects)

### `pushPoseOverride(fighterId, poseDeg, durMs)`
📍 `docs/js/animator.js:46`  
🎯 Sets temporary pose override for attacks  
⚠️ Affects bones via `updatePoses()`

### `computeWalkPose(F, C)`
📍 `docs/js/animator.js:13-27`  
🎯 Generates walk cycle pose from speed  
⚠️ Returns pose that `updatePoses()` applies

### `setPoseValue(fighter, key, radValue)`
📍 `docs/js/debug-panel.js:275-294`  
🎯 Debug manual joint angle editing  
⚠️ Directly sets joint angle + push override

---

## Math Utilities (Read-Only)

### `basis(ang)` → `{fx, fy, rx, ry}`
📍 `docs/js/math-utils.js:23-32`  
Computes orientation vectors from angle

### `segPos(x, y, len, ang)` → `[endX, endY]`
📍 `docs/js/math-utils.js:42-45`  
Calculates bone end position

### `withAX(x, y, ang, ax, ay, len, units)` → `[newX, newY]`
📍 `docs/js/math-utils.js:57-91`  
Applies offset in bone-local coordinates

### `angle(a, b)` → `radians`
📍 `docs/js/math-utils.js:130-134`  
Computes angle between points (up = 0)

### `dist(a, b)` → `number`
📍 `docs/js/math-utils.js:118-122`  
Calculates distance between points

---

## Rendering Functions (Read-Only)

### `drawBoneSprite(ctx, asset, bone, styleKey, style, offsets)`
📍 `docs/js/sprites.js:223-284`  
Renders sprite aligned to bone

### `drawSegment(ctx, boneKey, B)`
📍 `docs/js/render.js:216-238`  
Draws debug skeleton line

### `renderSprites(ctx)`
📍 `docs/js/sprites.js:286-327`  
Main sprite rendering loop

### `drawStick(ctx, B)`
📍 `docs/js/render.js:240-253`  
Draws entire debug skeleton

---

## Data Flow Quick View

```
Input → updatePoses() → F.jointAngles
                           ↓
            computeAnchorsForFighter() → G.ANCHORS_OBJ
                                            ↓
                            ┌───────────────┴───────────────┐
                            ↓                               ↓
                       getBones()                      drawStick()
                            ↓
                     renderSprites()
```

---

## Joint Angle Keys

| Key | Description | Type |
|-----|-------------|------|
| `torso` | Torso tilt | Absolute |
| `lShoulder` | Left shoulder | Relative to torso |
| `lElbow` | Left elbow | Relative to upper arm |
| `rShoulder` | Right shoulder | Relative to torso |
| `rElbow` | Right elbow | Relative to upper arm |
| `lHip` | Left hip | Absolute (or +torso) |
| `lKnee` | Left knee | Relative to upper leg |
| `rHip` | Right hip | Absolute (or +torso) |
| `rKnee` | Right knee | Relative to upper leg |

---

## Bone Keys

| Key | Description |
|-----|-------------|
| `torso` | Main body |
| `head` | Head/neck |
| `arm_L_upper` | Left upper arm |
| `arm_L_lower` | Left forearm |
| `arm_R_upper` | Right upper arm |
| `arm_R_lower` | Right forearm |
| `leg_L_upper` | Left thigh |
| `leg_L_lower` | Left shin |
| `leg_R_upper` | Right thigh |
| `leg_R_lower` | Right shin |

---

## Angle Convention

```
    0° (UP)
      ↑
      │
←─────┼─────→
270°  │  90°
      │
      ↓
   180° (DOWN)
```

- **0 radians = UP** (negative Y in screen space)
- **Clockwise = positive**
- **All internal angles in radians**

---

## Common Operations

### Read current bone position:
```javascript
const bone = window.GAME.ANCHORS_OBJ.player.arm_R_upper;
console.log(`Arm at (${bone.x}, ${bone.y}), angle ${bone.ang}`);
```

### Set joint angle (debug):
```javascript
const fighter = window.GAME.FIGHTERS.player;
fighter.jointAngles.rShoulder = Math.PI / 2; // 90 degrees
```

### Play attack animation:
```javascript
import { pushPoseOverride } from './animator.js';

pushPoseOverride('player', {
  torso: 45,
  rShoulder: -90,
  rElbow: -30
}, 200); // 200ms
```

### Check if bones exist:
```javascript
const bones = window.GAME?.ANCHORS_OBJ?.player;
if (bones && bones.torso) {
  // Bones are ready
}
```

---

## Debug Commands (Console)

```javascript
// Freeze animations
window.CONFIG.debug = { freezeAngles: true };

// Show/hide debug skeleton
window.RENDER_DEBUG.showBones = true;

// Show/hide sprites
window.RENDER_DEBUG.showSprites = false;

// Show specific bone
window.RENDER_DEBUG.showBone.arm_L_upper = false;

// Check bone data
console.table(window.GAME.ANCHORS_OBJ.player);

// Check joint angles (in radians)
console.table(window.GAME.FIGHTERS.player.jointAngles);

// Convert radian to degrees
const deg = (rad) => (rad * 180 / Math.PI).toFixed(2);
```

---

## File Locations

| File | Primary Functions |
|------|-------------------|
| `render.js` | `computeAnchorsForFighter()`, `drawSegment()`, `drawStick()` |
| `animator.js` | `updatePoses()`, `pushPoseOverride()`, `computeWalkPose()` |
| `sprites.js` | `getBones()`, `renderSprites()`, `drawBoneSprite()` |
| `math-utils.js` | `basis()`, `segPos()`, `withAX()`, `angle()`, `dist()` |
| `debug-panel.js` | `setPoseValue()`, debug UI updates |

---

## Testing

Run bone system tests:
```bash
npm test
```

Tests located in:
- `tests/debug-panel.test.js`
- `tests/v20-orientation.test.js`
- `tests/render-debug.test.js`
- `tests/freeze-angles.test.js`

---

*Quick reference for bone system in SoK Empire Prologue*
*See BONE_SYSTEM_MAPPING.md for detailed documentation*
*See BONE_SYSTEM_VISUAL.md for visual diagrams*
