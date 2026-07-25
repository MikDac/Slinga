import type { LonLat } from './types.js';

const EARTH_RADIUS_M = 6_371_008.8;

/** Great-circle distance in meters between two [lon, lat] points. */
export function haversineM(a: LonLat, b: LonLat): number {
  const [lon1, lat1] = a;
  const [lon2, lat2] = b;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const dφ = φ2 - φ1;
  const dλ = ((lon2 - lon1) * Math.PI) / 180;
  const s = Math.sin(dφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(s)));
}

/** Total polyline length in meters. */
export function pathLengthM(coords: readonly LonLat[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1]!, coords[i]!);
  }
  return total;
}

/**
 * Destination point given start [lon, lat], initial bearing (degrees, clockwise from north)
 * and distance in meters. Used to place via-points / seed headings on a circle around the start.
 */
export function destinationPoint(start: LonLat, bearingDeg: number, distanceM: number): LonLat {
  const [lon, lat] = start;
  const δ = distanceM / EARTH_RADIUS_M;
  const θ = (bearingDeg * Math.PI) / 180;
  const φ1 = (lat * Math.PI) / 180;
  const λ1 = (lon * Math.PI) / 180;
  const φ2 = Math.asin(Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ));
  const λ2 =
    λ1 +
    Math.atan2(Math.sin(θ) * Math.sin(δ) * Math.cos(φ1), Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2));
  return [(((λ2 * 180) / Math.PI + 540) % 360) - 180, (φ2 * 180) / Math.PI];
}
