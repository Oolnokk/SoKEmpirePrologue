import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Freeze Joint Angles feature', () => {
  const configPath = join(__dirname, '..', 'docs', 'config', 'config.js');
  const configSrc = readFileSync(configPath, 'utf-8');

  it('adds debug.freezeAngles to CONFIG with default false', () => {
    assert.ok(configSrc.includes('debug:'), 
      'config.js should include debug section');
    assert.ok(configSrc.includes('freezeAngles'), 
      'config.js should include freezeAngles property');
    assert.ok(configSrc.includes('freezeAngles: false'), 
      'config.js should default freezeAngles to false');
  });

  it('includes comment documentation', () => {
    assert.ok(configSrc.includes('// Debug options') || configSrc.includes('Debug'), 
      'config.js should include comment about debug options');
  });
});

describe('animator.js freeze check', () => {
  const animatorPath = join(__dirname, '..', 'docs', 'js', 'animator.js');
  const animatorSrc = readFileSync(animatorPath, 'utf-8');

  it('checks CONFIG.debug.freezeAngles in updatePoses', () => {
    assert.ok(animatorSrc.includes('freezeAngles'), 
      'animator.js should check freezeAngles flag');
  });

  it('returns early when freezeAngles is true', () => {
    assert.ok(animatorSrc.includes('if (C.debug?.freezeAngles) return'), 
      'animator.js should return early when freezeAngles is true');
  });

  it('includes comment explaining freeze behavior', () => {
    assert.ok(
      animatorSrc.includes('frozen') || 
      animatorSrc.includes('freeze') || 
      animatorSrc.includes('manual'),
      'animator.js should include comment about freeze behavior'
    );
  });
});

describe('debug-panel.js freeze checkbox', () => {
  const debugPanelPath = join(__dirname, '..', 'docs', 'js', 'debug-panel.js');
  const debugPanelSrc = readFileSync(debugPanelPath, 'utf-8');

  it('sets up freezeAnglesCheckbox event listener', () => {
    assert.ok(debugPanelSrc.includes('freezeAnglesCheckbox'), 
      'debug-panel.js should reference freezeAnglesCheckbox');
  });

  it('updates CONFIG.debug.freezeAngles on checkbox change', () => {
    assert.ok(debugPanelSrc.includes('C.debug.freezeAngles'), 
      'debug-panel.js should update CONFIG.debug.freezeAngles');
  });

  it('initializes checkbox state from config', () => {
    assert.ok(
      debugPanelSrc.includes('freezeCheckbox.checked') || 
      debugPanelSrc.includes('.checked ='),
      'debug-panel.js should initialize checkbox state'
    );
  });
});

describe('index.html freeze checkbox UI', () => {
  const indexPath = join(__dirname, '..', 'docs', 'index.html');
  const indexSrc = readFileSync(indexPath, 'utf-8');

  it('includes freeze angles checkbox', () => {
    assert.ok(indexSrc.includes('freezeAnglesCheckbox'), 
      'index.html should include freeze angles checkbox with id');
  });

  it('includes descriptive label text', () => {
    assert.ok(
      indexSrc.includes('Freeze Joint Angles') || 
      indexSrc.includes('Freeze Angles'),
      'index.html should include descriptive label for checkbox'
    );
  });

  it('includes help text or title attribute', () => {
    assert.ok(
      indexSrc.includes('title=') && indexSrc.includes('manual'),
      'index.html should include help text in title attribute'
    );
  });

  it('checkbox is within debug panel', () => {
    const debugPanelStart = indexSrc.indexOf('id="debugPanel"');
    const debugPanelEnd = indexSrc.indexOf('</section>', debugPanelStart);
    const checkboxPos = indexSrc.indexOf('freezeAnglesCheckbox');
    
    assert.ok(
      checkboxPos > debugPanelStart && checkboxPos < debugPanelEnd,
      'freeze angles checkbox should be within debug panel section'
    );
  });
});

describe('styles.css freeze checkbox styles', () => {
  const stylesPath = join(__dirname, '..', 'docs', 'styles.css');
  const stylesSrc = readFileSync(stylesPath, 'utf-8');

  it('includes debug-panel-controls styling', () => {
    assert.ok(stylesSrc.includes('.debug-panel-controls'), 
      'styles.css should include debug-panel-controls styles');
  });

  it('includes debug-checkbox-label styling', () => {
    assert.ok(stylesSrc.includes('.debug-checkbox-label'), 
      'styles.css should include debug-checkbox-label styles');
  });
});
