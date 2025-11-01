// Legacy shim — clear any leftover window-level pose override before boot.
// Older builds toggled `window.GAME.poseOverride` without automatic TTL cleanup,
// so we defensively remove it here to keep cached bundles stable.
(function clearLegacyOverride() {
  try {
    if (window.GAME && window.GAME.poseOverride) {
      delete window.GAME.poseOverride;
    }
  } catch (_err) {
    // Ignore access errors (e.g., window undefined in non-browser contexts).
  }
})();
