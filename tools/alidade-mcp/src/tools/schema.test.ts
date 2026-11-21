// The input schema each tool lists must agree with what its handler checks (design D11).

import { describe, expect, it } from 'vitest';
import { TOOLS } from '../tools.ts';
import { fixArgs } from '../synthetic.testkit.ts';

type Schema = Record<string, unknown>;

const FIX = fixArgs();
const ORIGIN = { latDeg: 30, lonDeg: -40 };

/** Valid arguments for each tool, covering every property the schema lists. */
const VARIANTS: Record<string, unknown[]> = {
  fix_from_bearings: [FIX, { ...FIX, outlierRejection: true }],
  magnetic_declination: [{ latDeg: 30, lonDeg: -40, timeUtcMs: Date.UTC(2026, 5, 1) }],
  local_offset: [
    { direction: 'to_offset', origin: ORIGIN, position: { latDeg: 30.1, lonDeg: -40 } },
    { direction: 'to_position', origin: ORIGIN, eastM: 100, northM: 200 },
  ],
};

/** The paths of every property of a schema: `a`, `a.b`, `list[]`, `list[].c`. */
function schemaPaths(schema: Schema, prefix = ''): string[] {
  const properties = (schema['properties'] ?? {}) as Record<string, Schema>;
  return Object.entries(properties).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;
    if (child['type'] === 'array') {
      const items = child['items'] as Schema;
      return [path, ...schemaPaths(items, `${path}[].`)];
    }
    return [path, ...schemaPaths(child, `${path}.`)];
  });
}

function valuePaths(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null) return [];
  return Object.entries(value).flatMap(([key, child]) => {
    const path = `${prefix}${key}`;
    if (Array.isArray(child)) return [path, ...valuePaths(child[0], `${path}[].`)];
    return [path, ...valuePaths(child, `${path}.`)];
  });
}

describe.each(TOOLS)('the schema of $name', (tool) => {
  const schema = tool.inputSchema as Schema;
  const variants = VARIANTS[tool.name] ?? [];

  it('is an object schema that refuses unknown properties', () => {
    expect(schema['type']).toBe('object');
    expect(schema['additionalProperties']).toBe(false);
    expect(tool.description.length).toBeGreaterThan(40);
  });

  it('lists exactly the properties that valid arguments use', () => {
    const used = [...new Set(variants.flatMap((variant) => valuePaths(variant)))].sort();
    expect(schemaPaths(schema).sort()).toStrictEqual(used);
  });

  it('lists as required what every valid variant has, and the handler insists on it', () => {
    const required = (schema['required'] ?? []) as string[];
    for (const key of required) {
      for (const variant of variants) {
        expect(variant).toHaveProperty(key);
        const without = { ...(variant as Record<string, unknown>) };
        delete without[key];
        expect(tool.handler(without)).toMatchObject({
          ok: false,
          reason: 'invalid_arguments',
          field: key,
        });
      }
    }
    expect(required.length).toBeGreaterThan(0);
  });

  it('is refused by the handler for an unknown property', () => {
    for (const variant of variants) {
      expect(tool.handler({ ...(variant as Record<string, unknown>), bogus: 1 })).toMatchObject({
        ok: false,
        reason: 'invalid_arguments',
        field: 'bogus',
      });
    }
  });

  it('accepts every valid variant without an invalid_arguments failure', () => {
    for (const variant of variants) {
      expect(tool.handler(variant)).not.toMatchObject({ reason: 'invalid_arguments' });
    }
  });
});

describe('the bounds the schema states', () => {
  it('fix_from_bearings: 2 to 64 bearings of an id of 1 to 128 characters', () => {
    const tool = TOOLS.find((t) => t.name === 'fix_from_bearings');
    const bearings = (tool?.inputSchema as Schema)['properties'] as Record<string, Schema>;
    const list = bearings['bearings'] as Schema;
    expect(list['minItems']).toBe(2);
    expect(list['maxItems']).toBe(64);
    const id = ((list['items'] as Schema)['properties'] as Record<string, Schema>)['id'] as Schema;
    expect(id['minLength']).toBe(1);
    expect(id['maxLength']).toBe(128);
  });
});
