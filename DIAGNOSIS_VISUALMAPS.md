# Diagnosis: Changes to `visualmaps/index.json` Not Reflected In-Game

## Executive Summary

**Root Cause:** In-memory caching in the ES module `visualsmapLoader.js` prevents changes to `visualmaps/index.json` from being reflected without a hard browser refresh.

**Impact:** Users editing the asset index must perform a hard refresh (Ctrl+Shift+R / Cmd+Shift+R) to see changes, which is not documented and leads to confusion.

**Fix Required:** Add cache-busting mechanisms and document the refresh requirement.

---

## Investigation Results

### 1. File Location Analysis

**Primary File:**
- Path: `/docs/config/maps/visualsmaps/index.json` 
- Note: Directory is "visualsmaps" (plural), not "visualmaps" (singular)
- Status: ✓ File exists and is valid JSON
- No duplicates found in repository

**No Build Pipeline:**
- No webpack/rollup/vite/esbuild configuration found
- No copy/transpilation scripts for this file
- File is served directly from its location
- `package.json` only has `build:map-bootstrap` script (unrelated)

### 2. Loading Mechanism Trace

**Runtime Game (`docs/renderer/visualsmapLoader.js`):**
```javascript
// Line 8: Module-level cache (persists for page session)
const VISUALSMAP_INDEX_CACHE = {
  loaded: false,
  assets: null,
  baseUrl: null,
};

// Lines 152-157: Returns cached data if available
async function loadVisualsmapIndex(baseContext = null) {
  if (VISUALSMAP_INDEX_CACHE.loaded && VISUALSMAP_INDEX_CACHE.assets) {
    return {
      assets: VISUALSMAP_INDEX_CACHE.assets,
      baseUrl: VISUALSMAP_INDEX_CACHE.baseUrl,
    };
  }
  // ... fetch logic only runs if cache empty
}
```

**Load Path:**
- Line 160: `const indexPath = 'config/maps/visualsmaps/index.json';`
- Line 161: Path resolved relative to current page using `resolveAssetPath()`
- Line 171: Fetches via standard `fetch()` API
- Lines 191-193: **Cache is populated and persists**

**Other Loaders:**
1. **3D Map Builder** (`docs/3Dmapbuilder.html`, line 277):
   - `fetch('./config/maps/visualsmaps/index.json')`
   - No explicit caching, relies on browser HTTP cache

2. **Map Editor** (`docs/map-editor.html`, line 560):
   - `fetch(new URL('config/maps/visualsmaps/index.json', docsBase))`
   - No explicit caching, relies on browser HTTP cache

### 3. Caching Mechanisms Identified

**A. In-Memory ES Module Cache (PRIMARY ISSUE)**
- **Location:** `docs/renderer/visualsmapLoader.js`, lines 8-12
- **Behavior:** Once loaded, returns cached data without refetching
- **Scope:** Per-page-session (persists across soft refreshes)
- **Impact:** **HIGH** - Changes invisible until hard refresh or cache clear

**B. Browser HTTP Cache (SECONDARY ISSUE)**
- **Mechanism:** Standard browser caching for static JSON files
- **Behavior:** Browser may cache responses based on default cache headers
- **Scope:** Persistent across sessions (until cache expires or cleared)
- **Impact:** **MEDIUM** - Can compound the in-memory cache issue

**C. No Service Worker**
- ✓ Confirmed: No service worker registration found
- ✓ No manifest caching detected

**D. No Asset Fingerprinting**
- ✓ No hash-based filenames (e.g., `index.abc123.json`)
- ✓ File served at consistent path

### 4. User Workflow Issue

**Current Reality:**
1. User edits `/docs/config/maps/visualsmaps/index.json`
2. User refreshes browser (F5 or soft refresh)
3. **ES module cache returns old data** → No changes visible
4. User confused, thinks edits "don't work"

**Required Workflow (not documented):**
1. User edits `/docs/config/maps/visualsmaps/index.json`
2. User performs **hard refresh** (Ctrl+Shift+R / Cmd+Shift+R / Ctrl+F5)
3. Browser reloads ES modules and clears caches → Changes visible

### 5. No Build/Deployment Issues

**Verified:**
- ✓ No build step transforms or copies the file
- ✓ No separate source/output directories for this asset
- ✓ File is served directly from `/docs/` directory
- ✓ GitHub Pages (if used) serves files directly from `/docs/`

### 6. Path Resolution Verified

**All loaders use correct path:**
- Runtime: `config/maps/visualsmaps/index.json` (relative)
- 3D Map Builder: `./config/maps/visualsmaps/index.json` (relative)
- Map Editor: `config/maps/visualsmaps/index.json` (via URL constructor)

**No case sensitivity issues:**
- File system is case-sensitive
- All references use lowercase "visualsmaps"
- Consistent across codebase

---

## Root Cause Summary

**PRIMARY:** The `VISUALSMAP_INDEX_CACHE` in `docs/renderer/visualsmapLoader.js` creates an in-memory cache that persists for the page session. Since ES modules are not re-executed on soft refresh, the cached data remains stale even after the JSON file is edited.

**SECONDARY:** Browser HTTP caching may additionally cache the JSON file, requiring a hard refresh to bypass.

**TERTIARY:** Lack of documentation about this behavior leaves users confused when their edits don't appear.

---

## Recommended Fixes

### Fix #1: Add Cache-Busting Query Parameter (RECOMMENDED)

**Location:** `docs/renderer/visualsmapLoader.js`, line 160-171

**Change:**
```javascript
// Add timestamp or version parameter to bypass cache
const indexPath = `config/maps/visualsmaps/index.json?t=${Date.now()}`;
```

**Pros:**
- Simple one-line change
- Bypasses both in-memory and HTTP cache
- Works immediately without user intervention

**Cons:**
- Makes every load a fresh request (no caching benefit)
- Can be mitigated with conditional cache-busting (dev mode only)

### Fix #2: Add Cache Invalidation API

**Location:** `docs/renderer/visualsmapLoader.js`

**Add Function:**
```javascript
export function clearVisualsmapCache() {
  VISUALSMAP_INDEX_CACHE.loaded = false;
  VISUALSMAP_INDEX_CACHE.assets = null;
  VISUALSMAP_INDEX_CACHE.baseUrl = null;
  console.log('[visualsmapLoader] Cache cleared');
}
```

**Usage:**
- Expose in dev tools / debug panel
- Call from editor after save
- Add keyboard shortcut (e.g., Ctrl+Shift+L to reload)

**Pros:**
- Surgical control over cache
- Maintains caching benefits in production
- Developer-friendly

**Cons:**
- Requires UI/integration work
- Users need to know about it

### Fix #3: Conditional Caching Based on Environment

**Location:** `docs/renderer/visualsmapLoader.js`, line 153

**Change:**
```javascript
// Check if in development mode (file:// or localhost)
const isDev = window.location.protocol === 'file:' || 
              window.location.hostname === 'localhost' ||
              window.location.hostname === '127.0.0.1';

if (!isDev && VISUALSMAP_INDEX_CACHE.loaded && VISUALSMAP_INDEX_CACHE.assets) {
  // Only use cache in production
  return {
    assets: VISUALSMAP_INDEX_CACHE.assets,
    baseUrl: VISUALSMAP_INDEX_CACHE.baseUrl,
  };
}
```

**Pros:**
- Best of both worlds: caching in production, always fresh in dev
- Transparent to users

**Cons:**
- Slightly more complex
- Need to ensure dev detection is reliable

### Fix #4: Documentation (ESSENTIAL)

**Add to relevant files:**

**`docs/GAMEPLAY_MAP_EDITOR_README.md` or similar:**
```markdown
## Editing Visual Assets

When editing `/docs/config/maps/visualsmaps/index.json`, changes may not appear immediately due to browser caching.

**To see your changes:**
- Perform a **hard refresh**: 
  - Windows/Linux: `Ctrl + Shift + R` or `Ctrl + F5`
  - macOS: `Cmd + Shift + R`
- Or clear browser cache for the site

This ensures both the ES module cache and HTTP cache are cleared.
```

**`docs/config/maps/visualsmaps/index.json` (add comment header):**
```json
{
  "_comment": "IMPORTANT: After editing this file, use Ctrl+Shift+R (hard refresh) to see changes in-game",
  "version": "1.0.0",
  ...
}
```

---

## Implementation Recommendation

**Immediate Action:**
1. Implement **Fix #3** (Conditional Caching) → Solves dev workflow issue
2. Implement **Fix #4** (Documentation) → Helps all users understand caching
3. Add **Fix #2** (Cache Clear Function) → Provides manual override if needed

**Optional Enhancement:**
- Add cache clear button to map editors
- Add debug panel showing cache status

---

## Testing Steps

After implementing fixes:

1. **Test Dev Mode:**
   - Serve via `python -m http.server` (localhost)
   - Edit `index.json`, add a new asset
   - Soft refresh (F5) → Should show changes immediately

2. **Test Production Mode:**
   - Serve via HTTP (not localhost)
   - Edit `index.json`
   - Soft refresh (F5) → Should use cache (faster)
   - Hard refresh (Ctrl+Shift+R) → Should show changes

3. **Test Cache Clear API:**
   - Load page, check cache populated
   - Call `clearVisualsmapCache()` in console
   - Verify next load fetches fresh data

---

## Additional Notes

- No GitHub Actions workflows found (no CI/CD to modify)
- No asset bundler (webpack/vite) to configure
- File is served statically from `/docs/` directory
- This analysis applies similarly to other JSON config files in the project

---

## Summary for User

**What's Wrong:**
Your edits to `visualmaps/index.json` ARE being saved correctly, but the game loads cached data from memory instead of reading your updated file.

**Quick Fix (Right Now):**
After editing the file, use **Ctrl+Shift+R** (Windows/Linux) or **Cmd+Shift+R** (macOS) to hard refresh your browser. This clears the cache and loads your changes.

**Permanent Fix (Requires Code Change):**
The caching logic in `docs/renderer/visualsmapLoader.js` needs to be modified to either:
- Disable caching during development, or
- Add cache-busting parameters to the file URL, or
- Provide a manual cache clear function

**Note:** The correct filename is `visualsmaps/index.json` (plural), not `visualmaps/index.json` (singular). Ensure you're editing the file at `/docs/config/maps/visualsmaps/index.json`.
