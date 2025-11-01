// Legacy shim kept for backward compatibility.
// Older builds of app.js imported this module to clear a window-scoped pose override.
// The modern animator manages overrides per fighter, so the shim just performs
// the cleanup defensively and otherwise stays inert.

const root = typeof window !== 'undefined' ? window : globalThis;

if (root?.GAME?.poseOverride) {
  delete root.GAME.poseOverride;
}

export {}; // mark file as an ES module
