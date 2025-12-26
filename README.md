# SoKEmpirePrologue

## AI Assistant Guidelines

This project includes comprehensive documentation for AI assistants (like Claude, ChatGPT, Cursor, etc.) to reduce token usage and prevent code duplication:

- **`.cursorrules`** - Comprehensive AI assistant guidelines with full codebase documentation
- **`.ai-quick-reference.md`** - Quick reference cheat sheet of what already exists

**For AI assistants:** Read these files FIRST before implementing features to avoid recreating existing code!

**For developers:** These files serve as excellent architecture documentation and codebase navigation guides.

## Editing Visual Asset Configuration

When editing the visual asset configuration file at `docs/config/maps/visualsmaps/index.json`, your changes may not appear immediately due to browser caching. Here's how to see your changes:

### Development Mode (Automatic)
If you're running on `localhost`, `127.0.0.1`, or via `file://` protocol, cache-busting is **automatic**. Simply refresh the page (F5) to see your changes.

### Production/Deployment Mode
For deployed sites or other domains, perform a **hard refresh**:
- **Windows/Linux**: `Ctrl + Shift + R` or `Ctrl + F5`
- **macOS**: `Cmd + Shift + R`

### Manual Cache Clear
You can manually clear the cache from the browser console:
```javascript
import('./renderer/visualsmapLoader.js').then(m => m.clearVisualsmapCache());
```

For more details, see:
- `DIAGNOSIS_VISUALMAPS.md` - Complete root cause analysis and troubleshooting
- `docs/config/maps/visualsmaps/README.md` - Asset configuration documentation
- `docs/GAMEPLAY_MAP_EDITOR_README.md` - Map editor usage guide

## Three.js Setup

This project uses Three.js for 3D rendering in the game demo, map editors, and other tools. Three.js is provided via local vendor files with CDN fallbacks.

### Local Installation

Three.js v0.160.0 is included in `docs/vendor/three/` for offline use:
- `three.min.js` - Minified classic globals build (**working** ✓)
- `three.module.js` - ES module build (**working** ✓)
- `GLTFLoader.js` - Classic globals wrapper (**working** ✓)
- `GLTFLoader.module.js` - ES module build (**working** ✓)
- `BufferGeometryUtils.js` - UMD wrapper (**working** ✓)
- `BufferGeometryUtils.module.js` - ES module (**working** ✓)

### BufferGeometryUtils Status

The BufferGeometryUtils files are installed from Three.js v0.160.0 and ready for use. See `docs/vendor/three/README.md` for replacement steps if you upgrade Three.js or need to reinstall the vendor files.

### Testing Offline Integration

To verify the Three.js offline vendor integration:

1. Open `docs/three-offline-test.html` in a web browser
2. Review the test results and console output
3. Check for stub warnings and follow replacement instructions if needed

### Loading Behavior

The application automatically attempts to load Three.js from:
1. **Local vendor directory** (offline-capable) - three.js core and GLTFLoader work
2. **Public CDNs** (cdnjs, jsdelivr, unpkg) as fallbacks if local files fail

The application gracefully handles missing 3D assets and continues to function without them.

No build steps or npm install commands are required. The files are committed to the repository and ready to use.

### Updating Three.js

To update to a newer version, see `docs/vendor/three/README.md` for complete instructions.

## Resolving merge conflicts: Keep current vs. keep incoming

When Git highlights a conflict, your editor may offer **Keep Current Changes** or **Keep Incoming Changes** as quick resolutions. They correspond to the two halves of the conflict markers in the file:

* **Current changes** (sometimes shown between `<<<<<<<` and `=======`) are the edits already present on your branch.
* **Incoming changes** (the lines between `=======` and `>>>>>>>`) are what Git is trying to merge in from the other branch or commit.

Choose the option that matches the content you need after the merge:

1. Select **Keep Current Changes** if your branch’s version is correct and you want to discard the incoming edits.
2. Select **Keep Incoming Changes** if the other branch’s version is the one you prefer.
3. Manually merge when both sides contain pieces you need—edit the file to combine them, then remove the conflict markers.

After resolving the conflict, save the file, stage it (`git add`), and continue with the merge (`git merge --continue` or complete the rebase, depending on the operation).

## Previewing docs via raw.githack.com

If you want to open the static docs (e.g., the animation editor) without running a local server, you can generate ready-to-visit githack URLs. The helper script assumes your `origin` remote points to GitHub and will fall back to the current commit when a branch name is not available.

```
node tools/githack-url.mjs
```

The script prints links for `docs/index.html`, `docs/animation-editor.html`, `docs/cosmetic-editor.html`, and `docs/map-editor.html` using the current branch or commit. It now warns if the ref is not published to your `origin` remote, because raw.githack.com cannot serve commits that are only local. You can override the ref explicitly when needed:

```
node tools/githack-url.mjs --ref=feature-branch
```

If you are working without an `origin` remote (or want to point to a fork), provide the repo slug explicitly:

```
node tools/githack-url.mjs --slug=Oolnokk/SoKEmpirePrologue
```

Paste any printed link into https://raw.githack.com to view that page directly.
