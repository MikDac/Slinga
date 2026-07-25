import { geohashEncode } from './geohash.js';

/**
 * Learned per-area scale factors (PLANNING.md §3.3 step 1, §5.3 layer 3).
 *
 * GraphHopper's `round_trip.distance` is construction-geometry distance, not realized
 * route length, so realized/requested ratios drift by area (street-network detour factor).
 * We learn the ratio online per (namespace, geohash cell) and pre-correct the next
 * request: requested = target / factor.
 *
 * The namespace identifies what produced the observation — by convention
 * `"<engine kind>:<profile>"` (e.g. "graphhopper:foot", "synthetic:foot") — so
 * corrections learned from one engine or profile never pollute another's.
 */

const DEFAULT_ALPHA = 0.3;
const DEFAULT_PRECISION = 4; // geohash-4 cell ≈ 39 km × 19 km — coarse "area" granularity

export interface ScaleFactorTableJson {
  precision: number;
  alpha: number;
  factors: Record<string, number>;
}

export class ScaleFactorTable {
  private readonly factors = new Map<string, number>();

  constructor(
    private readonly alpha = DEFAULT_ALPHA,
    private readonly precision = DEFAULT_PRECISION,
  ) {}

  /** Realized/requested ratio for the area around (lat, lon); 1.0 when nothing learned yet. */
  get(namespace: string, lat: number, lon: number): number {
    return this.factors.get(this.key(namespace, lat, lon)) ?? 1.0;
  }

  /** Distance to request from the engine so the realized length lands near targetM. */
  correctedRequest(namespace: string, lat: number, lon: number, targetM: number): number {
    return targetM / this.get(namespace, lat, lon);
  }

  /** Fold one observation (requestedM → realizedM) into the area's EWMA. */
  observe(
    namespace: string,
    lat: number,
    lon: number,
    requestedM: number,
    realizedM: number,
  ): void {
    if (requestedM <= 0 || realizedM <= 0) return;
    const ratio = realizedM / requestedM;
    const key = this.key(namespace, lat, lon);
    const prev = this.factors.get(key);
    this.factors.set(key, prev === undefined ? ratio : prev + this.alpha * (ratio - prev));
  }

  toJSON(): ScaleFactorTableJson {
    return {
      precision: this.precision,
      alpha: this.alpha,
      factors: Object.fromEntries(this.factors),
    };
  }

  static fromJSON(json: ScaleFactorTableJson): ScaleFactorTable {
    const table = new ScaleFactorTable(json.alpha, json.precision);
    for (const [key, value] of Object.entries(json.factors)) {
      table.factors.set(key, value);
    }
    return table;
  }

  private key(namespace: string, lat: number, lon: number): string {
    return `${namespace}:${geohashEncode(lat, lon, this.precision)}`;
  }
}
