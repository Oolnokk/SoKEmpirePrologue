/**
 * Unified Entity Initialization System
 *
 * Centralizes initialization of all map entities (NPCs, path targets, props, etc.)
 * with proper async handling, dependency tracking, and error reporting.
 *
 * Fixes race conditions by ensuring all async operations are properly awaited
 * and all entity types are initialized before the area is considered ready.
 */

/**
 * Initialize all entities for an area
 * @param {Object} area - Area descriptor with entities, pathTargets, propSpawns, spawners
 * @returns {Promise<Object>} Initialization result with success/failure counts
 */
export async function initializeAreaEntities(area) {
  console.log('[EntityInit] 🎯 Initializing entities for area:', area?.id);

  if (!area || !area.id) {
    console.warn('[EntityInit] ⚠️ No area provided');
    return { success: false, error: 'No area provided' };
  }

  const results = {
    areaId: area.id,
    pathTargets: { initialized: 0, failed: 0 },
    propSpawns: { initialized: 0, failed: 0 },
    npcs: { initialized: 0, failed: 0 },
    entities: { initialized: 0, failed: 0 },
    errors: [],
  };

  try {
    // Initialize in parallel for better performance
    const [pathTargetResult, propSpawnResult, npcResult] = await Promise.allSettled([
      initializePathTargets(area),
      initializePropSpawns(area),
      initializeNpcSpawners(area),
    ]);

    // Process path target results
    if (pathTargetResult.status === 'fulfilled') {
      results.pathTargets = pathTargetResult.value;
    } else {
      results.errors.push({ type: 'pathTargets', error: pathTargetResult.reason });
      console.error('[EntityInit] ❌❌❌ PATH TARGETS FAILED ❌❌❌');
      console.error('[EntityInit]', pathTargetResult.reason);
    }

    // Process prop spawn results
    if (propSpawnResult.status === 'fulfilled') {
      results.propSpawns = propSpawnResult.value;
    } else {
      results.errors.push({ type: 'propSpawns', error: propSpawnResult.reason });
      console.error('[EntityInit] ❌❌❌ PROP SPAWNS FAILED ❌❌❌');
      console.error('[EntityInit]', propSpawnResult.reason);
    }

    // Process NPC results
    if (npcResult.status === 'fulfilled') {
      results.npcs = npcResult.value;
    } else {
      results.errors.push({ type: 'npcs', error: npcResult.reason });
      console.error('[EntityInit] ❌❌❌ NPC SPAWNERS FAILED ❌❌❌');
      console.error('[EntityInit]', npcResult.reason);
    }

    const totalInitialized = results.pathTargets.initialized + results.propSpawns.initialized + results.npcs.initialized;
    const totalFailed = results.pathTargets.failed + results.propSpawns.failed + results.npcs.failed;

    console.log('[EntityInit] ✅ Initialization complete:', {
      pathTargets: results.pathTargets.initialized,
      propSpawns: results.propSpawns.initialized,
      npcs: results.npcs.initialized,
      total: totalInitialized,
      failed: totalFailed,
    });

    results.success = true;

    // Store status globally for debug panel
    const GAME = window.GAME ||= {};
    GAME.entityInitializationStatus = results;

    return results;

  } catch (error) {
    console.error('[EntityInit] ❌ Fatal error during entity initialization:', error);
    results.success = false;
    results.errors.push({ type: 'fatal', error });

    // Store error status globally for debug panel
    const GAME = window.GAME ||= {};
    GAME.entityInitializationStatus = results;

    return results;
  }
}

/**
 * Initialize path targets for an area
 * @param {Object} area - Area descriptor
 * @returns {Promise<Object>} Result with initialized/failed counts
 */
async function initializePathTargets(area) {
  const result = { initialized: 0, failed: 0, targets: [] };

  const pathTargets = Array.isArray(area.pathTargets) ? area.pathTargets : [];

  if (pathTargets.length === 0) {
    console.log('[EntityInit/PathTargets] No path targets to initialize');
    return result;
  }

  console.log('[EntityInit/PathTargets] Initializing', pathTargets.length, 'path targets');

  // Store path targets in a global registry for NPC pathfinding to use
  const GAME = window.GAME ||= {};
  const pathTargetRegistry = GAME.pathTargetRegistry ||= new Map();

  // Clear previous targets for this area
  pathTargetRegistry.delete(area.id);

  const areaTargets = [];

  for (const target of pathTargets) {
    try {
      if (!target || !target.name) {
        result.failed++;
        continue;
      }

      // Validate target has required data
      const validTarget = {
        name: target.name,
        order: target.order ?? 0,
        position: {
          x: target.position?.x ?? target.goalX ?? 0,
          y: target.position?.y ?? target.goalY ?? 0,
        },
        goalX: target.goalX ?? target.position?.x ?? 0,
        goalY: target.goalY ?? target.position?.y ?? 0,
        arriveRadius: target.arriveRadius ?? 6,
        range: target.range,
        tags: Array.isArray(target.tags) ? target.tags : [],
        meta: target.meta || {},
      };

      areaTargets.push(validTarget);
      result.initialized++;

      const rangeLabel = validTarget.range
        ? `range ${validTarget.range.minX?.toFixed?.(1)}–${validTarget.range.maxX?.toFixed?.(1)}`
        : `at ${validTarget.goalX},${validTarget.goalY}`;
      console.log('[EntityInit/PathTargets] ✓ Initialized:', validTarget.name, rangeLabel, 'center', validTarget.goalX, validTarget.goalY);
    } catch (error) {
      console.error('[EntityInit/PathTargets] ✗ Failed to initialize target:', target, error);
      result.failed++;
    }
  }

  // Store in registry organized by area
  pathTargetRegistry.set(area.id, areaTargets);
  result.targets = areaTargets;

  console.log('[EntityInit/PathTargets] ✅ Complete:', result.initialized, 'initialized,', result.failed, 'failed');
  return result;
}

/**
 * Initialize prop spawns for an area
 * @param {Object} area - Area descriptor
 * @returns {Promise<Object>} Result with initialized/failed counts
 */
async function initializePropSpawns(area) {
  const result = { initialized: 0, failed: 0, props: [] };

  const propSpawns = Array.isArray(area.propSpawns) ? area.propSpawns : [];

  if (propSpawns.length === 0) {
    console.log('[EntityInit/PropSpawns] No prop spawns to initialize');
    return result;
  }

  console.log('[EntityInit/PropSpawns] Initializing', propSpawns.length, 'prop spawns');

  // Store prop spawns in a global registry
  const GAME = window.GAME ||= {};
  const propSpawnRegistry = GAME.propSpawnRegistry ||= new Map();

  // Clear previous spawns for this area
  propSpawnRegistry.delete(area.id);

  const areaProps = [];

  for (const propSpawn of propSpawns) {
    try {
      if (!propSpawn || !propSpawn.id) {
        result.failed++;
        continue;
      }

      // Validate prop spawn has required data
      const validProp = {
        id: propSpawn.id,
        position: {
          x: propSpawn.position?.x ?? propSpawn.x ?? 0,
          y: propSpawn.position?.y ?? propSpawn.y ?? 0,
        },
        templateId: propSpawn.templateId || propSpawn.prefabId || null,
        meta: propSpawn.meta || {},
      };

      areaProps.push(validProp);
      result.initialized++;

      console.log('[EntityInit/PropSpawns] ✓ Initialized:', validProp.id, 'at', validProp.position.x, validProp.position.y);
    } catch (error) {
      console.error('[EntityInit/PropSpawns] ✗ Failed to initialize prop spawn:', propSpawn, error);
      result.failed++;
    }
  }

  // Store in registry organized by area
  propSpawnRegistry.set(area.id, areaProps);
  result.props = areaProps;

  console.log('[EntityInit/PropSpawns] ✅ Complete:', result.initialized, 'initialized,', result.failed, 'failed');
  return result;
}

/**
 * Initialize NPC spawners for an area
 * @param {Object} area - Area descriptor
 * @returns {Promise<Object>} Result with initialized/failed counts
 */
async function initializeNpcSpawners(area) {
  const result = { initialized: 0, failed: 0 };

  try {
    // Dynamically import fighter module (this is the async operation that was causing race conditions)
    console.log('[EntityInit/NPCs] Loading fighter module...');
    const fighterModule = await import('./fighter.js?v=8');

    if (typeof fighterModule.initializeNpcSpawnersForArea !== 'function') {
      throw new Error('fighter.js does not export initializeNpcSpawnersForArea');
    }

    console.log('[EntityInit/NPCs] Fighter module loaded, initializing spawners...');

    // Call the NPC spawner initialization
    fighterModule.initializeNpcSpawnersForArea(area);

    // Count spawners from the area
    const spawnerCount = Array.isArray(area.spawners) ? area.spawners.length : 0;
    result.initialized = spawnerCount;

    console.log('[EntityInit/NPCs] ✅ NPC spawner initialization triggered for', spawnerCount, 'spawners');

    return result;

  } catch (error) {
    console.error('[EntityInit/NPCs] ❌ Failed to initialize NPC spawners:', error);
    result.failed = Array.isArray(area.spawners) ? area.spawners.length : 0;
    throw error;
  }
}

/**
 * Check if required game systems are ready
 * @returns {Object} Status of required systems
 */
export function checkSystemReadiness() {
  const status = {
    ready: true,
    systems: {},
  };

  // Check MapRegistry
  status.systems.mapRegistry = !!(window.GAME?.mapRegistry || window.__MAP_REGISTRY__);

  // Check SpawnService
  status.systems.spawnService = !!window.GAME?.spawnService;

  // Check FIGHTERS object
  status.systems.fighters = !!window.GAME?.FIGHTERS;

  // Check CONFIG
  status.systems.config = !!window.CONFIG;

  // Overall readiness
  status.ready = Object.values(status.systems).every(ready => ready);

  if (!status.ready) {
    console.warn('[EntityInit] ⚠️ Some systems not ready:', status.systems);
  }

  return status;
}
