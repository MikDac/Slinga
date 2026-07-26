import type {
  RankingResult,
  RouteCandidate,
  RoutePreferences,
  ScoredCandidate,
} from '@slinga/route-core';
import { DEFAULT_TOLERANCE, ScaleFactorTable, rankCandidates } from '@slinga/route-core';
import type { OutAndBackParams, RoundTripParams, RoutingEngine } from './engine/types.js';

/**
 * Candidate generation fan-out (PLANNING.md §3.3 steps 1 and 4).
 *
 * Fires N parallel round-trip calls across seeds and compass headings at a
 * scale-corrected distance parameter, feeds realized/requested ratios back into
 * the learned per-area scale table, ranks via route-core, and runs one
 * refine-on-miss round when nothing lands within tolerance.
 */

/** Outcome of a single engine round-trip call, for failure-taxonomy reporting. */
export type EngineCallOutcome = 'ok' | 'null' | 'error';

export interface GenerateOptions {
  fanout: number;
  /** Seed offset so "shuffle" produces genuinely new candidates. */
  seedBase?: number;
  refineOnMiss?: boolean;
  /** Observe every engine call's outcome (harness failure taxonomy). */
  onEngineResult?: (outcome: EngineCallOutcome) => void;
}

export class RouteGenerator {
  /** Scale-table namespace: corrections learned per engine kind + profile (never cross-polluted). */
  private readonly scaleNamespace: string;

  constructor(
    private readonly engine: RoutingEngine,
    private readonly scaleTable: ScaleFactorTable = new ScaleFactorTable(),
  ) {
    this.scaleNamespace = `${engine.kind}:${engine.profile}`;
  }

  async generate(
    startLon: number,
    startLat: number,
    prefs: RoutePreferences,
    options: GenerateOptions,
  ): Promise<RankingResult> {
    const { fanout, seedBase = 0, refineOnMiss = true } = options;
    const target = prefs.distanceM;

    const requests: RoundTripParams[] = Array.from({ length: fanout }, (_, i) => ({
      startLon,
      startLat,
      requestedDistanceM: this.correctedRequest(startLat, startLon, target),
      seed: seedBase + i,
      headingDeg: (360 / fanout) * i,
      preferences: prefs,
    }));

    const loopRequests = prefs.routeType === 'out_and_back' ? [] : requests;
    const candidates = await this.fanOut(loopRequests, startLat, startLon, options);

    // Out-and-back candidates (isochrone method, §3.2c): first-class when requested,
    // and generated up-front for "either" so ranking can compare topologies.
    if (prefs.routeType !== 'loop') {
      candidates.push(...(await this.outAndBackFanOut(startLon, startLat, prefs, options)));
    }

    let result = rankCandidates(candidates, prefs);

    // Honest fallback (§6.3): loops requested but none valid → offer accurate
    // out-and-backs, ranked below any loop by the pipeline and labeled honestly.
    if (prefs.routeType === 'loop' && !result.hasValidCandidate && this.engine.outAndBack) {
      candidates.push(...(await this.outAndBackFanOut(startLon, startLat, prefs, options)));
      result = rankCandidates(candidates, prefs);
    }

    if (!result.hasValidCandidate && refineOnMiss && result.nearestMisses.length > 0) {
      // One adjustment round (PLANNING.md §3.3 step 4): the first round's
      // realized/requested observations are already folded into the scale table,
      // so a fresh correctedRequest() now carries the measured error. Re-issue
      // toward the near misses' headings at the corrected distance.
      const refinements = result.nearestMisses
        .slice(0, 3)
        .map((miss: ScoredCandidate, i: number): RoundTripParams => ({
          startLon,
          startLat,
          requestedDistanceM: this.correctedRequest(startLat, startLon, target),
          seed: seedBase + fanout + i,
          headingDeg: bearingOfCandidate(miss, startLon, startLat),
          preferences: prefs,
        }));
      const refined = await this.fanOut(refinements, startLat, startLon, options);
      result = rankCandidates([...candidates, ...refined], prefs);
    }

    return result;
  }

  tolerance(prefs: RoutePreferences): number {
    return prefs.tolerance ?? DEFAULT_TOLERANCE;
  }

  private correctedRequest(lat: number, lon: number, targetM: number): number {
    return this.scaleTable.correctedRequest(this.scaleNamespace, lat, lon, targetM);
  }

  /**
   * Fan out K out-and-back requests across headings. Realized/requested ratios are
   * NOT fed into the scale table: isochrone construction is accurate by design and
   * its error model differs from round_trip's.
   */
  private async outAndBackFanOut(
    startLon: number,
    startLat: number,
    prefs: RoutePreferences,
    options: GenerateOptions,
  ): Promise<RouteCandidate[]> {
    const oab = this.engine.outAndBack?.bind(this.engine);
    if (!oab) return [];
    const k = Math.max(3, Math.floor(options.fanout / 3));
    const seedBase = (options.seedBase ?? 0) + 500;
    const requests: OutAndBackParams[] = Array.from({ length: k }, (_, i) => ({
      startLon,
      startLat,
      targetDistanceM: prefs.distanceM,
      seed: seedBase + i,
      headingDeg: (360 / k) * i + 15,
      preferences: prefs,
    }));
    const settled = await Promise.allSettled(requests.map((r) => oab(r)));
    const candidates: RouteCandidate[] = [];
    for (const outcome of settled) {
      if (outcome.status !== 'fulfilled') {
        options.onEngineResult?.('error');
      } else if (outcome.value === null) {
        options.onEngineResult?.('null');
      } else {
        options.onEngineResult?.('ok');
        candidates.push(outcome.value);
      }
    }
    return candidates;
  }

  private async fanOut(
    requests: RoundTripParams[],
    startLat: number,
    startLon: number,
    options: GenerateOptions,
  ) {
    const settled = await Promise.allSettled(requests.map((r) => this.engine.roundTrip(r)));
    const candidates = [];
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i]!;
      if (outcome.status !== 'fulfilled') {
        options.onEngineResult?.('error');
        continue;
      }
      if (outcome.value === null) {
        options.onEngineResult?.('null');
        continue;
      }
      options.onEngineResult?.('ok');
      const candidate = outcome.value;
      this.scaleTable.observe(
        this.scaleNamespace,
        startLat,
        startLon,
        requests[i]!.requestedDistanceM,
        candidate.distanceM,
      );
      candidates.push(candidate);
    }
    return candidates;
  }
}

/** Rough compass bearing from start to the candidate's midpoint (reuse the miss's direction). */
function bearingOfCandidate(
  candidate: ScoredCandidate,
  startLon: number,
  startLat: number,
): number {
  const mid = candidate.coordinates[Math.floor(candidate.coordinates.length / 2)];
  if (!mid) return 0;
  const dLon = ((mid[0] - startLon) * Math.PI) / 180;
  const lat1 = (startLat * Math.PI) / 180;
  const lat2 = (mid[1] * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}
