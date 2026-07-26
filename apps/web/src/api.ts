import type { GenerateRoutesRequest, GenerateRoutesResponse } from '@slinga/api-contract';

export async function generateRoutes(req: GenerateRoutesRequest): Promise<GenerateRoutesResponse> {
  const res = await fetch('/v1/routes/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(req),
  });
  if (!res.ok) {
    throw new Error(`generate failed: ${res.status}`);
  }
  return (await res.json()) as GenerateRoutesResponse;
}
