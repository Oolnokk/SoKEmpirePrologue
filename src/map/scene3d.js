/**
 * Helpers for optional 3D scene metadata that rides alongside existing 2D
 * layouts. The goal is to enable perspective-correct rendering while keeping
 * gameplay logic on a flat Z=0 plane and avoiding complex lighting/surface
 * concerns.
 */

const DEFAULT_SCENE = Object.freeze({
  sceneUrl: null,
  ground: Object.freeze({
    planeZ: 0,
    unitsPerPixel: 1,
  }),
  camera: Object.freeze({
    projection: 'perspective',
    fov: 50,
  }),
  render: Object.freeze({
    lighting: 'none',
    materials: 'unlit',
  }),
});

export function normalizeScene3dConfig(scene3d) {
  if (!scene3d || typeof scene3d !== 'object') {
    return DEFAULT_SCENE;
  }

  const cameraProjection = scene3d.camera?.projection === 'orthographic'
    ? 'orthographic'
    : 'perspective';

  return {
    sceneUrl: typeof scene3d.sceneUrl === 'string' ? scene3d.sceneUrl : DEFAULT_SCENE.sceneUrl,
    ground: {
      planeZ: typeof scene3d.ground?.planeZ === 'number' ? scene3d.ground.planeZ : DEFAULT_SCENE.ground.planeZ,
      unitsPerPixel: typeof scene3d.ground?.unitsPerPixel === 'number'
        ? scene3d.ground.unitsPerPixel
        : DEFAULT_SCENE.ground.unitsPerPixel,
    },
    camera: {
      projection: cameraProjection,
      fov: typeof scene3d.camera?.fov === 'number' ? scene3d.camera.fov : DEFAULT_SCENE.camera.fov,
    },
    render: {
      // Keep lighting simple; anything other than "none" is treated as a request for
      // flat shading but still avoids complex realtime lighting rigs.
      lighting: scene3d.render?.lighting === 'flat' ? 'flat' : DEFAULT_SCENE.render.lighting,
      materials: 'unlit',
    },
  };
}

/**
 * Given a 2D logic coordinate, return the 3D coordinate anchored to the ground
 * plane. This keeps gameplay coordinates planar while allowing the renderer to
 * place content in a 3D scene.
 */
export function projectToGroundPlane(point, scene3d = DEFAULT_SCENE) {
  if (!point || typeof point !== 'object') {
    return { x: 0, y: 0, z: scene3d.ground?.planeZ ?? DEFAULT_SCENE.ground.planeZ };
  }
  const planeZ = scene3d.ground?.planeZ ?? DEFAULT_SCENE.ground.planeZ;
  const units = scene3d.ground?.unitsPerPixel ?? DEFAULT_SCENE.ground.unitsPerPixel;
  return {
    x: typeof point.x === 'number' ? point.x * units : 0,
    y: typeof point.y === 'number' ? point.y * units : 0,
    z: planeZ,
  };
}

export function buildRenderSettings(scene3d = DEFAULT_SCENE) {
  const normalized = normalizeScene3dConfig(scene3d);
  return {
    lighting: normalized.render.lighting,
    materials: normalized.render.materials,
    notes: 'Perspective-only bridge; no complex surfaces or realtime lights.',
  };
}

export function getDefaultScene3d() {
  return DEFAULT_SCENE;
}
