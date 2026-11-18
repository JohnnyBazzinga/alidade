import { describe, expect, it } from 'vitest';

// Purity, layering and packaging (Req 1.1 to 1.3, 1.6, 2.3, 4.1, 4.4; design §10, D1). `any` is not
// scanned here: ESLint's `no-explicit-any` covers skeleton/sensors, and `pnpm lint` runs it.

/** Every non-test source file of the package, as text, keyed by its path from `src/`. */
const SOURCES = import.meta.glob<string>(
  ['./**/*.ts', '!./**/*.test.ts', '!./**/*.d.ts', '!./test-support/**'],
  { query: '?raw', import: 'default', eager: true },
);
const PACKAGE_JSON = import.meta.glob<string>('../package.json', {
  query: '?raw',
  import: 'default',
  eager: true,
});

const EXPECTED_SOURCES = [
  'browser/browser-environment.ts',
  'browser/browser-sensor-source.ts',
  'capture.ts',
  'circular-summary.ts',
  'declination.ts',
  'defaults.ts',
  'frame-reset.ts',
  'index.ts',
  'listener-set.ts',
  'orientation-sample.ts',
  'parameters.ts',
  'pending-starts.ts',
  'position-fix.ts',
  'ray.ts',
  'rotation.ts',
  'sample-history.ts',
  'sensor-result.ts',
  'sensor-source.ts',
  'sighting-window.ts',
  'simulator/direction-to-rotation.ts',
  'simulator/seeded-random.ts',
  'simulator/simulator-script.ts',
  'simulator/simulator.ts',
  'wmm.ts',
  'yaw-reference.ts',
];

/**
 * Removes comments and the contents of string and template literals, keeping their quotes, so a
 * word in a comment or a message is not mistaken for code. Imports are read from the original.
 */
export function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/'(?:\\.|[^'\\\n])*'|"(?:\\.|[^"\\\n])*"|`(?:\\.|[^`\\])*`/g, (literal) =>
      literal.charAt(0).repeat(2),
    )
    .replace(/\/\/[^\n]*/g, ' ');
}

/** Removes comments only, keeping strings: for checks on what a source reads by name. */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1');
}

/**
 * The code with property accesses (`input.window`) and declared keys (`readonly window:` at the
 * start of a line, in an interface or object type) removed, so that what remains of a name like
 * `window` can only be a read of a variable. The Math layer declares no variable with a global's
 * name, so such a read is a read of the global.
 */
function bareNames(code: string): string {
  return code
    .replace(/\.\s*[A-Za-z_$][\w$]*/g, '.p')
    .replace(/^(\s*)(?:readonly\s+)?[A-Za-z_$][\w$]*\??\s*:/gm, '$1k:');
}

/** The module specifiers a source imports or re-exports from. */
export function importsOf(source: string): string[] {
  const specifiers: string[] = [];
  for (const match of source.matchAll(
    /^\s*(?:import|export)\b[^;]*?\bfrom\s+['"]([^'"]+)['"]/gms,
  )) {
    if (match[1] !== undefined) specifiers.push(match[1]);
  }
  for (const match of source.matchAll(/^\s*import\s+['"]([^'"]+)['"]/gm)) {
    if (match[1] !== undefined) specifiers.push(match[1]);
  }
  return specifiers;
}

/**
 * Browser globals, the clock, timers, randomness and I/O: none may appear in the Math layer. A
 * `name` pattern is matched on bare names (a global read); a `code` pattern on the whole code, for
 * property accesses such as `Date.now` and constructs such as `import(`.
 */
const MATH_LAYER_FORBIDDEN: readonly (readonly [string, RegExp, 'name' | 'code'])[] = [
  ['window', /\bwindow\b/, 'name'],
  ['document', /\bdocument\b/, 'name'],
  ['navigator', /\bnavigator\b/, 'name'],
  ['screen', /\bscreen\b/, 'name'],
  ['DeviceOrientationEvent', /\bDeviceOrientationEvent\b/, 'name'],
  ['globalThis', /\bglobalThis\b/, 'name'],
  ['Date.now', /\bDate\s*\.\s*now\b/, 'code'],
  ['new Date', /\bnew\s+Date\b/, 'code'],
  ['performance', /\bperformance\b/, 'name'],
  ['Math.random', /\bMath\s*\.\s*random\b/, 'code'],
  ['setTimeout', /\bsetTimeout\b/, 'name'],
  ['setInterval', /\bsetInterval\b/, 'name'],
  ['console', /\bconsole\b/, 'name'],
  ['fetch', /\bfetch\b/, 'name'],
  ['process', /\bprocess\b/, 'name'],
  ['import(', /\bimport\s*\(/, 'code'],
  ['eval', /\beval\b/, 'name'],
  ['import.meta', /\bimport\s*\.\s*meta\b/, 'code'],
];
/** Platform names, which no file may read (Req 4.1): matched on the whole code, accesses included. */
const PLATFORM_NAMES: readonly (readonly [string, RegExp])[] = [
  ['userAgent', /\buserAgent\b/],
  ['platform', /\bplatform\b/],
  ['vendor', /\bvendor\b/],
];

const isMathLayer = (path: string) => !path.startsWith('browser/') && path !== 'index.ts';

/** The forbidden tokens a source contains, by name. */
export function forbiddenIn(path: string, source: string): string[] {
  const code = codeOnly(source);
  const names = bareNames(code);
  const found: string[] = [];
  const checkLayer = () => {
    for (const [name, pattern, on] of MATH_LAYER_FORBIDDEN) {
      if (pattern.test(on === 'name' ? names : code)) found.push(name);
    }
  };
  if (isMathLayer(path)) {
    checkLayer();
    if (path !== 'wmm.ts' && /\bDate\s*\.\s*UTC\b/.test(code)) found.push('Date.UTC');
  }
  if (path === 'browser/browser-sensor-source.ts') checkLayer();
  for (const [name, pattern] of PLATFORM_NAMES) if (pattern.test(code)) found.push(name);
  const readsEuler = /\.\s*(alphaRad|gammaRad)\b/.test(code);
  if (readsEuler && path !== 'rotation.ts' && path !== 'simulator/direction-to-rotation.ts') {
    found.push('.alphaRad/.gammaRad read');
  }
  return found;
}

/** The import rules a source breaks. */
export function badImportsIn(path: string, source: string): string[] {
  const bad: string[] = [];
  for (const specifier of importsOf(source)) {
    if (specifier === '@alidade/core') continue;
    if (specifier === 'magvar') {
      if (path !== 'wmm.ts') bad.push(`magvar outside wmm.ts`);
      continue;
    }
    if (!specifier.startsWith('./') && !specifier.startsWith('../')) {
      bad.push(`${specifier} is not relative, @alidade/core or magvar`);
      continue;
    }
    if (specifier.includes('test-support')) bad.push(`${specifier}: test support`);
    if (isMathLayer(path) && specifier.includes('browser/'))
      bad.push(`${specifier}: the Math layer imports an Adapter`);
  }
  return bad;
}

function sourcesByPath(): Map<string, string> {
  return new Map(Object.entries(SOURCES).map(([path, text]) => [path.replace(/^\.\//, ''), text]));
}

describe('purity and layering (Req 1.2, 1.3, 2.3, 4.1, 4.4; design §10)', () => {
  const sources = sourcesByPath();

  it('reads exactly the expected source files', () => {
    expect([...sources.keys()].sort()).toEqual(EXPECTED_SOURCES);
  });

  it('keeps browser globals, the clock, timers, randomness and I/O out of the Math layer', () => {
    const found = [...sources].flatMap(([path, text]) =>
      forbiddenIn(path, text).map((name) => `${path}: ${name}`),
    );
    expect(found).toEqual([]);
  });

  it('imports only relative paths, @alidade/core and, in wmm.ts only, magvar', () => {
    const bad = [...sources].flatMap(([path, text]) =>
      badImportsIn(path, text).map((rule) => `${path}: ${rule}`),
    );
    expect(bad).toEqual([]);
  });

  it('imports only calculateMagneticField from magvar', () => {
    const wmm = sources.get('wmm.ts') ?? '';
    expect(wmm).toMatch(/import\s*\{\s*calculateMagneticField\s*\}\s*from\s*'magvar'/);
    expect([...wmm.matchAll(/from\s*'magvar'/g)]).toHaveLength(1);
  });

  it('names browser globals only in browser-environment.ts', () => {
    const environment = codeOnly(sources.get('browser/browser-environment.ts') ?? '');
    // The rule is not vacuous: the one file allowed to read them does.
    expect(environment).toMatch(/\bwindow\b/);
    expect(environment).toMatch(/\bDate\s*\.\s*now\b/);
    expect(
      forbiddenIn(
        'browser/browser-sensor-source.ts',
        sources.get('browser/browser-sensor-source.ts') ?? '',
      ),
    ).toEqual([]);
  });

  it('derives no alpha from webkitCompassHeading (Req 4.4)', () => {
    // The heading is read in exactly one place, the event copy, and only into the heading field.
    const users = [...sources]
      .filter(([, text]) => /webkitCompassHeading\b/.test(withoutComments(text)))
      .map(([path]) => path);
    expect(users).toEqual(['browser/browser-sensor-source.ts']);
  });

  it('reads no default implicitly: only index.ts imports values from defaults.ts (Req 10.2)', () => {
    const importers = [...sources]
      .filter(([path]) => path !== 'index.ts' && path !== 'defaults.ts')
      .flatMap(([path, text]) =>
        [...text.matchAll(/^\s*import\s+(type\s+)?\{[^}]*\}\s*from\s*'\.\/defaults'/gm)]
          .filter((match) => match[1] === undefined && !/^\s*import\s*\{\s*type\s/.test(match[0]))
          .map(() => path),
      );
    expect(importers).toEqual([]);
  });

  it('computes no Declination in the captures or the Yaw references (Req 6.2)', () => {
    for (const path of ['capture.ts', 'yaw-reference.ts']) {
      const imports = importsOf(sources.get(path) ?? '');
      expect(imports).not.toContain('./wmm');
      expect(codeOnly(sources.get(path) ?? '')).not.toMatch(/\bdeclinationAt\b/);
    }
  });

  it('fails on a forbidden token added to a copy of a source (the checks are not vacuous)', () => {
    const capture = sources.get('capture.ts') ?? '';
    expect(forbiddenIn('capture.ts', capture)).toEqual([]);
    expect(forbiddenIn('capture.ts', `${capture}\nconst t = Date.now();`)).toEqual(['Date.now']);
    expect(forbiddenIn('capture.ts', `${capture}\nconst r = Math.random();`)).toEqual([
      'Math.random',
    ]);
    expect(forbiddenIn('capture.ts', `${capture}\nconst w = window;`)).toEqual(['window']);
    expect(forbiddenIn('capture.ts', `${capture}\nconst u = navigator.userAgent;`)).toEqual([
      'navigator',
      'userAgent',
    ]);
    expect(forbiddenIn('capture.ts', `${capture}\nconst y = Date.UTC(2025, 0, 1);`)).toEqual([
      'Date.UTC',
    ]);
    expect(forbiddenIn('capture.ts', `${capture}\nconst a = r.alphaRad;`)).toEqual([
      '.alphaRad/.gammaRad read',
    ]);
    // Words inside comments and strings do not count.
    expect(
      forbiddenIn('capture.ts', `${capture}\n// window, Date.now()\nconst s = 'Math.random';`),
    ).toEqual([]);
    expect(badImportsIn('capture.ts', `${capture}\nimport { x } from 'lodash';`)).toEqual([
      'lodash is not relative, @alidade/core or magvar',
    ]);
    expect(
      badImportsIn('capture.ts', `${capture}\nimport { y } from './browser/browser-environment';`),
    ).toEqual(['./browser/browser-environment: the Math layer imports an Adapter']);
    expect(badImportsIn('ray.ts', `import { calculateMagneticField } from 'magvar';`)).toEqual([
      'magvar outside wmm.ts',
    ]);
  });
});

describe('packaging (Req 1.1, 1.6)', () => {
  const manifest = JSON.parse(Object.values(PACKAGE_JSON)[0] ?? '{}') as {
    dependencies?: Record<string, string>;
    exports?: Record<string, string>;
  };

  it('depends at runtime on exactly @alidade/core and magvar at an exact version', () => {
    expect(manifest.dependencies).toEqual({ '@alidade/core': 'workspace:*', magvar: '2.2.0' });
  });

  it('exposes only "." in its exports map', () => {
    expect(manifest.exports).toEqual({ '.': './src/index.ts' });
  });
});
