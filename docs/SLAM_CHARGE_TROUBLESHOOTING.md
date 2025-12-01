# SLAM Charge Phase - Troubleshooting History

## Initial Problem Report

**User Feedback**: "im not sure whether its happening or not"

The Charge phase had been added to the SLAM attack sequence, but there was no visible indication that it was actually executing. The character appeared to skip directly from Windup to Strike without any noticeable intermediate phase.

## Attempted Solutions

### Attempt 1: Add Charge Phase to Sequence (Initial Implementation)
**What was tried**:
- Created `Charge` pose in `SLAM_MOVE_POSES` with deeper arm pullback and leg bend
- Added Charge to attack sequence between Windup and Slam
- Split 800ms wind-up into Windup (400ms) + Charge (400ms)
- Updated durations object to include `toCharge: 400`

**Files modified**:
- `docs/config/config.js` (lines 646-661, 1184-1197)

**Result**: ❌ **FAILED**
- Phase was executing in timeline but had no visible movement
- Pose changes were subtle and hard to distinguish from Windup
- No spatial translation occurred during the phase

**Why it failed**:
The Charge pose only modified joint angles (torso, shoulders, elbows, hips, knees). While these created a different visual pose, there was:
1. No root position movement
2. No velocity applied
3. No visual indicator the phase was happening

The existing properties in the pose were:
```javascript
rootMoveVel: { x: 0, y: 0 },  // No movement
impulseMag: 0,                 // No impulse
impulseDirDeg: 0               // No direction
```

These explicitly prevented any movement during the Charge phase.

---

### Attempt 2: Implement Lerped Translate System
**What was tried**:
- Created new `translate` parameter for poses
- Implemented lerp logic in `processAnimEventsForOverride()` function
- System calculates incremental position changes based on animation progress (k: 0→1)
- Added support for local space with `translate.local` flag
- Applied 80px forward translation to Charge phase

**Files modified**:
- `docs/js/animator.js` (lines 1934-1957) - Added translate lerp logic
- `docs/config/config.js` (line 659) - Added `translate: { x: 80, y: 0, local: true }`

**Result**: ✅ **PARTIAL SUCCESS**
- Charge phase now had visible forward movement
- Movement was smooth and distributed over full 400ms duration
- Character clearly slid forward during charge animation

**Refinements needed**:
- Distance needed to match attack range for logical consistency

---

### Attempt 3: Match Translate Distance to Attack Range
**What was tried**:
- Changed translate distance from 80px to 75px
- This matched the SLAM attack's configured range value

**Files modified**:
- `docs/config/config.js` (line 659) - Changed `translate: { x: 75, ... }`

**Result**: ✅ **SUCCESS**
- Charge phase now moves character exactly to attack range
- Creates logical progression: position at range → strike with dash
- Gap-closer mechanic makes sense: slide to range, then explosive dash

---

### Attempt 4: Improve Debug Visualization
**What was tried**:
- Modified velocity arrow label to show arrow length in pixels instead of velocity magnitude
- Changed from `vel: ${magnitude.toFixed(1)}` to `${arrowLength.toFixed(0)}px`

**Files modified**:
- `docs/js/render.js` (line 987) - Updated label text

**Result**: ✅ **SUCCESS**
- Arrow now shows visual distance in pixels
- Easier to understand spatial movement at a glance
- Helps verify translate distance is working correctly

---

### Attempt 5: Code Review and Cleanup
**What was tried**:
- Reviewed all code for mistakes
- Found unused `__translateStart` variable
- Removed dead code, keeping only `__translatePrev` tracker

**Files modified**:
- `docs/js/animator.js` (lines 1942-1943) - Removed unused initialization

**Result**: ✅ **SUCCESS**
- Cleaner code with no dead variables
- System only tracks what it needs (progress value)

---

## Root Cause Analysis

### The Core Problem

The Charge phase was **executing correctly in the animation timeline**, but had **zero spatial movement**, making it invisible to the player.

**Why this happened**:

1. **Pose-based animation system** only modifies joint angles by default
2. **No position translation mechanism** existed for animation phases
3. **Existing movement systems** (impulse, velocity, rootMoveVel) were:
   - Designed for different purposes (jumps, strikes)
   - Applied instantly or as forces, not smoothly over time
   - Would conflict with the dash system in later phases

### Why Existing Systems Couldn't Solve It

**rootMoveVel**:
- Purpose: Root bone offset for animation
- Not designed for character position translation
- Would require manual frame-by-frame animation

**impulseMag/impulseDirDeg**:
- Purpose: One-time force application (like jumps)
- Applies instant acceleration, not smooth movement
- Creates unpredictable distance based on physics

**anim_events with velocityX/velocityY**:
- Purpose: Set velocity at specific animation time points
- Would override velocity instantly
- Not smooth/lerped over duration
- Would conflict with dash system

**Dash system (velocity/impulse)**:
- Purpose: Gap-closing movement during strike phases
- Only activates during "strike" phase, not "charge"
- Designed for explosive movement, not smooth slides

### The Solution: Lerped Translate

A new system was needed that:

✅ Smoothly distributes movement over animation duration
✅ Respects facing direction (local space)
✅ Doesn't interfere with physics or dash systems
✅ Works independently per animation layer
✅ Tracks progress to avoid duplicate movement

**Implementation details**:

```javascript
// In processAnimEventsForOverride()
if (P.translate && typeof P.translate === 'object') {
  const tx = Number.isFinite(P.translate.x) ? P.translate.x : 0;
  const ty = Number.isFinite(P.translate.y) ? P.translate.y : 0;

  if (tx !== 0 || ty !== 0) {
    // Initialize progress tracker on first frame
    if (over.__translatePrev === undefined) {
      over.__translatePrev = 0;
    }

    // Calculate lerped position based on progress (k)
    const deltaK = k - over.__translatePrev;
    if (deltaK > 0) {
      // Apply incremental translation based on facing direction
      const facingMult = P.translate.local ? (F.facingSign || 1) : 1;
      F.pos.x += tx * deltaK * facingMult;
      F.pos.y += ty * deltaK;
      over.__translatePrev = k;
    }
  }
}
```

**Key concepts**:

- `k`: Animation progress from 0 to 1
- `deltaK`: Progress since last frame
- `tx * deltaK`: Incremental distance to move this frame
- `facingMult`: Direction multiplier for local space
- `__translatePrev`: Prevents duplicate movement on same frame

**Example calculation** (75px over 400ms at 60fps):
- Frame 1 (k=0.016): Move 1.2px
- Frame 2 (k=0.033): Move 1.28px
- Frame 3 (k=0.050): Move 1.28px
- ...
- Frame 24 (k=1.000): Total moved = 75px

## Lessons Learned

1. **Visual feedback is critical**: Even working code needs visible indicators
2. **Existing systems may not fit**: Sometimes new solutions are needed
3. **Smooth movement requires lerping**: Incremental deltaK approach prevents jumps
4. **Distance should have meaning**: 75px matches range for logical consistency
5. **Debug visualization helps**: Arrow showing distance validated the fix

## Current Status

✅ Charge phase is visible and functional
✅ Character slides 75px forward during charge
✅ Movement is smooth and distributed over 400ms
✅ Dash system activates after charge completes
✅ Total movement creates effective gap-closer
✅ Debug arrow shows movement distance

## Future Considerations

**Potential improvements**:
- Add translate to other attacks that need positioning
- Consider vertical translate for aerial attacks
- Add easing functions (ease-in, ease-out) for translate
- Visualize translate with trail effect or motion blur
- Add sound effect trigger at start of charge phase

**Performance notes**:
- Translate adds minimal CPU overhead (simple math per frame)
- No physics calculations required
- Works independently per fighter
- Scales well with multiple NPCs

## Related Files

**Core Implementation**:
- `docs/js/animator.js` - Translate lerp system
- `docs/config/config.js` - SLAM attack configuration

**Supporting Systems**:
- `docs/js/attack-dash.js` - Velocity-based dash (strike phase)
- `docs/js/render.js` - Debug visualization
- `docs/js/combat.js` - Attack timeline execution

**Documentation**:
- `SLAM_CHARGE_SPEC.md` - Complete specification
- This file - Troubleshooting history
