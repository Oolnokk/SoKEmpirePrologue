import test from 'node:test';
import assert from 'node:assert/strict';

import { MapRegistry, MapRegistryError } from '../../src/map/MapRegistry.js';
import { convertLayoutToArea } from '../../src/map/builderConversion.js';

const SAMPLE_AREA = {
  name: 'Sample',
  layers: [],
  instances: [],
};

test('registers and retrieves areas', () => {
  const registry = new MapRegistry();
  registry.registerArea('sample', SAMPLE_AREA);
  assert.ok(registry.hasArea('sample'));
  assert.equal(registry.getActiveAreaId(), 'sample');
  assert.equal(registry.getArea('sample').name, 'Sample');
});

test('registerAreas validates entire batch before mutating registry', () => {
  const registry = new MapRegistry();
  assert.throws(() => registry.registerAreas({
    good: SAMPLE_AREA,
    bad: { name: 'Missing layers' },
  }), MapRegistryError);
  assert.equal(registry.hasArea('good'), false);
});

test('prevents invalid registrations', () => {
  const registry = new MapRegistry();
  assert.throws(() => registry.registerArea('', SAMPLE_AREA), MapRegistryError);
  assert.throws(() => registry.registerArea('bad', {}), MapRegistryError);
});

test('emits events and handles active area changes', () => {
  const events = [];
  const registry = new MapRegistry({ logger: { warn: () => {} } });
  registry.on('area-registered', (area) => events.push(['registered', area.id]));
  registry.on('active-area-changed', (area) => events.push(['active', area?.id ?? null]));
  registry.registerArea('a', SAMPLE_AREA);
  registry.registerArea('b', SAMPLE_AREA);
  registry.setActiveArea('b');
  registry.removeArea('b');
  assert.deepEqual(events, [
    ['registered', 'a'],
    ['active', 'a'],
    ['registered', 'b'],
    ['active', 'b'],
    ['active', 'a'],
  ]);
});

test('toJSON returns cloned descriptors', () => {
  const registry = new MapRegistry();
  registry.registerArea('sample', SAMPLE_AREA);
  const json = registry.toJSON();
  json.sample.name = 'Changed';
  assert.equal(registry.getArea('sample').name, 'Sample');
});


test('rejects duplicate instance identifiers', () => {
  const registry = new MapRegistry();
  const descriptor = {
    name: 'Duplicates',
    layers: [],
    instances: [
      { instanceId: 'player_spawn' },
      { instanceId: 'player_spawn' },
    ],
  };
  assert.throws(() => registry.registerArea('dup', descriptor), MapRegistryError);
});

test('getInstance resolves descriptors by instanceId', () => {
  const layout = {
    areaId: 'id_test',
    areaName: 'Id Test',
    layers: [
      { id: 'game', name: 'Gameplay', type: 'gameplay', parallax: 1, yOffset: 0, sep: 120, scale: 1 },
    ],
    instances: [
      { id: 'alpha', prefabId: 'spawn_player', layerId: 'game', slot: 0, tags: ['spawn:player'] },
      { id: 'beta', prefabId: 'spawn_npc', layerId: 'game', slot: 2, tags: ['spawn:npc'] },
    ],
  };
  const prefabResolver = (prefabId) => ({ id: prefabId, parts: [] });
  const descriptor = convertLayoutToArea(layout, { prefabResolver });
  const registry = new MapRegistry();
  registry.registerArea('id_test', descriptor);
  const player = registry.getInstance('id_test', 'player_spawn');
  assert.ok(player, 'player instance should exist');
  assert.equal(player.instanceId, 'player_spawn');
  assert.strictEqual(registry.getActiveInstance('player_spawn'), player);
  assert.equal(registry.getInstance('id_test', 'npc_spawn').instanceId, 'npc_spawn');
  assert.equal(registry.getInstance('missing', 'player_spawn'), null);
  assert.equal(registry.getInstance('id_test', 'unknown'), null);
});
