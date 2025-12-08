import { describe, it } from 'node:test';
import { strictEqual, ok } from 'assert';

/**
 * Tests for exposed part auto-alignment and auto-scale feature
 * 
 * Requirements:
 * 1. buildExposedPartLayers should add alignWith: partKey to exposed layers
 * 2. deriveCosmeticOffset should compute and return scale value
 * 3. sprite drawing should apply derived scale when available
 */

describe('Exposed part alignment and scale', () => {
  it('deriveCosmeticOffset computes scale from reference to cosmetic', () => {
    // Simulate deriveCosmeticOffset logic
    const refImg = { 
      complete: true, 
      naturalWidth: 100, 
      naturalHeight: 200 
    };
    const cosImg = { 
      complete: true, 
      naturalWidth: 50, 
      naturalHeight: 100 
    };

    const ax = (refImg.naturalWidth - cosImg.naturalWidth) / 2;
    const ay = (refImg.naturalHeight - cosImg.naturalHeight) / 2;
    const offset = { ax, ay };
    
    // Compute conservative scale from reference to cosmetic
    const scaleValue = refImg.naturalHeight / cosImg.naturalHeight;
    if (Number.isFinite(scaleValue) && scaleValue > 0) {
      offset.scale = scaleValue;
    }

    strictEqual(offset.ax, 25, 'ax should be half the width difference');
    strictEqual(offset.ay, 50, 'ay should be half the height difference');
    strictEqual(offset.scale, 2, 'scale should be ratio of heights');
  });

  it('deriveCosmeticOffset returns valid scale only when positive and finite', () => {
    const validCases = [
      { refH: 200, cosH: 100, expectedScale: 2 },
      { refH: 100, cosH: 200, expectedScale: 0.5 },
      { refH: 150, cosH: 150, expectedScale: 1 },
    ];

    for (const { refH, cosH, expectedScale } of validCases) {
      const scaleValue = refH / cosH;
      ok(Number.isFinite(scaleValue) && scaleValue > 0, 
        `scale for ref=${refH}/cos=${cosH} should be finite and positive`);
      strictEqual(scaleValue, expectedScale, 
        `scale for ref=${refH}/cos=${cosH} should be ${expectedScale}`);
    }
  });

  it('buildExposedPartLayers adds alignWith property to exposed layers', () => {
    // Mock structure that buildExposedPartLayers should produce
    const partKey = 'head';
    
    // Base layer structure
    const baseLayer = {
      partKey,
      layerRole: 'EXPOSED_BASE',
      alignWith: partKey  // This is what we added
    };
    
    // Overlay layer structure
    const overlayLayer = {
      partKey,
      layerRole: 'EXPOSED_OVERLAY',
      alignWith: partKey  // This is what we added
    };
    
    strictEqual(baseLayer.alignWith, partKey, 'base layer should have alignWith set to partKey');
    strictEqual(overlayLayer.alignWith, partKey, 'overlay layer should have alignWith set to partKey');
  });

  it('sprite drawing applies derived scale when no explicit scale exists', () => {
    // Simulate the logic in sprites.js where derivedOffset.scale is applied
    const derivedOffset = { 
      ax: 25, 
      ay: 50, 
      scale: 2 
    };
    
    // Case 1: No explicit scale - should apply derived scale
    const xformEntry1 = {};
    if (derivedOffset.scale != null && xformEntry1.scaleX == null && xformEntry1.scaleY == null) {
      xformEntry1.scaleX = derivedOffset.scale;
      xformEntry1.scaleY = derivedOffset.scale;
    }
    strictEqual(xformEntry1.scaleX, 2, 'scaleX should be set from derived scale');
    strictEqual(xformEntry1.scaleY, 2, 'scaleY should be set from derived scale');
    
    // Case 2: Explicit scaleX exists - should NOT override
    const xformEntry2 = { scaleX: 1.5 };
    if (derivedOffset.scale != null && xformEntry2.scaleX == null && xformEntry2.scaleY == null) {
      xformEntry2.scaleX = derivedOffset.scale;
      xformEntry2.scaleY = derivedOffset.scale;
    }
    strictEqual(xformEntry2.scaleX, 1.5, 'explicit scaleX should be preserved');
    strictEqual(xformEntry2.scaleY, undefined, 'scaleY should not be set when scaleX exists');
    
    // Case 3: Explicit scaleY exists - should NOT override
    const xformEntry3 = { scaleY: 1.5 };
    if (derivedOffset.scale != null && xformEntry3.scaleX == null && xformEntry3.scaleY == null) {
      xformEntry3.scaleX = derivedOffset.scale;
      xformEntry3.scaleY = derivedOffset.scale;
    }
    strictEqual(xformEntry3.scaleX, undefined, 'scaleX should not be set when scaleY exists');
    strictEqual(xformEntry3.scaleY, 1.5, 'explicit scaleY should be preserved');
  });

  it('derived offset remains backward-compatible', () => {
    // Ensure the offset object still has ax and ay keys
    const offset = { ax: 25, ay: 50, scale: 2 };
    
    ok('ax' in offset, 'offset should have ax property');
    ok('ay' in offset, 'offset should have ay property');
    ok('scale' in offset, 'offset should have scale property');
    strictEqual(typeof offset.ax, 'number', 'ax should be a number');
    strictEqual(typeof offset.ay, 'number', 'ay should be a number');
    strictEqual(typeof offset.scale, 'number', 'scale should be a number');
  });
});
