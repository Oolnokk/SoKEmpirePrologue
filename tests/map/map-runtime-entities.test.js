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
