// Legacy shim kept for cached bundles. Removes any lingering
// window-level pose override before the modular bootstrap runs.
const root = typeof globalThis !== 'undefined'
  ? globalThis
  : (typeof window !== 'undefined' ? window : undefined);
const game = root?.GAME;
if (game && Object.prototype.hasOwnProperty.call(game, 'poseOverride')) {
  delete game.poseOverride;
}
