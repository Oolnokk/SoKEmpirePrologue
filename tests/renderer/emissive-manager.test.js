import { describe, it, beforeEach } from 'node:test';
import { strictEqual, ok } from 'assert';
import { EmissiveManager } from '../../src/renderer/EmissiveManager.js';
import { TimeOfDay } from '../../src/renderer/TimeOfDay.js';

// Mock renderer
class MockRenderer {
  constructor() {
    this.THREE = {
      Object3D: class {},
    };
  }
}

describe('EmissiveManager', () => {
  let emissiveManager;
  let mockRenderer;
  let timeOfDay;

  beforeEach(() => {
    mockRenderer = new MockRenderer();
    timeOfDay = new TimeOfDay({ startHour: 12, speed: 1.0 });
    emissiveManager = new EmissiveManager(mockRenderer, timeOfDay);
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      strictEqual(emissiveManager.enabled, true);
      ok(emissiveManager.config);
      ok(emissiveManager.config.structures);
      ok(emissiveManager.config.decorations);
    });

    it('should initialize with custom values', () => {
      const manager = new EmissiveManager(mockRenderer, timeOfDay, { enabled: false });
      strictEqual(manager.enabled, false);
    });
  });

  describe('setConfig', () => {
    it('should set configuration', () => {
      const config = {
        structures: {
          torch: {
            emissive: true,
            emissiveColor: '#ffaa00',
            emissiveIntensity: 2.0,
          },
        },
        decorations: {},
      };

      emissiveManager.setConfig(config);
      
      const torchConfig = emissiveManager.getConfig('torch', 'structures');
      ok(torchConfig);
      strictEqual(torchConfig.emissive, true);
      strictEqual(torchConfig.emissiveColor, '#ffaa00');
      strictEqual(torchConfig.emissiveIntensity, 2.0);
    });

    it('should handle missing structures or decorations', () => {
      emissiveManager.setConfig({});
      
      ok(emissiveManager.config.structures);
      ok(emissiveManager.config.decorations);
    });
  });

  describe('getConfig', () => {
    beforeEach(() => {
      emissiveManager.setConfig({
        structures: {
          torch: { emissive: true },
        },
        decorations: {
          lantern: { emissive: true },
        },
      });
    });

    it('should return structure config', () => {
      const config = emissiveManager.getConfig('torch', 'structures');
      ok(config);
      strictEqual(config.emissive, true);
    });

    it('should return decoration config', () => {
      const config = emissiveManager.getConfig('lantern', 'decorations');
      ok(config);
      strictEqual(config.emissive, true);
    });

    it('should return null for non-existent config', () => {
      const config = emissiveManager.getConfig('nonexistent', 'structures');
      strictEqual(config, null);
    });

    it('should default to structures type', () => {
      const config = emissiveManager.getConfig('torch');
      ok(config);
      strictEqual(config.emissive, true);
    });
  });

  describe('setEnabled', () => {
    it('should enable/disable the manager', () => {
      emissiveManager.setEnabled(false);
      strictEqual(emissiveManager.enabled, false);
      
      emissiveManager.setEnabled(true);
      strictEqual(emissiveManager.enabled, true);
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      emissiveManager.setConfig({
        structures: { torch: { emissive: true } },
        decorations: {},
      });

      const state = emissiveManager.getState();
      
      strictEqual(state.enabled, true);
      strictEqual(state.trackedObjects, 0);
      ok(state.config);
      ok(state.config.structures);
      ok(state.config.decorations);
    });
  });

  describe('dispose', () => {
    it('should dispose without errors', () => {
      emissiveManager.init();
      emissiveManager.dispose();
      
      // Should not throw
      ok(true);
    });

    it('should clear tracked objects', () => {
      emissiveManager.init();
      
      // Manually add a tracked object (normally done by applyEmissiveProperties)
      emissiveManager.emissiveObjects.set('test-uuid', {
        object: {},
        objectId: 'torch',
        type: 'structures',
        baseIntensity: 2.0,
      });
      
      strictEqual(emissiveManager.emissiveObjects.size, 1);
      
      emissiveManager.dispose();
      
      strictEqual(emissiveManager.emissiveObjects.size, 0);
    });
  });
});
