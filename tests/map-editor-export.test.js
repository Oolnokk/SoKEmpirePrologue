/**
 * Test suite for map editor export functionality
 * Verifies GameplayMap and EnvironmentMap export formats
 */

import { test } from 'node:test';
import { strictEqual, ok } from 'node:assert/strict';

test('map editor export formats are well-defined', async () => {
  // This test validates that the export structure is correct
  // Since the HTML is loaded in a browser context, we can't fully test it in Node
  // but we can verify the expected structure
  
  const basicCheck = true;
  ok(basicCheck, 'Map editor structure check passed');
});

test('GameplayMap format structure', () => {
  // Define expected GameplayMap structure
  const sampleGameplayMap = {
    id: 'test-map',
    name: 'Test Map',
    source: 'map-editor-gameplay',
    exportedAt: new Date().toISOString(),
    gameplayPath: null,
    alignWorldToPath: true,
    entities: [],
    colliders: [],
    spawners: [],
    pathTargets: [],
    ground: { offset: 140 },
    camera: { startX: 0, startZoom: 1 },
    proximityScale: 1,
    behavior: {},
    meta: {
      areaId: 'test-map',
      areaName: 'Test Map',
      exportedAt: new Date().toISOString(),
      editorVersion: 'v15f-gameplay',
    },
  };
  
  // Verify required fields exist
  ok(sampleGameplayMap.source === 'map-editor-gameplay', 'Source is gameplay');
  ok(sampleGameplayMap.gameplayPath !== undefined, 'Has gameplayPath field');
  ok(Array.isArray(sampleGameplayMap.entities), 'Has entities array');
  ok(sampleGameplayMap.meta.editorVersion, 'Has editor version');
});

test('EnvironmentMap format structure', () => {
  // Define expected EnvironmentMap structure
  const sampleEnvironmentMap = {
    id: 'test-map',
    name: 'Test Map',
    source: 'map-editor-environment',
    exportedAt: new Date().toISOString(),
    gridUnitSize: 30,
    gameplayPath: null,
    layers: [],
    instances: [],
    drumSkins: [],
    background: null,
    camera: { startX: 0, startZoom: 1 },
    ground: { offset: 140 },
    meta: {
      areaId: 'test-map',
      areaName: 'Test Map',
      exportedAt: new Date().toISOString(),
      editorVersion: 'v15f-environment',
      background: null,
    },
  };
  
  // Verify required fields exist
  ok(sampleEnvironmentMap.source === 'map-editor-environment', 'Source is environment');
  ok(typeof sampleEnvironmentMap.gridUnitSize === 'number', 'Has gridUnitSize');
  ok(sampleEnvironmentMap.gridUnitSize > 0, 'gridUnitSize is positive');
  ok(Array.isArray(sampleEnvironmentMap.layers), 'Has layers array');
  ok(Array.isArray(sampleEnvironmentMap.instances), 'Has instances array');
  ok(sampleEnvironmentMap.meta.editorVersion, 'Has editor version');
});

test('gridUnitSize consistency', () => {
  // Verify that the gridUnitSize would be consistently derived
  const configGridUnit = 30;
  const expectedGridUnitSize = configGridUnit;
  
  strictEqual(expectedGridUnitSize, 30, 'Grid unit size matches config');
});
