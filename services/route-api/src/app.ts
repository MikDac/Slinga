import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import fastifyRateLimit from '@fastify/rate-limit';
import type {
  CandidateDto,
  GenerateRoutesRequest,
  GenerateRoutesResponse,
} from '@slinga/api-contract';
import { generateRoutesRequestSchema } from '@slinga/api-contract';
import type { RoutePreferences, ScoredCandidate } from '@slinga/route-core';
import { ScaleFactorTable, geohashEncode, toGpx } from '@slinga/route-core';
import type { AppConfig } from './config.js';
import type { RoutingEngine } from './engine/types.js';
import { RouteGenerator } from './generation.js';
import { TtlStore } from './store.js';

const VERSION = '0.1.0';

export interface AppDeps {
  config: AppConfig;
  engine: RoutingEngine;
}

interface StoredRoute {
  name: string;
  coordinates: ScoredCandidate['coordinates'];
}

export function buildApp({ config, engine }: AppDeps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== 'test' });

  // Family-beta abuse control: generous global ceiling, tighter on generation
  // (each generate fans out 8–16 engine calls). Per-IP, in-memory — sufficient
  // behind one Caddy for ≤5 known users; revisit only at real scale.
  app.register(fastifyRateLimit, { max: 120, timeWindow: '1 minute' });
  const scaleTable = new ScaleFactorTable();
  const generator = new RouteGenerator(engine, scaleTable);
  const routeStore = new TtlStore<StoredRoute>(config.routeTtlS);
  const responseCache = new TtlStore<GenerateRoutesResponse>(config.cacheTtlS);
  const startedAt = Date.now();
  let shuffleCounter = 0;

  app.get('/health', async () => {
    const reachable = await engine.isReachable();
    return {
      status: reachable ? 'ok' : 'degraded',
      engine: { reachable, kind: engine.kind },
      uptimeS: Math.round((Date.now() - startedAt) / 1000),
      version: VERSION,
    };
  });

  app.post<{ Body: GenerateRoutesRequest }>(
    '/v1/routes/generate',
    {
      schema: { body: generateRoutesRequestSchema },
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (request, reply) => {
      const body = request.body;
      const prefs: RoutePreferences = {
        routeType: body.routeType ?? 'loop',
        distanceM: body.distanceM,
        soft: {
          surface: body.soft?.surface ?? 'any',
          avoidSteps: body.soft?.avoidSteps ?? false,
        },
      };

      const cacheKey = responseCacheKey(body, prefs);
      if (!body.fresh) {
        const cached = responseCache.get(cacheKey);
        if (cached) {
          rememberRoutes(routeStore, cached, prefs);
          return { ...cached, cached: true };
        }
      }

      // "Shuffle" (fresh=true) advances the seed base so new candidates are genuinely new.
      const seedBase = body.fresh ? ++shuffleCounter * 1000 : 0;
      const result = await generator.generate(body.start.lon, body.start.lat, prefs, {
        fanout: config.fanout,
        seedBase,
      });

      if (result.candidates.length === 0 && result.nearestMisses.length === 0) {
        return reply.status(503).send({
          statusCode: 503,
          error: 'Service Unavailable',
          message: 'No routes could be generated near this start point.',
        });
      }

      const response: GenerateRoutesResponse = {
        target: { distanceM: prefs.distanceM, tolerance: generator.tolerance(prefs) },
        hasValidCandidate: result.hasValidCandidate,
        candidates: result.candidates.map((c) => toDto(c)),
        nearestMisses: result.hasValidCandidate ? [] : result.nearestMisses.map((c) => toDto(c)),
        cached: false,
      };

      rememberRoutes(routeStore, response, prefs);
      responseCache.set(cacheKey, response);
      return response;
    },
  );

  app.get<{ Params: { id: string } }>('/v1/routes/:id/gpx', async (request, reply) => {
    const stored = routeStore.get(request.params.id);
    if (!stored) {
      return reply.status(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: 'Unknown or expired route id.',
      });
    }
    return reply
      .header('content-type', 'application/gpx+xml; charset=utf-8')
      .header('content-disposition', `attachment; filename="${request.params.id}.gpx"`)
      .send(toGpx({ name: stored.name, coordinates: stored.coordinates }));
  });

  return app;
}

/** Cache key per PLANNING.md §5.3: ~150 m start cell + 250 m distance bucket + canonical mode. */
export function responseCacheKey(body: GenerateRoutesRequest, prefs: RoutePreferences): string {
  const cell = geohashEncode(body.start.lat, body.start.lon, 7);
  const bucket = Math.round(prefs.distanceM / 250);
  const mode = `${prefs.soft?.surface ?? 'any'}:${prefs.soft?.avoidSteps ? 'nosteps' : 'steps'}`;
  return `${cell}:${bucket}:${prefs.routeType}:${mode}`;
}

function toDto(c: ScoredCandidate): CandidateDto {
  return {
    id: c.id,
    routeType: c.routeType,
    coordinates: c.coordinates as number[][],
    distanceM: Math.round(c.distanceM),
    distanceErrorRatio: round4(c.distanceErrorRatio),
    withinTolerance: c.withinTolerance,
    score: round4(c.score),
    repeatedEdgeShare: round4(c.repeatedEdgeShare),
    unknownSurfaceShare: round4(c.unknownSurfaceShare),
    surfaceBreakdown: c.surfaceBreakdown
      ? Object.fromEntries(Object.entries(c.surfaceBreakdown).map(([k, v]) => [k, Math.round(v)]))
      : undefined,
    ascendM: c.ascendM !== undefined ? Math.round(c.ascendM) : undefined,
    descendM: c.descendM !== undefined ? Math.round(c.descendM) : undefined,
    gpxPath: `/v1/routes/${encodeURIComponent(c.id)}/gpx`,
  };
}

function rememberRoutes(
  store: TtlStore<StoredRoute>,
  response: GenerateRoutesResponse,
  prefs: RoutePreferences,
): void {
  const km = (prefs.distanceM / 1000).toFixed(1).replace(/\.0$/, '');
  for (const c of [...response.candidates, ...response.nearestMisses]) {
    store.set(c.id, {
      name: `Slinga ${km} km ${c.routeType === 'loop' ? 'loop' : 'out-and-back'}`,
      coordinates: c.coordinates as StoredRoute['coordinates'],
    });
  }
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}
