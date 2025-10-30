# KHY Stage Game (Modular Web Build)

This folder is ready to run **online from GitHub** with no bundler — just ES Modules + static files.

## Folder Structure
```
/ (repo root)
  index.html
  styles.css
  /js
    app.js
    config-shims.js
    controls.js
    fighter.js
    presets.js
  .nojekyll
  README.md
```

## Option A — GitHub Pages (recommended)
1. Create a new GitHub repository (public or private).
2. Upload these files at the repo root (or push via git).
3. In **Settings → Pages**:
   - **Source**: `Deploy from a branch`
   - **Branch**: `main` (or `master`) → `/ (root)`
4. Wait ~1 minute for Pages to publish, then open:
   - `https://<username>.github.io/<repo-name>/`

> **Note:** All imports use **relative paths**, so this works for both user sites and project sites. No path edits needed.

## Option B — Raw GitHub URLs (works, but Pages is cleaner)
If you want to embed this app from raw URLs (e.g., in another site), you can point `<script type="module">` at raw GitHub links:
```html
<script type="module" src="https://raw.githubusercontent.com/<username>/<repo>/<branch>/js/app.js"></script>
```
Raw GitHub serves with the right CORS headers for ES Modules. Keep all other imports **relative** so they resolve under the same prefix.

## External Config
The game still loads your authored `config.js` from CDN (jsDelivr). If you later want to version that inside the repo, place it at `/config/config.js` and update the script tag:
```html
<script src="./config/config.js"></script>
```

## Local Test (no server needed)
Open `index.html` in a modern browser. Because we use **relative** module imports, it will also run from `file://` in Chrome/Edge/Safari without a dev server.

## Troubleshooting
- **Blank screen + “Failed to load module”**: Confirm the file paths in `/js` match exactly and that you deployed from the **root**.
- **404 on GitHub Pages**: Ensure Pages is set to the **root** and branch is correct. Add `.nojekyll` (already included) to avoid pipeline quirks.
- **CORS errors**: Prefer GitHub Pages over `raw.githubusercontent.com` when embedding from other origins.

## Mobile Debug
- The boot error overlay and status panel are enabled by default; tap **Help** for controls.
