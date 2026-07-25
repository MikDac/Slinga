# Slinga

Target-distance running & walking route finder: open the app in an unfamiliar city,
set a target distance (e.g. 8 km), and get ranked loop / out-and-back routes whose
real length is close to the target — drawn on a map and exportable as GPX.

**[PLANNING.md](./PLANNING.md) is the project's source of truth** (requirements,
feasibility analysis, architecture, phased plan). Current status: **Phase 0**
(de-risking spikes & engineering foundation).

## Repository layout (pnpm monorepo)

| Path                    | What                                                                                                                                                                                    |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/route-core`   | Pure algorithm library: candidate filter/score/dedupe/rank pipeline, edge-reuse & overlap measurement, learned scale factors, GPX, geo utils. No I/O, fully unit-tested.                |
| `packages/api-contract` | OpenAPI spec + JSON schemas + wire types shared by clients and the service.                                                                                                             |
| `services/route-api`    | Fastify route service: candidate fan-out against the routing engine, refine-on-miss, response cache, GPX endpoint. Engine-agnostic (`RoutingEngine` interface: GraphHopper, synthetic). |
| `apps/web`              | React + Vite web app (installable PWA). Phase 0: walking skeleton page.                                                                                                                 |
| `harness/`              | Phase 0.1 route-generation quality harness — the spike matrix runner with acceptance-gate metrics; becomes the regression suite.                                                        |
| `infra/`                | docker-compose (GraphHopper + route-api), GraphHopper config, extract download, runbook.                                                                                                |

## Getting started

```bash
pnpm install
pnpm build && pnpm test          # everything is green without any external service

# Run the API with the synthetic engine (no GraphHopper needed):
pnpm --filter @slinga/route-api dev
# Then in another terminal:
pnpm --filter @slinga/web dev    # web skeleton on http://localhost:5173

# Run the spike harness (pipeline sanity, no infra):
ENGINE=synthetic pnpm --filter @slinga/harness spike
```

To run against a real routing engine, see [`infra/README.md`](./infra/README.md).

## API

`POST /v1/routes/generate` → ranked candidates; `GET /v1/routes/{id}/gpx` → GPX export;
`GET /health`. Full contract: [`packages/api-contract/openapi.yaml`](./packages/api-contract/openapi.yaml).

## Data & attribution

Routing and map data © [OpenStreetMap](https://www.openstreetmap.org/copyright)
contributors (ODbL). Map tiles: [OpenFreeMap](https://openfreemap.org). See
PLANNING.md §2 for the full licensing analysis.
