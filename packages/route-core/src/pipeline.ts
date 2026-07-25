import { edgeSetJaccard, repeatedEdgeShare } from './edges.js';
import { DEFAULT_TOLERANCE, DEFAULT_WEIGHTS, KEEP_WINDOW, scoreCandidate } from './score.js';
import type { ScoreWeights } from './score.js';
import { surfaceMatch } from './surfaces.js';
import type {
  AnnotatedCandidate,
  RankingResult,
  RouteCandidate,
  RoutePreferences,
  ScoredCandidate,
} from './types.js';

/**
 * Filter → score → dedupe → rank over raw candidates (PLANNING.md §3.3 steps 2–3).
 * Pure and synchronous: generation (fan-out, engine calls) lives in the route service.
 */

export interface PipelineOptions {
  weights?: ScoreWeights;
  /** Max candidates to return. PLANNING.md §1.2 assumes 3–5. */
  maxResults?: number;
  /** Candidates whose edge-set Jaccard similarity exceeds this are considered duplicates. */
  dedupeJaccardThreshold?: number;
  /** Repeated-edge share above which a "loop" is honestly relabeled as out-and-back (§6.3). */
  outAndBackShareThreshold?: number;
  /** Ranking keep window as ratio of target distance. */
  keepWindow?: number;
}

const DEFAULTS: Required<PipelineOptions> = {
  weights: DEFAULT_WEIGHTS,
  maxResults: 5,
  dedupeJaccardThreshold: 0.6,
  outAndBackShareThreshold: 0.3,
  keepWindow: KEEP_WINDOW,
};

export function annotateCandidate(
  candidate: RouteCandidate,
  prefs: RoutePreferences,
  options: PipelineOptions = {},
): AnnotatedCandidate {
  const opts = { ...DEFAULTS, ...options };
  const repeated = repeatedEdgeShare(candidate.coordinates);
  const { match, unknownShare } = surfaceMatch(candidate.surfaceBreakdown, prefs.soft?.surface);
  const km = candidate.distanceM / 1000;
  return {
    ...candidate,
    routeType: repeated > opts.outAndBackShareThreshold ? 'out_and_back' : 'loop',
    repeatedEdgeShare: repeated,
    softFilterMatch: match,
    unknownSurfaceShare: unknownShare,
    greenery: 0.5, // Phase 2: PostGIS green index; neutral until then
    turnDensityPerKm: km > 0 && candidate.turnCount !== undefined ? candidate.turnCount / km : 0,
  };
}

export function rankCandidates(
  rawCandidates: readonly RouteCandidate[],
  prefs: RoutePreferences,
  options: PipelineOptions = {},
): RankingResult {
  const opts = { ...DEFAULTS, ...options };
  const tolerance = prefs.tolerance ?? DEFAULT_TOLERANCE;
  const target = prefs.distanceM;

  const scored: ScoredCandidate[] = rawCandidates
    .filter((c) => c.coordinates.length >= 2 && c.distanceM > 0)
    .map((c) => {
      const annotated = annotateCandidate(c, prefs, opts);
      const errorRatio = (annotated.distanceM - target) / target;
      return {
        ...annotated,
        score: scoreCandidate(annotated, target, opts.weights),
        distanceErrorRatio: errorRatio,
        withinTolerance: Math.abs(errorRatio) <= tolerance,
      };
    });

  // Honor an explicit topology request; "either" keeps both. When loops are requested,
  // out-and-backs are kept only as fallback (they rank below valid loops via the sort below,
  // and the UI labels them honestly).
  const topologyFiltered =
    prefs.routeType === 'out_and_back'
      ? scored.filter((c) => c.routeType === 'out_and_back')
      : scored;

  const inKeepWindow = topologyFiltered.filter(
    (c) => Math.abs(c.distanceErrorRatio) <= opts.keepWindow,
  );

  const sorted = [...inKeepWindow].sort((a, b) => {
    // Requested-topology candidates first, then valid-before-invalid, then score.
    if (prefs.routeType !== 'either') {
      const aMatches = a.routeType === prefs.routeType ? 1 : 0;
      const bMatches = b.routeType === prefs.routeType ? 1 : 0;
      if (aMatches !== bMatches) return bMatches - aMatches;
    }
    if (a.withinTolerance !== b.withinTolerance) return a.withinTolerance ? -1 : 1;
    return b.score - a.score;
  });

  const deduped: ScoredCandidate[] = [];
  for (const candidate of sorted) {
    const isDuplicate = deduped.some(
      (kept) =>
        edgeSetJaccard(kept.coordinates, candidate.coordinates) > opts.dedupeJaccardThreshold,
    );
    if (!isDuplicate) deduped.push(candidate);
    if (deduped.length >= opts.maxResults) break;
  }

  const hasValidCandidate = deduped.some((c) => c.withinTolerance);

  let nearestMisses: ScoredCandidate[] = [];
  if (!hasValidCandidate) {
    // Look beyond the keep window so "closest we found" is genuinely the closest.
    nearestMisses = [...topologyFiltered]
      .sort((a, b) => Math.abs(a.distanceErrorRatio) - Math.abs(b.distanceErrorRatio))
      .slice(0, 3);
  }

  return { candidates: deduped, hasValidCandidate, nearestMisses };
}
