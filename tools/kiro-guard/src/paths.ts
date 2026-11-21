// Paths for the Guard's rules (design §4.3). Pure: the real path of an existing prefix is given
// by the caller as `realPrefix`, so that tests can fake a symlink.

import { isAbsolute, join, resolve } from 'node:path';

/** Values longer than this are not read as paths. */
export const MAX_PATH_LENGTH = 4096;

export interface PathContext {
  readonly repositoryRootAbs: string;
  readonly homeAbs: string;
  /** Where writes are also allowed. Default `/tmp`. */
  readonly tmpAbs?: string;
  /** Replaces the longest existing prefix of an absolute path by its real path. */
  readonly realPrefix?: (absolutePath: string) => string;
}

function expand(value: string, homeAbs: string): string {
  let text = value.startsWith('file://') ? value.slice('file://'.length) : value;
  if (text === '~' || text.startsWith('~/')) text = homeAbs + text.slice(1);
  else if (text === '$HOME' || text.startsWith('$HOME/')) text = homeAbs + text.slice(5);
  else if (text === '${HOME}' || text.startsWith('${HOME}/')) text = homeAbs + text.slice(7);
  return text;
}

function inside(candidate: string, directory: string): boolean {
  return candidate === directory || candidate.startsWith(directory + '/');
}

/** The absolute form of a value and its real form. */
function forms(value: string, cwd: string, context: PathContext): readonly string[] {
  const base = isAbsolute(cwd) ? cwd : context.repositoryRootAbs;
  const absolute = resolve(base, expand(value, context.homeAbs));
  const real = context.realPrefix === undefined ? absolute : context.realPrefix(absolute);
  return [absolute, real];
}

/** True when a string names the Notes folder or something below it (Req 1.4). */
export function isNotesPath(value: string, cwd: string, context: PathContext): boolean {
  if (value.length === 0 || value.length > MAX_PATH_LENGTH) return false;
  const notes = join(context.repositoryRootAbs, 'notes');
  const notesReal = context.realPrefix === undefined ? notes : context.realPrefix(notes);
  return forms(value, cwd, context).some(
    (candidate) => inside(candidate, notes) || inside(candidate, notesReal),
  );
}

/** True when a write to this path stays inside the repository or `/tmp` (Req 1.3). */
export function isWritablePath(value: string, cwd: string, context: PathContext): boolean {
  if (value.length === 0 || value.length > MAX_PATH_LENGTH) return false;
  const roots = [context.repositoryRootAbs, context.tmpAbs ?? '/tmp'];
  const [absolute, real] = forms(value, cwd, context);
  return [absolute, real].every(
    (candidate) => candidate !== undefined && roots.some((root) => inside(candidate, root)),
  );
}
