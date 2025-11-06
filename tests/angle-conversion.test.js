import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Angle conversion centralization (Issue #56)', () => {
  const jsDir = join(__dirname, '..', 'docs', 'js');
  const jsFiles = readdirSync(jsDir).filter(f => f.endsWith('.js'));

  it('math-utils.js provides centralized conversion utilities', () => {
    const mathUtilsPath = join(jsDir, 'math-utils.js');
    const mathUtilsSrc = readFileSync(mathUtilsPath, 'utf-8');
    
    assert.ok(mathUtilsSrc.includes('export function degToRad'), 
      'math-utils.js should export degToRad function');
    assert.ok(mathUtilsSrc.includes('export function radToDeg'), 
      'math-utils.js should export radToDeg function');
    assert.ok(mathUtilsSrc.includes('export function radToDegNum'), 
      'math-utils.js should export radToDegNum function (numeric version)');
    assert.ok(mathUtilsSrc.includes('CONVERSION BOUNDARY RULES'), 
      'math-utils.js should document conversion boundaries');
  });

  it('no raw degree-to-radian conversions outside math-utils.js', () => {
    for (const file of jsFiles) {
      if (file === 'math-utils.js') continue; // Skip the utility file itself
      
      const filePath = join(jsDir, file);
      const src = readFileSync(filePath, 'utf-8');
      
      // Check for raw conversion patterns
      const hasRawDegToRad = /[^a-zA-Z](Math\.PI\s*\/\s*180)/.test(src);
      assert.ok(!hasRawDegToRad, 
        `${file} should not contain raw 'Math.PI / 180' conversions. Use degToRad() from math-utils.js`);
    }
  });

  it('no raw radian-to-degree conversions outside math-utils.js', () => {
    for (const file of jsFiles) {
      if (file === 'math-utils.js') continue;
      
      const filePath = join(jsDir, file);
      const src = readFileSync(filePath, 'utf-8');
      
      // Check for raw conversion patterns
      const hasRawRadToDeg = /[^a-zA-Z](180\s*\/\s*Math\.PI)/.test(src);
      assert.ok(!hasRawRadToDeg, 
        `${file} should not contain raw '180 / Math.PI' conversions. Use radToDeg() from math-utils.js`);
    }
  });

  it('animator.js uses centralized degToRad', () => {
    const animatorPath = join(jsDir, 'animator.js');
    const animatorSrc = readFileSync(animatorPath, 'utf-8');
    
    assert.ok(animatorSrc.includes('import') && animatorSrc.includes('degToRad'), 
      'animator.js should import degToRad from math-utils.js');
    assert.ok(animatorSrc.includes('from \'./math-utils.js'), 
      'animator.js should import from math-utils.js');
    assert.ok(!animatorSrc.includes('const RAD = Math.PI'), 
      'animator.js should not define inline RAD constant');
  });

  it('debug-panel.js uses centralized conversion utilities', () => {
    const debugPanelPath = join(jsDir, 'debug-panel.js');
    const debugPanelSrc = readFileSync(debugPanelPath, 'utf-8');
    
    assert.ok(debugPanelSrc.includes('import') && debugPanelSrc.includes('radToDeg'), 
      'debug-panel.js should import radToDeg from math-utils.js');
    assert.ok(debugPanelSrc.includes('import') && debugPanelSrc.includes('radToDegNum'), 
      'debug-panel.js should import radToDegNum from math-utils.js');
    assert.ok(debugPanelSrc.includes('import') && debugPanelSrc.includes('degToRad'), 
      'debug-panel.js should import degToRad from math-utils.js');
    
    // Ensure no duplicate constants
    const radToDegConstCount = (debugPanelSrc.match(/const\s+RAD_TO_DEG/g) || []).length;
    assert.equal(radToDegConstCount, 0, 
      'debug-panel.js should not define RAD_TO_DEG constants');
    
    // Ensure no parseFloat on radToDeg results (use radToDegNum instead)
    assert.ok(!debugPanelSrc.includes('parseFloat(radToDeg'), 
      'debug-panel.js should use radToDegNum instead of parseFloat(radToDeg())');
  });

  it('documents conversion boundaries clearly', () => {
    const mathUtilsPath = join(jsDir, 'math-utils.js');
    const mathUtilsSrc = readFileSync(mathUtilsPath, 'utf-8');
    
    assert.ok(mathUtilsSrc.includes('INTERNAL REPRESENTATION'), 
      'math-utils.js should document internal representation (radians)');
    assert.ok(mathUtilsSrc.includes('EXTERNAL BOUNDARIES'), 
      'math-utils.js should document external boundaries (degrees)');
    assert.ok(mathUtilsSrc.includes('CONVERSION POINTS'), 
      'math-utils.js should document conversion points');
    assert.ok(mathUtilsSrc.includes('CONFIG.poses'), 
      'math-utils.js should mention CONFIG.poses as degree boundary');
    assert.ok(mathUtilsSrc.includes('F.jointAngles'), 
      'math-utils.js should mention F.jointAngles as radian representation');
  });
});
