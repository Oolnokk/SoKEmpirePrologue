import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Camera configuration defaults', () => {
  const configPath = join(__dirname, '..', 'docs', 'config', 'config.js');
  const configSrc = readFileSync(configPath, 'utf-8');

  it('config.js includes camera.rigidCenter default set to false', () => {
    assert.ok(
      configSrc.includes('rigidCenter'),
      'config.js should include rigidCenter property'
    );
    
    // Check that it's set to false (opt-in)
    const rigidCenterMatch = configSrc.match(/rigidCenter\s*:\s*false/);
    assert.ok(
      rigidCenterMatch,
      'config.js should set rigidCenter to false by default'
    );
  });

  it('config.js includes camera.ignoreCenterBounds default set to false', () => {
    assert.ok(
      configSrc.includes('ignoreCenterBounds'),
      'config.js should include ignoreCenterBounds property'
    );
    
    // Check that it's set to false (opt-in)
    const ignoreCenterBoundsMatch = configSrc.match(/ignoreCenterBounds\s*:\s*false/);
    assert.ok(
      ignoreCenterBoundsMatch,
      'config.js should set ignoreCenterBounds to false by default'
    );
  });

  it('config.js includes comment explaining rigidCenter is opt-in', () => {
    assert.ok(
      configSrc.includes('opt-in') || configSrc.includes('When true'),
      'config.js should include comment explaining rigidCenter behavior'
    );
  });

  it('config.js camera section includes awareness configuration', () => {
    // Verify existing camera.awareness structure is preserved
    assert.ok(
      configSrc.includes('awareness'),
      'config.js should still include camera.awareness configuration'
    );
  });

  it('camera.js includes comment pointing to config.js', () => {
    const cameraPath = join(__dirname, '..', 'docs', 'js', 'camera.js');
    const cameraSrc = readFileSync(cameraPath, 'utf-8');
    
    assert.ok(
      cameraSrc.includes('docs/config/config.js'),
      'camera.js should include comment pointing to docs/config/config.js'
    );
  });
});
