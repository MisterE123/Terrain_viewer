/**
 * Noise implementation based on Luanti/Minetest's noise.cpp
 * Replicating the exact behavior of the C++ implementation
 */

// Constants
const NOISE_FLAG_DEFAULTS = 0x01;
const NOISE_FLAG_EASED = 0x02;
const NOISE_FLAG_ABSVALUE = 0x04;

class NoiseGenerator {
  constructor() {
    // Magic constants from the C++ implementation
    this.NOISE_MAGIC_X = 1619;
    this.NOISE_MAGIC_Y = 31337;
    this.NOISE_MAGIC_Z = 52591;
    this.NOISE_MAGIC_SEED = 1013;
  }

  /**
   * Base 2D noise function - exactly as implemented in Luanti
   * Returns a deterministic value in range [-1, 1]
   * 
   * @param {number} x - Integer x coordinate
   * @param {number} y - Integer y coordinate
   * @param {number} seed - Integer seed value
   * @returns {number} - Noise value in range [-1, 1]
   */
  noise2d(x, y, seed) {
    // Convert to integers
    x = Math.floor(x);
    y = Math.floor(y);
    
    // This replicates the exact algorithm from noise.cpp
    let n = (this.NOISE_MAGIC_X * x + this.NOISE_MAGIC_Y * y + this.NOISE_MAGIC_SEED * seed) & 0x7fffffff;
    n = (n >> 13) ^ n;
    n = (n * (n * n * 60493 + 19990303) + 1376312589) & 0x7fffffff;
    return 1.0 - (n / 0x40000000);
  }

  /**
   * Base 3D noise function - exactly as implemented in Luanti
   * Returns a deterministic value in range [-1, 1]
   * 
   * @param {number} x - Integer x coordinate
   * @param {number} y - Integer y coordinate
   * @param {number} z - Integer z coordinate
   * @param {number} seed - Integer seed value
   * @returns {number} - Noise value in range [-1, 1]
   */
  noise3d(x, y, z, seed) {
    // Convert to integers
    x = Math.floor(x);
    y = Math.floor(y);
    z = Math.floor(z);
    
    // This replicates the exact algorithm from noise.cpp
    let n = (this.NOISE_MAGIC_X * x + this.NOISE_MAGIC_Y * y + this.NOISE_MAGIC_Z * z + this.NOISE_MAGIC_SEED * seed) & 0x7fffffff;
    n = (n >> 13) ^ n;
    n = (n * (n * n * 60493 + 19990303) + 1376312589) & 0x7fffffff;
    return 1.0 - (n / 0x40000000);
  }

  /**
   * Linear interpolation function
   * 
   * @param {number} v0 - First value
   * @param {number} v1 - Second value
   * @param {number} t - Interpolation parameter [0, 1]
   * @returns {number} - Interpolated value
   */
  linearInterpolation(v0, v1, t) {
    return v0 + (v1 - v0) * t;
  }

  /**
   * 5th order polynomial easing function
   * 
   * @param {number} t - Value to ease [0, 1]
   * @returns {number} - Eased value
   */
  easeCurve(t) {
    return t * t * t * (t * (6 * t - 15) + 10);
  }

  /**
   * Bilinear interpolation function
   * 
   * @param {number} v00 - Value at (0,0)
   * @param {number} v10 - Value at (1,0)
   * @param {number} v01 - Value at (0,1)
   * @param {number} v11 - Value at (1,1)
   * @param {number} x - X interpolation parameter [0, 1]
   * @param {number} y - Y interpolation parameter [0, 1]
   * @param {boolean} eased - Whether to apply easing function
   * @returns {number} - Interpolated value
   */
  biLinearInterpolation(v00, v10, v01, v11, x, y, eased) {
    if (eased) {
      x = this.easeCurve(x);
      y = this.easeCurve(y);
    }
    const u = this.linearInterpolation(v00, v10, x);
    const v = this.linearInterpolation(v01, v11, x);
    return this.linearInterpolation(u, v, y);
  }

  /**
   * Trilinear interpolation function
   * 
   * @param {number} v000 - Value at (0,0,0)
   * @param {number} v100 - Value at (1,0,0)
   * @param {number} v010 - Value at (0,1,0)
   * @param {number} v110 - Value at (1,1,0)
   * @param {number} v001 - Value at (0,0,1)
   * @param {number} v101 - Value at (1,0,1)
   * @param {number} v011 - Value at (0,1,1)
   * @param {number} v111 - Value at (1,1,1)
   * @param {number} x - X interpolation parameter [0, 1]
   * @param {number} y - Y interpolation parameter [0, 1]
   * @param {number} z - Z interpolation parameter [0, 1]
   * @param {boolean} eased - Whether to apply easing function
   * @returns {number} - Interpolated value
   */
  triLinearInterpolation(v000, v100, v010, v110, v001, v101, v011, v111, x, y, z, eased) {
    if (eased) {
      x = this.easeCurve(x);
      y = this.easeCurve(y);
      z = this.easeCurve(z);
    }
    const u = this.biLinearInterpolation(v000, v100, v010, v110, x, y, false);
    const v = this.biLinearInterpolation(v001, v101, v011, v111, x, y, false);
    return this.linearInterpolation(u, v, z);
  }

  /**
   * 2D gradient noise implementation
   * 
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} seed - Seed value
   * @param {boolean} eased - Whether to use easing on the interpolation
   * @returns {number} - Gradient noise value
   */
  noise2d_gradient(x, y, seed, eased = true) {
    // Calculate the integer coordinates
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    
    // Calculate the fractional part of the coordinates
    const xl = x - x0;
    const yl = y - y0;
    
    // Get values for corners of square
    const v00 = this.noise2d(x0, y0, seed);
    const v10 = this.noise2d(x0 + 1, y0, seed);
    const v01 = this.noise2d(x0, y0 + 1, seed);
    const v11 = this.noise2d(x0 + 1, y0 + 1, seed);
    
    // Interpolate
    return this.biLinearInterpolation(v00, v10, v01, v11, xl, yl, eased);
  }

  /**
   * 3D gradient noise implementation
   * 
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   * @param {number} seed - Seed value
   * @param {boolean} eased - Whether to use easing on the interpolation
   * @returns {number} - Gradient noise value
   */
  noise3d_gradient(x, y, z, seed, eased = false) {
    // Calculate the integer coordinates
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const z0 = Math.floor(z);
    
    // Calculate the fractional part of the coordinates
    const xl = x - x0;
    const yl = y - y0;
    const zl = z - z0;
    
    // Get values for corners of cube
    const v000 = this.noise3d(x0, y0, z0, seed);
    const v100 = this.noise3d(x0 + 1, y0, z0, seed);
    const v010 = this.noise3d(x0, y0 + 1, z0, seed);
    const v110 = this.noise3d(x0 + 1, y0 + 1, z0, seed);
    const v001 = this.noise3d(x0, y0, z0 + 1, seed);
    const v101 = this.noise3d(x0 + 1, y0, z0 + 1, seed);
    const v011 = this.noise3d(x0, y0 + 1, z0 + 1, seed);
    const v111 = this.noise3d(x0 + 1, y0 + 1, z0 + 1, seed);
    
    // Interpolate
    return this.triLinearInterpolation(
      v000, v100, v010, v110,
      v001, v101, v011, v111,
      xl, yl, zl, eased
    );
  }

  /**
   * 2D Perlin noise with octaves
   * 
   * @param {Object} np - Noise parameters
   * @param {number} np.offset - Offset to add to the noise
   * @param {number} np.scale - Scale to multiply the noise by
   * @param {Object} np.spread - Spread values for each dimension
   * @param {number} np.spread.x - X spread
   * @param {number} np.spread.y - Y spread
   * @param {number} np.seed - Seed value to add to the provided seed
   * @param {number} np.octaves - Number of octaves to compute
   * @param {number} np.persist - Persistence value for octaves
   * @param {number} np.lacunarity - Lacunarity value for octaves
   * @param {number} np.flags - Flags controlling noise behavior
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} seed - Seed value
   * @returns {number} - Perlin noise value
   */
  NoisePerlin2D(np, x, y, seed) {
    let a = 0;
    let f = 1.0;
    let g = 1.0;
    
    x /= np.spread.x;
    y /= np.spread.y;
    seed += np.seed;
    
    for (let i = 0; i < np.octaves; i++) {
      let noiseval = this.noise2d_gradient(x * f, y * f, seed + i, 
        (np.flags & (NOISE_FLAG_DEFAULTS | NOISE_FLAG_EASED)) !== 0);
      
      if ((np.flags & NOISE_FLAG_ABSVALUE) !== 0) {
        noiseval = Math.abs(noiseval);
      }
      
      a += g * noiseval;
      f *= np.lacunarity;
      g *= np.persist;
    }
    
    return np.offset + a * np.scale;
  }

  /**
   * 3D Perlin noise with octaves
   * 
   * @param {Object} np - Noise parameters
   * @param {number} np.offset - Offset to add to the noise
   * @param {number} np.scale - Scale to multiply the noise by
   * @param {Object} np.spread - Spread values for each dimension
   * @param {number} np.spread.x - X spread
   * @param {number} np.spread.y - Y spread
   * @param {number} np.spread.z - Z spread
   * @param {number} np.seed - Seed value to add to the provided seed
   * @param {number} np.octaves - Number of octaves to compute
   * @param {number} np.persist - Persistence value for octaves
   * @param {number} np.lacunarity - Lacunarity value for octaves
   * @param {number} np.flags - Flags controlling noise behavior
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   * @param {number} seed - Seed value
   * @returns {number} - Perlin noise value
   */
  NoisePerlin3D(np, x, y, z, seed) {
    let a = 0;
    let f = 1.0;
    let g = 1.0;
    
    x /= np.spread.x;
    y /= np.spread.y;
    z /= np.spread.z;
    seed += np.seed;
    
    for (let i = 0; i < np.octaves; i++) {
      let noiseval = this.noise3d_gradient(x * f, y * f, z * f, seed + i, 
        (np.flags & NOISE_FLAG_EASED) !== 0);
      
      if ((np.flags & NOISE_FLAG_ABSVALUE) !== 0) {
        noiseval = Math.abs(noiseval);
      }
      
      a += g * noiseval;
      f *= np.lacunarity;
      g *= np.persist;
    }
    
    return np.offset + a * np.scale;
  }

  /**
   * Mandelbrot set calculation
   * 
   * @param {number} x - X coordinate
   * @param {number} z - Z coordinate (using z instead of y for consistency with Luamap)
   * @param {number} steps - Maximum number of iterations
   * @returns {number} - Number of iterations until divergence or max steps
   */
  mandelbrot(x, z, steps) {
    let a = 0;
    let b = 0;
    
    for (let i = 0; i <= steps; i++) {
      const old_a = a;
      a = (a * a - b * b) + x;
      b = 2 * old_a * b + z;
      
      if (a * a + b * b > 20) {
        return i;
      }
    }
    
    return steps;
  }
}

// Export constants and class
module.exports = NoiseGenerator;
module.exports.NOISE_FLAG_DEFAULTS = NOISE_FLAG_DEFAULTS;
module.exports.NOISE_FLAG_EASED = NOISE_FLAG_EASED;
module.exports.NOISE_FLAG_ABSVALUE = NOISE_FLAG_ABSVALUE;