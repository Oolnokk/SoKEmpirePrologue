import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('debug-panel.js module', () => {
  const debugPanelPath = join(__dirname, '..', 'docs', 'js', 'debug-panel.js');
  const debugPanelSrc = readFileSync(debugPanelPath, 'utf-8');

  it('exports initDebugPanel function', () => {
    assert.ok(debugPanelSrc.includes('export function initDebugPanel()'), 
      'debug-panel.js should export initDebugPanel function');
  });

  it('exports updateDebugPanel function', () => {
    assert.ok(debugPanelSrc.includes('export function updateDebugPanel()'), 
      'debug-panel.js should export updateDebugPanel function');
  });

  it('implements copyPoseConfigToClipboard function', () => {
    assert.ok(debugPanelSrc.includes('function copyPoseConfigToClipboard()'), 
      'debug-panel.js should implement copyPoseConfigToClipboard function');
  });

  it('uses correct angle conversion (radians to degrees)', () => {
    assert.ok(debugPanelSrc.includes('import') && debugPanelSrc.includes('radToDeg'), 
      'debug-panel.js should import radToDeg from math-utils.js');
    assert.ok(debugPanelSrc.includes('from \'./math-utils.js'), 
      'debug-panel.js should import from math-utils.js');
  });

  it('uses correct angle conversion (degrees to radians)', () => {
    assert.ok(debugPanelSrc.includes('import') && debugPanelSrc.includes('degToRad'), 
      'debug-panel.js should import degToRad from math-utils.js');
    assert.ok(debugPanelSrc.includes('from \'./math-utils.js'), 
      'debug-panel.js should import from math-utils.js');
  });

  it('updates bone transforms display', () => {
    assert.ok(debugPanelSrc.includes('updateTransformsDisplay'), 
      'debug-panel.js should implement updateTransformsDisplay');
    assert.ok(debugPanelSrc.includes('Live Bone Transforms'), 
      'debug-panel.js should display bone transforms title');
  });

  it('updates pose editor inputs', () => {
    assert.ok(debugPanelSrc.includes('updatePoseEditor'), 
      'debug-panel.js should implement updatePoseEditor');
    assert.ok(debugPanelSrc.includes('Pose Editor'), 
      'debug-panel.js should display pose editor title');
  });

  it('includes all joint angle fields', () => {
    const joints = ['torso', 'head', 'lShoulder', 'lElbow', 'rShoulder', 'rElbow', 'lHip', 'lKnee', 'rHip', 'rKnee'];
    for (const joint of joints) {
      assert.ok(debugPanelSrc.includes(`'${joint}'`) || debugPanelSrc.includes(`"${joint}"`), 
        `debug-panel.js should include ${joint} joint field`);
    }
  });

  it('exports pose/config data as JSON', () => {
    assert.ok(debugPanelSrc.includes('JSON.stringify'), 
      'debug-panel.js should stringify export data');
    assert.ok(debugPanelSrc.includes('navigator.clipboard.writeText'), 
      'debug-panel.js should use clipboard API to copy JSON');
  });

  it('includes bone order for display', () => {
    const expectedBones = ['torso', 'head', 'arm_L_upper', 'arm_L_lower', 'arm_R_upper', 'arm_R_lower',
                          'leg_L_upper', 'leg_L_lower', 'leg_R_upper', 'leg_R_lower'];
    for (const bone of expectedBones) {
      assert.ok(debugPanelSrc.includes(`'${bone}'`) || debugPanelSrc.includes(`"${bone}"`), 
        `debug-panel.js should include ${bone} in bone list`);
    }
  });
});

describe('index.html includes debug panel', () => {
  const indexPath = join(__dirname, '..', 'docs', 'index.html');
  const indexSrc = readFileSync(indexPath, 'utf-8');

  it('includes debug panel container', () => {
    assert.ok(indexSrc.includes('id="debugPanel"'), 
      'index.html should include debug panel container');
  });

  it('includes debug toggle button', () => {
    assert.ok(indexSrc.includes('id="debugToggle"'), 
      'index.html should include debug toggle button');
  });

  it('includes debug transforms section', () => {
    assert.ok(indexSrc.includes('id="debugTransforms"'), 
      'index.html should include debug transforms section');
  });

  it('includes debug pose editor section', () => {
    assert.ok(indexSrc.includes('id="debugPoseEditor"'), 
      'index.html should include debug pose editor section');
  });

  it('includes copy JSON button', () => {
    assert.ok(indexSrc.includes('id="debugCopyJson"'), 
      'index.html should include copy JSON button');
  });
});

describe('app.js imports debug panel', () => {
  const appPath = join(__dirname, '..', 'docs', 'js', 'app.js');
  const appSrc = readFileSync(appPath, 'utf-8');

  it('imports initDebugPanel', () => {
    assert.ok(appSrc.includes('initDebugPanel'), 
      'app.js should import initDebugPanel');
  });

  it('imports updateDebugPanel', () => {
    assert.ok(appSrc.includes('updateDebugPanel'), 
      'app.js should import updateDebugPanel');
  });

  it('calls initDebugPanel in boot function', () => {
    assert.ok(appSrc.includes('initDebugPanel()'), 
      'app.js should call initDebugPanel in boot function');
  });

  it('calls updateDebugPanel in game loop', () => {
    assert.ok(appSrc.includes('updateDebugPanel()'), 
      'app.js should call updateDebugPanel in game loop');
  });
});

describe('styles.css includes debug panel styles', () => {
  const stylesPath = join(__dirname, '..', 'docs', 'styles.css');
  const stylesSrc = readFileSync(stylesPath, 'utf-8');

  it('includes debug panel styles', () => {
    assert.ok(stylesSrc.includes('.debug-panel'), 
      'styles.css should include debug panel styles');
  });

  it('includes debug panel hidden state', () => {
    assert.ok(stylesSrc.includes('.debug-panel--hidden'), 
      'styles.css should include debug panel hidden state');
  });

  it('includes debug table styles', () => {
    assert.ok(stylesSrc.includes('.debug-table'), 
      'styles.css should include debug table styles');
  });

  it('includes debug input styles', () => {
    assert.ok(stylesSrc.includes('.debug-input'), 
      'styles.css should include debug input styles');
  });

  it('includes debug copy button styles', () => {
    assert.ok(stylesSrc.includes('.debug-copy-btn'), 
      'styles.css should include debug copy button styles');
  });
});
