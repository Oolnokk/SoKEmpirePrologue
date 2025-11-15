import { test } from 'node:test';
import { strictEqual } from 'node:assert';
import { readFileSync } from 'node:fs';

const editorContent = readFileSync(new URL('../docs/js/cosmetic-editor-app.js', import.meta.url), 'utf8');

test('cosmetic editor renders drape overlay in draping mode', () => {
  const drapeModeCheck = /buildPartPose[\s\S]+?modeManager\.resolveModeKey\(this\.state\.activeMode\) === 'draping'/.test(editorContent);
  strictEqual(drapeModeCheck, true, 'buildPartPose should gate drape overlay on draping mode');

  const overlayAppendCheck = /const\s+overlay\s*=\s*this\.buildDrapeOverlay\(resolvedLayers,\s*library,\s*partKey\);[\s\S]+?stage\.appendChild\(overlay\)/.test(editorContent);
  strictEqual(overlayAppendCheck, true, 'part preview should append the drape overlay to the stage');
});
