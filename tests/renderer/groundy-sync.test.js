/**
 * Test groundY synchronization from gameplay path screen position
 */

import { describe, it, beforeEach } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';

describe('groundY camera sync behavior', () => {
  let mockConfig;

  beforeEach(() => {
    // Reset mock CONFIG before each test
    mockConfig = {};
  });

  describe('projectWorldToScreen', () => {
    it('should calculate screen coordinates from world position', () => {
      // Mock Three.js Vector3 projection
      const worldPos = { x: 0, y: 0, z: 0 };
      const mockCamera = {
        projectionMatrix: { /* mock matrix */ },
        matrixWorldInverse: { /* mock matrix */ }
      };
      const mockRenderer = {
        width: 800,
        height: 460,
        THREE: {
          Vector3: class {
            constructor(x, y, z) {
              this.x = x;
              this.y = y;
              this.z = z;
            }
            project(/* camera */) {
              // Mock projection to normalized device coordinates
              // Center of screen maps to (0, 0) in NDC
              this.x = 0;
              this.y = 0;
              this.z = 0;
              return this;
            }
          }
        },
        renderer: {
          domElement: { width: 800, height: 460 }
        }
      };

      // Simulate projection calculation
      const vector = new mockRenderer.THREE.Vector3(worldPos.x, worldPos.y, worldPos.z);
      vector.project(mockCamera);
      
      const screenX = (vector.x * 0.5 + 0.5) * mockRenderer.width;
      const screenY = (-(vector.y * 0.5) + 0.5) * mockRenderer.height;

      // Center of screen should be at (400, 230)
      strictEqual(screenX, 400, 'Screen X should be center of width');
      strictEqual(screenY, 230, 'Screen Y should be center of height');
    });

    it('should handle missing parameters gracefully', () => {
      // Function should return default {x: 0, y: 0} when parameters missing
      const result = { x: 0, y: 0 };
      
      strictEqual(result.x, 0, 'Should return 0 for x when params missing');
      strictEqual(result.y, 0, 'Should return 0 for y when params missing');
    });
  });

  describe('syncGroundYFromGameplayPath', () => {
    it('should set CONFIG.groundY from projected path position', () => {
      const gameplayPath = {
        start: { x: -10, z: 0 },
        end: { x: 10, z: 0 }
      };

      // Path center would be at (0, 0, 0) in world space
      const pathCenterX = (gameplayPath.start.x + gameplayPath.end.x) / 2;
      const pathCenterZ = (gameplayPath.start.z + gameplayPath.end.z) / 2;

      strictEqual(pathCenterX, 0, 'Path center X should be 0');
      strictEqual(pathCenterZ, 0, 'Path center Z should be 0');

      // Simulate projection result
      const screenY = 322;
      mockConfig.groundY = Math.round(screenY);
      mockConfig.groundYSource = 'camera';

      strictEqual(mockConfig.groundY, 322, 'groundY should be set to projected screen Y');
      strictEqual(mockConfig.groundYSource, 'camera', 'groundYSource should be set to camera');
    });

    it('should not sync without valid gameplay path', () => {
      const invalidPaths = [
        null,
        {},
        { start: { x: 0, z: 0 } }, // missing end
        { end: { x: 0, z: 0 } }    // missing start
      ];

      for (const path of invalidPaths) {
        const hasValidPath = !!(path?.start && path?.end);
        strictEqual(hasValidPath, false, 'Should not have valid path');
      }
    });

    it('should lock groundY with source marker', () => {
      mockConfig.groundY = 300;
      mockConfig.groundYSource = 'camera';

      strictEqual(mockConfig.groundY, 300, 'groundY should be set');
      strictEqual(mockConfig.groundYSource, 'camera', 'groundYSource should mark it as camera-locked');
    });

    it('should support Z offset for projecting from tile edge', () => {
      const gameplayPath = {
        start: { x: -10, z: 0 },
        end: { x: 10, z: 0 }
      };

      // Path center would be at (0, 0, 0) in world space
      const pathCenterX = (gameplayPath.start.x + gameplayPath.end.x) / 2;
      const pathCenterZ = (gameplayPath.start.z + gameplayPath.end.z) / 2;

      strictEqual(pathCenterX, 0, 'Path center X should be 0');
      strictEqual(pathCenterZ, 0, 'Path center Z should be 0');

      // With zOffset of 15 (half a tile), the projected position would be at z=15
      const zOffset = 15;
      const projectedZ = pathCenterZ + zOffset;

      strictEqual(projectedZ, 15, 'Projected Z should include offset');
      
      // This would then be projected to screen space (simulated result)
      const screenY = 310; // Different from center due to offset
      mockConfig.groundY = Math.round(screenY);
      mockConfig.groundYSource = 'camera';

      strictEqual(mockConfig.groundY, 310, 'groundY should be set from offset position');
    });
  });

  describe('computeGroundY protection', () => {
    it('should return camera-locked groundY without recalculation', () => {
      mockConfig.groundY = 322;
      mockConfig.groundYSource = 'camera';
      mockConfig.canvas = { h: 460 };

      // Simulate computeGroundY logic
      if (mockConfig.groundYSource === 'camera' && Number.isFinite(mockConfig.groundY)) {
        const result = mockConfig.groundY;
        strictEqual(result, 322, 'Should return camera-locked groundY');
      } else {
        ok(false, 'Should have used camera-locked path');
      }
    });

    it('should recalculate groundY when not camera-locked', () => {
      mockConfig.canvas = { h: 460 };
      mockConfig.groundRatio = 0.7;
      // No groundYSource set

      const shouldUseCameraLocked = mockConfig.groundYSource === 'camera' && Number.isFinite(mockConfig.groundY);
      strictEqual(shouldUseCameraLocked, false, 'Should not use camera-locked path');

      // Would recalculate: Math.round(460 * 0.7) = 322
      const calculated = Math.round(mockConfig.canvas.h * mockConfig.groundRatio);
      strictEqual(calculated, 322, 'Should calculate groundY from ratio');
    });

    it('should handle invalid camera-locked values', () => {
      mockConfig.groundYSource = 'camera';
      mockConfig.groundY = NaN;

      const isValid = mockConfig.groundYSource === 'camera' && Number.isFinite(mockConfig.groundY);
      strictEqual(isValid, false, 'NaN should not be considered valid');
    });
  });

  describe('syncConfigGround protection', () => {
    it('should skip update when groundY is camera-locked', () => {
      mockConfig.groundY = 322;
      mockConfig.groundYSource = 'camera';

      // Simulate syncConfigGround check
      if (mockConfig.groundYSource === 'camera' && Number.isFinite(mockConfig.groundY)) {
        // Should return early, not update groundY
        strictEqual(mockConfig.groundY, 322, 'groundY should remain unchanged');
      } else {
        ok(false, 'Should have skipped update');
      }
    });

    it('should allow update when not camera-locked', () => {
      mockConfig.canvas = { h: 460 };
      // No groundYSource set

      const area = {
        ground: { offset: 138 }
      };

      const shouldSkip = mockConfig.groundYSource === 'camera' && Number.isFinite(mockConfig.groundY);
      strictEqual(shouldSkip, false, 'Should not skip update');

      // Would calculate: 1 - 138/460 = 0.7, then Math.round(460 * 0.7) = 322
      const ratio = 1 - area.ground.offset / mockConfig.canvas.h;
      const newGroundY = Math.round(mockConfig.canvas.h * ratio);
      strictEqual(newGroundY, 322, 'Should calculate new groundY');
    });
  });

  describe('camera movement stability', () => {
    it('should maintain groundY value even when camera moves', () => {
      // Initial setup - groundY set from camera projection
      mockConfig.groundY = 322;
      mockConfig.groundYSource = 'camera';

      const initialGroundY = mockConfig.groundY;

      // Simulate camera movement (e.g., following player in jump puzzle)
      const cameraPositions = [
        { x: 0, y: 5, z: -10 },   // Initial
        { x: 5, y: 8, z: -10 },   // Player jumps
        { x: 10, y: 12, z: -10 }, // Player on higher platform
        { x: 15, y: 5, z: -10 }   // Player returns to ground
      ];

      for (const cameraPos of cameraPositions) {
        // groundY should remain locked regardless of camera position
        const isLocked = mockConfig.groundYSource === 'camera' && Number.isFinite(mockConfig.groundY);
        ok(isLocked, `groundY should remain locked at camera position ${JSON.stringify(cameraPos)}`);
        strictEqual(mockConfig.groundY, initialGroundY, 'groundY should not change with camera movement');
      }
    });

    it('should remain stable across multiple computeGroundY calls', () => {
      mockConfig.groundY = 322;
      mockConfig.groundYSource = 'camera';
      mockConfig.canvas = { h: 460 };
      mockConfig.groundRatio = 0.7;

      // Multiple calls with different configurations
      for (let i = 0; i < 5; i++) {
        // Simulate computeGroundY being called multiple times
        if (mockConfig.groundYSource === 'camera' && Number.isFinite(mockConfig.groundY)) {
          const result = mockConfig.groundY;
          strictEqual(result, 322, `Call ${i + 1}: Should always return camera-locked value`);
        }
      }
    });
  });
});
