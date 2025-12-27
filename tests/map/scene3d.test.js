import { describe, it } from 'node:test';
import { strictEqual } from 'assert';
import { resolveScene3dUrl } from '../../src/map/scene3d.js';

describe('resolveScene3dUrl', () => {
  it('should return sceneUrl unchanged if null or undefined', () => {
    strictEqual(resolveScene3dUrl(null), null);
    strictEqual(resolveScene3dUrl(undefined), undefined);
    strictEqual(resolveScene3dUrl(''), '');
  });

  it('should leave absolute HTTP URLs unchanged', () => {
    const httpUrl = 'http://example.com/scene.glb';
    strictEqual(resolveScene3dUrl(httpUrl), httpUrl);
    
    const httpsUrl = 'https://example.com/scene.glb';
    strictEqual(resolveScene3dUrl(httpsUrl), httpsUrl);
  });

  it('should leave paths starting with /config/ unchanged', () => {
    const configPath = '/config/maps/visualsmaps/scene.glb';
    strictEqual(resolveScene3dUrl(configPath), configPath);
    
    const configPath2 = '/config/other/path.glb';
    strictEqual(resolveScene3dUrl(configPath2), configPath2);
  });

  it('should resolve relative paths starting with ./', () => {
    const relativePath = './scene.glb';
    strictEqual(resolveScene3dUrl(relativePath), '/config/maps/visualsmaps/scene.glb');
    
    const nestedPath = './subdir/scene.glb';
    strictEqual(resolveScene3dUrl(nestedPath), '/config/maps/visualsmaps/subdir/scene.glb');
  });

  it('should resolve paths without leading slash', () => {
    const noSlashPath = 'scene.glb';
    strictEqual(resolveScene3dUrl(noSlashPath), '/config/maps/visualsmaps/scene.glb');
    
    const nestedNoSlash = 'subdir/scene.glb';
    strictEqual(resolveScene3dUrl(nestedNoSlash), '/config/maps/visualsmaps/subdir/scene.glb');
  });

  it('should leave absolute paths starting with / unchanged', () => {
    const absolutePath = '/assets/3D/scene.glb';
    strictEqual(resolveScene3dUrl(absolutePath), absolutePath);
  });

  it('should use custom base path when provided', () => {
    const customBase = '/custom/base/';
    const relativePath = './scene.glb';
    strictEqual(resolveScene3dUrl(relativePath, { base: customBase }), '/custom/base/scene.glb');
    
    const noSlashPath = 'scene.glb';
    strictEqual(resolveScene3dUrl(noSlashPath, { base: customBase }), '/custom/base/scene.glb');
  });

  it('should handle non-string inputs gracefully', () => {
    strictEqual(resolveScene3dUrl(123), 123);
    // Non-string objects are returned as-is
    const obj = {};
    strictEqual(resolveScene3dUrl(obj), obj);
  });
});
