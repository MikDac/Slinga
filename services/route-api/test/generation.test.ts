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
    expect(table.get(MUNICH.lat, MUNICH.lon)).toBeGreaterThan(1.2);

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
});
