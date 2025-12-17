import { resolveGroundLine } from './ground-resolver.js?v=1';

export function computeGroundY(config = {}, options = {}) {
  const canvasHeight = Number.isFinite(options.canvasHeight)
    ? options.canvasHeight
    : (Number.isFinite(config?.canvas?.h)
      ? config.canvas.h
      : (Number.isFinite(config?.canvas?.height) ? config.canvas.height : 460));

  const groundY = Number.isFinite(config?.groundY) ? config.groundY : null;
  const groundOffsetOverride = Number.isFinite(options.groundOffset) ? options.groundOffset : null;

  const { groundLine } = resolveGroundLine({
    groundY,
    viewHeight: canvasHeight,
    groundOffset: groundOffsetOverride,
    config,
  });

  return groundLine;
}
