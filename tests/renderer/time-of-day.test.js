import { describe, it, beforeEach } from 'node:test';
import { strictEqual, ok } from 'assert';
import { TimeOfDay, TIME_PERIODS } from '../../src/renderer/TimeOfDay.js';

describe('TimeOfDay', () => {
  let timeOfDay;

  beforeEach(() => {
    timeOfDay = new TimeOfDay({ startHour: 12, speed: 1.0 });
  });

  describe('initialization', () => {
    it('should initialize with default values', () => {
      const tod = new TimeOfDay();
      strictEqual(tod.currentHour, 12);
      strictEqual(tod.speed, 1.0);
      strictEqual(tod.enabled, true);
    });

    it('should initialize with custom values', () => {
      const tod = new TimeOfDay({ startHour: 6, speed: 2.0, enabled: false });
      strictEqual(tod.currentHour, 6);
      strictEqual(tod.speed, 2.0);
      strictEqual(tod.enabled, false);
    });
  });

  describe('getLightingProperties', () => {
    it('should return day properties at noon', () => {
      timeOfDay.setHour(12);
      const props = timeOfDay.getLightingProperties();
      strictEqual(props.name, 'day');
      strictEqual(props.ambientColor, TIME_PERIODS.day.ambientColor);
    });

    it('should return night properties at midnight', () => {
      timeOfDay.setHour(0);
      const props = timeOfDay.getLightingProperties();
      strictEqual(props.name, 'night');
      strictEqual(props.ambientColor, TIME_PERIODS.night.ambientColor);
    });

    it('should return dawn properties at 6am', () => {
      timeOfDay.setHour(6);
      const props = timeOfDay.getLightingProperties();
      strictEqual(props.name, 'dawn');
      strictEqual(props.ambientColor, TIME_PERIODS.dawn.ambientColor);
    });

    it('should return dusk properties at 6pm', () => {
      timeOfDay.setHour(18);
      const props = timeOfDay.getLightingProperties();
      strictEqual(props.name, 'dusk');
      strictEqual(props.ambientColor, TIME_PERIODS.dusk.ambientColor);
    });
  });

  describe('update', () => {
    it('should progress time based on deltaTime', () => {
      timeOfDay.setHour(12);
      const initialHour = timeOfDay.currentHour;
      
      // Update with 1 minute (60000ms) at speed 1.0 = 1 game hour
      timeOfDay.update(60000);
      
      ok(timeOfDay.currentHour > initialHour);
    });

    it('should wrap around at 24 hours', () => {
      timeOfDay.setHour(23.5);
      
      // Update with 1 minute (60000ms) at speed 1.0 = 1 game hour
      timeOfDay.update(60000);
      
      ok(timeOfDay.currentHour < 23.5);
    });

    it('should not progress when disabled', () => {
      timeOfDay.setHour(12);
      timeOfDay.setEnabled(false);
      const initialHour = timeOfDay.currentHour;
      
      timeOfDay.update(60000);
      
      strictEqual(timeOfDay.currentHour, initialHour);
    });

    it('should respect speed multiplier', () => {
      timeOfDay.setHour(12);
      timeOfDay.setSpeed(2.0);
      const initialHour = timeOfDay.currentHour;
      
      // Update with 1 minute at speed 2.0 = 2 game hours
      timeOfDay.update(60000);
      
      ok(timeOfDay.currentHour >= initialHour + 1.9); // Allow for small floating point errors
    });
  });

  describe('setHour', () => {
    it('should set the current hour', () => {
      timeOfDay.setHour(18);
      strictEqual(timeOfDay.currentHour, 18);
    });

    it('should wrap hours greater than 24', () => {
      timeOfDay.setHour(26);
      strictEqual(timeOfDay.currentHour, 2);
    });

    it('should emit change event', (t, done) => {
      let eventFired = false;
      timeOfDay.on('change', () => {
        eventFired = true;
      });
      
      timeOfDay.setHour(18);
      
      // Check after a short delay to ensure event processing
      setTimeout(() => {
        ok(eventFired, 'Change event should have fired');
        done();
      }, 10);
    });
  });

  describe('event handling', () => {
    it('should register and call event handlers', (t, done) => {
      timeOfDay.on('change', (data) => {
        ok(data.hour !== undefined);
        ok(data.period !== undefined);
        ok(data.properties !== undefined);
        done();
      });
      
      timeOfDay.setHour(15);
    });

    it('should emit periodChange event when period changes', (t, done) => {
      timeOfDay.setHour(6.5); // Dawn
      
      timeOfDay.on('periodChange', (data) => {
        strictEqual(data.from, 'dawn');
        strictEqual(data.to, 'day');
        done();
      });
      
      // Progress time to transition to day
      timeOfDay.update(60000); // 1 hour at speed 1.0
    });

    it('should unregister event handlers', () => {
      let callCount = 0;
      const handler = () => callCount++;
      
      timeOfDay.on('change', handler);
      timeOfDay.setHour(15);
      strictEqual(callCount, 1);
      
      timeOfDay.off('change', handler);
      timeOfDay.setHour(16);
      strictEqual(callCount, 1); // Should not have increased
    });
  });

  describe('getState', () => {
    it('should return current state', () => {
      timeOfDay.setHour(12);
      timeOfDay.setSpeed(2.0);
      
      const state = timeOfDay.getState();
      
      strictEqual(state.hour, 12);
      strictEqual(state.period, 'day');
      strictEqual(state.speed, 2.0);
      strictEqual(state.enabled, true);
      ok(state.properties !== undefined);
    });
  });
});

describe('TIME_PERIODS', () => {
  it('should have all required periods', () => {
    ok(TIME_PERIODS.dawn);
    ok(TIME_PERIODS.day);
    ok(TIME_PERIODS.dusk);
    ok(TIME_PERIODS.night);
  });

  it('should have required properties for each period', () => {
    Object.values(TIME_PERIODS).forEach((period) => {
      ok(period.name);
      ok(typeof period.startHour === 'number');
      ok(typeof period.endHour === 'number');
      ok(typeof period.ambientColor === 'number');
      ok(typeof period.ambientIntensity === 'number');
      ok(typeof period.directionalColor === 'number');
      ok(typeof period.directionalIntensity === 'number');
      ok(typeof period.backgroundColor === 'number');
      ok(typeof period.emissiveMultiplier === 'number');
    });
  });
});
