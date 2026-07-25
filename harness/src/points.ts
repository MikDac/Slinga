/**
 * Spike matrix start points (PLANNING.md §8, 0.1): urban core / suburban / rural /
 * waterfront across European cities plus a sparse area. Extend toward ~30 as the
 * spike proceeds; this starter set already covers every category.
 */

export interface SpikePoint {
  name: string;
  category: 'urban' | 'suburban' | 'rural' | 'waterfront' | 'sparse';
  lon: number;
  lat: number;
}

export const SPIKE_POINTS: SpikePoint[] = [
  { name: 'Munich Marienplatz', category: 'urban', lon: 11.5755, lat: 48.1374 },
  { name: 'Munich Trudering (suburb)', category: 'suburban', lon: 11.6567, lat: 48.1136 },
  { name: 'Stockholm Gamla Stan', category: 'urban', lon: 18.0708, lat: 59.3251 },
  { name: 'Stockholm Bromma (suburb)', category: 'suburban', lon: 17.9384, lat: 59.3389 },
  { name: 'Paris Le Marais', category: 'urban', lon: 2.3617, lat: 48.8578 },
  { name: 'Amsterdam Jordaan', category: 'urban', lon: 4.8797, lat: 52.3745 },
  { name: 'Nice Promenade des Anglais', category: 'waterfront', lon: 7.2551, lat: 43.6949 },
  { name: 'Lisbon Belém (waterfront)', category: 'waterfront', lon: -9.2077, lat: 38.6979 },
  { name: 'Bavarian countryside (Egling)', category: 'rural', lon: 11.5069, lat: 47.9236 },
  { name: 'Swedish sparse (Ludvika outskirts)', category: 'sparse', lon: 15.1608, lat: 60.1499 },
];

export const SPIKE_DISTANCES_M = [3000, 5000, 8000, 10_000, 21_000];
