import { describe, expect, it } from 'vitest';
import { destinationPoint, haversineM, pathLengthM } from '../src/geo.js';
import type { LonLat } from '../src/types.js';

describe('haversineM', () => {
  it('returns 0 for identical points', () => {
    expect(haversineM([11.57, 48.13], [11.57, 48.13])).toBe(0);
  });

  it('matches a known city-pair distance within 1%', () => {
    const paris: LonLat = [2.3522, 48.8566];
    const london: LonLat = [-0.1276, 51.5072];
    const d = haversineM(paris, london);
    expect(d).toBeGreaterThan(340_000);
    expect(d).toBeLessThan(347_000);
  });
});

describe('destinationPoint', () => {
  it('round-trips with haversine distance', () => {
    const start: LonLat = [11.5755, 48.1374];
    const dest = destinationPoint(start, 37, 5000);
    expect(haversineM(start, dest)).toBeCloseTo(5000, -1);
  });
});

describe('pathLengthM', () => {
  it('sums segment lengths', () => {
    const start: LonLat = [11.5755, 48.1374];
    const mid = destinationPoint(start, 0, 1000);
    const end = destinationPoint(mid, 0, 1000);
    expect(pathLengthM([start, mid, end])).toBeCloseTo(2000, -1);
  });

  it('is 0 for fewer than two points', () => {
    expect(pathLengthM([])).toBe(0);
    expect(pathLengthM([[11.57, 48.13]])).toBe(0);
  });
});
