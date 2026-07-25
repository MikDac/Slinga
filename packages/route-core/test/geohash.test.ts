import { describe, expect, it } from 'vitest';
import { geohashEncode } from '../src/geohash.js';

describe('geohashEncode', () => {
  it('matches the canonical test vector', () => {
    expect(geohashEncode(57.64911, 10.40744, 11)).toBe('u4pruydqqvj');
  });

  it('respects precision', () => {
    expect(geohashEncode(48.1374, 11.5755, 4)).toHaveLength(4);
    expect(geohashEncode(48.1374, 11.5755, 5)).toHaveLength(5);
  });

  it('puts nearby points in the same coarse cell', () => {
    expect(geohashEncode(48.1374, 11.5755, 4)).toBe(geohashEncode(48.14, 11.58, 4));
  });
});
