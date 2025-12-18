# GitHack URLs for Rapid Testing

Use these GitHack URLs to test each commit directly in your browser without needing to clone/pull.

## Repository Info
- **GitHub**: `Oolnokk/SoKEmpirePrologue`
- **Branch**: `claude/fix-3d-world-movement-Y64U8`

## Recent Commits

### Commit 5: Sign Flip Fix (Latest) ✅
**Commit**: `c919fc3` - Remove incorrect sign flip in camera sync

**GitHack URL** (for HTML entry point):
```
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/c919fc3/docs/index.html
```

**Changes**:
- **FINAL FIX**: Removed incorrect sign negation on parallaxX
- 3D camera now positioned correctly (left of path when at left of 2D world)
- Fixed visual movement - 3D world now moves correctly with 2D camera
- ✅ All coordinate systems properly aligned!

---

### Commit 4: Camera Bounds Fix
**Commit**: `b829992` - Fix camera movement: remove padding and use correct bounds format

**GitHack URL** (for HTML entry point):
```
https://raw.githack.com/Oolnokk/SoKEmpirePrologue/b829992/docs/index.html
```

**Changes**:
- Changed camera bounds from minX/maxX to `bounds = { min, max }` format
- Removed world size padding - 2D world now exactly matches 3D path span
- 2D pixel 0 → 3D path start (-2850)
- 2D pixel 5700 → 3D path end (+2850)
- ⚠️ Had sign flip issue (fixed in c919fc3)

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

For commit `c919fc3` (latest, fully working):

1. **Open in browser** - Load the GitHack URL
   ```
   https://raw.githack.com/Oolnokk/SoKEmpirePrologue/c919fc3/docs/index.html
   ```

2. **Open DevTools Console** - Press F12 to see initialization logs
3. **Check for auto-sizing**:
   ```
   [app] Auto-sizing 2D world to gameplay path:
     Path extents: X=[-2850.0, 2850.0] (span: 5700.0)
     2D world dimensions: 5700.0 x 600.0 pixels
     Camera bounds: [0, 5700.0]
   ```

4. **Check for transform init**:
   ```
   [coordinate-transform] Transform config initialized: {...}
   ```

5. **Verify debug overlay shows NO mismatch**:
   ```
   ✓ Mismatch: expected -2256.4, got -2256.4
   ```
   (Values should match!)

6. **Test movement** (c919fc3):
   - ✅ Character can move left and right freely
   - ✅ 3D world moves correctly with 2D camera
   - ✅ Can reach BOTH ends of the gameplay path
   - ✅ Pixel-perfect alignment (1px = 1 unit)
   - ✅ Camera positioning matches expected values

7. **Compare commits** (if needed):
   - `eb705ae` - Initial 0.1x scale fix
   - `57ea5be` - Pixel-perfect but hardcoded
   - `b87e263` - Procedural (broken - no movement)
   - `b829992` - Bounds fix (broken - inverted camera)
   - `c919fc3` - ✅ **FULLY WORKING**

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
| `b87e263` | 1.0x | Procedural sizing (⚠️ broken - no movement) | [Test](https://raw.githack.com/Oolnokk/SoKEmpirePrologue/b87e263/docs/index.html) |
| `b829992` | 1.0x | Bounds fix (⚠️ inverted camera) | [Test](https://raw.githack.com/Oolnokk/SoKEmpirePrologue/b829992/docs/index.html) |
| `c919fc3` | 1.0x | ✅ **FULLY WORKING** - All fixes applied | [Test](https://raw.githack.com/Oolnokk/SoKEmpirePrologue/c919fc3/docs/index.html) |

---

**Note**: Replace `docs/index.html` with your actual game entry point if different.
