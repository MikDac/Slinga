import { describe, expect, it } from 'vitest';
import { surfaceMatch } from '../src/surfaces.js';

describe('surfaceMatch', () => {
  it('is a full match when preference is "any"', () => {
    const { match, unknownShare } = surfaceMatch({ asphalt: 3000, gravel: 1000 }, 'any');
    expect(match).toBe(1);
    expect(unknownShare).toBe(0);
  });

  it('measures paved share against known length only', () => {
    const { match, unknownShare } = surfaceMatch(
      { asphalt: 3000, gravel: 1000, missing: 4000 },
      'paved',
    );
    expect(match).toBeCloseTo(0.75, 5); // 3000 of 4000 known meters are paved
    expect(unknownShare).toBeCloseTo(0.5, 5); // 4000 of 8000 total meters untagged
  });

  it('supports unpaved preference', () => {
    const { match } = surfaceMatch({ asphalt: 1000, dirt: 3000 }, 'unpaved');
    expect(match).toBeCloseTo(0.75, 5);
  });

  it('stays neutral when nothing is known', () => {
    const { match, unknownShare } = surfaceMatch({ missing: 5000 }, 'paved');
    expect(match).toBe(0.5);
    expect(unknownShare).toBe(1);
  });

  it('handles absent breakdown', () => {
    expect(surfaceMatch(undefined, 'paved')).toEqual({ match: 0.5, unknownShare: 1 });
    expect(surfaceMatch(undefined, 'any')).toEqual({ match: 1, unknownShare: 1 });
  });
});
