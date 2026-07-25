import { destinationPoint, pathLengthM } from '../src/geo.js';
import type { LonLat, RouteCandidate } from '../src/types.js';

/** Synthetic geometry builders for deterministic pipeline tests. */

export const START: LonLat = [11.5755, 48.1374]; // Munich city center

/** Closed square loop of roughly 4×sideM total length, offset east by offsetM. */
export function squareLoop(sideM: number, offsetM = 0, pointsPerSide = 8): LonLat[] {
  const origin = offsetM === 0 ? START : destinationPoint(START, 90, offsetM);
  const corners = [
    origin,
    destinationPoint(origin, 0, sideM),
    destinationPoint(destinationPoint(origin, 0, sideM), 90, sideM),
    destinationPoint(origin, 90, sideM),
  ];
  const coords: LonLat[] = [];
  for (let side = 0; side < 4; side++) {
    const from = corners[side]!;
    const to = corners[(side + 1) % 4]!;
    for (let i = 0; i < pointsPerSide; i++) {
      const t = i / pointsPerSide;
      coords.push([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]);
    }
  }
  coords.push(corners[0]!);
  return coords;
}

/** Straight out-and-back of roughly totalM (there and back on the same segments). */
export function outAndBack(totalM: number, bearingDeg = 0, points = 20): LonLat[] {
  const half = totalM / 2;
  const out: LonLat[] = [];
  for (let i = 0; i <= points; i++) {
    out.push(destinationPoint(START, bearingDeg, (half * i) / points));
  }
  return [...out, ...out.slice(0, -1).reverse()];
}

export function candidateFrom(
  id: string,
  coordinates: LonLat[],
  extra: Partial<RouteCandidate> = {},
): RouteCandidate {
  return {
    id,
    source: 'round_trip',
    coordinates,
    distanceM: pathLengthM(coordinates),
    ...extra,
  };
}
