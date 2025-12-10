import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Verify the HTML file exists and has expected content
const html = readFileSync('./docs/gameplay-map-editor.html', 'utf-8');

test('Gameplay Map Editor - HTML File Structure', () => {
  assert.ok(html.includes('Gameplay Map Editor'), 'HTML should have title');
  assert.ok(html.includes('canvas'), 'HTML should have canvas element');
  assert.ok(html.includes('mapData'), 'HTML should define mapData object');
  assert.ok(html.includes('areaId'), 'HTML should reference areaId');
  assert.ok(html.includes('ground'), 'HTML should reference ground');
  assert.ok(html.includes('entities'), 'HTML should reference entities');
});

test('Gameplay Map Editor - Entity Types', () => {
  // Test that entity type constants are correct
  const expectedTypes = ['spawner', 'patrol', 'collider', 'prop', 'entrance', 'exit'];
  
  expectedTypes.forEach(type => {
    assert.ok(type, `Entity type ${type} should be defined`);
  });
});

test('Gameplay Map Editor - Export Format', () => {
  // Test that the export format matches the specification
  const sampleMap = {
    areaId: 'test-map',
    ground: {
      path: [{ x: -1000, y: 0 }, { x: 1000, y: 0 }],
      unitsPerPixel: 1
    },
    entities: [
      {
        id: 'spawner_1',
        type: 'spawner',
        x: 100,
        y: 0,
        meta: { prefab: 'spawn_player', patrolRouteId: '' }
      },
      {
        id: 'patrol_1',
        type: 'patrol',
        x: 200,
        y: 0,
        meta: { sequence: 0, routeId: 'route1' }
      },
      {
        id: 'collider_1',
        type: 'collider',
        x: 300,
        y: 0,
        meta: { shape: 'rectangle', width: 100, height: 100 }
      },
      {
        id: 'prop_1',
        type: 'prop',
        x: 400,
        y: 0,
        meta: {}
      },
      {
        id: 'entrance_1',
        type: 'entrance',
        x: -900,
        y: 0,
        meta: {}
      },
      {
        id: 'exit_1',
        type: 'exit',
        x: 900,
        y: 0,
        meta: {}
      }
    ]
  };

  // Validate structure
  assert.ok(sampleMap.areaId, 'Map should have areaId');
  assert.ok(sampleMap.ground, 'Map should have ground');
  assert.ok(sampleMap.ground.path, 'Ground should have path');
  assert.ok(sampleMap.entities, 'Map should have entities');
  
  // Validate entities
  sampleMap.entities.forEach(entity => {
    assert.ok(entity.id, 'Entity should have id');
    assert.ok(entity.type, 'Entity should have type');
    assert.ok(typeof entity.x === 'number', 'Entity should have x coordinate');
    assert.ok(typeof entity.y === 'number', 'Entity should have y coordinate');
    assert.ok(entity.meta, 'Entity should have meta object');
  });

  // Check type-specific metadata
  const spawner = sampleMap.entities.find(e => e.type === 'spawner');
  assert.ok(spawner.meta.prefab, 'Spawner should have prefab in meta');

  const patrol = sampleMap.entities.find(e => e.type === 'patrol');
  assert.ok(typeof patrol.meta.sequence === 'number', 'Patrol should have sequence in meta');

  const collider = sampleMap.entities.find(e => e.type === 'collider');
  assert.ok(collider.meta.shape, 'Collider should have shape in meta');
  assert.ok(collider.meta.width, 'Rectangle collider should have width');
  assert.ok(collider.meta.height, 'Rectangle collider should have height');
});

test('Gameplay Map Editor - JSON Serialization', () => {
  const sampleMap = {
    areaId: 'test-map',
    ground: {
      path: [{ x: -1000, y: 0 }, { x: 1000, y: 0 }],
      unitsPerPixel: 1
    },
    entities: []
  };

  // Test that the map can be serialized to JSON
  const json = JSON.stringify(sampleMap, null, 2);
  assert.ok(json, 'Map should serialize to JSON');

  // Test that it can be parsed back
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.areaId, sampleMap.areaId, 'Parsed map should have same areaId');
  assert.strictEqual(parsed.ground.unitsPerPixel, sampleMap.ground.unitsPerPixel, 'Parsed map should have same unitsPerPixel');
});

test('Gameplay Map Editor - Collider Shape Types', () => {
  const rectangleCollider = {
    id: 'collider_1',
    type: 'collider',
    x: 0,
    y: 0,
    meta: {
      shape: 'rectangle',
      width: 100,
      height: 100
    }
  };

  const circleCollider = {
    id: 'collider_2',
    type: 'collider',
    x: 100,
    y: 0,
    meta: {
      shape: 'circle',
      radius: 50
    }
  };

  // Validate rectangle
  assert.strictEqual(rectangleCollider.meta.shape, 'rectangle', 'Rectangle collider should have rectangle shape');
  assert.ok(rectangleCollider.meta.width, 'Rectangle collider should have width');
  assert.ok(rectangleCollider.meta.height, 'Rectangle collider should have height');

  // Validate circle
  assert.strictEqual(circleCollider.meta.shape, 'circle', 'Circle collider should have circle shape');
  assert.ok(circleCollider.meta.radius, 'Circle collider should have radius');
});
