import assert from 'node:assert';
import test from 'node:test';

import { convertLayoutToArea } from '../../docs/js/vendor/map-runtime.js';

test('convertLayoutToArea exposes normalized map entities on area.entities', () => {
  const layout = {
    id: 'holster-test',
    entities: [
      { id: 'holster-1', type: 'spriteholster', x: 12, y: 18 },
      { id: 'patrol-1', type: 'patrolpoint', x: 0, y: 0 },
    ],
  };

  const area = convertLayoutToArea(layout);

  assert.ok(Array.isArray(area.entities), 'entities should be an array');
  assert.equal(area.entities.length, 2, 'entities should include map entity entries');
  assert.strictEqual(area.entities, area.mapEntities, 'mapEntities and entities should share the normalized list');
  assert.equal(area.entities[0].kind, 'spriteholster');
  assert.equal(area.entities[0].type, 'spriteholster');
});

test('area descriptor normalization preserves map entities for consumers', () => {
  const descriptor = {
    id: 'descriptor-test',
    layers: [{ id: 'layer-1', parallaxSpeed: 1 }],
    instances: [],
    colliders: [{ id: 'col-1', left: 0, width: 10, topOffset: 0, height: 10 }],
    playableBounds: { left: -50, right: 50 },
    entities: [{ id: 'holster-2', type: 'spriteholster', x: 5, y: 5 }],
  };

  const area = convertLayoutToArea(descriptor);

  assert.ok(Array.isArray(area.entities));
  assert.equal(area.entities.length, 1);
  assert.equal(area.entities[0].kind, 'spriteholster');
  assert.equal(area.entities[0].type, 'spriteholster');
});

test('area descriptors derive spawners, targets, and props from map entities', () => {
  const descriptor = {
    id: 'descriptor-entities',
    camera: { startX: 0, startZoom: 1 },
    ground: { offset: 0 },
    layers: [{ id: 'layer-1', parallaxSpeed: 1 }],
    instances: [],
    colliders: [{ id: 'ground', left: -10, width: 20, topOffset: 0, height: 5, meta: { ground: true } }],
    playableBounds: { left: -10, right: 10 },
    entities: [
      { id: 'group-1', type: 'groupspawner', x: 5, y: 0, meta: { groupId: 'guards', spawnRadius: 10 } },
      { id: 'patrol-1', type: 'patrolpoint', x: 2, y: 1, meta: { routeId: 'route-a', sequence: 2 } },
      { id: 'door-1', type: 'door', x: 0, y: 0, meta: { scale: { x: 1, y: 1 } } },
      { id: 'props-1', type: 'propspawn', x: 3, y: 4, meta: { props: [{ id: 'apple', weight: 2 }] } },
    ],
  };

  const area = convertLayoutToArea(descriptor);

  assert.deepStrictEqual(area.spawners.map((s) => s.spawnerId), ['group-1']);
  assert.equal(area.pathTargets.length, 1);
  assert.equal(area.pathTargets[0].name, 'route-a');
  assert.equal(area.doors.length, 1);
  assert.equal(area.propSpawns.length, 1);
});
