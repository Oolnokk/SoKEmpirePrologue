/**
 * Tests for scene3d-preview.js module
 * 
 * These tests verify the module exports and basic API without requiring a browser environment.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

describe('scene3d-preview module', () => {
  it('should export required functions', async () => {
    // Since we're in Node.js and the module imports Three.js from CDN,
    // we can't actually import it. Instead, we verify the file exists
    // and has the right structure.
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const modulePath = path.join(
      process.cwd(),
      'docs/js/scene3d-preview.js'
    );
    
    const content = await fs.readFile(modulePath, 'utf-8');
    
    // Verify the module exports the required functions
    assert.ok(
      content.includes('export async function startPreview'),
      'Module should export startPreview function'
    );
    
    assert.ok(
      content.includes('export function stopPreview'),
      'Module should export stopPreview function'
    );
    
    assert.ok(
      content.includes('export function toggleCameraSide'),
      'Module should export toggleCameraSide function'
    );
    
    assert.ok(
      content.includes('export function isPreviewActive'),
      'Module should export isPreviewActive function'
    );
    
    // Verify Three.js CDN imports
    assert.ok(
      content.includes('https://unpkg.com/three@0.158.0/build/three.module.js'),
      'Module should import Three.js from CDN'
    );
    
    assert.ok(
      content.includes('https://unpkg.com/three@0.158.0/examples/jsm/loaders/GLTFLoader.js'),
      'Module should import GLTFLoader from CDN'
    );
  });

  it('should have proper default configuration', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const modulePath = path.join(
      process.cwd(),
      'docs/js/scene3d-preview.js'
    );
    
    const content = await fs.readFile(modulePath, 'utf-8');
    
    // Verify default config includes expected properties
    assert.ok(
      content.includes('sceneUrl:'),
      'Default config should include sceneUrl'
    );
    
    assert.ok(
      content.includes('fallbackUrl:'),
      'Default config should include fallbackUrl'
    );
    
    assert.ok(
      content.includes('tower_commercial3D.glb'),
      'Default config should reference tower asset'
    );
    
    assert.ok(
      content.includes('scene3d-demo.gltf'),
      'Default config should reference fallback asset'
    );
  });
  
  it('should have proper cleanup in stopPreview', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const modulePath = path.join(
      process.cwd(),
      'docs/js/scene3d-preview.js'
    );
    
    const content = await fs.readFile(modulePath, 'utf-8');
    
    // Verify cleanup logic exists
    assert.ok(
      content.includes('cancelAnimationFrame'),
      'stopPreview should cancel animation frames'
    );
    
    assert.ok(
      content.includes('dispose()'),
      'stopPreview should dispose of Three.js resources'
    );
    
    assert.ok(
      content.includes('removeChild'),
      'stopPreview should remove canvas from DOM'
    );
  });
});

describe('map-editor.html 3D preview integration', () => {
  it('should have the 3D preview button', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const htmlPath = path.join(
      process.cwd(),
      'docs/map-editor.html'
    );
    
    const content = await fs.readFile(htmlPath, 'utf-8');
    
    assert.ok(
      content.includes('id="btnPreview3DProcedural"'),
      'HTML should include 3D preview button with correct ID'
    );
    
    assert.ok(
      content.includes('Preview 3D Procedural'),
      'Button should have correct label'
    );
  });

  it('should import the scene3d-preview module', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const htmlPath = path.join(
      process.cwd(),
      'docs/map-editor.html'
    );
    
    const content = await fs.readFile(htmlPath, 'utf-8');
    
    assert.ok(
      content.includes('./js/scene3d-preview.js'),
      'HTML should import the scene3d-preview module'
    );
    
    assert.ok(
      content.includes('Scene3DPreview'),
      'HTML should reference Scene3DPreview namespace'
    );
  });

  it('should have toggle3DPreview function', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const htmlPath = path.join(
      process.cwd(),
      'docs/map-editor.html'
    );
    
    const content = await fs.readFile(htmlPath, 'utf-8');
    
    assert.ok(
      content.includes('function toggle3DPreview()'),
      'HTML should define toggle3DPreview function'
    );
    
    assert.ok(
      content.includes('Scene3DPreview.startPreview'),
      'toggle3DPreview should call startPreview'
    );
    
    assert.ok(
      content.includes('Scene3DPreview.stopPreview'),
      'toggle3DPreview should call stopPreview'
    );
  });
  
  it('should preserve existing map editor functionality', async () => {
    const fs = await import('node:fs/promises');
    const path = await import('node:path');
    
    const htmlPath = path.join(
      process.cwd(),
      'docs/map-editor.html'
    );
    
    const content = await fs.readFile(htmlPath, 'utf-8');
    
    // Verify existing buttons still exist
    assert.ok(
      content.includes('id="btnPreviewGameplay"'),
      'Existing Preview Gameplay button should still exist'
    );
    
    assert.ok(
      content.includes('id="btnExportMap"'),
      'Existing Export Map button should still exist'
    );
    
    assert.ok(
      content.includes('id="sceneCanvas"'),
      'Existing 2D canvas should still exist'
    );
    
    // Verify the 2D canvas is restored when 3D preview is stopped
    assert.ok(
      content.includes('sceneCanvas.style.display = \'block\''),
      'Toggle should restore 2D canvas visibility'
    );
  });
});
