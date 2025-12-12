# SoKEmpirePrologue

## Three.js Setup

This project uses Three.js for 3D rendering in the game demo, map editors, and other tools. Three.js is provided via local vendor files with CDN fallbacks.

### Local Installation

Three.js v0.160.0 is included in `docs/vendor/three/` for offline use:
- `three.min.js` - Minified classic globals build (**working** ✓)
- `three.module.js` - ES module build (**working** ✓)
- `GLTFLoader.js` - Classic globals wrapper (incomplete, missing dependencies)
- `GLTFLoader.module.js` - ES module build (incomplete, missing dependencies)

### Loading Behavior

The application automatically attempts to load Three.js from:
1. **Local vendor directory** (offline-capable) - three.js core library loads successfully
2. **Public CDNs** (cdnjs, jsdelivr, unpkg) as fallbacks for GLTFLoader and full functionality

The three.js core library works from local files. GLTFLoader currently requires CDN access or additional utility files. The application gracefully handles missing 3D assets and continues to function without them.

No build steps or npm install commands are required. The files are committed to the repository and ready to use.

### Updating Three.js

To update to a newer version, see `docs/vendor/three/README.md` for instructions.

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

The script prints links for `docs/index.html`, `docs/animation-editor.html`, `docs/cosmetic-editor.html`, and `docs/map-editor.html` using the current branch or commit. You can override the ref explicitly when needed:

```
node tools/githack-url.mjs --ref=feature-branch
```

Paste any printed link into https://raw.githack.com to view that page directly.
