// The repository's state for `session-start` and `stop` (Req 3, design §4.4). Git is run through
// `execFileSync` with an argument array, in the repository root, without a shell, and nothing
// else is run. Every path under `notes/` is dropped before anything is formatted.

import { execFileSync } from 'node:child_process';

export interface StatusEntry {
  /** The two status letters of `git status --porcelain`, for example ` M` or `??`. */
  readonly status: string;
  readonly path: string;
}

export interface RepoState {
  /** `main`, or `detached at <hash>`. */
  readonly branch: string;
  /** The short hash and the subject of the last commit. */
  readonly lastCommit: string;
  readonly entries: readonly StatusEntry[];
}

/** The longest text `session-start` prints (Req 3.1). */
const MAX_SESSION_START_LENGTH = 1500;

/** The most uncommitted paths `session-start` lists (Req 3.1). */
const MAX_LISTED_PATHS = 15;

/** The longest branch name or commit subject printed, in characters. */
const MAX_LINE_LENGTH = 200;

function inNotes(path: string): boolean {
  return path === 'notes' || path.startsWith('notes/');
}

/** Parses `git status --porcelain=v1 -z`, leaving out `notes/` (a rename is one entry). */
export function parseStatus(text: string): StatusEntry[] {
  const parts = text.split('\0');
  const entries: StatusEntry[] = [];
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i] ?? '';
    if (part.length < 4) continue;
    const status = part.slice(0, 2);
    const path = part.slice(3);
    let original = '';
    if (status.includes('R') || status.includes('C')) {
      original = parts[i + 1] ?? '';
      i++;
    }
    if (!inNotes(path) && !inNotes(original)) entries.push({ status, path });
  }
  return entries;
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 16 * 1024 * 1024,
    env: { PATH: process.env['PATH'], HOME: process.env['HOME'], LC_ALL: 'C' },
  });
}

/** The state of the repository at `root`, or null when it is not a repository or git fails. */
export function readRepoState(root: string): RepoState | null {
  try {
    git(root, ['rev-parse', '--is-inside-work-tree']);
    let hash = '';
    try {
      hash = git(root, ['rev-parse', '--short', 'HEAD']).trim();
    } catch {
      hash = '';
    }
    const current = git(root, ['branch', '--show-current']).trim();
    const branch = current.length > 0 ? current : `detached at ${hash}`;
    const status = git(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
    let lastCommit = '(no commits)';
    if (hash.length > 0) lastCommit = git(root, ['log', '-1', '--format=%h %s']).trim();
    return { branch, lastCommit, entries: parseStatus(status) };
  } catch {
    return null;
  }
}

function clip(text: string): string {
  return text.length > MAX_LINE_LENGTH ? text.slice(0, MAX_LINE_LENGTH - 1) + '…' : text;
}

/** The text `session-start` prints (Req 3.1, 3.2). */
export function formatSessionStart(state: RepoState | null): string {
  if (state === null) {
    return 'git state is not available: this folder is not a git repository.\n';
  }
  const total = state.entries.length;
  const build = (listed: number): string => {
    const lines = [
      `branch: ${clip(state.branch)}`,
      `last commit: ${clip(state.lastCommit)}`,
      `uncommitted: ${total}`,
      ...state.entries.slice(0, listed).map((entry) => `${entry.status} ${entry.path}`),
    ];
    if (total > listed) lines.push(`… and ${total - listed} more`);
    return lines.join('\n') + '\n';
  };
  let listed = Math.min(total, MAX_LISTED_PATHS);
  let text = build(listed);
  while (text.length > MAX_SESSION_START_LENGTH && listed > 0) {
    listed--;
    text = build(listed);
  }
  return text.length > MAX_SESSION_START_LENGTH
    ? text.slice(0, MAX_SESSION_START_LENGTH - 2) + '…\n'
    : text;
}

/** The package of a path under `skeleton/` or `apps/`, such as `apps/vigia`. */
function packageOf(path: string): string {
  const parts = path.split('/');
  return parts.length >= 3 ? `${parts[0]}/${parts[1]}` : (parts[0] ?? '');
}

/** The reminder `stop` prints, or an empty text (Req 3.3). */
export function formatStopReminder(state: RepoState | null): string {
  if (state === null) return '';
  const changed = state.entries.filter(
    (entry) => entry.path.startsWith('skeleton/') || entry.path.startsWith('apps/'),
  );
  if (changed.length === 0) return '';
  const packages = [...new Set(changed.map((entry) => packageOf(entry.path)))].sort();
  return (
    [
      `Files changed under skeleton/ or apps/ (${packages.join(', ')}).`,
      'Before you report this as done, run from the repository root:',
      '  timeout 900 pnpm test',
      '  pnpm typecheck',
      '  pnpm lint',
      '  pnpm format:check',
    ].join('\n') + '\n'
  );
}
