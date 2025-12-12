Local fallback location for Three.js runtime scripts.

Drop **both** the classic globals and ES-module builds here to avoid CDN failures:

* `three.min.js` **and** `three.module.js`
* `GLTFLoader.js` (or `loaders/GLTFLoader.min.js`) **and** `GLTFLoader.module.js` (or `examples/jsm/loaders/GLTFLoader.js`)

The loader in `docs/js/app.js` will try local classic globals first, then ES modules, then multiple public CDNs.
