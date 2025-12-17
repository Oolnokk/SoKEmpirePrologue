import { resolveGroundLine } from './ground-resolver.js?v=1';

export function computeGroundY(config = {}, options = {}) {
  const canvasHeight = Number.isFinite(options.canvasHeight)
    ? options.canvasHeight
    : (Number.isFinite(config?.canvas?.h)
      ? config.canvas.h
      : (Number.isFinite(config?.canvas?.height) ? config.canvas.height : 460));

  const groundY = Number.isFinite(config?.groundY) && config.groundY > 0 ? config.groundY : null;
  const groundOffsetOverride = Number.isFinite(options.groundOffset) ? options.groundOffset : null;

  const { groundLine } = resolveGroundLine({
    groundY,
    viewHeight: canvasHeight,
    groundOffset: groundOffsetOverride,
    config,
  });

  return groundLine;
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
