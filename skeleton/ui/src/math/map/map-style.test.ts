import { describe, expect, it } from 'vitest';
import { contrastRatio, type Rgb } from '../contrast';
import { buildMapStyle, MAP_DARK, MAP_FIX, MAP_LIGHT, type TileSource } from './map-style';

const TILES: TileSource = {
  tileUrlTemplates: ['https://tiles.invalid/{z}/{x}/{y}.png'],
  attribution: 'Synthetic tiles',
  minZoom: 0,
  maxZoom: 18,
  tileSizePx: 256,
};

function hex(code: string): Rgb {
  return {
    r: parseInt(code.slice(1, 3), 16),
    g: parseInt(code.slice(3, 5), 16),
    b: parseInt(code.slice(5, 7), 16),
  };
}

function ratio(a: string, b: Rgb): number {
  const r = contrastRatio(hex(a), b);
  if (!r.ok) throw new Error('contrast');
  return r.value;
}

const BLACK = { r: 0, g: 0, b: 0 };
const WHITE = { r: 255, g: 255, b: 255 };

describe('buildMapStyle (Req 15.4, 15.7, D12)', () => {
  it('needs no glyph or sprite and has no text layer', () => {
    for (const tiles of [null, TILES]) {
      const style = buildMapStyle(tiles);
      expect('glyphs' in style).toBe(false);
      expect('sprite' in style).toBe(false);
      expect(style.layers.some((l) => (l.type as string) === 'symbol')).toBe(false);
      expect(JSON.stringify(style)).not.toMatch(/text-|glyph|sprite|font/);
      expect(JSON.parse(JSON.stringify(style))).toEqual(style);
    }
  });

  it('draws the Wedges under the lines and the ellipse under the Fix point', () => {
    const ids = buildMapStyle(null).layers.map((l) => l.id);
    const at = (id: string) => ids.indexOf(id);
    expect(ids[0]).toBe('background');
    expect(at('wedges-fill')).toBeLessThan(at('bearings-casing'));
    expect(at('wedges-outline')).toBeLessThan(at('bearings-core'));
    expect(at('fix-ellipse-core')).toBeLessThan(at('fix-casing'));
    expect(at('bearings-core')).toBeLessThan(at('observers-casing'));
    expect(ids.slice(-2)).toEqual(['fix-casing', 'fix-core']);
  });

  it('feeds the Fix and its ellipse from one source, split by kind', () => {
    const style = buildMapStyle(null);
    const fixLayers = style.layers.filter((l) => l.id.startsWith('fix'));
    expect(new Set(fixLayers.map((l) => l.source))).toEqual(new Set(['fix']));
    expect(fixLayers.every((l) => Array.isArray(l.filter))).toBe(true);
    expect(Object.keys(style.sources).sort()).toEqual(['bearings', 'fix', 'observers', 'wedges']);
  });

  it('draws every line at least 2 CSS px wide and every casing wider than its core', () => {
    const layers = buildMapStyle(null).layers;
    for (const l of layers.filter((x) => x.type === 'line'))
      expect(Number(l.paint['line-width'])).toBeGreaterThanOrEqual(2);
    for (const l of layers.filter((x) => x.type === 'circle'))
      expect(Number(l.paint['circle-radius'])).toBeGreaterThanOrEqual(2);
    const width = (id: string) => Number(layers.find((l) => l.id === id)?.paint['line-width']);
    expect(width('bearings-casing')).toBeGreaterThan(width('bearings-core') + 2);
    expect(width('fix-ellipse-casing')).toBeGreaterThan(width('fix-ellipse-core') + 2);
  });

  it('holds 7:1 for each two-tone pair against a dark and a light map (Req 13.2, 15.7)', () => {
    // The casing carries the line on a light map; the core on a dark one.
    expect(ratio(MAP_DARK, WHITE)).toBeGreaterThanOrEqual(7);
    expect(ratio(MAP_LIGHT, BLACK)).toBeGreaterThanOrEqual(7);
    expect(ratio(MAP_FIX, BLACK)).toBeGreaterThanOrEqual(7);
    expect(ratio(MAP_DARK, hex(MAP_FIX))).toBeGreaterThanOrEqual(7);
    expect(ratio(MAP_DARK, hex(MAP_LIGHT))).toBeGreaterThanOrEqual(7);
    expect(ratio(MAP_DARK, WHITE).toFixed(2)).toBe('19.59');
    expect(ratio(MAP_LIGHT, BLACK).toFixed(2)).toBe('18.11');
    expect(ratio(MAP_FIX, BLACK).toFixed(2)).toBe('10.41');
  });

  it('adds a raster source and layer only with a Tile source, with its attribution', () => {
    const none = buildMapStyle(null);
    expect('tiles' in none.sources).toBe(false);
    expect(none.layers.some((l) => l.type === 'raster')).toBe(false);
    const withTiles = buildMapStyle(TILES);
    expect(withTiles.sources.tiles).toEqual({
      type: 'raster',
      tiles: TILES.tileUrlTemplates,
      tileSize: 256,
      minzoom: 0,
      maxzoom: 18,
      attribution: 'Synthetic tiles',
    });
    expect(withTiles.layers[1]?.id).toBe('tiles');
  });

  it('writes no URL of its own (Req 15.2, 15.9)', () => {
    expect(JSON.stringify(buildMapStyle(null))).not.toMatch(/https?:/);
  });
});
