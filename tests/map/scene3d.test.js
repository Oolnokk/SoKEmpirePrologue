import { describe, it } from 'node:test';
import { strictEqual } from 'assert';
import { resolveScene3dUrl } from '../../src/map/scene3d.js';
import { resolveScene3dUrl as resolveDocsScene3dUrl } from '../../docs/renderer/scene3d.js';
import { DEFAULT_SCENE3D_BASE_PATH } from '../../config.js';

const resolvers = [
  ['map resolver', resolveScene3dUrl],
  ['docs resolver', resolveDocsScene3dUrl],
];

describe('resolveScene3dUrl', () => {
  it('should return sceneUrl unchanged if null or undefined', () => {
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(null), null);
      strictEqual(resolver(undefined), undefined);
      strictEqual(resolver(''), '');
    });
  });

  it('should leave absolute HTTP URLs unchanged', () => {
    const httpUrl = 'http://example.com/scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(httpUrl), httpUrl);
    });

    const httpsUrl = 'https://example.com/scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(httpsUrl), httpsUrl);
    });
  });

  it('should leave paths starting with /config/ unchanged', () => {
    const configPath = '/config/maps/visualsmaps/scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(configPath), configPath);
    });

    const configPath2 = '/config/other/path.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(configPath2), configPath2);
    });
  });

  it('should resolve relative paths starting with ./', () => {
    const relativePath = './scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(relativePath), `${DEFAULT_SCENE3D_BASE_PATH}scene.glb`);
    });

    const nestedPath = './subdir/scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(nestedPath), `${DEFAULT_SCENE3D_BASE_PATH}subdir/scene.glb`);
    });
  });

  it('should resolve paths without leading slash', () => {
    const noSlashPath = 'scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(noSlashPath), `${DEFAULT_SCENE3D_BASE_PATH}scene.glb`);
    });

    const nestedNoSlash = 'subdir/scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(nestedNoSlash), `${DEFAULT_SCENE3D_BASE_PATH}subdir/scene.glb`);
    });
  });

  it('should leave absolute paths starting with / unchanged', () => {
    const absolutePath = '/assets/3D/scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(absolutePath), absolutePath);
    });
  });

  it('should use custom base path when provided', () => {
    const customBase = '/custom/base/';
    const relativePath = './scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(relativePath, { base: customBase }), '/custom/base/scene.glb');
    });

    const noSlashPath = 'scene.glb';
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(noSlashPath, { base: customBase }), '/custom/base/scene.glb');
    });
  });

  it('should handle non-string inputs gracefully', () => {
    resolvers.forEach(([, resolver]) => {
      strictEqual(resolver(123), 123);
      // Non-string objects are returned as-is
      const obj = {};
      strictEqual(resolver(obj), obj);
    });
  });
});
