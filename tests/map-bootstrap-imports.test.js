import test from 'node:test';
import assert from 'node:assert/strict';

test('map-bootstrap.js imports GeometryService and related functions', async () => {
  // This test verifies that map-bootstrap.js can successfully import
  // GeometryService, adaptSceneGeometry, and adaptLegacyLayoutGeometry
  // from map-runtime-fix.js
  
  // Import map-runtime-fix to verify the exports exist
  const { 
    MapRegistry, 
    convertLayoutToArea, 
    GeometryService, 
    adaptSceneGeometry, 
    adaptLegacyLayoutGeometry 
  } = await import('../docs/js/vendor/map-runtime-fix.js');

  // Verify all required exports are available
  assert.ok(MapRegistry, 'MapRegistry should be exported');
  assert.ok(convertLayoutToArea, 'convertLayoutToArea should be exported');
  assert.ok(GeometryService, 'GeometryService should be exported');
  assert.ok(adaptSceneGeometry, 'adaptSceneGeometry should be exported');
  assert.ok(adaptLegacyLayoutGeometry, 'adaptLegacyLayoutGeometry should be exported');

  // Verify types
  assert.equal(typeof MapRegistry, 'function', 'MapRegistry should be a class/function');
  assert.equal(typeof convertLayoutToArea, 'function', 'convertLayoutToArea should be a function');
  assert.equal(typeof GeometryService, 'function', 'GeometryService should be a class/function');
  assert.equal(typeof adaptSceneGeometry, 'function', 'adaptSceneGeometry should be a function');
  assert.equal(typeof adaptLegacyLayoutGeometry, 'function', 'adaptLegacyLayoutGeometry should be a function');
});

test('GeometryService can be instantiated', async () => {
  // This test verifies that GeometryService can be instantiated
  // which is what map-bootstrap.js does in ensureGeometryService()
  
  const { GeometryService } = await import('../docs/js/vendor/map-runtime-fix.js');
  
  // The error was: ReferenceError: GeometryService is not defined
  // This test would fail if GeometryService is not properly exported
  assert.doesNotThrow(() => {
    const service = new GeometryService({ logger: console });
    assert.ok(service, 'GeometryService instance should be created');
  }, 'Should be able to instantiate GeometryService');
});

test('adaptSceneGeometry and adaptLegacyLayoutGeometry are callable', async () => {
  // Verify the adapter functions work
  const { adaptSceneGeometry, adaptLegacyLayoutGeometry } = await import('../docs/js/vendor/map-runtime-fix.js');
  
  assert.doesNotThrow(() => {
    const sceneResult = adaptSceneGeometry({});
    assert.ok(sceneResult, 'adaptSceneGeometry should return a result');
  }, 'adaptSceneGeometry should be callable');

  assert.doesNotThrow(() => {
    const legacyResult = adaptLegacyLayoutGeometry({});
    assert.ok(legacyResult, 'adaptLegacyLayoutGeometry should return a result');
  }, 'adaptLegacyLayoutGeometry should be callable');
});
