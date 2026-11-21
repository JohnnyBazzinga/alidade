import { describe, expect, it } from 'vitest';
import { mathFilesFrom, planRuns, runMathTests, stringsOf, type RunDeps } from './math-tests.ts';

const ROOT = '/home/u/p';

const FILES = new Set([
  'apps/vigia/src/math/solve.ts',
  'apps/vigia/src/math/solve.test.ts',
  'apps/vigia/src/math/solve.property.test.ts',
  'apps/vigia/src/math/lonely.ts',
  'skeleton/ui/src/math/ray.ts',
  'skeleton/ui/src/math/ray.test.ts',
  'apps/nonius/src/math/sun.ts',
  'apps/nonius/src/math/sun.test.ts',
]);

const NAMES: Record<string, string> = {
  'apps/vigia': '@alidade/vigia',
  'apps/nonius': '@alidade/nonius',
  'skeleton/ui': '@alidade/ui',
};

interface Call {
  file: string;
  args: readonly string[];
  cwd: string;
}

function deps(results: { status: number; stdout: string; stderr: string }[] = []): {
  deps: RunDeps;
  calls: Call[];
} {
  const calls: Call[] = [];
  return {
    calls,
    deps: {
      exists: (relativePath) => FILES.has(relativePath),
      packageName: (dir) => NAMES[dir] ?? null,
      changedFiles: () => ['apps/nonius/src/math/sun.ts', 'docs/a.md'],
      run: (file, args, cwd) => {
        calls.push({ file, args, cwd });
        return results.shift() ?? { status: 0, stdout: '', stderr: '' };
      },
    },
  };
}

describe('stringsOf', () => {
  it('finds every string at any depth under any key', () => {
    expect(stringsOf({ a: 'x', b: [{ c: 'y' }, 'z'], d: 3, e: null })).toStrictEqual([
      'x',
      'y',
      'z',
    ]);
  });
});

describe('mathFilesFrom (Req 4.2)', () => {
  it('keeps relative and absolute .ts paths under src/math of apps and skeleton', () => {
    expect(
      mathFilesFrom(
        [
          'apps/vigia/src/math/solve.ts',
          `${ROOT}/skeleton/ui/src/math/ray.ts`,
          './apps/nonius/src/math/sun.test.ts',
        ],
        ROOT,
      ),
    ).toStrictEqual([
      'apps/vigia/src/math/solve.ts',
      'skeleton/ui/src/math/ray.ts',
      'apps/nonius/src/math/sun.test.ts',
    ]);
  });

  it.each([
    'apps/vigia/src/components/a.ts',
    'skeleton/core/src/angle.ts',
    'apps/vigia/src/math/readme.md',
    'tools/kiro-guard/src/math/a.ts',
    '../other/apps/vigia/src/math/a.ts',
    'notes/apps/vigia/src/math/a.ts',
    'PreToolUse',
    '',
  ])('leaves out %s', (value) => {
    expect(mathFilesFrom([value], ROOT)).toStrictEqual([]);
  });

  it('removes duplicates', () => {
    expect(
      mathFilesFrom(['apps/vigia/src/math/solve.ts', `${ROOT}/apps/vigia/src/math/solve.ts`], ROOT),
    ).toStrictEqual(['apps/vigia/src/math/solve.ts']);
  });
});

describe('planRuns', () => {
  it('maps a source file to the test files that exist, and a test file to itself', () => {
    const { deps: d } = deps();
    expect(
      planRuns(['apps/vigia/src/math/solve.ts', 'skeleton/ui/src/math/ray.test.ts'], d),
    ).toStrictEqual({
      runs: [
        {
          packageName: '@alidade/vigia',
          packageDir: 'apps/vigia',
          testFiles: ['src/math/solve.test.ts', 'src/math/solve.property.test.ts'],
        },
        {
          packageName: '@alidade/ui',
          packageDir: 'skeleton/ui',
          testFiles: ['src/math/ray.test.ts'],
        },
      ],
      withoutTests: [],
    });
  });

  it('reports a file without any test file', () => {
    const { deps: d } = deps();
    expect(planRuns(['apps/vigia/src/math/lonely.ts'], d)).toStrictEqual({
      runs: [],
      withoutTests: ['apps/vigia/src/math/lonely.ts'],
    });
  });

  it('groups the files of one package into one run', () => {
    const { deps: d } = deps();
    const plan = planRuns(['apps/vigia/src/math/solve.ts', 'apps/vigia/src/math/solve.test.ts'], d);
    expect(plan.runs).toHaveLength(1);
    expect(plan.runs[0]?.testFiles).toStrictEqual([
      'src/math/solve.test.ts',
      'src/math/solve.property.test.ts',
    ]);
  });
});

describe('runMathTests (Req 4.2)', () => {
  it('runs timeout 300 pnpm --filter <name> exec vitest run <files> in the repository root', () => {
    const { deps: d, calls } = deps([
      { status: 0, stdout: ' Tests  12 passed (12)\n', stderr: '' },
    ]);
    const result = runMathTests({ file_path: 'apps/vigia/src/math/solve.ts' }, ROOT, d);
    expect(calls).toStrictEqual([
      {
        file: 'timeout',
        args: [
          '300',
          'pnpm',
          '--filter',
          '@alidade/vigia',
          'exec',
          'vitest',
          'run',
          'src/math/solve.test.ts',
          'src/math/solve.property.test.ts',
        ],
        cwd: ROOT,
      },
    ]);
    expect(result).toStrictEqual({
      exitCode: 0,
      output: 'math-tests: @alidade/vigia: Tests  12 passed (12)\n',
    });
  });

  it('finds the saved path under any key of the event', () => {
    const { deps: d, calls } = deps();
    runMathTests({ deep: { whatever: ['skeleton/ui/src/math/ray.ts'] } }, ROOT, d);
    expect(calls[0]?.args).toContain('@alidade/ui');
  });

  it('falls back on the changed files when the event names none', () => {
    const { deps: d, calls } = deps();
    runMathTests({ hook_event_name: 'PostFileSave' }, ROOT, d);
    expect(calls[0]?.args).toContain('@alidade/nonius');
  });

  it('exits 1 and prints the last 40 lines when the tests fail', () => {
    const lines = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const { deps: d } = deps([{ status: 1, stdout: lines, stderr: '' }]);
    const result = runMathTests({ p: 'apps/vigia/src/math/solve.ts' }, ROOT, d);
    expect(result.exitCode).toBe(1);
    const printed = result.output.trimEnd().split('\n');
    expect(printed).toHaveLength(40);
    expect(printed[39]).toBe('line 99');
    expect(printed[0]).toBe('line 60');
  });

  it('exits 1 when timeout kills the run (status 124)', () => {
    const { deps: d } = deps([{ status: 124, stdout: '', stderr: '' }]);
    expect(runMathTests({ p: 'apps/vigia/src/math/solve.ts' }, ROOT, d).exitCode).toBe(1);
  });

  it('exits 0 with one line when no test file exists', () => {
    const { deps: d, calls } = deps();
    const result = runMathTests({ p: 'apps/vigia/src/math/lonely.ts' }, ROOT, d);
    expect(calls).toHaveLength(0);
    expect(result).toStrictEqual({
      exitCode: 0,
      output: 'math-tests: no test file for apps/vigia/src/math/lonely.ts\n',
    });
  });

  it('does nothing, with exit 0, when no math file was saved or changed', () => {
    const { deps: d, calls } = deps();
    d.changedFiles = () => ['docs/a.md'];
    expect(runMathTests({ p: 'docs/a.md' }, ROOT, d)).toStrictEqual({ exitCode: 0, output: '' });
    expect(calls).toHaveLength(0);
  });
});
