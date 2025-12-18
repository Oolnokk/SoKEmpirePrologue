# GitHack URLs for Rapid Testing

Use these GitHack URLs to test each commit directly in your browser without needing to clone/pull.

## Repository Info
- **GitHub**: `Oolnokk/SoKEmpirePrologue`
- **Branch**: `claude/fix-3d-world-movement-Y64U8`

## Recent Commits

### Commit 4: Camera Bounds Fix (Latest)
**Commit**: `b829992` - Fix camera movement: remove padding and use correct bounds format

**GitHack URL** (for HTML entry point):
```
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/b829992/docs/index.html
```

**Changes**:
- **CRITICAL FIX**: Changed camera bounds from minX/maxX to `bounds = { min, max }` format
- Removed world size padding - 2D world now exactly matches 3D path span
- 2D pixel 0 → 3D path start (-2850)
- 2D pixel 5700 → 3D path end (+2850)
- Character can now move properly across full path range

---

### Commit 3: Procedural World Sizing
**Commit**: `b87e263` - Add procedural 2D world sizing based on 3D gameplay path

**GitHack URL** (for HTML entry point):
```
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/b87e263/docs/index.html
```

**Changes**:
- 2D world automatically sizes to match 3D gameplay path extents
- Added `getPathExtents()` method to visualsmapLoader
- Added `autoSizeWorldToGameplayPath()` function in app.js
- ⚠️ Had movement issues (fixed in b829992)

---

### Commit 2: Pixel-Perfect Mapping
**Commit**: `57ea5be` - Make 2D-3D coordinate mapping pixel-perfect (1:1)

**GitHack URL** (for HTML entry point):
```
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/57ea5be/docs/index.html
```

**Changes**:
- `pixelsToUnits: 1.0` (pixel-perfect 1:1 mapping)
- 1 pixel in 2D = 1 unit in 3D
- Updated documentation

---

### Commit 1: Initial Fix
**Commit**: `eb705ae` - Fix 3D world movement direction with tight 2D-3D coordinate coupling

**GitHack URL** (for HTML entry point):
```
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/eb705ae/docs/index.html
```

**Changes**:
- Created coordinate transformation system
- Refactored camera sync to use transformations
- Initial scale: `pixelsToUnits: 0.1`

---

## How to Use GitHack

### Option 1: Production CDN (Cached, Fast)
Use `raw.githack.com` for stable testing:
```
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/COMMIT_HASH/docs/index.html
```

### Option 2: Development CDN (Uncached, Always Fresh)
Use `rawcdn.githack.com` for latest changes:
```
https://rawcdn.githack.com/Oolnokk/SoKEmpirePrologue/COMMIT_HASH/docs/index.html
```

## Quick Test Commands

### View specific file at commit
```bash
# Coordinate transform module
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/57ea5be/docs/js/coordinate-transform.js

# Camera sync module
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/57ea5be/docs/js/three-camera-sync.js

# Main app
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/57ea5be/docs/js/app.js
```

## Testing Checklist

For each commit URL:

1. **Open in browser** - Load the GitHack URL
2. **Open DevTools Console** - Press F12 to see initialization logs
3. **Check for auto-sizing** (b829992 - latest):
   ```
   [app] Auto-sizing 2D world to gameplay path:
     Path extents: X=[-2850.0, 2850.0] (span: 5700.0)
     2D world dimensions: 5700.0 x 600.0 pixels
     Camera bounds: [0, 5700.0]
   ```
   Note: No padding - 2D world exactly matches path span
4. **Check for transform init**:
   ```
   [coordinate-transform] Transform config initialized: {...}
   ```
5. **Test movement** (b829992):
   - ✅ Character should be able to move left/right
   - ✅ 3D world moves in same direction
   - ✅ Can reach BOTH ends of the gameplay path
   - ✅ Pixel-perfect alignment (1px = 1 unit)
6. **Compare commits**:
   - `eb705ae` (0.1 scale) - slow 3D movement
   - `57ea5be` (1.0 scale) - pixel-perfect but hardcoded size
   - `b87e263` (procedural) - ⚠️ broken (no movement)
   - `b829992` (procedural + fix) - ✅ **WORKING**

## Alternative: Test via GitHub Pages

If your repo has GitHub Pages enabled:
```
https://oolnokk.github.io/SoKEmpirePrologue/docs/
```

Then switch branches in repo settings to test different commits.

## Tips

- **Clear cache** between tests: Ctrl+Shift+R (hard refresh)
- **Use incognito** for clean testing environment
- **Check commit time**: Ensure GitHack has synced (may take 1-2 minutes)
- **View source**: Right-click → View Page Source to verify correct commit

## Debugging

If GitHack URLs don't load:

1. **Check commit is pushed**:
   ```bash
   git ls-remote origin claude/fix-3d-world-movement-Y64U8
   ```

2. **Try direct GitHub raw**:
   ```
   https://raw.githubusercontent.com/Oolnokk/SoKEmpirePrologue/57ea5be/docs/index.html
   ```

3. **Verify file exists**:
   ```
   https://github.com/Oolnokk/SoKEmpirePrologue/blob/57ea5be/docs/js/coordinate-transform.js
   ```

## Per-Commit Comparison

| Commit | Scale | Description | URL |
|--------|-------|-------------|-----|
| `eb705ae` | 0.1x | Initial fix with 10% scaling | [Test](https://raw.githack.com/Oolnokk/SoKEmpirePrologue/eb705ae/docs/index.html) |
| `57ea5be` | 1.0x | Pixel-perfect 1:1 mapping | [Test](https://raw.githack.com/Oolnokk/SoKEmpirePrologue/57ea5be/docs/index.html) |
| `b87e263` | 1.0x | Procedural sizing (⚠️ broken) | [Test](https://raw.githack.com/Oolnokk/SoKEmpirePrologue/b87e263/docs/index.html) |
| `b829992` | 1.0x | **WORKING** - Procedural + bounds fix | [Test](https://raw.githack.com/Oolnokk/SoKEmpirePrologue/b829992/docs/index.html) |

---

**Note**: Replace `docs/index.html` with your actual game entry point if different.
