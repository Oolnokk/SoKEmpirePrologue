import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('render.js weapon bone safety', () => {
  const renderPath = join(__dirname, '..', 'docs', 'js', 'render.js');
  const renderSrc = readFileSync(renderPath, 'utf-8');

  it('guards against weapon bones overriding base rig entries', () => {
    assert.ok(
      renderSrc.includes('const collidesWithBaseRig') &&
      renderSrc.includes('const safeKey = collidesWithBaseRig ? `weapon_${boneKey}` : boneKey;'),
      'render.js should rename weapon bones that collide with base rig keys'
    );
  });

  it('preserves original weapon bone ids via sourceId metadata', () => {
    assert.ok(
      renderSrc.includes('sourceId: bone.id || null'),
      'render.js should retain the originating weapon bone id for diagnostics'
    );
  });
});
