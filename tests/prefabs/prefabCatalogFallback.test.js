import test from 'node:test';
import assert from 'node:assert/strict';

import { loadPrefabsFromManifests, __setJsonImportLoader } from '../../docs/js/prefab-catalog.js';

class MockResponse {
  constructor(body, { status = 200 } = {}) {
    this._body = body;
    this.status = status;
    this.ok = status >= 200 && status < 300;
  }

  async json() {
    return JSON.parse(this._body);
  }
}

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
    assert.equal(prefab.id, 'blocking_crate');
    assert.equal(prefab.slug, 'blocking_crate');
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

test('loadPrefabsFromManifests falls back to XMLHttpRequest when JSON import is unavailable', async () => {
  const originalDocument = global.document;
  const originalXHR = global.XMLHttpRequest;
  const originalWarn = console.warn;
  const requests = [];

  global.document = { baseURI: 'file:///config/index.html' };
  console.warn = () => {};

  const manifestUrl = 'file:///config/prefabs/structures/index.json';
  const prefabUrl = 'file:///config/prefabs/structures/tower_commercial.prefab.json';

  class FakeXHR {
    constructor() {
      this.responseType = '';
    }

    open(method, url) {
      this.method = method;
      this.url = url;
    }

    send() {
      requests.push(this.url);
      setTimeout(() => {
        let payload = null;
        if (this.url === manifestUrl) {
          payload = {
            id: 'structures',
            label: 'Structures',
            entries: [
              { id: 'tower_commercial', path: './tower_commercial.prefab.json' },
            ],
          };
        } else if (this.url === prefabUrl) {
          payload = {
            structureId: 'Commercial Tower',
            parts: [
              { name: 'near', layer: 'near', relX: 0, relY: 0, z: 0, propTemplate: { id: 'near', url: './assets/prefabs/near.png', w: 100, h: 120 } },
            ],
          };
        }

        if (!payload) {
          this.status = 404;
          this.onerror?.(new Error('Not found'));
          return;
        }

        this.status = 200;
        this.response = this.responseType === 'json' ? payload : undefined;
        this.responseText = JSON.stringify(payload);
        this.onload?.();
      }, 0);
    }
  }

  global.XMLHttpRequest = FakeXHR;
  __setJsonImportLoader(null);

  const fakeFetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  try {
    const { prefabs, errors } = await loadPrefabsFromManifests([manifestUrl], { fetch: fakeFetch });

    assert.equal(errors.length, 0);
    assert.deepEqual(requests, [manifestUrl, prefabUrl]);
    assert.equal(prefabs.size, 1);
    const prefab = prefabs.get('tower_commercial');
    assert.ok(prefab);
    assert.equal(prefab.id, 'tower_commercial');
    assert.equal(prefab.slug, 'tower_commercial');
    assert.equal(prefab.structureId, 'Commercial Tower');
    assert.equal(prefab.parts.length, 1);
  } finally {
    if (originalDocument === undefined) {
      delete global.document;
    } else {
      global.document = originalDocument;
    }
    if (originalXHR === undefined) {
      delete global.XMLHttpRequest;
    } else {
      global.XMLHttpRequest = originalXHR;
    }
    console.warn = originalWarn;
  }
});

test('loadPrefabsFromManifests retries manifest downloads after failure', async () => {
  const manifestUrl = 'https://cdn.example.test/prefabs/index.json';
  const prefabUrl = 'https://cdn.example.test/prefabs/tower.prefab.json';
  const originalDocument = global.document;
  let manifestAttempts = 0;

  const fetchImpl = async (url) => {
    if (url === manifestUrl) {
      manifestAttempts += 1;
      if (manifestAttempts === 1) {
        throw new Error('network unavailable');
      }
      return new MockResponse(JSON.stringify({
        id: 'structures',
        entries: [
          { id: 'tower', path: './tower.prefab.json' },
        ],
      }));
    }
    if (url === prefabUrl) {
      return new MockResponse(JSON.stringify({
        structureId: 'Tower',
        type: 'structure',
        parts: [],
      }));
    }
    throw new Error(`Unexpected URL ${url}`);
  };

  global.document = { baseURI: 'https://game.example.test/index.html' };

  try {
    const first = await loadPrefabsFromManifests([manifestUrl], { fetch: fetchImpl });
    assert.equal(first.prefabs.size, 0);
    assert.equal(first.errors.length, 1);
    assert.equal(manifestAttempts, 1);

    const second = await loadPrefabsFromManifests([manifestUrl], { fetch: fetchImpl });
    assert.equal(manifestAttempts, 2);
    assert.equal(second.prefabs.size, 1);
    assert.equal(second.errors.length, 0);
    const prefab = second.prefabs.get('tower');
    assert.ok(prefab);
    assert.equal(prefab.structureId, 'Tower');
  } finally {
    if (originalDocument === undefined) {
      delete global.document;
    } else {
      global.document = originalDocument;
    }
  }
});
