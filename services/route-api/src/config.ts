export interface AppConfig {
  port: number;
  host: string;
  /** "graphhopper" against a real engine; "synthetic" for tests/dev without one. */
  engine: 'graphhopper' | 'synthetic';
  graphhopperUrl: string;
  /** Number of parallel round-trip candidates per request (PLANNING.md §3.3: 8–16). */
  fanout: number;
  /** Response cache TTL in seconds (PLANNING.md §5.3: days-to-weeks; default 7 days). */
  cacheTtlS: number;
  /** Generated-route store TTL in seconds (GPX retrieval window). */
  routeTtlS: number;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  return {
    port: intFromEnv(env.PORT, 3000),
    host: env.HOST ?? '0.0.0.0',
    engine: env.ROUTING_ENGINE === 'synthetic' ? 'synthetic' : 'graphhopper',
    graphhopperUrl: env.GRAPHHOPPER_URL ?? 'http://localhost:8989',
    fanout: intFromEnv(env.FANOUT, 12),
    cacheTtlS: intFromEnv(env.CACHE_TTL_S, 7 * 24 * 3600),
    routeTtlS: intFromEnv(env.ROUTE_TTL_S, 24 * 3600),
  };
}

function intFromEnv(value: string | undefined, fallback: number): number {
  const parsed = value === undefined ? NaN : Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}
