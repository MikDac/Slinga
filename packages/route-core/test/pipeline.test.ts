import { describe, expect, it } from 'vitest';
import { rankCandidates } from '../src/pipeline.js';
import type { RoutePreferences } from '../src/types.js';
import { candidateFrom, outAndBack, squareLoop } from './helpers.js';

const prefs = (overrides: Partial<RoutePreferences> = {}): RoutePreferences => ({
  routeType: 'loop',
  distanceM: 8000,
  ...overrides,
});

describe('rankCandidates', () => {
  it('ranks the candidate closest to target first and flags validity', () => {
    const result = rankCandidates(
      [
        candidateFrom('near', squareLoop(2000)), // ~8 km
        candidateFrom('far', squareLoop(1600, 12_000)), // ~6.4 km, distinct area
      ],
      prefs(),
    );
    expect(result.hasValidCandidate).toBe(true);
    expect(result.candidates[0]!.id).toBe('near');
    expect(result.candidates[0]!.withinTolerance).toBe(true);
  });

  it('drops candidates outside the ±20% keep window', () => {
    const result = rankCandidates(
      [
        candidateFrom('good', squareLoop(2000)),
        candidateFrom('way-off', squareLoop(4000, 25_000)), // ~16 km
      ],
      prefs(),
    );
    expect(result.candidates.map((c) => c.id)).toEqual(['good']);
  });

  it('deduplicates near-identical candidates', () => {
    const loop = squareLoop(2000);
    const result = rankCandidates(
      [
        candidateFrom('a', loop),
        candidateFrom('b', [...loop]), // identical geometry, different seed/id
        candidateFrom('c', squareLoop(2000, 12_000)),
      ],
      prefs(),
    );
    expect(result.candidates).toHaveLength(2);
    expect(new Set(result.candidates.map((c) => c.id)).size).toBe(2);
  });

  it('honestly relabels a mostly-doubled "loop" as out-and-back', () => {
    const result = rankCandidates([candidateFrom('doubled', outAndBack(8000))], prefs());
    expect(result.candidates[0]!.routeType).toBe('out_and_back');
  });

  it('ranks a valid loop above a valid out-and-back when loops are requested', () => {
    const result = rankCandidates(
      [candidateFrom('oab', outAndBack(8000)), candidateFrom('loop', squareLoop(2000, 12_000))],
      prefs(),
    );
    expect(result.candidates[0]!.id).toBe('loop');
  });

  it('filters to out-and-backs when explicitly requested', () => {
    const result = rankCandidates(
      [candidateFrom('loop', squareLoop(2000)), candidateFrom('oab', outAndBack(8000, 90))],
      prefs({ routeType: 'out_and_back' }),
    );
    expect(result.candidates.map((c) => c.id)).toEqual(['oab']);
  });

  it('reports nearest misses instead of failing silently', () => {
    const result = rankCandidates(
      [
        candidateFrom('short', squareLoop(1500)), // ~6 km vs 8 km target — outside ±10%
        candidateFrom('shorter', squareLoop(1000, 12_000)), // ~4 km
      ],
      prefs(),
    );
    expect(result.hasValidCandidate).toBe(false);
    expect(result.nearestMisses[0]!.id).toBe('short');
  });

  it('prefers a matching surface composition in ranking', () => {
    // Same geometry class, both valid; only surface differs.
    const paved = candidateFrom('paved', squareLoop(2000), {
      surfaceBreakdown: { asphalt: 8000 },
    });
    const gravel = candidateFrom('gravel', squareLoop(2000, 12_000), {
      surfaceBreakdown: { gravel: 8000 },
    });
    const result = rankCandidates([gravel, paved], prefs({ soft: { surface: 'paved' } }));
    expect(result.candidates[0]!.id).toBe('paved');
  });

  it('ignores degenerate candidates', () => {
    const result = rankCandidates(
      [candidateFrom('empty', []), candidateFrom('good', squareLoop(2000))],
      prefs(),
    );
    expect(result.candidates.map((c) => c.id)).toEqual(['good']);
  });

  it('returns at most maxResults candidates', () => {
    const candidates = Array.from({ length: 10 }, (_, i) =>
      candidateFrom(`c${i}`, squareLoop(2000, i * 12_000)),
    );
    const result = rankCandidates(candidates, prefs());
    expect(result.candidates.length).toBeLessThanOrEqual(5);
  });
});
