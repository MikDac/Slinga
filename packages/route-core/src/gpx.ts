import type { LonLat } from './types.js';

/** Minimal GPX 1.1 track export (PLANNING.md §6.2) — pure string generation, no deps. */

export interface GpxOptions {
  name: string;
  coordinates: readonly LonLat[];
  creator?: string;
}

export function toGpx({ name, coordinates, creator = 'Slinga' }: GpxOptions): string {
  const points = coordinates
    .map((c) => {
      const ele = c.length === 3 ? `<ele>${round(c[2]!, 1)}</ele>` : '';
      return `      <trkpt lat="${round(c[1], 6)}" lon="${round(c[0], 6)}">${ele}</trkpt>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="${escapeXml(creator)}" xmlns="http://www.topografix.com/GPX/1/1">
  <trk>
    <name>${escapeXml(name)}</name>
    <trkseg>
${points}
    </trkseg>
  </trk>
</gpx>
`;
}

function round(x: number, decimals: number): number {
  const f = 10 ** decimals;
  return Math.round(x * f) / f;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
