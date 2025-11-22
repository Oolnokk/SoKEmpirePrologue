// Re-export the runtime map helpers directly from the source module so the
// docs (editor, previews) always share the same implementation as the game.
export { MapRegistry, MapRegistryError } from '../../../src/map/MapRegistry.js';
export { convertLayoutToArea, convertLayouts } from '../../../src/map/builderConversion.js';
export { mapBuilderConfig, loadMapBuilderConfig, getDefaultMapBuilderConfig } from '../../../src/map/mapBuilderConfig.js';

// Preserve the default export for legacy consumers.
export { default } from '../../../src/map/MapRegistry.js';
