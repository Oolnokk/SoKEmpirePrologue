import { describe, it } from 'node:test';
import { strictEqual, ok, deepStrictEqual } from 'assert';

/**
 * Tests for cosmetics xform/offset precedence and resolution
 * 
 * Requirements:
 * 1. style.xform should be used unless meta.offset is explicitly specified with ax/ay
 * 2. empty meta.offset should not override style.xform
 * 3. normalizeOffsetInput preserves numeric semantics:
 *    - plain numeric values in xform.ax/xform.ay remain treated as 'unitless' 
 *      consistent with previous behavior (fall back to xformUnits)
 *    - string with %/px parse as percent/px
 * 4. applyOffsetToBone and influence application use the same resolved offsetSpec
 */

describe('Cosmetics xform/offset precedence', () => {
  // Helper to simulate the logic
  function hasOffsetFields(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return obj.ax != null || obj.ay != null || obj.x != null || obj.y != null;
  }

  function resolveMetaValue(metaField, normalizedKey, rawKey) {
    if (metaField == null) return null;
    if (typeof metaField !== 'object' || Array.isArray(metaField) || hasOffsetFields(metaField)) {
      return metaField;
    }
    if (normalizedKey && metaField[normalizedKey] != null) {
      return metaField[normalizedKey];
    }
    if (rawKey && metaField[rawKey] != null) {
      return metaField[rawKey];
    }
    if (metaField.base != null) {
      return metaField.base;
    }
    if (metaField.default != null) {
      return metaField.default;
    }
    return null;
  }

  function isPercentUnit(unit) {
    const normalized = (unit || '').toString().toLowerCase();
    return normalized === 'percent' || normalized === '%' || normalized === 'pct';
  }

  function parseUnitlessOffset(value, fallbackUnits) {
    const fallbackIsPercent = isPercentUnit(fallbackUnits);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
      if (percentMatch) {
        const pct = Number(percentMatch[1]);
        return { value: Number.isFinite(pct) ? pct / 100 : 0, isPercent: true };
      }
      const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*px$/i);
      if (pxMatch) {
        const px = Number(pxMatch[1]);
        return { value: Number.isFinite(px) ? px : 0, isPercent: false };
      }
      const num = Number.parseFloat(trimmed);
      return { value: Number.isFinite(num) ? num : 0, isPercent: fallbackIsPercent };
    }
    if (Number.isFinite(value)) {
      return { value, isPercent: fallbackIsPercent };
    }
    return { value: 0, isPercent: fallbackIsPercent };
  }

  function normalizeOffsetInput(rawAx, rawAy, unitHint) {
    const units = (unitHint || 'px').toString().toLowerCase();
    const axParsed = parseUnitlessOffset(rawAx, units);
    const ayParsed = parseUnitlessOffset(rawAy, units);
    return {
      ax: Number.isFinite(axParsed.value) ? axParsed.value : 0,
      ay: Number.isFinite(ayParsed.value) ? ayParsed.value : 0,
      axIsPercent: !!axParsed.isPercent,
      ayIsPercent: !!ayParsed.isPercent,
      units
    };
  }

  it('empty meta.offset should not override style.xform', () => {
    const meta = { offset: {} };
    const xform = { ax: 10, ay: 20 };
    const xformUnits = 'px';

    const metaOffset = resolveMetaValue(meta.offset, 'torso', 'torso');
    
    // Current buggy logic:
    // const rawAx = (metaOffset && (metaOffset.ax ?? metaOffset.x)) ?? xform.ax ?? 0;
    // If metaOffset is {}, then (metaOffset && (metaOffset.ax ?? metaOffset.x)) evaluates to undefined
    // So it should fall back to xform.ax
    
    // But the issue is: does resolveMetaValue return {} or null for empty offset?
    console.log('metaOffset:', metaOffset); // This will be null because hasOffsetFields({}) returns false
    
    strictEqual(metaOffset, null, 'empty meta.offset should resolve to null');
  });

  it('meta.offset with ax/ay should override style.xform', () => {
    const meta = { offset: { ax: 5, ay: 10 } };
    const xform = { ax: 100, ay: 200 };

    const metaOffset = resolveMetaValue(meta.offset, 'torso', 'torso');
    
    ok(metaOffset != null, 'meta.offset with ax/ay should not be null');
    strictEqual(metaOffset.ax, 5);
    strictEqual(metaOffset.ay, 10);
  });

  it('numeric xform.ax/ay with px units should be treated as px', () => {
    const offsetSpec = normalizeOffsetInput(10, 20, 'px');
    strictEqual(offsetSpec.ax, 10);
    strictEqual(offsetSpec.ay, 20);
    strictEqual(offsetSpec.axIsPercent, false);
    strictEqual(offsetSpec.ayIsPercent, false);
  });

  it('numeric xform.ax/ay with percent units should be treated as percent', () => {
    const offsetSpec = normalizeOffsetInput(0.1, 0.2, 'percent');
    strictEqual(offsetSpec.ax, 0.1);
    strictEqual(offsetSpec.ay, 0.2);
    strictEqual(offsetSpec.axIsPercent, true);
    strictEqual(offsetSpec.ayIsPercent, true);
  });

  it('string "10%" should parse as 0.1 with isPercent=true', () => {
    const offsetSpec = normalizeOffsetInput('10%', '20%', 'px');
    strictEqual(offsetSpec.ax, 0.1);
    strictEqual(offsetSpec.ay, 0.2);
    strictEqual(offsetSpec.axIsPercent, true);
    strictEqual(offsetSpec.ayIsPercent, true);
  });

  it('string "10px" should parse as 10 with isPercent=false', () => {
    const offsetSpec = normalizeOffsetInput('10px', '20px', 'percent');
    strictEqual(offsetSpec.ax, 10);
    strictEqual(offsetSpec.ay, 20);
    strictEqual(offsetSpec.axIsPercent, false);
    strictEqual(offsetSpec.ayIsPercent, false);
  });

  it('correct precedence: style.xform used when meta.offset is absent', () => {
    const meta = {};
    const xform = { ax: 10, ay: 20 };
    const xformUnits = 'px';

    const metaOffset = resolveMetaValue(meta.offset, 'torso', 'torso');
    const offsetUnits = metaOffset?.units ?? metaOffset?.unit ?? meta.offsetUnits ?? xformUnits;
    const rawAx = (metaOffset && (metaOffset.ax ?? metaOffset.x)) ?? xform.ax ?? 0;
    const rawAy = (metaOffset && (metaOffset.ay ?? metaOffset.y)) ?? xform.ay ?? 0;

    strictEqual(metaOffset, null);
    strictEqual(rawAx, 10);
    strictEqual(rawAy, 20);
  });

  it('correct precedence: style.xform used when meta.offset is empty object', () => {
    const meta = { offset: {} };
    const xform = { ax: 10, ay: 20 };
    const xformUnits = 'px';

    const metaOffset = resolveMetaValue(meta.offset, 'torso', 'torso');
    const offsetUnits = metaOffset?.units ?? metaOffset?.unit ?? meta.offsetUnits ?? xformUnits;
    
    // Fixed logic should handle empty object correctly
    const rawAx = (metaOffset && (metaOffset.ax ?? metaOffset.x)) ?? xform.ax ?? 0;
    const rawAy = (metaOffset && (metaOffset.ay ?? metaOffset.y)) ?? xform.ay ?? 0;

    // metaOffset should be null for empty object
    strictEqual(metaOffset, null, 'empty offset should resolve to null');
    strictEqual(rawAx, 10, 'should use xform.ax when meta.offset is empty');
    strictEqual(rawAy, 20, 'should use xform.ay when meta.offset is empty');
  });

  it('correct precedence: meta.offset.ax overrides style.xform.ax', () => {
    const meta = { offset: { ax: 5, ay: 10 } };
    const xform = { ax: 100, ay: 200 };

    const metaOffset = resolveMetaValue(meta.offset, 'torso', 'torso');
    const rawAx = (metaOffset && (metaOffset.ax ?? metaOffset.x)) ?? xform.ax ?? 0;
    const rawAy = (metaOffset && (metaOffset.ay ?? metaOffset.y)) ?? xform.ay ?? 0;

    strictEqual(rawAx, 5);
    strictEqual(rawAy, 10);
  });
});

describe('Edge case: meta.offset with only units field', () => {
  function hasOffsetFields(obj) {
    if (!obj || typeof obj !== 'object') return false;
    return obj.ax != null || obj.ay != null || obj.x != null || obj.y != null;
  }

  function resolveMetaValue(metaField, normalizedKey, rawKey) {
    if (metaField == null) return null;
    if (typeof metaField !== 'object' || Array.isArray(metaField) || hasOffsetFields(metaField)) {
      return metaField;
    }
    if (normalizedKey && metaField[normalizedKey] != null) {
      return metaField[normalizedKey];
    }
    if (rawKey && metaField[rawKey] != null) {
      return metaField[rawKey];
    }
    if (metaField.base != null) {
      return metaField.base;
    }
    if (metaField.default != null) {
      return metaField.default;
    }
    return null;
  }

  it('meta.offset with only units should not override style.xform ax/ay', () => {
    // This is a potential bug scenario: if meta.offset = { units: 'px' } (no ax/ay),
    // it should not prevent style.xform.ax/ay from being used
    const meta = { offset: { units: 'px' } };
    const xform = { ax: 100, ay: 200 };
    const xformUnits = 'percent';

    const metaOffset = resolveMetaValue(meta.offset, 'torso', 'torso');
    // metaOffset should be null because { units: 'px' } has no offset fields
    strictEqual(metaOffset, null, 'metaOffset with only units should be null');
    
    const offsetUnits = metaOffset?.units ?? metaOffset?.unit ?? meta.offsetUnits ?? xformUnits;
    const rawAx = (metaOffset && (metaOffset.ax ?? metaOffset.x)) ?? xform.ax ?? 0;
    const rawAy = (metaOffset && (metaOffset.ay ?? metaOffset.y)) ?? xform.ay ?? 0;

    // Should use xform values
    strictEqual(rawAx, 100);
    strictEqual(rawAy, 200);
    // Should use xformUnits since metaOffset is null and meta.offsetUnits is undefined
    strictEqual(offsetUnits, 'percent');
  });

  it('meta.offsetUnits without meta.offset should not affect style.xform', () => {
    // If meta.offsetUnits exists but meta.offset doesn't, the units should still be used
    // but the ax/ay should come from style.xform
    const meta = { offsetUnits: 'px' };
    const xform = { ax: 50, ay: 75 };
    const xformUnits = 'percent';

    const metaOffset = resolveMetaValue(meta.offset, 'torso', 'torso');
    strictEqual(metaOffset, null);

    const offsetUnits = metaOffset?.units ?? metaOffset?.unit ?? meta.offsetUnits ?? xformUnits;
    const rawAx = (metaOffset && (metaOffset.ax ?? metaOffset.x)) ?? xform.ax ?? 0;
    const rawAy = (metaOffset && (metaOffset.ay ?? metaOffset.y)) ?? xform.ay ?? 0;

    strictEqual(rawAx, 50);
    strictEqual(rawAy, 75);
    // meta.offsetUnits should be used
    strictEqual(offsetUnits, 'px');
  });
});

describe('Offset application to bone', () => {
  function applyOffsetToBone(bone, axis, offsetSpec) {
    if (!offsetSpec) {
      return { offsetX: 0, offsetY: 0 };
    }
    const len = Number.isFinite(bone?.len) ? bone.len : 0;
    const ax = offsetSpec.axIsPercent ? offsetSpec.ax * len : offsetSpec.ax;
    const ay = offsetSpec.ayIsPercent ? offsetSpec.ay * len : offsetSpec.ay;
    
    // resolveOffsetForBone logic
    const offsetX = ax * axis.fx + ay * axis.rx;
    const offsetY = ax * axis.fy + ay * axis.ry;
    return { offsetX, offsetY };
  }

  function normalizeOffsetInput(rawAx, rawAy, unitHint) {
    const units = (unitHint || 'px').toString().toLowerCase();
    
    function isPercentUnit(unit) {
      const normalized = (unit || '').toString().toLowerCase();
      return normalized === 'percent' || normalized === '%' || normalized === 'pct';
    }

    function parseUnitlessOffset(value, fallbackUnits) {
      const fallbackIsPercent = isPercentUnit(fallbackUnits);
      if (typeof value === 'string') {
        const trimmed = value.trim();
        const percentMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*%$/);
        if (percentMatch) {
          const pct = Number(percentMatch[1]);
          return { value: Number.isFinite(pct) ? pct / 100 : 0, isPercent: true };
        }
        const pxMatch = trimmed.match(/^(-?\d+(?:\.\d+)?)\s*px$/i);
        if (pxMatch) {
          const px = Number(pxMatch[1]);
          return { value: Number.isFinite(px) ? px : 0, isPercent: false };
        }
        const num = Number.parseFloat(trimmed);
        return { value: Number.isFinite(num) ? num : 0, isPercent: fallbackIsPercent };
      }
      if (Number.isFinite(value)) {
        return { value, isPercent: fallbackIsPercent };
      }
      return { value: 0, isPercent: fallbackIsPercent };
    }

    const axParsed = parseUnitlessOffset(rawAx, units);
    const ayParsed = parseUnitlessOffset(rawAy, units);
    return {
      ax: Number.isFinite(axParsed.value) ? axParsed.value : 0,
      ay: Number.isFinite(ayParsed.value) ? ayParsed.value : 0,
      axIsPercent: !!axParsed.isPercent,
      ayIsPercent: !!ayParsed.isPercent,
      units
    };
  }

  it('pixel offset on bone with length 100 and angle 0 (up)', () => {
    const bone = { x: 0, y: 0, len: 100, ang: 0 };
    // angle 0 = up, basis: fx=sin(0)=0, fy=-cos(0)=-1, rx=cos(0)=1, ry=sin(0)=0
    const axis = { fx: 0, fy: -1, rx: 1, ry: 0 };
    const offsetSpec = normalizeOffsetInput(10, 20, 'px');
    
    const { offsetX, offsetY } = applyOffsetToBone(bone, axis, offsetSpec);
    
    // offsetX = ax * axis.fx + ay * axis.rx = 10 * 0 + 20 * 1 = 20
    // offsetY = ax * axis.fy + ay * axis.ry = 10 * -1 + 20 * 0 = -10
    strictEqual(offsetX, 20);
    strictEqual(offsetY, -10);
  });

  it('percent offset on bone with length 100', () => {
    const bone = { x: 0, y: 0, len: 100, ang: 0 };
    const axis = { fx: 0, fy: -1, rx: 1, ry: 0 };
    const offsetSpec = normalizeOffsetInput(0.1, 0.2, 'percent');
    
    const { offsetX, offsetY } = applyOffsetToBone(bone, axis, offsetSpec);
    
    // ax = 0.1 * 100 = 10, ay = 0.2 * 100 = 20
    // offsetX = 10 * 0 + 20 * 1 = 20
    // offsetY = 10 * -1 + 20 * 0 = -10
    strictEqual(offsetX, 20);
    strictEqual(offsetY, -10);
  });
});
