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

test('convertLayoutToArea normalizes npc spawners from instances and explicit lists', () => {
  const layout = {
    areaId: 'spawner_area',
    layers: [
      { id: 'game', name: 'Game', parallax: 1, yOffset: 0, sep: 120, scale: 1, type: 'gameplay' },
    ],
    instances: [
      {
        id: 'npc_source',
        prefabId: 'npc_spawner',
        layerId: 'game',
        slot: 0,
        tags: ['spawner:npc'],
        meta: { spawner: { count: 3, respawn: true, spawnRadius: 40, templateId: 'watchman' } },
      },
    ],
    spawners: [
      {
        spawnerId: 'manual_spawner',
        type: 'npc',
        position: { x: 12, y: -4 },
        count: 2,
        respawn: false,
        spawnRadius: 8,
        characterId: 'sentinel',
      },
    ],
  };

  const area = convertLayoutToArea(layout, { prefabResolver: (id) => ({ id }) });

  assert.equal(area.spawners.length, 2);
  const manual = area.spawners.find((s) => s.spawnerId === 'manual_spawner');
  const derived = area.spawners.find((s) => s.spawnerId !== 'manual_spawner');
  assert.ok(manual);
  assert.ok(derived);
  assert.equal(manual.position.x, 12);
  assert.equal(manual.spawnRadius, 8);
  assert.equal(manual.count, 2);
  assert.equal(manual.respawn, false);
  assert.equal(manual.characterId, 'sentinel');
  assert.equal(derived.count, 3);
  assert.equal(derived.respawn, true);
  assert.equal(derived.spawnRadius, 40);
  assert.equal(derived.templateId, 'watchman');
  assert.ok(area.spawnersById.manual_spawner);
  assert.strictEqual(area.spawnersById[manual.spawnerId], manual);
});

test('convertLayoutToArea attaches reusable group library records', () => {
  const layout = {
    areaId: 'group_area',
    layers: [
      { id: 'game', name: 'Game', parallax: 1, yOffset: 0, sep: 120, scale: 1, type: 'gameplay' },
    ],
    spawners: [
      {
        spawnerId: 'party',
        type: 'npc',
        position: { x: 0, y: 0 },
        groupId: 'city_guard_patrol',
      },
    ],
  };

  const groupLibrary = {
    city_guard_patrol: {
      name: 'Guard Patrol',
      interests: ['patrol point'],
      members: [{ templateId: 'guard', count: 2 }],
      exitTags: ['map-exit:right'],
    },
  };

  const area = convertLayoutToArea(layout, { prefabResolver: (id) => ({ id }), groupLibrary });

  const spawner = area.spawners.find((s) => s.spawnerId === 'party');
  assert.ok(spawner);
  assert.equal(spawner.groupId, 'city_guard_patrol');
  assert.ok(spawner.group);
  assert.equal(spawner.group.members[0].templateId, 'guard');
  assert.equal(spawner.group.members[0].count, 2);
  assert.deepEqual(area.groupLibrary.city_guard_patrol.interests, ['patrol point']);
});

test('convertLayoutToArea collects gameplay path targets and respects ordering', () => {
  const layout = {
    areaId: 'path_area',
    layers: [
      { id: 'bg', name: 'BG', parallax: 0.5, yOffset: 0, sep: 100, scale: 1, type: 'parallax' },
      { id: 'game', name: 'Game', parallax: 1, yOffset: 0, sep: 120, scale: 1, type: 'gameplay' },
    ],
    instances: [
      { id: 'skip', prefabId: 'tree', layerId: 'bg', slot: 0, tags: ['path:target:ignored'] },
      { id: 'a1', prefabId: 'marker', layerId: 'game', slot: 0, tags: ['path:target:alpha:2'] },
      { id: 'a2', prefabId: 'marker', layerId: 'game', slot: 1, tags: ['path:target:alpha:1'], meta: { pathTarget: { order: 10 } } },
      { id: 'plain', prefabId: 'rock', layerId: 'game', slot: 2 },
    ],
  };

  const area = convertLayoutToArea(layout, { prefabResolver: (id) => ({ id }) });

  assert.equal(area.pathTargets.length, 3);
  const ignored = area.pathTargets.find((pt) => pt.name === 'ignored');
  const alphaTargets = area.pathTargets.filter((pt) => pt.name === 'alpha');
  assert.ok(ignored);
  assert.equal(alphaTargets.length, 2);
  assert.ok(alphaTargets.some((pt) => pt.order === 2));
  assert.ok(alphaTargets.some((pt) => pt.order === 10));
  assert.ok(area.instancesById[ignored.instanceId]);
  assert.ok(area.instancesById[alphaTargets[0].instanceId]);
  assert.ok(area.pathTargetsById[alphaTargets[0].registryId]);
  const coordinateKeys = Object.keys(area.pathTargetsByCoordinate);
  assert.ok(coordinateKeys.length > 0);
  assert.ok(!area.warnings.some((line) => line.includes('Ignoring path target')));
});

test('convertLayoutToArea merges explicit path targets with derived markers', () => {
  const layout = {
    areaId: 'path_merge',
    layers: [
      { id: 'game', name: 'Game', parallax: 1, yOffset: 0, sep: 120, scale: 1, type: 'gameplay' },
    ],
    instances: [
      { id: 'alpha_inst', prefabId: 'marker', layerId: 'game', slot: 0, tags: ['path:target:alpha:1'] },
      { id: 'charlie_inst', prefabId: 'marker', layerId: 'game', slot: 1, tags: ['path:target:charlie:5'] },
    ],
    pathTargets: [
      { name: 'alpha', instanceId: 'alpha_inst', order: 99, position: { x: 5, y: -3 } },
      { id: 'bravo', order: 2, layerId: 'game', position: { x: 10, y: -2 } },
    ],
  };

  const area = convertLayoutToArea(layout, { prefabResolver: (id) => ({ id }) });

  assert.equal(area.pathTargets.length, 4);
  const alphaTargets = area.pathTargets.filter((pt) => pt.name === 'alpha');
  const bravo = area.pathTargets.find((pt) => pt.name === 'bravo');
  const charlie = area.pathTargets.find((pt) => pt.name === 'charlie');
  assert.equal(alphaTargets.length, 2);
  assert.ok(bravo);
  assert.ok(charlie);
  assert.ok(alphaTargets.some((pt) => pt.order === 99));
  assert.ok(alphaTargets.some((pt) => pt.order === 1));
  assert.equal(bravo.order, 2);
  assert.equal(charlie.order, 5);
  const explicitAlpha = alphaTargets.find((pt) => pt.order === 99);
  assert.equal(explicitAlpha.world.x, 5);
  assert.equal(explicitAlpha.world.y, -3);
  assert.ok(area.pathTargetsById[bravo.registryId]);
  assert.ok(area.pathTargetsByCoordinate['5,-3'].some((pt) => pt.registryId === explicitAlpha.registryId));
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
  assert.deepEqual(area.meta, { revision: 2, proximityScale: 1 });
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

test('convertLayoutToArea keeps instance transforms in editor space while honoring proximity depth', () => {
  const layout = {
    areaId: 'proximity_area',
    proximityScale: 1.5,
    layers: [
      { id: 'game', name: 'Game', parallax: 1, yOffset: 0, sep: 150, scale: 1 },
    ],
    instances: [
      { id: 'close', prefabId: 'tree', layerId: 'game', x: 4, offsetY: 0, scaleX: 1 },
      { id: 'far', prefabId: 'rock', layerId: 'game', x: 10, offsetY: 0, scaleX: 1, tags: ['spawn:player'] },
    ],
  };

  const area = convertLayoutToArea(layout, { prefabResolver: (id) => ({ id, parts: [] }) });

  assert.equal(area.proximityScale, 1.5);
  assert.equal(area.meta.proximityScale, 1.5);
  const [closeInst, farInst] = area.instances;
  assert.equal(closeInst.scale.x, 1);
  assert.equal(closeInst.position.x, 4);
  assert.equal(closeInst.meta.proximityScale.mode, 'zoom');
  assert.equal(closeInst.meta.proximityScale.applied, 1);
  assert.equal(closeInst.meta.proximityScale.inherited, 1);
  assert.equal(farInst.scale.x, 1); // player spawn tags remain unscaled
  assert.equal(farInst.position.x, 10);
  assert.ok(closeInst.intraLayerDepth > farInst.intraLayerDepth);
});

test('convertLayoutToArea does not bake proximity scale into transforms when NPC data is present', () => {
  const layout = {
    areaId: 'npc_scale_guard',
    proximityScale: 3.1,
    layers: [
      { id: 'gameplay', name: 'Gameplay', parallax: 1, yOffset: 0, sep: 200, scale: 1 },
    ],
    instances: [
      { id: 'tower', prefabId: 'tower_commercial', layerId: 'gameplay', x: -780, offsetY: 0, scaleX: 1.0226, scaleY: 1.0465 },
      { id: 'spawn-player', prefabId: 'spawn_player', layerId: 'gameplay', x: 0, offsetY: 0, scaleX: 1 },
      { id: 'spawn-npc', prefabId: 'spawn_npc', layerId: 'gameplay', x: 10, offsetY: 0, scaleX: 1 },
    ],
    spawners: [
      { spawnerId: 'npc_spawner', prefabId: 'spawn_npc', position: { x: 5, y: 5 } },
    ],
    pathTargets: [
      { id: 'npc_target', position: { x: 12, y: -6 } },
    ],
  };

  const area = convertLayoutToArea(layout, { prefabResolver: (id) => ({ id, parts: [] }) });

  const tower = area.instances.find((inst) => inst.id === 'tower');
  assert.ok(tower, 'tower instance should exist');
  assert.ok(Math.abs(tower.position.x - (-780)) < 0.0001);
  assert.ok(Math.abs(tower.scale.x - 1.0226) < 0.0001);
  assert.ok(Math.abs(tower.scale.y - 1.0465) < 0.0001);
  assert.equal(tower.meta.proximityScale.applied, 1);
  assert.equal(tower.meta.proximityScale.inherited, 1);

  // Ensure NPC-related exports still exist
  assert.ok(Array.isArray(area.spawners));
  assert.ok(area.spawners.some((spawner) => spawner.spawnerId === 'npc_spawner'));
  assert.ok(Array.isArray(area.pathTargets));
  assert.ok(area.pathTargets.some((target) => target.name === 'npc_target'));
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
      { id: 'circle_one', type: 'circle', left: 0, width: 20, topOffset: 10, height: 20, materialType: 'metal' },
      { id: 'polygon_one', shape: 'polygon', left: 5, width: 40, topOffset: 5, height: 40, meta: { materialType: 'glass' } },
      { id: 'legacy_box', type: 'box', left: 10, width: 30, topOffset: 0, height: 30, stepSound: 'ceramic' },
    ],
  };

  const area = convertLayoutToArea(layout);

  assert.equal(area.colliders[0].type, 'circle');
  assert.equal(area.colliders[1].type, 'polygon');
  assert.equal(area.colliders[2].type, 'box');
  assert.equal(area.colliders[0].materialType, 'metal');
  assert.equal(area.colliders[1].materialType, 'glass');
  assert.equal(area.colliders[2].materialType, 'ceramic');
});

test('convertLayoutToArea normalizes playable bounds and falls back to colliders', () => {
  const layout = {
    areaId: 'playable_bounds_area',
    layers: [],
    instances: [],
    playableBounds: { left: -320, right: 840 },
  };

  const withExplicitBounds = convertLayoutToArea(layout);
  assert.deepEqual(withExplicitBounds.playableBounds, { left: -320, right: 840, source: 'layout' });

  const fallbackLayout = {
    areaId: 'playable_bounds_fallback',
    layers: [],
    instances: [],
    colliders: [
      { id: 'ground', left: -100, width: 600, topOffset: 0, height: 40 },
    ],
  };

  const withFallback = convertLayoutToArea(fallbackLayout);
  assert.deepEqual(withFallback.playableBounds, { left: -100, right: 500, source: 'colliders' });
});

test('convertLayoutToArea does not align colliders when playable bounds are derived from them', () => {
  const layout = {
    areaId: 'collider_bounds_no_align',
    layers: [],
    instances: [],
    colliders: [
      { id: 'left_platform', left: -150, width: 80, topOffset: 0, height: 30 },
      { id: 'right_platform', left: 200, width: 120, topOffset: 0, height: 30 },
    ],
  };

  const area = convertLayoutToArea(layout);

  assert.equal(area.playableBounds.source, 'colliders');
  assert.deepEqual(
    area.colliders.map(({ id, left, width }) => ({ id, left, width })),
    [
      { id: 'left_platform', left: -150, width: 80 },
      { id: 'right_platform', left: 200, width: 120 },
    ],
  );
});

test('convertLayoutToArea stretches platform colliders to playable bounds width', () => {
  const layout = {
    areaId: 'aligned_colliders',
    layers: [],
    instances: [],
    playableBounds: { left: -200, right: 300 },
    colliders: [
      { id: 'narrow_floor', left: -50, width: 100, topOffset: 0, height: 40 },
      { id: 'opt_out', left: -30, width: 60, topOffset: 0, height: 30, meta: { autoAlignPlayableBounds: false } },
    ],
  };

  const area = convertLayoutToArea(layout);

  assert.equal(area.colliders[0].left, -200);
  assert.equal(area.colliders[0].width, 500);
  assert.equal(area.colliders[1].left, -30);
  assert.equal(area.colliders[1].width, 60);
});

test('convertLayouts rejects duplicate area ids', () => {
  const layoutA = { areaId: 'dup', layers: [], instances: [] };
  const layoutB = { areaId: 'dup', layers: [], instances: [] };

  assert.throws(() => convertLayouts([layoutA, layoutB]), /Duplicate area id/);
});

test('convertLayoutToArea exposes tilers from layout data and collider metadata', () => {
  const layout = {
    areaId: 'tiler_area',
    layers: [
      { id: 'game', name: 'Gameplay', type: 'gameplay', parallax: 1, yOffset: 0, sep: 100, scale: 1 },
    ],
    instances: [],
    tilers: [
      {
        id: 'explicit_tiler',
        layerId: 'game',
        left: 0,
        top: -10,
        width: 128,
        height: 32,
        textureId: 'brick_wall',
        tileWidth: 32,
        tileHeight: 16,
        offsetX: 4,
      },
    ],
    colliders: [
      {
        id: 'ground_strip',
        left: -64,
        width: 256,
        topOffset: 0,
        height: 48,
        meta: {
          tiler: {
            textureId: 'asphalt',
            tileWidth: 64,
            tileHeight: 32,
            offsetY: -2,
          },
        },
      },
      {
        id: 'plain',
        left: 0,
        width: 10,
        topOffset: 0,
        height: 10,
      },
    ],
  };

  const area = convertLayoutToArea(layout);

  assert.ok(Array.isArray(area.tilers));
  assert.equal(area.tilers.length, 2);
  const explicit = area.tilers.find((t) => t.id === 'explicit_tiler');
  assert.ok(explicit);
  assert.equal(explicit.textureId, 'brick_wall');
  assert.equal(explicit.layerId, 'game');
  assert.deepEqual(explicit.area, { left: 0, top: -10, width: 128, height: 32 });
  assert.deepEqual(explicit.tileSize, { width: 32, height: 16 });
  assert.deepEqual(explicit.offset, { x: 4, y: 0 });
  const derived = area.tilers.find((t) => t.sourceColliderId === 'ground_strip');
  assert.ok(derived, 'derived tiler should reference collider id');
  assert.equal(derived.textureId, 'asphalt');
  assert.deepEqual(derived.area, { left: -64, top: 0, width: 256, height: 48 });
  assert.deepEqual(derived.tileSize, { width: 64, height: 32 });
  assert.equal(derived.offset.y, -2);
  assert.equal(area.colliders.length, 2);
});

test('normalizeAreaDescriptor keeps pre-normalized tilers intact', () => {
  const descriptor = {
    id: 'tiler_descriptor',
    name: 'Tiler Descriptor',
    layers: [
      { id: 'game', name: 'Gameplay', parallaxSpeed: 1, offsetY: 0, separation: 100, scale: 1 },
    ],
    instances: [],
    tilers: [
      {
        id: 'kept',
        label: 'Keep Me',
        textureId: 'mural',
        layerId: 'game',
        area: { left: 10, top: 5, width: 40, height: 20 },
        tileSize: { width: 20, height: 20 },
        offset: { x: 2, y: 3 },
        spacing: { x: 0, y: 0 },
      },
    ],
  };

  const area = convertLayoutToArea(descriptor);

  assert.equal(area.tilers.length, 1);
  assert.equal(area.tilers[0].id, 'kept');
  assert.equal(area.tilers[0].label, 'Keep Me');
  assert.equal(area.tilers[0].textureId, 'mural');
  assert.deepEqual(area.tilers[0].area, { left: 10, top: 5, width: 40, height: 20 });
  assert.deepEqual(area.tilers[0].tileSize, { width: 20, height: 20 });
});
