import type { LonLat, RouteCandidate, RoutePreferences } from '@slinga/route-core';
import { MISSING_SURFACE_KEY, pathLengthM } from '@slinga/route-core';
import type { RoundTripParams, RoutingEngine } from './types.js';

/**
 * Self-hosted GraphHopper client (PLANNING.md §2.2, §4.2).
 * Uses the flexible-mode POST /route endpoint with algorithm=round_trip and a
 * per-request custom_model compiled from the user's hard/soft filters.
 */

interface GraphHopperPath {
  distance: number;
  ascend?: number;
  descend?: number;
  points: { coordinates: LonLat[] };
  instructions?: unknown[];
  details?: {
    surface?: [number, number, string | null][];
  };
}

interface GraphHopperRouteResponse {
  paths?: GraphHopperPath[];
}

export interface GraphHopperEngineOptions {
  profile?: string;
  /**
   * Whether the engine's graph was built with elevation. Off for the Phase 0
   * spike (SRTM gap above 60°N; elevation arrives via terrain tiles in Phase 1).
   */
  elevation?: boolean;
}

export class GraphHopperEngine implements RoutingEngine {
  readonly kind = 'graphhopper';
  readonly profile: string;
  private readonly elevation: boolean;

  constructor(
    private readonly baseUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
    options: GraphHopperEngineOptions = {},
  ) {
    this.profile = options.profile ?? 'foot';
    this.elevation = options.elevation ?? false;
  }

  async roundTrip(params: RoundTripParams): Promise<RouteCandidate | null> {
    const body = {
      profile: this.profile,
      points: [[params.startLon, params.startLat]],
      algorithm: 'round_trip',
      'round_trip.distance': Math.round(params.requestedDistanceM),
      'round_trip.seed': params.seed,
      heading: [Math.round(params.headingDeg)],
      'ch.disable': true,
      elevation: this.elevation,
      instructions: true,
      points_encoded: false,
      details: ['surface'],
      custom_model: buildCustomModel(params.preferences),
    };

    const res = await this.fetchImpl(`${this.baseUrl}/route`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      // 400s from GraphHopper are usually snap/connectivity failures for this seed —
      // one dead candidate, not a request-level error.
      return null;
    }
    const json = (await res.json()) as GraphHopperRouteResponse;
    const path = json.paths?.[0];
    if (!path || !path.points?.coordinates?.length) return null;

    return {
      id: `gh-${params.seed}-${Math.round(params.headingDeg)}`,
      source: 'round_trip',
      coordinates: path.points.coordinates,
      distanceM: path.distance,
      ascendM: path.ascend,
      descendM: path.descend,
      turnCount: path.instructions?.length,
      surfaceBreakdown: surfaceBreakdownFromDetails(path),
    };
  }

  async isReachable(): Promise<boolean> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/health`, { method: 'GET' });
      return res.ok;
    } catch {
      return false;
    }
  }
}

/**
 * Compile the declarative filter object into a GraphHopper custom model (PLANNING.md §4.2):
 * hard avoids → priority×0; soft preferences → priority multipliers <1.
 * Kept to a handful of canonical shapes so query-time cost and cache keys stay tractable.
 */
export function buildCustomModel(prefs: RoutePreferences): { priority: object[] } {
  const priority: { if: string; multiply_by: number }[] = [
    // Hard avoids — always on (conservative defaults, PLANNING.md §7 R3).
    { if: 'road_class == MOTORWAY', multiply_by: 0 },
    { if: 'road_class == TRUNK', multiply_by: 0 },
    { if: 'road_environment == FERRY', multiply_by: 0 },
  ];

  if (prefs.soft?.avoidSteps) {
    priority.push({ if: 'road_class == STEPS', multiply_by: 0.3 });
  }
  if (prefs.soft?.surface === 'paved') {
    priority.push({
      if: 'surface == GRAVEL || surface == DIRT || surface == SAND',
      multiply_by: 0.6,
    });
    priority.push({ if: 'surface == GRASS || surface == GROUND', multiply_by: 0.6 });
  }
  if (prefs.soft?.surface === 'unpaved') {
    priority.push({ if: 'surface == ASPHALT || surface == CONCRETE', multiply_by: 0.8 });
  }

  return { priority };
}

/** Aggregate per-segment surface details into meters-per-surface-value. */
export function surfaceBreakdownFromDetails(
  path: GraphHopperPath,
): Record<string, number> | undefined {
  const segments = path.details?.surface;
  if (!segments) return undefined;
  const coords = path.points.coordinates;
  const breakdown: Record<string, number> = {};
  for (const [from, to, value] of segments) {
    const slice = coords.slice(from, to + 1);
    if (slice.length < 2) continue;
    const key =
      value === null || value === 'missing' || value === 'other' ? MISSING_SURFACE_KEY : value;
    breakdown[key] = (breakdown[key] ?? 0) + pathLengthM(slice);
  }
  return breakdown;
}
