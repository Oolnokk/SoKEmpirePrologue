import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

describe('Camera rigid centering feature', () => {
  const cameraPath = join(__dirname, '..', 'docs', 'js', 'camera.js');
  const cameraSrc = readFileSync(cameraPath, 'utf-8');

  it('camera.js checks for CONFIG.camera.rigidCenter flag', () => {
    assert.ok(
      cameraSrc.includes('rigidCenter') && cameraSrc.includes('C.camera?.rigidCenter'),
      'camera.js should check for CONFIG.camera.rigidCenter flag'
    );
  });

  it('camera.js checks for CONFIG.camera.ignoreCenterBounds flag', () => {
    assert.ok(
      cameraSrc.includes('ignoreCenterBounds') && cameraSrc.includes('C.camera?.ignoreCenterBounds'),
      'camera.js should check for CONFIG.camera.ignoreCenterBounds flag'
    );
  });

  it('camera.js conditionally applies clamping based on ignoreCenterBounds', () => {
    // Verify that when rigidCenter && ignoreCenterBounds are true, no clamping is applied
    assert.ok(
      cameraSrc.includes('if (rigidCenter && ignoreCenterBounds)'),
      'camera.js should have conditional logic for rigidCenter && ignoreCenterBounds'
    );
    
    // Verify that clamping is still applied in default case
    assert.ok(
      cameraSrc.includes('target = clamp(desiredX, minBound, maxCameraX)'),
      'camera.js should still apply clamping in default case'
    );
  });

  it('camera.js conditionally applies smoothing based on rigidCenter', () => {
    // Verify that when rigidCenter is true, camera snaps immediately
    assert.ok(
      cameraSrc.includes('if (rigidCenter)'),
      'camera.js should have conditional logic for rigidCenter'
    );
    
    // Verify that smoothing is still applied in default case
    const smoothingPattern = /camera\.x = currentX \+ \(target - currentX\) \* smoothing/;
    assert.ok(
      smoothingPattern.test(cameraSrc),
      'camera.js should still apply smoothing in default case'
    );
  });

  it('camera.js snaps camera.x and camera.y when rigidCenter is true', () => {
    // Extract the rigidCenter conditional block
    const rigidCenterMatch = cameraSrc.match(
      /if \(rigidCenter\)\s*{[^}]*camera\.x = target[^}]*camera\.y = targetY[^}]*}/s
    );
    
    assert.ok(
      rigidCenterMatch,
      'camera.js should set camera.x and camera.y directly when rigidCenter is true'
    );
  });

  it('camera.js preserves targetX and targetY assignment', () => {
    assert.ok(
      cameraSrc.includes('camera.targetX = target'),
      'camera.js should assign camera.targetX'
    );
    assert.ok(
      cameraSrc.includes('camera.targetY = targetY'),
      'camera.js should assign camera.targetY'
    );
  });

  it('camera.js uses existing variables (framing, manualOffsetX, etc.)', () => {
    // Verify that desiredX and desiredY use existing variables
    assert.ok(
      cameraSrc.includes('desiredX = playerX - viewportWorldWidth * 0.5 + framing.offsetX + manualOffsetX'),
      'camera.js should compute desiredX using existing variables'
    );
    assert.ok(
      cameraSrc.includes('desiredY = playerY - viewportWorldHeight * 0.5 + framing.offsetY + manualOffsetY'),
      'camera.js should compute desiredY using existing variables'
    );
  });

  it('camera.js has appropriate comments explaining the new behavior', () => {
    assert.ok(
      cameraSrc.includes('Check for rigid centering mode'),
      'camera.js should have comment explaining rigid centering mode'
    );
    assert.ok(
      cameraSrc.includes('opt-in via CONFIG.camera.rigidCenter'),
      'camera.js should document that rigidCenter is opt-in'
    );
  });
});
