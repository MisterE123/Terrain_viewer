/**
 * Utility functions for the Luamap Terrain Prototyper
 */

/**
 * Show a toast notification
 * 
 * @param {string} message - Message to display
 * @param {string} type - Type of toast (info, success, error)
 */
export function showToast(message, type = 'info') {
  // Create toast element if it doesn't exist
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    toast.style.position = 'fixed';
    toast.style.bottom = '20px';
    toast.style.right = '20px';
    toast.style.padding = '10px 20px';
    toast.style.borderRadius = '5px';
    toast.style.color = 'white';
    toast.style.zIndex = '1000';
    toast.style.transition = 'opacity 0.5s';
    document.body.appendChild(toast);
  }
  
  // Set style based on type
  if (type === 'error') {
    toast.style.backgroundColor = '#e74c3c';
  } else if (type === 'success') {
    toast.style.backgroundColor = '#2ecc71';
  } else {
    toast.style.backgroundColor = '#3498db';
  }
  
  // Set content and show
  toast.textContent = message;
  toast.style.opacity = '1';
  
  // Hide after 3 seconds
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 3000);
}

/**
 * Linear interpolation
 * 
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor [0,1]
 * @param {number} power - Power to apply to values
 * @returns {number} - Interpolated value
 */
export function lerp(a, b, t, power = 1) {
  if (t > 1) t = 1;
  if (t < 0) t = 0;
  return (1 - t) * Math.pow(a, power) + (t * Math.pow(b, power));
}

/**
 * Cosine interpolation
 * 
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor [0,1]
 * @returns {number} - Interpolated value
 */
export function coserp(a, b, t) {
  if (t > 1) t = 1;
  if (t < 0) t = 0;
  const f = (1 - Math.cos(t * Math.PI)) / 2;
  return a * (1 - f) + b * f;
}

/**
 * Remap a value from one range to another
 * 
 * @param {number} val - Value to remap
 * @param {number} minVal - Minimum of the input range
 * @param {number} maxVal - Maximum of the input range
 * @param {number} minMap - Minimum of the output range
 * @param {number} maxMap - Maximum of the output range
 * @returns {number} - Remapped value
 */
export function remap(val, minVal, maxVal, minMap, maxMap) {
  if (minVal === maxVal) return minMap; // Avoid division by zero
  return (val - minVal) / (maxVal - minVal) * (maxMap - minMap) + minMap;
}

/**
 * Apply easing curve (5th order polynomial from Luanti)
 * 
 * @param {number} t - Value to ease [0,1]
 * @returns {number} - Eased value
 */
export function easeCurve(t) {
  return t * t * t * (t * (6 * t - 15) + 10);
}