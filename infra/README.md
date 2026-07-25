# Infra

Local/staging stack per PLANNING.md §5. One `docker compose` project runs:

- **graphhopper** — self-hosted routing engine (foot + hike profiles, flexible mode,
  round_trip + custom models enabled). Needs an OSM extract in `graphhopper/data/`.
- **route-api** — the Fastify route service, built from this repo.

## Quick start (local)

```bash
# 1. Get a small extract (Liechtenstein builds in seconds)
./graphhopper/download-extract.sh europe/liechtenstein

# 2. Start the stack (first start builds the graph — watch the graphhopper logs)
docker compose up --build

# 3. Smoke test
curl -s localhost:3000/health | jq
curl -s -X POST localhost:3000/v1/routes/generate \
  -H 'content-type: application/json' \
  -d '{"start":{"lon":9.5215,"lat":47.1410},"distanceM":5000}' | jq '.candidates[].distanceM'
```

## Engine-less development

The route service also runs without GraphHopper using the deterministic synthetic
engine (same pipeline, fake geometry):

```bash
pnpm --filter @slinga/route-api dev   # ROUTING_ENGINE=synthetic
```

## Notes

- OSM data refresh (weekly build → healthcheck → hot-swap, PLANNING.md §8 0.3) is
  a Phase 0 spike deliverable; `download-extract.sh` + compose restart is the
  manual version of it for now.
- Launch-region sizing (Europe extract vs country list) is open question 1 in
  PLANNING.md §7 — do not size a VPS before that is decided.
