import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Fighter dropdown selection fix', () => {
  const appJsPath = join(__dirname, '..', 'docs', 'js', 'app.js');
  const appJsSrc = readFileSync(appJsPath, 'utf-8');

  it('fighter dropdown change handler sets window.GAME.selectedFighter', () => {
    // Find the fighterSelect.addEventListener('change', ...) section
    const changeHandlerRegex = /fighterSelect\.addEventListener\s*\(\s*['"]change['"]\s*,[\s\S]*?\}\s*\);/;
    const changeHandlerMatch = appJsSrc.match(changeHandlerRegex);
    
    assert.ok(changeHandlerMatch, 'Fighter dropdown should have a change event listener');
    
    const handlerCode = changeHandlerMatch[0];
    
    // Verify that the handler sets window.GAME.selectedFighter
    assert.ok(
      handlerCode.includes('window.GAME.selectedFighter'),
      'Change handler should set window.GAME.selectedFighter to ensure sprite loading picks up the correct fighter'
    );
    
    // Verify it's being set to selectedFighter (which comes from e.target.value)
    assert.ok(
      handlerCode.includes('window.GAME.selectedFighter = selectedFighter') ||
      handlerCode.includes('window.GAME.selectedFighter = e.target.value'),
      'window.GAME.selectedFighter should be set to selectedFighter (the selected fighter from e.target.value)'
    );
  });

  it('fighter dropdown change handler still sets currentSelectedFighter', () => {
    // Find the fighterSelect.addEventListener('change', ...) section
    const changeHandlerRegex = /fighterSelect\.addEventListener\s*\(\s*['"]change['"]\s*,[\s\S]*?\}\s*\);/;
    const changeHandlerMatch = appJsSrc.match(changeHandlerRegex);
    
    assert.ok(changeHandlerMatch, 'Fighter dropdown should have a change event listener');
    
    const handlerCode = changeHandlerMatch[0];
    
    // Verify that the handler still sets currentSelectedFighter (local variable)
    assert.ok(
      handlerCode.includes('currentSelectedFighter'),
      'Change handler should still set currentSelectedFighter for local tracking'
    );
  });
});
