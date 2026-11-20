// The purity and packaging scans of Nonius (Req 1.1 to 1.10, 3.1, 12.1; design §12), in the
// pattern of Vigia's `purity.test.ts`.
//
// Each source is read twice: `code` has its comments removed and keeps its strings (so import
// specifiers are seen), `bare` also blanks every string and template text (so that the English of
// a Message cannot trip a scan of identifiers). Every rule is written as data (a pattern, where
// it applies, and a probe) and is checked first against a source with its token added, so that no
// rule can pass by matching nothing. A rule whose probe file does not exist yet starts from a
// throwaway string; it bites on the real file once the file exists.

import { describe, expect, it } from 'vitest';
import { views, type View } from './test-support/source-views';

/** Every file of `src` as text, keyed `src/…`. */
const FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries(
    import.meta.glob<string>(['./**/*.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  ).map(([key, text]) => [`src/${key.slice(2)}`, text]),
);

/** The text of the first file a literal glob matches (Vite needs literal patterns), or ''. */
const first = (files: Record<string, string>): string => Object.values(files)[0] ?? '';
const PACKAGE_JSON = first(
  import.meta.glob<string>('../package.json', { query: '?raw', import: 'default', eager: true }),
);
const VIGIA_PACKAGE_JSON = first(
  import.meta.glob<string>('../../vigia/package.json', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
const ENV_EXAMPLE = first(
  import.meta.glob<string>('../.env.example', { query: '?raw', import: 'default', eager: true }),
);
const ESLINT_CONFIG = first(
  import.meta.glob<string>('../../../eslint.config.js', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
const GITIGNORE = first(
  import.meta.glob<string>('../../../.gitignore', {
    query: '?raw',
    import: 'default',
    eager: true,
  }),
);
const ENV_FILES = Object.keys(
  import.meta.glob<string>('../.env*', { query: '?raw', import: 'default', eager: true }),
);

/** Every non-test source file. Adding one without listing it here fails the test below. */
const SOURCES: readonly string[] = [
  // task 1.6
  'src/math/sphere/earth.ts',
  // task group 2
  'src/defaults.ts',
  'src/math/civil-time.ts',
  'src/math/degrees.ts',
  'src/math/messages.ts',
  'src/math/parameters.ts',
  'src/reasons.ts',
  'src/result.ts',
  // task group 3
  'src/math/sun/refraction.ts',
  'src/math/sun/sun-at.ts',
  'src/math/sun/sun-wrapper.ts',
  // task group 4
  'src/math/sight/index-error.ts',
  'src/math/sight/prepare.ts',
  'src/math/sight/sight.ts',
  'src/math/sight/sun-side.ts',
  // task group 5
  // task group 6
  'src/math/fix/advice.ts',
  'src/math/fix/assess.ts',
  'src/math/fix/altitude-model.ts',
  'src/math/fix/geometry-class.ts',
  'src/math/fix/statements.ts',
  'src/math/fix/sun-side-check.ts',
  'src/math/fix/candidates.ts',
  'src/math/fix/recentred-solve.ts',
  'src/math/fix/shared-error.ts',
  'src/math/fix/solve-candidate.ts',
  'src/math/sphere/circle-crossings.ts',
];

const VIEWS: Readonly<Record<string, View>> = Object.fromEntries(
  SOURCES.map((p) => {
    const text = FILES[p];
    if (text === undefined) throw new Error(`not read: ${p}`);
    return [p, views(text)];
  }),
);

const SUN_WRAPPER = 'src/math/sun/sun-wrapper.ts';
const ASK_LOCATION = 'src/components/ask-location.ts';
const STORAGE = 'src/adapters/storage.ts';
const DEFAULTS = 'src/defaults.ts';

/** What a rule probe starts from when its path is not a real source yet. */
const THROWAWAY = 'export const probe = 1;\n';

// ---------------------------------------------------------------------------------------------
// Layers (design D1): the layer of a file is its nearest folder named math, adapters or components.

type Layer = 'math' | 'adapters' | 'components' | null;

export function layerOf(path: string): Layer {
  const folders = path.split('/').slice(0, -1);
  for (let i = folders.length - 1; i >= 0; i -= 1) {
    const folder = folders[i];
    if (folder === 'math' || folder === 'adapters' || folder === 'components') return folder;
  }
  return null;
}

const inMath = (p: string) => layerOf(p) === 'math';
const inLayers = (p: string) => layerOf(p) !== null;
const anywhere = () => true;
const notExactly =
  (...exempt: readonly string[]) =>
  (p: string) =>
    !exempt.includes(p);

/** True for a name that is a component or a hook: PascalCase (not ALL_CAPS), or `useX`. */
export function isComponentOrHookName(name: string): boolean {
  return /^(?:[A-Z][A-Z0-9_]*[a-z]\w*|use[A-Z]\w*)$/.test(name);
}

/** The names a source imports as values (not `import type`, not `type X`) from `@alidade/ui`. */
export function uiValueImports(code: string): string[] {
  const names: string[] = [];
  for (const m of code.matchAll(/\bimport\s+(?!type\b)\{([^}]*)\}\s*from\s*'@alidade\/ui'/g)) {
    for (const part of (m[1] ?? '').split(',')) {
      const spec = part.trim();
      if (spec === '' || /^type\s/.test(spec)) continue;
      names.push((spec.split(/\s+as\s+/)[0] ?? '').trim());
    }
  }
  return names;
}

// ---------------------------------------------------------------------------------------------
// The rules (design §12), as data.

interface Rule {
  readonly name: string;
  readonly applies: (path: string) => boolean;
  /** True when the file violates the rule. */
  readonly violates: (view: View, path: string) => boolean;
  /** A (possibly not yet real) source to add `token` to, and the token, for the bite check. */
  readonly probe: { readonly path: string; readonly token: string };
}

function scan(view: keyof View, pattern: RegExp): Rule['violates'] {
  return (v) => pattern.test(v[view]);
}

/** The I/O boundaries where the string `Deg` may appear in a name (Req 1.7). */
const DEG_FILES = [
  'src/math/degrees.ts',
  'src/math/parameters.ts',
  'src/defaults.ts',
  'src/math/sun/sun-wrapper.ts',
  'src/math/fix/advice.ts',
  'src/math/fix/fix-words.ts',
  'src/math/fix/format.ts',
  'src/math/scenes/sun-scenes.ts',
];

/** Globals no layer reads (Req 1.2, 1.3, 1.5); `Date` has its own rule below. */
const GLOBALS: readonly (readonly [name: string, pattern: RegExp, token: string])[] = [
  ['document', /(?<![.\w$])document\s*[.[]/, 'document.title'],
  ['window', /(?<![.\w$])window\s*[.[]/, 'window.innerWidth'],
  ['navigator', /(?<![.\w$])navigator\s*[.[]/, 'navigator.language'],
  ['location', /(?<![.\w$])location\s*[.[]/, 'location.href'],
  ['Date.now', /\bDate\.now\b/, 'Date.now()'],
  ['new Date', /\bnew\s+Date\b/, 'new Date()'],
  ['performance', /(?<![.\w$])performance\s*\./, 'performance.now()'],
  ['setTimeout', /\bsetTimeout\b/, 'setTimeout(f, 1)'],
  ['setInterval', /\bsetInterval\b/, 'setInterval(f, 1)'],
  ['Math.random', /\bMath\.random\b/, 'Math.random()'],
  ['crypto', /(?<![.\w$])crypto\b/, 'crypto.randomUUID()'],
  ['import(', /(?<![.\w$])import\s*\(/, "import('x')"],
  ['import.meta', /\bimport\.meta\b/, 'import.meta.url'],
];

const RULES: readonly Rule[] = [
  // --- imports (Req 1.1, 1.2) ---
  {
    name: 'a package is imported by its name, never by a deep path (Req 1.1)',
    applies: anywhere,
    violates: scan('code', /\b(?:from|import)\s+'@alidade\/[^']*\/[^']*'/),
    probe: { path: 'src/main.tsx', token: "\nimport { x } from '@alidade/core/src/angle';\n" },
  },
  {
    name: 'only @alidade/core, sensors, ui, react, react-dom, maplibre-gl and astronomy-engine are imported (Req 1.1)',
    applies: anywhere,
    violates: scan(
      'code',
      /\b(?:from|import)\s+'(?!@alidade\/(?:core|sensors|ui)'|react'|react-dom(?:\/client)?'|maplibre-gl(?:\/dist\/maplibre-gl\.css)?'|astronomy-engine'|\.)[^']*'/,
    ),
    probe: { path: 'src/main.tsx', token: "\nimport { x } from 'lodash';\n" },
  },
  {
    name: 'nothing is imported from apps/vigia (Req 1.1)',
    applies: anywhere,
    violates: scan('code', /\bvigia\b/i),
    probe: { path: 'src/main.tsx', token: "\nimport { x } from '../../vigia/src/x';\n" },
  },
  {
    name: 'maplibre-gl is imported only by main.tsx, for its stylesheet (Req 1.1)',
    applies: notExactly('src/main.tsx'),
    violates: scan('code', /'maplibre-gl[^']*'/),
    probe: {
      path: 'src/components/probe.ts',
      token: "\nimport 'maplibre-gl/dist/maplibre-gl.css';\n",
    },
  },
  {
    name: 'astronomy-engine is imported only by math/sun/sun-wrapper.ts (Req 1.1, 3.1)',
    applies: notExactly(SUN_WRAPPER),
    violates: scan('code', /'astronomy-engine'/),
    probe: { path: 'src/math/probe.ts', token: "\nimport { Body } from 'astronomy-engine';\n" },
  },
  {
    name: 'a Math file imports no react, react-dom or maplibre-gl (Req 1.2)',
    applies: inMath,
    violates: scan('code', /\b(?:from|import)\s+'(?:react|react-dom|maplibre-gl)(?:\/[^']*)?'/),
    probe: { path: 'src/math/probe.ts', token: "\nimport { useState } from 'react';\n" },
  },
  {
    name: 'a Math file imports nothing from adapters/ or components/ (Req 1.2)',
    applies: inMath,
    violates: scan('code', /\bfrom\s+'[^']*\/(?:adapters|components)(?:\/[^']*)?'/),
    probe: {
      path: 'src/math/probe.ts',
      token: "\nimport type { T } from '../components/store';\n",
    },
  },
  {
    name: 'a Math file imports no component or hook value from @alidade/ui (Req 1.2, D1)',
    applies: inMath,
    violates: (v) => uiValueImports(v.code).some(isComponentOrHookName),
    probe: {
      path: 'src/math/probe.ts',
      token: "\nimport { MapView, type Timer } from '@alidade/ui';\n",
    },
  },
  // --- globals (Req 1.2, 1.3, 1.5) ---
  ...GLOBALS.map(([name, pattern, token]): Rule => ({
    name: `no ${name} in the Math layer, the Adapters or the Components (Req 1.2, 1.3, 1.5)`,
    applies: inLayers,
    violates: scan('bare', pattern),
    probe: { path: 'src/math/probe.ts', token: `\nconst probe = ${token};\n` },
  })),
  {
    name: 'no Date at all in the Math layer (Req 1.2; math-conventions: time is a number)',
    applies: inMath,
    violates: scan('bare', /(?<![.\w$])Date\b/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = Date.UTC(2026, 0, 1);\n' },
  },
  // --- what only one module may name (Req 1.3, 1.4, 12.1) ---
  {
    name: 'fetch, XMLHttpRequest, WebSocket, EventSource and sendBeacon nowhere (Req 1.3)',
    applies: anywhere,
    violates: scan(
      'bare',
      /(?<![.\w$])fetch\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
    ),
    probe: { path: 'src/main.tsx', token: '\nconst probe = new WebSocket("x");\n' },
  },
  {
    name: 'navigator.share and navigator.clipboard nowhere (Req 1.3)',
    applies: anywhere,
    violates: scan('bare', /\bnavigator\s*\.\s*(?:clipboard|share)\b/),
    probe: { path: 'src/main.tsx', token: '\nconst probe = navigator.share;\n' },
  },
  {
    name: 'localStorage, sessionStorage and indexedDB only in adapters/storage.ts (Req 1.3)',
    applies: notExactly(STORAGE),
    violates: scan('bare', /\b(?:localStorage|sessionStorage|indexedDB)\b/),
    probe: { path: 'src/main.tsx', token: '\nconst probe = globalThis.indexedDB;\n' },
  },
  ...(
    [
      ['geolocation', /\bgeolocation\b/],
      ['permissions', /\bpermissions\b/],
      ['screen.orientation', /\bscreen\.orientation\b/],
      ['getUserMedia', /\bgetUserMedia\b/],
    ] as const
  ).map(([name, pattern]): Rule => ({
    name: `${name} nowhere in the package (Req 1.4)`,
    applies: anywhere,
    violates: scan('bare', pattern),
    probe: { path: 'src/main.tsx', token: `\nconst probe = globalThis.${name};\n` },
  })),
  {
    name: 'visibilitychange nowhere in the package (Req 1.4)',
    applies: anywhere,
    violates: scan('code', /visibilitychange/),
    probe: { path: 'src/main.tsx', token: "\nconst probe = 'visibilitychange';\n" },
  },
  {
    name: 'DeviceOrientationEvent only as `typeof DeviceOrientationEvent` in main.tsx (Req 1.4, 13.1)',
    applies: anywhere,
    violates: (v, p) =>
      p === 'src/main.tsx'
        ? /\bDeviceOrientationEvent\b(?<!\btypeof\s+DeviceOrientationEvent\b)/.test(
            v.bare.replace(/\btypeof\s+DeviceOrientationEvent\b/g, 'TYPEOF_OK'),
          )
        : /\bDeviceOrientationEvent\b/.test(v.bare),
    probe: { path: 'src/main.tsx', token: '\nconst probe = DeviceOrientationEvent;\n' },
  },
  {
    name: 'startPosition only in components/ask-location.ts (Req 1.4, 11.2, 15.2)',
    applies: notExactly(ASK_LOCATION),
    violates: scan('bare', /\bstartPosition\b/),
    probe: { path: 'src/components/probe.ts', token: '\nconst probe = source.startPosition;\n' },
  },
  // --- time (Req 1.5) ---
  {
    name: 'setInterval, clearInterval and Date.now only in src/defaults.ts (Req 1.5)',
    applies: notExactly(DEFAULTS),
    violates: scan('bare', /\bsetInterval\b|\bclearInterval\b|\bDate\.now\b/),
    probe: { path: 'src/main.tsx', token: '\nconst probe = Date.now();\n' },
  },
  // --- units and constants the skeleton owns (Req 1.6, 1.7; design §12) ---
  {
    name: 'the only degree conversion factor is in math/degrees.ts (Req 1.7)',
    applies: notExactly('src/math/degrees.ts'),
    violates: scan('bare', /Math\.PI\s*\)?\s*\/\s*180\b|\b180\s*\/\s*\(?\s*Math\.PI\b/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = (2 * Math.PI) / 180;\n' },
  },
  {
    name: 'the string Deg in a name only in the files of the I/O boundaries (Req 1.7)',
    applies: (p) => !DEG_FILES.includes(p),
    violates: scan('bare', /[a-z0-9]Deg(?![a-z])/),
    probe: { path: 'src/math/probe.ts', token: '\nconst azimuthDeg = 1;\n' },
  },
  {
    name: 'no copy of Core\u2019s 95 % scale: 2.4477 appears nowhere (Req 1.6)',
    applies: anywhere,
    violates: scan('bare', /(?<![\w.])2\.4477(?!\w)/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = 2.4477;\n' },
  },
  {
    name: 'no copy of Core\u2019s outlier threshold: 3.5 appears nowhere as a number (Req 1.6)',
    applies: anywhere,
    violates: scan('bare', /(?<![\w.])3\.5(?![\w.])/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = 3.5;\n' },
  },
  {
    name: 'no copy of Core\u2019s 20 degree poor-geometry limit: 0.3490658503988659 appears nowhere (Req 1.6)',
    applies: anywhere,
    violates: scan('bare', /0\.349065850398865\d*/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = 0.3490658503988659;\n' },
  },
  // --- parameters (Req 14.2) ---
  {
    name: 'defaultParameters is called only in main.tsx, the simulation and math/parameters.ts (Req 14.2)',
    applies: (p) =>
      !['src/main.tsx', 'src/math/parameters.ts'].includes(p) &&
      !p.startsWith('src/components/simulation/'),
    violates: scan('bare', /\bdefaultParameters\b/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = defaultParameters();\n' },
  },
  // --- hosts and URLs (Req 1.3, 9.6) ---
  {
    name: 'no absolute http(s) URL literal anywhere: the tile host comes from the environment (Req 1.3, 9.6)',
    applies: anywhere,
    violates: scan('code', /https?:\/\/(?!localhost\b|127\.0\.0\.1\b)[A-Za-z0-9]/),
    probe: { path: 'src/main.tsx', token: "\nconst probe = 'https://example.org/x';\n" },
  },
  {
    name: 'no src or href is set to anything but a fragment or a data: URL (Req 1.3)',
    applies: anywhere,
    violates: scan(
      'code',
      /\b(?:src|href)\s*=(?!=)\s*(?!\{?\s*['"`](?:#|data:))|\.(?:src|href)\s*=(?!=)|setAttribute\s*\(\s*['"](?:src|href)['"]/,
    ),
    probe: { path: 'src/main.tsx', token: '\nconst probe = <a href="x">x</a>;\n' },
  },
  {
    name: 'there is no index.ts: Nonius exports no public API (Req 1.1)',
    applies: (p) => /(^|\/)index\.tsx?$/.test(p),
    violates: () => true,
    probe: { path: 'src/index.ts', token: '\n' },
  },
];

function violations(rule: Rule, sources: Readonly<Record<string, View>>): string[] {
  return Object.entries(sources)
    .filter(([path, view]) => rule.applies(path) && rule.violates(view, path))
    .map(([path]) => path);
}

describe('the source scans (design §12)', () => {
  it('knows every non-test source file', () => {
    const found = Object.keys(FILES)
      .filter((p) => !/\.test\.tsx?$/.test(p) && !p.includes('test-support/'))
      .sort();
    expect(found).toEqual([...SOURCES].sort());
  });

  for (const rule of RULES) {
    describe(rule.name, () => {
      it('bites: a source with the token added is a violation', () => {
        const { path, token } = rule.probe;
        expect(rule.applies(path)).toBe(true);
        const before = VIEWS[path];
        if (before !== undefined) expect(rule.violates(before, path)).toBe(false);
        const base = FILES[path] ?? THROWAWAY;
        // The probe stands alone: a real violation elsewhere does not hide it.
        const probed = { [path]: views(base + token) };
        expect(violations(rule, probed)).toEqual([path]);
      });

      it('holds for every source', () => {
        expect(violations(rule, VIEWS)).toEqual([]);
      });
    });
  }

  it('lets main.tsx name DeviceOrientationEvent by typeof alone', () => {
    const rule = RULES.find((r) => r.name.startsWith('DeviceOrientationEvent'));
    if (rule === undefined) throw new Error('rule missing');
    const ok = views('const a = typeof DeviceOrientationEvent !== "undefined";');
    expect(rule.violates(ok, 'src/main.tsx')).toBe(false);
    expect(rule.violates(ok, 'src/components/App.tsx')).toBe(true);
  });

  it('reads comments as comments and strings as strings', () => {
    const v = views("const a = 'x // y'; // window.z\nconst b = `t ${'s'}`; /* document.q */");
    expect(v.code).toContain("'x // y'");
    expect(v.code).not.toContain('window.z');
    expect(v.code).not.toContain('document.q');
    expect(v.bare).not.toContain('x // y');
  });

  it('knows the layer of a file by its nearest folder (D1)', () => {
    expect(layerOf('src/math/sun/sun-wrapper.ts')).toBe('math');
    expect(layerOf('src/adapters/storage.ts')).toBe('adapters');
    expect(layerOf('src/components/simulation/SimulationShell.tsx')).toBe('components');
    expect(layerOf('src/main.tsx')).toBe(null);
  });

  it('tells a component or a hook from a constant, a function and a type (D1)', () => {
    for (const name of ['MapView', 'DeviceSighting', 'useSightingSession'])
      expect(isComponentOrHookName(name)).toBe(true);
    for (const name of ['MAX_APP_LAYERS', 'UI_REASONS', 'messageFor', 'sceneFromOffsets'])
      expect(isComponentOrHookName(name)).toBe(false);
    expect(
      uiValueImports("import { MapView, type Timer, messageFor as m } from '@alidade/ui';"),
    ).toEqual(['MapView', 'messageFor']);
    expect(uiValueImports("import type { MapView } from '@alidade/ui';")).toEqual([]);
  });
});

describe('packaging (Req 1.1, 1.8, 3.1)', () => {
  type Pkg = {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    exports?: unknown;
    main?: unknown;
  };
  const pkg = JSON.parse(PACKAGE_JSON) as Pkg;
  const vigia = JSON.parse(VIGIA_PACKAGE_JSON) as Pkg;

  it('depends at run time on the three packages, React, maplibre-gl and astronomy-engine only', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
        '@alidade/core',
        '@alidade/sensors',
        '@alidade/ui',
        'astronomy-engine',
        'maplibre-gl',
        'react',
        'react-dom',
      ].sort(),
    );
  });

  it('lists the three packages as workspace:* and astronomy-engine at exactly 2.1.19', () => {
    for (const name of ['@alidade/core', '@alidade/sensors', '@alidade/ui'])
      expect(pkg.dependencies[name]).toBe('workspace:*');
    expect(pkg.dependencies['astronomy-engine']).toBe('2.1.19');
  });

  it('pins every dependency to an exact version', () => {
    const all = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const [name, version] of Object.entries(all)) {
      if (version === 'workspace:*') continue;
      expect({ name, version }).toEqual({
        name,
        version: expect.stringMatching(/^\d+\.\d+\.\d+$/),
      });
    }
    expect(JSON.stringify(all)).not.toMatch(/[\^~]/);
  });

  it('uses the versions of apps/vigia for everything else', () => {
    for (const name of ['maplibre-gl', 'react', 'react-dom']) {
      expect({ name, version: pkg.dependencies[name] }).toEqual({
        name,
        version: vigia.dependencies[name],
      });
    }
    expect(pkg.devDependencies).toEqual(vigia.devDependencies);
  });

  it('has no public API: no exports, no main', () => {
    expect(pkg.exports).toBeUndefined();
    expect(pkg.main).toBeUndefined();
  });

  it('has a .env.example with the four tile names and no values, and no other .env file', () => {
    const lines = ENV_EXAMPLE.split('\n').filter((l) => l.trim() !== '' && !l.startsWith('#'));
    expect(lines).toEqual([
      'VITE_TILE_URL_TEMPLATE=',
      'VITE_TILE_ATTRIBUTION=',
      'VITE_TILE_SOURCE_NAME=',
      'VITE_TILE_TERMS_URL=',
    ]);
    const hosts = [...ENV_EXAMPLE.matchAll(/https?:\/\/([^/\s{]+)/g)].map((m) => m[1] ?? '');
    for (const host of hosts) expect(host).toMatch(/\.test$/);
    expect(ENV_FILES).toEqual(['../.env.example']);
    const ignore = GITIGNORE.split('\n');
    expect(ignore).toContain('.env');
    expect(ignore).toContain('!.env.example');
  });

  it('has the ESLint block of the package in the root configuration (Req 1.8)', () => {
    const at = ESLINT_CONFIG.indexOf("'apps/nonius/**/*.{ts,tsx}'");
    expect(at).toBeGreaterThan(0);
    expect(ESLINT_CONFIG).toContain("'apps/nonius/src/**/math/**/*.ts'");
    const block = ESLINT_CONFIG.slice(at);
    expect(block).toContain("'@typescript-eslint/no-explicit-any': 'error'");
    expect(block).toContain("'react-hooks/rules-of-hooks': 'error'");
    expect(block).toContain("'react-hooks/exhaustive-deps': 'error'");
    expect(block).toContain("'@typescript-eslint/no-non-null-assertion': 'error'");
  });

  it('carries the referrer policy strict-origin in index.html', () => {
    const html = first(
      import.meta.glob<string>('../index.html', { query: '?raw', import: 'default', eager: true }),
    );
    expect(html).toContain('<meta name="referrer" content="strict-origin" />');
  });
});
