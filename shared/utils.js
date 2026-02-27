/**
 * Shared browser-side utilities used by both the overlay and admin panel.
 */

/**
 * Clamp a number between min and max (inclusive).
 * @param {number} val
 * @param {number} lo  - Lower bound
 * @param {number} hi  - Upper bound
 * @returns {number}
 */
export function clamp(val, lo, hi) {
  return Math.max(lo, Math.min(hi, val));
}

/**
 * Parse a hex color string (#RGB or #RRGGBB) into { r, g, b } components (0-255).
 * Returns { r: 0, g: 0, b: 0 } for invalid input.
 * @param {string} hex
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(hex) {
  const raw = (hex || '').replace('#', '');
  const normalized = raw.length === 3
    ? raw.split('').map(c => c + c).join('')
    : raw.padEnd(6, '0');
  return {
    r: parseInt(normalized.slice(0, 2), 16) || 0,
    g: parseInt(normalized.slice(2, 4), 16) || 0,
    b: parseInt(normalized.slice(4, 6), 16) || 0,
  };
}

/**
 * Convert a hex color + opacity to an rgba() CSS string.
 * @param {string} hex     - Hex color (#RGB or #RRGGBB)
 * @param {number} opacity - Alpha value (0-1, clamped automatically)
 * @returns {string}       - e.g. "rgba(255, 128, 0, 0.8)"
 */
export function hexToRgba(hex, opacity) {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${clamp(opacity, 0, 1)})`;
}

/**
 * Create a debounced version of a function.
 * @param {Function} fn  - Function to debounce
 * @param {number}   ms  - Delay in milliseconds
 * @returns {Function}   - Debounced wrapper
 */
export function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}
