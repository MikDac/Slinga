import type { LonLat, RouteCandidate } from '@slinga/route-core';
import { destinationPoint, pathLengthM } from '@slinga/route-core';
import type { OutAndBackParams, RoundTripParams, RoutingEngine } from './types.js';

/**
 * Deterministic synthetic engine for tests and engine-less local dev.
 *
 * Mimics the round_trip failure mode that motivates the whole pipeline
 * (PLANNING.md §3.2a, R1): realized length deviates from the requested distance
 * by a per-seed factor within a configurable band, so the fan-out + filter +
 * scale-learning layers have something real to correct.
 */

export interface SyntheticEngineOptions {
  /** Realized/requested deviation band; e.g. 0.3 → factors in [0.85, 1.15+detour). */
  deviationBand?: number;
  /** Systematic network detour factor applied on top of per-seed jitter. */
  detourFactor?: number;
  /** Seeds for which the engine "fails to snap" (returns null). */
  failingSeeds?: Set<number>;
}

export class SyntheticEngine implements RoutingEngine {
  readonly kind = 'synthetic';
  readonly profile = 'foot';
  private readonly deviationBand: number;
  private readonly detourFactor: number;
  private readonly failingSeeds: Set<number>;

  constructor(options: SyntheticEngineOptions = {}) {
    this.deviationBand = options.deviationBand ?? 0.3;
    this.detourFactor = options.detourFactor ?? 1.0;
    this.failingSeeds = options.failingSeeds ?? new Set();
  }

  async roundTrip(params: RoundTripParams): Promise<RouteCandidate | null> {
    if (this.failingSeeds.has(params.seed)) return null;

    const rng = mulberry32(params.seed + 1);
    // Per-seed multiplicative error, symmetric around the systematic detour factor.
    const jitter = 1 + (rng() - 0.5) * this.deviationBand;
    const realizedTarget = params.requestedDistanceM * this.detourFactor * jitter;

    // A circular loop of circumference realizedTarget, offset toward the heading
    // so different headings produce geometrically distinct candidates.
    const radius = realizedTarget / (2 * Math.PI);
    const center = destinationPoint([params.startLon, params.startLat], params.headingDeg, radius);
    const steps = 36;
    const coordinates: LonLat[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (360 * i) / steps + params.headingDeg + 180;
      coordinates.push(destinationPoint(center, angle % 360, radius));
    }

    const distanceM = pathLengthM(coordinates);
    return {
      id: `syn-${params.seed}-${Math.round(params.headingDeg)}`,
      source: 'round_trip',
      coordinates,
      distanceM,
      ascendM: Math.round(distanceM * 0.01),
      descendM: Math.round(distanceM * 0.01),
      turnCount: Math.round(distanceM / 400),
      surfaceBreakdown: {
        asphalt: distanceM * 0.6,
        gravel: distanceM * 0.25,
        missing: distanceM * 0.15,
      },
    };
  }

  /**
   * Synthetic isochrone out-and-back: accurate by construction (like the real
   * isochrone method), with only mild per-seed jitter — so tests can rely on it
   * as the guaranteed-accuracy fallback the plan describes (§3.2c, §6.3).
   */
  async outAndBack(params: OutAndBackParams): Promise<RouteCandidate | null> {
    if (this.failingSeeds.has(params.seed)) return null;
    const rng = mulberry32(params.seed + 101);
    const jitter = 1 + (rng() - 0.5) * 0.06; // ±3% — isochrone-grade accuracy
    const halfM = (params.targetDistanceM / 2) * jitter;

    const points = 24;
    const out: LonLat[] = [];
    for (let i = 0; i <= points; i++) {
      out.push(
        destinationPoint(
          [params.startLon, params.startLat],
          params.headingDeg,
          (halfM * i) / points,
        ),
      );
    }
    const coordinates: LonLat[] = [...out, ...[...out].reverse().slice(1)];
    const distanceM = pathLengthM(coordinates);
    return {
      id: `syn-oab-${params.seed}-${Math.round(params.headingDeg)}`,
      source: 'isochrone_oab',
      coordinates,
      distanceM,
      ascendM: Math.round(distanceM * 0.008),
      descendM: Math.round(distanceM * 0.008),
      turnCount: Math.round(distanceM / 500),
      surfaceBreakdown: {
        asphalt: distanceM * 0.7,
        gravel: distanceM * 0.2,
        missing: distanceM * 0.1,
      },
    };
  }

  async isReachable(): Promise<boolean> {
    return true;
  }
}

/** Small deterministic PRNG so tests are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
