// debug-logger.js - Centralized debug logging switchboard
// Allows turning console logging on/off by category

const DEBUG_LOGGER = {
  // Default category states - these can be overridden by localStorage
  // All disabled by default - enable only what you need
  defaultCategories: {
    'debug-panel': false,
    'animator': false,
    'combat': false,
    'visualsmapLoader': false,
    'bottle-track': false,
    'render': false,
    'physics': false,
    'camera': false,
    'cosmetics': false,
    'coordinate-transform': false,
    'npc': false,
    'spawner': false,
    'ability': false,
    'attack': false,
    'map': false,
    'lighting': false,
    'app': false,
    'controls': false,
    'hit-detect': false,
    'audio': false,
    'ui': false
  },

  // Current enabled state (will be populated from localStorage or defaults)
  enabled: {},

  // Storage key for localStorage
  STORAGE_KEY: 'DEBUG_LOG_CATEGORIES',

  /**
   * Initialize the debug logger
   * Loads saved settings from localStorage or uses defaults
   */
  init() {
    // Try to load from localStorage
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY);
      if (saved) {
        this.enabled = JSON.parse(saved);
        console.log('[debug-logger] Loaded saved debug categories from localStorage');
      } else {
        this.enabled = { ...this.defaultCategories };
      }
    } catch (e) {
      console.warn('[debug-logger] Failed to load from localStorage, using defaults', e);
      this.enabled = { ...this.defaultCategories };
    }

    // Ensure all default categories exist
    for (const category in this.defaultCategories) {
      if (!(category in this.enabled)) {
        this.enabled[category] = this.defaultCategories[category];
      }
    }
  },

  /**
   * Save current settings to localStorage
   */
  save() {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(this.enabled));
    } catch (e) {
      console.warn('[debug-logger] Failed to save to localStorage', e);
    }
  },

  /**
   * Enable a category
   * @param {string} category - The category to enable
   */
  enable(category) {
    this.enabled[category] = true;
    this.save();
  },

  /**
   * Disable a category
   * @param {string} category - The category to disable
   */
  disable(category) {
    this.enabled[category] = false;
    this.save();
  },

  /**
   * Toggle a category on/off
   * @param {string} category - The category to toggle
   * @returns {boolean} The new state
   */
  toggle(category) {
    const newState = !this.enabled[category];
    this.enabled[category] = newState;
    this.save();
    return newState;
  },

  /**
   * Check if a category is enabled
   * @param {string} category - The category to check
   * @returns {boolean} True if enabled
   */
  isEnabled(category) {
    return this.enabled[category] === true;
  },

  /**
   * Enable all categories
   */
  enableAll() {
    for (const category in this.enabled) {
      this.enabled[category] = true;
    }
    this.save();
  },

  /**
   * Disable all categories
   */
  disableAll() {
    for (const category in this.enabled) {
      this.enabled[category] = false;
    }
    this.save();
  },

  /**
   * Reset to defaults
   */
  resetToDefaults() {
    this.enabled = { ...this.defaultCategories };
    this.save();
  },

  /**
   * Get all categories and their states
   * @returns {Object} Object with category names as keys and enabled state as values
   */
  getCategories() {
    return { ...this.enabled };
  },

  /**
   * Log a message if the category is enabled
   * @param {string} category - The log category
   * @param {...any} args - Arguments to pass to console.log
   */
  log(category, ...args) {
    if (this.isEnabled(category)) {
      console.log(`[${category}]`, ...args);
    }
  },

  /**
   * Log a warning if the category is enabled
   * @param {string} category - The log category
   * @param {...any} args - Arguments to pass to console.warn
   */
  warn(category, ...args) {
    if (this.isEnabled(category)) {
      console.warn(`[${category}]`, ...args);
    }
  },

  /**
   * Log an error if the category is enabled
   * @param {string} category - The log category
   * @param {...any} args - Arguments to pass to console.error
   */
  error(category, ...args) {
    if (this.isEnabled(category)) {
      console.error(`[${category}]`, ...args);
    }
  },

  /**
   * Log info if the category is enabled
   * @param {string} category - The log category
   * @param {...any} args - Arguments to pass to console.info
   */
  info(category, ...args) {
    if (this.isEnabled(category)) {
      console.info(`[${category}]`, ...args);
    }
  },

  /**
   * Log debug if the category is enabled
   * @param {string} category - The log category
   * @param {...any} args - Arguments to pass to console.debug
   */
  debug(category, ...args) {
    if (this.isEnabled(category)) {
      if (console.debug) {
        console.debug(`[${category}]`, ...args);
      } else {
        console.log(`[${category}]`, ...args);
      }
    }
  }
};

// Initialize on load
DEBUG_LOGGER.init();

// Export for use in other modules
if (typeof window !== 'undefined') {
  window.DEBUG_LOGGER = DEBUG_LOGGER;

  // Convenience global function
  window.debugLog = DEBUG_LOGGER.log.bind(DEBUG_LOGGER);
  window.debugWarn = DEBUG_LOGGER.warn.bind(DEBUG_LOGGER);
  window.debugError = DEBUG_LOGGER.error.bind(DEBUG_LOGGER);
  window.debugInfo = DEBUG_LOGGER.info.bind(DEBUG_LOGGER);
}

export { DEBUG_LOGGER };
export default DEBUG_LOGGER;
