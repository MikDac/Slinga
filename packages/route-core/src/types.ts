/**
 * Shared domain types for the route generation pipeline (PLANNING.md §3.3, §4.1).
 */

/** [longitude, latitude] — GeoJSON axis order. Optional third element is elevation in meters. */
export type LonLat = [number, number] | [number, number, number];

export type RouteTypePreference = 'loop' | 'out_and_back' | 'either';
export type RealizedRouteType = 'loop' | 'out_and_back';
export type SurfacePreference = 'paved' | 'unpaved' | 'any';

/** Hard constraints — never violated (compiled to priority×0 in the engine custom model). */
export interface HardFilters {
  /** Way categories to exclude entirely, e.g. "motorway", "trunk", "ferries". */
  avoid?: string[];
  /** Maximum sac_scale; 1 = no alpine scrambling (default). */
  maxSacScale?: number;
}

/** Soft preferences — weighted in generation and re-measured in scoring. */
export interface SoftPreferences {
  surface?: SurfacePreference;
  avoidSteps?: boolean;
}

/** The declarative request object (PLANNING.md §4.1). */
export interface RoutePreferences {
  routeType: RouteTypePreference;
  distanceM: number;
  /** Validity tolerance as a ratio of target distance; defaults to DEFAULT_TOLERANCE. */
  tolerance?: number;
  hard?: HardFilters;
  soft?: SoftPreferences;
}

/** A raw candidate as produced by a generation strategy, before annotation/scoring. */
export interface RouteCandidate {
  id: string;
  /** Which generation strategy produced this candidate (PLANNING.md §3.2). */
  source: 'round_trip' | 'isochrone_oab' | 'via_points';
  coordinates: LonLat[];
  /** Realized route length in meters as reported by the engine (authoritative). */
  distanceM: number;
  ascendM?: number;
  descendM?: number;
  turnCount?: number;
  /**
   * Meters of route length per OSM surface value ("asphalt", "gravel", ...).
   * Untagged length is keyed as "missing".
   */
  surfaceBreakdown?: Record<string, number>;
}

/** Candidate enriched with measured properties the scorer consumes. */
export interface AnnotatedCandidate extends RouteCandidate {
  /** Honest topology classification from measured edge reuse — not what was requested. */
  routeType: RealizedRouteType;
  /** Share of total length on edges already traversed earlier in the route (0..1, ~0.5 for pure out-and-back). */
  repeatedEdgeShare: number;
  /** Share of surface-known length matching the user's surface preference (1 when preference is "any"). */
  softFilterMatch: number;
  /** Share of total length with no surface tag — drives the disclosure badge (PLANNING.md §4.3). */
  unknownSurfaceShare: number;
  /** Green/scenic index 0..1. Phase 2; neutral 0.5 until the PostGIS green index exists. */
  greenery: number;
  turnDensityPerKm: number;
}

export interface ScoredCandidate extends AnnotatedCandidate {
  score: number;
  /** Signed (realized − target) / target. */
  distanceErrorRatio: number;
  /** True when |distanceErrorRatio| ≤ effective tolerance. */
  withinTolerance: boolean;
}

export interface RankingResult {
  /** Ranked, deduplicated candidates within the keep window (best first). */
  candidates: ScoredCandidate[];
  /** True if at least one returned candidate is within tolerance. */
  hasValidCandidate: boolean;
  /**
   * When nothing is within tolerance: the nearest misses by distance error,
   * so the UI can say "closest we found: 6.9 km (target 8)" (PLANNING.md §6.3).
   */
  nearestMisses: ScoredCandidate[];
}
