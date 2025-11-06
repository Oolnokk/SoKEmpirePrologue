# Animation System Restoration Summary

**Date**: 2025-11-06  
**Target**: Restore animation blending, pose transitions, event processing, walk cycle, aiming offsets, and sprite flipping to match `ancient code-monolith of truth.html` reference.

---

## ✅ Completed Tasks

### 1. Easing Functions (Task #1)
**File**: `docs/js/animator.js`

- **Added** `easeInOutCubic` helper: `t < 0.5 ? 4*t³ : 1 - ((-2t+2)³)/2`
- **Added** `easeWindup` custom ease: quick bias (60% ease-in steep, 40% ease-out gentle) for hold-release Windup transitions
- Both functions match the reference HTML (line ~940)

---

### 2. Pose Blending Alignment (Task #2)
**File**: `docs/js/animator.js`

- **Walk cycle blending** now applies `easeInOutCubic(rawS)` to sine phase, shaping foot travel smoothly
- **Amplitude damping** with `damp(F.walk.amp, targetAmp, 8, dt)` prevents pops when starting/stopping walk
- **Phase wrapping** `if (F.walk.phase > 2π) F.walk.phase %= 2π` maintains numeric stability
- **Interpolation** multiplies leg/torso angles by smoothed amplitude so partial steps blend correctly

---

### 3. Transition State & Cleanup (Task #3)
**File**: `docs/js/animator.js`

- **Added** `clearOverride(F)` cleanup logic:
  - Reverts per-part sprite mirrors (e.g., `ARM_R_UPPER`) if `__flipApplied`
  - Reverts full-body facing flip if `__fullFlipApplied`
- **Override metadata** in `pushPoseOverride`:
  - `__start`, `__dur`, `__events`, `__flipApplied`, `__fullFlipApplied`, `__k`
  - Ensures state is reset when transitions complete, preventing lingering blend artifacts

---

### 4. Animation Event Processing (Task #4)
**File**: `docs/js/animator.js`

- **Added** `primeAnimEventsFromPose(pose)` function:
  - Reads `pose.anim_events` or `pose.events`
  - Clones and sorts by `time` ascending
- **Added** `processAnimEventsForOverride(F, over)` function:
  - Computes normalized time `k = (now - __start) / __dur`
  - Applies events at scheduled time thresholds:
    - **velocityX / velocityY**: sets `F.vel.x` or `.y` (respects `localVel` for facing-relative motion)
    - **impulse + impulse_angle**: adds impulse to velocity (respects `localVel`)
  - Marks events `__applied = true` once processed
- **Integrated** in `updatePoses()`: calls `processAnimEventsForOverride(F, over)` while override is active

---

### 5. Face-Locking Parity (Task #5)
**File**: `docs/js/face-lock.js` (new module)

- Created minimal face-lock API matching reference HTML `FACE` global:
  - `initFaceLock()` - initializes `GAME.FACE = { active: false, rad: 0 }`
  - `setFaceLock(radians)` - activates and sets target angle
  - `clearFaceLock()` - deactivates
  - `getFaceLock()` - returns locked angle or null
- **Integration point**: Caller (e.g., aiming system or combat controller) must call `setFaceLock()` when entering aiming poses, `clearFaceLock()` when exiting

---

### 6. Walk Cycle Smoothing (Task #6)
**File**: `docs/js/animator.js`

- **Amplitude damping**: `F.walk.amp = damp(F.walk.amp, targetAmp, 8, dt)`
- **Phase progression**: `F.walk.phase += dt * baseHz * 2π` (wrapped mod 2π)
- **Speed scaling**: `movementScale = min(3, 0.5 + speed / maxSpeedX)` clamps walk frequency to avoid runaway
- **Overwrite logic**: Walk pose is only active when `on && F.walk.amp > 0.001`, preventing override conflicts
- **Pose interpolation**: `lerp(A, B, easeInOutCubic(rawS)) * F.walk.amp` applies smoothed sine and amplitude scaling

---

### 7. Sprite Flipping & Timing (Task #7)
**File**: `docs/js/animator.js` + `sprites.js` integration

- **Flip timing** in `processAnimEventsForOverride`:
  - Per-part flip: `if (P.flip && !over.__flipApplied && k >= P.flipAt)` → calls `setMirrorForPart(partName, true)` for each part in `flipParts`
  - Full-body flip: `if (P.fullFlipFacing && !over.__fullFlipApplied && k >= P.fullFlipAt)` → toggles `F.facingSign *= -1`
- **Cleanup** in `clearOverride`:
  - Reverts all `flipParts` mirrors: `setMirrorForPart(p, false)`
  - Reverts facing sign toggle: `F.facingSign *= -1`
- **Sprite rendering** already respects `window.RENDER.MIRROR[partName]` flags (see `sprites.js`, `drawArmBranch`, `drawLegBranch`)

---

## 🔄 Remaining Task

### 8. Visual Comparison & Verification (Task #8)
**Status**: ⏳ In Progress

**Manual steps required**:

1. **Open reference HTML** (`ancient code-monolith of truth.html`) in browser
2. **Open repo demo** (`docs/index.html`) in browser (or serve via local server)
3. **Compare visuals**:
   - Walk cycle smoothness and foot placement
   - Attack animations: Windup → Strike → Recoil transitions
   - Sprite flips during Kick Strike (10% into Strike phase)
   - Full-body flip during Kick Recoil (90% into Recoil phase)
   - Animation events: velocity changes, impulse bursts
   - Aiming offsets on torso/shoulders/legs when mouse/joystick input active
4. **Document differences** in a test log or issue comment:
   - Screenshot side-by-side frames at key moments (e.g., mid-kick, mid-walk step)
   - Note any timing, amplitude, or visual discrepancies
   - Verify all attack presets in `docs/js/presets.js` match reference HTML definitions

---

## 📝 Testing & Validation

All repository tests pass:

```bash
npm test
# ℹ tests 113
# ℹ suites 19
# ℹ pass 113
# ℹ fail 0
```

Key test coverage:
- Angle conversion centralization
- Debug panel controls
- Freeze joint angles feature
- Leg angle corrections
- Sprite configuration structure
- RENDER.MIRROR per-limb flipping
- Sprite rig lookup fallback
- Sprite rotDeg to alignRad conversion
- v20 orientation and "up" = 0° convention

---

## 🔗 Integration Checklist

For full parity with the reference HTML, ensure the following are integrated in the main app loop or combat controller:

- [ ] **Call `updatePoses()`** in game loop (likely already present via `app.js`)
- [ ] **Call `initFaceLock()`** during boot (add to `app.js` init sequence)
- [ ] **Wire up aiming system** to call `setFaceLock(aimAngle)` / `clearFaceLock()` when entering/exiting aiming poses
- [ ] **Test all attack presets** (`KICK`, `SLAM`, combo sequences) to verify event timing, flip timing, and transition cleanup
- [ ] **Verify walk cycle** activates when moving on ground and deactivates mid-air or during attacks
- [ ] **Check sprite mirrors** reset properly after combo finishes or attack is interrupted

---

## 📌 Key Files Modified

| File | Changes |
|------|---------|
| `docs/js/animator.js` | Added easing helpers, walk smoothing, event processing, flip timing, override cleanup |
| `docs/js/face-lock.js` | New module for face-locking API |
| `docs/js/sprites.js` | (No changes needed—already exports `setMirrorForPart`, `resetMirror`) |

---

## ✨ Next Steps

1. **Manual visual testing** (Task #8): Compare HTML reference vs. repo demo
2. **Wire up face-lock** in aiming/combat controller
3. **Document visual verification results** in a follow-up issue or PR comment

---

**Completion status**: 7/8 tasks complete, pending manual visual verification.
