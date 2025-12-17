/**
 * TowerLightingIntegration.js
 * Integrates candle lights into tower structures loaded from visualsmaps
 */

import { createCandleLight, createCandleLightWithGlow } from './CandleLight.js';

/**
 * Check if an asset type represents a tower structure
 * @param {string} assetType - The asset type identifier
 * @returns {boolean} True if it's a tower
 */
export function isTowerStructure(assetType) {
  if (!assetType) return false;

  const towerKeywords = [
    'tower',
    'building',
    'structure',
    'commercial',
    'residential',
    'industrial'
  ];

  const lowerType = assetType.toLowerCase();
  return towerKeywords.some(keyword => lowerType.includes(keyword));
}

/**
 * Get candle light position for a tower based on its bounds
 * @param {Object} object - The Three.js object
 * @param {Object} THREE - Three.js library reference
 * @returns {Object} Position {x, y, z}
 */
export function getTowerCandleLightPosition(object, THREE) {
  // Calculate bounding box to find center and height
  const bbox = new THREE.Box3().setFromObject(object);
  const size = new THREE.Vector3();
  bbox.getSize(size);

  const center = new THREE.Vector3();
  bbox.getCenter(center);

  // Position candle light in the center, slightly above the bottom
  // This works well for towers where the light should be inside
  return {
    x: 0, // Local coordinates relative to tower
    y: size.y * 0.2, // 20% up from bottom
    z: 0
  };
}

/**
 * Add candle light to a tower structure
 * @param {Object} towerObject - The tower Three.js object
 * @param {Object} THREE - Three.js library reference
 * @param {Object} dayNightSystem - The DayNightSystem instance
 * @param {Object} options - Configuration options
 * @returns {Object} The created candle light object
 */
export function addCandleLightToTower(towerObject, THREE, dayNightSystem, options = {}) {
  const {
    withGlow = true,
    topWidth = 0.8,
    topDepth = 0.8,
    bottomWidth = 0.5,
    bottomDepth = 0.5,
    height = 1.5,
    color = 0xffbb66, // Orangy pale yellow
    emissiveIntensity = 0.8,
    opacity = 0.6,
    lightIntensity = 1.5,
    lightDistance = 8,
    autoPosition = true
  } = options;

  // Create the candle light
  const candleLight = withGlow
    ? createCandleLightWithGlow(THREE, {
        topWidth,
        topDepth,
        bottomWidth,
        bottomDepth,
        height,
        color,
        emissiveIntensity,
        opacity,
        lightIntensity,
        lightDistance
      })
    : createCandleLight(THREE, {
        topWidth,
        topDepth,
        bottomWidth,
        bottomDepth,
        height,
        color,
        emissiveIntensity,
        opacity
      });

  // Position the candle light inside the tower
  if (autoPosition) {
    const position = getTowerCandleLightPosition(towerObject, THREE);
    candleLight.position.set(position.x, position.y, position.z);
  }

  // Add as child of tower so it moves with the tower
  towerObject.add(candleLight);

  // Register with day/night system if provided
  if (dayNightSystem) {
    // Register the main emissive object
    if (withGlow && candleLight.children.length > 0) {
      // Find the mesh (first child in the group)
      const mesh = candleLight.children.find(child => child.isMesh);
      if (mesh) {
        dayNightSystem.registerEmissiveObject(mesh, {
          nightEmissive: color,
          nightIntensity: emissiveIntensity,
          dayEmissive: 0x000000,
          dayIntensity: 0.0
        });
      }

      // Control point light visibility based on day/night
      if (candleLight.userData.pointLight) {
        const pointLight = candleLight.userData.pointLight;
        const originalIntensity = pointLight.intensity;

        dayNightSystem.on('timeChange', ({ isNight }) => {
          pointLight.visible = isNight;
          pointLight.intensity = isNight ? originalIntensity : 0;
        });

        // Set initial state
        pointLight.visible = dayNightSystem.isNight;
        pointLight.intensity = dayNightSystem.isNight ? originalIntensity : 0;
      }
    } else {
      // Simple candle without glow
      dayNightSystem.registerEmissiveObject(candleLight, {
        nightEmissive: color,
        nightIntensity: emissiveIntensity,
        dayEmissive: 0x000000,
        dayIntensity: 0.0
      });
    }
  }

  return candleLight;
}

/**
 * Process all loaded objects and add candle lights to towers
 * @param {Array} loadedObjects - Array of loaded Three.js objects
 * @param {Object} assetCache - Map of asset types to configs
 * @param {Object} THREE - Three.js library reference
 * @param {Object} dayNightSystem - The DayNightSystem instance
 * @param {Object} options - Configuration options
 * @returns {Array} Array of created candle lights
 */
export function addCandleLightsToTowers(loadedObjects, assetCache, THREE, dayNightSystem, options = {}) {
  const candleLights = [];

  for (const obj of loadedObjects) {
    // Skip non-mesh objects like lights
    if (!obj.isObject3D && !obj.isGroup && !obj.isMesh) continue;

    // Check if this object is a tower based on its name or user data
    let isTower = false;

    // Check object name
    if (obj.name && isTowerStructure(obj.name)) {
      isTower = true;
    }

    // Check user data for asset type
    if (obj.userData?.assetType && isTowerStructure(obj.userData.assetType)) {
      isTower = true;
    }

    if (isTower) {
      const candleLight = addCandleLightToTower(obj, THREE, dayNightSystem, options);
      candleLights.push(candleLight);
      console.log(`[TowerLighting] Added candle light to tower: ${obj.name || 'unnamed'}`);
    }
  }

  console.log(`[TowerLighting] Total candle lights added: ${candleLights.length}`);
  return candleLights;
}

/**
 * Hook into visualsmap loader to automatically add candle lights
 * Call this after objects are loaded in visualsmapLoader
 * @param {Array} loadedObjects - Array of loaded objects from visualsmap
 * @param {Map} assetCache - Asset cache from visualsmap loader
 * @param {Object} renderer - Renderer instance with THREE reference
 * @param {Object} dayNightSystem - DayNightSystem instance
 * @param {Object} options - Configuration options
 */
export function integrateWithVisualsMap(loadedObjects, assetCache, renderer, dayNightSystem, options = {}) {
  if (!renderer?.THREE) {
    console.warn('[TowerLighting] Renderer or THREE not available');
    return [];
  }

  // Find all tower objects and add candle lights
  const towerObjects = [];

  assetCache.forEach((config, assetType) => {
    if (isTowerStructure(assetType)) {
      // Find all loaded objects of this tower type
      for (const obj of loadedObjects) {
        // Tag objects with their asset type for easier identification
        if (obj.userData?.assetType === assetType || obj.name === assetType) {
          towerObjects.push(obj);
        }
      }
    }
  });

  console.log(`[TowerLighting] Found ${towerObjects.length} tower objects`);

  const candleLights = [];
  for (const towerObj of towerObjects) {
    const candleLight = addCandleLightToTower(towerObj, renderer.THREE, dayNightSystem, options);
    candleLights.push(candleLight);
  }

  return candleLights;
}
