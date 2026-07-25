import type { AnnotatedCandidate } from './types.js';

/**
 * Scoring layer (PLANNING.md §3.3 step 3, §3.4).
 * A pure function over per-candidate annotations — tunable without touching generation.
 */

export interface ScoreWeights {
  distanceCloseness: number;
  loopQuality: number; // penalizes repeated-edge share
  softFilterMatch: number;
  greenery: number;
  turnDensity: number;
  elevationPreference: number;
}

/** Initial weights per PLANNING.md §3.4 [ASSUMED]; tuned in Phase 2. */
export const DEFAULT_WEIGHTS: ScoreWeights = {
  distanceCloseness: 0.4,
  loopQuality: 0.2,
  softFilterMatch: 0.15,
  greenery: 0.15,
  turnDensity: 0.05,
  elevationPreference: 0.05,
};

/** Validity gate: a candidate is "acceptable" within ±10% of target (PLANNING.md §1.2, open question 3). */
export const DEFAULT_TOLERANCE = 0.1;

/** Keep window: candidates within ±20% are retained for ranking context (PLANNING.md §3.3 step 2). */
export const KEEP_WINDOW = 0.2;

/** Above this turns-per-km the turn-density component bottoms out. */
const TURN_DENSITY_CEILING = 15;

/** Repeated-edge share at which loop quality bottoms out (0.5 = pure out-and-back). */
const REPEATED_SHARE_CEILING = 0.5;

export function scoreCandidate(
  candidate: AnnotatedCandidate,
  targetM: number,
  weights: ScoreWeights = DEFAULT_WEIGHTS,
): number {
  const errorRatio = Math.abs(candidate.distanceM - targetM) / targetM;
  const distanceCloseness = clamp01(1 - errorRatio / KEEP_WINDOW);

  // An honest out-and-back is not penalized for its by-construction doubling;
  // its repeated share beyond the inherent 0.5 would show up in classification instead.
  const loopQuality =
    candidate.routeType === 'out_and_back'
      ? 1
      : clamp01(1 - candidate.repeatedEdgeShare / REPEATED_SHARE_CEILING);

  const turnScore = clamp01(1 - candidate.turnDensityPerKm / TURN_DENSITY_CEILING);

  // Elevation preference is a Phase 2 filter; neutral until then.
  const elevationScore = 0.5;

  return (
    weights.distanceCloseness * distanceCloseness +
    weights.loopQuality * loopQuality +
    weights.softFilterMatch * candidate.softFilterMatch +
    weights.greenery * candidate.greenery +
    weights.turnDensity * turnScore +
    weights.elevationPreference * elevationScore
  );
}

export function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}
