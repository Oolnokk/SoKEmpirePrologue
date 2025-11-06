# Bone System Documentation Index

This directory contains comprehensive documentation of the bone system in SoK Empire Prologue.

## Documents Overview

### 📚 [BONE_SYSTEM_MAPPING.md](./BONE_SYSTEM_MAPPING.md)
**Complete technical reference** - The authoritative guide to every function that alters bones.

**Contents:**
- Core bone data structures and object schemas
- Complete function catalog with signatures and line numbers
- Detailed data flow diagrams
- Source-to-destination data mapping
- Configuration sources and format documentation
- Coordinate system and angle convention reference
- Testing information

**Use this when:** You need detailed technical information about any bone-related function.

---

### 🎨 [BONE_SYSTEM_VISUAL.md](./BONE_SYSTEM_VISUAL.md)
**Visual reference and diagrams** - Diagrams, tables, and visual explanations of the bone system.

**Contents:**
- Quick function reference table
- Visual pipeline diagrams
- Hierarchical angle accumulation charts
- Coordinate system diagrams
- Character mirroring illustrations
- Walk cycle animation progression
- Common patterns and usage examples
- Debugging guides with visual aids

**Use this when:** You need to understand the system visually or see how components interact.

---

### ⚡ [BONE_FUNCTIONS_QUICK_REF.md](./BONE_FUNCTIONS_QUICK_REF.md)
**Quick reference guide** - Fast lookup for common operations and functions.

**Contents:**
- Critical functions with emoji markers
- Function signatures and locations
- Joint angle and bone key tables
- Common operations with code examples
- Debug console commands
- File location index

**Use this when:** You need to quickly find a function or see how to perform a specific operation.

---

## Quick Navigation

### By Task

**I want to...**
- **Understand the entire system** → Read [BONE_SYSTEM_MAPPING.md](./BONE_SYSTEM_MAPPING.md)
- **See visual diagrams** → Read [BONE_SYSTEM_VISUAL.md](./BONE_SYSTEM_VISUAL.md)
- **Find a specific function quickly** → Use [BONE_FUNCTIONS_QUICK_REF.md](./BONE_FUNCTIONS_QUICK_REF.md)
- **Modify joint angles** → See "updatePoses()" in any document
- **Compute bone positions** → See "computeAnchorsForFighter()" in any document
- **Debug bone issues** → See debugging sections in VISUAL or QUICK_REF

### By File

**Working on...**
- **render.js** → Functions: `computeAnchorsForFighter()`, `drawSegment()`, `drawStick()`
- **animator.js** → Functions: `updatePoses()`, `pushPoseOverride()`, `computeWalkPose()`
- **sprites.js** → Functions: `getBones()`, `renderSprites()`, `drawBoneSprite()`
- **math-utils.js** → Functions: `basis()`, `segPos()`, `withAX()`, `angle()`
- **debug-panel.js** → Functions: `setPoseValue()`, debug UI

---

## System Architecture Summary

```
┌──────────────┐
│   CONFIG     │ ← Poses, walk cycles, body part dimensions
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  animator.js │ ← Updates F.jointAngles from animations
│ updatePoses()│
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  render.js   │ ← Computes bone positions from joint angles
│computeAnchors│
└──────┬───────┘
       │
       ├────────────────┐
       ▼                ▼
┌─────────────┐  ┌─────────────┐
│  sprites.js │  │  render.js  │
│renderSprites│  │  drawStick  │ ← Rendering functions (read-only)
└─────────────┘  └─────────────┘
```

---

## Key Concepts

### 1. Bone Objects
Each bone contains:
- **x, y** - Start position (world space)
- **len** - Bone length
- **ang** - Angle in radians (0 = up, clockwise positive)
- **endX, endY** - End position (computed)

### 2. Joint Angles
Stored in `F.jointAngles` (all in radians):
- **torso** - Absolute torso angle
- **shoulders/elbows** - Relative to parent
- **hips/knees** - Absolute or relative (configurable)

### 3. Data Flow
1. **Input** → controls, attacks, animations
2. **Update** → `updatePoses()` modifies joint angles
3. **Compute** → `computeAnchorsForFighter()` creates bones
4. **Render** → sprites/skeleton drawn from bones

### 4. Coordinate Convention
- **0° = UP** (not right!)
- **Clockwise = positive**
- **All angles in radians internally**
- **Degrees only at boundaries**

---

## Function Categories

### 🔴 Direct Bone Modification
Functions that create or alter bone objects:
- `computeAnchorsForFighter()` - Main bone computation
- `getBones()` - Alternative bone creation
- Character mirroring (in computeAnchors)

### 🟡 Indirect via Joint Angles
Functions that modify bones by updating joint angles:
- `updatePoses()` - Animation system
- `setPoseValue()` - Debug editing
- `pushPoseOverride()` - Attack animations
- `computeWalkPose()` - Walk cycle

### 🟢 Read-Only
Functions that only read bones:
- All rendering functions
- All math utilities
- All debug display functions

---

## Common Questions

### Q: Where do bone positions come from?
**A:** `computeAnchorsForFighter()` in render.js computes them from joint angles every frame.

### Q: Where do joint angles come from?
**A:** `updatePoses()` in animator.js updates them from pose definitions and animations.

### Q: How do I change a pose?
**A:** Use `pushPoseOverride(fighterId, poseDeg, durMs)` for temporary changes, or edit `CONFIG.poses` for permanent ones.

### Q: Why are my angles wrong?
**A:** Remember: 0 = up (not right!), angles in radians (not degrees!), elbows/knees use subtraction (not addition!).

### Q: How do I debug bones?
**A:** Enable `RENDER_DEBUG.showBones = true` to see skeleton, or `CONFIG.debug.freezeAngles = true` to stop animation.

---

## Testing

All bone functions are tested:
```bash
npm test
```

Test files:
- `tests/debug-panel.test.js` - Debug panel functionality
- `tests/v20-orientation.test.js` - Angle convention tests
- `tests/render-debug.test.js` - Render flag tests
- `tests/freeze-angles.test.js` - Animation freeze tests

All 70 tests currently passing ✅

---

## Contributing

When modifying bone-related code:

1. **Maintain angle convention:** 0 = up, clockwise positive
2. **Use radians internally:** Convert only at boundaries
3. **Document data sources:** Where does each input come from?
4. **Update tests:** Add tests for new bone functionality
5. **Update docs:** Keep these files in sync with code changes

---

## Version History

- **v1.0** (2025-11-06) - Initial comprehensive documentation
  - Created BONE_SYSTEM_MAPPING.md (complete technical reference)
  - Created BONE_SYSTEM_VISUAL.md (visual diagrams)
  - Created BONE_FUNCTIONS_QUICK_REF.md (quick lookup)
  - Created this index (BONE_DOCS_INDEX.md)

---

## Contact & Support

For questions about the bone system:
1. Check these docs first
2. Search the test files for examples
3. Look at console debug output (`console.table(GAME.ANCHORS_OBJ.player)`)
4. Use debug panel in the running application

---

*Documentation Index for SoK Empire Prologue Bone System*
*Generated: 2025-11-06*
