// Legacy shim kept for cached bundles. Removes any lingering
// window-level pose override before the modular bootstrap runs.
(function clearLegacyOverride() {
  try {
    var root = typeof window !== 'undefined'
      ? window
      : (typeof globalThis !== 'undefined' ? globalThis : undefined);
    var game = root && root.GAME;
    if (game && Object.prototype.hasOwnProperty.call(game, 'poseOverride')) {
      delete game.poseOverride;
    }
  } catch (_err) {
    // ignore — older environments might not expose window/globalThis
  }
})();

export {};
