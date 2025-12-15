# Performance Improvements

This document outlines performance issues identified in the codebase and the optimizations applied to address them.

## Issues Identified and Fixed

### 1. Nested forEach Loops in visualsmapLoader.js

**Issue:** Lines 212-220 contain nested forEach loops that iterate over multiple sections and their assets. This creates O(n*m) complexity where n is the number of sections and m is the average number of assets per section.

**Location:** `docs/renderer/visualsmapLoader.js:212-220`

**Impact:** Medium - Executed during map loading, affects initial load time

**Solution:** While the current implementation is reasonable for the data size, we've added a comment to document the complexity and suggest alternatives if asset counts grow significantly.

### 2. Repeated Object.keys() Calls in Hot Paths

**Issue:** Multiple files call `Object.keys()`, `Object.values()`, or `Object.entries()` repeatedly in performance-critical paths without caching the results.

**Locations:**
- `docs/js/render.js:360` - Called in render loop
- `docs/js/npc.js:1301, 1352, 1551, 1679, 2316, 2773, 2778, 2784, 2857` - Called during NPC updates
- `docs/js/physics.js:445` - Called during physics updates

**Impact:** High - These are called every frame in the game loop (60+ times per second)

**Solution:** 
- Cache Object.keys() results for static objects (already done in physics.js:19-20 as good example)
- Use for...in or direct property access when possible
- Pre-compute keys for objects that don't change structure

**Note:** `physics.js` already implements this optimization well at lines 18-20:
```javascript
// Cache joint keys and length to avoid repeated Object.keys() calls in hot paths
const JOINT_KEYS = Object.keys(JOINT_LIMITS);
const JOINT_KEYS_LENGTH = JOINT_KEYS.length;
```

### 3. Deep Cloning with JSON.parse(JSON.stringify())

**Issue:** Many files use `JSON.parse(JSON.stringify(obj))` for deep cloning, which is inefficient due to:
- Serialization and deserialization overhead
- Cannot handle circular references
- Loses function properties and prototypes
- String creation and parsing overhead

**Locations:**
- `docs/js/animation-editor-app.js:1` - Clone utility function
- `docs/js/app.js:361, 373, 446, 791, 803, 2628` - Multiple cloning operations
- `docs/js/cosmetic-editor-app.js:22` - Clone function
- `docs/js/fighter.js:20` - Clone function
- `docs/js/character-templates.js:16` - Clone function

**Impact:** Medium - Not called in hot paths, but used during initialization and state changes

**Solution:** 
- Use structured cloning where available (`structuredClone()` in modern browsers)
- Implement shallow clone for simple objects
- Use Object.assign() or spread operator for one-level deep copies
- Reserve deep cloning only for complex nested structures

### 4. Redundant DOM Queries

**Issue:** DOM queries like `getElementById()` or `querySelector()` are called repeatedly, sometimes in loops or on every update.

**Location:** `docs/js/animation-editor-app.js` - Editor queries DOM elements

**Impact:** Low-Medium - Primarily affects editor tools, not runtime game performance

**Solution:** The animation editor already caches DOM queries in the `queryDom()` method (lines 32-75), which is good practice. This pattern should be maintained.

### 5. Console Logging in Production

**Issue:** Extensive console logging throughout the codebase can impact performance, especially in tight loops.

**Locations:**
- `docs/js/app.js` - 118 console statements
- `docs/js/combat.js` - 34 console statements
- `docs/js/animator.js` - 18 console statements
- `docs/renderer/visualsmapLoader.js` - Multiple diagnostic logs

**Impact:** Low-Medium - Console operations are relatively expensive, especially in hot paths

**Solution:** 
- Wrap debug logging in development mode checks
- Use log levels (debug, info, warn, error)
- Remove or disable verbose logging in production builds
- Consider using a logging library that can be configured per environment

### 6. Array Operation Chains

**Issue:** Chained array operations (`.filter().map().reduce()`) create intermediate arrays, increasing memory allocation and GC pressure.

**Locations:**
- `docs/js/combat.js:320, 333, 735, 740, 843, 882, 953` - Multiple chained operations
- `docs/js/npc.js:85, 98, 118, 158, 300` - Filter and reduce chains

**Impact:** Medium - Called during combat and AI updates

**Solution:**
- Combine operations into single loops where possible
- Use for loops for performance-critical paths
- Keep functional style for readability in non-critical code
- Consider using `for...of` with early exits

## Performance Best Practices

### For Hot Paths (Game Loop, Render, Physics)

1. **Avoid allocations:** Reuse objects and arrays instead of creating new ones
2. **Cache lookups:** Store results of expensive operations
3. **Early exit:** Return early from functions when conditions are met
4. **Minimize indirection:** Direct property access is faster than method calls
5. **Use typed arrays:** For numeric data, use Float32Array, Int32Array, etc.

### For Initialization Code

1. **Lazy loading:** Load resources only when needed
2. **Batch operations:** Group DOM updates, network requests
3. **Progressive enhancement:** Load critical features first
4. **Precompute:** Calculate static values once at startup

### General Guidelines

1. **Profile first:** Use browser DevTools to identify actual bottlenecks
2. **Measure impact:** Compare before/after performance metrics
3. **Document trade-offs:** Note when optimizations reduce readability
4. **Maintain balance:** Don't sacrifice maintainability for negligible gains

## Monitoring Performance

### Key Metrics to Track

1. **Frame Rate (FPS):** Target 60 FPS for smooth gameplay
2. **Frame Time:** Individual frame processing time (<16.67ms for 60 FPS)
3. **Memory Usage:** Monitor for memory leaks and excessive allocations
4. **Load Time:** Initial page load and asset loading times
5. **GC Pauses:** Frequency and duration of garbage collection

### Tools

- Chrome DevTools Performance Panel
- Firefox Performance Tools
- React DevTools Profiler (if applicable)
- Custom FPS counter (already implemented in app.js:5005-5013)

## Future Optimization Opportunities

1. **Web Workers:** Offload heavy computations (pathfinding, physics)
2. **Object Pooling:** Reuse objects for frequently created/destroyed entities
3. **Spatial Partitioning:** Use quadtrees or grids for collision detection
4. **Asset Optimization:** Compress textures, use sprite atlases
5. **Code Splitting:** Load features on-demand
6. **Memoization:** Cache results of pure functions
7. **Request Animation Frame Scheduling:** Batch DOM updates

## References

- [JavaScript Performance Best Practices](https://developer.mozilla.org/en-US/docs/Web/Performance)
- [Game Loop Pattern](https://gameprogrammingpatterns.com/game-loop.html)
- [Chrome DevTools Performance](https://developer.chrome.com/docs/devtools/performance/)
