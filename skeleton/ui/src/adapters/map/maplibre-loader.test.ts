import { describe, expect, it, vi } from 'vitest';

// `maplibre-gl` is never loaded in a test (design §10); here its import fails, as it would on a
// page where the script cannot be fetched.
vi.mock('maplibre-gl', () => {
  throw new TypeError('Failed to fetch dynamically imported module');
});

describe('loadMapLibre (Req 1.4, 15.1)', () => {
  it('returns map_unavailable when the library cannot be loaded, never a throw', async () => {
    const { loadMapLibre } = await import('./maplibre-loader');
    const result = await loadMapLibre();
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe('map_unavailable');
  });
});
