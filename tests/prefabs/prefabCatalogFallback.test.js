import test from 'node:test';
import assert from 'node:assert/strict';

import { loadPrefabsFromManifests, __setJsonImportLoader } from '../../docs/js/prefab-catalog.js';

const MANIFEST_URL = 'file:///config/prefabs/obstructions/index.json';
const PREFAB_URL = 'file:///config/prefabs/obstructions/blocking_crate.prefab.json';

test('loadPrefabsFromManifests falls back to JSON import when fetch fails for file URLs', async () => {
  const originalDocument = global.document;
  const loaderCalls = [];

  global.document = { baseURI: 'file:///config/index.html' };
  __setJsonImportLoader(async (url) => {
    loaderCalls.push(url);
    if (url === MANIFEST_URL) {
      return {
        default: {
          id: 'obstructions',
          label: 'Obstructions',
          entries: [
            {
              id: 'blocking_crate',
              label: 'Blocking Crate',
              path: './blocking_crate.prefab.json',
            },
          ],
        },
      };
    }
    if (url === PREFAB_URL) {
      return {
        default: {
          structureId: 'Blocking Crate',
          type: 'obstruction',
          tags: ['grippable'],
          obstruction: {
            collision: {
              enabled: true,
              box: { width: 140, height: 100, offsetX: 0, offsetY: 0 },
            },
            physics: { enabled: true, dynamic: false },
          },
          parts: [
            {
              name: 'crate_near',
              layer: 'near',
              relX: 0,
              relY: 0,
              z: 10,
              propTemplate: {
                id: 'crate_near',
                url: './assets/near.png',
                w: 220,
                h: 180,
                pivot: 'bottom',
                anchorXPct: 50,
                anchorYPct: 100,
                parallaxX: 1,
                parallaxClampPx: 0,
              },
            },
          ],
        },
      };
    }
    throw new Error(`Unexpected URL ${url}`);
  });

  const fakeFetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  try {
    const { prefabs, errors } = await loadPrefabsFromManifests([MANIFEST_URL], { fetch: fakeFetch });

    assert.equal(errors.length, 0);
    assert.equal(prefabs.size, 1);
    const prefab = prefabs.get('blocking_crate');
    assert.ok(prefab);
    assert.equal(prefab.type, 'obstruction');
    assert.deepEqual(prefab.tags, ['grippable', 'obstruction']);

    assert.ok(loaderCalls.includes(MANIFEST_URL));
    assert.ok(loaderCalls.includes(PREFAB_URL));
  } finally {
    __setJsonImportLoader(null);
    if (originalDocument === undefined) {
      delete global.document;
    } else {
      global.document = originalDocument;
    }
  }
});
