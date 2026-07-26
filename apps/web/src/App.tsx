import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CandidateDto, GenerateRoutesResponse, HealthResponse } from '@slinga/api-contract';
import { DEFAULT_DISTANCE_M, DEFAULT_START, DISTANCE_PRESETS_M } from '@slinga/api-contract';
import { generateRoutes } from './api.js';
import { pickStrings } from './i18n.js';
import type { RouteMap } from './map.js';
import { createRouteMap } from './map.js';
import 'maplibre-gl/dist/maplibre-gl.css';
import './app.css';

type Phase = 'setup' | 'loading' | 'results' | 'error';
type StartSource = 'default' | 'geo' | 'pin';

/**
 * The family-beta flow (PLANNING.md §6.1, zero-instruction bar):
 * pick distance → generate → see loops on the map → tap one → export GPX.
 */
export function App() {
  const t = useMemo(() => pickStrings(), []);
  const [phase, setPhase] = useState<Phase>('setup');
  const [start, setStart] = useState<{ lon: number; lat: number; source: StartSource }>({
    lon: DEFAULT_START.lon,
    lat: DEFAULT_START.lat,
    source: 'default',
  });
  const [geoDenied, setGeoDenied] = useState(false);
  const [distanceM, setDistanceM] = useState<number>(DEFAULT_DISTANCE_M);
  const [response, setResponse] = useState<GenerateRoutesResponse | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);

  const mapContainer = useRef<HTMLDivElement>(null);
  const routeMap = useRef<RouteMap | null>(null);

  // Map bootstrap (with blank-style fallback when tiles are unreachable).
  useEffect(() => {
    let disposed = false;
    if (!mapContainer.current) return;
    createRouteMap(mapContainer.current, start, (lon, lat) => {
      setStart({ lon, lat, source: 'pin' });
    }).then((rm) => {
      if (disposed) {
        rm.destroy();
        return;
      }
      routeMap.current = rm;
    });
    return () => {
      disposed = true;
      routeMap.current?.destroy();
      routeMap.current = null;
    };
    // Intentionally mount-only: the marker/map own start updates after init.
  }, []);

  // Try browser geolocation once; fall back to the canonical start with a note.
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGeoDenied(true);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const next = {
          lon: pos.coords.longitude,
          lat: pos.coords.latitude,
          source: 'geo' as const,
        };
        setStart(next);
        routeMap.current?.startMarker.setLngLat([next.lon, next.lat]);
        routeMap.current?.map.flyTo({ center: [next.lon, next.lat], zoom: 13, duration: 600 });
      },
      () => setGeoDenied(true),
      { timeout: 6000, maximumAge: 60_000 },
    );
  }, []);

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch(() => setHealth(null));
  }, []);

  const candidates: CandidateDto[] = useMemo(() => {
    if (!response) return [];
    return response.hasValidCandidate ? response.candidates : response.nearestMisses;
  }, [response]);

  // Keep the map in sync with results/selection.
  useEffect(() => {
    routeMap.current?.setRoutes(candidates, selectedId);
  }, [candidates, selectedId]);

  const generate = useCallback(
    async (fresh: boolean) => {
      setPhase('loading');
      try {
        const res = await generateRoutes({
          start: { lon: start.lon, lat: start.lat },
          distanceM,
          routeType: 'loop',
          fresh,
        });
        setResponse(res);
        const first = (res.hasValidCandidate ? res.candidates : res.nearestMisses)[0];
        setSelectedId(first?.id ?? null);
        setPhase('results');
      } catch {
        setPhase('error');
      }
    },
    [start, distanceM],
  );

  const exportGpx = useCallback(async (candidate: CandidateDto) => {
    const url = candidate.gpxPath;
    try {
      if (navigator.share !== undefined) {
        const blob = await (await fetch(url)).blob();
        const file = new File(
          [blob],
          `slinga-${Math.round(candidate.distanceM / 100) / 10}km.gpx`,
          {
            type: 'application/gpx+xml',
          },
        );
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file] });
          return;
        }
      }
    } catch {
      // fall through to plain download
    }
    const a = document.createElement('a');
    a.href = url;
    a.download = '';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

  const reset = useCallback(() => {
    setResponse(null);
    setSelectedId(null);
    routeMap.current?.setRoutes([], null);
    setPhase('setup');
  }, []);

  const selected = candidates.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="screen">
      <div ref={mapContainer} className="map" data-testid="map" />
      <h1 className="brand" style={{ margin: 0 }}>
        Slinga
      </h1>
      <div className="status-line" data-testid="api-status">
        {health
          ? `API: ${health.status} (engine: ${health.engine.kind}) — v${health.version}`
          : '…'}
      </div>

      <div className="sheet">
        {phase === 'setup' && (
          <>
            <p className="note" data-testid="start-note">
              {start.source === 'geo'
                ? t.startGeoNote
                : start.source === 'pin'
                  ? t.startPinNote
                  : geoDenied
                    ? t.locationDenied
                    : t.startDefaultNote}
            </p>
            <p className="label">{t.distanceLabel}</p>
            <div className="chips">
              {DISTANCE_PRESETS_M.map((d) => (
                <button
                  key={d}
                  className={`chip${d === distanceM ? ' active' : ''}`}
                  data-testid={`distance-chip-${d}`}
                  onClick={() => setDistanceM(d)}
                >
                  {d / 1000} {t.km}
                </button>
              ))}
            </div>
            <button
              className="btn primary"
              data-testid="generate-btn"
              onClick={() => generate(false)}
            >
              {t.generate}
            </button>
          </>
        )}

        {phase === 'loading' && (
          <div className="loading" data-testid="loading-state">
            <div className="spinner" />
            {t.generating}
          </div>
        )}

        {phase === 'results' && response && (
          <div data-testid="results-state">
            {!response.hasValidCandidate && <p className="miss-title">{t.noValidTitle}</p>}
            {response.hasValidCandidate && (
              <p className="note">{t.routesFound(candidates.length)}</p>
            )}
            <div className="cards">
              {candidates.map((c, i) => (
                <button
                  key={c.id}
                  className={`card${c.id === selectedId ? ' selected' : ''}`}
                  data-testid={`candidate-card-${i}`}
                  onClick={() => setSelectedId(c.id)}
                >
                  <div className="dist">
                    {(c.distanceM / 1000).toFixed(1)} {t.km}
                  </div>
                  <span className="badge">{c.routeType === 'loop' ? t.loop : t.outAndBack}</span>
                  {c.unknownSurfaceShare > 0.25 && (
                    <span className="badge warn">{t.surfaceUnknown}</span>
                  )}
                </button>
              ))}
            </div>
            <div className="btn-row">
              <button
                className="btn primary"
                data-testid="gpx-btn"
                disabled={!selected}
                onClick={() => selected && exportGpx(selected)}
              >
                {t.gpx}
              </button>
              <button
                className="btn secondary"
                data-testid="shuffle-btn"
                onClick={() => generate(true)}
              >
                {t.shuffle}
              </button>
            </div>
            <button className="btn secondary" data-testid="new-search-btn" onClick={reset}>
              {t.newSearch}
            </button>
          </div>
        )}

        {phase === 'error' && (
          <div className="error-box" data-testid="error-state">
            <h2>{t.errorTitle}</h2>
            <p>{t.errorBody}</p>
            <button className="btn primary" data-testid="retry-btn" onClick={() => generate(false)}>
              {t.retry}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
