export { MapRegistry, MapRegistryError } from './MapRegistry.js';
export { convertLayoutToArea, convertLayouts } from './builderConversion.js';
export { mapBuilderConfig, loadMapBuilderConfig, getDefaultMapBuilderConfig } from './mapBuilderConfig.js';
export { SpawnService, translateAreaToSpawnPayload } from '../spawn/SpawnService.js';
export {
  buildRenderSettings,
  getDefaultScene3d,
  normalizeScene3dConfig,
  projectToGroundPlane,
} from './scene3d.js';
export {
  GeometryService,
  GeometryServiceError,
  adaptLegacyLayoutGeometry,
  adaptSceneGeometry,
} from './GeometryService.js';
export { createRenderer, isSupported, Renderer } from '../renderer/index.js';
export { adaptScene3dToRenderer } from './rendererAdapter.js';
