# ⛔ REMOVED FROM RUNTIME: Parallel 3D scene bridge (perspective-only)

> **⛔ REMOVED FROM RUNTIME**: The runtime no longer produces or consumes legacy 2D parallax structures. This document is archived for historical reference only.
>
> **Use instead:**
> - [3D Map Builder](3Dmapbuilder.html) for visual map creation
> - [3D Grid Map Editor](map-editor.html) for gameplay map editing
> - Visual maps are now stored in `/config/maps/visualsmaps`
>
> **Migration:** See [DEPRECATED_PARALLAX_TO_3D_MIGRATION.md](DEPRECATED_PARALLAX_TO_3D_MIGRATION.md) for historical context and [NOTICE_PARALLAX_REMOVAL.md](NOTICE_PARALLAX_REMOVAL.md) for runtime changes.

---

# Parallel 3D scene bridge (perspective-only) [ARCHIVED]

This repository now supports attaching optional 3D scene metadata to any map area without changing the 2D gameplay contract. The intent is to let a WebGL/Three.js scene handle perspective while keeping logic on a flat Z=0 plane and avoiding heavy lighting or complex surface work.

## How it works (what shipped in this branch)
- Area descriptors may include a `scene3d` object alongside the existing `layers`/`instances`. Validation keeps the legacy 2D contract intact but lets you attach a 3D scene reference.
- The registry normalizes this block so the ground plane defaults to `planeZ: 0` and `unitsPerPixel: 1` and keeps render settings unlit. Anything non-glTF gets warned about to catch typos.
- Helper functions exported from `src/map/scene3d.js` project 2D logic coordinates onto the ground plane and build renderer-friendly settings without enabling realtime lighting.
- A tiny unlit glTF triangle is checked in at `docs/assets/3D/scene3d-demo.gltf`, plus a matching descriptor at `docs/assets/areas/scene3d-demo-area.json` you can feed into the registry. This is enough to exercise the bridge or host on githack.

### Will this break main?
- **No—`scene3d` is strictly optional.** Every area still needs a `layers` array (it can be empty), so existing 2D content keeps working unchanged.
- If an area omits `scene3d`, validation and runtime behavior are identical to before; any 3D renderer you add can simply ignore those areas.
- Even when `scene3d` is present, validation only emits warnings for non-glTF URLs and fills in defaults—it doesn’t alter the rest of the descriptor. You can treat this branch as an opt-in test path while leaving mainline maps untouched.

> Completeness note: there is still **no 3D renderer bundled in this repo**. The bridge only normalizes metadata; you provide the WebGL/Three.js layer that consumes `scene3d` and projects gameplay coordinates onto the ground plane.

## Authoring tips
- Export your Blender/FBX content as a single glTF URL (`.glb` is preferred) and set `scene3d.sceneUrl` to it; empty values are allowed but will warn. A typo like `.gib` will now emit a warning from the registry.
- Keep `scene3d.render.lighting` at `none` (or `flat` if you need a minimal shading hint). Materials are forced to `unlit` to avoid expensive surface setup.
- Use `projectToGroundPlane({ x, y })` to align gameplay coordinates onto the 3D ground; everything else stays 2D-aware.

## Three ways to try a glTF on this branch (pick one)
1. **Use the baked demo asset**: point your renderer at `docs/assets/3D/scene3d-demo.gltf` (a tiny unlit triangle) and register `docs/assets/areas/scene3d-demo-area.json` with `MapRegistry`. This is the zero-setup path for quick githack verification.
2. **Swap in your own glTF locally**: replace `sceneUrl` in `scene3d-demo-area.json` with your uploaded `.glb/.gltf` path (keep it under `docs/assets/3D/`), then feed that descriptor to the registry. Githack can serve any file in `docs/` once pushed.
3. **Reference a remote glTF**: set `sceneUrl` to a fully qualified URL (e.g., a CDN or a pre-existing githack link) while keeping the rest of the descriptor untouched. Useful if you want to avoid committing large binaries.

## Githack quick start
- After pushing this branch, you can fetch the demo glTF directly via a raw.githack URL such as:
  - `https://raw.githack.com/<your-username>/SoKEmpirePrologue/<branch>/docs/assets/3D/scene3d-demo.gltf`
  - `https://raw.githack.com/<your-username>/SoKEmpirePrologue/<branch>/docs/assets/areas/scene3d-demo-area.json`
- Substitute your branch/username as needed; both files live under `docs/`, so githack will serve them without extra build steps.

## Minimal descriptor example
```json
{
  "id": "commercial-block",
  "layers": [],
  "scene3d": {
    "sceneUrl": "./assets/3D/tower_commercial3D.glb",
    "ground": { "planeZ": 0, "unitsPerPixel": 1 },
    "render": { "lighting": "none" }
  }
}
```

The empty `layers` array preserves compatibility with existing tools while deferring visuals to your 3D renderer.
