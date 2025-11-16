# Tile step samples

Drop your real recordings for tile surfaces in this folder using the following exact filenames so the runtime can stream them:

- `cat_step_tile_L.wav`
- `cat_step_tile_R.wav`
- `sloth_step_tile_L.wav`
- `sloth_step_tile_R.wav`

The repository intentionally omits the binary `.wav` files to keep PR tooling happy. During development, place your audio files locally (or via CDN) and the `footstep-audio` module will automatically load them when fighters with the matching foot profiles step on `tile` colliders. The loader falls back to the synthesized footsteps if a file is missing.
