// Legacy shim kept for cached bundles: clear any lingering
// window-level pose override before the modular bootstrap runs.
(() => {
  const resolveRoot = () => {
    const candidates = [
      typeof globalThis !== 'undefined' ? globalThis : undefined,
      typeof window !== 'undefined' ? window : undefined,
      typeof self !== 'undefined' ? self : undefined,
    ];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== 'object') continue;
      if ('GAME' in candidate) return candidate;
    }

    return undefined;
  };

  const clearOverride = (game) => {
    if (!Object.prototype.hasOwnProperty.call(game, 'poseOverride')) return;

    try {
      delete game.poseOverride;
    } catch (err) {
      // Ignore delete failures (e.g. non-configurable properties)
    }

    if (Object.prototype.hasOwnProperty.call(game, 'poseOverride')) {
      game.poseOverride = undefined;
    }
  };

  const root = resolveRoot();
  const game = root?.GAME;
  if (!game || typeof game !== 'object') return;

  clearOverride(game);
})();
