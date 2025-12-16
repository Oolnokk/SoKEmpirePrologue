/**
 * DayNightSystem.js
 * Manages ambient lighting and time-of-day state for the game
 */

export class DayNightSystem {
  constructor(options = {}) {
    this.isNight = options.defaultToNight !== undefined ? options.defaultToNight : true;
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
      ambientColor: 0x404060,
      ambientIntensity: 0.3,
      skyColor: 0x1a1a2e,
      groundColor: 0x0a0a14,
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

    // Handle both MeshStandardMaterial (with emissive) and MeshBasicMaterial (color only)
    if (material.emissive) {
      // MeshStandardMaterial or custom material with emissive support
      if (isNight) {
        material.emissive.setHex(emissiveObj.nightEmissive);
        material.emissiveIntensity = emissiveObj.nightIntensity * blend;
      } else {
        material.emissive.setHex(emissiveObj.dayEmissive);
        material.emissiveIntensity = emissiveObj.dayIntensity * (1 - blend);
      }
    } else {
      // MeshBasicMaterial - use color and opacity
      if (isNight) {
        material.color.setHex(emissiveObj.nightEmissive);
        material.opacity = emissiveObj.nightIntensity * blend;
      } else {
        material.color.setHex(emissiveObj.dayEmissive);
        material.opacity = emissiveObj.dayIntensity * (1 - blend);
      }
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

    if (immediate) {
      this.transitionProgress = 1.0;
      this.isTransitioning = false;
      this.applyState(1.0);
      this.emit('timeChange', { isNight: this.isNight });
    } else {
      this.startTransition();
    }
  }

  /**
   * Start a transition between day and night
   */
  startTransition() {
    this.isTransitioning = true;
    this.transitionProgress = 0;
    this.transitionStartTime = performance.now();
    this.emit('transitionStart', { isNight: this.isNight });
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
   * Apply current state with given blend factor
   * @param {number} blend - Blend factor (0-1)
   */
  applyState(blend) {
    // Update all registered emissive objects
    for (const emissiveObj of this.emissiveObjects) {
      this.updateEmissiveObject(emissiveObj, this.isNight, blend);
    }
  }

  /**
   * Get current lighting configuration
   * @returns {Object} Current lighting config
   */
  getCurrentLightingConfig() {
    if (!this.isTransitioning) {
      return this.isNight ? this.nightConfig : this.dayConfig;
    }

    // Interpolate between day and night configs
    const blend = this.easeInOutCubic(this.transitionProgress);
    const from = this.isNight ? this.dayConfig : this.nightConfig;
    const to = this.isNight ? this.nightConfig : this.dayConfig;

    return {
      ambientColor: this.lerpColor(from.ambientColor, to.ambientColor, blend),
      ambientIntensity: this.lerp(from.ambientIntensity, to.ambientIntensity, blend),
      skyColor: this.lerpColor(from.skyColor, to.skyColor, blend),
      groundColor: this.lerpColor(from.groundColor, to.groundColor, blend),
      hemisphereIntensity: this.lerp(from.hemisphereIntensity, to.hemisphereIntensity, blend)
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
