// dom-utils.js — Shared DOM utility functions
// Provides common DOM manipulation helpers used across multiple modules

/**
 * Shorthand for querySelector
 * @param {string} sel - CSS selector
 * @param {Element|Document} el - Element to query from (defaults to document)
 * @returns {Element|null} Matched element or null
 */
export const $$ = (sel, el = document) => el.querySelector(sel);

/**
 * Show or hide an element by setting display style
 * @param {Element|null} el - Element to show/hide
 * @param {boolean} v - True to show, false to hide
 */
export function show(el, v) {
  if (!el) return;
  el.style.display = v ? '' : 'none';
}

/**
 * Format a number for display with specified decimal places
 * @param {number} n - Number to format
 * @param {number} decimals - Number of decimal places (default: 2)
 * @returns {string} Formatted number string
 */
export function fmt(n, decimals = 2) {
  if (n == null || !Number.isFinite(n)) return '0.00';
  return Number(n).toFixed(decimals);
}
