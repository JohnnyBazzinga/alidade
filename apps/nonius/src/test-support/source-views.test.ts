import { describe, expect, it } from 'vitest';
import { views } from './source-views';

describe('views (test support)', () => {
  it('removes comments from both views and keeps code', () => {
    const v = views('const a = 1; // fetch\n/* localStorage */ const b = 2;');
    expect(v.code).not.toContain('fetch');
    expect(v.code).not.toContain('localStorage');
    expect(v.code).toContain('const a = 1;');
    expect(v.code).toContain('const b = 2;');
  });

  it('keeps string text in `code` and blanks it in `bare`', () => {
    const v = views("import x from 'astronomy-engine'; const m = `Date here`;");
    expect(v.code).toContain("'astronomy-engine'");
    expect(v.bare).not.toContain('astronomy-engine');
    expect(v.bare).not.toContain('Date');
    expect(v.bare).toContain("import x from ''");
  });

  it('is not fooled by an escaped quote', () => {
    const v = views("const s = 'it\\'s fetch'; const t = 1;");
    expect(v.bare).not.toContain('fetch');
    expect(v.bare).toContain('const t = 1;');
  });
});
