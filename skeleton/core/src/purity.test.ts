import { describe, expect, it } from 'vitest';

// Purity and packaging (Req 11.1, 11.2; design §10), and the dependency direction of the solver
// (Req 5.4, 5.6, 5.7). `any` and non-null assertions (Req 11.5) are not scanned here: the ESLint
// rules of task 1.1 enforce them, and `pnpm lint` runs them.

/** Every non-test source file of the package, as text, keyed by its path. */
const SOURCES = import.meta.glob<string>(['./*.ts', '!./*.test.ts', '!./*.d.ts'], {
  query: '?raw',
  import: 'default',
  eager: true,
});
/** Test-support files, which no source may import. */
const TEST_SUPPORT = import.meta.glob<string>('./test-support/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
});
const PACKAGE_JSON = import.meta.glob<string>('../package.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const EXPECTED_SOURCES = [
  'angle.ts',
  'bearing-model.ts',
  'ellipse.ts',
  'index.ts',
  'local-plane.ts',
  'measurement-model.ts',
  'observation.ts',
  'position.ts',
  'result.ts',
  'solver.ts',
];

/**
 * Removes comments and the contents of string and template literals, keeping their quotes, so
 * that a word in a comment or a message is not mistaken for code. Import specifiers are read
 * from the original text separately.
 */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, (literal) =>
      literal.charAt(0).repeat(2),
    )
    .replace(/\/\/[^\n]*/g, ' ');
}

/** What a source must not touch: the clock, randomness, I/O, the environment and globals. */
const FORBIDDEN: readonly { readonly what: string; readonly pattern: RegExp }[] = [
  { what: 'the clock (Date)', pattern: /\bDate\b/ },
  { what: 'the clock (performance)', pattern: /\bperformance\b/ },
  { what: 'timers', pattern: /\b(setTimeout|setInterval|setImmediate|queueMicrotask)\b/ },
  { what: 'randomness (Math.random)', pattern: /\bMath\s*\.\s*random\b/ },
  { what: 'randomness (crypto)', pattern: /\bcrypto\b/ },
  { what: 'the environment (process)', pattern: /\bprocess\b/ },
  {
    what: 'Node globals',
    pattern: /\b(require|module\.exports|__dirname|__filename|Buffer|global)\b/,
  },
  {
    what: 'browser globals',
    pattern: /\b(window|document|navigator|localStorage|sessionStorage|location)\b/,
  },
  { what: 'globalThis', pattern: /\bglobalThis\b/ },
  { what: 'I/O (fetch and sockets)', pattern: /\b(fetch|XMLHttpRequest|WebSocket|EventSource)\b/ },
  { what: 'I/O (console)', pattern: /\bconsole\b/ },
  { what: 'import.meta', pattern: /\bimport\s*\.\s*meta\b/ },
  {
    what: 'dynamic code (eval, Function)',
    pattern: /\beval\s*\(|\bnew\s+Function\b|\bFunction\s*\(/,
  },
  { what: 'dynamic import', pattern: /\bimport\s*\(/ },
];

/** Every module specifier a source imports or re-exports. */
function importSpecifiers(source: string): string[] {
  const withoutComments = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/[^\n]*/gm, ' ');
  return [
    ...withoutComments.matchAll(
      /\b(?:import|export)\b[^'";]*?\bfrom\s*['"]([^'"]+)['"]|\bimport\s*['"]([^'"]+)['"]/g,
    ),
  ].map((match) => (match[1] ?? match[2]) as string);
}

/** The problems a source has: forbidden code, and imports that leave the package's sources. */
function purityProblems(source: string): string[] {
  const code = codeOnly(source);
  const problems = FORBIDDEN.filter(({ pattern }) => pattern.test(code)).map(({ what }) => what);
  for (const specifier of importSpecifiers(source)) {
    const target = specifier.replace(/^\.\//, '').replace(/(\.ts)?$/, '.ts');
    if (!specifier.startsWith('./') || !EXPECTED_SOURCES.includes(target)) {
      problems.push(`an import of '${specifier}', outside the package's own sources`);
    }
  }
  return problems;
}

const fileName = (path: string): string => path.replace(/^.*\//, '');

describe('purity (Req 11.1, 11.2)', () => {
  it('scans exactly the package’s ten source files, and no test file', () => {
    expect(Object.keys(SOURCES).map(fileName).sort()).toStrictEqual(EXPECTED_SOURCES);
    for (const source of Object.values(SOURCES)) expect(source.length).toBeGreaterThan(100);
  });

  it.each(EXPECTED_SOURCES)(
    '%s reads no clock, makes no randomness, does no I/O and imports only package sources',
    (name) => {
      const entry = Object.entries(SOURCES).find(([path]) => fileName(path) === name);
      expect(entry).toBeDefined();
      expect(purityProblems((entry as [string, string])[1])).toStrictEqual([]);
    },
  );

  it('flags each kind of impurity in a bad sample, so the scan cannot pass by matching nothing', () => {
    const samples: readonly (readonly [string, string])[] = [
      ['const now = Date.now();', 'the clock (Date)'],
      ['const t = performance.now();', 'the clock (performance)'],
      ['setTimeout(() => 0, 1);', 'timers'],
      ['const r = Math.random();', 'randomness (Math.random)'],
      ['crypto.getRandomValues(buffer);', 'randomness (crypto)'],
      ['const home = process.env.HOME;', 'the environment (process)'],
      ["const fs = require('fs');", 'Node globals'],
      ['window.alert(1);', 'browser globals'],
      ['globalThis.x = 1;', 'globalThis'],
      ["await fetch('https://example.com');", 'I/O (fetch and sockets)'],
      ["console.log('x');", 'I/O (console)'],
      ['const files = import.meta.glob("./*");', 'import.meta'],
      ["eval('1');", 'dynamic code (eval, Function)'],
      ["const m = await import('./angle');", 'dynamic import'],
    ];
    for (const [code, expected] of samples) {
      expect(purityProblems(code)).toContain(expected);
    }
    expect(purityProblems("import { readFileSync } from 'node:fs';")).toStrictEqual([
      "an import of 'node:fs', outside the package's own sources",
    ]);
    expect(purityProblems("import { solve } from '../../apps/vigia/src/solve';")).toHaveLength(1);
    expect(purityProblems("import fc from 'fast-check';")).toHaveLength(1);
    expect(
      purityProblems("export { createStubModel } from './test-support/stub-model';"),
    ).toHaveLength(1);
  });

  it('does not flag words in comments or strings, or imports of package sources', () => {
    expect(
      purityProblems(
        [
          '// The clock (Date) is never read; see process notes and window functions.',
          '/* console, fetch and Math.random are named here only in a comment. */',
          "const message = 'Date and process and console';",
          "import { _wrapPi } from './angle';",
          "export type { Fix } from './measurement-model';",
        ].join('\n'),
      ),
    ).toStrictEqual([]);
  });

  it('has no runtime dependencies (Req 11.1)', () => {
    const [packageText] = Object.values(PACKAGE_JSON);
    const manifest = JSON.parse(packageText as string) as {
      name: string;
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    expect(manifest.name).toBe('@alidade/core');
    expect(manifest.dependencies ?? {}).toStrictEqual({});
    expect(manifest.peerDependencies ?? {}).toStrictEqual({});
    expect(manifest.optionalDependencies ?? {}).toStrictEqual({});
  });
});

describe('dependency direction (Req 5.4, 5.6, 5.7)', () => {
  const importsOf = (name: string): string[] => {
    const entry = Object.entries(SOURCES).find(([path]) => fileName(path) === name);
    return importSpecifiers((entry as [string, string])[1]);
  };

  it.each(['solver.ts', 'measurement-model.ts'])(
    '%s imports nothing specific to bearings',
    (name) => {
      const specifiers = importsOf(name);
      expect(specifiers.length).toBeGreaterThan(0);
      expect(specifiers).not.toContain('./bearing-model');
      expect(specifiers).not.toContain('./observation');
    },
  );

  it('no source imports test support, and the test-support files exist to be imported', () => {
    expect(Object.keys(TEST_SUPPORT).length).toBeGreaterThan(5);
    for (const name of EXPECTED_SOURCES) {
      expect(importsOf(name).some((specifier) => specifier.includes('test-support'))).toBe(false);
    }
  });
});
