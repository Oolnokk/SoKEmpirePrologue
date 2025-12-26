# Debug Logger - Console Debug Routing System

A centralized switchboard for controlling console debug messages by category.

## Overview

The debug logger allows you to turn console logging on/off by category, making it easy to focus on specific subsystems without being overwhelmed by debug output.

**All categories are OFF by default** - you enable only what you need.

## Features

- ✅ **Category-based routing** - Control which subsystems log to console
- ✅ **Persistent settings** - Preferences saved to localStorage
- ✅ **UI controls** - Toggle categories via debug panel checkboxes
- ✅ **Programmatic API** - Control logging from browser console
- ✅ **Multiple log levels** - Support for log, warn, error, info, debug

## Available Categories

The system includes pre-configured categories for all major subsystems:

- `debug-panel` - Debug panel operations
- `animator` - Animation system
- `combat` - Combat system
- `visualsmapLoader` - 3D map loading
- `bottle-track` - Bottle physics tracking
- `render` - Rendering system
- `physics` - Physics simulation
- `camera` - Camera controls
- `cosmetics` - Cosmetic rendering
- `coordinate-transform` - Coordinate transformations
- `npc` - NPC behavior
- `spawner` - Spawner system
- `ability` - Ability system
- `attack` - Attack system
- `map` - Map system
- `lighting` - Lighting system
- `app` - Application core
- `controls` - Input controls
- `hit-detect` - Hit detection
- `audio` - Audio system
- `ui` - UI system

## Usage in Code

### Basic Logging

```javascript
// Import the logger
import { DEBUG_LOGGER } from './debug-logger.js';

// Or use the global function (available after debug-panel loads)
debugLog('category', 'message', data);
debugWarn('category', 'warning message');
debugError('category', 'error message');
```

### Example Usage

```javascript
// Instead of:
console.log('[animator] Starting animation:', animName);

// Use:
debugLog('animator', 'Starting animation:', animName);
// or
DEBUG_LOGGER.log('animator', 'Starting animation:', animName);
```

### Different Log Levels

```javascript
DEBUG_LOGGER.log('combat', 'Attack started');           // Info logging
DEBUG_LOGGER.warn('combat', 'Low health warning');      // Warnings
DEBUG_LOGGER.error('combat', 'Attack failed', err);     // Errors
DEBUG_LOGGER.info('combat', 'Combat initialized');      // Info
DEBUG_LOGGER.debug('combat', 'Frame state:', state);    // Debug details
```

## UI Controls

### Debug Panel

1. Open the debug panel (🔍 Debug button)
2. Scroll to the **🔌 Console Debug Routing** section
3. Check/uncheck categories to enable/disable logging
4. Use **All On** / **All Off** buttons for quick toggling

### Browser Console API

Control logging programmatically from the browser console:

```javascript
// Enable a category
DEBUG_LOGGER.enable('animator');

// Disable a category
DEBUG_LOGGER.disable('animator');

// Toggle a category
DEBUG_LOGGER.toggle('animator');

// Check if enabled
DEBUG_LOGGER.isEnabled('animator'); // returns true/false

// Enable all categories
DEBUG_LOGGER.enableAll();

// Disable all categories
DEBUG_LOGGER.disableAll();

// Reset to defaults (all off)
DEBUG_LOGGER.resetToDefaults();

// Get all categories and their states
DEBUG_LOGGER.getCategories();
```

## Migration Guide

### Converting Existing Code

**Before:**
```javascript
console.log('[debug-panel] Panel initialized');
console.warn('[animator] Animation not found');
console.error('[combat] Failed to load attack');
```

**After:**
```javascript
debugLog('debug-panel', 'Panel initialized');
debugWarn('animator', 'Animation not found');
debugError('combat', 'Failed to load attack');
```

### Pattern Matching

The old pattern used square brackets: `[category]`
The new pattern uses function arguments: `debugLog('category', ...)`

The logged output format is the same: `[category] message`

## Adding New Categories

To add a new category:

1. Edit `docs/js/debug-logger.js`
2. Add the category to `defaultCategories` object
3. Set default state (usually `false`)

```javascript
defaultCategories: {
  // ... existing categories
  'my-new-category': false,
}
```

The category will automatically appear in the debug panel UI.

## Benefits

### Before Debug Logger
- Console flooded with messages from all subsystems
- Hard to find relevant logs
- No easy way to filter without code changes
- Performance impact from unused logging

### After Debug Logger
- Enable only the categories you need
- Clear, focused debug output
- Quick toggles via UI or console
- Settings persist across sessions
- Better performance (disabled categories skip logging)

## Examples

### Debugging Animation Issues
```javascript
// In browser console:
DEBUG_LOGGER.enable('animator');
DEBUG_LOGGER.enable('render');

// Now only animator and render logs will appear
// Other subsystems remain silent
```

### Debugging Combat
```javascript
// Enable combat-related categories
DEBUG_LOGGER.enable('combat');
DEBUG_LOGGER.enable('attack');
DEBUG_LOGGER.enable('hit-detect');
DEBUG_LOGGER.enable('ability');
```

### Quiet Mode (Disable Everything)
```javascript
DEBUG_LOGGER.disableAll();
```

### Verbose Mode (Enable Everything)
```javascript
DEBUG_LOGGER.enableAll();
```

## Technical Details

- **Storage**: Settings saved to `localStorage` under key `DEBUG_LOG_CATEGORIES`
- **Module**: `docs/js/debug-logger.js`
- **Global Access**: Available via `window.DEBUG_LOGGER`
- **Convenience Functions**: `debugLog()`, `debugWarn()`, `debugError()`, `debugInfo()`
- **UI Integration**: Debug panel in `docs/js/debug-panel.js` and `docs/index.html`

## Default State

All categories are **disabled by default**. This ensures:
- Clean console on page load
- No performance impact from unused logging
- Explicit opt-in for debugging

To enable categories, use the debug panel UI or browser console API.
