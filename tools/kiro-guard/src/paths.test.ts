import { describe, expect, it } from 'vitest';
import { isNotesPath, isWritablePath, type PathContext } from './paths.ts';

const ROOT = '/home/u/p';

/** A fake `realPrefix`: `/home/u/p/link` is a symlink to the Notes folder. */
function fakeRealPrefix(path: string): string {
  return path === `${ROOT}/link` || path.startsWith(`${ROOT}/link/`)
    ? `${ROOT}/notes${path.slice(`${ROOT}/link`.length)}`
    : path;
}

const ctx: PathContext = {
  repositoryRootAbs: ROOT,
  homeAbs: '/home/u',
  realPrefix: fakeRealPrefix,
};

describe('isNotesPath (Req 1.4)', () => {
  it.each([
    'notes',
    'notes/',
    'notes/a.md',
    './notes/a.md',
    'skeleton/../notes/a.md',
    'a/b/../../notes',
    'notes//a.md',
    `${ROOT}/notes/a.md`,
    `${ROOT}//notes/`,
    `${ROOT}/x/../notes/a`,
    '~/p/notes/a',
    '$HOME/p/notes',
    '${HOME}/p/notes/a',
    'link/a.md',
    'file://' + ROOT + '/notes/a',
  ])('refuses %s from the repository root', (value) => {
    expect(isNotesPath(value, ROOT, ctx)).toBe(true);
  });

  it('resolves a relative path against the event cwd', () => {
    expect(isNotesPath('a.md', `${ROOT}/notes`, ctx)).toBe(true);
    expect(isNotesPath('../notes/a.md', `${ROOT}/docs`, ctx)).toBe(true);
    expect(isNotesPath('a.md', `${ROOT}/docs`, ctx)).toBe(false);
  });

  it.each([
    'docs/notes/a.md',
    'notes.md',
    'skeleton/core/notes.ts',
    `${ROOT}/notesx/a`,
    `${ROOT}/docs/notes`,
    '/other/notes/a',
    '~/q/notes',
    '',
    'notes-old/a',
  ])('allows the neighbour %s', (value) => {
    expect(isNotesPath(value, ROOT, ctx)).toBe(false);
  });

  it("does not take a sibling folder's notes for the repository's (a counterexample of the property)", () => {
    expect(isNotesPath('./../notes/a', ROOT, ctx)).toBe(false);
    expect(isNotesPath('../notes', ROOT, ctx)).toBe(false);
  });

  it('skips values longer than 4096 characters', () => {
    expect(isNotesPath('notes/' + 'a'.repeat(5000), ROOT, ctx)).toBe(false);
  });

  it('works without a realPrefix', () => {
    expect(isNotesPath('notes/a', ROOT, { repositoryRootAbs: ROOT, homeAbs: '/home/u' })).toBe(
      true,
    );
  });
});

describe('isWritablePath (Req 1.3, write-outside-repo)', () => {
  it.each([
    'tools/kiro-guard/src/a.ts',
    `${ROOT}/README.md`,
    '/tmp/out.txt',
    '/tmp/',
    '/tmp/a/b.txt',
    '../p/x.ts',
  ])('allows %s', (value) => {
    expect(isWritablePath(value, ROOT, ctx)).toBe(true);
  });

  it.each(['/etc/passwd', '../other/x', '/tmpx/a', '/tmp/../etc/x', '~/.bashrc', '/home/u/q/a'])(
    'refuses %s',
    (value) => {
      expect(isWritablePath(value, ROOT, ctx)).toBe(false);
    },
  );
});
