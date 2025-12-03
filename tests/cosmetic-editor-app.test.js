import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert';
import { readFileSync, existsSync } from 'node:fs';

const editorContent = readFileSync(new URL('../docs/js/cosmetic-editor-app.js', import.meta.url), 'utf8');
const cosmeticRenderPath = new URL('../docs/js/cosmetic-render.js', import.meta.url);

test('cosmetic editor renders drape overlay in draping mode', () => {
  const drapeModeCheck = /buildPartPose[\s\S]+?modeManager\.resolveModeKey\(this\.state\.activeMode\) === 'draping'/.test(editorContent);
  strictEqual(drapeModeCheck, true, 'buildPartPose should gate drape overlay on draping mode');

  const overlayAppendCheck = /const\s+overlay\s*=\s*this\.buildDrapeOverlay\(resolvedLayers,\s*library,\s*partKey\);[\s\S]+?stage\.appendChild\(overlay\)/.test(editorContent);
  strictEqual(overlayAppendCheck, true, 'part preview should append the drape overlay to the stage');
});

test('cosmetic editor imports from cosmetic-render.js', () => {
  // Verify the editor imports rendering utilities from the shared module
  const importCheck = /import\s*{[\s\S]*?renderFighterPreview[\s\S]*?}\s*from\s*['"]\.\/cosmetic-render\.js/.test(editorContent);
  strictEqual(importCheck, true, 'cosmetic-editor-app.js should import renderFighterPreview from cosmetic-render.js');
  
  const partPreviewCheck = /import\s*{[\s\S]*?renderPartPreview[\s\S]*?}\s*from\s*['"]\.\/cosmetic-render\.js/.test(editorContent);
  strictEqual(partPreviewCheck, true, 'cosmetic-editor-app.js should import renderPartPreview from cosmetic-render.js');
});

test('cosmetic-render.js exists and re-exports from render.js and sprites.js', () => {
  ok(existsSync(cosmeticRenderPath), 'cosmetic-render.js should exist');
  
  const renderModuleContent = readFileSync(cosmeticRenderPath, 'utf8');
  
  // Verify it imports from render.js
  const renderImportCheck = /import\s*{[\s\S]*?computeAnchorsForFighter[\s\S]*?}\s*from\s*['"]\.\/render\.js/.test(renderModuleContent);
  strictEqual(renderImportCheck, true, 'cosmetic-render.js should import computeAnchorsForFighter from render.js');
  
  // Verify it imports from sprites.js
  const spritesImportCheck = /import\s*{[\s\S]*?renderSprites[\s\S]*?}\s*from\s*['"]\.\/sprites\.js/.test(renderModuleContent);
  strictEqual(spritesImportCheck, true, 'cosmetic-render.js should import renderSprites from sprites.js');
  
  // Verify it exports the key functions
  const exportCheck = /export\s+function\s+renderFighterPreview/.test(renderModuleContent);
  strictEqual(exportCheck, true, 'cosmetic-render.js should export renderFighterPreview function');
  
  const partExportCheck = /export\s+function\s+renderPartPreview/.test(renderModuleContent);
  strictEqual(partExportCheck, true, 'cosmetic-render.js should export renderPartPreview function');
});

test('cosmetic editor full body preview uses shared rendering module', () => {
  // The full body preview should use the shared renderFighterPreview function
  const usesSharedRender = /renderFighterPreview\s*\(\s*canvas/.test(editorContent);
  strictEqual(usesSharedRender, true, 'buildFullBodyPreviewApi should use renderFighterPreview for canvas rendering');
});

test('cosmetic editor part preview uses canvas-based rendering', () => {
  // The part preview should create a canvas element
  const createsCanvas = /buildPartPose[\s\S]+?const\s+canvas\s*=\s*document\.createElement\s*\(\s*['"]canvas['"]\s*\)/.test(editorContent);
  strictEqual(createsCanvas, true, 'buildPartPose should create a canvas element for rendering');
  
  // The part preview should use renderPartPreview for canvas rendering
  const usesPartPreview = /buildPartPose[\s\S]+?renderPartPreview\s*\(\s*canvas/.test(editorContent);
  strictEqual(usesPartPreview, true, 'buildPartPose should use renderPartPreview for canvas rendering');
});
