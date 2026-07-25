/**
 * Wire types for the Slinga route API. Kept dependency-free (no route-core import)
 * so web/native clients can consume this package without pulling in the algorithm lib.
 */

export type RouteTypePreference = 'loop' | 'out_and_back' | 'either';
export type RealizedRouteType = 'loop' | 'out_and_back';
export type SurfacePreference = 'paved' | 'unpaved' | 'any';

export interface GenerateRoutesRequest {
  start: {
    /** Longitude in degrees (GeoJSON order in coordinates arrays). */
    lon: number;
    lat: number;
  };
  distanceM: number;
  routeType?: RouteTypePreference;
  soft?: {
    surface?: SurfacePreference;
    avoidSteps?: boolean;
  };
  /** Bypass the response cache and force fresh seeds ("shuffle"). */
  fresh?: boolean;
}

export interface CandidateDto {
  id: string;
  routeType: RealizedRouteType;
  /** GeoJSON LineString coordinates: [lon, lat] or [lon, lat, ele]. */
  coordinates: number[][];
  distanceM: number;
  distanceErrorRatio: number;
  withinTolerance: boolean;
  score: number;
  repeatedEdgeShare: number;
  unknownSurfaceShare: number;
  surfaceBreakdown?: Record<string, number>;
  ascendM?: number;
  descendM?: number;
  /** Relative URL for the GPX export of this candidate. */
  gpxPath: string;
}

export interface GenerateRoutesResponse {
  target: {
    distanceM: number;
    tolerance: number;
  };
  hasValidCandidate: boolean;
  candidates: CandidateDto[];
  /** Present (and non-empty) only when hasValidCandidate is false. */
  nearestMisses: CandidateDto[];
  /** True when served from the response cache. */
  cached: boolean;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  engine: {
    reachable: boolean;
    kind: string;
  };
  uptimeS: number;
  version: string;
}

export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
}
