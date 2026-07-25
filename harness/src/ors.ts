import type { RouteCandidate } from '@slinga/route-core';
import type { RoundTripParams, RoutingEngine } from '@slinga/route-api';

/**
 * openrouteservice hosted API adapter — Phase 0 prototyping only (PLANNING.md §2.2):
 * free tier is non-commercial and must never enter the production path.
 * Requires ORS_API_KEY. Directions quota: nominally 2,000/day, 40/min.
 */

const ORS_BASE = 'https://api.openrouteservice.org';

export class OrsEngine implements RoutingEngine {
  readonly kind = 'ors';
  readonly profile = 'foot-walking';

  constructor(private readonly apiKey: string) {}

  async roundTrip(params: RoundTripParams): Promise<RouteCandidate | null> {
    const res = await fetch(`${ORS_BASE}/v2/directions/foot-walking/geojson`, {
      method: 'POST',
      headers: {
        authorization: this.apiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        coordinates: [[params.startLon, params.startLat]],
        options: {
          round_trip: {
            length: Math.round(params.requestedDistanceM),
            points: 3,
            seed: params.seed,
          },
        },
      }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      features?: {
        geometry: { coordinates: [number, number][] };
        properties: { summary: { distance: number; ascent?: number; descent?: number } };
      }[];
    };
    const feature = json.features?.[0];
    if (!feature) return null;
    return {
      id: `ors-${params.seed}`,
      source: 'round_trip',
      coordinates: feature.geometry.coordinates,
      distanceM: feature.properties.summary.distance,
      ascendM: feature.properties.summary.ascent,
      descendM: feature.properties.summary.descent,
    };
  }

  async isReachable(): Promise<boolean> {
    return this.apiKey.length > 0;
  }
}
