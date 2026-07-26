/**
 * Product-level defaults shared by clients, service and harness.
 */

/**
 * Canonical sample/demo start point (owner decision 2026-07-25):
 * Köpmangatan 5, Gamla stan, Stockholm. Used as the web app's default map
 * center and geolocation-denied fallback, the first urban point of the Sweden
 * harness matrix, and the example in docs. Coordinates cross-checked against
 * OSM (Nominatim) in the Sweden harness CI run — see STATUS.md.
 */
export const DEFAULT_START = {
  lon: 18.0735,
  lat: 59.325,
  label: 'Köpmangatan 5, Gamla stan, Stockholm',
} as const;

/** Distance presets offered by the UI (meters); default selection 5 km. */
export const DISTANCE_PRESETS_M = [3000, 5000, 8000, 10_000, 15_000, 21_000] as const;
export const DEFAULT_DISTANCE_M = 5000;
