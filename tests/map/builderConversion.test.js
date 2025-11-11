import test from 'node:test';
import assert from 'node:assert/strict';

import { convertLayoutToArea } from '../../src/map/builderConversion.js';

test('convertLayoutToArea produces modular descriptor', () => {
  const layout = {
    areaId: 'test_area',
    areaName: 'Test Area',
    cameraStartX: 120,
    zoomStart: 1.1,
    groundOffset: 150,
    layers: [
      { id: 'bg', name: 'Background', type: 'parallax', parallax: 0.3, yOffset: -100, sep: 200, scale: 0.8 },
      { id: 'game', name: 'Gameplay', type: 'gameplay', parallax: 1, yOffset: 0, sep: 180, scale: 1 },
    ],
    instances: [
      { id: 1, prefabId: 'tree', layerId: 'bg', slot: 0, nudgeX: 10, scaleX: 1.2, scaleY: 1.1, offsetY: 15, rot: 10 },
      { id: 2, prefabId: 'rock', layerId: 'game', slot: 1, nudgeX: -5, scaleX: 0.9, offsetY: 5 },
    ],
  };

  const prefabResolver = (prefabId) => ({ id: prefabId, parts: [] });

  const area = convertLayoutToArea(layout, { prefabResolver });

  assert.equal(area.id, 'test_area');
  assert.equal(area.name, 'Test Area');
  assert.deepEqual(area.camera, { startX: 120, startZoom: 1.1 });
  assert.deepEqual(area.ground, { offset: 150 });
  assert.equal(area.layers.length, 2);
  assert.equal(area.instances.length, 2);
  assert.equal(area.instances[0].prefab.id, 'tree');
  assert.equal(area.instances[0].position.y, -15);
  assert.equal(area.instances[1].scale.x, 0.9);
});

test('convertLayoutToArea tolerates missing arrays', () => {
  const area = convertLayoutToArea({ id: 'fallback' });
  assert.equal(area.layers.length, 0);
  assert.equal(area.instances.length, 0);
  assert.ok(area.warnings.length > 0);
});
