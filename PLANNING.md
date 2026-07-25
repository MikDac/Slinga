# Target-Distance Running & Walking Route Finder

## Requirements & Feasibility Analysis + Implementation Plan

**Status:** Planning document — no implementation yet.
**Date:** 2026-07-23 (rev. 3: MVP re-platformed to **web-first / PWA** — fastest, fully automatable validation path; native iOS becomes a demand-triggered later phase. Rev. 2's iOS-first release analysis is retained in §7/§8 and applies unchanged when that phase starts.)
**Intended consumer:** This document is written to be handed to Claude Code as the primary project context for autonomous implementation. Decisions marked **[DECIDED]** are settled; items marked **[OPEN]** need a human decision before or during the phase that depends on them; items marked **[ASSUMED]** are working assumptions that Claude Code should treat as decided unless overridden.

---

## 0. Executive summary

The product: a traveler opens the app in an unfamiliar city, gets (or types) a start location, sets a target distance (e.g., 8 km), optionally applies terrain/safety filters, and receives several ranked loop or out-and-back routes whose real length is close to the target, drawn on a map and exportable to GPX / navigation.

**Feasibility verdict: clearly feasible with a near-zero third-party cost structure.** The hard part — "give me an N-km loop from here," which no mainstream A-to-B API answers directly — is solved in the open-source world: GraphHopper (Apache 2.0) ships a native `round_trip` algorithm, openrouteservice exposes the same capability on a free hosted API (good for prototyping), and the academic literature (Gemsa et al. 2013; Lewis & Corcoran 2024) provides well-benchmarked techniques to push distance accuracy to ±10% with sub-second to few-second compute. The commercial giants are ruled out on merit, not just cost: Google and Mapbox offer neither loop generation nor surface filtering, and Strava/komoot/AllTrails data is contractually or practically unavailable.

**Recommended core stack (justified in §5):** responsive React web app (installable PWA) + MapLibre GL JS + OpenFreeMap tiles + a thin TypeScript backend orchestrating a self-hosted GraphHopper instance (regional OSM extracts) with a multi-seed candidate-generation and scoring layer on top of `round_trip`. A native iOS app (Expo/React Native + MapLibre Native, per the retained rev. 2 analysis) follows on the unchanged API once web usage validates demand. Total fixed infrastructure cost for a region-limited MVP: one VPS (~€10–40/month). No per-request routing fees and no platform fees until the native phase.

The single biggest technical risk is **distance accuracy of naive round-trip calls** (a single GraphHopper `round_trip` call can miss the target by 20–50%, because the distance parameter is treated as beeline between generated via-points). The mitigation — generate many candidates across seeds/headings, filter by realized distance, score and rank — is well understood and is exactly what Phase 0's spike must validate before the architecture is committed. The second biggest risk is **OSM attribute sparsity** (only ~30–40% of ways carry a `surface` tag globally; `lit` is far worse), which caps how honest some filters can be; the filter design in §4 handles this with a three-tier "hard / soft / best-effort" model.

---

## 1. Requirements clarification

### 1.1 Decisions already made (from product owner)

| Topic                        | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Platform                     | **[DECIDED — rev. 3]** Web-first MVP: a responsive, installable web app (PWA) that runs on any phone, including the owner's iPhone via Safari. Rationale: simplest development experience, no platform-specific requirements while the core algorithm is validated, fully automatable end-to-end testing (Playwright in CI), continuous deployment with no store review, and beta distribution to anyone via a URL. Native mobile follows once the product is validated. |
| Cost stance                  | **[DECIDED]** Prefer free/open-source: OpenStreetMap data, self-hosted or free-tier routing. Avoid per-request commercial API fees.                                                                                                                                                                                                                                                                                                                                      |
| Release order                | **[DECIDED — rev. 3]** Web MVP → native iOS (owner's device is an iPhone; the rev. 2 iOS analysis — EAS pipeline, TestFlight ladder, App Review discipline, $99/yr — applies verbatim when that phase starts) → Android, gated on an Android validation path.                                                                                                                                                                                                            |
| Deliverable of this exercise | **[DECIDED]** This single planning document; implementation follows separately (Claude Code, autonomous, CI/CD best practice).                                                                                                                                                                                                                                                                                                                                           |

### 1.2 Ambiguities identified, with working assumptions

Each item below materially affects design. Where the brief was silent, a working assumption is recorded so implementation is never blocked; all are cheap to revisit before Phase 1 starts.

**Route topology — loop vs. out-and-back vs. one-way.** The brief says "a loop and/or out-and-back path." **[ASSUMED]** Loops are the primary product (that is what travelers can't easily improvise); out-and-back is a first-class _fallback_ offered automatically when the network can't support a good loop (sparse rural networks, waterfronts, dead-end valleys) and available as an explicit user toggle. One-way point-to-point ("run to my hotel") is out of scope for MVP but the architecture must not preclude it — it is just A-to-B routing, the easy case.

**Distance tolerance.** **[ASSUMED]** A returned route is "acceptable" within **±10%** of target (matching the ε used in the jogging-routes literature) and "good" within **±5%**. The UI always shows the _actual_ distance prominently; we never pretend a 8.7 km route is "8 km." If no candidate lands within ±10%, the app says so and shows the nearest misses (see §6 edge cases) rather than failing.

**Number of results and ranking.** **[ASSUMED]** Return a ranked list of **3–5 candidates** (mirroring Garmin's up to-3 and Trail Router's multi-candidate UX), not a single "best" route. Travelers want to eyeball options on a map; ranking criteria in §3.4. A "shuffle / more like this" action regenerates with new seeds.

**Elevation / difficulty.** **[ASSUMED]** In scope as _display_ information from MVP (elevation profile per candidate, computed from free DEM data) and as a _filter/preference_ ("flat" vs "don't care" vs "hilly") in Phase 2. Not a hard constraint in MVP.

**Offline.** **[ASSUMED]** MVP is online-required for route _generation_ (it needs the routing graph). However, a generated route must remain fully usable offline after generation — the route geometry, cue sheet, and a cached map snapshot are stored on-device, because travelers routinely lose data coverage mid-run and may be roaming. On the web MVP this is a service-worker + IndexedDB concern (cache the generated route and a best-effort tile corridor); it works, but it is the least robust corner of the PWA platform on iOS Safari and gets first-class treatment in the native phase. Full offline generation (on-device graph à la BRouter) is a researched Phase 4 option, not MVP.

**Accounts, saved routes, history.** **[ASSUMED]** No accounts in MVP. Locally saved/favorited routes and run history: local-only in Phase 2, optional cloud accounts in Phase 3. This keeps MVP free of auth, privacy-policy, and GDPR surface area — significant for a solo/small project.

**Navigation.** **[ASSUMED]** MVP provides map display + GPX export (usable in Garmin/Apple Watch/komoot/any nav app) and a simple "follow along" screen (user's live position on the route polyline). Turn-by-turn voice navigation is Phase 3 — it is a large, separable subsystem.

**Geography at launch.** **[DECIDED — 2026-07-25]** Launch region is **Europe**; the Phase 0 spike targets the **Sweden** extract (Denmark executed as the CI-runner fallback — see STATUS.md). A planet-scale graph is feasible (~40–60 GB RAM for GraphHopper) but pointlessly expensive for validation; expand region-by-region when justified. This choice affects server sizing only, not code.

**Monetization.** **[OPEN]** Not needed for architecture now, but note: several "free" hosted tiers used for prototyping (openrouteservice, Stadia free, MapTiler free, GraphHopper free) are **non-commercial only**. The recommended production stack (self-hosted GraphHopper + OpenFreeMap tiles) is safe for commercial use, so monetizing later does not force a replatform. Revisit if any non-recommended component is swapped in.

**Success criteria for the core feature [ASSUMED — confirm alongside open question 3]:** for ≥90% of start points sampled in urban/suburban launch-region locations and targets of 3–21 km, the app returns ≥3 loop candidates with at least one within ±10% of target, in <3 s p95 server time; route overlap (repeated-segment share) <20% median for loops.

---

## 2. Data and routing sources

All facts below were verified against current (mid-2026) documentation and pricing pages; sources are listed in Appendix A.

### 2.1 The decisive capability: round-trip generation and per-request way filtering

| Engine / API                   | Target-distance loop generation                                                                                                    | Surface/way-type filtering                                                                                                                                                                           | Hosted free tier                                                                                                                                                                                                                                                                                                                  | Self-host                                                                          | License                                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **GraphHopper (OSS + hosted)** | **Yes** — `algorithm=round_trip` (`round_trip.distance`, `round_trip.seed`, `heading`); needs flexible mode (`ch.disable=true`)    | **Yes** — per-request `custom_model` JSON over encoded values: `surface`, `road_class`, `road_environment`, `smoothness`, `hike_rating`, `foot_network`, `average_slope`; GeoJSON avoid/prefer areas | 500 credits/day, **non-commercial, and free tier excludes flexible mode → hosted round-trip effectively requires a paid plan** (round_trip = 2 credits; Basic €69/mo, 5k credits/day)                                                                                                                                             | Java; region extract trivially, planet ≈ 40–60 GB heap                             | **Apache 2.0**                                                                                                         |
| **openrouteservice (HeiGIT)**  | **Yes** — directions `options.round_trip {length, points, seed}` on `foot-walking`/`foot-hiking`, works on the **free hosted API** | `avoid_features`, `avoid_polygons`, **green/quiet weightings** for foot profiles, `extra_info` returns per-segment surface/waytype/steepness/green/noise                                             | **2,000 directions req/day, 40/min, free** (Standard plan)                                                                                                                                                                                                                                                                        | Docker; engine is a GraphHopper 4.0 fork; planet builds are slow (~2 days/profile) | GPL-3.0 (server-side use imposes no obligations on us)                                                                 |
| **Valhalla**                   | No native loop feature                                                                                                             | **Excellent per-request costing**: `walkway_factor`, `sidewalk_factor`, `alley_factor`, `use_lit`, `use_tracks`, `max_hiking_difficulty` (sac_scale), dynamic, no rebuild                            | No first-party hosting (Stadia et al. resell, no loop feature)                                                                                                                                                                                                                                                                    | Lightweight tiled graph; runs on small machines and even on-device                 | MIT                                                                                                                    |
| **OSRM**                       | No (its `/trip` is TSP over given waypoints — different problem)                                                                   | Compile-time Lua profiles only (rebuild to change preferences)                                                                                                                                       | Demo server only, no SLA                                                                                                                                                                                                                                                                                                          | ~55 GB RAM planet runtime                                                          | BSD-2                                                                                                                  |
| **BRouter**                    | **Yes** — round-trip mode (`roundtripDistance`, `direction`, `allowSamewayback`) since PR #759                                     | Most expressive tag-level cost scripting (`.brf` profiles: any OSM tag incl. `sac_scale`, `trail_visibility`)                                                                                        | Free community server (best-effort)                                                                                                                                                                                                                                                                                               | Very light (rd5 segment files, <1 GB RAM class); **runs on-device on Android**     | MIT                                                                                                                    |
| **Google Routes API**          | No                                                                                                                                 | No                                                                                                                                                                                                   | 10k free calls/mo then $5/1,000 (Essentials); walking mode is officially **beta** with a mandated user-facing warning                                                                                                                                                                                                             | n/a                                                                                | **ToS blocker: Google routes may not be displayed on a non-Google map; no caching; no building from elevation values** |
| **Mapbox Directions**          | No (Optimization API is TSP, not loop generation)                                                                                  | No surface preference                                                                                                                                                                                | 100k req/mo free, then $2/1,000; mobile SDK billed per MAU (25k free)                                                                                                                                                                                                                                                             | n/a                                                                                | Proprietary; display on Mapbox SDKs                                                                                    |
| **komoot**                     | (product has it)                                                                                                                   | (product has it)                                                                                                                                                                                     | **No public API** — partner-only (post-Bending-Spoons acquisition, unchanged)                                                                                                                                                                                                                                                     | n/a                                                                                | n/a                                                                                                                    |
| **Strava**                     | (product has it via Routemaster + heatmap)                                                                                         | —                                                                                                                                                                                                    | API exists but **API Agreement (current text updated Jun 2026, tightened since Nov 2024) prohibits competitive/replicative use and showing a user's data to anyone but that user; AI/ML-use prohibition present in the Nov 2024 text (re-verify exact wording in current text if ever relied on); Global Heatmap not licensable** | n/a                                                                                | Contractual dead end                                                                                                   |
| **AllTrails**                  | —                                                                                                                                  | —                                                                                                                                                                                                    | **No public developer API** (AI-assistant end-user integrations only)                                                                                                                                                                                                                                                             | n/a                                                                                | Dead end                                                                                                               |

### 2.2 Analysis

**The OSM ecosystem is the only viable base, and it is a good one.** This is not merely the cheap option: GraphHopper and openrouteservice are the only production-grade server APIs, free or paid, that natively answer "N-km loop from here" (BRouter also has a round-trip mode, but its community server is best-effort and its orientation is on-device). Google's walking routing is beta-labeled, loop-incapable, surface-blind, and its ToS (no display on non-Google maps, no caching) is incompatible with a MapLibre-based app and with our candidate-caching design. Strava's 2024 API agreement explicitly prohibits building anything competitive to Strava's own route suggestions and any AI/ML use of its data — treat Strava strictly as a potential _export target_ (Phase 3 "send to Strava"), never a data source. komoot and AllTrails have no public APIs at all.

**Recommended primary engine: self-hosted GraphHopper.** Reasons: native `round_trip` in the open-source core (Apache 2.0, no copyleft concerns, no usage caps); the `custom_model` JSON gives per-request, no-rebuild control over surface/way-class preferences — exactly the shape our filter system needs (§4); isochrone endpoint included (needed for the isochrone-based generation strategy, §3.3); modest hardware for regional extracts; weekly-refreshable OSM data on our own schedule. The credible alternative, self-hosted openrouteservice, is itself a GraphHopper fork and adds green/quiet weightings, but is heavier to operate and GPL-3.0 (harmless server-side, but Apache 2.0 keeps future options — e.g., embedding the engine on-device — unencumbered).

**Prototyping shortcut: openrouteservice's free hosted API.** 2,000 directions requests/day with `round_trip` support and per-segment `extra_info` is ample for the Phase 0 algorithm spike — we can measure candidate quality across cities before standing up any infrastructure. Its non-commercial Standard plan is fine for a spike; it must not remain in the production path.

**Secondary engines worth keeping in the toolbox:** BRouter (MIT, tiny footprint, on-device capable, own round-trip mode) is the leading option if Phase 4 offline generation is pursued; Valhalla's pedestrian costing (`use_lit`, sac_scale caps) is the reference design for safety-oriented filters and a candidate replacement engine if GraphHopper's custom models prove limiting.

**Data quality reality check (shapes §4 and §7).** OSM pedestrian _geometry_ is strong and improving fast in cities (2024 saw record footway growth in US cities), but _attributes_ lag: globally only ~30–40% of road-network length carries `surface` (Europe ≈ 37%; near-100% on major roads but ~40–44% on pedestrian-relevant `steps`/`service` classes), and `lit` is sparsely and inconsistently mapped with no reliable completeness data. Trail-specific tags (`sac_scale`, `trail_visibility`) are enthusiast-mapped: good in the Alps, patchy elsewhere. Consequence: filters must degrade honestly (§4.3), and route _popularity_ data of the kind Strava/Garmin use as a quality/safety proxy is simply not available to us — greenery and way-class heuristics are our substitute.

**Supporting data sources (all free, all commercial-use-safe):**

- **Map tiles:** OpenFreeMap — free hosted OSM vector tiles, no key, no view limits, commercial use explicitly allowed; self-hostable as a fallback. (MapTiler/Stadia free tiers are non-commercial — usable in dev only. Protomaps/PMTiles is the self-host alternative at pennies of cost.)
- **Elevation:** Terrain Tiles on AWS Open Data (terrarium PNG, global, free) for profiles and hillshade; Open Topo Data (self-hosted Docker, SRTM/Copernicus GLO-30) for server-side batch lookups. Copernicus GLO-30 is the best free global 30 m DEM.
- **Enrichment (green/park/water polygons for scoring):** OSM extracts via Geofabrik processed into PostGIS — the Trail Router approach (precomputed "green index" per way). Overpass API only for small ad-hoc lookups (fair use ~10k queries/day), never in the hot path.
- **Geocoding (address → point) & reverse:** Photon (Komoot's open-source geocoder, self-hostable) or Nominatim (public instance: strict fair-use, 1 req/s — acceptable for MVP's low volume, self-host when it isn't).

**Licensing obligations we accept:** OSM data is ODbL — we must attribute ("© OpenStreetMap contributors") in the map UI, and if we systematically improve/derive a database from OSM data (e.g., our green index) it is a derivative database subject to share-alike if publicly redistributed; internal use in producing routes is fine. OpenFreeMap requires its attribution line. These are UI-footer-level obligations, not architectural ones.

---

## 3. Core algorithm

### 3.1 Problem statement and what theory says

Formally: given the pedestrian graph, start node s, target length L, find closed walks through s with realized length in [L(1−ε), L(1+ε)] maximizing route quality (low repeated-edge share, attractive/safe ways, sane turn structure). Every exact variant is NP-hard (Gemsa/Pajor/Wagner/Zündorf, SEA 2013 — reduction from Hamiltonian cycle), so all practical systems are heuristics. The literature and production systems converge on a small set of strategies, and crucially the 2013 paper already demonstrated ε = 10% with 93–98% success at 150–450 ms per query on a city graph — the accuracy/latency budget we assumed in §1.2 is grounded, not aspirational.

Geometric intuition used by everyone: a loop of length L is roughly a circle of circumference L, radius r = L/2π; an out-and-back reaches r = L/2 along the network. Because street networks detour (typical detour factor 1.2–1.4× beeline), any beeline-based construction must be shrunk by a learned scale factor and then corrected by measurement.

### 3.2 Candidate strategies evaluated

**(a) Engine-native round trip (GraphHopper `round_trip` / ORS `options.round_trip`).** How it actually works (verified in GraphHopper source): it places 2–3 via-points (for running distances) on a circle around the start at equal angular steps from a seed-random initial heading, snaps them to the network, then routes the legs with a 5× penalty on already-used edges to suppress out-and-backs. Strengths: one call, tens–hundreds of ms, battle-tested snapping/retry logic, decent loop shapes. Critical weakness: **`round_trip.distance` is treated as construction-geometry distance, not realized route length** — single-call error of ±20–50% vs target is commonly reported; the maintainers' own recommended workaround is "many seeds, then filter by actual distance." Also only one tour per call and no notion of "nice."

**(b) Via-point sampling owned by us (Trail Router v1 / run_map pattern).** We construct the candidate geometry ourselves — k points on a circle (or ellipse biased toward a heading, park, or waterfront), snap, route legs A→P1→…→A with plain A-to-B calls — sweeping headings (e.g., every 30–45°) and radii (scale-factor-corrected, then adjusted by measured error per attempt). Strengths: full control (heading bias, anchor points on green-space perimeters — Trail Router's v2 trick), embarrassingly parallel, works on any engine. Weakness: we own snapping failures and the repeated-edge problem (mitigate by requesting alternatives and penalizing reuse in scoring since we can't inject edge penalties through the public API — but self-hosted GraphHopper _does_ let us keep using its round_trip machinery per-leg, or custom areas).

**(c) Isochrone-based construction (Lewis & Corcoran, SN Computer Science 2024 — best published accuracy).** Request a distance-isochrone at range L/2 around the start (one cheap one-to-many Dijkstra); for out-and-back: pick contour points and route there and back — length ≈ L by construction; for loops: inscribe n-gons inside the isochrone polygon, route their vertices, remove out-and-back spurs, and correct residual error by regressing realized length on polygon perimeter. Published benchmarks: best-in-class distance accuracy, 5–15% overlap, ~2–3 s including API latency, few API calls. GraphHopper self-hosted provides the required isochrone endpoint.

**(d) Full custom graph algorithm (Gemsa et al. Greedy-Faces/Partial-Shortest-Paths, or greedy bearing-walks on OSMnx).** Best possible quality ceiling and the only path to true joint optimization, but it means owning a routing graph in-process (memory, OSM update pipeline, snapping, turn restrictions) — months of engineering the other strategies get for free. Not justified before product validation.

### 3.3 Recommended algorithm: layered generate-and-test

The MVP algorithm is a **candidate-generation + filter + score pipeline** on top of self-hosted GraphHopper, structured so each layer can be upgraded independently:

1. **Generate (fan-out).** Fire N parallel `round_trip` calls (N ≈ 8–16) across seeds and forced initial headings covering the compass, at engine-distance values pre-corrected by a per-region scale factor (learned online: ratio of realized to requested distance, cached per area). In the same fan-out, when the target is short or the area is sparse, add out-and-back candidates built from strategy (c): distance-isochrone at L/2, route to sampled contour points and back. Each candidate costs one or a few flexible-mode routing calls, ~50–200 ms each, run concurrently against our own engine — no API metering.
2. **Filter (hard gates).** Discard candidates outside distance tolerance (start wide: keep ±20% for ranking context, flag within ±10% as valid), candidates violating hard filters (§4), unroutable/failed snaps, and degenerate loops (repeated-edge share above threshold — computed from returned edge geometry; a "loop" that is 80% out-and-back is relabeled honestly as out-and-back).
3. **Score and rank (soft preferences).** Weighted score over: |realized − target| (dominant), repeated-edge share, soft-filter match (share of distance on preferred surfaces/way classes, from per-edge path details GraphHopper returns), greenery index (Phase 2: PostGIS green-buffer share, the Trail Router technique), elevation gain vs user preference (profile from DEM), turn density. Return top 3–5, de-duplicated by geometric similarity (e.g., Hausdorff distance or edge-set Jaccard) so users see _different_ loops, not five seeds of the same block.
4. **Refine on miss.** If nothing lands in ±10%: one adjustment round re-issuing the nearest candidates with distance parameter scaled by the measured error (the regression trick from strategy (c)); if still dry, degrade honestly per §6.

**Trade-off summary vs. alternatives:** relying on raw engine round-trip alone (a) is cheapest but fails the accuracy requirement; pure (b) or (c) without the engine's round_trip would work but re-implements retry/snap logic the engine already has; (d) is deferred. The layered design uses (a) for cheap diverse loop shapes, (c) for accuracy and out-and-backs, and keeps the door open to (b)'s green-anchored waypoints in Phase 2 and (d) never or late. Because we self-host, the fan-out's 10–30 routing calls per user request cost CPU, not per-call fees — this is precisely why the third-party-API-only variant of this product (each user request = 10–30 metered calls) would be economically fragile, and why the free/OSS stance and the algorithm design reinforce each other.

**Compute budget estimate:** 16 candidates × ~100 ms flexible-mode routing, parallel on 4–8 cores ⇒ well under the 3 s p95 target for the generation stage on a modest VPS, matching both the literature's numbers and Trail Router's observed behavior. Caching (§5.3) removes repeat cost for popular start areas (hotels, city centers — exactly where travelers cluster).

### 3.4 Ranking defaults **[ASSUMED]**

Initial weights (to be tuned in Phase 2 against human judgment): distance closeness 40%, repeated-edge share 20%, soft-filter/surface match 15%, greenery 15%, turn density 5%, elevation preference 5%. The scorer is a pure function over per-edge annotations — trivially unit-testable and safely tunable without touching generation.

---

## 4. Filtering system

### 4.1 Representation

Filters are a declarative object on the route request, split by enforcement semantics:

```
preferences: {
  route_type: "loop" | "out_and_back" | "either",
  distance_m: 8000,
  tolerance: 0.10,                       // not user-facing; widens as f(distance) for long targets (e.g. max(10%, 2km/L))
  hard: {                                // never violated
    avoid: ["motorway", "trunk", "primary_no_sidewalk", "ferries"],  // steps: soft-avoid (below), not hard — runners tolerate occasional steps
    max_sac_scale: 1,                    // no alpine scrambling by default
    avoid_polygons: [ ... ]              // future: user-drawn no-go areas
  },
  soft: {                                // preferences, weighted in scoring
    surface: "paved" | "unpaved" | "any",          // MVP (Phase 1)
    avoid_steps: true,                             // MVP (Phase 1)
    prefer: ["parks_green", "waterfront", "dedicated_paths"],  // Phase 2
    lighting: "prefer_lit" | "any",                // Phase 2+, best-effort tier, see 4.3
    hills: "avoid" | "any" | "seek"                // Phase 2
  }
}
```

### 4.2 Mapping to the engine

Self-hosted GraphHopper makes this clean: **hard avoids** compile to `custom_model` statements that multiply priority by 0 (e.g., `road_class == MOTORWAY → priority × 0`) plus profile choice (`foot` vs `hike`, which already encodes `sac_scale` handling via `hike_rating`); **soft preferences** compile to priority multipliers <1 on dispreferred values (e.g., `surface == GRAVEL → priority × 0.6` when the user wants paved) — influencing generation — _and_ are re-measured in the scoring layer from the per-edge path details (`surface`, `road_class`, `road_environment`, `smoothness`, `foot_network`) the engine returns, so ranking reflects what the route actually is, not what the weighting hoped. Green/waterfront preference is a scoring-layer feature backed by the Phase 2 PostGIS green index (precomputed buffered-intersection share per way, the published Trail Router method), optionally fed back into generation as anchor points for via-point sampling. Elevation preference uses per-route gain computed from the DEM tiles plus GraphHopper's `average_slope` encoded value for generation-time discouragement of steep ways.

One engineering consequence to plan for: custom models require flexible (non-CH) routing — already true for round_trip — and each _distinct_ set of generation-time weights is a distinct query-time cost, so the number of generation-time weight combinations is kept small (a handful of canonical "modes"), with fine-grained personalization applied in scoring only. This keeps latency flat and cache keys tractable.

### 4.3 Honest feasibility tiers per filter

| Filter                                     | Tier                              | Basis & caveat                                                                                                                                                                                                                                                         |
| ------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Avoid motorways/trunk roads                | **Reliable (hard)**               | `highway=*` classification is essentially complete worldwide.                                                                                                                                                                                                          |
| Prefer dedicated foot/trail infrastructure | **Reliable (soft)**               | Geometry of `footway/path/pedestrian/track` is well mapped in cities; rural trail completeness varies by country.                                                                                                                                                      |
| Loop vs out-and-back                       | **Reliable**                      | Our own construction + repeated-edge measurement.                                                                                                                                                                                                                      |
| Paved vs unpaved                           | **Usable with disclosure (soft)** | `surface` present on only ~30–40% of way-length globally (Europe ≈ 37%). Untagged ways get class-based inference (e.g., `residential` ⇒ paved likely, `track` ⇒ unpaved likely) and the UI shows a "surface partly unknown" note with the % of route on inferred data. |
| Avoid roads without sidewalks              | **Partial**                       | `sidewalk=*` tagging is patchy; approximate via way-class + `foot_network`; do not present as a guarantee.                                                                                                                                                             |
| Elevation gain preference                  | **Reliable (soft)**               | Free 30 m DEM everywhere; smoothing needed to avoid noise on short routes.                                                                                                                                                                                             |
| Green/park routing                         | **Reliable (soft, Phase 2)**      | Landuse/leisure polygons are well mapped; method published (Trail Router).                                                                                                                                                                                             |
| Lit paths / night safety                   | **Best-effort only**              | `lit` is sparse and unverifiable; Valhalla's own `use_lit` defaults to 0 for a reason. Ship as "prefer lit _where data exists_" with explicit wording; never market as a safety guarantee. Liability-sensitive — see §7.                                               |
| Traffic exposure                           | **Proxy only**                    | No free traffic-volume data; proxy = road class + `maxspeed`. Honest label: "prefers quieter road types."                                                                                                                                                              |
| "Safe area" routing (crime etc.)           | **Out of scope**                  | Data unavailable/inequitable across regions; research-grade only (cf. 2025 sensory-mapping paper). Do not attempt.                                                                                                                                                     |

---

## 5. Architecture and tech stack

### 5.1 Shape: thin client, one backend service, self-hosted engine

```
┌─────────────────────────────┐
│  Web app (React + Vite,     │  MapLibre GL JS map, OpenFreeMap vector tiles,
│  TypeScript, installable    │  route display, filters UI, GPX download/share,
│  PWA — native iOS app joins │  service-worker cache of generated routes
│  later on the same API)     │
└──────────────┬──────────────┘
               │ HTTPS/JSON (OpenAPI-defined)
┌──────────────▼──────────────┐
│  Route service (Node/       │  request validation · candidate fan-out ·
│  TypeScript, Fastify)       │  filter/score/dedupe/rank · scale-factor learning ·
│                             │  GPX generation · caching
└───────┬──────────┬──────────┘
        │          │
┌───────▼───────┐ ┌▼──────────────────┐   ┌─────────────────────────────┐
│ GraphHopper   │ │ Postgres+PostGIS  │   │ External (all free):        │
│ (Docker,      │ │ (Phase 2+: green  │   │ OpenFreeMap tiles (client), │
│ regional OSM  │ │ index, saved      │   │ AWS Terrain Tiles (elev.),  │
│ extract, foot │ │ routes) + cache   │   │ Photon/Nominatim geocoding  │
│ +hike, flex)  │ │ (Redis or PG)     │   └─────────────────────────────┘
└───────────────┘ └───────────────────┘
```

**Why a backend at all** (vs. client → routing engine directly): the fan-out/score/dedupe algorithm is iterative and chatty — running it server-side next to the engine turns 10–30 network round-trips into local calls; it centralizes caching and the learned scale factors; it hides the engine so we can swap GraphHopper/Valhalla/BRouter or change custom models without an app release; and it gives one place for abuse control. The client stays thin: map, forms, and rendering of a fully-resolved response.

**Why these components:**

- **React + Vite + TypeScript (installable PWA)**: one language across client and backend (a real advantage for a single autonomous agent codebase); instant builds and deploys as static assets; and — the decisive property for autonomous development — the entire UI is exercisable by **Playwright in CI**: real end-to-end tests with mocked geolocation, screenshots, and per-PR preview URLs, no simulators, no store, no human in the verification loop. Vite over Next.js because this is a client-side map tool against a JSON API; SSR buys nothing. When the native phase starts, **Expo/React Native remains the chosen path** (per the retained rev. 2 analysis: EAS cloud builds need no Mac, mature `@maplibre/maplibre-react-native` binding) and reuses the shared TypeScript domain and api-contract packages — UI components are rebuilt, logic is not.
- **MapLibre GL JS** now, **MapLibre Native** in the native phase (both production-healthy in 2026 — Metal on iOS, Vulkan default on Android): same style spec and the same OpenFreeMap tiles, so all map styling work transfers 1:1 to the native app later; zero license cost, no map-view metering ever. Note Google routes could never legally be drawn here — another reason the Google path was rejected.
- **Fastify/TypeScript service**: small, fast, first-class OpenAPI + JSON-schema validation; the algorithm layer is pure TypeScript with no engine coupling.
- **GraphHopper in Docker** with `foot` and `hike` profiles, flexible mode enabled, weekly OSM refresh (Geofabrik regional extracts) via a scheduled job that builds the graph offline and hot-swaps — build-time RAM for a Europe-scale extract fits a 32–64 GB build host (or build on a temporary cloud VM, ship the graph artifact); the _serving_ footprint for a regional graph is considerably smaller.
- **Postgres + PostGIS** deferred to Phase 2 (green index, persistence). MVP state is stateless + cache.

### 5.2 Deployment & environments

Single VPS (e.g., Hetzner AX/CX class, ~€10–40/mo) running docker-compose (route service + GraphHopper + Caddy for TLS, which also serves the web app's static assets — or put the front end on a free CDN tier like Cloudflare Pages for per-PR preview deploys) is sufficient through MVP and early growth; staging = same compose on a smaller box or a second compose project. Kubernetes is explicitly _not_ warranted at this scale. Horizontal path when needed: the route service is stateless (scale trivially); GraphHopper replicas share a read-only graph volume; regional sharding (one engine per continent extract) before planet-scale RAM.

### 5.3 Caching strategy

Three layers, cheapest first: (1) **client cache** — generated routes persist on-device (IndexedDB via the service worker on web); re-opening a result is free. (2) **Response cache** — key = (snapped-start geohash ~150 m, distance bucket ±250 m, route_type, canonical filter mode); TTL days-to-weeks (OSM changes slowly); travelers cluster at hotels/landmarks, so hit rates in city centers will be meaningful. Serve cached candidates instantly with a "shuffle" escape hatch that bypasses cache with fresh seeds. (3) **Engine-level** — GraphHopper's own landmark/graph caches; plus the per-region learned scale-factor table (small, hot, in-process with periodic persistence). Tile and elevation caching is the client's/CDN's problem (OpenFreeMap/AWS handle it).

### 5.4 Cost model (why this stays near zero)

Fixed: VPS ~€10–40/mo + domain. The web MVP carries **zero platform fees**: the Apple Developer Program ($99/yr) and any EAS build costs are deferred to the native-iOS phase, Google Play's $25 one-time fee later still. Marginal per user request: our own CPU only. Map views: unmetered (OpenFreeMap). Elevation: free tiles. Geocoding: self-host Photon (or Nominatim public within fair use during MVP). The only scenario reintroducing per-request fees is abandoning self-hosting — the architecture exists precisely to avoid that. Compare: the same product on GraphHopper's hosted API at 16 round-trip candidates × 2 credits = 32 credits per user request would exhaust the €69/mo plan at ~150 user requests/day; on Google (if it were even capable) ToS would forbid the map stack entirely.

---

## 6. UX considerations

### 6.1 Primary flow — "I'm here, give me 8 km"

Open app → map centered on GPS position via browser geolocation (HTTPS + permission prompt; on denial, fall back to IP-level city centering + manual pin — never a dead end) → distance picker (slider + numeric entry; km/mi per locale; sensible presets 3/5/8/10/15/21 km) → optional: expand filters sheet (route type, surface, avoid busy roads; hills and greenery arrive in Phase 2) → **Generate** → loading state with staged feedback (<3 s target; show "finding loops near you…") → results as a swipeable card stack + all candidates ghost-drawn on the map, selected one highlighted; each card: actual distance (prominent, honest), est. duration at user pace, elevation gain sparkline, surface composition bar, badges ("park-heavy", "12% unknown surface", "out-and-back") → tap to inspect full-screen with elevation profile → actions: **Start** (follow-along screen), **Export GPX / Share**, **Shuffle** (new seeds), **Save** (Phase 2).

### 6.2 Secondary flows

**Manual location (the traveler-planning-ahead flow):** search field (geocoder) + long-press-on-map to drop a start pin — must be equal-class to GPS start, since planning tomorrow's run from tonight's hotel is a core persona behavior. **Route-type toggle** loop/out-and-back/either. **Follow-along:** position dot on polyline, distance done/remaining, off-route indicator (>~50 m from polyline → gentle banner, no rerouting in MVP), works offline once generated, keep-screen-on via the Wake Lock API (supported in iOS Safari 16.4+). Web reality stated plainly in-app: a browser cannot track position with the phone locked, so the in-run screen is a screen-on experience — serious runners use the GPX on a watch; this ceiling is a headline reason the native phase exists. An "add to home screen" prompt makes the PWA feel app-like for returning users. **Export:** GPX file via download and the Web Share API where available (`navigator.share` reaches the iOS share sheet from Safari, so hand-off to Garmin/Apple Watch/komoot/Strava apps works from the web app); "open in Google/Apple Maps" is deliberately absent for loops (those apps can't represent them; GPX is the interoperable path).

### 6.3 Edge cases and honest-failure design

| Case                                               | Behavior                                                                                                                                                                                                                                              |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| No candidate within ±10%                           | Never fail silently: show nearest misses labeled "closest we found: 6.9 km (target 8)", offer out-and-back (which can almost always hit the target by construction), and a one-tap "relax filters" suggestion identifying _which_ filter was binding. |
| Sparse network (rural/resort)                      | Detect low road density around start early (cheap isochrone area check) → set expectations upfront ("limited paths here — out-and-back suggested").                                                                                                   |
| Start snaps badly (user inside a park, mall, pier) | Show the snapped start point explicitly with "route starts 120 m from you" and allow dragging it.                                                                                                                                                     |
| GPS inaccuracy / cold fix                          | Use last-known + accuracy radius; if accuracy > ~100 m, prompt to confirm or drop pin manually.                                                                                                                                                       |
| Outside supported region (MVP)                     | Clear coverage message + waitlist/telemetry signal to guide region expansion.                                                                                                                                                                         |
| Degenerate "loop" (mostly doubled path)            | Relabel honestly as out-and-back rather than presenting a fake loop.                                                                                                                                                                                  |
| Unknown surface share is high                      | Badge on card ("surface data limited here") — trust through disclosure, especially critical for a traveler in an unfamiliar place.                                                                                                                    |
| Offline / flaky data mid-run                       | Generated route fully cached on device (service worker + IndexedDB; best-effort tile corridor pre-cache); follow-along never needs network. Generation offline → clear message, show saved routes.                                                    |
| Very long targets (>~30 km)                        | Allowed but with adjusted expectations messaging (fan-out uses more via-points; tolerance widens).                                                                                                                                                    |

Accessibility & safety notes: dark mode for pre-dawn runners; large touch targets (sweaty hands); the lighting filter is worded as preference, never assurance (§4.3, §7).

---

## 7. Risks, unknowns, and cost drivers

**R1 — Distance-accuracy of loop generation (highest technical risk).** Naive engine round-trip misses by ±20–50%; our whole answer is the fan-out/filter/score layer (§3.3). _Mitigation:_ Phase 0 spike with quantitative acceptance gates before any product code; isochrone method as accuracy backstop; out-and-back as guaranteed-accuracy fallback. _Residual risk:_ low — three independent published/production approaches hit ±10%.

**R2 — OSM data quality variance by region.** Surface ~30–40% tagged; `lit` sparse; rural trail mapping uneven; a bad route in a poorly-mapped area is a bad first impression for exactly our persona (traveler in an unknown place). _Mitigation:_ honest disclosure UX (§6.3), class-based inference, region-limited launch in well-mapped geography (Europe), telemetry on generated-route quality per region to steer expansion. _Residual:_ medium — inherent to the data commons; also improves monotonically over time.

**R3 — Safety/liability of routing suggestions.** We may route someone along a dark canal or an unofficial trail. _Mitigation:_ conservative defaults (avoid trunk/motorway always, sac_scale cap), preference-not-guarantee wording for lighting/safety filters, in-app disclaimer at first run, no "safest route" marketing claims ever. This is a product-wording discipline as much as an engineering one.

**R4 — Self-hosting operational burden.** OSM refresh pipeline, graph builds, one more server to babysit — the price of zero marginal cost. _Mitigation:_ weekly automated build-and-swap job with health gates; infra-as-code from day one so rebuild-from-scratch is one command. The ORS hosted API is an emergency fallback **only while the app is non-commercial (beta)** — its free tier is non-commercial and 2k directions/day ≈ only ~100 user requests/day at our fan-out — after monetization the honest degradation is "service temporarily unavailable," which the IaC one-command rebuild keeps short. _Cost driver to watch:_ RAM if/when expanding toward planet coverage — expand region-by-region instead.

**R5 — Mobile-web ceiling on the in-run experience (the price of web-first).** A browser cannot track location in the background: lock the phone and follow-along pauses. Wake Lock, service-worker offline caching, and home-screen install all work on iOS Safari (16.4+) but are the flakiest corner of the web platform, and there is no store presence for discoverability. _Mitigation:_ the MVP's core value — generate, compare, export GPX — is fully web-strength, and the in-run job is delegated to watches/nav apps via GPX; follow-along ships as an honest screen-on experience; the thin-client architecture keeps the eventual native port small. _What web-first buys in exchange:_ full Playwright end-to-end automation in CI (the whole verification loop is autonomous — no simulators, no TestFlight, no human gate), continuous deployment with zero review latency, zero platform fees during validation, and beta testing on any device via a URL. _Watch item:_ heavy follow-along usage on the web app despite its limits is the demand signal that triggers the native phase (open question 9). — _Retained for that phase (from rev. 2):_ Apple's pipeline discipline — App Review buffers, Beta App Review on external TestFlight, location purpose strings, App Privacy declarations, EAS cloud builds needing no Mac, TestFlight internal as the fast loop, OTA updates for JS-layer fixes, foreground-only location until turn-by-turn, and the one-iPhone physical test lab constraint.

**R6 — Free-tier/licensing drift.** OpenFreeMap is donation-funded; hosted free tiers used in dev are non-commercial. _Mitigation:_ everything hosted-free has a self-host twin already identified (Protomaps/self-hosted tiles, Photon, Open Topo Data); licensing constraints are recorded per component in this doc; nothing in the production path has per-request fees or non-commercial terms.

**R7 — Scope creep toward a fitness platform.** Accounts, social, training plans, turn-by-turn voice — each is a large subsystem adjacent to the core value. _Mitigation:_ the phase gates in §8; MVP ships with zero auth surface.

**Open questions needing a human decision (consolidated):**

1. ~~Launch region set~~ **RESOLVED [DECIDED, 2026-07-25]: Europe** at launch; Phase 0 spike extract = **Sweden**.
2. ~~Release order~~ **RESOLVED [DECIDED, rev. 3]: web-first MVP**, then native iOS (rev. 2 analysis applies at that point), then Android behind its validation gate. What _triggers_ the native phase is open question 9.
3. ~~Confirm ±10% tolerance and 3–5 results~~ **RESOLVED [DECIDED, 2026-07-25]: confirmed as product defaults.**
4. Monetization intent (affects nothing now; affects tier choices later).
5. App name / branding (needed for store metadata by Phase 3 release prep).
6. ~~Web app timing~~ **RESOLVED [DECIDED, rev. 3]:** the web app _is_ the MVP. The open timing question now concerns the native iOS app (question 9).
7. When/how to stand up the Android validation path (native phase): recruit a handful of Android beta testers, or acquire one cheap test device? Until then Android is build-green but ship-blocked. (Note: the web app already serves Android users in the meantime — softening this gap considerably.)
8. **Deferred to the native-iOS phase:** enroll in the Apple Developer Program ($99/yr) under the owner's Apple ID and hand EAS an App Store Connect API key — a one-time manual step Claude Code cannot do autonomously; under web-first this no longer blocks anything in Phases 0–2.
9. **Native-phase trigger:** what web-MVP signal starts the native iOS build? Proposed: a data threshold, not a calendar date — sustained real usage of the generate/export flows plus evidence of follow-along demand (R5 watch item).

---

## 8. Implementation plan

Execution model: autonomous implementation by Claude Code, trunk-based development, every phase gated by measurable acceptance criteria and demoable artifacts. CI/CD is set up in Phase 0 _before_ feature code, so every subsequent commit flows through the full pipeline. Timeboxes assume one autonomous agent working sequentially; they are gates of scope, not calendar promises.

**Accepted implementation deviations:** the generation endpoint is `POST /v1/routes/generate` (not the `POST /routes:generate` written below) — Fastify treats `:` in a path as a route-parameter marker, and the `/v1` prefix gives contract versioning for free. Accepted 2026-07-25; the OpenAPI contract in `packages/api-contract` is authoritative. ORS hosted validation in CI is gated on an `ORS_API_KEY` secret and skipped silently when absent.

### Phase 0 — De-risking spikes & engineering foundation (gate: algorithm go/no-go)

The route-generation spike comes first because §3's design is the only load-bearing unknown; nothing else deserves architecture commitment until it's measured.

**0.1 Route-generation quality harness (the critical spike).**

- Scripted harness (TypeScript, no UI) that, for a matrix of ~30 start points (urban core / suburban / rural / waterfront across 3–4 European cities + 1 sparse area) × distances {3, 5, 8, 10, 21 km} × {loop, out-and-back}, generates candidates via (i) ORS hosted `round_trip` (free tier, zero setup) and (ii) local GraphHopper Docker with a country extract, using the §3.3 fan-out. (First action of the spike: confirm at ORS signup that `round_trip` is enabled for foot profiles on the hosted API and the exact current daily quota — docs say 2,000/day but plan details now live behind the HeiGIT account portal.)
- Metrics per cell, emitted as a JSON/CSV report + rendered HTML map gallery for human eyeballing: realized-vs-target error distribution, % of cells with ≥3 candidates and ≥1 within ±10%, repeated-edge share, latency, failure taxonomy.
- **Acceptance gate (go/no-go):** ≥90% of urban/suburban cells produce ≥1 candidate within ±10% with p95 generation latency <3 s locally. If missed: iterate scale-factor correction and isochrone method (both already specified) before touching product code.

**0.2 Filter-behavior spike.** Verify `custom_model` surface/road-class weighting on the local engine produces materially different routes, and measure unknown-surface share per route from path details (validates §4.3 disclosure design).

**0.3 Engine ops spike.** Scripted graph build for the chosen launch extract: measure build time/RAM/disk, implement build→healthcheck→hot-swap, document the runbook.

**0.4 Engineering foundation (parallel to spikes).**

- Monorepo (pnpm workspaces): `apps/web` (React PWA; `apps/mobile` joins in the native phase), `services/route-api`, `packages/route-core` (pure algorithm+scoring lib), `packages/api-contract` (OpenAPI + generated client), `infra/` (compose, provisioning), `harness/` (spike tooling, kept — it becomes the regression suite).
- CI (GitHub Actions) from first commit: lint (eslint+prettier), typecheck, unit tests (vitest) on every PR; integration job spins up GraphHopper via testcontainers with a small pinned OSM fixture (e.g., Liechtenstein/Monaco extract, checked in or cached by hash) and runs **golden-route tests** — fixed seeds + fixed graph ⇒ assert distance-tolerance and scoring invariants, not exact geometries (OSM fixture is pinned, so flakiness is controlled).
- CD: route-api Docker image build on main; deploy to staging VPS on merge (compose pull+up via SSH action or watchtower); production deploy on version tag; secrets in GH environments; Renovate for dependency PRs; conventional commits + changesets for versioning.
- Basic observability wired early: structured logs, Sentry (backend + later mobile), a `/metrics`-style health endpoint including engine graph age.
- **Web deploy pipeline from day one:** the walking skeleton ships as a real URL (static front end + API behind Caddy, or front end on Cloudflare Pages) with per-PR preview deploys, and **Playwright end-to-end tests in CI** (Chromium, mocked geolocation, screenshot assertions) against those previews — the same harness that will guard all UI work. No Apple prerequisites exist in this phase anymore (open question 8 deferred).

**Milestone M0:** spike report with go decision + green CI pipeline on a walking skeleton (health endpoint + placeholder web page live on a public staging URL, Playwright green against it).

### Phase 1 — MVP (gate: end-to-end usable product in launch region)

**1.1 Route service:** `POST /routes:generate` per §4.1 schema → §3.3 pipeline (fan-out, filter, score, dedupe, refine-on-miss) → response with per-candidate geometry (polyline), realized distance, elevation profile (from terrain tiles, server-side), surface composition, badges; `GET /routes/{id}/gpx`; response cache (§5.3); learned scale-factor table; request validation from the OpenAPI contract; rate limiting.
**1.2 Web app (React PWA):** mobile-first responsive map screen (MapLibre GL JS + OpenFreeMap, ODbL attribution), browser-geolocation + drop-pin + geocoder search start selection (with permission-denied fallback), distance picker, minimal filter sheet (route type, avoid busy roads, surface preference), results cards + multi-candidate map display, detail view with elevation profile, GPX download/Web-Share export, follow-along screen (screen-on, Wake Lock, offline-capable from IndexedDB), PWA manifest + service worker + add-to-home-screen prompt, edge-case states per §6.3 (no-result, out-of-region, poor GPS, bad snap, permission denied).
**1.3 Quality:** golden-route CI suite extended to MVP filters; contract tests client↔API from the shared OpenAPI package; Playwright end-to-end flows in CI (launch → mocked geolocation → generate → inspect candidates → GPX download), run in mobile viewports (iPhone-class emulation) with screenshot regression on the map UI; a manual Safari-on-iPhone smoke checklist for the owner covers the few things emulation can't (real GPS, Wake Lock, share sheet); load test of the fan-out path (k6) against staging.
**1.4 Release ops (web-first):** continuous deployment — per-PR previews, staging on merge, production on tag; distribution is a URL (share it with anyone, any device — this _is_ the beta program); analytics kept minimal and privacy-respecting (self-hosted Plausible-class, aggregate only) because open question 9's native-phase trigger needs usage data; privacy page (trivial: no accounts, location processed transiently — state it plainly) and clear geolocation-permission copy. No stores, no review, no signing anywhere in this phase.

**Milestone M1:** production URL generating quality routes across the launch region on any phone (smoke-validated on the owner's iPhone in Safari); success metrics from §1.2 measured by the harness against production infra. **Suggested engineering order:** contract → service pipeline (against fixture graph, test-first) → app screens against staging → edge-case polish. Rough shape: ~60% backend/algorithm, ~40% app.

### Phase 2 — Quality & differentiation (gate: routes are _good_, not just correct-length)

Green/scenic scoring: PostGIS green-index pipeline (buffered intersection share per way, precomputed for launch region; the published Trail Router method) + waterfront detection → scoring weights + "scenic" badge; optional green-anchored via-point generation (§3.2b) as an additional candidate source. Elevation preference filter (flat/any/hilly) + hill-aware generation via `average_slope` custom-model terms. Ranking tuning: side-by-side human evaluation UI in the harness; adjust §3.4 weights from logged shuffle/selection behavior (privacy-safe, aggregate). Local saved routes & history (on-device only). Perf: cache-hit dashboards, dedupe tuning. **Milestone M2:** measurable ranking improvement (human-eval win rate vs M1 ranking on fixed scenarios) + saved routes shipped.

### Phase 3 — Native iOS + reach (gate: public launch readiness; triggered by web-usage data, open question 9)

**Native iOS app** (Expo/React Native + MapLibre Native, reusing `packages/route-core` and `packages/api-contract`; UI rebuilt) against the unchanged API. The retained rev. 2 iOS analysis applies verbatim here: Apple Developer Program enrollment first (human prerequisite with external lead time — open question 8), prove the Linux-CI → EAS → TestFlight → iPhone pipeline with a throwaway build before feature work, TestFlight internal as the iteration loop, OTA updates for JS-layer changes, foreground-only location until turn-by-turn, Maestro flows on EAS-hosted iOS simulators, one buffer cycle for an App Review rejection round. The native app's _reason to exist_ is the web ceiling from R5: real in-run follow-along (locked-screen tracking), robust offline, store discoverability. **Google Play** stays its own gated item behind the Android validation path (open question 7); meanwhile the web app keeps serving Android users. Also in this phase: production hardening (backups, alerting, uptime), region expansion per telemetry demand (additional extracts, possibly second engine shard), optional cloud accounts + route sync (only now does auth/GDPR surface appear — isolate in a separate service or use a managed auth provider; note: offering any third-party sign-in on iOS obligates offering **Sign in with Apple** — email-magic-link or Apple-only avoids the extra provider), export integrations (Strava _upload_ of user's own route via their API remains permissible; komoot via GPX only), basic turn-by-turn (on-route cue generation from the instruction list GraphHopper already returns; voice optional).

**Milestone M3:** native iOS app live on the App Store in launch regions with production monitoring/backup runbooks in place (Play listing follows when the Android gate clears); accounts/turn-by-turn each shipped only if their pull was validated (each is individually cuttable without affecting M3). Phase 4 is intentionally milestone-free — items graduate into a scheduled phase only when justified.

### Phase 4 — Explorations (deliberately unscheduled)

On-device offline generation (BRouter-style embedded engine or GraphHopper mobile build — the Apache/MIT licensing chosen in §2 keeps this open); crowd-sourced route feedback ("this path was flooded/closed") with moderation; watch companions (**watchOS first** — matches the owner's ecosystem and the iOS-first install base; WearOS later) and Apple Health / WorkoutKit route export; community/social features only with strong pull.

### CI/CD principles summary (for the autonomous implementation)

Trunk-based, small PRs, every PR: lint + typecheck + unit + integration-on-fixture-graph; golden-route regression tests are the safety net for all algorithm changes (assert invariants and tolerances, never exact polylines); merges deploy staging automatically, tags deploy production, every PR gets a preview URL with Playwright run against it; from the native phase onward, mobile releases via EAS with OTA for JS-layer changes; infra reproducible from `infra/` (compose + provisioning script) so environments are cattle; secrets only via CI environments; weekly automated OSM data refresh treated as a deployment (build → validate with harness subset → swap → monitor). Definition of done for any feature: tests + docs updated + deployed to staging + demoable.

---

## Appendix A — Key sources

Routing engines & APIs: GraphHopper repo/docs & pricing (github.com/graphhopper/graphhopper; docs.graphhopper.com; graphhopper.com/pricing — round_trip params, custom_model, credit costs, free-tier limits); openrouteservice docs, plans & restrictions (giscience.github.io/openrouteservice; openrouteservice.org/plans, /restrictions — round_trip options, 2,000 req/day free, green/quiet weightings; GPL-3.0); Valhalla API reference & repo (valhalla.github.io — pedestrian costing incl. use_lit; MIT); OSRM repo (github.com/Project-OSRM — /trip is TSP; BSD-2); BRouter round-trip PR #759 & profiles wiki (github.com/abrensch/brouter; poutnikl/Brouter-profiles). Round-trip accuracy caveat: discuss.graphhopper.com threads "roundtrip distance bigger than requested" and "details on round trip calculation".

Commercial constraints: Google Maps Platform pricing & ToS (developers.google.com/maps/billing-and-pricing/pricing — March 2025 tiering; cloud.google.com/maps-platform/terms §3.2.3 no non-Google-map display, no caching; walking beta warning in RouteTravelMode reference); Mapbox pricing (mapbox.com/pricing — Directions 100k free/mo, mobile MAU model); Stadia/Geoapify/MapTiler pricing pages; komoot no-public-API statement (support.komoot.com); Strava API Agreement Nov 2024 + rate limits + heatmap unavailability (strava.com/legal/api; developers.strava.com; communityhub.strava.com); AllTrails support (AI-assistant integrations, no developer API).

Algorithms & prior art: Gemsa, Pajor, Wagner, Zündorf, "Efficient Computation of Jogging Routes," SEA 2013 (i11www.iti.kit.edu/extra/publications/gpwz-ecjr-13.pdf); Lewis & Corcoran, "Fast Algorithms for Computing Fixed-Length Round Trips…," SN Computer Science 2024 (link.springer.com/article/10.1007/s42979-024-03223-3); "Generating constrained length personalized bicycle tours," 4OR 2018; Trail Router architecture write-up (trailrouter.com/blog/how-trail-router-works); Strava Routemaster engineering post (medium.com/strava-engineering/introducing-routemaster-ccecbb47be86); Garmin Round-Trip Course Creator & Trendline docs (garmin.com); run_map (github.com/ben-eysenbach/run_map); sensory-mapping running-routes paper (arxiv.org/html/2505.05817v1).

Data quality & supporting data: OSM surface completeness (arxiv.org/html/2410.19874v1 — ~30–40% global, Europe 37%); HeiGIT ohsome attribute-completeness workshop (giscience.github.io/sotm-2024-ohsome-data-insights-workshop); OSM US pedestrian data trends 2024 (openstreetmap.us/news/2025/03/pedestrian-data-trends); Key:lit wiki page; Overpass API fair use (wiki.openstreetmap.org/wiki/Overpass_API); OpenFreeMap (openfreemap.org — free, commercial OK); Protomaps; MapLibre 2026 status (maplibre.org/news — Vulkan default on Android); Terrain Tiles on AWS Open Data (registry.opendata.aws/terrain-tiles); Open Topo Data (opentopodata.org); Copernicus GLO-30 DEM.
