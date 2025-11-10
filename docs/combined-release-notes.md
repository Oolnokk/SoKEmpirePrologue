# Combined patch overview

This document summarises the features folded together for the consolidated merge targeting `main`.

## Cosmetic editor experience
- `docs/cosmetic-editor.html` hosts the standalone editor shell with responsive layout hooks.
- `docs/cosmetic-editor.css` defines panel layout, responsive flex behaviour, and a11y-friendly contrast for the editor.
- `docs/js/cosmetic-editor-app.js` wires the canvas preview, slot list, bucket paint workflow, cosmetic creator, and JSON export helper.
- `docs/assets/asset-manifest.json` and `docs/config/cosmetics/*.json` back the editor with example sprite parts so reviewers can exercise every tool.

## Runtime cosmetic system
- `docs/js/cosmetics.js` provides the normalized library/profile registry, HSV clamping, asset caching, and tag helpers used both in-game and inside the editor.
- `docs/js/cosmetic-library.js` and `docs/js/cosmetic-profiles.js` fetch cosmetics and profile data and register them with the runtime.
- `docs/js/sprites.js` integrates cosmetic layers into sprite assembly, including branch mirroring to keep limb cosmetics aligned.
- `tests/cosmetics-system.test.js` locks behaviour for tag generation, layer expansion, and config wiring so the merge stays verifiable.

## Combat, animation, and configuration updates
- `docs/js/combat.js` merges weapon combo definitions with base abilities, adds queue management, and honours weapon-specific overrides.
- `docs/js/app.js` synchronises fighter weapon/cosmetic selection so the editor and combat demo read from the same state.
- `docs/config/config.js` exposes cosmetic library/profile sources and fighter slot data, matching the new runtime expectations.
- `docs/index.html` links the cosmetic editor entry point alongside the existing combat sandbox entry overlay.

## Supporting assets and fixtures
- `docs/assets/cosmetics/` contains the sample sprite sheets referenced by the cosmetic editor.
- `docs/config/fighter-offsets/*.json` now bundle cosmetic slot overrides for fighters such as Tletingan and Mao-ao.
- `docs/assets/fightersprites/` includes the layered combo punch animation data referenced by the new runtime hooks.

Use this note when preparing the final PR description so all previously independent patches are represented in one place.
