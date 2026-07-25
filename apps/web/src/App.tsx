import { useEffect, useState } from 'react';
import type { HealthResponse } from '@slinga/api-contract';

/**
 * Phase 0 walking skeleton (PLANNING.md §8, milestone M0): a live page proving the
 * client → API path end-to-end. The real map UI (MapLibre + OpenFreeMap) is Phase 1.
 */
export function App() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/health')
      .then((res) => res.json() as Promise<HealthResponse>)
      .then(setHealth)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main
      style={{ fontFamily: 'system-ui, sans-serif', margin: '0 auto', maxWidth: 640, padding: 24 }}
    >
      <h1>Slinga</h1>
      <p>Running &amp; walking loops at exactly the distance you want — wherever you are.</p>
      <p data-testid="api-status">
        {health
          ? `API: ${health.status} (engine: ${health.engine.kind}, ${
              health.engine.reachable ? 'reachable' : 'unreachable'
            }) — v${health.version}`
          : error
            ? `API unreachable: ${error}`
            : 'Checking API…'}
      </p>
      <p style={{ color: '#666', fontSize: 14 }}>
        Walking skeleton — route generation UI lands in Phase 1 (see PLANNING.md).
      </p>
    </main>
  );
}
