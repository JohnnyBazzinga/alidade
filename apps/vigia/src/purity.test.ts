// The purity and packaging scans of Vigia (Req 1.1 to 1.10, 11.1, 11.5, 11.6, 20.1 to 20.5,
// design §5 table, §13).
//
// Each source is read twice: `code` has its comments removed and keeps its strings (so import
// specifiers and string tokens such as `frame_change` are seen), `bare` also blanks every string
// and template text (so that the English of a Message cannot trip a scan of identifiers). Every
// rule is written as data (a pattern or a check, where it applies, and a probe) and is checked
// first against a source with its token added, so that no rule can pass by matching nothing.
//
// The file list below is empty because the package has no source file yet (task 1.6). A rule
// whose files do not exist yet takes, as the base of its probe, a throwaway string; it begins to
// bite on real files as they appear, and the probe then starts from the real file at that path.

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
const UI_PACKAGE_JSON = first(
  import.meta.glob<string>('../../../skeleton/ui/package.json', {
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
  'src/defaults.ts',
  'src/math/civil-time.ts',
  'src/math/assessment/assess.ts',
  'src/math/assessment/statements.ts',
  'src/math/code/alphabet.ts',
  'src/math/code/code-link.ts',
  'src/math/code/gf31-check.ts',
  'src/math/code/sighting-code.ts',
  'src/math/degrees.ts',
  'src/math/fix/advice.ts',
  'src/math/fix/emergency-text.ts',
  'src/math/fix/fix-words.ts',
  'src/math/fix/format.ts',
  'src/math/fix/from-you.ts',
  'src/math/fix/geometry-class.ts',
  'src/math/fix/map-model.ts',
  'src/math/incident/ids.ts',
  'src/math/incident/apply-action.ts',
  'src/math/incident/incident-state.ts',
  'src/math/incident/merge.ts',
  'src/math/incident/sighting.ts',
  'src/math/incident/storage-format.ts',
  'src/math/messages.ts',
  'src/math/parameters.ts',
  'src/math/privacy-table.ts',
  'src/math/texts.ts',
  'src/reasons.ts',
  'src/result.ts',
];

const VIEWS: Readonly<Record<string, View>> = Object.fromEntries(
  SOURCES.map((p) => {
    const text = FILES[p];
    if (text === undefined) throw new Error(`not read: ${p}`);
    return [p, views(text)];
  }),
);

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

/** Resolves a relative import specifier against the importing file; `null` for a package name. */
export function resolveImport(fromPath: string, specifier: string): string | null {
  if (!specifier.startsWith('.')) return null;
  const parts = fromPath.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '.' || part === '') continue;
    if (part === '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/');
}

/** Every module specifier of a source: `from '…'` and the side-effect `import '…'`. */
function specifiers(code: string): string[] {
  return [...code.matchAll(/(?:\bfrom|\bimport)\s+'([^']*)'/g)].map((m) => m[1] ?? '');
}

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
// The rules (design §5 table), as data.

interface Rule {
  readonly name: string;
  /** Which files the rule applies to. */
  readonly applies: (path: string) => boolean;
  /** True when the file violates the rule. */
  readonly violates: (view: View, path: string) => boolean;
  /** A (possibly not yet real) source to add `token` to, and the token, for the bite check. */
  readonly probe: { readonly path: string; readonly token: string };
}

function scan(view: keyof View, pattern: RegExp): Rule['violates'] {
  return (v) => pattern.test(v[view]);
}

/** The I/O boundaries where the string `Deg` may appear in a name (design §5, Req 1.7). */
const DEG_FILES = [
  'src/math/code/sighting-code.ts',
  'src/math/network/request-boxes.ts',
  'src/overlays/wind/math/wind-parse.ts',
  'src/math/fix/fix-words.ts',
  'src/math/fix/emergency-text.ts',
  'src/math/fix/format.ts',
  'src/math/degrees.ts',
  'src/math/network/host-list.ts',
  'src/defaults.ts',
  'src/math/parameters.ts',
];

/** Globals no layer reads, and the one adapter that wraps each (it takes the object as an argument). */
const GLOBALS: readonly (readonly [
  name: string,
  pattern: RegExp,
  token: string,
  wrapper: string | null,
])[] = [
  ['document', /(?<![.\w$])document\s*[.[]/, 'document.title', null],
  ['window', /(?<![.\w$])window\s*[.[]/, 'window.innerWidth', null],
  ['navigator', /(?<![.\w$])navigator\s*[.[]/, 'navigator.language', 'src/adapters/clipboard.ts'],
  ['location', /(?<![.\w$])location\s*[.[]/, 'location.href', 'src/adapters/page-address.ts'],
  ['history', /(?<![.\w$])history\s*[.[]/, 'history.length', 'src/adapters/page-address.ts'],
  ['localStorage', /\blocalStorage\b/, 'localStorage', 'src/adapters/storage.ts'],
  ['fetch', /(?<![.\w$])fetch\s*\(/, 'fetch("x")', 'src/adapters/network-gate.ts'],
  ['Date.now', /\bDate\.now\b/, 'Date.now()', null],
  ['new Date', /\bnew\s+Date\b/, 'new Date()', null],
  ['performance', /(?<![.\w$])performance\s*\./, 'performance.now()', null],
  ['setTimeout', /\bsetTimeout\b/, 'setTimeout(f, 1)', null],
  ['setInterval', /\bsetInterval\b/, 'setInterval(f, 1)', null],
  ['Math.random', /\bMath\.random\b/, 'Math.random()', null],
  ['crypto', /(?<![.\w$])crypto\b/, 'crypto.randomUUID()', 'src/adapters/random.ts'],
  ['import(', /(?<![.\w$])import\s*\(/, "import('x')", null],
  ['import.meta', /\bimport\.meta\b/, 'import.meta.url', null],
];

const RULES: readonly Rule[] = [
  // --- imports (Req 1.1, 1.2, 10.5, 20) ---
  {
    name: 'a package is imported by its name, never by a deep path (Req 1.1)',
    applies: anywhere,
    violates: scan('code', /\b(?:from|import)\s+'@alidade\/[^']*\/[^']*'/),
    probe: { path: 'src/App.tsx', token: "\nimport { x } from '@alidade/core/src/angle';\n" },
  },
  {
    name: 'only @alidade/core, sensors, ui, react, react-dom, maplibre-gl and uqr are imported (Req 1.1, 20)',
    applies: anywhere,
    violates: scan(
      'code',
      /\b(?:from|import)\s+'(?!@alidade\/(?:core|sensors|ui)'|react'|react-dom(?:\/client)?'|maplibre-gl(?:\/dist\/maplibre-gl\.css)?'|uqr'|\.)[^']*'/,
    ),
    probe: { path: 'src/App.tsx', token: "\nimport { x } from 'lodash';\n" },
  },
  {
    name: 'nothing is imported from apps/nonius (Req 1.1)',
    applies: anywhere,
    violates: scan('code', /\bnonius\b/i),
    probe: { path: 'src/App.tsx', token: "\nimport { x } from '../../nonius/src/x';\n" },
  },
  {
    name: 'maplibre-gl is imported only by main.tsx, for its stylesheet (Req 1.1, 18.2)',
    applies: notExactly('src/main.tsx'),
    violates: scan('code', /'maplibre-gl[^']*'/),
    probe: { path: 'src/App.tsx', token: "\nimport 'maplibre-gl/dist/maplibre-gl.css';\n" },
  },
  {
    name: 'uqr is imported only by adapters/qr-encoder.ts (Req 10.5, 20.4)',
    applies: notExactly('src/adapters/qr-encoder.ts'),
    violates: scan('code', /'uqr'/),
    probe: { path: 'src/App.tsx', token: "\nimport { encode } from 'uqr';\n" },
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
  ...GLOBALS.map(([name, pattern, token, wrapper]): Rule => ({
    name: `no ${name} in the Math layer, the Adapters or the Components${wrapper === null ? '' : ` but ${wrapper}`} (Req 1.2, 1.3, 1.5)`,
    applies: (p) => inLayers(p) && p !== wrapper,
    violates: scan('bare', pattern),
    probe: { path: 'src/math/probe.ts', token: `\nconst probe = ${token};\n` },
  })),
  // --- what only one Adapter may name (Req 1.3, 11.1) ---
  ...(
    [
      [
        'fetch, XMLHttpRequest, WebSocket, EventSource and sendBeacon',
        /(?<![.\w$])fetch\s*\(|\b(?:XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/,
        'src/adapters/network-gate.ts',
        '\nconst probe = new WebSocket("x");\n',
      ],
      [
        'localStorage, sessionStorage and indexedDB',
        /\b(?:localStorage|sessionStorage|indexedDB)\b/,
        'src/adapters/storage.ts',
        '\nconst probe = globalThis.indexedDB;\n',
      ],
      [
        'navigator.clipboard and navigator.share',
        /\bnavigator\s*\.\s*(?:clipboard|share)\b/,
        'src/adapters/clipboard.ts',
        '\nconst probe = navigator.share;\n',
      ],
      [
        'crypto',
        /(?<![.\w$])crypto\b/,
        'src/adapters/random.ts',
        '\nconst probe = crypto.getRandomValues;\n',
      ],
      [
        'location and history',
        /(?<![.\w$])(?:location|history)\s*[.[]/,
        'src/adapters/page-address.ts',
        '\nconst probe = history.state;\n',
      ],
    ] as const
  ).map(([what, pattern, only, token]): Rule => ({
    name: `${what} only in ${only.slice(4)} (Req 1.3, 11.1)`,
    applies: notExactly(only),
    violates: scan('bare', pattern),
    probe: { path: 'src/App.tsx', token },
  })),
  // --- sensors and camera belong to the skeleton (Req 1.4, 10.5) ---
  ...(
    [
      ['DeviceOrientationEvent', /\bDeviceOrientationEvent\b/],
      ['geolocation', /\bgeolocation\b/],
      ['permissions', /\bpermissions\b/],
      ['screen.orientation', /\bscreen\.orientation\b/],
      ['getUserMedia', /\bgetUserMedia\b/],
      ['BarcodeDetector', /\bBarcodeDetector\b/],
      ['userAgent', /\buserAgent\b/],
    ] as const
  ).map(([name, pattern]): Rule => ({
    name: `${name} nowhere in the package (Req 1.4, 10.5)`,
    applies: anywhere,
    violates: scan('bare', pattern),
    probe: { path: 'src/App.tsx', token: `\nconst probe = globalThis.${name};\n` },
  })),
  {
    name: 'visibilitychange nowhere in the package (Req 1.4)',
    applies: anywhere,
    violates: scan('code', /visibilitychange/),
    probe: { path: 'src/App.tsx', token: "\nconst probe = 'visibilitychange';\n" },
  },
  // --- time (Req 1.5) ---
  {
    name: 'setInterval, clearInterval and Date.now only in src/system.ts (Req 1.5)',
    applies: notExactly('src/system.ts'),
    violates: scan('bare', /\bsetInterval\b|\bclearInterval\b|\bDate\.now\b/),
    probe: { path: 'src/App.tsx', token: '\nconst probe = Date.now();\n' },
  },
  // --- units (Req 1.7) ---
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
  // --- nothing the skeleton owns is repeated (Req 1.6) ---
  {
    name: 'no rotation matrix: alphaRad, betaRad and gammaRad are read nowhere (Req 1.6)',
    applies: anywhere,
    violates: scan('bare', /\b(?:alphaRad|betaRad|gammaRad)\b/),
    probe: {
      path: 'src/math/probe.ts',
      token: '\nconst probe = (r: { alphaRad: number }) => r.alphaRad;\n',
    },
  },
  {
    name: 'no ellipse formula in fix/: no Math.atan2 (the words call Core and UI) (Req 1.6)',
    applies: (p) => p.startsWith('src/math/fix/'),
    violates: scan('bare', /\bMath\.atan2\s*\(/),
    probe: { path: 'src/math/fix/probe.ts', token: '\nconst probe = Math.atan2(1, 1);\n' },
  },
  {
    name: 'no copy of a skeleton constant: frame_change, 2.4477 and ELLIPSE_VERTEX appear nowhere (Req 1.6)',
    applies: anywhere,
    violates: scan('code', /frame_change|2\.4477|ELLIPSE_VERTEX/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = 2.4477;\n' },
  },
  {
    name: 'no copy of Core\u2019s outlier threshold in assessment/: no 3.5, no CORE_OUTLIER_NORMALISED_RESIDUAL (Req 1.6)',
    applies: (p) => p.startsWith('src/math/assessment/'),
    violates: scan('bare', /(?<![\w.])3\.5(?!\w)|CORE_OUTLIER_NORMALISED_RESIDUAL/),
    probe: { path: 'src/math/assessment/probe.ts', token: '\nconst probe = 3.5;\n' },
  },
  {
    name: 'no copy of Core\u2019s outlier threshold anywhere: CORE_OUTLIER_NORMALISED_RESIDUAL is read nowhere (Req 1.6)',
    applies: anywhere,
    violates: scan('code', /CORE_OUTLIER_NORMALISED_RESIDUAL/),
    probe: { path: 'src/App.tsx', token: '\nconst probe = CORE_OUTLIER_NORMALISED_RESIDUAL;\n' },
  },
  {
    name: 'no copy of Core\u2019s 20 degree poor-geometry limit in fix/ (Req 1.6)',
    applies: (p) => p.startsWith('src/math/fix/'),
    violates: scan('bare', /(?<![\w.])20(?!\w|\.\d)/),
    probe: { path: 'src/math/fix/probe.ts', token: '\nconst probe = 20;\n' },
  },
  // --- parameters (Req 19.2) ---
  {
    name: 'defaultParameters is called only in main.tsx, the simulation and math/parameters.ts (Req 19.2)',
    applies: (p) =>
      !['src/main.tsx', 'src/math/parameters.ts'].includes(p) &&
      !p.startsWith('src/components/simulation/'),
    violates: scan('bare', /\bdefaultParameters\b/),
    probe: { path: 'src/math/probe.ts', token: '\nconst probe = defaultParameters();\n' },
  },
  // --- hosts and URLs (Req 11.1, 11.5) ---
  {
    name: 'an absolute http(s) URL literal only in math/network/host-list.ts (Req 11.2, 11.5)',
    applies: notExactly('src/math/network/host-list.ts'),
    // localhost and 127.0.0.1 are the two local page addresses of buildSightingLink (design §7.13).
    violates: scan('code', /https?:\/\/(?!localhost\b|127\.0\.0\.1\b)[A-Za-z0-9]/),
    probe: { path: 'src/App.tsx', token: "\nconst probe = 'https://example.org/x';\n" },
  },
  {
    name: 'a host name literal only in math/network/host-list.ts (Req 11.2, 11.5)',
    applies: notExactly('src/math/network/host-list.ts'),
    violates: scan('code', /['"`][^'"`\s]*\b[a-z0-9-]+\.(?:com|org|net|io|gov|edu|app|dev|test)\b/),
    probe: { path: 'src/App.tsx', token: "\nconst probe = 'tiles.example.com';\n" },
  },
  {
    name: 'no src or href is set to anything but a fragment or a data: URL (Req 11.1)',
    applies: anywhere,
    violates: scan(
      'code',
      /\b(?:src|href)\s*=(?!=)\s*(?!\{?\s*['"`](?:#|data:))|\.(?:src|href)\s*=(?!=)|setAttribute\s*\(\s*['"](?:src|href)['"]/,
    ),
    probe: { path: 'src/App.tsx', token: '\nconst probe = <a href="x">x</a>;\n' },
  },
  // --- the Overlays are one registered module (Req 1.10, D15, D21) ---
  {
    name: 'nothing imports from src/overlays/ but src/App.tsx and src/overlays-empty.ts (Req 1.10)',
    applies: (p) =>
      !p.startsWith('src/overlays/') && !['src/App.tsx', 'src/overlays-empty.ts'].includes(p),
    violates: (v, p) =>
      specifiers(v.code).some((s) => {
        const target = resolveImport(p, s);
        return target !== null && (target === 'src/overlays' || target.startsWith('src/overlays/'));
      }),
    probe: {
      path: 'src/components/probe.ts',
      token: "\nimport { OVERLAYS } from '../overlays';\n",
    },
  },
  {
    name: 'src/overlays/ imports only overlays/, math/, adapters/, components/ and result.ts of src/ (Req 1.10)',
    applies: (p) => p.startsWith('src/overlays/'),
    violates: (v, p) =>
      specifiers(v.code).some((s) => {
        const target = resolveImport(p, s);
        if (target === null) return false;
        return !/^src\/(?:overlays|math|adapters|components)(?:\/|$)|^src\/result$/.test(target);
      }),
    probe: {
      path: 'src/overlays/wind/math/probe.ts',
      token: "\nimport { x } from '../../../App';\n",
    },
  },
  {
    name: 'there is no index.ts: Vigia exports no public API (Req 1.8)',
    applies: (p) => /(^|\/)index\.tsx?$/.test(p) && p !== 'src/overlays/index.ts',
    violates: () => true,
    probe: { path: 'src/index.ts', token: '\n' },
  },
];

function violations(rule: Rule, sources: Readonly<Record<string, View>>): string[] {
  return Object.entries(sources)
    .filter(([path, view]) => rule.applies(path) && rule.violates(view, path))
    .map(([path]) => path);
}

describe('the source scans (design §5)', () => {
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
        // The probe stands alone for a path that is not a real source yet: the other files are
        // checked by the test below, so a real violation elsewhere does not hide the probe.
        const probed = { [path]: views(base + token) };
        expect(violations(rule, probed)).toEqual([path]);
      });

      it('holds for every source', () => {
        expect(violations(rule, VIEWS)).toEqual([]);
      });
    });
  }

  it('reads comments as comments and strings as strings', () => {
    const v = views("const a = 'x // y'; // window.z\nconst b = `t ${'s'}`; /* document.q */");
    expect(v.code).toContain("'x // y'");
    expect(v.code).not.toContain('window.z');
    expect(v.code).not.toContain('document.q');
    expect(v.bare).not.toContain('x // y');
  });

  it('knows the layer of a file by its nearest folder (D1), the Overlays included', () => {
    expect(layerOf('src/math/code/alphabet.ts')).toBe('math');
    expect(layerOf('src/overlays/wind/math/wind-parse.ts')).toBe('math');
    expect(layerOf('src/overlays/shared/components/Legend.tsx')).toBe('components');
    expect(layerOf('src/adapters/transport/memory-network.ts')).toBe('adapters');
    expect(layerOf('src/math/transport/transport.ts')).toBe('math');
    expect(layerOf('src/main.tsx')).toBe(null);
    expect(layerOf('src/overlays/index.ts')).toBe(null);
  });

  it('resolves relative imports and leaves package names alone', () => {
    expect(resolveImport('src/overlays/wind/math/a.ts', '../../../result')).toBe('src/result');
    expect(resolveImport('src/overlays/wind/math/a.ts', './b')).toBe('src/overlays/wind/math/b');
    expect(resolveImport('src/overlays/index.ts', './wind/math/a')).toBe(
      'src/overlays/wind/math/a',
    );
    expect(resolveImport('src/App.tsx', '@alidade/core')).toBe(null);
  });

  it('tells a component or a hook from a constant, a function and a type (D1)', () => {
    for (const name of ['MapView', 'DeviceSighting', 'SightingScreen', 'useSightingSession'])
      expect(isComponentOrHookName(name)).toBe(true);
    for (const name of [
      'MAX_APP_LAYERS',
      'UI_REASONS',
      'messageFor',
      'sceneFromOffsets',
      'user',
      'used',
    ])
      expect(isComponentOrHookName(name)).toBe(false);
    expect(
      uiValueImports("import { MapView, type Timer, messageFor as m } from '@alidade/ui';"),
    ).toEqual(['MapView', 'messageFor']);
    expect(uiValueImports("import type { MapView } from '@alidade/ui';")).toEqual([]);
  });
});

describe('packaging (Req 1.1, 1.8, 11.6, 20.1 to 20.5)', () => {
  type Pkg = {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    exports?: unknown;
    main?: unknown;
  };
  const pkg = JSON.parse(PACKAGE_JSON) as Pkg;
  const ui = JSON.parse(UI_PACKAGE_JSON) as Pkg;

  it('depends at run time on the three packages, React, maplibre-gl and uqr, and nothing else', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      [
        '@alidade/core',
        '@alidade/sensors',
        '@alidade/ui',
        'maplibre-gl',
        'react',
        'react-dom',
        'uqr',
      ].sort(),
    );
  });

  it('lists the three packages as workspace:* and uqr at exactly 0.1.3', () => {
    for (const name of ['@alidade/core', '@alidade/sensors', '@alidade/ui'])
      expect(pkg.dependencies[name]).toBe('workspace:*');
    expect(pkg.dependencies['uqr']).toBe('0.1.3');
  });

  it('pins every other dependency to an exact version', () => {
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

  it('uses the versions of skeleton/ui for everything it shares and for every dev dependency', () => {
    for (const name of ['maplibre-gl', 'react', 'react-dom']) {
      expect({ name, version: pkg.dependencies[name] }).toEqual({
        name,
        version: ui.dependencies[name],
      });
    }
    expect(pkg.devDependencies).toEqual(ui.devDependencies);
  });

  it('has an entry point and no public API: no exports, no main (Req 1.8)', () => {
    expect(pkg.exports).toBeUndefined();
    expect(pkg.main).toBeUndefined();
  });

  it('has a .env.example with names and no values, and no other .env file (Req 11.6)', () => {
    const lines = ENV_EXAMPLE.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toEqual(['VITE_TILE_URL_TEMPLATE=', 'VITE_TILE_ATTRIBUTION=']);
    expect(lines.every((l) => /^[A-Z][A-Z0-9_]*=$/.test(l))).toBe(true);
    expect(ENV_FILES).toEqual(['../.env.example']);
    const ignore = GITIGNORE.split('\n');
    expect(ignore).toContain('.env');
    expect(ignore).toContain('.env.*');
    expect(ignore).toContain('!.env.example');
  });

  it('has the ESLint block of the package in the root configuration (Req 1.8)', () => {
    expect(ESLINT_CONFIG).toContain("'apps/vigia/**/*.{ts,tsx}'");
    expect(ESLINT_CONFIG).toContain("'apps/vigia/src/**/math/**/*.ts'");
    expect(ESLINT_CONFIG).toContain("'apps/vigia/src/overlays/**/math/**/*.ts'");
    const block = ESLINT_CONFIG.slice(ESLINT_CONFIG.indexOf("'apps/vigia/**/*.{ts,tsx}'"));
    expect(block).toContain("'@typescript-eslint/no-explicit-any': 'error'");
    expect(block).toContain("'react-hooks/rules-of-hooks': 'error'");
    expect(block).toContain("'react-hooks/exhaustive-deps': 'error'");
    expect(block).toContain("'@typescript-eslint/no-non-null-assertion': 'error'");
  });
});
