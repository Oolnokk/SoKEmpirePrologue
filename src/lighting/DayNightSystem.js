/**
 * DayNightSystem.js
 * Manages ambient lighting and time-of-day state for the game
 */

export class DayNightSystem {
  constructor(options = {}) {
    this.isNight = options.defaultToNight !== undefined ? options.defaultToNight : true;
    this.timeOfDayHours = this.isNight ? 0 : 12; // 0-24 hours (0=midnight, 12=noon)
    this.transitionDuration = options.transitionDuration || 2000; // ms
    this.isTransitioning = false;
    this.transitionProgress = 0;

    // Lighting configurations
    this.dayConfig = {
      ambientColor: 0xffffff,
      ambientIntensity: 1.0,
      skyColor: 0x87ceeb,
      groundColor: 0x8b7355,
      hemisphereIntensity: 0.6
    };

    this.nightConfig = {
      ambientColor: 0x1a1a2e,
      ambientIntensity: 0.2, // Dark but visible now that materials are tinted
      skyColor: 0x0a0a14,
      groundColor: 0x050508,
      hemisphereIntensity: 0.2
    };

    // Emissive objects registry
    this.emissiveObjects = [];

    // Event listeners
    this.listeners = {
      'timeChange': [],
      'transitionStart': [],
      'transitionEnd': []
    };
  }

  /**
   * Register an emissive object to be controlled by day/night cycle
   * @param {Object} obj - Object with material property
   * @param {Object} config - Configuration for day/night states
   */
  registerEmissiveObject(obj, config = {}) {
    const emissiveObj = {
      object: obj,
      nightEmissive: config.nightEmissive || 0xffbb66, // Orangy pale yellow
      nightIntensity: config.nightIntensity || 0.8,
      dayEmissive: config.dayEmissive || 0x000000, // Black
      dayIntensity: config.dayIntensity || 0.0
    };

    this.emissiveObjects.push(emissiveObj);

    // Set initial state
    this.updateEmissiveObject(emissiveObj, this.isNight);

    return emissiveObj;
  }

  /**
   * Unregister an emissive object
   * @param {Object} obj - The object to unregister
   */
  unregisterEmissiveObject(obj) {
    const index = this.emissiveObjects.findIndex(e => e.object === obj);
    if (index !== -1) {
      this.emissiveObjects.splice(index, 1);
    }
  }

  /**
   * Update emissive properties of an object based on day/night state
   * @param {Object} emissiveObj - The emissive object config
   * @param {boolean} isNight - Whether it's night time
   * @param {number} blend - Blend factor (0-1) for transitions
   */
  updateEmissiveObject(emissiveObj, isNight, blend = 1.0) {
    if (!emissiveObj.object || !emissiveObj.object.material) return;

    const material = emissiveObj.object.material;

    // Use color and opacity for day/night changes (works with MeshBasicMaterial)
    if (isNight) {
      material.color.setHex(emissiveObj.nightEmissive);
      material.opacity = emissiveObj.nightIntensity * blend;
    } else {
      material.color.setHex(emissiveObj.dayEmissive);
      material.opacity = emissiveObj.dayIntensity * (1 - blend);
    }

    material.needsUpdate = true;
  }

  /**
   * Toggle between day and night
   * @param {boolean} immediate - If true, skip transition
   */
  toggle(immediate = false) {
    this.setTimeOfDay(!this.isNight, immediate);
  }

  /**
   * Set time of day
   * @param {boolean} night - True for night, false for day
   * @param {boolean} immediate - If true, skip transition
   */
  setTimeOfDay(night, immediate = false) {
    if (this.isNight === night && !this.isTransitioning) return;

    this.isNight = night;
    this.timeOfDayHours = night ? 0 : 12;

    if (immediate) {
      this.transitionProgress = 1.0;
      this.isTransitioning = false;
      this.applyState(1.0);
      this.emit('timeChange', { isNight: this.isNight, timeOfDayHours: this.timeOfDayHours });
    } else {
      this.startTransition();
    }
  }

  /**
   * Set time of day using hours (0-24)
   * @param {number} hours - Hour of day (0=midnight, 6=dawn, 12=noon, 18=dusk, 24=midnight)
   * @param {boolean} immediate - If true, skip transition
   */
  setTimeOfDayHours(hours, immediate = false) {
    // Normalize hours to 0-24 range
    hours = ((hours % 24) + 24) % 24;
    this.timeOfDayHours = hours;

    // Determine if it's night (before 6am or after 6pm)
    const wasNight = this.isNight;
    this.isNight = hours < 6 || hours >= 18;

    if (immediate) {
      this.transitionProgress = 1.0;
      this.isTransitioning = false;
      this.applyState(1.0);
      // Always emit time change for continuous lighting updates
      this.emit('timeChange', { isNight: this.isNight, timeOfDayHours: this.timeOfDayHours });
    } else if (wasNight !== this.isNight) {
      this.startTransition();
    } else {
      // Just update the blend without transitioning
      this.applyState(1.0);
      // Emit time change even without day/night transition for continuous lighting
      this.emit('timeChange', { isNight: this.isNight, timeOfDayHours: this.timeOfDayHours });
    }
  }

  /**
   * Start a transition between day and night
   */
  startTransition() {
    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.transitionStartTime = performance.now();
    this.emit('transitionStart', { isNight: this.isNight, timeOfDayHours: this.timeOfDayHours });
  }

  /**
   * Update the system (call this every frame)
   * @param {number} deltaTime - Time since last update in ms
   */
  update(deltaTime) {
    if (!this.isTransitioning) return;

    const elapsed = performance.now() - this.transitionStartTime;
    this.transitionProgress = Math.min(elapsed / this.transitionDuration, 1.0);

    // Smooth transition using ease-in-out
    const eased = this.easeInOutCubic(this.transitionProgress);

    this.applyState(eased);

    if (this.transitionProgress >= 1.0) {
      this.isTransitioning = false;
      this.emit('transitionEnd', { isNight: this.isNight });
      this.emit('timeChange', { isNight: this.isNight });
    }
  }

  /**
   * Check if candles should be lit based on time and config
   * @returns {boolean} Whether candles should be lit
   */
  areCandlesLit() {
    const CONFIG = (typeof window !== 'undefined' && window.CONFIG) || {};
    const candleStartHour = CONFIG.lighting?.candleStartHour ?? 17;
    const candleEndHour = CONFIG.lighting?.candleEndHour ?? 7;
    const currentHour = this.timeOfDayHours;

    // Candles on from start hour (e.g., 5pm) through midnight to end hour (e.g., 7am)
    return currentHour >= candleStartHour || currentHour < candleEndHour;
  }

  /**
   * Apply current state with given blend factor
   * @param {number} blend - Blend factor (0-1)
   */
  applyState(blend) {
    // Update all registered emissive objects based on candle timing config
    const candlesOn = this.areCandlesLit();
    for (const emissiveObj of this.emissiveObjects) {
      this.updateEmissiveObject(emissiveObj, candlesOn, blend);
    }
  }

  /**
   * Get current lighting configuration with smooth interpolation across all hours
   * @returns {Object} Current lighting config
   */
  getCurrentLightingConfig() {
    // Calculate blend factor based on time of day (0-24 hours)
    // 0-6: night -> dawn, 6-12: dawn -> noon, 12-18: noon -> dusk, 18-24: dusk -> night
    let blend = 0;

    if (this.timeOfDayHours >= 6 && this.timeOfDayHours < 18) {
      // Day time (6am to 6pm) - interpolate from night to day and back
      if (this.timeOfDayHours < 12) {
        // 6am to noon - transitioning from night to full day
        blend = (this.timeOfDayHours - 6) / 6; // 0 to 1
      } else {
        // Noon to 6pm - transitioning from full day back towards night
        blend = 1 - ((this.timeOfDayHours - 12) / 6); // 1 to 0
      }
    } else {
      // Night time (6pm to 6am)
      blend = 0;
    }

    // Apply easing for smoother transitions
    blend = this.easeInOutCubic(blend);

    // If transitioning, use transition blend instead
    if (this.isTransitioning) {
      const transitionBlend = this.easeInOutCubic(this.transitionProgress);
      const from = this.isNight ? this.dayConfig : this.nightConfig;
      const to = this.isNight ? this.nightConfig : this.dayConfig;

      return {
        ambientColor: this.lerpColor(from.ambientColor, to.ambientColor, transitionBlend),
        ambientIntensity: this.lerp(from.ambientIntensity, to.ambientIntensity, transitionBlend),
        skyColor: this.lerpColor(from.skyColor, to.skyColor, transitionBlend),
        groundColor: this.lerpColor(from.groundColor, to.groundColor, transitionBlend),
        hemisphereIntensity: this.lerp(from.hemisphereIntensity, to.hemisphereIntensity, transitionBlend)
      };
    }

    // Interpolate between night and day configs based on time
    return {
      ambientColor: this.lerpColor(this.nightConfig.ambientColor, this.dayConfig.ambientColor, blend),
      ambientIntensity: this.lerp(this.nightConfig.ambientIntensity, this.dayConfig.ambientIntensity, blend),
      skyColor: this.lerpColor(this.nightConfig.skyColor, this.dayConfig.skyColor, blend),
      groundColor: this.lerpColor(this.nightConfig.groundColor, this.dayConfig.groundColor, blend),
      hemisphereIntensity: this.lerp(this.nightConfig.hemisphereIntensity, this.dayConfig.hemisphereIntensity, blend)
    };
  }

  /**
   * Linear interpolation
   */
  lerp(a, b, t) {
    return a + (b - a) * t;
  }

  /**
   * Color interpolation
   */
  lerpColor(colorA, colorB, t) {
    const r1 = (colorA >> 16) & 0xff;
    const g1 = (colorA >> 8) & 0xff;
    const b1 = colorA & 0xff;

    const r2 = (colorB >> 16) & 0xff;
    const g2 = (colorB >> 8) & 0xff;
    const b2 = colorB & 0xff;

    const r = Math.round(this.lerp(r1, r2, t));
    const g = Math.round(this.lerp(g1, g2, t));
    const b = Math.round(this.lerp(b1, b2, t));

    return (r << 16) | (g << 8) | b;
  }

  /**
   * Ease in-out cubic function
   */
  easeInOutCubic(t) {
    return t < 0.5
      ? 4 * t * t * t
      : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  /**
   * Event listener system
   */
  on(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event].push(callback);
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      const index = this.listeners[event].indexOf(callback);
      if (index !== -1) {
        this.listeners[event].splice(index, 1);
      }
    }
  }

  emit(event, data) {
    if (this.listeners[event]) {
      for (const callback of this.listeners[event]) {
        callback(data);
      }
    }
  }

  /**
   * Clean up
   */
  dispose() {
    this.emissiveObjects = [];
    this.listeners = {
      'timeChange': [],
      'transitionStart': [],
      'transitionEnd': []
    };
  }
}
