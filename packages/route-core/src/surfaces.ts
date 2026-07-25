import type { SurfacePreference } from './types.js';

/**
 * OSM `surface` value classification for the paved/unpaved soft filter (PLANNING.md §4.3).
 * Untagged length is tracked separately as "missing" and surfaced to the UI as a
 * disclosure badge — we never silently pretend unknown is known.
 */

const PAVED = new Set([
  'paved',
  'asphalt',
  'concrete',
  'concrete:plates',
  'concrete:lanes',
  'paving_stones',
  'sett',
  'cobblestone',
  'unhewn_cobblestone',
  'bricks',
  'metal',
  'wood',
]);

const UNPAVED = new Set([
  'unpaved',
  'compacted',
  'fine_gravel',
  'gravel',
  'pebblestone',
  'dirt',
  'earth',
  'ground',
  'grass',
  'grass_paver',
  'mud',
  'sand',
  'woodchips',
  'rock',
]);

export const MISSING_SURFACE_KEY = 'missing';

export function isPavedSurface(value: string): boolean {
  return PAVED.has(value);
}

export function isUnpavedSurface(value: string): boolean {
  return UNPAVED.has(value);
}

export interface SurfaceMatchResult {
  /** Share of surface-KNOWN length matching the preference (1 when preference is "any" or nothing known). */
  match: number;
  /** Share of TOTAL length with no surface tag. */
  unknownShare: number;
}

export function surfaceMatch(
  breakdown: Record<string, number> | undefined,
  preference: SurfacePreference | undefined,
): SurfaceMatchResult {
  if (!breakdown) return { match: preference && preference !== 'any' ? 0.5 : 1, unknownShare: 1 };

  let total = 0;
  let unknown = 0;
  let matched = 0;
  let known = 0;
  for (const [value, meters] of Object.entries(breakdown)) {
    total += meters;
    if (value === MISSING_SURFACE_KEY || value === 'other') {
      unknown += meters;
      continue;
    }
    known += meters;
    if (!preference || preference === 'any') continue;
    if (preference === 'paved' && isPavedSurface(value)) matched += meters;
    if (preference === 'unpaved' && isUnpavedSurface(value)) matched += meters;
  }

  const unknownShare = total === 0 ? 1 : unknown / total;
  if (!preference || preference === 'any') return { match: 1, unknownShare };
  // With no surface-tagged length at all, stay neutral rather than rewarding or punishing.
  const match = known === 0 ? 0.5 : matched / known;
  return { match, unknownShare };
}
