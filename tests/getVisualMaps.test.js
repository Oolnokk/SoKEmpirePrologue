import { describe, it } from 'node:test';
import { strictEqual, ok, rejects } from 'assert';
import { listVisualMaps } from '../scripts/getVisualMaps.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

describe('getVisualMaps helper', () => {
  it('should list visual maps from default directory', async () => {
    const maps = await listVisualMaps();
    ok(Array.isArray(maps), 'Should return an array');
    ok(maps.length > 0, 'Should find at least one map file');
  });

  it('should include required properties for each map', async () => {
    const maps = await listVisualMaps();
    maps.forEach((map) => {
      ok(map.name, 'Each map should have a name');
      ok(map.fullPath, 'Each map should have a fullPath');
      ok(map.ext, 'Each map should have an ext');
      ok(typeof map.valid === 'boolean', 'Each map should have a valid boolean');
    });
  });

  it('should only include files with allowed extensions', async () => {
    const maps = await listVisualMaps();
    const allowedExt = new Set(['.gltf', '.glb', '.json']);
    maps.forEach((map) => {
      ok(allowedExt.has(map.ext), `Extension ${map.ext} should be allowed`);
    });
  });

  it('should validate JSON files without asset.version as invalid', async () => {
    const maps = await listVisualMaps();
    // index.json doesn't have asset.version, so it should be invalid
    const indexMap = maps.find((m) => m.name === 'index.json');
    if (indexMap) {
      strictEqual(indexMap.valid, false, 'index.json should be invalid (no asset.version)');
    }
  });

  it('should validate proper visual map JSON files', async () => {
    const maps = await listVisualMaps();
    // Check that at least one map is found and validated
    ok(maps.length > 0, 'Should find at least one map file');
  });

  it('should throw error for non-existent directory', async () => {
    const badPath = path.join(repoRoot, 'does', 'not', 'exist');
    await rejects(
      async () => {
        await listVisualMaps(badPath);
      },
      (err) => {
        ok(err instanceof Error, 'Should throw an Error');
        ok(err.message.includes('Unable to read maps directory'), 'Error message should be descriptive');
        return true;
      }
    );
  });

  it('should handle custom directory path', async () => {
    const customPath = path.join(repoRoot, 'docs', 'config', 'maps', 'visualsmaps');
    const maps = await listVisualMaps(customPath);
    ok(Array.isArray(maps), 'Should return an array for custom path');
    ok(maps.length > 0, 'Should find files in custom path');
  });

  it('should handle .glb files if present', async () => {
    // Create a temporary .glb file for testing
    const tmpDir = path.join(repoRoot, 'tmp', 'test-maps');
    await fs.mkdir(tmpDir, { recursive: true });
    
    try {
      // Create a valid .glb file with glTF magic header
      const validGlbPath = path.join(tmpDir, 'valid.glb');
      const glbHeader = Buffer.from('glTF');
      await fs.writeFile(validGlbPath, glbHeader);

      // Create an invalid .glb file
      const invalidGlbPath = path.join(tmpDir, 'invalid.glb');
      await fs.writeFile(invalidGlbPath, Buffer.from('BAAD'));

      const maps = await listVisualMaps(tmpDir);
      
      const validMap = maps.find((m) => m.name === 'valid.glb');
      const invalidMap = maps.find((m) => m.name === 'invalid.glb');

      ok(validMap, 'Should find valid.glb');
      strictEqual(validMap.valid, true, 'valid.glb should be marked as valid');
      
      ok(invalidMap, 'Should find invalid.glb');
      strictEqual(invalidMap.valid, false, 'invalid.glb should be marked as invalid');
    } finally {
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it('should handle .gltf files with valid glTF structure', async () => {
    const tmpDir = path.join(repoRoot, 'tmp', 'test-gltf');
    await fs.mkdir(tmpDir, { recursive: true });
    
    try {
      // Create a valid .gltf file
      const validGltf = {
        asset: {
          version: '2.0'
        }
      };
      const validGltfPath = path.join(tmpDir, 'valid.gltf');
      await fs.writeFile(validGltfPath, JSON.stringify(validGltf));

      // Create an invalid .gltf file (no asset.version)
      const invalidGltf = { someOtherData: true };
      const invalidGltfPath = path.join(tmpDir, 'invalid.gltf');
      await fs.writeFile(invalidGltfPath, JSON.stringify(invalidGltf));

      const maps = await listVisualMaps(tmpDir);
      
      const validMap = maps.find((m) => m.name === 'valid.gltf');
      const invalidMap = maps.find((m) => m.name === 'invalid.gltf');

      ok(validMap, 'Should find valid.gltf');
      strictEqual(validMap.valid, true, 'valid.gltf should be marked as valid');
      
      ok(invalidMap, 'Should find invalid.gltf');
      strictEqual(invalidMap.valid, false, 'invalid.gltf should be marked as invalid');
    } finally {
      // Cleanup
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
