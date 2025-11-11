import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { createDirectoryPrefabResolver } from '../../src/map/prefabResolver.js';

async function withTempDir(fn) {
  const dir = await mkdtemp(path.join(tmpdir(), 'prefab-resolver-'));
  return fn(dir);
}

test('createDirectoryPrefabResolver loads prefabs by id', async () => {
  await withTempDir(async (dir) => {
    const prefabPath = path.join(dir, 'tree.json');
    await writeFile(prefabPath, JSON.stringify({ structureId: 'tree', parts: [] }));

    const { resolver, warnings } = await createDirectoryPrefabResolver(new Set(['tree']), { root: dir });

    assert.equal(warnings.length, 0);
    assert.deepEqual(resolver('tree'), { structureId: 'tree', parts: [] });
    assert.equal(resolver('missing'), null);
  });
});

test('createDirectoryPrefabResolver reports missing prefabs', async () => {
  await withTempDir(async (dir) => {
    const { warnings } = await createDirectoryPrefabResolver(new Set(['ghost']), { root: dir, logger: null });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /Prefab "ghost"/);
  });
});

test('createDirectoryPrefabResolver handles nested ids with extensions', async () => {
  await withTempDir(async (dir) => {
    const nestedDir = path.join(dir, 'plants');
    await mkdir(nestedDir, { recursive: true });
    await writeFile(path.join(nestedDir, 'oak.prefab.json'), JSON.stringify({ structureId: 'plants/oak', parts: [] }));

    const { resolver, warnings } = await createDirectoryPrefabResolver(new Set(['plants/oak']), { root: dir });
    assert.equal(warnings.length, 0);
    assert.deepEqual(resolver('plants/oak'), { structureId: 'plants/oak', parts: [] });
  });
});
