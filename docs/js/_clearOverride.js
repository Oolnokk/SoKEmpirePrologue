// Legacy shim kept for backward compatibility.
// Older builds of app.js imported this module to clear a window-scoped pose override.
// The modern animator manages overrides per fighter, so the shim just performs
// the cleanup defensively and otherwise stays inert.
(function clearLegacyOverride(){
  try {
    if (window.GAME && window.GAME.poseOverride) {
      delete window.GAME.poseOverride;
    }
  } catch (_) {
    // ignore environments without window or GAME
  }
})();
