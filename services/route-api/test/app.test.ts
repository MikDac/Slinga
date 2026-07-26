import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { GenerateRoutesResponse } from '@slinga/api-contract';
import { buildApp } from '../src/app.js';
import type { AppConfig } from '../src/config.js';
import { SyntheticEngine } from '../src/engine/synthetic.js';

const TEST_CONFIG: AppConfig = {
  port: 0,
  host: '127.0.0.1',
  engine: 'synthetic',
  graphhopperUrl: 'http://unused',
  fanout: 12,
  cacheTtlS: 3600,
  routeTtlS: 3600,
};

const MUNICH = { lon: 11.5755, lat: 48.1374 };

describe('route-api', () => {
  let app: FastifyInstance;

  beforeEach(() => {
    app = buildApp({ config: TEST_CONFIG, engine: new SyntheticEngine() });
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports health with engine status', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.engine).toEqual({ reachable: true, kind: 'synthetic' });
  });

  it('generates ranked candidates with at least one within tolerance', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/routes/generate',
      payload: { start: MUNICH, distanceM: 8000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as GenerateRoutesResponse;
    expect(body.hasValidCandidate).toBe(true);
    expect(body.candidates.length).toBeGreaterThanOrEqual(1);
    expect(body.candidates.length).toBeLessThanOrEqual(5);

    const best = body.candidates[0]!;
    expect(Math.abs(best.distanceErrorRatio)).toBeLessThanOrEqual(0.1);
    expect(best.coordinates.length).toBeGreaterThan(10);
    expect(best.gpxPath).toContain(best.id);
    // Candidates are sorted best-first and deduplicated.
    const ids = body.candidates.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('rejects invalid requests via schema validation', async () => {
    const noStart = await app.inject({
      method: 'POST',
      url: '/v1/routes/generate',
      payload: { distanceM: 8000 },
    });
    expect(noStart.statusCode).toBe(400);

    const badDistance = await app.inject({
      method: 'POST',
      url: '/v1/routes/generate',
      payload: { start: MUNICH, distanceM: 200 },
    });
    expect(badDistance.statusCode).toBe(400);

    const badEnum = await app.inject({
      method: 'POST',
      url: '/v1/routes/generate',
      payload: { start: MUNICH, distanceM: 8000, routeType: 'triangle' },
    });
    expect(badEnum.statusCode).toBe(400);
  });

  it('serves GPX for a generated candidate and 404s for unknown ids', async () => {
    const gen = await app.inject({
      method: 'POST',
      url: '/v1/routes/generate',
      payload: { start: MUNICH, distanceM: 5000 },
    });
    const body = gen.json() as GenerateRoutesResponse;
    const gpxRes = await app.inject({ method: 'GET', url: body.candidates[0]!.gpxPath });
    expect(gpxRes.statusCode).toBe(200);
    expect(gpxRes.headers['content-type']).toContain('application/gpx+xml');
    expect(gpxRes.body).toContain('<gpx version="1.1"');
    expect(gpxRes.body).toContain('<trkpt');

    const missing = await app.inject({ method: 'GET', url: '/v1/routes/nope/gpx' });
    expect(missing.statusCode).toBe(404);
  });

  it('serves repeat requests from cache and bypasses it with fresh=true', async () => {
    const payload = { start: MUNICH, distanceM: 8000 };
    const first = await app.inject({ method: 'POST', url: '/v1/routes/generate', payload });
    const second = await app.inject({ method: 'POST', url: '/v1/routes/generate', payload });
    expect((first.json() as GenerateRoutesResponse).cached).toBe(false);
    expect((second.json() as GenerateRoutesResponse).cached).toBe(true);

    const shuffled = await app.inject({
      method: 'POST',
      url: '/v1/routes/generate',
      payload: { ...payload, fresh: true },
    });
    const shuffledBody = shuffled.json() as GenerateRoutesResponse;
    expect(shuffledBody.cached).toBe(false);
    // New seed base ⇒ different candidate ids than the cached response.
    const firstIds = new Set((first.json() as GenerateRoutesResponse).candidates.map((c) => c.id));
    expect(shuffledBody.candidates.some((c) => !firstIds.has(c.id))).toBe(true);
  });

  it('returns 503 when the engine produces nothing at all', async () => {
    // Cover round_trip seeds AND the out-and-back seed range (500+) — truly dead.
    const deadEngine = new SyntheticEngine({
      failingSeeds: new Set(Array.from({ length: 700 }, (_, i) => i)),
    });
    const deadApp = buildApp({ config: TEST_CONFIG, engine: deadEngine });
    const res = await deadApp.inject({
      method: 'POST',
      url: '/v1/routes/generate',
      payload: { start: MUNICH, distanceM: 8000 },
    });
    expect(res.statusCode).toBe(503);
    await deadApp.close();
  });
});
