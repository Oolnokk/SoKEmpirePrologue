import test from 'node:test';
import assert from 'node:assert/strict';

import { normalizePrefabDefinition } from '../../docs/js/prefab-catalog.js';

test('normalizePrefabDefinition defaults to structure type and sanitizes tags', () => {
  const prefab = {
    structureId: 'Test Structure',
    tags: [' alpha ', 42, null, ''],
  };

  normalizePrefabDefinition(prefab);

  assert.equal(prefab.type, 'structure');
  assert.deepEqual(prefab.tags, ['alpha', '42']);
  assert.equal(prefab.obstruction, undefined);
});

test('normalizePrefabDefinition enforces obstruction metadata and planes', () => {
  const prefab = {
    structureId: 'Blocking Crate',
    type: 'Obstruction',
    tags: ['grippable', 'obstruction', 'grippable'],
    obstruction: {
      collision: {
        enabled: true,
        box: {
          width: '150',
          height: '-90',
          offsetX: '10',
          offsetY: '-5',
        },
      },
      physics: {
        enabled: true,
        dynamic: false,
        mass: '3.5',
        drag: '-1',
      },
    },
    parts: [
      { name: 'front', layer: 'custom', meta: { extra: true } },
      { name: 'back', layer: 'far' },
    ],
  };

  normalizePrefabDefinition(prefab);

  assert.equal(prefab.type, 'obstruction');
  assert.deepEqual(prefab.tags, ['grippable', 'obstruction']);
  assert.ok(prefab.obstruction);
  assert.equal(prefab.obstruction.planes.near.id, 'obstruction:near');
  assert.equal(prefab.obstruction.planes.far.id, 'obstruction:far');
  assert.ok(prefab.obstruction.planes.near.locked);
  assert.ok(prefab.obstruction.planes.far.locked);
  assert.ok(prefab.obstruction.collision.enabled);
  assert.equal(prefab.obstruction.collision.box.width, 150);
  assert.equal(prefab.obstruction.collision.box.height, 90);
  assert.equal(prefab.obstruction.collision.box.offsetX, 10);
  assert.equal(prefab.obstruction.collision.box.offsetY, -5);
  assert.ok(prefab.obstruction.physics.enabled);
  assert.equal(prefab.obstruction.physics.dynamic, false);
  assert.equal(prefab.obstruction.physics.mass, null);
  assert.equal(prefab.obstruction.physics.drag, null);
  assert.equal(prefab.parts[0].layer, 'near');
  assert.equal(prefab.parts[0].meta.obstruction.plane, 'near');
  assert.equal(prefab.parts[0].meta.obstruction.renderLayer, 'obstruction:near');
  assert.equal(prefab.parts[1].layer, 'far');
  assert.equal(prefab.parts[1].meta.obstruction.renderLayer, 'obstruction:far');
});
