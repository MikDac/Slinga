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

**GATE: PASS** — `harness-real-engine` run #2, 2026-07-25 11:53 UTC
([run 30156935570](https://github.com/MikDac/Slinga/actions/runs/30156935570),
artifact `spike-report-2`: report.json/csv, gallery.html, routes.geojson, extract-info.txt).

| Metric                                        | Measured           | Gate      |
| --------------------------------------------- | ------------------ | --------- |
| Urban/suburban cells ≥1 candidate within ±10% | **100%** (30/30)   | ≥90%      |
| Urban/suburban cells with ≥3 candidates       | 93.3% (28/30)      | —         |
| Cell latency p50 / p95 / max                  | 107 / 379 / 587 ms | p95 <3 s  |
| All-category valid cells                      | 94% (47/50)        | (no gate) |

Setup: GraphHopper 9.1 (foot profile, flexible, custom model, elevation off),
`europe/denmark` extract (469 MB PBF, Last-Modified 2026-07-25 00:27 UTC,
md5 `5a358c18142df8913f04fbe3dae04418`), graph build 68 s, Danish 10-point ×
5-distance matrix, fanout 8 + refine-on-miss.
**Hardware note:** Intel Xeon Platinum 8573C ×2, 7.8 GB RAM (GitHub runner) —
latency indicative only until re-measured on the real VPS.

**Error distribution per cell type (best-candidate |error|):**

- urban (20 cells): all valid; 0.2–5.4%
- suburban (10): all valid; 0.9–9.5% (the two 3 km cells produced only 2 deduped
  candidates — small-network dedupe, not a distance failure)
- waterfront (10): 9/10 valid; miss = Dragør @ 21 km, best 10.4% (peninsula: 7 of 11
  engine calls unroutable — network genuinely can't close a 21 km loop there)
- rural (5): 4/5 valid; miss = Bryrup @ 3 km, best 18.4% (village network too coarse
  for a 3 km loop)
- sparse (5): 4/5 valid; miss = Hanstholm @ 10 km, best 13.2%

**Failure taxonomy:** 0 engine errors and 0 thrown exceptions across ~430 round-trip
calls; nulls (unroutable seeds) concentrate at waterfront/21 km exactly where geometry
predicts. All three misses are honest nearest-miss responses in non-urban categories —
the §6.3 out-and-back fallback (isochrone method, Phase 1) is the designed answer there,
not a scale-factor problem. Repeated-edge share of best candidates ≤9%, typically <4%:
round_trip produces real loops.

**Verdict:** the §3.3 fan-out + scale-learning + refine-on-miss pipeline meets the M0
accuracy gate on a real engine and real OSM data with ~8× latency headroom on the
weakest hardware we'll ever run on. Algorithm go.

## Next steps

1. M0 go/no-go review by owner — measured basis above; algorithm side is a go.
2. Sweden run of the same workflow when a ≥16 GB runner or the VPS exists
   (`region=europe/sweden`, `heap=11g`, points auto-switch).
3. Remaining Phase 0 items: staging URL + per-PR preview deploys (0.4, needs deploy
   target decision), OSM refresh hot-swap runbook (0.3 — the workflow's
   build→health→swap loop is the prototype).
4. Phase 1 kickoff per PLANNING.md §8: route service hardening + web app map UI;
   wire the isochrone out-and-back generator to close the non-urban misses.
