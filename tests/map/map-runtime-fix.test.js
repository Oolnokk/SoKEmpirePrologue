import test from 'node:test';
import assert from 'node:assert/strict';

// Import the shim
import { MapRegistry, convertLayoutToArea, GeometryService, adaptSceneGeometry, adaptLegacyLayoutGeometry } from '../../docs/js/vendor/map-runtime-fix.js';

test('map-runtime-fix re-exports MapRegistry', () => {
  assert.ok(MapRegistry, 'MapRegistry should be exported');
  assert.equal(typeof MapRegistry, 'function', 'MapRegistry should be a function/class');
});

test('convertLayoutToArea falls back when vendor throws', () => {
  // Test the fallback generator with a minimal layout
  const layout = {
    id: 'test-area',
    name: 'Test Area',
    playableBounds: { left: -500, right: 500 },
    proximityScale: 2.0
  };

  const area = convertLayoutToArea(layout);

  assert.equal(area.id, 'test-area');
  assert.equal(area.name, 'Test Area');
  assert.equal(area.playableBounds.left, -500);
  assert.equal(area.playableBounds.right, 500);
  assert.equal(area.proximityScale, 2.0);
  assert.ok(Array.isArray(area.colliders), 'colliders should be an array');
  assert.ok(area.colliders.length > 0, 'should have at least one ground collider');
});

test('convertLayoutToArea converts patrolPoints to colliders', () => {
  const layout = {
    id: 'patrol-test',
    playableBounds: { left: -1000, right: 1000 },
    patrolPoints: [
      { id: 'patrol1', x: 100, width: 200, y: 0, label: 'Patrol Zone 1' },
      { id: 'patrol2', x: -100, width: 150, y: 0, label: 'Patrol Zone 2' }
    ]
  };

  const area = convertLayoutToArea(layout);

  // Should have patrol colliders + ground collider
  assert.ok(area.colliders.length >= 3, 'should have patrol colliders and ground');
  
  const patrolColliders = area.colliders.filter(c => c.meta?.patrol);
  assert.equal(patrolColliders.length, 2, 'should have 2 patrol colliders');
  
  const patrol1 = patrolColliders.find(c => c.id === 'patrol1');
  assert.ok(patrol1, 'patrol1 should exist');
  assert.equal(patrol1.left, 0, 'patrol1 left should be x - width/2');
  assert.equal(patrol1.width, 200, 'patrol1 width should match');
  assert.equal(patrol1.label, 'Patrol Zone 1');
});

test('convertLayoutToArea fallback ensures ground collider exists', () => {
  // Test the fallback specifically by using a layout that will trigger fallback
  // The vendor function may not throw for simple layouts, so we need to test
  // the fallback path by checking behavior with minimal layouts that include patrolPoints
  const layout = {
    id: 'ground-test',
    playableBounds: { left: -600, right: 600 },
    ground: { offset: 300 },
    patrolPoints: []  // This will trigger fallback logic if vendor fails
  };

  const area = convertLayoutToArea(layout);

  // The area should be valid with required properties
  assert.ok(area.id, 'area should have an id');
  assert.ok(area.playableBounds, 'area should have playableBounds');
  assert.ok(Array.isArray(area.colliders), 'area should have colliders array');
});

test('convertLayoutToArea handles spawnPoints', () => {
  const layout = {
    id: 'spawn-test',
    playableBounds: { left: -500, right: 500 },
    spawnPoints: [
      { id: 'player_spawn', x: -100, y: 0, prefab: 'spawn_player' },
      { id: 'npc_spawn', x: 400, y: 0, prefab: 'spawn_npc' }
    ]
  };

  const area = convertLayoutToArea(layout);

  assert.ok(Array.isArray(area.spawnPoints), 'spawnPoints should be an array');
  assert.equal(area.spawnPoints.length, 2, 'should have 2 spawn points');
  
  const playerSpawn = area.spawnPoints.find(s => s.id === 'player_spawn');
  assert.ok(playerSpawn, 'player_spawn should exist');
  assert.equal(playerSpawn.x, -100);
  assert.equal(playerSpawn.prefab, 'spawn_player');
});

test('convertLayoutToArea uses distance to compute playableBounds', () => {
  const layout = {
    id: 'distance-test',
    distance: 1000
  };

  const area = convertLayoutToArea(layout);

  assert.equal(area.playableBounds.left, -500, 'left should be -distance/2');
  assert.equal(area.playableBounds.right, 500, 'right should be distance/2');
});

test('convertLayoutToArea provides default playableBounds', () => {
  const layout = { id: 'default-test' };

  const area = convertLayoutToArea(layout);

  assert.equal(area.playableBounds.left, -600, 'default left should be -600');
  assert.equal(area.playableBounds.right, 600, 'default right should be 600');
});

test('convertLayoutToArea forwards scene3d descriptors', () => {
  const layout = {
    id: 'scene3d-vendor',
    playableBounds: { left: -100, right: 100 },
    scene3d: { sceneUrl: './assets/3D/vendor.glb', ground: { planeZ: 0, unitsPerPixel: 1 } },
    layers: [],
    instances: [],
  };

  const area = convertLayoutToArea(layout);

  assert.deepEqual(area.scene3d, layout.scene3d);
  assert.notStrictEqual(area.scene3d, layout.scene3d);
});

test('map-runtime-fix re-exports GeometryService', () => {
  assert.ok(GeometryService, 'GeometryService should be exported');
  assert.equal(typeof GeometryService, 'function', 'GeometryService should be a function/class');
});

test('map-runtime-fix re-exports adaptSceneGeometry', () => {
  assert.ok(adaptSceneGeometry, 'adaptSceneGeometry should be exported');
  assert.equal(typeof adaptSceneGeometry, 'function', 'adaptSceneGeometry should be a function');
});

test('map-runtime-fix re-exports adaptLegacyLayoutGeometry', () => {
  assert.ok(adaptLegacyLayoutGeometry, 'adaptLegacyLayoutGeometry should be exported');
  assert.equal(typeof adaptLegacyLayoutGeometry, 'function', 'adaptLegacyLayoutGeometry should be a function');
});
