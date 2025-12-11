# ⛔ REMOVED FROM RUNTIME: Parallax Map Builder (Layered v15f) Notes

> **⛔ REMOVED FROM RUNTIME**: The runtime no longer produces or consumes legacy 2D parallax structures. This document is archived for historical reference only.
>
> **Use instead:**
> - [3D Map Builder](../docs/3Dmapbuilder.html) for visual map creation
> - [3D Grid Map Editor](../docs/map-editor.html) for gameplay map editing
> - Visual maps are now stored in `/config/maps/visualsmaps`
>
> **Migration:** See [DEPRECATED_PARALLAX_TO_3D_MIGRATION.md](../docs/DEPRECATED_PARALLAX_TO_3D_MIGRATION.md) for historical context and [NOTICE_PARALLAX_REMOVAL.md](../docs/NOTICE_PARALLAX_REMOVAL.md) for runtime changes.

---

# Parallax Map Builder (Layered v15f) Notes [ARCHIVED]

The layered v15f editor exports map layouts with the following shape when `Download Map JSON` is triggered:

```js
{
  cameraStartX: cameraX,
  zoomStart: zoom,
  groundOffset: getGroundOffset(),
  playableBounds: { left: -900, right: 1500 }, // optional explicit movement clamp per map
  activeLayerId,
  layers,
  instances: instances.map(inst => ({
    id: inst.id,
    prefabId: inst.prefabId,
    layerId: inst.layerId,
    slot: inst.slot,
    nudgeX: inst.nudgeX,
    locked: !!inst.locked,
    scaleX: inst.scaleX,
    scaleY: inst.scaleY,
    offsetY: inst.offsetY,
    rot: inst.rot,
    x: baseXFor(inst, stats)
  }))
}
```

Each exported layer entry includes parallax configuration that the runtime editor keeps in memory:

```js
{
  id: "bg1",
  name: "Parallax 1",
  type: "parallax",     // also supports "gameplay" and "foreground"
  parallax: 0.2,
  yOffset: -120,
  sep: 220,
  scale: 0.7
}
```

Structure prefabs can be loaded from JSON files and store screen-space keyframes per part. A simplified part entry looks like this:

```json
{
  "name": "tower_top",
  "layer": "near",
  "relX": 0,
  "relY": 180,
  "propTemplate": {
    "url": "./assets/structures/tower_top.png",
    "w": 256,
    "h": 192,
    "pivot": "bottom",
    "kf": {
      "radiusPx": 720,
      "ease": "smoothstep",
      "left": { "dx": -60, "rotZdeg": -6 },
      "center": { "dx": 0 },
      "right": { "dx": 60, "rotZdeg": 6 }
    }
  }
}
```

Within the editor, instances track slot-based ordering per layer and support per-instance adjustments:

- `slot`: integer placement index before spacing is applied
- `nudgeX`: additional offset from slot spacing
- `scaleX`, `scaleY`: multiplier applied on top of layer scale
- `offsetY`: adjusts vertical placement relative to the area's ground line
- `rot`: rotation in degrees applied after layer transforms
- `locked`: prevents drag and jitter adjustments

### Playable bounds (new)

Authors can optionally declare a single `playableBounds` object per layout to clamp movement and camera panning without relying on inferred collider extents. The object accepts numeric `left` and `right` values in layout/world coordinates. When omitted or invalid, the runtime falls back to bounds derived from the widest colliders in the layout, so adding explicit limits is the preferred, deterministic path.

The in-editor coordinate helpers derive an instance's display X value as:

```js
const sep = layer.sep || 180;
const center = (stats[layerId].min + stats[layerId].max) / 2;
const displayX = (slot - center) * sep + nudgeX;
```

These notes capture the data that must be mapped into the runtime parallax area system.
