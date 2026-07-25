/**
 * Spike matrix start points (PLANNING.md §8, 0.1) — all inside the Sweden extract
 * (spike extract decision, see STATUS.md): urban core / suburban / rural /
 * waterfront-archipelago / sparse north, mirroring the category mix the plan asks for.
 */

export interface SpikePoint {
  name: string;
  category: 'urban' | 'suburban' | 'rural' | 'waterfront' | 'sparse';
  lon: number;
  lat: number;
}

export const SPIKE_POINTS: SpikePoint[] = [
  { name: 'Stockholm Gamla Stan', category: 'urban', lon: 18.0708, lat: 59.3251 },
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

export const SPIKE_DISTANCES_M = [3000, 5000, 8000, 10_000, 21_000];
