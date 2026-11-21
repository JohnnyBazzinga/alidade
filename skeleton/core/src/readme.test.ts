import { describe, expect, it } from 'vitest';

// Every name the README promises an application is an export of `src/index.ts`. Types have no
// run-time presence, so the check reads the entry file's export lists as text, comments removed.

const README = Object.values(
  import.meta.glob<string>('../README.md', { query: '?raw', import: 'default', eager: true }),
)[0];
const INDEX = Object.values(
  import.meta.glob<string>('./index.ts', { query: '?raw', import: 'default', eager: true }),
)[0];

/** The names exported by the entry file, from its `export { … }` and `export type { … }` lists. */
function exportedNames(source: string): Set<string> {
  const code = source
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
  const names = new Set<string>();
  for (const m of code.matchAll(/export\s+(?:type\s+)?\{([^}]*)\}/g))
    for (const part of (m[1] ?? '').split(',')) {
      const name =
        part
          .trim()
          .split(/\s+as\s+/)
          .pop() ?? '';
      if (name !== '') names.add(name);
    }
  return names;
}

/** Names in the README: its imports from the package, and the lead of each export line (`- \`a\`, \`b\`: …`). */
function namesInReadme(text: string): string[] {
  const names = new Set<string>();
  for (const m of text.matchAll(/import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*'@alidade\/core'/g))
    for (const n of (m[1] ?? '').split(',')) {
      const name = n.trim().replace(/^type\s+/, '');
      if (name !== '') names.add(name);
    }
  for (const line of text.split('\n')) {
    const lead = /^- ((?:`[A-Za-z][A-Za-z0-9_]*`(?:, )?)+):/.exec(line);
    if (lead !== null)
      for (const m of (lead[1] ?? '').matchAll(/`([A-Za-z][A-Za-z0-9_]*)`/g))
        names.add(m[1] as string);
  }
  return [...names].sort();
}

describe('the README of @alidade/core', () => {
  it('names exports that the parse can find, so the check is not vacuous', () => {
    expect(README).toBeDefined();
    const names = namesInReadme(README ?? '');
    for (const known of ['solve', 'BearingModel', 'MeasurementModel', 'Fix', 'ellipse95', 'wrapPi'])
      expect(names, known).toContain(known);
    expect(names.length).toBeGreaterThan(15);
  });

  it('names only what src/index.ts exports', () => {
    const exported = exportedNames(INDEX ?? '');
    expect(exported.size).toBeGreaterThan(20);
    const missing = namesInReadme(README ?? '').filter((name) => !exported.has(name));
    expect(missing).toStrictEqual([]);
  });

  it('points to the extension point and the two real models by path', () => {
    for (const path of ['measurement-model.ts', 'bearing-model.ts', 'altitude-model.ts'])
      expect(README ?? '', path).toContain(path);
  });
});
