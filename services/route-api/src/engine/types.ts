import type { RouteCandidate, RoutePreferences } from '@slinga/route-core';

export interface RoundTripParams {
  startLon: number;
  startLat: number;
  /** Engine-facing distance parameter (already scale-corrected by the caller). */
  requestedDistanceM: number;
  seed: number;
  /** Initial heading in degrees to diversify candidates across the compass. */
  headingDeg: number;
  preferences: RoutePreferences;
}

/**
 * Thin abstraction over the routing engine so GraphHopper can be swapped
 * (Valhalla, BRouter) or faked in tests without touching the pipeline (PLANNING.md §5.1).
 */
export interface RoutingEngine {
  readonly kind: string;
  /** Routing profile the engine queries with (e.g. "foot", "hike"). */
  readonly profile: string;
  /** One round-trip candidate; null when the engine cannot produce a route (bad snap etc.). */
  roundTrip(params: RoundTripParams): Promise<RouteCandidate | null>;
  /** Cheap reachability check for /health. */
  isReachable(): Promise<boolean>;
}
