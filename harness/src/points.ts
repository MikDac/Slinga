import { DEFAULT_START } from '@slinga/api-contract';

/**
 * Spike matrix start points (PLANNING.md §8, 0.1), one set per supported extract,
 * each mirroring the category mix the plan asks for: urban core / suburban / rural /
 * waterfront-archipelago / sparse.
 *
 * Denmark is the executed CI fallback (private-repo runners are 2 vCPU / 7 GB RAM —
 * too small for the Sweden graph; see STATUS.md). The Swedish set stays first-class
 * for larger runners / the VPS. Select via POINTS=sweden|denmark (default: denmark).
 */

export interface SpikePoint {
  name: string;
  category: 'urban' | 'suburban' | 'rural' | 'waterfront' | 'sparse';
  lon: number;
  lat: number;
}

export const SWEDEN_POINTS: SpikePoint[] = [
  // Canonical demo start point (owner decision, see api-contract DEFAULT_START).
  {
    name: `${DEFAULT_START.label} (canonical)`,
    category: 'urban',
    lon: DEFAULT_START.lon,
    lat: DEFAULT_START.lat,
  },
  { name: 'Stockholm Vasastan', category: 'urban', lon: 18.0464, lat: 59.3434 },
  { name: 'Göteborg Inom Vallgraven', category: 'urban', lon: 11.9668, lat: 57.7038 },
  { name: 'Uppsala centrum', category: 'urban', lon: 17.6389, lat: 59.8586 },
  { name: 'Stockholm Bromma (suburb)', category: 'suburban', lon: 17.9384, lat: 59.3389 },
  { name: 'Malmö Limhamn (suburb)', category: 'suburban', lon: 12.9346, lat: 55.5867 },
  { name: 'Vaxholm (archipelago)', category: 'waterfront', lon: 18.3514, lat: 59.4022 },
  { name: 'Malmö Västra Hamnen (waterfront)', category: 'waterfront', lon: 12.9754, lat: 55.6136 },
  { name: 'Krokom, Jämtland (rural)', category: 'rural', lon: 14.4614, lat: 63.3282 },
  { name: 'Arvidsjaur (sparse north)', category: 'sparse', lon: 19.1747, lat: 65.5906 },
];

export const DENMARK_POINTS: SpikePoint[] = [
  { name: 'København Indre By', category: 'urban', lon: 12.5683, lat: 55.6761 },
  { name: 'København Nørrebro', category: 'urban', lon: 12.5539, lat: 55.6929 },
  { name: 'Aarhus centrum', category: 'urban', lon: 10.2107, lat: 56.1572 },
  { name: 'Odense centrum', category: 'urban', lon: 10.3883, lat: 55.3959 },
  { name: 'Kongens Lyngby (suburb)', category: 'suburban', lon: 12.5035, lat: 55.7704 },
  { name: 'Ballerup (suburb)', category: 'suburban', lon: 12.3647, lat: 55.7317 },
  { name: 'Dragør havn (waterfront)', category: 'waterfront', lon: 12.6717, lat: 55.5926 },
  { name: 'Helsingør havnefront (waterfront)', category: 'waterfront', lon: 12.6136, lat: 56.0361 },
  { name: 'Bryrup, Midtjylland (rural)', category: 'rural', lon: 9.5386, lat: 56.0257 },
  { name: 'Hanstholm, Thy (sparse)', category: 'sparse', lon: 8.6161, lat: 57.1167 },
];

export function spikePoints(): { setName: string; points: SpikePoint[] } {
  const set = process.env.POINTS ?? 'denmark';
  switch (set) {
    case 'sweden':
      return { setName: 'sweden', points: SWEDEN_POINTS };
    case 'denmark':
      return { setName: 'denmark', points: DENMARK_POINTS };
    default:
      throw new Error(`Unknown POINTS set "${set}" (expected sweden | denmark)`);
  }
}

export const SPIKE_DISTANCES_M = [3000, 5000, 8000, 10_000, 21_000];
