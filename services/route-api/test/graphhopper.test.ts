import { describe, expect, it } from 'vitest';
import {
  GraphHopperEngine,
  buildCustomModel,
  surfaceBreakdownFromDetails,
} from '../src/engine/graphhopper.js';

describe('buildCustomModel', () => {
  it('always hard-avoids motorways, trunks and ferries', () => {
    const model = buildCustomModel({ routeType: 'loop', distanceM: 8000 });
    const zeroed = model.priority.filter((s) => (s as { multiply_by: number }).multiply_by === 0);
    expect(zeroed).toHaveLength(3);
  });

  it('adds soft penalties for steps and dispreferred surfaces', () => {
    const model = buildCustomModel({
      routeType: 'loop',
      distanceM: 8000,
      soft: { surface: 'paved', avoidSteps: true },
    });
    const conditions = model.priority.map((s) => (s as { if: string }).if);
    expect(conditions.some((c) => c.includes('STEPS'))).toBe(true);
    expect(conditions.some((c) => c.includes('GRAVEL'))).toBe(true);
  });
});

describe('surfaceBreakdownFromDetails', () => {
  it('aggregates segment lengths per surface and maps null to missing', () => {
    // Two ~1.1 km segments along a meridian (0.01° latitude each).
    const path = {
      distance: 2224,
      points: {
        coordinates: [
          [11.5, 48.1],
          [11.5, 48.11],
          [11.5, 48.12],
        ] as [number, number][],
      },
      details: {
        surface: [
          [0, 1, 'asphalt'],
          [1, 2, null],
        ] as [number, number, string | null][],
      },
    };
    const breakdown = surfaceBreakdownFromDetails(path)!;
    expect(breakdown.asphalt).toBeGreaterThan(1000);
    expect(breakdown.missing).toBeGreaterThan(1000);
    expect(Object.keys(breakdown)).toHaveLength(2);
  });

  it('returns undefined when the engine sent no details', () => {
    const path = { distance: 0, points: { coordinates: [] } };
    expect(surfaceBreakdownFromDetails(path)).toBeUndefined();
  });
});

describe('GraphHopperEngine', () => {
  it('parses a round_trip response into a candidate', async () => {
    const ghResponse = {
      paths: [
        {
          distance: 8123,
          ascend: 55,
          descend: 55,
          points: {
            coordinates: [
              [11.5, 48.1],
              [11.51, 48.11],
              [11.5, 48.1],
            ],
          },
          instructions: [{}, {}, {}],
          details: { surface: [[0, 2, 'asphalt']] },
        },
      ],
    };
    const fetchStub: typeof fetch = async (url, init) => {
      // The request body must carry the round_trip contract (PLANNING.md §2.1).
      const body = JSON.parse((init as RequestInit).body as string);
      expect(String(url)).toBe('http://gh.test/route');
      expect(body.algorithm).toBe('round_trip');
      expect(body['round_trip.distance']).toBe(7000);
      expect(body['ch.disable']).toBe(true);
      expect(body.custom_model.priority.length).toBeGreaterThan(0);
      return new Response(JSON.stringify(ghResponse), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    };

    const engine = new GraphHopperEngine('http://gh.test', fetchStub);
    const candidate = await engine.roundTrip({
      startLon: 11.5,
      startLat: 48.1,
      requestedDistanceM: 7000,
      seed: 3,
      headingDeg: 90,
      preferences: { routeType: 'loop', distanceM: 8000 },
    });
    expect(candidate).not.toBeNull();
    expect(candidate!.distanceM).toBe(8123);
    expect(candidate!.turnCount).toBe(3);
    expect(candidate!.surfaceBreakdown!.asphalt).toBeGreaterThan(0);
  });

  it('returns null on engine errors (bad snap for this seed)', async () => {
    const fetchStub: typeof fetch = async () => new Response('cannot snap', { status: 400 });
    const engine = new GraphHopperEngine('http://gh.test', fetchStub);
    const candidate = await engine.roundTrip({
      startLon: 0,
      startLat: 0,
      requestedDistanceM: 7000,
      seed: 0,
      headingDeg: 0,
      preferences: { routeType: 'loop', distanceM: 8000 },
    });
    expect(candidate).toBeNull();
  });
});
