// `math-tests`: runs the tests of a saved math file (Req 4.2, design §4.5). The path of the saved
// file is not named in the documentation, so every string of the event is read; when none names a
// math file, the changed files of `git status` are used.

import { isAbsolute, relative, resolve } from 'node:path';

const MAX_WALK_DEPTH = 20;
const MAX_PATH_LENGTH = 4096;

/** Math files: `apps/<app>/src/math/…` and `skeleton/<package>/src/math/…`. */
const MATH_FILE = /^(apps|skeleton)\/[^/]+\/src\/math\/.+\.ts$/;

/** Lines of output printed when the tests fail. */
const FAILURE_LINES = 40;

export interface RunResult {
  readonly status: number | null;
  readonly stdout: string;
  readonly stderr: string;
}

/** What the command needs from the machine, so that tests can replace it. */
export interface RunDeps {
  /** Whether a file exists, by its path relative to the repository root. */
  exists(relativePath: string): boolean;
  /** The name in `package.json` of a package folder such as `apps/vigia`, or null. */
  packageName(packageDir: string): string | null;
  /** The changed files of `git status`, relative to the repository root. */
  changedFiles(): string[];
  run(file: string, args: readonly string[], cwd: string): RunResult;
}

export interface PlannedRun {
  readonly packageName: string;
  readonly packageDir: string;
  /** Test files relative to the package folder. */
  readonly testFiles: readonly string[];
}

export interface Plan {
  readonly runs: readonly PlannedRun[];
  readonly withoutTests: readonly string[];
}

/** Every string in a JSON value, at any depth and under any key. */
export function stringsOf(value: unknown, depth = 0): string[] {
  if (depth > MAX_WALK_DEPTH) return [];
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value.flatMap((item) => stringsOf(item, depth + 1));
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).flatMap((item) => stringsOf(item, depth + 1));
  }
  return [];
}

/** The strings that name a math file inside the repository, relative to its root, without repeats. */
export function mathFilesFrom(strings: readonly string[], root: string): string[] {
  const found: string[] = [];
  for (const text of strings) {
    if (text.length === 0 || text.length > MAX_PATH_LENGTH) continue;
    const path = relative(root, resolve(root, text));
    if (path.startsWith('..') || isAbsolute(path)) continue;
    if (MATH_FILE.test(path) && !found.includes(path)) found.push(path);
  }
  return found;
}

/** Which test files to run for each package (Req 4.2). */
export function planRuns(files: readonly string[], deps: RunDeps): Plan {
  const byDir = new Map<string, { name: string; testFiles: string[] }>();
  const withoutTests: string[] = [];
  for (const file of files) {
    const [top, folder] = file.split('/');
    const packageDir = `${top}/${folder}`;
    const name = deps.packageName(packageDir);
    if (name === null) continue;
    const candidates = file.endsWith('.test.ts')
      ? [file]
      : [`${file.slice(0, -3)}.test.ts`, `${file.slice(0, -3)}.property.test.ts`];
    const existing = candidates.filter((candidate) => deps.exists(candidate));
    if (existing.length === 0) {
      withoutTests.push(file);
      continue;
    }
    const entry = byDir.get(packageDir) ?? { name, testFiles: [] };
    for (const candidate of existing) {
      const inPackage = candidate.slice(packageDir.length + 1);
      if (!entry.testFiles.includes(inPackage)) entry.testFiles.push(inPackage);
    }
    byDir.set(packageDir, entry);
  }
  const runs = [...byDir.entries()].map(([packageDir, entry]) => ({
    packageName: entry.name,
    packageDir,
    testFiles: entry.testFiles,
  }));
  return { runs, withoutTests };
}

/** The `Tests …` line of vitest's summary, or `passed`. */
function summaryLine(stdout: string): string {
  const line = stdout.split('\n').find((candidate) => /^\s*Tests\s/.test(candidate));
  return line === undefined ? 'passed' : line.trim();
}

export function runMathTests(
  event: unknown,
  root: string,
  deps: RunDeps,
): { exitCode: number; output: string } {
  let files = mathFilesFrom(stringsOf(event), root);
  if (files.length === 0) files = mathFilesFrom(deps.changedFiles(), root);
  if (files.length === 0) return { exitCode: 0, output: '' };

  const plan = planRuns(files, deps);
  let output = plan.withoutTests.map((file) => `math-tests: no test file for ${file}\n`).join('');
  let exitCode = 0;
  for (const run of plan.runs) {
    const result = deps.run(
      'timeout',
      ['300', 'pnpm', '--filter', run.packageName, 'exec', 'vitest', 'run', ...run.testFiles],
      root,
    );
    if (result.status === 0) {
      output += `math-tests: ${run.packageName}: ${summaryLine(result.stdout)}\n`;
    } else {
      exitCode = 1;
      const text = [result.stdout, result.stderr].filter((part) => part.length > 0).join('\n');
      output +=
        text.trim().length === 0
          ? `math-tests: ${run.packageName}: the tests failed or timed out (status ${result.status}).\n`
          : text.trimEnd().split('\n').slice(-FAILURE_LINES).join('\n') + '\n';
    }
  }
  return { exitCode, output };
}
