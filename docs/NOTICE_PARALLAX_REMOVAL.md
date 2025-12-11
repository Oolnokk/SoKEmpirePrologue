# Notice: Legacy 2D Parallax Pipeline Removed

## Summary

The runtime no longer produces or consumes the legacy 2D parallax structures (`window.PARALLAX`). This change eliminates dead-end writes and simplifies the map bootstrap pipeline while preserving all essential area registration behavior.

## What Changed

### Runtime Changes

1. **`window.PARALLAX` is no longer written to**
   - The `ensureParallaxContainer()` function is now a no-op
   - `adaptSceneToParallax()` has been renamed to `adaptSceneForLegacyParallax()` and marked deprecated/internal
   - `applyArea()` no longer populates `window.PARALLAX.areas` or sets `window.PARALLAX.currentAreaId`

2. **Area registration preserved**
   - Areas are still registered with `MapRegistry` (`window.__MAP_REGISTRY__`)
   - `window.CONFIG.areas[areaId]` now contains the normalized area descriptor (not the legacy parallax structure)
   - `window.GAME.mapRegistry` and `window.GAME.currentAreaId` continue to work as before

3. **Render fallback updated**
   - `render.js` now checks `window.CONFIG.areas[window.GAME.currentAreaId]` instead of `window.PARALLAX`
   - Fallback background behavior remains identical

## Why This Was Removed

The legacy 2D parallax pipeline was:
- **Deprecated** for over a year in favor of the 3D map pipeline
- **Unmaintained** with no active consumers
- **Dead-end code** that wrote to globals without being read by any current renderer
- **Confusing** for new contributors who might think it was still active

## Migration Guidance

### If You Were Reading from `window.PARALLAX`

Replace reads from `window.PARALLAX` with:
- `window.CONFIG.areas[window.GAME.currentAreaId]` for the current area descriptor
- `window.GAME.mapRegistry.getActiveArea()` for the active area from MapRegistry
- `window.__MAP_REGISTRY__.getArea(areaId)` for a specific area

### If You Need the Legacy Parallax Structure

If you absolutely need the old parallax structure format, you can:

1. Call `adaptSceneForLegacyParallax(area)` manually (marked deprecated/internal)
2. Store the result in your own data structure
3. Note: This function may be removed in a future release

### If You Were Using the 2D Parallax Renderer

The 2D parallax renderer has been replaced by:
- [3D Map Builder](3Dmapbuilder.html) for visual map creation
- [3D Grid Map Editor](map-editor.html) for gameplay map editing
- Three.js-based 3D rendering via the `scene3d` bridge

See [DEPRECATED_PARALLAX_TO_3D_MIGRATION.md](DEPRECATED_PARALLAX_TO_3D_MIGRATION.md) for detailed migration steps.

## Adding a Third-Party Renderer

If you want to add a custom renderer (e.g., using Three.js):

1. Read area descriptors from `window.CONFIG.areas[areaId]`
2. Use the `scene3d` property if present for 3D scene metadata
3. Access geometry via `area.geometry.layers` and `area.geometry.instances`
4. Use MapRegistry events to listen for area changes:
   ```javascript
   const registry = window.__MAP_REGISTRY__;
   registry.on('active-area-changed', (activeArea) => {
     // Update your renderer
   });
   ```

## Console Messages

When an area is loaded, you'll see:
```
[map-bootstrap] Legacy 2D parallax pipeline removed — window.PARALLAX no longer populated. Areas are registered in MapRegistry and CONFIG.areas.
```

This message appears once per page load to aid debugging during the rollout.

## Backwards Compatibility

### What Still Works

- ✅ Area registration via MapRegistry
- ✅ `window.CONFIG.areas[areaId]` contains area data
- ✅ `window.GAME.mapRegistry` and `window.GAME.currentAreaId`
- ✅ Ground offset, playable bounds, and platforming colliders sync
- ✅ Render fallback background
- ✅ All editor tools (cosmetic editor, map builders)

### What No Longer Works

- ❌ Reading from `window.PARALLAX.areas`
- ❌ Reading from `window.PARALLAX.currentAreaId`
- ❌ Expecting `window.PARALLAX` to be populated by the runtime

## Further Reading

- [DEPRECATED_PARALLAX_TO_3D_MIGRATION.md](DEPRECATED_PARALLAX_TO_3D_MIGRATION.md) - Historical migration guide
- [3d-parallel-renderer.md](3d-parallel-renderer.md) - 3D scene bridge documentation
- [modular-map-pipeline.md](modular-map-pipeline.md) - Current map pipeline architecture

---

**Last Updated:** 2025-12-10
