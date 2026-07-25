import type { LonLat } from './types.js';
import { haversineM } from './geo.js';

/**
 * Edge-level measurements over route geometry. We have no stable OSM edge ids from the
 * engine response, so consecutive coordinate pairs (rounded to ~1 m) act as canonical
 * undirected edge keys. Good enough for reuse/overlap measurement; not for graph work.
 */

const PRECISION = 1e5; // 5 decimal places ≈ 1.1 m at the equator

function pointKey(p: LonLat): string {
  return `${Math.round(p[0] * PRECISION)},${Math.round(p[1] * PRECISION)}`;
}

/** Canonical undirected key for the segment a—b. */
function edgeKey(a: LonLat, b: LonLat): string {
  const ka = pointKey(a);
  const kb = pointKey(b);
  return ka < kb ? `${ka}|${kb}` : `${kb}|${ka}`;
}

/**
 * Share of total route length spent on edges already traversed earlier in the route
 * (in either direction). 0 for a perfect loop; ≈0.5 for a pure out-and-back.
 */
export function repeatedEdgeShare(coords: readonly LonLat[]): number {
  if (coords.length < 2) return 0;
  const seen = new Set<string>();
  let total = 0;
  let repeated = 0;
  for (let i = 1; i < coords.length; i++) {
    const a = coords[i - 1]!;
    const b = coords[i]!;
    const len = haversineM(a, b);
    if (len === 0) continue;
    total += len;
    const key = edgeKey(a, b);
    if (seen.has(key)) {
      repeated += len;
    } else {
      seen.add(key);
    }
  }
  return total === 0 ? 0 : repeated / total;
}

/**
 * Jaccard similarity of the undirected edge sets of two routes (0..1).
 * Used to deduplicate near-identical candidates before ranking (PLANNING.md §3.3 step 3).
 */
export function edgeSetJaccard(a: readonly LonLat[], b: readonly LonLat[]): number {
  const setA = edgeSet(a);
  const setB = edgeSet(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const key of setA) {
    if (setB.has(key)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

function edgeSet(coords: readonly LonLat[]): Set<string> {
  const set = new Set<string>();
  for (let i = 1; i < coords.length; i++) {
    set.add(edgeKey(coords[i - 1]!, coords[i]!));
  }
  return set;
}
