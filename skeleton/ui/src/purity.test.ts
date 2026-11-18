// The purity and packaging scans (Req 1.1 to 1.10, 16.4, 20.1, 20.5, design §10).
//
// Each source is read twice: `code` has its comments removed and keeps its strings (so import
// specifiers and string tokens such as `frame_change` are seen), `bare` also blanks every string
// and template text (so that the English of a Message cannot trip a scan of identifiers). Every
// rule is checked first against a copy of a real source with its token added, so that no rule can
// pass by matching nothing.

import { SENSOR_REASONS } from '@alidade/sensors';
import { describe, expect, it, vi } from 'vitest';
import { UI_REASONS } from './reasons';

/** Every file of `src` and `playground` as text, keyed `src/…` and `playground/…`. */
const FILES: Readonly<Record<string, string>> = Object.fromEntries(
  Object.entries({
    ...import.meta.glob<string>(['./**/*.{ts,tsx}'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
    ...import.meta.glob<string>(['../playground/**/*.{ts,tsx}', '!../playground/dist/**'], {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  }).map(([key, text]) => [key.startsWith('./') ? `src/${key.slice(2)}` : key.slice(3), text]),
);
const PACKAGE_JSON =
  Object.values(
    import.meta.glob<string>('../package.json', { query: '?raw', import: 'default', eager: true }),
  )[0] ?? '';
const ENV_EXAMPLE =
  Object.values(
    import.meta.glob<string>('../.env.example', { query: '?raw', import: 'default', eager: true }),
  )[0] ?? '';
const SENSORS_PACKAGE_JSON =
  Object.values(
    import.meta.glob<string>('../../sensors/package.json', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  )[0] ?? '';
const GITIGNORE =
  Object.values(
    import.meta.glob<string>('../../../.gitignore', {
      query: '?raw',
      import: 'default',
      eager: true,
    }),
  )[0] ?? '';

/** Every non-test source file. Adding one without listing it here fails the test below. */
const SOURCES = [
  'playground/CalibrationForm.tsx',
  'playground/CaptureList.tsx',
  'playground/Diagnostics.tsx',
  'playground/Playground.tsx',
  'playground/SimulatorMode.tsx',
  'playground/env.d.ts',
  'playground/main.tsx',
  'playground/system-timer.ts',
  'playground/vite.config.ts',
  'src/adapters/camera/browser-camera-surface.ts',
  'src/adapters/camera/camera-adapter.ts',
  'src/adapters/camera/camera-surface.ts',
  'src/adapters/map/map-adapter.ts',
  'src/adapters/map/maplibre-loader.ts',
  'src/adapters/map/maplibre-types.ts',
  'src/components/CameraImage.tsx',
  'src/components/CaptureSummary.tsx',
  'src/components/DeviceSighting.tsx',
  'src/components/ControlBar.tsx',
  'src/components/FailureNotice.tsx',
  'src/components/FixSummary.tsx',
  'src/components/ImageSurface.tsx',
  'src/components/KnownAzimuthForm.tsx',
  'src/components/LimitsNote.tsx',
  'src/components/MapView.tsx',
  'src/components/MarkRing.tsx',
  'src/components/Readout.tsx',
  'src/components/Reticle.tsx',
  'src/components/SceneImage.tsx',
  'src/components/SightingScreen.tsx',
  'src/components/SimulatorPanel.tsx',
  'src/components/YawStatusBar.tsx',
  'src/components/dom-size.ts',
  'src/components/session-driver.ts',
  'src/components/theme.ts',
  'src/components/timer.ts',
  'src/components/use-sighting-session.ts',
  'src/defaults.ts',
  'src/index.ts',
  'src/math/camera-calibration.ts',
  'src/math/contrast.ts',
  'src/math/degrees.ts',
  'src/math/diagnostics/event-rate.ts',
  'src/math/display-format.ts',
  'src/math/image-geometry.ts',
  'src/math/image-layout.ts',
  'src/math/map/app-feature.ts',
  'src/math/map/app-layer.ts',
  'src/math/map/bearing-features.ts',
  'src/math/map/fix-features.ts',
  'src/math/map/geojson.ts',
  'src/math/map/map-bounds.ts',
  'src/math/map/map-style.ts',
  'src/math/map/observer-features.ts',
  'src/math/messages.ts',
  'src/math/panel/panel-state.ts',
  'src/math/ray-uncertainty.ts',
  'src/math/scene/aim.ts',
  'src/math/scene/catalogue.ts',
  'src/math/scene/project-scene.ts',
  'src/math/scene/scene-from-offsets.ts',
  'src/math/scene/scene.ts',
  'src/math/scene/script-for-station.ts',
  'src/math/scene/target-direction.ts',
  'src/math/session/capture-spread.ts',
  'src/math/session/capture.ts',
  'src/math/session/establish-yaw.ts',
  'src/math/session/freeze.ts',
  'src/math/session/mark-altitude.ts',
  'src/math/session/mark.ts',
  'src/math/session/parameters.ts',
  'src/math/session/readout.ts',
  'src/math/session/session-events.ts',
  'src/math/session/session.ts',
  'src/math/session/step.ts',
  'src/math/session/yaw-status.ts',
  'src/reasons.ts',
  'src/result.ts',
] as const;

type View = { readonly code: string; readonly bare: string };

/** Removes comments; `bare` also blanks string and template text. Regex literals are kept. */
export function views(text: string): View {
  let code = '';
  let bare = '';
  let i = 0;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const next = text[i + 1];
    if (c === '/' && next === '/') {
      while (i < n && text[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && next === '*') {
      i += 2;
      while (i < n && !(text[i] === '*' && text[i + 1] === '/')) i += 1;
      i += 2;
      code += ' ';
      bare += ' ';
      continue;
    }
    if (c === "'" || c === '"' || c === '`') {
      let j = i + 1;
      while (j < n && text[j] !== c) {
        if (text[j] === '\\') j += 1;
        j += 1;
      }
      code += text.slice(i, j + 1);
      bare += `${c}${c}`;
      i = j + 1;
      continue;
    }
    code += c;
    bare += c;
    i += 1;
  }
  return { code, bare };
}

function read(path: string): string {
  const text = FILES[path];
  if (text === undefined) throw new Error(`not read: ${path}`);
  return text;
}
const VIEWS: Readonly<Record<string, View>> = Object.fromEntries(
  SOURCES.map((p) => [p, views(read(p))]),
);

interface Rule {
  readonly name: string;
  /** Which files the rule applies to. */
  readonly applies: (path: string) => boolean;
  readonly view: keyof View;
  readonly pattern: RegExp;
  /** A real file to add `token` to, and the token, for the check that the rule bites. */
  readonly probe: { readonly path: string; readonly token: string };
}

const inMath = (p: string) => p.startsWith('src/math/');
const inSrcLayers = (p: string) =>
  p.startsWith('src/math/') || p.startsWith('src/adapters/') || p.startsWith('src/components/');
const anywhere = () => true;

const RULES: readonly Rule[] = [
  {
    name: 'the Math layer imports only Core, Sensors and relative paths (Req 1.2)',
    applies: inMath,
    view: 'code',
    pattern: /\bfrom\s+'(?!@alidade\/core'|@alidade\/sensors'|\.)[^']*'/,
    probe: { path: 'src/math/degrees.ts', token: "\nimport { useState } from 'react';\n" },
  },
  {
    name: 'the Math layer does not reach the components, adapters or playground (Req 1.2)',
    applies: inMath,
    view: 'code',
    pattern: /\bfrom\s+'[^']*\/(components|adapters|playground)\//,
    probe: {
      path: 'src/math/degrees.ts',
      token: "\nimport type { Timer } from '../components/timer';\n",
    },
  },
  ...(
    [
      ['document', /(?<![.\w$])document\s*[.[]/, 'document.title'],
      ['window', /(?<![.\w$])window\s*[.[]/, 'window.innerWidth'],
      ['navigator', /(?<![.\w$])navigator\s*[.[]/, 'navigator.language'],
      ['screen', /(?<![.\w$])screen\s*[.[]/, 'screen.width'],
      ['localStorage', /\blocalStorage\b/, 'localStorage'],
      ['fetch', /(?<![.\w$])fetch\s*\(/, 'fetch("x")'],
      ['Date.now', /\bDate\.now\b/, 'Date.now()'],
      ['new Date', /\bnew\s+Date\b/, 'new Date()'],
      ['performance', /(?<![.\w$])performance\s*\./, 'performance.now()'],
      ['setTimeout', /\bsetTimeout\b/, 'setTimeout(f, 1)'],
      ['setInterval', /\bsetInterval\b/, 'setInterval(f, 1)'],
      ['requestAnimationFrame', /\brequestAnimationFrame\b/, 'requestAnimationFrame(f)'],
      ['Math.random', /\bMath\.random\b/, 'Math.random()'],
      ['crypto', /(?<![.\w$])crypto\s*\./, 'crypto.randomUUID()'],
      ['import(', /(?<![.\w$])import\s*\(/, "import('x')"],
      ['import.meta', /\bimport\.meta\b/, 'import.meta.url'],
    ] as const
  ).map(([name, pattern, token]): Rule => ({
    name: `no ${name} in the Math layer, the Adapters or the Components (Req 1.2, 1.5)`,
    applies: (p) =>
      inSrcLayers(p) &&
      !(name === 'navigator' && p === 'src/adapters/camera/browser-camera-surface.ts') &&
      !(name === 'import(' && p === 'src/adapters/map/maplibre-loader.ts'),
    view: 'bare',
    pattern,
    probe: { path: 'src/components/Reticle.tsx', token: `\nconst probe = ${token};\n` },
  })),
  ...(
    [
      ['DeviceOrientationEvent', /\bDeviceOrientationEvent\b/],
      ['geolocation', /\bgeolocation\b/],
      ['permissions', /\bpermissions\b/],
      ['screen.orientation', /\bscreen\.orientation\b/],
      ['visibilitychange', /\bvisibilitychange\b/],
      ['userAgent', /\buserAgent\b/],
    ] as const
  ).map(([name, pattern]): Rule => ({
    name: `${name} nowhere in the package (Req 1.3)`,
    applies: anywhere,
    view: name === 'visibilitychange' ? 'code' : 'bare',
    pattern,
    probe: {
      path: 'playground/Playground.tsx',
      token:
        name === 'visibilitychange'
          ? "\nconst probe = 'visibilitychange';\n"
          : `\nconst probe = globalThis.${name};\n`,
    },
  })),
  {
    name: 'no storage, network or analytics API anywhere, the Playground included (Req 18.7)',
    applies: anywhere,
    view: 'bare',
    pattern:
      /\b(localStorage|sessionStorage|indexedDB|caches|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b|(?<![.\w$])fetch\s*\(|\bdocument\.cookie\b/,
    probe: { path: 'playground/Playground.tsx', token: '\nvoid globalThis.localStorage;\n' },
  },
  {
    name: 'mediaDevices, MediaStream and MediaStreamTrack only in the Camera adapter (Req 1.4)',
    applies: (p) => !p.startsWith('src/adapters/camera/'),
    view: 'bare',
    pattern: /\bmediaDevices\b|\bMediaStream\b|\bMediaStreamTrack\b/,
    probe: { path: 'src/components/CameraImage.tsx', token: '\ntype Probe = MediaStream;\n' },
  },
  {
    name: 'maplibre-gl is loaded only by the loader, and only by a dynamic import (Req 1.4)',
    applies: anywhere,
    view: 'code',
    pattern: /\bfrom\s+'maplibre-gl'|\brequire\s*\(\s*'maplibre-gl'/,
    probe: {
      path: 'src/adapters/map/maplibre-loader.ts',
      token: "\nimport type { Map } from 'maplibre-gl';\n",
    },
  },
  {
    name: 'no other module imports maplibre-gl dynamically (Req 1.4)',
    applies: (p) => p !== 'src/adapters/map/maplibre-loader.ts',
    view: 'code',
    pattern: /\bimport\s*\(\s*'maplibre-gl'\s*\)/,
    probe: { path: 'src/adapters/map/map-adapter.ts', token: "\nvoid import('maplibre-gl');\n" },
  },
  {
    name: 'addSource, addLayer, removeLayer and removeSource are called only by the Map adapter (D31)',
    applies: (p) => !p.startsWith('src/adapters/map/'),
    view: 'bare',
    pattern: /\.(addSource|addLayer|removeLayer|removeSource)\s*\(/,
    probe: {
      path: 'src/components/MapView.tsx',
      token: '\nconst probe = (m: { addLayer(): void }) => m.addLayer();\n',
    },
  },
  {
    name: 'setInterval, clearInterval and Date.now only in playground/system-timer.ts (Req 1.5)',
    applies: (p) => p !== 'playground/system-timer.ts',
    view: 'bare',
    pattern: /\bsetInterval\b|\bclearInterval\b|\bDate\.now\b|\bsetTimeout\b|\bperformance\.now\b/,
    probe: { path: 'playground/main.tsx', token: '\nconst probe = Date.now();\n' },
  },
  {
    name: 'the only degree conversion factor is in degrees.ts (Req 1.10)',
    applies: (p) => p !== 'src/math/degrees.ts',
    view: 'bare',
    pattern: /Math\.PI\s*\)?\s*\/\s*180\b|\b180\s*\/\s*\(?\s*Math\.PI\b/,
    probe: { path: 'src/components/Readout.tsx', token: '\nconst probe = (2 * Math.PI) / 180;\n' },
  },
  {
    name: 'no rotation matrix: alphaRad, betaRad, gammaRad are read nowhere (Req 16.4)',
    applies: anywhere,
    view: 'bare',
    pattern: /\b(alphaRad|betaRad|gammaRad)\b/,
    probe: {
      path: 'src/math/scene/project-scene.ts',
      token: '\nconst probe = (r: { alphaRad: number }) => r.alphaRad;\n',
    },
  },
  {
    name: 'no Spread and no inverse ray of its own in the Session (Sensors 1.10)',
    applies: (p) => p.startsWith('src/math/session/'),
    view: 'bare',
    pattern: /\bMath\.log1?p?\b|\bMath\.atan2\s*\(/,
    probe: { path: 'src/math/session/readout.ts', token: '\nconst probe = Math.log1p(1);\n' },
  },
  {
    name: 'no copy of the invalidation rule: the string frame_change appears nowhere (Sensors 1.10)',
    applies: anywhere,
    view: 'code',
    pattern: /frame_change/,
    probe: { path: 'src/math/session/yaw-status.ts', token: "\nconst probe = 'frame_change';\n" },
  },
  {
    name: 'index.ts exports nothing from playground or test-support (Req 1.7)',
    applies: (p) => p === 'src/index.ts',
    view: 'code',
    pattern: /\bfrom\s+'[^']*(playground|test-support)[^']*'/,
    probe: {
      path: 'src/index.ts',
      token: "\nexport { FakeTimer } from './test-support/fake-timer';\n",
    },
  },
];

function violations(rule: Rule, sources: Readonly<Record<string, View>>): string[] {
  return Object.entries(sources)
    .filter(([path, view]) => rule.applies(path) && rule.pattern.test(view[rule.view]))
    .map(([path]) => path);
}

describe('the source scans (design §10)', () => {
  it('knows every non-test source file', () => {
    const found = Object.keys(FILES)
      .filter((p) => !/\.test\.tsx?$/.test(p) && !p.includes('test-support/'))
      .sort();
    expect(found).toEqual([...SOURCES].sort());
  });

  for (const rule of RULES) {
    describe(rule.name, () => {
      it('bites: a real source with the token added is a violation', () => {
        const { path, token } = rule.probe;
        expect(rule.applies(path)).toBe(true);
        const before = VIEWS[path];
        if (before === undefined) throw new Error(`unknown probe ${path}`);
        expect(rule.pattern.test(before[rule.view])).toBe(false);
        const probed = { ...VIEWS, [path]: views(read(path) + token) };
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

  it('builds UI_REASONS from Sensors\u2019 SENSOR_REASONS, which it starts with (D2)', () => {
    expect(UI_REASONS.slice(0, SENSOR_REASONS.length)).toEqual([...SENSOR_REASONS]);
    expect(VIEWS['src/reasons.ts']?.code).toMatch(/\.\.\.SENSOR_REASONS/);
  });
});

describe('packaging (Req 1.1, 1.7, 20.1, 20.5)', () => {
  const pkg = JSON.parse(PACKAGE_JSON) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
    exports: Record<string, string>;
  };

  it('depends at run time on exactly the five packages, Core and Sensors as workspace:*', () => {
    expect(Object.keys(pkg.dependencies).sort()).toEqual(
      ['@alidade/core', '@alidade/sensors', 'maplibre-gl', 'react', 'react-dom'].sort(),
    );
    expect(pkg.dependencies['@alidade/core']).toBe('workspace:*');
    expect(pkg.dependencies['@alidade/sensors']).toBe('workspace:*');
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

  it('uses the test tooling of Sensors at the same versions (Req 20.4)', () => {
    const sensors = JSON.parse(SENSORS_PACKAGE_JSON) as { devDependencies: Record<string, string> };
    for (const name of ['vitest', 'fast-check', 'vite', 'typescript']) {
      expect({ name, version: pkg.devDependencies[name] }).toEqual({
        name,
        version: sensors.devDependencies[name],
      });
    }
  });

  it('exports only "."', () => {
    expect(pkg.exports).toEqual({ '.': './src/index.ts' });
  });

  it('has a .env.example with names and no values, and .env files are ignored', () => {
    const lines = ENV_EXAMPLE.split('\n').filter((l) => l.trim() !== '');
    expect(lines).toEqual(['VITE_TILE_URL_TEMPLATE=', 'VITE_TILE_ATTRIBUTION=']);
    const ignore = GITIGNORE.split('\n');
    expect(ignore).toContain('.env');
    expect(ignore).toContain('.env.*');
    expect(ignore).toContain('!.env.example');
  });
});

describe('importing the package does not load maplibre-gl (Req 1.4)', () => {
  it('loads index.ts with maplibre-gl mocked to throw on load', async () => {
    vi.doMock('maplibre-gl', () => {
      throw new Error('maplibre-gl must not be loaded by importing the package');
    });
    const index = await import('./index');
    expect(typeof index.messageFor).toBe('function');
    expect(typeof index.loadMapLibre).toBe('function');
    // The loader itself does reach the mocked module, and turns its failure into a value.
    const loaded = await index.loadMapLibre();
    expect(loaded.ok).toBe(false);
    vi.doUnmock('maplibre-gl');
  });
});
