export function computeGroundY(config = {}, options = {}) {
  // Check if groundY is locked by camera projection
  // When set by camera, it should remain constant even if camera moves
  if (config?.groundYSource === 'camera' && Number.isFinite(config?.groundY)) {
    console.log('[ground-utils] computeGroundY: Using camera-locked groundY:', config.groundY);
    return config.groundY;
  }

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
