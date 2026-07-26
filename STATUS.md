# STATUS

> **Standing rule:** every working session ends by updating this file — decisions made,
> assumptions taken, measured results, and what's next. PLANNING.md holds the long-lived
> plan; this file holds the current truth.

## Current phase

**Phase 1 → family beta.** M0 passed (see history below); this session completed the
Phase 1 core (map UI, isochrone out-and-back, full-flow E2E) plus family hardening and
the one-dispatch deploy pipeline.

**Target milestone (owner, 2026-07-26): "Family beta"** — ≤5 known users,
non-concurrent, region Sweden, distribution = one URL + one shared Basic Auth password.
UI bar: zero-instruction success — pick distance, tap generate, see loops, tap one,
export GPX.

## Decisions confirmed (product owner)

- **Canonical sample/demo start point: Köpmangatan 5, Gamla stan, Stockholm**
  (2026-07-26). Coordinates `lon 18.0735, lat 59.325` (owner-provided; OSM/Nominatim
  cross-check runs in every Sweden harness CI run — see "Canonical point verification"
  below). Applied as `DEFAULT_START` in `packages/api-contract/src/defaults.ts`,
  consumed by: web app map center + geolocation-denied fallback, first urban point of
  the Sweden harness matrix, docs examples. (Exception: the local-dev smoke in
  `infra/README.md` quick start uses Liechtenstein coordinates because that flow runs
  against a deliberately tiny extract.)
- Launch region **Europe**; spike/beta extract **Sweden** (2026-07-25). Repo is public
  since 2026-07-25 → CI runners are the 4 vCPU/16 GB class and Sweden fits in CI; the
  earlier Denmark fallback is retired as default but stays one dispatch away.
- **±10%** tolerance and **3–5 ranked results** are product defaults (2026-07-25).
- API path deviation accepted: `POST /v1/routes/generate` (PLANNING.md §8 note).
- ORS hosted validation only runs where an `ORS_API_KEY` secret exists.

## Phase 1 / beta-readiness audit (2026-07-26)

| Item                                            | Before session       | Now                                                        |
| ----------------------------------------------- | -------------------- | ---------------------------------------------------------- |
| Route API (generate/GPX/health, cache, fan-out) | DONE (M0)            | DONE                                                       |
| Map UI (MapLibre, distance picker, cards, GPX)  | PENDING              | **DONE** (zero-instruction flow, sv+en)                    |
| Isochrone out-and-back generator + golden tests | PENDING              | **DONE** (exact-by-construction trim; 0.0% err on fixture) |
| Full-flow Playwright (mobile, mocked geo)       | PENDING (smoke only) | **DONE** (flow + geo-denied + sv/en locales)               |
| Gallery on GitHub Pages                         | PENDING              | **DONE** (published by harness workflow)                   |
| Sweden harness dispatch                         | PENDING              | **DONE** (results below)                                   |
| Rate limit, Basic Auth, error page              | PENDING              | **DONE** (@fastify/rate-limit; Caddy basic_auth from env)  |
| Deploy pipeline (one dispatch, CI-verifiable)   | PENDING              | **DONE** (`deploy-staging.yml`, ships when secrets exist)  |
| Graph serving RSS measurement (VPS sizing)      | PENDING              | **DONE** (results below)                                   |

## Assumptions taken this session (overridable)

- **PWA/offline deferred past family beta**: the zero-instruction flow is online;
  service worker + offline route cache return with the M1 polish pass (PLANNING.md §6.2
  is unchanged as the target).
- E2E remains Chromium mobile emulation (390×844, mocked Stockholm geolocation); tile
  CDN is deliberately blocked in tests so the blank-style fallback path is what CI pins.
  Real-iPhone Safari stays on the owner's manual smoke checklist.
- Single shared Basic Auth user for the whole family (no accounts, per milestone).
- Out-and-back turnaround may sit mid-street (the trim construction turns around at
  exactly target/2 along the routed leg) — acceptable for runners; revisit only if
  beta feedback objects.
- OAB leg-level annotations (surface mix, ascent) are scaled proportionally after the
  trim — approximation, disclosed here rather than hidden.

## Measured results

### Sweden — M0 gate on real GraphHopper (harness-real-engine)

_PENDING CI RUN — fill from run summary/artifacts._

### Canonical point verification (Nominatim, from CI)

_PENDING CI RUN._

### Graph serving RSS (deploy-staging, VPS sizing)

_PENDING CI RUN — decides 8 vs 16 GB VPS._

### In-runner deploy-stack verification

_PENDING CI RUN._

## Deploy readiness

Staging goes live in **one dispatch** of `deploy-staging` once these repo secrets
exist (see DEPLOY.md): `DOMAIN`, `SSH_HOST`, `SSH_USER`, `SSH_KEY`,
`BASIC_AUTH_USER`, `BASIC_AUTH_HASH`. Until then the same dispatch performs the full
CI dry-run (image + graph + in-runner stack smoke with auth), so the deployable
artifact stays continuously verified.

## History

- **2026-07-25 — M0 gate PASS (Denmark, run #2):** urban/suburban valid 100% (30/30),
  ≥3 candidates 93.3%, latency p50/p95/max 107/379/587 ms on a 2 vCPU/7.8 GB runner;
  47/50 cells valid overall; 3 honest non-urban misses (Dragør 21 km, Bryrup 3 km,
  Hanstholm 10 km) — the isochrone out-and-back built this session is the designed
  answer. 0 engine errors in ~430 calls. Details: run 30156935570, artifact
  `spike-report-2`.
- 2026-07-25 — Denmark fallback executed when private-repo runners (2 vCPU/7 GB)
  couldn't fit Sweden; superseded by the repo going public.

## Next steps

1. Owner: order the VPS per the RSS measurement, set the DEPLOY.md secrets, dispatch
   `deploy-staging` — family beta is live.
2. Owner: manual Safari-on-iPhone smoke of the production URL (real GPS, share sheet).
3. Next dev session: M1 polish per PLANNING.md 1.2/1.3 leftovers — elevation profile
   display (terrain tiles), follow-along screen (Wake Lock), PWA install prompt,
   surface-preference filter UI; weekly OSM refresh as a scheduled variant of the
   deploy workflow.
