/**
 * JSON Schemas for request validation (consumed directly by Fastify).
 * Bounds follow PLANNING.md: distance targets 1–50 km; >30 km allowed with adjusted expectations.
 */

export const generateRoutesRequestSchema = {
  $id: 'GenerateRoutesRequest',
  type: 'object',
  required: ['start', 'distanceM'],
  additionalProperties: false,
  properties: {
    start: {
      type: 'object',
      required: ['lon', 'lat'],
      additionalProperties: false,
      properties: {
        lon: { type: 'number', minimum: -180, maximum: 180 },
        lat: { type: 'number', minimum: -90, maximum: 90 },
      },
    },
    distanceM: { type: 'number', minimum: 1000, maximum: 50_000 },
    routeType: { type: 'string', enum: ['loop', 'out_and_back', 'either'], default: 'loop' },
    soft: {
      type: 'object',
      additionalProperties: false,
      properties: {
        surface: { type: 'string', enum: ['paved', 'unpaved', 'any'], default: 'any' },
        avoidSteps: { type: 'boolean', default: false },
      },
    },
    fresh: { type: 'boolean', default: false },
  },
} as const;

export const candidateSchema = {
  $id: 'Candidate',
  type: 'object',
  properties: {
    id: { type: 'string' },
    routeType: { type: 'string', enum: ['loop', 'out_and_back'] },
    coordinates: {
      type: 'array',
      items: { type: 'array', items: { type: 'number' }, minItems: 2, maxItems: 3 },
    },
    distanceM: { type: 'number' },
    distanceErrorRatio: { type: 'number' },
    withinTolerance: { type: 'boolean' },
    score: { type: 'number' },
    repeatedEdgeShare: { type: 'number' },
    unknownSurfaceShare: { type: 'number' },
    surfaceBreakdown: { type: 'object', additionalProperties: { type: 'number' } },
    ascendM: { type: 'number' },
    descendM: { type: 'number' },
    gpxPath: { type: 'string' },
  },
} as const;

export const generateRoutesResponseSchema = {
  $id: 'GenerateRoutesResponse',
  type: 'object',
  properties: {
    target: {
      type: 'object',
      properties: {
        distanceM: { type: 'number' },
        tolerance: { type: 'number' },
      },
    },
    hasValidCandidate: { type: 'boolean' },
    candidates: { type: 'array', items: candidateSchema },
    nearestMisses: { type: 'array', items: candidateSchema },
    cached: { type: 'boolean' },
  },
} as const;

export const healthResponseSchema = {
  $id: 'HealthResponse',
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'degraded'] },
    engine: {
      type: 'object',
      properties: {
        reachable: { type: 'boolean' },
        kind: { type: 'string' },
      },
    },
    uptimeS: { type: 'number' },
    version: { type: 'string' },
  },
} as const;
