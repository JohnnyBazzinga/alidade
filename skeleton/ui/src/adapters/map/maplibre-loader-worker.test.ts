import { describe, expect, it, vi } from 'vitest';

// A module with no way to give it the worker's address: the map could not start (Req 15.18).
vi.mock('maplibre-gl', () => ({
  Map: class {},
}));
vi.mock('maplibre-gl/dist/maplibre-gl-worker.mjs?url', () => ({ default: 'worker.mjs' }));

describe('loadMapLibre without setWorkerUrl (Req 15.18)', () => {
  it('returns map_unavailable, because the library would not start its worker', async () => {
    const { loadMapLibre } = await import('./maplibre-loader');
    const result = await loadMapLibre();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('map_unavailable');
  });
});
