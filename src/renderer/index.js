/**
 * Renderer module exports
 * 
 * Provides a lightweight, reusable renderer that wraps Three.js when available
 * and operates safely in non-rendering environments.
 */

export { createRenderer, isSupported, Renderer } from './Renderer.js';
export { TimeOfDay, TIME_PERIODS } from './TimeOfDay.js';
export { LightingManager } from './LightingManager.js';
export { EmissiveManager } from './EmissiveManager.js';
