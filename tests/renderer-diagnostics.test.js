/**
 * Test for renderer diagnostics and GLTF loading enhancements
 * 
 * Note: Requires Node.js v18.0.0+ for built-in test runner (node:test)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Renderer Diagnostics', () => {
  it('should have enhanced GLTF loading diagnostics in Renderer.js', () => {
    const rendererPath = join(__dirname, '..', 'src', 'renderer', 'Renderer.js');
    const content = readFileSync(rendererPath, 'utf8');
    
    // Check for enhanced logging
    assert.match(content, /console\.log\(`\[Renderer\] ✓ GLTF loaded successfully:/);
    assert.match(content, /Scene children:/);
    assert.match(content, /Total meshes:/);
    assert.match(content, /Geometry types:/);
  });

  it('should check THREE object extensibility in app.js', () => {
    const appPath = join(__dirname, '..', 'docs', 'js', 'app.js');
    const content = readFileSync(appPath, 'utf8');
    
    // Check for extensibility checks
    assert.match(content, /Object\.isExtensible\(globalThis\.THREE\)/);
    assert.match(content, /Object\.isSealed\(globalThis\.THREE\)/);
    assert.match(content, /Object\.isFrozen\(globalThis\.THREE\)/);
  });

  it('should have BufferGeometryUtils fallback storage', () => {
    const appPath = join(__dirname, '..', 'docs', 'js', 'app.js');
    const content = readFileSync(appPath, 'utf8');
    
    // Check for fallback storage
    assert.match(content, /bufferGeometryUtils:\s*null/);
    assert.match(content, /getThreeBufferGeometryUtils/);
    assert.match(content, /threeGlobalState\.bufferGeometryUtils/);
  });

  it('should have GLTFLoader fallback storage', () => {
    const appPath = join(__dirname, '..', 'docs', 'js', 'app.js');
    const content = readFileSync(appPath, 'utf8');
    
    // Check for GLTFLoader fallback storage
    assert.match(content, /gltfLoaderCtor:\s*null/);
    assert.match(content, /getThreeGLTFLoaderCtor/);
    assert.match(content, /threeGlobalState\.gltfLoaderCtor/);
  });

  it('should have GLTF diagnostics test page', () => {
    const diagnosticsPath = join(__dirname, '..', 'docs', 'gltf-diagnostics.html');
    const content = readFileSync(diagnosticsPath, 'utf8');
    
    // Check for key features
    assert.match(content, /GLTF Loading Diagnostics/);
    assert.match(content, /testModel/);
    assert.match(content, /GLTFLoader/);
    assert.match(content, /BufferGeometryUtils/);
  });

  it('should have visualmap rendering pipeline documentation', () => {
    const docPath = join(__dirname, '..', 'docs', 'VISUALMAP_RENDERING_PIPELINE.md');
    const content = readFileSync(docPath, 'utf8');
    
    // Check for key sections
    assert.match(content, /Visual Map Rendering Pipeline/);
    assert.match(content, /Architecture/);
    assert.match(content, /Common Issues/);
    assert.match(content, /Diagnostics Tools/);
    assert.match(content, /Troubleshooting Steps/);
  });
});
