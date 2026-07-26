import { describe, expect, it } from 'vitest';
import { ScaleFactorTable } from '@slinga/route-core';
import { SyntheticEngine } from '../src/engine/synthetic.js';
import { RouteGenerator } from '../src/generation.js';

const MUNICH = { lon: 11.5755, lat: 48.1374 };
const PREFS = { routeType: 'loop' as const, distanceM: 8000 };

describe('RouteGenerator', () => {
  it('finds candidates within tolerance despite per-seed engine error', async () => {
    const generator = new RouteGenerator(new SyntheticEngine({ deviationBand: 0.4 }));
    const result = await generator.generate(MUNICH.lon, MUNICH.lat, PREFS, { fanout: 12 });
    expect(result.hasValidCandidate).toBe(true);
    expect(result.candidates.length).toBeGreaterThanOrEqual(3);
  });

  it('learns the systematic detour factor into the scale table', async () => {
    const table = new ScaleFactorTable();
    // Engine systematically realizes 1.3× the requested distance.
    const generator = new RouteGenerator(
      new SyntheticEngine({ deviationBand: 0, detourFactor: 1.3 }),
      table,
    );
    await generator.generate(MUNICH.lon, MUNICH.lat, PREFS, { fanout: 8 });
    // Learned under the engine's own namespace — and only there.
    expect(table.get('synthetic:foot', MUNICH.lat, MUNICH.lon)).toBeGreaterThan(1.2);
    expect(table.get('graphhopper:foot', MUNICH.lat, MUNICH.lon)).toBe(1);

    // Second request pre-corrects: realized lengths should now bracket the target.
    const result = await generator.generate(MUNICH.lon, MUNICH.lat, PREFS, { fanout: 8 });
    expect(result.hasValidCandidate).toBe(true);
    const best = result.candidates[0]!;
    expect(Math.abs(best.distanceErrorRatio)).toBeLessThanOrEqual(0.1);
  });

  it('recovers via refine-on-miss when the first round misses entirely', async () => {
    // Strong systematic bias with no jitter: every first-round candidate is ~30% long,
    // refine-on-miss must correct using the measured error.
    const generator = new RouteGenerator(
      new SyntheticEngine({ deviationBand: 0, detourFactor: 1.3 }),
    );
    const result = await generator.generate(MUNICH.lon, MUNICH.lat, PREFS, {
      fanout: 4,
      refineOnMiss: true,
    });
    expect(result.hasValidCandidate).toBe(true);
  });

  it('tolerates failing seeds (bad snaps)', async () => {
    const generator = new RouteGenerator(new SyntheticEngine({ failingSeeds: new Set([0, 1, 2]) }));
    const result = await generator.generate(MUNICH.lon, MUNICH.lat, PREFS, { fanout: 12 });
    expect(result.candidates.length).toBeGreaterThan(0);
  });

  it('serves an explicit out-and-back request via the isochrone method within tolerance', async () => {
    const generator = new RouteGenerator(new SyntheticEngine());
    const result = await generator.generate(
      MUNICH.lon,
      MUNICH.lat,
      { routeType: 'out_and_back', distanceM: 8000 },
      { fanout: 8 },
    );
    expect(result.hasValidCandidate).toBe(true);
    const best = result.candidates[0]!;
    expect(best.routeType).toBe('out_and_back');
    expect(best.source).toBe('isochrone_oab');
    expect(Math.abs(best.distanceErrorRatio)).toBeLessThanOrEqual(0.1);
  });

  it('falls back to accurate out-and-backs when no loop can be generated', async () => {
    // Kill every round_trip seed (loop rounds use seeds 0..fanout+refine);
    // out-and-back seeds start at 500 and survive.
    const failingSeeds = new Set(Array.from({ length: 100 }, (_, i) => i));
    const generator = new RouteGenerator(new SyntheticEngine({ failingSeeds }));
    const result = await generator.generate(MUNICH.lon, MUNICH.lat, PREFS, { fanout: 8 });
    expect(result.hasValidCandidate).toBe(true);
    expect(result.candidates.every((c) => c.routeType === 'out_and_back')).toBe(true);
    expect(result.candidates[0]!.source).toBe('isochrone_oab');
  });

  it('mixes both topologies for routeType "either"', async () => {
    const generator = new RouteGenerator(new SyntheticEngine({ deviationBand: 0.2 }));
    const result = await generator.generate(
      MUNICH.lon,
      MUNICH.lat,
      { routeType: 'either', distanceM: 8000 },
      { fanout: 12 },
    );
    const sources = new Set(result.candidates.map((c) => c.source));
    expect(result.hasValidCandidate).toBe(true);
    expect(sources.has('isochrone_oab')).toBe(true);
    expect(sources.has('round_trip')).toBe(true);
  });
});
