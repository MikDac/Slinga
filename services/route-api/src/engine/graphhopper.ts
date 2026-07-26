import type { LonLat, RouteCandidate, RoutePreferences } from '@slinga/route-core';
import {
  MISSING_SURFACE_KEY,
  destinationPoint,
  pathLengthM,
  trimPolyline,
} from '@slinga/route-core';
import type { OutAndBackParams, RoundTripParams, RoutingEngine } from './types.js';

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

  /**
   * Isochrone out-and-back (PLANNING.md §3.2c): one distance-isochrone around the
   * start (cached per start/distance), route toward the contour point nearest the
   * requested heading, then TRIM the out-leg at exactly target/2 and walk it back —
   * distance accuracy by construction even where sea/sparse network truncates the
   * contour (measured −22–27% without the trim on a waterfront fixture). Falls back
   * to a beeline target when the isochrone endpoint fails.
   */
  async outAndBack(params: OutAndBackParams): Promise<RouteCandidate | null> {
    const halfM = Math.round(params.targetDistanceM / 2);
    // Overshoot so the routed leg is (usually) longer than half and can be trimmed.
    const reachM = Math.round(halfM * 1.25);
    const target =
      (await this.contourPointToward(params, reachM)) ??
      // Beeline at half: network detour (~1.2–1.4×) makes the leg overshoot too.
      destinationPoint([params.startLon, params.startLat], params.headingDeg, halfM);

    const body = {
      profile: this.profile,
      points: [
        [params.startLon, params.startLat],
        [target[0], target[1]],
      ],
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
    if (!res.ok) return null;
    const json = (await res.json()) as GraphHopperRouteResponse;
    const path = json.paths?.[0];
    if (!path || !path.points?.coordinates?.length) return null;

    const out = trimPolyline(path.points.coordinates, halfM);
    const back = [...out].reverse().slice(1);
    const outLenM = pathLengthM(out);
    // The trim shortens the leg; scale the leg-level annotations proportionally.
    const scale = path.distance > 0 ? outLenM / path.distance : 1;
    const outSurfaces = surfaceBreakdownFromDetails(path);
    return {
      id: `gh-oab-${params.seed}-${Math.round(params.headingDeg)}`,
      source: 'isochrone_oab',
      coordinates: [...out, ...back],
      distanceM: outLenM * 2,
      ascendM: path.ascend !== undefined ? (path.ascend + (path.descend ?? 0)) * scale : undefined,
      descendM:
        path.descend !== undefined ? (path.descend + (path.ascend ?? 0)) * scale : undefined,
      turnCount:
        path.instructions !== undefined
          ? Math.round(path.instructions.length * 2 * scale)
          : undefined,
      surfaceBreakdown: outSurfaces
        ? Object.fromEntries(Object.entries(outSurfaces).map(([k, v]) => [k, v * 2 * scale]))
        : undefined,
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

  /**
   * Contour point toward the requested heading. Within a widening sector around the
   * heading, prefer the FARTHEST vertex (the true reachability frontier): the contour
   * also traces coastlines and dead ends at short range, and picking merely the
   * best-aligned vertex lands on those (measured −22–27% undershoot on a waterfront
   * fixture). Overshooting is fine — the caller trims the leg to the exact half.
   */
  private async contourPointToward(
    params: OutAndBackParams,
    distanceM: number,
  ): Promise<LonLat | null> {
    const ring = await this.isochroneRing(params.startLat, params.startLon, distanceM);
    if (!ring || ring.length === 0) return null;
    for (const sectorDeg of [45, 90, 180]) {
      let best: LonLat | null = null;
      let bestBeeline = -1;
      for (const p of ring) {
        const bearing = bearingDeg(params.startLon, params.startLat, p[0], p[1]);
        const delta = Math.abs(((bearing - params.headingDeg + 540) % 360) - 180);
        if (delta > sectorDeg) continue;
        const beeline = pathLengthM([[params.startLon, params.startLat], p]);
        if (beeline > bestBeeline) {
          bestBeeline = beeline;
          best = p;
        }
      }
      if (best) return best;
    }
    return null;
  }

  // One isochrone per (start-cell, distance) serves all headings of a fan-out.
  private readonly isochroneCache = new Map<string, LonLat[] | null>();

  private async isochroneRing(
    lat: number,
    lon: number,
    distanceM: number,
  ): Promise<LonLat[] | null> {
    const key = `${lat.toFixed(4)},${lon.toFixed(4)},${distanceM}`;
    const cached = this.isochroneCache.get(key);
    if (cached !== undefined) return cached;
    let ring: LonLat[] | null = null;
    try {
      const url =
        `${this.baseUrl}/isochrone?point=${lat},${lon}&profile=${this.profile}` +
        `&distance_limit=${distanceM}&buckets=1`;
      const res = await this.fetchImpl(url, { method: 'GET' });
      if (res.ok) {
        const json = (await res.json()) as {
          polygons?: { geometry: { coordinates: LonLat[][] } }[];
        };
        ring = json.polygons?.[0]?.geometry?.coordinates?.[0] ?? null;
      }
    } catch {
      ring = null;
    }
    if (this.isochroneCache.size > 200) this.isochroneCache.clear();
    this.isochroneCache.set(key, ring);
    return ring;
  }
}

function bearingDeg(fromLon: number, fromLat: number, toLon: number, toLat: number): number {
  const dLon = ((toLon - fromLon) * Math.PI) / 180;
  const lat1 = (fromLat * Math.PI) / 180;
  const lat2 = (toLat * Math.PI) / 180;
  const y = Math.sin(dLon) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
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
