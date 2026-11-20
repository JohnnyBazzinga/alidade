// The tile source from the build environment (Req 9.6): four values, all present or none.

import { describe, expect, it } from 'vitest';
import { tileSetupFromEnvironment } from './tile-setup';

const ALL = {
  urlTemplate: 'https://tiles.provider.test/{z}/{x}/{y}.png',
  attribution: 'Map data by the Provider',
  sourceName: 'Provider Maps',
  termsUrl: 'https://provider.test/terms',
};

describe('tileSetupFromEnvironment', () => {
  it('gives the plain background, with no failure, when any of the four is missing or empty', () => {
    for (const key of Object.keys(ALL) as (keyof typeof ALL)[]) {
      expect(tileSetupFromEnvironment({ ...ALL, [key]: '' })).toEqual({ ok: true, value: null });
      expect(tileSetupFromEnvironment({ ...ALL, [key]: undefined })).toEqual({
        ok: true,
        value: null,
      });
      expect(tileSetupFromEnvironment({ ...ALL, [key]: '   ' })).toEqual({ ok: true, value: null });
    }
    expect(tileSetupFromEnvironment({})).toEqual({ ok: true, value: null });
  });

  it('builds the source from all four, trimmed, with one template or several', () => {
    const r = tileSetupFromEnvironment({
      ...ALL,
      urlTemplate:
        ' https://a.provider.test/{z}/{x}/{y}.png  https://b.provider.test/{z}/{x}/{y}.png ',
    });
    if (!r.ok || r.value === null) throw new Error('no setup');
    expect(r.value.tileUrlTemplates).toEqual([
      'https://a.provider.test/{z}/{x}/{y}.png',
      'https://b.provider.test/{z}/{x}/{y}.png',
    ]);
    expect(r.value.sourceName).toBe('Provider Maps');
  });

  it.each([
    ['a template that is not https', { urlTemplate: 'http://tiles.provider.test/{z}/{x}/{y}.png' }],
    ['a template with no host', { urlTemplate: 'https:///{z}/{x}/{y}.png' }],
    [
      'a template of a host that is an address',
      { urlTemplate: 'https://localhost/{z}/{x}/{y}.png' },
    ],
    ['terms that are not an https address', { termsUrl: 'provider.test/terms' }],
  ])('refuses %s with invalid_number naming the field', (_name, over) => {
    const r = tileSetupFromEnvironment({ ...ALL, ...over });
    expect(r).toMatchObject({ ok: false, reason: 'invalid_number' });
  });
});
