# STATUS

> **Standing rule:** every working session ends by updating this file — decisions made,
> assumptions taken, measured results, and what's next. PLANNING.md holds the long-lived
> plan; this file holds the current truth.

## Current phase

**Phase 0** — de-risking spikes & engineering foundation (PLANNING.md §8).
Foundation merged to `main` (PR #1). This session: measure the M0 acceptance gate
against real GraphHopper on the Sweden extract, using CI as the runtime.

## Decisions confirmed (2026-07-25, product owner)

- Launch region: **Europe**. Phase 0 spike extract: **Sweden** (`europe/sweden` on Geofabrik) —
  **fallback to Denmark executed**, see below.
- **±10%** distance tolerance and **3–5 ranked results** are product defaults (no longer "assumed").
- API path deviation accepted: `POST /v1/routes/generate` (PLANNING.md §8 note).
- ORS hosted validation only runs where an `ORS_API_KEY` secret exists; skipped silently otherwise.

## Extract fallback: Sweden → Denmark (2026-07-25, per pre-approved rule)

`harness-real-engine` run #1 tripped the headroom gate: this repo's GitHub-hosted
`ubuntu-latest` runners are the **private-repo class — 2 vCPU, 7 GB RAM, ~15 GB free
disk** (not the 4 vCPU/16 GB public-repo class). The Sweden graph (~750 MB PBF,
sized at 11 GB heap) cannot fit. Executed the documented fallback: the spike runs on
**`europe/denmark`** (~180 MB PBF, 4 GB heap) with an equivalent Danish point matrix
(København ×2 + Aarhus + Odense urban, Lyngby + Ballerup suburban, Dragør + Helsingør
waterfront, Bryrup rural, Hanstholm sparse). The Swedish point set remains in
`harness/src/points.ts`; dispatch the workflow with `region=europe/sweden`, `heap=11g`
once a larger runner (or the VPS) exists.

## Assumptions taken this session (overridable)

- **Elevation is OFF for the spike** (engine requests `elevation: false`, no `average_slope`
  encoded value): SRTM does not cover Sweden above 60°N, and elevation import would add
  CI time and failure modes for zero spike value. Phase 1 computes elevation profiles from
  AWS Terrain Tiles server-side (PLANNING.md 1.1); hill-aware _generation_ returns with a
  DEM-capable provider choice when Phase 2 needs it.
- **GraphHopper runs from the official Maven Central JAR** (`graphhopper-web-9.1.jar`,
  Temurin 21) in CI and locally — no third-party Docker image dependency in the spike path.
  The `infra/docker-compose.yml` Docker path remains for the eventual VPS.
- **Extract pinning** is implemented as a GitHub Actions cache key
  (`region + EXTRACT_PIN + GH version + config hash`), since Geofabrik only serves
  `-latest`. The actually-used extract's `Last-Modified` + md5 are recorded in the
  `extract-info.txt` artifact of every run. Bump `EXTRACT_PIN` in
  `.github/workflows/harness-real-engine.yml` to roll the data forward.
- **E2E is Chromium mobile emulation** (390×844, touch, mocked Stockholm geolocation).
  Real WebKit/iPhone verification stays on the owner's manual Safari smoke checklist (M1).
- Spike start points: 10 locations per country set (4 urban, 2 suburban, 2 waterfront,
  1 rural, 1 sparse) × {3, 5, 8, 10, 21 km} — `harness/src/points.ts`, selected via
  `POINTS=sweden|denmark` (workflow derives it from the region input).

## Measured results — M0 acceptance gate (real engine)

_Pending: filled in from the `harness-real-engine` workflow run (this session)._

## Next steps

1. Run `harness-real-engine` on main; record results above; iterate if the gate fails
   (pre-approved backstops: scale-factor correction tuning, §3.3 isochrone method).
2. Remaining Phase 0 items: engine ops runbook hardening (0.3 hot-swap), staging URL +
   per-PR preview deploys (0.4) — need a deploy target decision.
3. M0 go/no-go review once the gate result is in.
