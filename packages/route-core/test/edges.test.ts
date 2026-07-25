import { describe, expect, it } from 'vitest';
import { edgeSetJaccard, repeatedEdgeShare } from '../src/edges.js';
import { outAndBack, squareLoop } from './helpers.js';

describe('repeatedEdgeShare', () => {
  it('is 0 for a clean loop', () => {
    expect(repeatedEdgeShare(squareLoop(2000))).toBe(0);
  });

  it('is ~0.5 for a pure out-and-back', () => {
    const share = repeatedEdgeShare(outAndBack(8000));
    expect(share).toBeGreaterThan(0.45);
    expect(share).toBeLessThanOrEqual(0.5 + 1e-9);
  });

  it('is 0 for degenerate inputs', () => {
    expect(repeatedEdgeShare([])).toBe(0);
    expect(repeatedEdgeShare([[11.57, 48.13]])).toBe(0);
  });
});

describe('edgeSetJaccard', () => {
  it('is 1 for identical routes', () => {
    const loop = squareLoop(2000);
    expect(edgeSetJaccard(loop, loop)).toBe(1);
  });

  it('is 0 for disjoint routes', () => {
    expect(edgeSetJaccard(squareLoop(2000), squareLoop(2000, 10_000))).toBe(0);
  });

  it('is between 0 and 1 for partially overlapping routes', () => {
    const a = outAndBack(8000, 0);
    // Same first half, different second half direction.
    const b = outAndBack(8000, 0).slice(0, 21).concat(outAndBack(8000, 90).slice(0, 21));
    const j = edgeSetJaccard(a, b);
    expect(j).toBeGreaterThan(0);
    expect(j).toBeLessThan(1);
  });
});
