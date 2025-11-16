import test from 'node:test';
import assert from 'node:assert/strict';

import { convertLayoutToArea, convertLayouts } from '../../src/map/builderConversion.js';

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
      { id: 2, prefabId: 'rock', layerId: 'game', slot: 1, nudgeX: -5, scaleX: 0.9, offsetY: 5, tags: ['spawn:player'] },
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
  assert.deepEqual(area.instances[1].tags, ['spawn:player']);
  assert.equal(area.instances[0].instanceId, '1');
  assert.equal(area.instances[1].instanceId, 'player_spawn');
  assert.equal(area.instances[1].meta.identity.instanceId, 'player_spawn');
  assert.equal(area.instances[1].meta.identity.source, 'tag:spawn:player');
  assert.ok(area.instancesById);
  assert.strictEqual(area.instancesById['1'], area.instances[0]);
  assert.strictEqual(area.instancesById.player_spawn, area.instances[1]);
});

test('convertLayoutToArea tolerates missing arrays', () => {
  const area = convertLayoutToArea({ id: 'fallback' });
  assert.equal(area.layers.length, 0);
  assert.equal(area.instances.length, 0);
  assert.ok(area.warnings.length > 0);
});

test('convertLayoutToArea normalizes area descriptors', () => {
  const areaDescriptor = {
    id: 'existing_area',
    name: 'Existing',
    camera: { startX: 50, startZoom: 1.25 },
    ground: { offset: 160 },
    layers: [
      { id: 'layerA', name: 'Layer A', parallaxSpeed: 0.5, offsetY: -20, separation: 200, meta: { author: 'tool' } },
    ],
    instances: [
      {
        id: 10,
        prefabId: 'spawn_player',
        layerId: 'layerA',
        prefab: { id: 'spawn_player', parts: [] },
        position: { x: 120, y: -10 },
        scale: { x: 1, y: 1 },
        rotationDeg: 5,
        locked: true,
        tags: ['spawn:player'],
        meta: { original: { slot: 0 } },
      },
    ],
    meta: { revision: 2 },
  };

  const area = convertLayoutToArea(areaDescriptor);
  assert.equal(area.id, 'existing_area');
  assert.equal(area.layers[0].parallaxSpeed, 0.5);
  assert.equal(area.instances[0].position.x, 120);
  assert.deepEqual(area.instances[0].tags, ['spawn:player']);
  assert.equal(area.instances[0].instanceId, 'player_spawn');
  assert.equal(area.instances[0].meta.identity.instanceId, 'player_spawn');
  assert.equal(area.instances[0].meta.identity.source, 'tag:spawn:player');
  assert.strictEqual(area.instancesById.player_spawn, area.instances[0]);
  assert.deepEqual(area.meta, { revision: 2 });
  assert.equal(area.warnings.length, 0);
});

test('convertLayoutToArea generates fallback prefab art when prefab is missing', () => {
  const layout = {
    areaId: 'prefab_fallback',
    layers: [
      { id: 'layerA', name: 'Layer A', parallax: 1, yOffset: 0, sep: 160, scale: 1 },
    ],
    instances: [
      { id: 42, prefabId: 'missing_prefab', layerId: 'layerA', slot: 0, nudgeX: 0 },
    ],
  };

  const prefabResolver = () => null;
  const prefabErrorLookup = new Map([
    ['missing_prefab', { code: 'E404', message: 'Prefab file missing' }],
  ]);

  const area = convertLayoutToArea(layout, { prefabResolver, prefabErrorLookup });

  assert.equal(area.instances.length, 1);
  const inst = area.instances[0];
  assert.equal(inst.instanceId, '42');
  assert.strictEqual(area.instancesById['42'], inst);
  assert.equal(inst.meta.identity.instanceId, '42');
  assert.equal(inst.prefabId, 'missing_prefab');
  assert.ok(inst.prefab);
  assert.equal(inst.prefab.id, 'missing_prefab');
  assert.equal(inst.prefab.isFallback, true);
  assert.ok(typeof inst.prefab.asciiArt === 'string');
  assert.match(inst.prefab.asciiArt, /Code: E404/);
  assert.ok(inst.meta?.fallback);
  assert.equal(inst.meta.fallback.prefabId, 'missing_prefab');
  assert.equal(inst.meta.fallback.errorCode, 'E404');
  assert.ok(Array.isArray(area.warnings));
  assert.ok(area.warnings.some((line) => line.includes('generated ASCII fallback')));
});

test('convertLayoutToArea falls back to layout.props when instances are missing', () => {
  const layout = {
    areaId: 'props_area',
    layers: [
      { id: 'bg', name: 'Background', parallax: 1, yOffset: 0, sep: 100, scale: 1 },
    ],
    props: [
      { id: 'only', prefabId: 'tree', layerId: 'bg', slot: 0, tags: ['spawn:player'] },
    ],
  };
  const prefabResolver = (prefabId) => ({ id: prefabId, kind: 'decor' });

  const area = convertLayoutToArea(layout, { prefabResolver });

  assert.equal(area.instances.length, 1);
  assert.equal(area.instances[0].prefab.id, 'tree');
  assert.equal(area.instances[0].instanceId, 'player_spawn');
  assert.ok(area.warnings.some((line) => line.includes('using layout.props')));
});

test('convertLayoutToArea warns when prefabResolver option is invalid', () => {
  const layout = {
    areaId: 'invalid_resolver',
    layers: [
      { id: 'game', name: 'Game', parallax: 1, yOffset: 0, sep: 150, scale: 1 },
    ],
    instances: [
      { id: 'missing', prefabId: 'unknown', layerId: 'game', slot: 0 },
    ],
  };

  const area = convertLayoutToArea(layout, { prefabResolver: { bad: true } });

  assert.equal(area.instances[0].prefab.id, 'unknown');
  assert.equal(area.instances[0].prefab.isFallback, true);
  assert.ok(area.warnings.some((line) => line.includes('prefabResolver must be a function')));
});

test('convertLayoutToArea preserves collider types', () => {
  const layout = {
    areaId: 'collider_area',
    layers: [
      { id: 'game', name: 'Game', parallax: 1, yOffset: 0, sep: 150, scale: 1 },
    ],
    instances: [],
    colliders: [
      { id: 'circle_one', type: 'circle', left: 0, width: 20, topOffset: 10, height: 20 },
      { id: 'polygon_one', shape: 'polygon', left: 5, width: 40, topOffset: 5, height: 40 },
    ],
  };

  const area = convertLayoutToArea(layout);

  assert.equal(area.colliders[0].type, 'circle');
  assert.equal(area.colliders[1].type, 'polygon');
});

test('convertLayouts rejects duplicate area ids', () => {
  const layoutA = { areaId: 'dup', layers: [], instances: [] };
  const layoutB = { areaId: 'dup', layers: [], instances: [] };

  assert.throws(() => convertLayouts([layoutA, layoutB]), /Duplicate area id/);
});
