import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GraphHopperEngine, RouteGenerator, SyntheticEngine } from '@slinga/route-api';
import type { EngineCallOutcome, RoutingEngine } from '@slinga/route-api';
import { ScaleFactorTable } from '@slinga/route-core';
import { OrsEngine } from './ors.js';
import { SPIKE_DISTANCES_M, spikePoints } from './points.js';
import type { CandidateGeometry, CellResult } from './report.js';
import {
  buildGalleryHtml,
  buildGeoJson,
  collectMeta,
  downsample,
  summarize,
  toCsv,
} from './report.js';

/**
 * Phase 0.1 route-generation quality harness (PLANNING.md §8).
 *
 * Runs the start-point × distance matrix against a selected engine and emits
 * report.json (meta + summary + cells), report.csv, gallery.html (self-contained
 * SVG map gallery) and routes.geojson, with the acceptance-gate metrics:
 *   ≥90% of urban/suburban cells with ≥1 candidate within ±10%, p95 latency <3 s.
 *
 * Usage:
 *   ENGINE=synthetic            pnpm --filter @slinga/harness spike     # pipeline sanity, no infra
 *   ENGINE=graphhopper GRAPHHOPPER_URL=http://localhost:8989 pnpm --filter @slinga/harness spike
 *   ENGINE=ors ORS_API_KEY=...  pnpm --filter @slinga/harness spike     # hosted, mind the 40/min quota
 */

function makeEngine(): { engine: RoutingEngine; interRequestDelayMs: number } {
  const kind = process.env.ENGINE ?? 'synthetic';
  switch (kind) {
    case 'graphhopper':
      return {
        engine: new GraphHopperEngine(process.env.GRAPHHOPPER_URL ?? 'http://localhost:8989'),
        interRequestDelayMs: 0,
      };
    case 'ors': {
      const key = process.env.ORS_API_KEY;
      if (!key) throw new Error('ORS_API_KEY is required for ENGINE=ors');
      // Free tier is 40 req/min; with fanout 8 per cell, pace the cells.
      return { engine: new OrsEngine(key), interRequestDelayMs: 15_000 };
    }
    case 'synthetic':
      return { engine: new SyntheticEngine({ deviationBand: 0.5 }), interRequestDelayMs: 0 };
    default:
      throw new Error(`Unknown ENGINE "${kind}" (expected synthetic | graphhopper | ors)`);
  }
}

async function main(): Promise<void> {
  const { engine, interRequestDelayMs } = makeEngine();
  const fanout = Number.parseInt(process.env.FANOUT ?? '8', 10);
  const generator = new RouteGenerator(engine, new ScaleFactorTable());
  const { setName, points } = spikePoints();
  const meta = collectMeta(engine, fanout, setName);
  const results: CellResult[] = [];
  const galleryCells: {
    cell: CellResult;
    geometries: CandidateGeometry[];
    start: [number, number];
  }[] = [];

  console.log(
    `Spike run: engine=${engine.kind}:${engine.profile}, points=${setName}, fanout=${fanout}, ` +
      `${meta.cpuModel} ×${meta.cpuCount}, ${meta.totalMemGb} GB RAM`,
  );
  for (const point of points) {
    for (const distanceM of SPIKE_DISTANCES_M) {
      const counters = { ok: 0, null: 0, error: 0 };
      const onEngineResult = (outcome: EngineCallOutcome) => {
        counters[outcome]++;
      };
      const startedAt = performance.now();
      let cell: CellResult;
      let geometries: CandidateGeometry[] = [];
      try {
        const result = await generator.generate(
          point.lon,
          point.lat,
          { routeType: 'loop', distanceM },
          { fanout, onEngineResult },
        );
        const ranked = result.candidates.length > 0 ? result.candidates : result.nearestMisses;
        const best = ranked[0] ?? null;
        cell = {
          point: point.name,
          category: point.category,
          distanceM,
          candidates: result.candidates.length,
          hasValid: result.hasValidCandidate,
          bestAbsErrorRatio: best ? Math.abs(best.distanceErrorRatio) : null,
          bestRepeatedEdgeShare: best ? best.repeatedEdgeShare : null,
          candidateErrorRatios: ranked.map((c) => round4(c.distanceErrorRatio)),
          engineCalls: counters.ok + counters.null + counters.error,
          engineNulls: counters.null,
          engineErrors: counters.error,
          latencyMs: Math.round(performance.now() - startedAt),
        };
        geometries = ranked.slice(0, 3).map((c) => ({
          id: c.id,
          distanceM: c.distanceM,
          distanceErrorRatio: round4(c.distanceErrorRatio),
          repeatedEdgeShare: round4(c.repeatedEdgeShare),
          withinTolerance: c.withinTolerance,
          coordinates: downsample(c.coordinates.map(([lon, lat]) => [lon, lat])),
        }));
      } catch (e) {
        cell = {
          point: point.name,
          category: point.category,
          distanceM,
          candidates: 0,
          hasValid: false,
          bestAbsErrorRatio: null,
          bestRepeatedEdgeShare: null,
          candidateErrorRatios: [],
          engineCalls: counters.ok + counters.null + counters.error,
          engineNulls: counters.null,
          engineErrors: counters.error,
          latencyMs: Math.round(performance.now() - startedAt),
          error: e instanceof Error ? e.message : String(e),
        };
      }
      results.push(cell);
      galleryCells.push({ cell, geometries, start: [point.lon, point.lat] });
      console.log(
        `  ${point.name} @ ${distanceM / 1000} km → ${cell.candidates} candidates, ` +
          `valid=${cell.hasValid}, bestErr=${fmtPct(cell.bestAbsErrorRatio)}, ` +
          `ok/null/err=${counters.ok}/${counters.null}/${counters.error}, ${cell.latencyMs} ms` +
          (cell.error ? ` ERROR: ${cell.error}` : ''),
      );
      if (interRequestDelayMs > 0) await sleep(interRequestDelayMs);
    }
  }

  const summary = summarize(results);
  const outDir = path.resolve(import.meta.dirname, '../out');
  await mkdir(outDir, { recursive: true });
  await writeFile(
    path.join(outDir, 'report.json'),
    JSON.stringify({ meta, summary, cells: results }, null, 2),
  );
  await writeFile(path.join(outDir, 'report.csv'), toCsv(results));
  await writeFile(path.join(outDir, 'gallery.html'), buildGalleryHtml(meta, summary, galleryCells));
  await writeFile(path.join(outDir, 'routes.geojson'), JSON.stringify(buildGeoJson(galleryCells)));

  console.log('\n=== Acceptance gate (PLANNING.md §8, 0.1) ===');
  console.log(
    `urban/suburban cells with ≥1 candidate within ±10%: ${fmtPct(summary.urbanSuburbanValidShare)} (gate: ≥90%)`,
  );
  console.log(
    `urban/suburban cells with ≥3 candidates:            ${fmtPct(summary.urbanSuburbanThreePlusShare)}`,
  );
  console.log(
    `latency p50/p95/max:                                ${summary.latencyP50Ms}/${summary.latencyP95Ms}/${summary.latencyMaxMs} ms (gate: p95 <3000 ms)`,
  );
  console.log(
    `hardware: ${meta.cpuModel} ×${meta.cpuCount}, ${meta.totalMemGb} GB RAM — ${meta.note}`,
  );
  console.log(summary.gatePass ? 'GATE: PASS' : 'GATE: FAIL');
  process.exitCode = summary.gatePass ? 0 : 1;
}

function round4(x: number): number {
  return Math.round(x * 10_000) / 10_000;
}

function fmtPct(x: number | null): string {
  return x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
