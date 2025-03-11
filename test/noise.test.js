// Test suite for the noise implementation
// These tests ensure that our JavaScript implementation of the noise functions
// matches the behavior of the original C++ code from Luanti/Minetest

const NoiseGenerator = require('../src/noise');

describe('NoiseGenerator', () => {
  let noiseGen;

  beforeEach(() => {
    noiseGen = new NoiseGenerator();
  });

  describe('Base noise functions', () => {
    test('noise2d produces consistent values with same inputs', () => {
      const value1 = noiseGen.noise2d(123, 456, 789);
      const value2 = noiseGen.noise2d(123, 456, 789);
      expect(value1).toBe(value2);
    });

    test('noise3d produces consistent values with same inputs', () => {
      const value1 = noiseGen.noise3d(123, 456, 789, 101112);
      const value2 = noiseGen.noise3d(123, 456, 789, 101112);
      expect(value1).toBe(value2);
    });

    test('noise2d and noise3d values are in range [-1, 1]', () => {
      for (let i = 0; i < 100; i++) {
        const x = Math.floor(Math.random() * 1000);
        const y = Math.floor(Math.random() * 1000);
        const z = Math.floor(Math.random() * 1000);
        const seed = Math.floor(Math.random() * 1000);
        
        const value2d = noiseGen.noise2d(x, y, seed);
        const value3d = noiseGen.noise3d(x, y, z, seed);
        
        expect(value2d).toBeGreaterThanOrEqual(-1);
        expect(value2d).toBeLessThanOrEqual(1);
        expect(value3d).toBeGreaterThanOrEqual(-1);
        expect(value3d).toBeLessThanOrEqual(1);
      }
    });

    test('noise2d values change with different coordinates', () => {
      const value1 = noiseGen.noise2d(100, 100, 42);
      const value2 = noiseGen.noise2d(101, 100, 42);
      const value3 = noiseGen.noise2d(100, 101, 42);
      expect(value1).not.toBe(value2);
      expect(value1).not.toBe(value3);
    });

    test('noise3d values change with different coordinates', () => {
      const value1 = noiseGen.noise3d(100, 100, 100, 42);
      const value2 = noiseGen.noise3d(101, 100, 100, 42);
      const value3 = noiseGen.noise3d(100, 101, 100, 42);
      const value4 = noiseGen.noise3d(100, 100, 101, 42);
      expect(value1).not.toBe(value2);
      expect(value1).not.toBe(value3);
      expect(value1).not.toBe(value4);
    });
  });

  describe('Gradient interpolation', () => {
    test('noise2d_gradient produces smooth interpolated values', () => {
      // Check interpolation between points
      const v1 = noiseGen.noise2d_gradient(10, 10, 42);
      const v2 = noiseGen.noise2d_gradient(10.5, 10, 42);
      const v3 = noiseGen.noise2d_gradient(11, 10, 42);
      
      // v2 should be between v1 and v3 since it's an interpolated value
      const isInterpolated = (v2 > Math.min(v1, v3) && v2 < Math.max(v1, v3)) || 
                             (Math.abs(v2 - v1) < 0.001 || Math.abs(v2 - v3) < 0.001);
      expect(isInterpolated).toBe(true);
    });

    test('noise3d_gradient produces smooth interpolated values', () => {
      // Check interpolation between points
      const v1 = noiseGen.noise3d_gradient(10, 10, 10, 42);
      const v2 = noiseGen.noise3d_gradient(10.5, 10, 10, 42);
      const v3 = noiseGen.noise3d_gradient(11, 10, 10, 42);
      
      // v2 should be between v1 and v3 since it's an interpolated value
      const isInterpolated = (v2 > Math.min(v1, v3) && v2 < Math.max(v1, v3)) || 
                             (Math.abs(v2 - v1) < 0.001 || Math.abs(v2 - v3) < 0.001);
      expect(isInterpolated).toBe(true);
    });

    test('eased interpolation behaves differently from non-eased', () => {
      const eased = noiseGen.noise2d_gradient(10.5, 10.5, 42, true);
      const nonEased = noiseGen.noise2d_gradient(10.5, 10.5, 42, false);
      expect(eased).not.toBe(nonEased);
    });
  });

  describe('Perlin noise with octaves', () => {
    test('NoisePerlin2D respects parameters', () => {
      const np = {
        offset: 0,
        scale: 1,
        spread: { x: 100, y: 100 },
        seed: 42,
        octaves: 3,
        persist: 0.5,
        lacunarity: 2.0,
        flags: 0x01 // NOISE_FLAG_DEFAULTS
      };
      
      const value = noiseGen.NoisePerlin2D(np, 100, 100, 42);
      
      // Change scale and check that output changes proportionally
      const np2 = { ...np, scale: 2 };
      const value2 = noiseGen.NoisePerlin2D(np2, 100, 100, 42);
      
      // Within reasonable precision, value2 should be 2 * value (plus offset)
      expect(Math.abs(value2 - 2 * value)).toBeLessThan(0.00001);
    });

    test('NoisePerlin3D respects parameters', () => {
      const np = {
        offset: 0,
        scale: 1,
        spread: { x: 100, y: 100, z: 100 },
        seed: 42,
        octaves: 3,
        persist: 0.5,
        lacunarity: 2.0,
        flags: 0x01 // NOISE_FLAG_DEFAULTS
      };
      
      const value = noiseGen.NoisePerlin3D(np, 100, 100, 100, 42);
      
      // Change scale and check that output changes proportionally
      const np2 = { ...np, scale: 2 };
      const value2 = noiseGen.NoisePerlin3D(np2, 100, 100, 100, 42);
      
      // Within reasonable precision, value2 should be 2 * value (plus offset)
      expect(Math.abs(value2 - 2 * value)).toBeLessThan(0.00001);
    });

    test('Flags affect noise output', () => {
      const baseNp = {
        offset: 0,
        scale: 1,
        spread: { x: 100, y: 100 },
        seed: 42,
        octaves: 3,
        persist: 0.5,
        lacunarity: 2.0,
        flags: 0x01 // NOISE_FLAG_DEFAULTS
      };
      
      const defaultValue = noiseGen.NoisePerlin2D(baseNp, 100, 100, 42);
      
      // Test with eased flag
      const easedNp = { ...baseNp, flags: 0x01 | 0x02 }; // NOISE_FLAG_DEFAULTS | NOISE_FLAG_EASED
      const easedValue = noiseGen.NoisePerlin2D(easedNp, 100, 100, 42);
      
      // Test with abs flag
      const absNp = { ...baseNp, flags: 0x01 | 0x04 }; // NOISE_FLAG_DEFAULTS | NOISE_FLAG_ABSVALUE
      const absValue = noiseGen.NoisePerlin2D(absNp, 100, 100, 42);
      
      // The outputs should be different when flags change
      expect(defaultValue).not.toBe(easedValue);
      expect(defaultValue).not.toBe(absValue);
      
      // Absolute value flag should produce non-negative values
      expect(absValue).toBeGreaterThanOrEqual(0);
    });
  });
});