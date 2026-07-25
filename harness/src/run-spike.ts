import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { GraphHopperEngine, RouteGenerator, SyntheticEngine } from '@slinga/route-api';
import type { RoutingEngine } from '@slinga/route-api';
import { ScaleFactorTable } from '@slinga/route-core';
import { OrsEngine } from './ors.js';
import { SPIKE_DISTANCES_M, SPIKE_POINTS } from './points.js';

/**
 * Phase 0.1 route-generation quality harness (PLANNING.md §8).
 *
 * Runs the start-point × distance matrix against a selected engine and emits
 * JSON + CSV reports with the acceptance-gate metrics:
 *   ≥90% of urban/suburban cells with ≥1 candidate within ±10%, p95 latency <3 s.
 *
 * Usage:
 *   ENGINE=synthetic            pnpm --filter @slinga/harness spike     # pipeline sanity, no infra
 *   ENGINE=graphhopper GRAPHHOPPER_URL=http://localhost:8989 pnpm --filter @slinga/harness spike
 *   ENGINE=ors ORS_API_KEY=...  pnpm --filter @slinga/harness spike     # hosted, mind the 40/min quota
 */

interface CellResult {
  point: string;
  category: string;
  distanceM: number;
  candidates: number;
  hasValid: boolean;
  bestAbsErrorRatio: number | null;
  bestRepeatedEdgeShare: number | null;
  latencyMs: number;
  error?: string;
}

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
  const results: CellResult[] = [];

  console.log(`Spike run: engine=${engine.kind}, fanout=${fanout}`);
  for (const point of SPIKE_POINTS) {
    for (const distanceM of SPIKE_DISTANCES_M) {
      const startedAt = performance.now();
      try {
        const result = await generator.generate(
          point.lon,
          point.lat,
          {
            routeType: 'loop',
            distanceM,
          },
          { fanout },
        );
        const best = result.candidates[0] ?? result.nearestMisses[0] ?? null;
        results.push({
          point: point.name,
          category: point.category,
          distanceM,
          candidates: result.candidates.length,
          hasValid: result.hasValidCandidate,
          bestAbsErrorRatio: best ? Math.abs(best.distanceErrorRatio) : null,
          bestRepeatedEdgeShare: best ? best.repeatedEdgeShare : null,
          latencyMs: Math.round(performance.now() - startedAt),
        });
      } catch (e) {
        results.push({
          point: point.name,
          category: point.category,
          distanceM,
          candidates: 0,
          hasValid: false,
          bestAbsErrorRatio: null,
          bestRepeatedEdgeShare: null,
          latencyMs: Math.round(performance.now() - startedAt),
          error: e instanceof Error ? e.message : String(e),
        });
      }
      const last = results[results.length - 1]!;
      console.log(
        `  ${point.name} @ ${distanceM / 1000} km → ${last.candidates} candidates, ` +
          `valid=${last.hasValid}, bestErr=${fmtPct(last.bestAbsErrorRatio)}, ${last.latencyMs} ms` +
          (last.error ? ` ERROR: ${last.error}` : ''),
      );
      if (interRequestDelayMs > 0) await sleep(interRequestDelayMs);
    }
  }

  const outDir = path.resolve(import.meta.dirname, '../out');
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'report.json'), JSON.stringify(results, null, 2));
  await writeFile(path.join(outDir, 'report.csv'), toCsv(results));

  printSummary(results);
}

function printSummary(results: CellResult[]): void {
  const urbanish = results.filter((r) => r.category === 'urban' || r.category === 'suburban');
  const validShare = share(urbanish, (r) => r.hasValid);
  const threePlusShare = share(urbanish, (r) => r.candidates >= 3);
  const latencies = [...results.map((r) => r.latencyMs)].sort((a, b) => a - b);
  const p95 = latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * 0.95))] ?? 0;

  console.log('\n=== Acceptance gate (PLANNING.md §8, 0.1) ===');
  console.log(
    `urban/suburban cells with ≥1 candidate within ±10%: ${fmtPct(validShare)} (gate: ≥90%)`,
  );
  console.log(`urban/suburban cells with ≥3 candidates:            ${fmtPct(threePlusShare)}`);
  console.log(`p95 cell latency:                                   ${p95} ms (gate: <3000 ms)`);
  const pass = validShare >= 0.9 && p95 < 3000;
  console.log(pass ? 'GATE: PASS' : 'GATE: FAIL');
  process.exitCode = pass ? 0 : 1;
}

function share<T>(items: T[], predicate: (item: T) => boolean): number {
  return items.length === 0 ? 0 : items.filter(predicate).length / items.length;
}

function toCsv(results: CellResult[]): string {
  const header =
    'point,category,distance_m,candidates,has_valid,best_abs_error_ratio,best_repeated_edge_share,latency_ms,error';
  const rows = results.map((r) =>
    [
      csvEscape(r.point),
      r.category,
      r.distanceM,
      r.candidates,
      r.hasValid,
      r.bestAbsErrorRatio ?? '',
      r.bestRepeatedEdgeShare ?? '',
      r.latencyMs,
      csvEscape(r.error ?? ''),
    ].join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
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
