import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Character dropdown resilience', () => {
  const appJsPath = join(__dirname, '..', 'docs', 'js', 'app.js');
  const appJsSrc = readFileSync(appJsPath, 'utf-8');

  it('computes the previous selection before rebuilding options', () => {
    assert.ok(
      /const previousSelection\s*=/.test(appJsSrc),
      'initCharacterDropdown should compute a previousSelection before clearing the dropdown'
    );

    assert.ok(
      appJsSrc.includes('characterSelect.value ||') && appJsSrc.includes('window.GAME?.selectedCharacter'),
      'previousSelection should consider the existing DOM value and window.GAME.selectedCharacter state'
    );
  });

  it('re-applies the previous selection when it remains available', () => {
    assert.ok(
      /const hasPreviousSelection\s*=/.test(appJsSrc),
      'initCharacterDropdown should detect whether the previous selection is still present in the config'
    );

    assert.ok(
      appJsSrc.includes('Object.prototype.hasOwnProperty.call(characters, previousSelection)'),
      'previous selection check should guard against stale config entries'
    );

    assert.ok(
      appJsSrc.includes("onCharacterChange({ target: { value: nextSelection } });"),
      'initCharacterDropdown should invoke onCharacterChange with the restored selection to sync runtime state'
    );
  });

  it('clears runtime state when the selection is removed', () => {
    assert.ok(
      appJsSrc.includes('if (!selectedChar || !map[selectedChar]) {'),
      'change handler should guard against cleared or missing characters'
    );

    assert.ok(
      appJsSrc.includes('window.GAME.selectedCharacter = null;'),
      'clearing the selection should reset window.GAME.selectedCharacter'
    );

    assert.ok(
      appJsSrc.includes('setAbilitySelection(defaults, { syncDropdowns: true })'),
      'clearing the selection should restore ability dropdowns from defaults'
    );
  });
});
