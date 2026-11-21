// The command line of the Guard (design D1): `node tools/kiro-guard/src/main.ts <subcommand>`.
// The one file that reads standard input and sets the exit code; the decisions are in decide.ts.

import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkSpec, specPathProblem } from './check-spec.ts';
import { decide, RULE_IDS, type GuardContext, type RuleId } from './decide.ts';
import { runMathTests, stringsOf, type RunDeps } from './math-tests.ts';
import { formatSessionStart, formatStopReminder, readRepoState } from './repo-state.ts';

/** The repository root: three folders above this file (`tools/kiro-guard/src`). */
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

/** The largest hook event read from standard input, in characters (Req 1.2). */
const MAX_INPUT_LENGTH = 1_048_576;

const USAGE =
  'usage: main.ts pre-tool-use [--only <rule-id>] | session-start | stop | math-tests | check-spec [path]';

/** The real path of the longest existing prefix of an absolute path (design §4.3). */
function realPrefix(absolutePath: string): string {
  let head = absolutePath;
  let tail = '';
  for (;;) {
    if (existsSync(head)) {
      try {
        return join(realpathSync(head), tail);
      } catch {
        return absolutePath;
      }
    }
    const parent = dirname(head);
    if (parent === head) return absolutePath;
    tail = join(head.slice(parent.length), tail);
    head = parent;
  }
}

/** Standard input as text, or null when it is longer than the limit. */
async function readInput(): Promise<string | null> {
  process.stdin.setEncoding('utf8');
  let text = '';
  for await (const chunk of process.stdin) {
    text += chunk;
    if (text.length > MAX_INPUT_LENGTH) return null;
  }
  return text;
}

function isRuleId(value: string): value is RuleId {
  return (RULE_IDS as readonly string[]).includes(value);
}

/** The value of `--only`, as a list; `undefined` when absent; `'invalid'` for an unknown id. */
function parseOnly(args: readonly string[]): readonly RuleId[] | undefined | 'invalid' {
  const index = args.findIndex((arg) => arg === '--only' || arg.startsWith('--only='));
  if (index < 0) return undefined;
  const arg = args[index] ?? '';
  const value = arg.startsWith('--only=') ? arg.slice('--only='.length) : (args[index + 1] ?? '');
  const ids = value.split(',').filter((id) => id.length > 0);
  if (ids.length === 0 || !ids.every(isRuleId)) return 'invalid';
  return ids;
}

function refusalLine(rule: RuleId, reason: string, instead: string): string {
  return `kiro-guard: refused [${rule}] ${reason} Instead: ${instead}\n`;
}

async function preToolUse(args: readonly string[]): Promise<number> {
  const bad = (reason: string): number => {
    process.stderr.write(refusalLine('bad-input', reason, 'Report this to the lead.'));
    return 2;
  };
  const only = parseOnly(args);
  if (only === 'invalid') return bad('The --only option names a rule that does not exist.');
  const input = await readInput();
  if (input === null) return bad('The hook event is longer than 1 MiB.');
  let event: unknown;
  try {
    event = JSON.parse(input);
  } catch {
    return bad('The hook event is not valid JSON.');
  }
  const context: GuardContext = {
    repositoryRootAbs: REPOSITORY_ROOT,
    homeAbs: homedir(),
    realPrefix,
    ...(only === undefined ? {} : { only }),
  };
  const decision = decide(event, context);
  if (decision.allow) return 0;
  process.stderr.write(refusalLine(decision.rule, decision.reason, decision.instead));
  return 2;
}

/** The hook event of an informing command: parsed leniently, `{}` when it is not JSON. */
async function readLenientEvent(): Promise<unknown> {
  const input = await readInput();
  try {
    return input === null ? {} : JSON.parse(input);
  } catch {
    return {};
  }
}

function sessionStart(): number {
  process.stdout.write(formatSessionStart(readRepoState(REPOSITORY_ROOT)));
  return 0;
}

function stop(): number {
  process.stdout.write(formatStopReminder(readRepoState(REPOSITORY_ROOT)));
  return 0;
}

function realRunDeps(): RunDeps {
  return {
    exists: (relativePath) => existsSync(join(REPOSITORY_ROOT, relativePath)),
    packageName: (packageDir) => {
      try {
        const parsed: unknown = JSON.parse(
          readFileSync(join(REPOSITORY_ROOT, packageDir, 'package.json'), 'utf8'),
        );
        const name = (parsed as { name?: unknown }).name;
        return typeof name === 'string' ? name : null;
      } catch {
        return null;
      }
    },
    changedFiles: () => (readRepoState(REPOSITORY_ROOT)?.entries ?? []).map((entry) => entry.path),
    run: (file, args, cwd) =>
      spawnSync(file, args, {
        cwd,
        encoding: 'utf8',
        timeout: 320_000,
        maxBuffer: 64 * 1024 * 1024,
      }),
  };
}

async function mathTests(): Promise<number> {
  const result = runMathTests(await readLenientEvent(), REPOSITORY_ROOT, realRunDeps());
  (result.exitCode === 0 ? process.stdout : process.stderr).write(result.output);
  return result.exitCode;
}

async function checkSpecCommand(args: readonly string[]): Promise<number> {
  const fromArgument = args.find((arg) => !arg.startsWith('-'));
  let path = fromArgument;
  if (path === undefined) {
    const named = stringsOf(await readLenientEvent()).filter((text) =>
      text.endsWith('requirements.md'),
    );
    path = named.find((text) => specPathProblem(text, REPOSITORY_ROOT) === null) ?? named[0];
  }
  const problem =
    path === undefined
      ? 'the hook event names no requirements.md.'
      : specPathProblem(path, REPOSITORY_ROOT);
  if (path === undefined || problem !== null) {
    process.stderr.write(
      `check-spec: ${problem ?? ''} It checks .kiro/specs/<name>/requirements.md.\n`,
    );
    return 1;
  }
  let text: string;
  try {
    text = readFileSync(resolve(REPOSITORY_ROOT, path), 'utf8');
  } catch {
    process.stderr.write(`check-spec: ${path} could not be read.\n`);
    return 1;
  }
  const problems = checkSpec(text, path);
  if (problems.length === 0) return 0;
  process.stderr.write(problems.join('\n') + '\n');
  return 1;
}

async function main(argv: readonly string[]): Promise<number> {
  const [command, ...args] = argv;
  switch (command) {
    case 'pre-tool-use':
      return preToolUse(args);
    case 'session-start':
      return sessionStart();
    case 'stop':
      return stop();
    case 'math-tests':
      return mathTests();
    case 'check-spec':
      return checkSpecCommand(args);
    default:
      process.stderr.write(USAGE + '\n');
      return 1;
  }
}

process.exitCode = await main(process.argv.slice(2));
