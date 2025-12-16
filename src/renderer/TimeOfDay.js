/**
 * TimeOfDay manages the day/night cycle and provides smooth transitions
 * between different time periods (dawn, day, dusk, night).
 * 
 * Usage:
 *   const timeOfDay = new TimeOfDay({ speed: 1.0 });
 *   timeOfDay.on('change', (data) => console.log('Time changed:', data));
 *   timeOfDay.start();
 */

/**
 * Time period definitions with lighting properties
 */
const TIME_PERIODS = {
  dawn: {
    name: 'dawn',
    startHour: 5,
    endHour: 7,
    ambientColor: 0xffa873, // Warm orange
    ambientIntensity: 0.5,
    directionalColor: 0xffb380, // Soft orange-pink
    directionalIntensity: 0.6,
    backgroundColor: 0xff9966,
    fogColor: 0xffaa88,
    emissiveMultiplier: 0.7, // Emissive objects still visible
  },
  day: {
    name: 'day',
    startHour: 7,
    endHour: 17,
    ambientColor: 0xffffff, // Neutral white
    ambientIntensity: 0.8,
    directionalColor: 0xffffff, // Bright white
    directionalIntensity: 1.0,
    backgroundColor: 0x87ceeb, // Sky blue
    fogColor: 0xccddff,
    emissiveMultiplier: 0.2, // Emissive objects less visible
  },
  dusk: {
    name: 'dusk',
    startHour: 17,
    endHour: 19,
    ambientColor: 0xffaa66, // Warm orange
    ambientIntensity: 0.4,
    directionalColor: 0xff8844, // Orange-purple
    directionalIntensity: 0.5,
    backgroundColor: 0xff7744,
    fogColor: 0xaa6699,
    emissiveMultiplier: 0.8, // Emissive objects becoming prominent
  },
  night: {
    name: 'night',
    startHour: 19,
    endHour: 5,
    ambientColor: 0x334466, // Cool blue
    ambientIntensity: 0.2,
    directionalColor: 0x445577, // Dark blue
    directionalIntensity: 0.3,
    backgroundColor: 0x0a1428, // Dark blue-black
    fogColor: 0x1a2030,
    emissiveMultiplier: 1.5, // Emissive objects highly visible
  },
};

/**
 * Get the time period for a given hour
 * @param {number} hour - Hour of day (0-24)
 * @returns {Object} Time period definition
 */
function getPeriodForHour(hour) {
  const h = hour % 24;
  
  if (h >= TIME_PERIODS.dawn.startHour && h < TIME_PERIODS.dawn.endHour) {
    return TIME_PERIODS.dawn;
  } else if (h >= TIME_PERIODS.day.startHour && h < TIME_PERIODS.day.endHour) {
    return TIME_PERIODS.day;
  } else if (h >= TIME_PERIODS.dusk.startHour && h < TIME_PERIODS.dusk.endHour) {
    return TIME_PERIODS.dusk;
  } else {
    return TIME_PERIODS.night;
  }
}

/**
 * Linearly interpolate between two values
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated value
 */
function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Interpolate between two colors (hex)
 * @param {number} color1 - First color (hex)
 * @param {number} color2 - Second color (hex)
 * @param {number} t - Interpolation factor (0-1)
 * @returns {number} Interpolated color (hex)
 */
function lerpColor(color1, color2, t) {
  const r1 = (color1 >> 16) & 0xff;
  const g1 = (color1 >> 8) & 0xff;
  const b1 = color1 & 0xff;
  
  const r2 = (color2 >> 16) & 0xff;
  const g2 = (color2 >> 8) & 0xff;
  const b2 = color2 & 0xff;
  
  const r = Math.round(lerp(r1, r2, t));
  const g = Math.round(lerp(g1, g2, t));
  const b = Math.round(lerp(b1, b2, t));
  
  return (r << 16) | (g << 8) | b;
}

/**
 * Interpolate between two time periods
 * @param {Object} period1 - First period
 * @param {Object} period2 - Second period
 * @param {number} t - Interpolation factor (0-1)
 * @returns {Object} Interpolated lighting properties
 */
function interpolatePeriods(period1, period2, t) {
  return {
    name: `${period1.name}->${period2.name}`,
    ambientColor: lerpColor(period1.ambientColor, period2.ambientColor, t),
    ambientIntensity: lerp(period1.ambientIntensity, period2.ambientIntensity, t),
    directionalColor: lerpColor(period1.directionalColor, period2.directionalColor, t),
    directionalIntensity: lerp(period1.directionalIntensity, period2.directionalIntensity, t),
    backgroundColor: lerpColor(period1.backgroundColor, period2.backgroundColor, t),
    fogColor: lerpColor(period1.fogColor, period2.fogColor, t),
    emissiveMultiplier: lerp(period1.emissiveMultiplier, period2.emissiveMultiplier, t),
  };
}

/**
 * TimeOfDay class manages the day/night cycle
 */
export class TimeOfDay {
  /**
   * @param {Object} options - Configuration options
   * @param {number} [options.startHour=12] - Starting hour (0-24)
   * @param {number} [options.speed=1.0] - Time progression speed (1.0 = 1 hour per minute)
   * @param {number} [options.transitionDuration=0.5] - Transition duration in hours
   * @param {boolean} [options.enabled=true] - Whether time progression is enabled
   */
  constructor(options = {}) {
    this.currentHour = options.startHour !== undefined ? options.startHour : 12;
    this.speed = options.speed !== undefined ? options.speed : 1.0;
    this.transitionDuration = options.transitionDuration !== undefined ? options.transitionDuration : 0.5;
    this.enabled = options.enabled !== undefined ? options.enabled : true;
    
    this.lastUpdateTime = null;
    this.currentPeriod = getPeriodForHour(this.currentHour);
    
    // Event handlers
    this.eventHandlers = {
      change: [],
      periodChange: [],
    };
  }

  /**
   * Get current lighting properties based on time of day
   * @returns {Object} Lighting properties
   */
  getLightingProperties() {
    const currentPeriod = getPeriodForHour(this.currentHour);
    const nextPeriod = this.getNextPeriod(currentPeriod);
    
    // Calculate transition progress
    const periodStart = currentPeriod.startHour;
    const periodEnd = currentPeriod.endHour;
    let periodDuration = periodEnd - periodStart;
    if (periodDuration < 0) periodDuration += 24; // Handle midnight wrap
    
    let hourInPeriod = this.currentHour - periodStart;
    if (hourInPeriod < 0) hourInPeriod += 24; // Handle midnight wrap
    
    // Calculate how close we are to the end of the period
    const transitionStart = periodDuration - this.transitionDuration;
    
    if (hourInPeriod < transitionStart) {
      // Not in transition, use current period properties
      return currentPeriod;
    } else {
      // In transition to next period
      const transitionProgress = (hourInPeriod - transitionStart) / this.transitionDuration;
      return interpolatePeriods(currentPeriod, nextPeriod, transitionProgress);
    }
  }

  /**
   * Get the next time period after the given period
   * @param {Object} period - Current period
   * @returns {Object} Next period
   */
  getNextPeriod(period) {
    const periodOrder = ['dawn', 'day', 'dusk', 'night'];
    const currentIndex = periodOrder.indexOf(period.name);
    const nextIndex = (currentIndex + 1) % periodOrder.length;
    return TIME_PERIODS[periodOrder[nextIndex]];
  }

  /**
   * Update time progression
   * @param {number} deltaTime - Time elapsed in milliseconds
   */
  update(deltaTime) {
    if (!this.enabled) return;
    
    const prevPeriod = this.currentPeriod;
    
    // Convert deltaTime (ms) to hours
    // Speed 1.0 = 1 game hour per real minute (60000ms)
    const hoursElapsed = (deltaTime / 60000) * this.speed;
    this.currentHour = (this.currentHour + hoursElapsed) % 24;
    
    this.currentPeriod = getPeriodForHour(this.currentHour);
    
    // Emit change event
    const properties = this.getLightingProperties();
    this.emit('change', {
      hour: this.currentHour,
      period: this.currentPeriod.name,
      properties,
    });
    
    // Emit period change event if period actually changed
    if (prevPeriod.name !== this.currentPeriod.name) {
      this.emit('periodChange', {
        from: prevPeriod.name,
        to: this.currentPeriod.name,
        hour: this.currentHour,
      });
    }
  }

  /**
   * Set current hour
   * @param {number} hour - Hour to set (0-24)
   */
  setHour(hour) {
    this.currentHour = hour % 24;
    this.currentPeriod = getPeriodForHour(this.currentHour);
    
    const properties = this.getLightingProperties();
    this.emit('change', {
      hour: this.currentHour,
      period: this.currentPeriod.name,
      properties,
    });
  }

  /**
   * Set time progression speed
   * @param {number} speed - Speed multiplier
   */
  setSpeed(speed) {
    this.speed = speed;
  }

  /**
   * Enable or disable time progression
   * @param {boolean} enabled - Whether to enable time progression
   */
  setEnabled(enabled) {
    this.enabled = enabled;
  }

  /**
   * Register an event handler
   * @param {string} event - Event name ('change', 'periodChange')
   * @param {Function} callback - Event handler function
   */
  on(event, callback) {
    if (!this.eventHandlers[event]) {
      console.warn(`Unknown event type: ${event}`);
      return;
    }

    if (typeof callback !== 'function') {
      console.warn('Event callback must be a function');
      return;
    }

    this.eventHandlers[event].push(callback);
  }

  /**
   * Unregister an event handler
   * @param {string} event - Event name
   * @param {Function} callback - Event handler function to remove
   */
  off(event, callback) {
    if (!this.eventHandlers[event]) {
      return;
    }

    const index = this.eventHandlers[event].indexOf(callback);
    if (index > -1) {
      this.eventHandlers[event].splice(index, 1);
    }
  }

  /**
   * Emit an event
   * @private
   * @param {string} event - Event name
   * @param {*} data - Event data
   */
  emit(event, data) {
    if (!this.eventHandlers[event]) {
      return;
    }

    this.eventHandlers[event].forEach(callback => {
      try {
        callback(data);
      } catch (error) {
        console.error(`Error in event handler for ${event}:`, error);
      }
    });
  }

  /**
   * Get current state as a plain object
   * @returns {Object} Current state
   */
  getState() {
    return {
      hour: this.currentHour,
      period: this.currentPeriod.name,
      speed: this.speed,
      enabled: this.enabled,
      properties: this.getLightingProperties(),
    };
  }
}

/**
 * Export time periods for external use
 */
export { TIME_PERIODS };
