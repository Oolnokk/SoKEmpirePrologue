export function computeGroundY(config = {}, options = {}) {
  const explicitRaw = Number(config?.groundY);
  const explicit = Number.isFinite(explicitRaw) && explicitRaw > 0 ? explicitRaw : null;

  const canvasHeight = Number.isFinite(options.canvasHeight)
    ? options.canvasHeight
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

export function resolveSharedGroundY(config = {}, options = {}) {
  const { canvasHeight } = options;
  if (typeof window !== 'undefined') {
    const sharedGroundY = window.GAME?.RENDER_STATE?.groundLine;
    if (Number.isFinite(sharedGroundY)) return sharedGroundY;

    const canvas = window.GAME?.CANVAS ?? window.GAME?.canvas;
    const liveHeight = Number.isFinite(canvas?.height) ? canvas.height : Number.isFinite(canvas?.h) ? canvas.h : null;
    if (Number.isFinite(liveHeight) && liveHeight !== canvasHeight) {
      const resolved = computeGroundY(config, { ...options, canvasHeight: liveHeight });
      if (Number.isFinite(resolved)) return resolved;
    }
  }
  return computeGroundY(config, options);
}
