import { describe, expect, it } from 'vitest';
import * as ui from './index';
// A type that the README's builder example uses: if `index.ts` does not export it, `pnpm typecheck`
// fails here (a type has no run-time presence for a test to look at).
import type { AppLayer, AppShape } from './index';

const README = Object.values(
  import.meta.glob<string>('../README.md', { query: '?raw', import: 'default', eager: true }),
)[0];

/** What `ui` exports, by name, as a record that can be indexed. */
const EXPORTS = ui as unknown as Record<string, unknown>;

/** Members of the Map adapter that the README names with a call; they are not exports of the package. */
const ADAPTER_METHODS: readonly string[] = ['setLayer', 'clearLayer'];

/** Every name the README promises an application: its imports, its calls in code and `code`, its components. */
function namesInReadme(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/import\s*\{([^}]*)\}\s*from\s*'@alidade\/ui'/g))
    for (const n of (m[1] ?? '').split(',')) if (n.trim() !== '') names.add(n.trim());
  for (const m of text.matchAll(/`([A-Za-z][A-Za-z0-9]*)\(/g)) names.add(m[1] as string);
  for (const m of text.matchAll(/<([A-Z][A-Za-z0-9]*)[\s/>]/g)) names.add(m[1] as string);
  return [...names].filter((n) => !ADAPTER_METHODS.includes(n)).sort();
}

describe('what src/index.ts exports to an application', () => {
  it('has every function the requirements promise, and the two limits as numbers', () => {
    for (const name of [
      'appFeature',
      'sceneFromOffsets',
      'scriptForStation',
      'createMapAdapter',
      'MapView',
      'buildCatalogue',
      'loadMapLibre',
    ])
      expect(typeof EXPORTS[name], name).toBe('function');
    expect(EXPORTS['MAX_APP_LAYERS']).toBe(8);
    expect(EXPORTS['MAX_LAYER_FEATURES']).toBe(2000);
  });

  it('has every name the README’s examples and prose use', () => {
    expect(README).toBeDefined();
    const names = namesInReadme(README ?? '');
    // The parse must find the README's own examples, or this test checks nothing.
    for (const n of [
      'MapView',
      'appFeature',
      'sceneFromOffsets',
      'scriptForStation',
      'SightingScreen',
    ])
      expect(names, n).toContain(n);
    for (const name of names)
      expect(typeof EXPORTS[name], `${name} (named in README.md)`).toBe('function');
  });

  it('lets an application build a feature and give it to a layer, with the exported types', () => {
    const shape: AppShape = { type: 'point', position: { latRad: 0.5, lonRad: -0.7 } };
    const feature = ui.appFeature('hotspot', 'h1', shape);
    expect(feature.ok).toBe(true);
    if (!feature.ok) return;
    const layer: AppLayer = {
      id: 'hotspots',
      collection: { type: 'FeatureCollection', features: [feature.value] },
      paint: { kind: 'circle', colour: '#D2691E', radiusPx: 6 },
    };
    expect(layer.collection.features).toHaveLength(1);
  });
});
