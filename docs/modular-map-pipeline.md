# Modular Map Pipeline

This repository now exposes a standalone map pipeline that keeps the parallax
builder workflow isolated from the rest of the toolchain. The modules live in
`src/map/` and can be consumed either from Node or the browser without mutating
global state.

## Approaches Considered

1. **Static cache generator** – bake builder exports into `CONFIG.areas` JSON
   ahead of runtime, keeping the running game unaware of the builder format.
2. **Runtime adapter service** – lazily load builder JSON and translate it on
   demand via a dedicated map service that exposes a simple registry API.
3. **Hybrid registry + CLI (chosen)** – author-time conversion to normalized
   area descriptors stored in a registry that other systems can consume without
   touching the builder schema.

## Components

- `MapRegistry` – runtime-friendly container for area descriptors. It performs
  shallow validation, deep-freezes descriptors to prevent accidental mutation,
  and emits lifecycle events (`area-registered`, `area-removed`,
  `active-area-changed`). Because the registry never touches DOM or other
  singletons, it can fail or be replaced without breaking other systems.
- `builderConversion` – pure utilities that translate exports from the layered
  map builder (`exportLayout()` in `docs/cosmetic-editor.html`) into a normalized
  area descriptor. Optional hooks let callers resolve layer imagery or expand
  prefab metadata without introducing hard dependencies.
- `tools/convert-map-layout.mjs` – thin CLI for author-time conversion. It
  accepts builder JSON exports and produces either plain JSON or ESM modules,
  which can then be merged into `CONFIG.areas` during build steps.

### Automatic prefab resolution

The converter now scans `prefabs/structures/` (configurable via
`--prefab-dir`) for any prefab identifiers referenced by the layout. Matching
JSON files are embedded directly into the generated area descriptor so the
runtime does not need to reach back to the builder format. Missing or
mismatched prefabs are reported as warnings without aborting the conversion,
keeping the pipeline resilient even when an asset is absent.

## Example

```bash
node tools/convert-map-layout.mjs \
  --input docs/config/maps/example-layout.json \
  --output dist/maps \
  --area-id practice_hall
```

```js
import { MapRegistry } from '../src/map/index.js';
import practiceHall from '../dist/maps/practice_hall.area.json' assert { type: 'json' };

const registry = new MapRegistry();
registry.registerAreas({ practice_hall: practiceHall });
```

This pattern keeps the map pipeline modular—if a layout fails to convert, the
rest of the runtime keeps running with previously registered areas.
