# Remove Legacy 2D Parallax Runtime Wiring

## Summary

This PR completely removes the legacy 2D parallax runtime wiring from the codebase. The runtime no longer writes to `window.PARALLAX`, eliminating dead-end writes while preserving all essential area registration behavior via `MapRegistry` and `window.CONFIG.areas`.

## Background

The legacy 2D parallax pipeline has been deprecated for over a year in favor of the 3D map pipeline. The runtime was still populating `window.PARALLAX` structures even though:
- No active renderer consumes this data
- The pipeline is unmaintained
- It creates confusion for contributors who might think it's still active

This PR removes the writes while maintaining backwards compatibility through read shims.

## Changes Made

### Runtime Code Changes

**docs/js-src/map-bootstrap.ts & docs/js/map-bootstrap.js:**
- Marked `ensureParallaxContainer()` as a no-op/deprecated function
- Renamed `adaptSceneToParallax()` to `adaptSceneForLegacyParallax()` and marked as deprecated/internal
- Updated `applyArea()` to:
  - No longer call `ensureParallaxContainer()`
  - No longer write to `parallax.areas[area.id]` or `parallax.currentAreaId`
  - Write normalized area descriptor directly to `window.CONFIG.areas[area.id]`
  - Added console.info warning: "Legacy 2D parallax pipeline removed — window.PARALLAX no longer populated. Areas are registered in MapRegistry and CONFIG.areas."

**docs/js/render.js:**
- Replaced `window.PARALLAX` check with `window.CONFIG.areas[window.GAME.currentAreaId]`
- Fallback background behavior remains identical (sky gradient + ground + text)

**docs/js/app.js:**
- Added backwards-compatible read shim that prefers `window.CONFIG.areas` over `window.PARALLAX`
- Added deprecation warnings when `window.PARALLAX` is actually read
- Warnings reference `docs/NOTICE_PARALLAX_REMOVAL.md` for migration guidance

### Documentation Changes

**docs/NOTICE_PARALLAX_REMOVAL.md (NEW):**
- Comprehensive explanation of the change
- Migration guidance for consumers
- Details on adding third-party renderers
- Backwards compatibility notes

**docs/3d-parallel-renderer.md:**
- Added "⛔ REMOVED FROM RUNTIME" banner at top
- Marked document as archived
- Links to NOTICE_PARALLAX_REMOVAL.md

**tools/parallax_map_builder_notes.md:**
- Added "⛔ REMOVED FROM RUNTIME" banner at top
- Marked document as archived
- Links to NOTICE_PARALLAX_REMOVAL.md

**docs/toc.html:**
- Replaced red DEPRECATED links with notice about removal
- Added link to NOTICE_PARALLAX_REMOVAL.md
- Simplified parallax section

### Tests

**tests/parallax-removal.test.js (NEW):**
- Verifies `applyArea()` no longer writes to `window.PARALLAX`
- Verifies `ensureParallaxContainer()` is marked as no-op
- Verifies `adaptSceneForLegacyParallax` exists but is not called
- Verifies `render.js` doesn't reference `window.PARALLAX`
- Verifies documentation reflects removal
- Verifies `app.js` read shim with deprecation warnings

**tests/render-debug.test.js:**
- Added test verifying fallback background uses `CONFIG.areas` instead of `PARALLAX`
- Verifies fallback behavior remains identical

## Backwards Compatibility

### What Still Works ✅

- Area registration via `MapRegistry` (`window.__MAP_REGISTRY__`)
- `window.CONFIG.areas[areaId]` contains normalized area descriptors
- `window.GAME.mapRegistry` and `window.GAME.currentAreaId`
- Ground offset, playable bounds, and platforming colliders sync
- Render fallback background
- All editor tools (cosmetic editor, 3D map builder, gameplay map editor)
- Read shim in `app.js` provides temporary compatibility for modules reading `window.PARALLAX`

### What No Longer Works ❌

- Writing to `window.PARALLAX` (runtime no longer populates it)
- Expecting `window.PARALLAX` to be created by the runtime

### Migration Path

Modules reading `window.PARALLAX` should migrate to:
- `window.CONFIG.areas[window.GAME.currentAreaId]` for current area
- `window.GAME.mapRegistry.getActiveArea()` for active area from MapRegistry
- `window.__MAP_REGISTRY__.getArea(areaId)` for specific areas

## Risk Assessment

**Low Risk:**
- Changes are isolated to docs runtime files
- No changes to source directory
- Backwards-compatible read shim provides fallback
- All existing tests pass (288 pass, 29 pre-existing failures)
- New tests verify expected behavior

**Potential Issues:**
- Third-party scripts reading `window.PARALLAX` will see deprecation warnings
- Scripts that expect `window.PARALLAX` to be created will need updates (read shim provides temporary compatibility)

## Manual Verification Steps

To verify this PR works correctly:

### 1. Build and Run Docs Sandbox

```bash
# Serve the docs directory (requires local HTTP server)
python -m http.server 8000
# or
npx http-server docs/
```

Open http://localhost:8000/ in your browser.

### 2. Verify window.PARALLAX Not Created

Open browser console and check:

```javascript
// Should be undefined or only contain read shim properties
console.log(window.PARALLAX);
// Should show removal notice (one-time message)
// "Legacy 2D parallax pipeline removed — window.PARALLAX no longer populated..."
```

### 3. Verify Area Registration Still Works

Load an area (e.g., through cosmetic editor or by navigating in game), then check:

```javascript
// Should contain the registered area
console.log(window.GAME.mapRegistry);
console.log(window.GAME.currentAreaId);

// Should contain normalized area data
console.log(window.CONFIG.areas[window.GAME.currentAreaId]);

// MapRegistry should have the area
console.log(window.__MAP_REGISTRY__.getActiveArea());
```

### 4. Verify Fallback Background

Load a page without an area (or before area loads):

- Should see sky gradient (light blue to gray)
- Should see ground plane (muted green)
- Should see text: "NO AREA LOADED — fallback ground"

### 5. Check Console Messages

After loading an area, you should see:

```
[map-bootstrap] Legacy 2D parallax pipeline removed — window.PARALLAX no longer populated. Areas are registered in MapRegistry and CONFIG.areas.
[map-bootstrap] Loaded area "defaultdistrict3d" (...)
```

If any code tries to read from `window.PARALLAX` (via app.js shim), you should see:

```
[app.js] Reading from window.PARALLAX is deprecated. Use window.CONFIG.areas or MapRegistry instead. See docs/NOTICE_PARALLAX_REMOVAL.md
```

### 6. Test Editors

Open each editor and verify basic functionality:

- **Cosmetic Editor** (cosmetic-editor.html): Should load and display character
- **3D Map Builder** (3Dmapbuilder.html): Should load and display maps
- **Gameplay Map Editor** (gameplay-map-editor.html): Should load and display maps

All editors should work normally since they use the MapRegistry, not `window.PARALLAX`.

### 7. Run Tests

```bash
npm run test:unit
```

Expected results:
- All parallax removal tests pass (5 new tests)
- Render debug tests pass (including new fallback test)
- Pre-existing test suite status unchanged (288 pass, 29 pre-existing failures)

## Files Changed

```
 docs/3d-parallel-renderer.md        |  13 ++-
 docs/NOTICE_PARALLAX_REMOVAL.md     | 108 +++++++++++++++++++++
 docs/js-src/map-bootstrap.ts        |  33 +++++--
 docs/js/map-bootstrap.js            |  33 +++++--
 docs/js/render.js                   |   5 +-
 docs/js/app.js                      |  23 ++++-
 docs/toc.html                       |   7 +-
 tests/parallax-removal.test.js      | 192 ++++++++++++++++++++++++++++++++++
 tests/render-debug.test.js          |  39 ++++++++
 tools/parallax_map_builder_notes.md |  13 ++-
 10 files changed, 440 insertions(+), 26 deletions(-)
```

## Related Documentation

- [NOTICE_PARALLAX_REMOVAL.md](docs/NOTICE_PARALLAX_REMOVAL.md) - Details on this change
- [DEPRECATED_PARALLAX_TO_3D_MIGRATION.md](docs/DEPRECATED_PARALLAX_TO_3D_MIGRATION.md) - Historical migration guide
- [3d-parallel-renderer.md](docs/3d-parallel-renderer.md) - Archived 3D scene bridge docs
- [modular-map-pipeline.md](docs/modular-map-pipeline.md) - Current map pipeline

## Checklist

- [x] Runtime changes implemented and tested
- [x] Documentation updated with removal notices
- [x] Tests added for changed behavior
- [x] All new tests pass
- [x] Backwards compatibility maintained via read shim
- [x] Manual verification steps documented
- [x] PR description includes risk assessment and verification steps
