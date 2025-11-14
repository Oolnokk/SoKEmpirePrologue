# Bone System Architecture and Function Mapping

## Overview
This document provides a comprehensive mapping of every function that alters bones in the SoK Empire Prologue codebase, including what they do and where they get their data from.

## Table of Contents
1. [Core Bone Data Structures](#core-bone-data-structures)
2. [Bone Creation Functions](#bone-creation-functions)
3. [Bone Transformation Functions](#bone-transformation-functions)
4. [Bone Rendering Functions](#bone-rendering-functions)
5. [Bone Manipulation/Update Functions](#bone-manipulationupdate-functions)
6. [Data Flow Diagram](#data-flow-diagram)

---

## Core Bone Data Structures

### Bone Object Structure
```javascript
{
  x: number,      // Start X position in world space
  y: number,      // Start Y position in world space
  len: number,    // Length of the bone
  ang: number,    // Angle in radians (0 = up, clockwise positive)
  endX: number,   // End X position (computed)
  endY: number    // End Y position (computed)
}
```

### Bone Keys
The system uses the following bone identifiers:
- `torso` - Main body segment
- `head` - Head/skull segment
- `arm_L_upper` - Left upper arm
- `arm_L_lower` - Left forearm
- `arm_R_upper` - Right upper arm
- `arm_R_lower` - Right forearm
- `leg_L_upper` - Left thigh
- `leg_L_lower` - Left shin/foot
- `leg_R_upper` - Right thigh
- `leg_R_lower` - Right shin/foot

---

## Bone Creation Functions

### 1. `getBones(C, G, fname)` 
**Location:** `docs/js/sprites.js:77-116`

**Purpose:** Creates bone objects for sprite rendering from fighter anchor data.

**Data Sources:**
- `G.ANCHORS_OBJ.player` - Pre-computed bone object (if available)
- `G.ANCHORS.player` - Legacy array-based anchor positions
- `C.fighters[fname].parts.head` - Head configuration (neck length, radius)
- `C.parts.head` - Global head configuration (fallback)
- `C.actor.scale` - Global actor scale multiplier

**Process:**
1. First checks if `G.ANCHORS_OBJ.player` exists and returns it directly
2. If not, uses `G.ANCHORS.player` array-based positions
3. For each limb, calls internal `boneFrom(start, end)` helper
4. Computes head bone using neck length and radius config
5. Returns object with all bone keys

**Bone Alterations:**
- Creates new bone objects from scratch
- Computes `len` using `dist(start, end)`
- Computes `ang` using `angle(start, end)` (up = 0 convention)

**Output:** Returns object keyed by bone names, each containing `{x, y, len, ang}`

---

### 2. `computeAnchorsForFighter(F, C, fighterTypeName)`
**Location:** `docs/js/render.js:81-173`

**Purpose:** Primary function that computes all bone positions and orientations for a fighter type based on joint angles.

**Data Sources:**
- `F.pos.x, F.pos.y` - Fighter position in world space
- `F.jointAngles` - Object containing all joint angles in radians:
  - `torso` - Absolute torso angle
  - `lShoulder, rShoulder` - Relative shoulder angles
  - `lElbow, rElbow` - Relative elbow angles
  - `lHip, rHip` - Hip angles (absolute or relative based on config)
  - `lKnee, rKnee` - Relative knee angles
- `F.facingRad` or `F.facingSign` - Character facing direction
- `C.parts.hitbox.torsoAttach` - Torso attachment point config
- `C.groundRatio` - Ground level ratio
- `C.hierarchy.legsFollowTorsoRotation` - Whether legs rotate with torso
- Fighter type-specific configs from `pickFighterTypeConfig(C, fighterTypeName)`
- Limb lengths from `lengths(C, fcfg)` function
- Offsets from `pickOffsets(C, fcfg)` function

**Process:**
1. Computes hitbox position from fighter center and ground ratio
2. Calculates torso attachment point from hitbox
3. Applies torso origin offset to get hip base position
4. Computes torso top position using `segPos()`
5. Calculates shoulder and neck base positions with offsets
6. For arms:
   - Computes upper arm angles: `torsoAng + shoulderRel`
   - Computes lower arm angles: `upperAng + elbowRel` (consistent addition)
   - Calculates elbow positions using `segPos()`
   - Calculates wrist positions using `segPos()` and offsets
7. For legs:
   - Computes hip angles (with optional torso rotation inheritance)
   - Computes knee angles: `hipAng + kneeRel` (consistent addition)
   - Calculates knee positions using `segPos()`
   - Calculates ankle positions using `segPos()` and offsets
8. Mirrors all bones horizontally if character faces left

**Bone Alterations:**
- Creates complete bone objects with `x, y, len, ang, endX, endY`
- Applies hierarchical joint angle accumulation
- Applies character mirroring (flips x positions and negates angles)

**Output:** Returns `{ B, L, hitbox }` where B is object with all bones

---

## Bone Transformation Functions

### 3. `basisFor(ang)` / `basis(ang)`
**Location:** `docs/js/sprites.js:34-39`, `docs/js/render.js:46`, `docs/js/math-utils.js:23-32`

**Purpose:** Computes basis vectors for bone-local coordinate systems.

**Data Sources:**
- `ang` - Angle in radians

**Process:**
```javascript
fx = sin(ang)    // Forward X component
fy = -cos(ang)   // Forward Y component (up = 0)
rx = cos(ang)    // Right X component
ry = sin(ang)    // Right Y component
```

**Bone Alterations:**
- Does not alter bones directly
- Used by other functions to transform positions in bone-local space

**Output:** Returns `{ fx, fy, rx, ry }` basis vectors

---

### 4. `segPos(x, y, len, ang)`
**Location:** `docs/js/math-utils.js:42-45`

**Purpose:** Calculates the end position of a bone segment given start, length, and angle.

**Data Sources:**
- `x, y` - Start position
- `len` - Segment length
- `ang` - Angle in radians

**Process:**
1. Gets basis vectors from `basis(ang)`
2. Computes: `endX = x + len * fx`
3. Computes: `endY = y + len * fy`

**Bone Alterations:**
- Used to compute bone end positions
- Does not modify existing bones

**Output:** Returns `[endX, endY]` array

---

### 5. `withAX(x, y, ang, ax, ay, unitsLen, units)`
**Location:** `docs/js/render.js:60-79`, `docs/js/math-utils.js:57-91`

**Purpose:** Applies offset to a position in bone-local coordinate system.

**Data Sources:**
- `x, y` - Base position
- `ang` - Bone angle for local coordinate system
- `ax, ay` - Offset amounts (or offset object/array)
- `unitsLen` - Length multiplier for percentage units
- `units` - Unit type string ('percent', '%', 'pct', or 'px')

**Process:**
1. Parses offset from various input formats (array, object, or separate numbers)
2. If units are percentage-based, multiplies offsets by `unitsLen`
3. Gets basis vectors from `basis(ang)`
4. Computes local offset: `dx = ax * fx + ay * rx`, `dy = ax * fy + ay * ry`
5. Returns adjusted position

**Bone Alterations:**
- Used to compute attachment points on bones
- Does not modify bone objects directly
- Used extensively in `computeAnchorsForFighter()`

**Output:** Returns `[adjustedX, adjustedY]` array

---

### 6. `angle(a, b)` / `angleFromDelta(dx, dy)`
**Location:** `docs/js/sprites.js:51-57`, `docs/js/render.js:47-49`, `docs/js/math-utils.js:108-110`, `docs/js/math-utils.js:130-134`

**Purpose:** Computes angle between two points or from delta coordinates using "up" = 0 convention.

**Data Sources:**
- `a, b` - Two points as `[x, y]` arrays, OR
- `dx, dy` - Delta coordinates

**Process:**
```javascript
return Math.atan2(dx, -dy)  // Note: -dy for "up" = 0 convention
```

**Bone Alterations:**
- Used in `getBones()` to compute bone angles from positions
- Does not modify existing bones

**Output:** Returns angle in radians

---

## Bone Rendering Functions

### 7. `drawBoneSprite(ctx, asset, bone, styleKey, style, offsets)`
**Location:** `docs/js/sprites.js:223-284`

**Purpose:** Renders a sprite image aligned to a bone.

**Data Sources:**
- `bone.x, bone.y` - Bone start position
- `bone.len` - Bone length (used for sprite height)
- `bone.ang` - Bone angle
- `asset.img` - Sprite image
- `asset.alignRad` - Additional rotation alignment
- `style.anchor[styleKey]` - Anchor mode ('start' or 'mid')
- `style.xform[styleKey]` - Transform config (ax, ay, scaleX, scaleY)
- `style.xformUnits` - Unit type for offsets
- `style.widthFactor[styleKey]` - Width scaling factor

**Process:**
1. Determines anchor point (start or midpoint of bone)
2. Applies local offsets using `basisFor()` and bone angle
3. Computes sprite dimensions from bone length and aspect ratio
4. Applies scale transforms
5. Computes rotation: `theta = bone.ang + alignRad + Math.PI`
6. Renders sprite using canvas transformations

**Bone Alterations:**
- Does not alter bone data
- Only reads bone properties for rendering

**Output:** Returns boolean (success/failure)

---

### 8. `drawSegment(ctx, boneKey, B)`
**Location:** `docs/js/render.js:216-238`

**Purpose:** Renders a debug visualization of a bone segment.

**Data Sources:**
- `B[boneKey]` - Bone object
- `LIMB_COLORS[boneKey]` - Color for this bone
- `window.RENDER_DEBUG.showBones` - Global visibility flag
- `window.RENDER_DEBUG.showBone[boneKey]` - Per-bone visibility

**Process:**
1. Checks if bone should be rendered (visibility flags)
2. Gets bone start position and angle
3. Computes end position (from `endX, endY` or via `segPos()`)
4. Draws line from start to end
5. Draws joint circles at start and end

**Bone Alterations:**
- Does not alter bone data
- Only reads bone properties for visualization

**Output:** None (renders to canvas)

---

### 9. `drawStick(ctx, B)`
**Location:** `docs/js/render.js:240-253`

**Purpose:** Draws all bones in debug skeleton visualization.

**Data Sources:**
- `B` - Object containing all bones
- `window.RENDER_DEBUG.showBones` - Global visibility flag

**Process:**
1. Checks global visibility flag
2. Iterates through bone order array
3. Calls `drawSegment()` for each bone

**Bone Alterations:**
- Does not alter bone data
- Purely visualization

**Output:** None (renders to canvas)

---

### 10. `renderSprites(ctx)`
**Location:** `docs/js/sprites.js:286-327`

**Purpose:** Renders all sprite images for a fighter's bones.

**Data Sources:**
- `window.CONFIG` - Global configuration
- `window.GAME` - Global game state
- `window.RENDER_DEBUG.showSprites` - Sprite visibility flag
- Result from `getBones(C, GLOB, fname)` - Bone positions
- Fighter sprite assets from `ensureFighterSprites()`

**Process:**
1. Gets fighter name and bones via `getBones()`
2. Builds render queue with z-ordering
3. For each body part (torso, head, arms, legs):
   - Enqueues sprite drawing calls
   - Arms/legs use branch mirroring
4. Sorts queue by z-order
5. Executes drawing functions

**Bone Alterations:**
- Does not alter bone data
- Reads bones for sprite positioning

**Output:** None (renders to canvas)

---

### 11. `drawArmBranch(ctx, rig, side, assets, style, offsets, segment)`
**Location:** `docs/js/sprites.js:197-208`

**Purpose:** Draws arm sprites with branch-level mirroring.

**Data Sources:**
- `rig` - Bone object from `getBones()`
- `side` - 'L' or 'R'
- `RENDER.MIRROR[tagU/tagL]` - Per-part mirror flags
- Upper/lower arm bones from rig

**Process:**
1. Gets upper and lower arm bone keys for specified side
2. Checks mirror flags for this arm
3. Applies branch mirroring transformation if needed
4. Calls `drawBoneSprite()` for upper/lower segments

**Bone Alterations:**
- Does not alter bone data
- Uses mirroring for rendering only

**Output:** None (renders to canvas)

---

### 12. `drawLegBranch(ctx, rig, side, assets, style, offsets, segment)`
**Location:** `docs/js/sprites.js:179-194`

**Purpose:** Draws leg sprites with branch-level mirroring.

**Data Sources:**
- `rig` - Bone object from `getBones()`
- `side` - 'L' or 'R'
- `RENDER.MIRROR[tagU/tagL]` - Per-part mirror flags
- Upper/lower leg bones from rig

**Process:**
1. Gets upper and lower leg bone keys for specified side
2. Checks mirror flags for this leg
3. Applies branch mirroring transformation if needed
4. Calls `drawBoneSprite()` for upper/lower segments

**Bone Alterations:**
- Does not alter bone data
- Uses mirroring for rendering only

**Output:** None (renders to canvas)

---

## Bone Manipulation/Update Functions

### 13. `updatePoses()`
**Location:** `docs/js/animator.js:32-44`

**Purpose:** Updates fighter joint angles based on animation state (walk, idle, overrides).

**Data Sources:**
- `window.GAME.FIGHTERS` - Fighter objects
- `window.CONFIG.debug.freezeAngles` - Debug freeze flag
- `window.CONFIG.poses.Stance` - Base stance pose
- `F.anim.override` - Pose override object
- `F.vel.x` or computed speed - Movement velocity
- Walk pose configuration from `CONFIG.walk`

**Process:**
1. Checks if angles are frozen (debug mode)
2. For each fighter:
   - Checks for pose override (from attacks, etc.)
   - If no override, computes walk pose if moving
   - Falls back to stance pose if not moving
   - Converts target pose from degrees to radians
   - Applies exponential damping to smoothly interpolate `F.jointAngles` toward target

**Bone Alterations:**
- **DIRECTLY MODIFIES** `F.jointAngles[key]` for all joint angle keys
- Uses damping formula: `current + (target - current) * (1 - exp(-lambda * dt))`
- This is the primary function that updates joint angles that drive bone positions

**Output:** None (modifies fighter objects in place)

---

### 14. `pushPoseOverride(fighterId, poseDeg, durMs)`
**Location:** `docs/js/animator.js:46`

**Purpose:** Sets a temporary pose override for attack animations.

**Data Sources:**
- `fighterId` - Fighter identifier ('player' or 'npc')
- `poseDeg` - Pose object with angles in degrees
- `durMs` - Duration in milliseconds
- `window.GAME.FIGHTERS[fighterId]` - Fighter object

**Process:**
1. Gets fighter by ID
2. Ensures animation state exists
3. Sets `F.anim.override` with pose and expiration time

**Bone Alterations:**
- Indirectly affects bones by setting override that `updatePoses()` will apply
- Does not directly modify bone objects

**Output:** None (modifies fighter animation state)

---

### 15. `setPoseValue(fighter, key, radValue)`
**Location:** `docs/js/debug-panel.js:275-294`

**Purpose:** Sets a single joint angle value in debug panel.

**Data Sources:**
- `fighter` - Fighter object
- `key` - Joint angle key (e.g., 'torso', 'lElbow')
- `radValue` - New angle value in radians

**Process:**
1. Sets `fighter.jointAngles[key] = radValue`
2. Converts all joint angles to degrees
3. Calls `pushPoseOverride()` with short duration

**Bone Alterations:**
- **DIRECTLY MODIFIES** `fighter.jointAngles[key]`
- Indirectly affects bones through joint angles

**Output:** None (modifies fighter joint angles)

---

### 16. `computeWalkPose(F, C)`
**Location:** `docs/js/animator.js:13-27`

**Purpose:** Generates walk cycle pose based on movement speed.

**Data Sources:**
- `F.pos.x` - Fighter position (for speed calculation)
- `F.vel.x` - Fighter velocity
- `F.onGround` - Ground contact flag
- `F.walk.phase` - Current walk cycle phase
- `C.walk` - Walk configuration:
  - `baseHz` - Base cycle frequency
  - `speedScale` - Speed scaling factor
  - `minSpeed` - Minimum speed to animate
  - `poses.A, poses.B` - Keyframe poses

**Process:**
1. Computes movement speed from velocity or position delta
2. Determines if walk should be active (speed > threshold, on ground)
3. Updates walk phase based on speed and time
4. Interpolates between keyframe poses A and B using sine wave
5. Applies to legs and torso, keeps arms at stance

**Bone Alterations:**
- Does not directly modify bones
- Returns pose that `updatePoses()` will apply to joint angles

**Output:** Returns pose object with degrees for interpolated joint angles

---

### 17. Character Facing Mirroring
**Location:** `docs/js/render.js:155-170`

**Purpose:** Mirrors bone positions when character faces left.

**Data Sources:**
- `F.facingRad` or `F.facingSign` - Character facing direction
- `centerX` - Character center X position

**Process:**
1. Computes facing direction from `facingRad` or `facingSign`
2. If facing left (cos(facingRad) < 0):
   - For each bone in B:
     - Mirrors X position: `x = centerX * 2 - x`
     - Mirrors endX position if present
     - Negates angle: `ang = -ang`

**Bone Alterations:**
- **DIRECTLY MODIFIES** bone `x, endX, ang` values
- Applied in `computeAnchorsForFighter()` after bone computation
- Preserves Y coordinates, only flips X-axis

**Output:** Modifies bones in place

---

## Helper Functions (Data Access/Conversion)

### 18. `toCompatArrays(obj)`
**Location:** `docs/js/render.js:175-194`

**Purpose:** Converts bone objects to legacy array format.

**Data Sources:**
- `obj.B` - Bone object map

**Process:**
Extracts positions from bones into named arrays for backwards compatibility.

**Bone Alterations:**
- Does not alter bones
- Only reads and converts format

**Output:** Returns object with array-format anchor positions

---

### 19. `boneFrom(start, end)` (internal helper)
**Location:** `docs/js/sprites.js:96`

**Purpose:** Creates bone object from start and end points.

**Data Sources:**
- `start` - `[x, y]` start position
- `end` - `[x, y]` end position

**Process:**
```javascript
const len = dist(start, end);
const ang = angle(start, end);
return { x: start[0], y: start[1], len, ang };
```

**Bone Alterations:**
- Creates new bone objects
- Used internally by `getBones()`

**Output:** Returns bone object

---

### 20. `rad(v)`
**Location:** `docs/js/math-utils.js:98-100`, used in `docs/js/render.js`

**Purpose:** Null-safe accessor for angle values.

**Data Sources:**
- `v` - Value to check (angle from `F.jointAngles`)

**Process:**
Returns `v` if not null/undefined, otherwise returns 0.

**Bone Alterations:**
- Does not alter bones
- Used when reading joint angles to compute bones

**Output:** Returns number (angle or 0)

---

## Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                    INPUT SOURCES                                 │
├─────────────────────────────────────────────────────────────────┤
│ • User Input (controls.js)                                      │
│ • Attack System (combat.js, presets.js)                         │
│ • Configuration (CONFIG.poses, CONFIG.walk)                     │
│ • Debug Panel (debug-panel.js manual edits)                     │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│              JOINT ANGLE UPDATES                                 │
│  Function: updatePoses() (animator.js:32-44)                    │
├─────────────────────────────────────────────────────────────────┤
│ • Checks pose overrides (attacks)                               │
│ • Computes walk poses from speed                                │
│ • Falls back to stance pose                                     │
│ • Applies exponential damping                                   │
│ • WRITES: F.jointAngles[key] (radians)                          │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│             BONE COMPUTATION                                     │
│  Function: computeAnchorsForFighter() (render.js:81-173)        │
├─────────────────────────────────────────────────────────────────┤
│ • READS: F.jointAngles (all keys)                               │
│ • READS: F.pos, F.facingRad/facingSign                          │
│ • READS: CONFIG limb lengths, offsets                           │
│ • Computes hierarchical bone positions                          │
│ • Applies offsets with withAX()                                 │
│ • Uses segPos() for end positions                               │
│ • Applies character mirroring if facing left                    │
│ • WRITES: G.ANCHORS_OBJ.player (bone objects)                   │
│ • WRITES: G.ANCHORS.player (array format)                       │
└────────────┬────────────────────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────────────────────┐
│                  RENDERING                                       │
├─────────────────────────────────────────────────────────────────┤
│  Sprites (sprites.js):                                           │
│  • getBones() → reads G.ANCHORS_OBJ                             │
│  • renderSprites() → calls drawBoneSprite()                     │
│  • READS bones for positioning/rotation                         │
│                                                                  │
│  Debug Skeleton (render.js):                                    │
│  • drawStick() → calls drawSegment()                            │
│  • READS bones for visualization                                │
└─────────────────────────────────────────────────────────────────┘
```

---

## Summary of Functions That ALTER Bones

### Direct Bone Modifications:
1. **`computeAnchorsForFighter()`** - Creates/computes all bone objects from joint angles
2. **Character Facing Mirroring** (in `computeAnchorsForFighter()`) - Mirrors bone positions/angles
3. **`getBones()`** - Creates bones from anchor positions (alternative path)

### Indirect Bone Modifications (via Joint Angles):
1. **`updatePoses()`** - Updates `F.jointAngles` which drives bone computation
2. **`setPoseValue()`** - Debug function to manually set joint angles
3. **`pushPoseOverride()`** - Sets pose overrides for animations
4. **`computeWalkPose()`** - Generates walk cycle poses

### Read-Only Functions (Do Not Alter Bones):
- All rendering functions (`drawBoneSprite`, `drawSegment`, `renderSprites`, etc.)
- All math utilities (`basis`, `segPos`, `withAX`, `angle`, etc.)
- Display/debug functions (`updateTransformsDisplay`, `getSpriteInfo`)

---

## Configuration Sources

### CONFIG.poses
Defines named poses with joint angles in degrees:
```javascript
CONFIG.poses.Stance = {
  torso: 10,
  lShoulder: -120, lElbow: -120,
  rShoulder: -65, rElbow: -140,
  lHip: 110, lKnee: 40,
  rHip: 30, rKnee: 40
}
```

### CONFIG.walk
Defines walk cycle animation:
```javascript
CONFIG.walk = {
  enabled: true,
  baseHz: 1.2,
  speedScale: 1.0,
  minSpeed: 60,
  poses: {
    A: { torso: 30, lHip: 0, lKnee: 45, rHip: 180, rKnee: 90 },
    B: { torso: 40, lHip: 180, lKnee: 90, rHip: 0, rKnee: 45 }
  }
}
```

### CONFIG.parts
Defines body part dimensions and attachment points used for bone length calculations.

### CONFIG.hierarchy
Controls bone parent-child relationships (e.g., `legsFollowTorsoRotation`).

---

## Coordinate System

**Convention:** "Up" = 0 radians, angles increase clockwise

- 0° (0 rad) = Up (negative Y)
- 90° (π/2 rad) = Right (positive X)
- 180° (π rad) = Down (positive Y)
- 270° (3π/2 rad) = Left (negative X)

**Basis Vectors:**
```javascript
fx = sin(angle)   // Forward X
fy = -cos(angle)  // Forward Y (negative for up convention)
rx = cos(angle)   // Right X
ry = sin(angle)   // Right Y
```

---

## Testing

All bone functions are covered by tests in:
- `tests/debug-panel.test.js`
- `tests/v20-orientation.test.js`
- `tests/render-debug.test.js`
- `tests/freeze-angles.test.js`

Run tests with: `npm test`

---

## Notes

1. **Joint angles are hierarchical**: Elbow/knee angles are relative to their parent limb angles.
2. **Consistent angle accumulation**: All child joint angles use addition for uniform hierarchical computation.
3. **Mirroring is applied last**: Character facing flips bones after all computations.
4. **All angles in radians internally**: Degree conversion only at input/output boundaries.
5. **Bone objects are recreated each frame**: No incremental updates, full recomputation.

---

*Document generated as part of comprehensive bone system analysis for SoK Empire Prologue.*
*Last updated: 2025-11-06*
