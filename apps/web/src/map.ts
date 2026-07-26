import maplibregl from 'maplibre-gl';
import type { StyleSpecification } from 'maplibre-gl';
import type { CandidateDto } from '@slinga/api-contract';

/** OpenFreeMap vector tiles — no key, no metering, commercial use allowed (PLANNING.md §2.2). */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Blank fallback style: when the tile CDN is unreachable (offline, blocked network,
 * CI) the map still initializes, so route polylines render on a plain background
 * instead of the whole screen failing.
 */
const FALLBACK_STYLE: StyleSpecification = {
  version: 8,
  name: 'slinga-fallback',
  sources: {},
  layers: [{ id: 'bg', type: 'background', paint: { 'background-color': '#e6ebe6' } }],
};

async function resolveStyle(): Promise<string | StyleSpecification> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const res = await fetch(STYLE_URL, { signal: controller.signal });
    clearTimeout(timer);
    if (res.ok) return STYLE_URL;
  } catch {
    // fall through to fallback
  }
  return FALLBACK_STYLE;
}

export interface RouteMap {
  map: maplibregl.Map;
  startMarker: maplibregl.Marker;
  setRoutes(candidates: CandidateDto[], selectedId: string | null): void;
  destroy(): void;
}

export async function createRouteMap(
  container: HTMLElement,
  start: { lon: number; lat: number },
  onStartDragged: (lon: number, lat: number) => void,
): Promise<RouteMap> {
  const style = await resolveStyle();
  const map = new maplibregl.Map({
    container,
    style,
    center: [start.lon, start.lat],
    zoom: 13,
    attributionControl: false,
  });
  map.addControl(
    new maplibregl.AttributionControl({
      compact: true,
      customAttribution: '© OpenStreetMap contributors · OpenFreeMap',
    }),
  );

  const startMarker = new maplibregl.Marker({ draggable: true, color: '#dc2626' })
    .setLngLat([start.lon, start.lat])
    .addTo(map);
  startMarker.on('dragend', () => {
    const { lng, lat } = startMarker.getLngLat();
    onStartDragged(lng, lat);
  });

  const ready = new Promise<void>((resolve) => {
    if (map.loaded()) resolve();
    else map.once('load', () => resolve());
  });
  await ready;

  map.addSource('routes', { type: 'geojson', data: emptyCollection() });
  map.addLayer({
    id: 'routes-ghost',
    type: 'line',
    source: 'routes',
    filter: ['!=', ['get', 'selected'], true],
    paint: { 'line-color': '#64748b', 'line-width': 3, 'line-opacity': 0.5 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });
  map.addLayer({
    id: 'routes-selected',
    type: 'line',
    source: 'routes',
    filter: ['==', ['get', 'selected'], true],
    paint: { 'line-color': '#16a34a', 'line-width': 5, 'line-opacity': 0.95 },
    layout: { 'line-cap': 'round', 'line-join': 'round' },
  });

  function setRoutes(candidates: CandidateDto[], selectedId: string | null): void {
    const source = map.getSource<maplibregl.GeoJSONSource>('routes');
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: candidates.map((c) => ({
        type: 'Feature' as const,
        properties: { id: c.id, selected: c.id === selectedId },
        geometry: { type: 'LineString' as const, coordinates: c.coordinates },
      })),
    });
    const selected = candidates.find((c) => c.id === selectedId) ?? candidates[0];
    if (selected) {
      const bounds = boundsOf(selected.coordinates);
      if (bounds) map.fitBounds(bounds, { padding: 48, duration: 500, maxZoom: 15 });
    }
  }

  return {
    map,
    startMarker,
    setRoutes,
    destroy: () => map.remove(),
  };
}

function emptyCollection(): { type: 'FeatureCollection'; features: never[] } {
  return { type: 'FeatureCollection', features: [] };
}

function boundsOf(coords: number[][]): maplibregl.LngLatBoundsLike | null {
  if (coords.length === 0) return null;
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const c of coords) {
    const [lon, lat] = c as [number, number];
    if (lon < minLon) minLon = lon;
    if (lat < minLat) minLat = lat;
    if (lon > maxLon) maxLon = lon;
    if (lat > maxLat) maxLat = lat;
  }
  return [
    [minLon, minLat],
    [maxLon, maxLat],
  ];
}
