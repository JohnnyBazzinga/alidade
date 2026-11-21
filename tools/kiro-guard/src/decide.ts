// The Guard's decision for one tool call (Req 1, design D5, §4). Pure: reads no file, starts no
// process, reads no clock. It is a guard against mistakes, not a security boundary (README).

import { isAbsolute } from 'node:path';
import { isNotesPath, isWritablePath, type PathContext } from './paths.ts';
import { basename, commandsOf } from './shell-words.ts';

export const RULE_IDS = [
  'notes-private',
  'no-pkill',
  'no-git-commit',
  'no-git-push',
  'no-dev-server',
  'no-watch-mode',
  'install-offline',
  'test-needs-timeout',
  'write-outside-repo',
  'bad-input',
] as const;

export type RuleId = (typeof RULE_IDS)[number];

export interface GuardContext extends PathContext {
  /** When given, only these rules apply (`bad-input` always does). */
  readonly only?: readonly RuleId[];
}

export type Decision =
  | { readonly allow: true }
  | {
      readonly allow: false;
      readonly rule: RuleId;
      readonly reason: string;
      readonly instead: string;
    };

const TEXT: Readonly<Record<RuleId, { reason: string; instead: string }>> = {
  'notes-private': {
    reason: 'The folder notes/ is private: it holds real locations and is never read or written.',
    instead: 'Ask the lead to paste the part you need into the conversation.',
  },
  'no-pkill': {
    reason: 'Killing processes by name can stop work that is not yours.',
    instead: 'Do not start a long-running process; if one is running, tell the lead its PID.',
  },
  'no-git-commit': {
    reason: 'This project never commits from the agent; the lead commits.',
    instead: 'Leave the files uncommitted and list them in the report.',
  },
  'no-git-push': {
    reason: 'This project never pushes from the agent; the lead pushes.',
    instead: 'Leave the work local and say what is ready.',
  },
  'no-dev-server': {
    reason:
      'A dev server or preview server keeps running after the task and is never started here.',
    instead: 'Use the tests, the type check or a build, which run once and exit.',
  },
  'no-watch-mode': {
    reason: 'Vitest without run starts watch mode, which never exits.',
    instead: 'Use timeout 300 pnpm --filter <package> test, or vitest run under timeout.',
  },
  'install-offline': {
    reason: 'Installing or adding a package changes the lockfile and needs the lead.',
    instead: 'Use pnpm install --offline or --frozen-lockfile, or ask the lead to run pnpm add.',
  },
  'test-needs-timeout': {
    reason: 'Every test run goes under timeout so that a hung test cannot hold the session.',
    instead: 'Put timeout <seconds> in front, for example timeout 600 pnpm test.',
  },
  'write-outside-repo': {
    reason: 'Writes are allowed only inside the repository and in /tmp.',
    instead: 'Write the file inside the repository, or under /tmp for a scratch output.',
  },
  'bad-input': {
    reason: 'The guard could not read the hook event, so it refuses the call.',
    instead: 'Report this to the lead; the hook input should be one JSON object under 1 MiB.',
  },
};

function refuse(rule: RuleId): Decision {
  const text = TEXT[rule];
  return { allow: false, rule, reason: text.reason, instead: text.instead };
}

/** Keys of `tool_input` that hold text to write or search for, not a path (Req 1.4). */
const BODY_KEYS: ReadonlySet<string> = new Set([
  'text',
  'content',
  'file_text',
  'oldStr',
  'newStr',
  'old_str',
  'new_str',
  'query',
  'prompt',
]);

const WRITE_TOOLS: ReadonlySet<string> = new Set([
  'fs_write',
  'write',
  'str_replace',
  'fs_append',
  'delete_file',
]);

const MAX_WALK_DEPTH = 20;

interface Collected {
  readonly paths: string[];
  readonly commands: string[];
}

/** Every string of the input that may be a path, and every shell command. */
function collect(value: unknown, key: string, depth: number, into: Collected): void {
  if (depth > MAX_WALK_DEPTH) return;
  if (typeof value === 'string') {
    if (BODY_KEYS.has(key)) return;
    if (key === 'command') into.commands.push(value);
    else if (key === 'pattern') into.paths.push(value.split(/[*?[{]/)[0] ?? '');
    else into.paths.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collect(item, key, depth + 1, into);
  } else if (typeof value === 'object' && value !== null) {
    for (const [childKey, child] of Object.entries(value))
      collect(child, childKey, depth + 1, into);
  }
}

/** A word of a shell command as a path: redirect marks and `--option=` are removed. */
function wordAsPath(word: string): string {
  const withoutRedirect = word.replace(/^[0-9]*[<>]+&?/, '');
  return withoutRedirect.startsWith('-')
    ? withoutRedirect.slice(withoutRedirect.indexOf('=') + 1)
    : withoutRedirect;
}

/** Options of `pnpm` that take a value in the next word. */
const PNPM_OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  '--filter',
  '-F',
  '--dir',
  '-C',
  '--reporter',
  '--workspace-concurrency',
]);

function scriptRule(script: string | undefined, timeoutWrapped: boolean): RuleId | null {
  if (script === undefined) return null;
  if (script === 'dev' || script === 'preview' || script === 'start') return 'no-dev-server';
  if ((script === 'test' || script.startsWith('test:')) && !timeoutWrapped) {
    return 'test-needs-timeout';
  }
  return null;
}

function skipLeadingOptions(args: readonly string[]): readonly string[] {
  let i = 0;
  while (i < args.length && (args[i] ?? '').startsWith('-')) i++;
  return args.slice(i);
}

/** The rule that refuses one command, or null (Req 1.3). */
function ruleOfCommand(
  command: string,
  args: readonly string[],
  timeoutWrapped: boolean,
): RuleId | null {
  switch (command) {
    case 'pkill':
    case 'killall':
      return 'no-pkill';
    case 'git': {
      let i = 0;
      while (i < args.length && (args[i] ?? '').startsWith('-')) {
        i += ['-C', '-c', '--namespace', '--exec-path'].includes(args[i] ?? '') ? 2 : 1;
      }
      if (args[i] === 'commit') return 'no-git-commit';
      if (args[i] === 'push') return 'no-git-push';
      return null;
    }
    case 'vite': {
      const harmless = ['build', 'optimize', '--help', '-h', '--version', '-v'];
      return args.some((arg) => harmless.includes(arg)) ? null : 'no-dev-server';
    }
    case 'vitest': {
      if (!args.some((arg) => arg === 'run' || arg === 'related' || arg === '--run')) {
        return 'no-watch-mode';
      }
      return timeoutWrapped ? null : 'test-needs-timeout';
    }
    case 'pnpm':
      return ruleOfPnpm(args, timeoutWrapped);
    default:
      return null;
  }
}

function ruleOfPnpm(args: readonly string[], timeoutWrapped: boolean): RuleId | null {
  let i = 0;
  while (i < args.length && (args[i] ?? '').startsWith('-')) {
    i += PNPM_OPTIONS_WITH_VALUE.has(args[i] ?? '') ? 2 : 1;
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  switch (sub) {
    case 'exec':
    case 'dlx': {
      const [tool, ...toolArgs] = skipLeadingOptions(rest);
      return tool === undefined ? null : ruleOfCommand(basename(tool), toolArgs, timeoutWrapped);
    }
    case 'run':
    case 'run-script':
      return scriptRule(skipLeadingOptions(rest)[0], timeoutWrapped);
    case 'add':
      return args.includes('--offline') ? null : 'install-offline';
    case 'install':
    case 'i':
      return args.includes('--offline') || args.includes('--frozen-lockfile')
        ? null
        : 'install-offline';
    case 'vite':
    case 'vitest':
      return ruleOfCommand(sub, rest, timeoutWrapped);
    default:
      return scriptRule(sub, timeoutWrapped);
  }
}

/**
 * Decides one `PreToolUse` event (Req 1.1). For every JSON value as `event` it returns a Decision
 * and never throws. Rules are tried in the order of `RULE_IDS`.
 */
export function decide(event: unknown, context: GuardContext): Decision {
  if (typeof event !== 'object' || event === null || Array.isArray(event)) {
    return refuse('bad-input');
  }
  const fields = event as Record<string, unknown>;
  const enabled = (rule: RuleId): boolean =>
    context.only === undefined || context.only.includes(rule);
  const toolName = typeof fields['tool_name'] === 'string' ? fields['tool_name'] : '';
  const cwd =
    typeof fields['cwd'] === 'string' && isAbsolute(fields['cwd'])
      ? fields['cwd']
      : context.repositoryRootAbs;
  const input = fields['tool_input'];

  const collected: Collected = { paths: [], commands: [] };
  collect(input, '', 0, collected);
  const commands = collected.commands.flatMap((command) => commandsOf(command));

  if (enabled('notes-private')) {
    const words = commands.flatMap((command) => command.words.map(wordAsPath));
    if ([...collected.paths, ...words].some((text) => isNotesPath(text, cwd, context))) {
      return refuse('notes-private');
    }
  }

  const shellRules: readonly RuleId[] = [
    'no-pkill',
    'no-git-commit',
    'no-git-push',
    'no-dev-server',
    'no-watch-mode',
    'install-offline',
    'test-needs-timeout',
  ];
  for (const command of commands) {
    const rule = ruleOfCommand(command.command, command.args, command.timeoutWrapped);
    if (rule !== null && shellRules.includes(rule) && enabled(rule)) return refuse(rule);
  }

  if (enabled('write-outside-repo') && WRITE_TOOLS.has(toolName)) {
    const path =
      typeof input === 'object' && input !== null && !Array.isArray(input)
        ? (input as Record<string, unknown>)['path']
        : undefined;
    if (typeof path === 'string' && !isWritablePath(path, cwd, context)) {
      return refuse('write-outside-repo');
    }
  }
  return { allow: true };
}
