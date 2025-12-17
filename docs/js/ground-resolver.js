// Re-exported to centralize ground calculations across rendering and physics.
export function computeGroundYFromConfig(config = {}, canvasHeightOverride) {
  const explicit = Number.isFinite(config?.groundY) && config.groundY > 0 ? config.groundY : null;
  const canvasHeight = Number.isFinite(canvasHeightOverride)
    ? canvasHeightOverride
    : (Number.isFinite(config?.canvas?.h)
      ? config.canvas.h
      : (Number.isFinite(config?.canvas?.height) ? config.canvas.height : 460));
  if (explicit != null) return explicit;
  const offset = Number(config?.ground?.offset);
  if (Number.isFinite(offset)) {
    return Math.round(canvasHeight - offset);
  }
  const ratioRaw = Number(config?.groundRatio);
  const ratio = Number.isFinite(ratioRaw) && ratioRaw > 0 && ratioRaw < 1
    ? ratioRaw
    : 0.7;
  return Math.round(canvasHeight * ratio);
}

export function resolveGroundLine(options = {}) {
  const {
    groundY,
    viewHeight,
    groundOffset,
    config = {},
    fallbackOffset = 140,
  } = options;
  const canvasHeight = Math.max(1, Number(viewHeight) || 1);
  const derivedAreaGround = Number.isFinite(groundOffset)
    ? canvasHeight - groundOffset
    : null;
  const resolvedGround = Number.isFinite(groundY)
    ? groundY
    : (Number.isFinite(derivedAreaGround)
      ? derivedAreaGround
      : computeGroundYFromConfig(config, canvasHeight));
  const effectiveFallback = Number.isFinite(groundOffset) ? groundOffset : fallbackOffset;
  const groundLine = Number.isFinite(resolvedGround)
    ? resolvedGround
    : (canvasHeight - effectiveFallback);
  return { groundLine, derivedAreaGround, resolvedGround };
}
