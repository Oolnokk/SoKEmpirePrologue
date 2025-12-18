# GitHack URLs for Rapid Testing

Use these GitHack URLs to test each commit directly in your browser without needing to clone/pull.

## Repository Info
- **GitHub**: `Oolnokk/SoKEmpirePrologue`
- **Branch**: `claude/fix-3d-world-movement-Y64U8`

## Recent Commits

### Commit 2: Pixel-Perfect Mapping (Latest)
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
3. **Check for transform init**:
   ```
   [coordinate-transform] Transform config initialized: {...}
   ```
4. **Test movement**:
   - Move character left/right
   - Verify 3D world moves in same direction
   - Check scale feels appropriate
5. **Compare commits**:
   - Test both `eb705ae` (0.1 scale) and `57ea5be` (1.0 scale)
   - Note difference in 3D movement speed

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

---

**Note**: Replace `docs/index.html` with your actual game entry point if different.
