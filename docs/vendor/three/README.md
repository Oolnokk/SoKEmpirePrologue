Local fallback location for Three.js runtime scripts.

Drop `three.min.js` and `GLTFLoader.js` (or the `loaders/GLTFLoader.min.js`) from a trusted Three.js distribution here to avoid CDN failures.

The loader in `docs/js/app.js` will try these local copies first, then fall back to multiple public CDNs.
