import test from 'node:test';
import assert from 'node:assert/strict';

import { MapRegistry, MapRegistryError } from '../../src/map/MapRegistry.js';

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
