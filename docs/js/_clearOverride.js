// Legacy shim kept for cached bundles: clear any lingering
// window-level pose override before the modular bootstrap runs.
(() => {
  const root = typeof globalThis !== 'undefined'
    ? globalThis
    : (typeof window !== 'undefined' ? window : undefined);
  if (!root) return;

  const game = root.GAME;
  if (game && Object.prototype.hasOwnProperty.call(game, 'poseOverride')) {
    delete game.poseOverride;
  }
})();
