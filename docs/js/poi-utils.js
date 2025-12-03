/**
 * POI (Point of Interest) Utilities
 * Functions for working with POI collider zones for NPC navigation
 */

/**
 * Check if a point is inside a POI's bounds
 */
export function isPointInsidePoi(point, poi) {
  if (!point || !poi || !poi.bounds) return false;

  const { x, y } = point;
  const { left, width, topOffset, height } = poi.bounds;
  const right = left + width;
  const bottom = topOffset + height;

  return x >= left && x <= right && y >= topOffset && y <= bottom;
}

/**
 * Get the center point of a POI
 */
export function getPoiCenter(poi) {
  if (!poi || !poi.bounds) return null;

  const { left, width, topOffset, height } = poi.bounds;
  return {
    x: left + width / 2,
    y: topOffset + height / 2,
  };
}

/**
 * Get a random point inside a POI
 */
export function getRandomPointInPoi(poi) {
  if (!poi || !poi.bounds) return null;

  const { left, width, topOffset, height } = poi.bounds;
  return {
    x: left + Math.random() * width,
    y: topOffset + Math.random() * height,
  };
}

/**
 * Get the ground-level Y coordinate for a POI
 * (bottom of the POI bounds)
 */
export function getPoiGroundY(poi) {
  if (!poi || !poi.bounds) return 0;
  return poi.bounds.topOffset + poi.bounds.height;
}

/**
 * Get a random ground-level point inside a POI
 */
export function getRandomGroundPointInPoi(poi) {
  if (!poi || !poi.bounds) return null;

  const { left, width } = poi.bounds;
  return {
    x: left + Math.random() * width,
    y: getPoiGroundY(poi),
  };
}

/**
 * Select POIs that match any of the given interests
 * @param {Map} poisByName - Map of POI names to POI arrays
 * @param {string[]} interests - Array of interest names to match
 * @returns {Array} Array of matching POIs
 */
export function selectPoisByInterests(poisByName, interests) {
  if (!poisByName || !Array.isArray(interests)) return [];

  const matching = [];
  for (const interest of interests) {
    const pois = poisByName.get(interest);
    if (Array.isArray(pois)) {
      matching.push(...pois);
    }
  }

  return matching;
}

/**
 * Select a random POI from an array of POIs
 */
export function selectRandomPoi(pois) {
  if (!Array.isArray(pois) || pois.length === 0) return null;
  return pois[Math.floor(Math.random() * pois.length)];
}

/**
 * Find the nearest POI to a given point
 */
export function findNearestPoi(point, pois) {
  if (!point || !Array.isArray(pois) || pois.length === 0) return null;

  let nearest = null;
  let minDistance = Infinity;

  for (const poi of pois) {
    const center = getPoiCenter(poi);
    if (!center) continue;

    const dx = center.x - point.x;
    const dy = center.y - point.y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (distance < minDistance) {
      minDistance = distance;
      nearest = poi;
    }
  }

  return nearest;
}

/**
 * Get distance from a point to the nearest edge of a POI
 */
export function getDistanceToPoi(point, poi) {
  if (!point || !poi || !poi.bounds) return Infinity;

  const { x, y } = point;
  const { left, width, topOffset, height } = poi.bounds;
  const right = left + width;
  const bottom = topOffset + height;

  // If point is inside, distance is 0
  if (isPointInsidePoi(point, poi)) return 0;

  // Calculate distance to nearest edge
  const dx = Math.max(left - x, 0, x - right);
  const dy = Math.max(topOffset - y, 0, y - bottom);

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Select map exit POIs
 * @param {Array} pois - All POIs
 * @returns {Array} POIs tagged as map exits
 */
export function selectMapExits(pois) {
  if (!Array.isArray(pois)) return [];

  return pois.filter((poi) => {
    if (!Array.isArray(poi.tags)) return false;
    return poi.tags.some((tag) => {
      const normalized = typeof tag === 'string' ? tag.toLowerCase() : '';
      return normalized.startsWith('map-exit') || normalized.startsWith('exit');
    });
  });
}

/**
 * Select a weighted random exit based on exit weights
 * @param {Array} exits - Array of exit POIs
 * @param {Object} exitWeights - Map of exit tags to weights
 * @returns {Object} Selected exit POI
 */
export function selectWeightedExit(exits, exitWeights = {}) {
  if (!Array.isArray(exits) || exits.length === 0) return null;
  if (!exitWeights || Object.keys(exitWeights).length === 0) {
    return selectRandomPoi(exits);
  }

  // Build weighted list
  const weighted = [];
  for (const exit of exits) {
    let weight = 1;
    if (Array.isArray(exit.tags)) {
      for (const tag of exit.tags) {
        const normalized = typeof tag === 'string' ? tag.toLowerCase() : '';
        if (exitWeights[normalized]) {
          weight = exitWeights[normalized];
          break;
        }
      }
    }
    weighted.push({ exit, weight });
  }

  // Select based on weights
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  let random = Math.random() * totalWeight;

  for (const item of weighted) {
    random -= item.weight;
    if (random <= 0) {
      return item.exit;
    }
  }

  return weighted[weighted.length - 1]?.exit || null;
}
