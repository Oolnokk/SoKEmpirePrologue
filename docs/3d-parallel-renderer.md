# Parallel 3D scene bridge (perspective-only)

This repository now supports attaching optional 3D scene metadata to any map area without changing the 2D gameplay contract. The intent is to let a WebGL/Three.js scene handle perspective while keeping logic on a flat Z=0 plane and avoiding heavy lighting or complex surface work.

## How it works
- Area descriptors may include a `scene3d` object alongside the existing `layers`/`instances`.
- The registry normalizes this block so the ground plane defaults to `planeZ: 0` and `unitsPerPixel: 1` and keeps render settings unlit.
- Helper functions exported from `src/map/scene3d.js` project 2D logic coordinates onto the ground plane and build renderer-friendly settings without enabling realtime lighting.

## Authoring tips
- Export your Blender/FBX content as a single glTF URL and set `scene3d.sceneUrl` to it; empty values are allowed but will warn.
- Keep `scene3d.render.lighting` at `none` (or `flat` if you need a minimal shading hint). Materials are forced to `unlit` to avoid expensive surface setup.
- Use `projectToGroundPlane({ x, y })` to align gameplay coordinates onto the 3D ground; everything else stays 2D-aware.

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
