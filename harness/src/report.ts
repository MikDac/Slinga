import os from 'node:os';

/**
 * Report generation for the Phase 0.1 spike harness: run metadata (hardware note),
 * CSV, a self-contained HTML map gallery (inline SVG, no CDN — viewable offline as a
 * CI artifact) and a GeoJSON of all kept candidates for geojson.io eyeballing.
 */

export interface RunMeta {
  engine: string;
  profile: string;
  fanout: number;
  pointSet: string;
  graphhopperUrl?: string;
  node: string;
  platform: string;
  cpuModel: string;
  cpuCount: number;
  totalMemGb: number;
  timestamp: string;
  note: string;
}

export interface CandidateGeometry {
  id: string;
  distanceM: number;
  distanceErrorRatio: number;
  repeatedEdgeShare: number;
  withinTolerance: boolean;
  coordinates: [number, number][];
}

export interface CellResult {
  point: string;
  category: string;
  distanceM: number;
  candidates: number;
  hasValid: boolean;
  bestAbsErrorRatio: number | null;
  bestRepeatedEdgeShare: number | null;
  /** Distance error ratios of ALL returned ranked candidates (distribution data). */
  candidateErrorRatios: number[];
  /** Ranked candidates per generation strategy, e.g. { round_trip: 4, isochrone_oab: 1 }. */
  sourceMix: Record<string, number>;
  engineCalls: number;
  engineNulls: number;
  engineErrors: number;
  latencyMs: number;
  error?: string;
}

export interface RunSummary {
  urbanSuburbanValidShare: number;
  urbanSuburbanThreePlusShare: number;
  latencyP50Ms: number;
  latencyP95Ms: number;
  latencyMaxMs: number;
  gatePass: boolean;
}

export function collectMeta(
  engine: { kind: string; profile: string },
  fanout: number,
  pointSet: string,
): RunMeta {
  return {
    engine: engine.kind,
    profile: engine.profile,
    fanout,
    pointSet,
    graphhopperUrl: process.env.GRAPHHOPPER_URL,
    node: process.version,
    platform: `${os.platform()} ${os.arch()}`,
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cpuCount: os.cpus().length,
    totalMemGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    timestamp: new Date().toISOString(),
    note: 'Latency numbers are indicative of this hardware only — re-measure on the production VPS (PLANNING.md §5.2).',
  };
}

export function summarize(results: CellResult[]): RunSummary {
  const urbanish = results.filter((r) => r.category === 'urban' || r.category === 'suburban');
  const share = (pred: (r: CellResult) => boolean) =>
    urbanish.length === 0 ? 0 : urbanish.filter(pred).length / urbanish.length;
  const latencies = results.map((r) => r.latencyMs).sort((a, b) => a - b);
  const pct = (p: number) =>
    latencies[Math.min(latencies.length - 1, Math.floor(latencies.length * p))] ?? 0;
  const validShare = share((r) => r.hasValid);
  const p95 = pct(0.95);
  return {
    urbanSuburbanValidShare: validShare,
    urbanSuburbanThreePlusShare: share((r) => r.candidates >= 3),
    latencyP50Ms: pct(0.5),
    latencyP95Ms: p95,
    latencyMaxMs: latencies[latencies.length - 1] ?? 0,
    gatePass: validShare >= 0.9 && p95 < 3000,
  };
}

export function toCsv(results: CellResult[]): string {
  const header =
    'point,category,distance_m,candidates,has_valid,best_abs_error_ratio,best_repeated_edge_share,engine_calls,engine_nulls,engine_errors,latency_ms,error';
  const rows = results.map((r) =>
    [
      csvEscape(r.point),
      r.category,
      r.distanceM,
      r.candidates,
      r.hasValid,
      r.bestAbsErrorRatio ?? '',
      r.bestRepeatedEdgeShare ?? '',
      r.engineCalls,
      r.engineNulls,
      r.engineErrors,
      r.latencyMs,
      csvEscape(r.error ?? ''),
    ].join(','),
  );
  return [header, ...rows].join('\n') + '\n';
}

export function buildGeoJson(
  cells: { cell: CellResult; geometries: CandidateGeometry[] }[],
): object {
  return {
    type: 'FeatureCollection',
    features: cells.flatMap(({ cell, geometries }) =>
      geometries.map((g) => ({
        type: 'Feature',
        properties: {
          point: cell.point,
          category: cell.category,
          targetM: cell.distanceM,
          candidateId: g.id,
          distanceM: Math.round(g.distanceM),
          errorRatio: Math.round(g.distanceErrorRatio * 1000) / 1000,
          repeatedEdgeShare: Math.round(g.repeatedEdgeShare * 1000) / 1000,
          withinTolerance: g.withinTolerance,
        },
        geometry: { type: 'LineString', coordinates: g.coordinates },
      })),
    ),
  };
}

export function buildGalleryHtml(
  meta: RunMeta,
  summary: RunSummary,
  cells: { cell: CellResult; geometries: CandidateGeometry[]; start: [number, number] }[],
): string {
  const panels = cells.map(({ cell, geometries, start }) => panelHtml(cell, geometries, start));
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Slinga spike gallery — ${escapeHtml(meta.engine)} ${escapeHtml(meta.timestamp)}</title>
<style>
  body { font-family: system-ui, sans-serif; margin: 16px; background: #fafafa; color: #222; }
  header { margin-bottom: 16px; }
  .meta { font-size: 13px; color: #555; }
  .gate { font-weight: 700; }
  .gate.pass { color: #15803d; } .gate.fail { color: #b91c1c; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
  .panel { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 10px; }
  .panel h3 { margin: 0 0 4px; font-size: 14px; }
  .panel .sub { font-size: 12px; color: #666; margin-bottom: 6px; }
  .panel svg { width: 100%; height: auto; background: #f0f4f0; border-radius: 4px; }
  .legend { font-size: 11px; color: #444; margin-top: 4px; }
  .err { color: #b91c1c; font-size: 12px; }
</style>
</head>
<body>
<header>
  <h1>Slinga route-generation spike gallery</h1>
  <p class="meta">
    engine=${escapeHtml(meta.engine)} (profile ${escapeHtml(meta.profile)}), points=${escapeHtml(meta.pointSet)}, fanout=${meta.fanout},
    ${escapeHtml(meta.cpuModel)} ×${meta.cpuCount}, ${meta.totalMemGb} GB RAM, node ${escapeHtml(meta.node)},
    ${escapeHtml(meta.timestamp)}<br>${escapeHtml(meta.note)}
  </p>
  <p class="gate ${summary.gatePass ? 'pass' : 'fail'}">
    GATE: ${summary.gatePass ? 'PASS' : 'FAIL'} —
    urban/suburban valid ${(summary.urbanSuburbanValidShare * 100).toFixed(1)}% (≥90%),
    p95 ${summary.latencyP95Ms} ms (&lt;3000), p50 ${summary.latencyP50Ms} ms, max ${summary.latencyMaxMs} ms
  </p>
</header>
<div class="grid">
${panels.join('\n')}
</div>
</body>
</html>
`;
}

const STROKES = ['#2563eb', '#d97706', '#0d9488'];

function panelHtml(
  cell: CellResult,
  geometries: CandidateGeometry[],
  start: [number, number],
): string {
  const svg = geometries.length > 0 ? svgFor(geometries, start) : '';
  const legend = geometries
    .map(
      (g, i) =>
        `<span style="color:${STROKES[i % STROKES.length]}">■</span> ${(g.distanceM / 1000).toFixed(2)} km (${g.distanceErrorRatio >= 0 ? '+' : ''}${(g.distanceErrorRatio * 100).toFixed(1)}%, reuse ${(g.repeatedEdgeShare * 100).toFixed(0)}%)`,
    )
    .join(' &nbsp; ');
  return `<div class="panel">
  <h3>${escapeHtml(cell.point)} — target ${(cell.distanceM / 1000).toFixed(0)} km</h3>
  <div class="sub">${cell.category} · ${cell.candidates} candidates · valid=${cell.hasValid} · ${cell.latencyMs} ms · engine ok/null/err: ${cell.engineCalls - cell.engineNulls - cell.engineErrors}/${cell.engineNulls}/${cell.engineErrors}</div>
  ${cell.error ? `<div class="err">ERROR: ${escapeHtml(cell.error)}</div>` : ''}
  ${svg}
  <div class="legend">${legend}</div>
</div>`;
}

function svgFor(geometries: CandidateGeometry[], start: [number, number]): string {
  const all = geometries.flatMap((g) => g.coordinates);
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of all) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  const midLat = (minLat + maxLat) / 2;
  const kx = Math.cos((midLat * Math.PI) / 180);
  const spanLon = Math.max((maxLon - minLon) * kx, 1e-6);
  const spanLat = Math.max(maxLat - minLat, 1e-6);
  const span = Math.max(spanLon, spanLat) * 1.1;
  const size = 300;
  const cx = (minLon + maxLon) / 2;
  const cy = midLat;
  const px = (lon: number) => (((lon - cx) * kx) / span + 0.5) * size;
  const py = (lat: number) => (0.5 - (lat - cy) / span) * size;

  const paths = geometries
    .map((g, i) => {
      const d = g.coordinates
        .map(([lon, lat], j) => `${j === 0 ? 'M' : 'L'}${px(lon).toFixed(1)},${py(lat).toFixed(1)}`)
        .join('');
      return `<path d="${d}" fill="none" stroke="${STROKES[i % STROKES.length]}" stroke-width="1.6" opacity="0.85"/>`;
    })
    .join('\n');
  return `<svg viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
${paths}
<circle cx="${px(start[0]).toFixed(1)}" cy="${py(start[1]).toFixed(1)}" r="4" fill="#dc2626"/>
</svg>`;
}

function csvEscape(s: string): string {
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Downsample a polyline to at most maxPoints, always keeping first and last. */
export function downsample(coords: [number, number][], maxPoints = 200): [number, number][] {
  if (coords.length <= maxPoints) return coords;
  const step = (coords.length - 1) / (maxPoints - 1);
  const out: [number, number][] = [];
  for (let i = 0; i < maxPoints; i++) {
    out.push(coords[Math.round(i * step)]!);
  }
  return out;
}
