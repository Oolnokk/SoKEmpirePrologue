// Legacy bootstrap shim that clears the pre-modular pose override flag.
// Cached bundles on GitHub Pages still expect this module to remove
// `GAME.poseOverride`, so keep the defensive cleanup in place.

(function clearLegacyOverride() {
  /** @type {unknown[]} */
  const candidates = [];

  try { if (typeof globalThis !== 'undefined') candidates.push(globalThis); } catch (_) {}
  try { if (typeof window !== 'undefined') candidates.push(window); } catch (_) {}
  try { if (typeof self !== 'undefined') candidates.push(self); } catch (_) {}
  try { if (typeof global !== 'undefined') candidates.push(global); } catch (_) {}

  const host = candidates.find((candidate) => candidate && typeof candidate === 'object');
  if (!host) return;

  const game = /** @type {Record<string, unknown> | undefined} */ (host.GAME);
  if (!game || typeof game !== 'object') return;

  if (!('poseOverride' in game)) return;

  try {
    if (Reflect.deleteProperty(game, 'poseOverride')) return;
  } catch (_) {
    // ignore and fall back to undefined assignment
  }

  try {
    // Non-configurable props cannot be deleted, so reset to undefined instead.
    game.poseOverride = undefined;
  } catch (_) {
    // If even the assignment fails, swallow the error so bootstrap continues.
  }
})();
