// npc-schedule-generator.js - Pre-generates NPC schedules at spawn time

import { isScheduleActive } from './schedule-utils.js?v=1';

/**
 * Interest type linger durations (in seconds)
 * How long an NPC should stay at each type of POI before moving on
 */
const LINGER_DURATIONS = {
  'patrol-point': { min: 30, max: 60 },
  'gate': { min: 60, max: 120 },
  'barracks': { min: 120, max: 300 },
  'tavern': { min: 180, max: 600 },
  'shop': { min: 90, max: 180 },
  'default': { min: 60, max: 120 },
};

/**
 * Get linger duration for a POI based on its tags/interests
 */
function getLingerDurationForPoi(poi, random = Math.random) {
  const tags = poi?.tags || poi?.meta?.tags || [];

  // Find the first matching tag in LINGER_DURATIONS
  for (const tag of tags) {
    const duration = LINGER_DURATIONS[tag];
    if (duration) {
      return duration.min + random() * (duration.max - duration.min);
    }
  }

  // Default duration
  const defaultDuration = LINGER_DURATIONS.default;
  return defaultDuration.min + random() * (defaultDuration.max - defaultDuration.min);
}

/**
 * Select POIs by matching interests
 */
function selectPoisByInterests(poisByName, interests) {
  if (!poisByName || !Array.isArray(interests) || interests.length === 0) {
    return [];
  }

  const matched = [];
  for (const [name, pois] of poisByName.entries()) {
    if (!Array.isArray(pois)) continue;
    for (const poi of pois) {
      if (!poi) continue;
      const poiTags = poi?.tags || poi?.meta?.tags || [];
      const hasMatch = interests.some((interest) => poiTags.includes(interest));
      if (hasMatch) {
        matched.push(poi);
      }
    }
  }
  return matched;
}

/**
 * Generate a pre-computed 24-hour schedule for an NPC
 * This happens once at spawn time and never changes
 *
 * @param {object} npc - The NPC fighter object
 * @param {object} area - The active area with POIs
 * @param {function} random - Random function for deterministic generation (optional)
 * @returns {Array} Schedule entries [{poiId, poi, startHour, endHour, lingerDuration}]
 */
export function generateNpcSchedule(npc, area, random = Math.random) {
  if (!npc || !area) return [];

  const group = npc.group || {};
  const interests = group.interests || [];
  const poisByName = area.poisByName;

  if (!poisByName || interests.length === 0) return [];

  // Find all POIs that match NPC interests
  const matchingPois = selectPoisByInterests(poisByName, interests);
  if (matchingPois.length === 0) return [];

  console.log('[generateNpcSchedule]', npc.id, '- Found', matchingPois.length, 'matching POIs for interests:', interests);

  // Build schedule for each hour
  const schedule = [];
  let currentHour = 0;

  while (currentHour < 24) {
    // Filter POIs that are active at this hour
    const activePois = matchingPois.filter(poi => isScheduleActive(poi?.meta, currentHour));

    if (activePois.length === 0) {
      // No active POIs this hour, skip to next hour
      currentHour++;
      continue;
    }

    // Pick a random POI from active ones
    const poi = activePois[Math.floor(random() * activePois.length)];
    const lingerDuration = getLingerDurationForPoi(poi, random);

    // Calculate how many hours to stay (linger duration in hours)
    const lingerHours = Math.max(1, Math.ceil(lingerDuration / 3600));
    const endHour = Math.min(24, currentHour + lingerHours);

    schedule.push({
      poiId: poi.id,
      poi: poi,  // Store reference for quick access
      startHour: currentHour,
      endHour: endHour,
      lingerDuration: lingerDuration,
    });

    currentHour = endHour;
  }

  console.log('[generateNpcSchedule]', npc.id, '- Generated schedule with', schedule.length, 'entries');
  return schedule;
}

/**
 * Get the current scheduled POI for an NPC based on game time
 * @param {object} npc - The NPC fighter object with preGeneratedSchedule
 * @param {number} currentHour - Current game hour (0-23)
 * @returns {object|null} Schedule entry or null
 */
export function getCurrentScheduledPoi(npc, currentHour) {
  if (!npc || !Number.isFinite(currentHour)) return null;

  const schedule = npc.preGeneratedSchedule;
  if (!Array.isArray(schedule) || schedule.length === 0) return null;

  // Normalize hour to 0-23
  const hour = ((currentHour % 24) + 24) % 24;

  // Find the entry that covers this hour
  for (const entry of schedule) {
    if (hour >= entry.startHour && hour < entry.endHour) {
      return entry;
    }
  }

  return null;
}
