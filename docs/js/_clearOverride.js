// Legacy shim kept for cached bundles: clear any lingering
// window-level pose override before the modular bootstrap runs.
(() => {
  const candidates = [
    typeof globalThis !== 'undefined' ? globalThis : undefined,
    typeof window !== 'undefined' ? window : undefined,
    typeof self !== 'undefined' ? self : undefined,
  ];

  const root = candidates.find((candidate) => candidate && typeof candidate === 'object');
  if (!root) return;

  const game = root.GAME;
  if (!game || typeof game !== 'object') return;

  if (Object.prototype.hasOwnProperty.call(game, 'poseOverride')) {
    try {
      delete game.poseOverride;
    } catch (err) {
      // Ignore delete failures (e.g. non-configurable properties)
    }

    if (Object.prototype.hasOwnProperty.call(game, 'poseOverride')) {
      game.poseOverride = undefined;
    }
  }
})();
