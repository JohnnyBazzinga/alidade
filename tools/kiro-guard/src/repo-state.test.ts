import { rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { makeRepository, type Fixture } from './git-fixture.ts';
import {
  formatSessionStart,
  formatStopReminder,
  parseStatus,
  readRepoState,
} from './repo-state.ts';

const made: string[] = [];
function repository(): Fixture {
  const fixture = makeRepository();
  made.push(fixture.dir);
  return fixture;
}
afterAll(() => {
  for (const dir of made) rmSync(dir, { recursive: true, force: true });
});

/** A repository with a branch, a commit and uncommitted files in each of four folders. */
function dirtyRepository(): { fixture: Fixture; hash: string } {
  const fixture = repository();
  fixture.write('README.md', 'changed\n');
  fixture.write('skeleton/core/new.ts', 'x\n');
  fixture.write('apps/vigia/x.ts', 'x\n');
  fixture.write('docs/d.md', 'x\n');
  fixture.write('notes/secret-location.txt', 'x\n');
  return { fixture, hash: fixture.git('rev-parse', '--short', 'HEAD').trim() };
}

describe('parseStatus', () => {
  it('reads the -z porcelain format, with renames, and leaves out notes/', () => {
    const text = ' M a.ts\0?? notes/x.txt\0R  new.ts\0old.ts\0A  notes/y\0?? b c.ts\0';
    expect(parseStatus(text)).toStrictEqual([
      { status: ' M', path: 'a.ts' },
      { status: 'R ', path: 'new.ts' },
      { status: '??', path: 'b c.ts' },
    ]);
  });

  it('returns nothing for an empty status', () => {
    expect(parseStatus('')).toStrictEqual([]);
  });
});

describe('readRepoState and formatSessionStart (Req 3.1)', () => {
  it('prints the branch, the last commit and the uncommitted paths, without notes/', () => {
    const { fixture, hash } = dirtyRepository();
    const state = readRepoState(fixture.dir);
    expect(formatSessionStart(state)).toBe(
      [
        'branch: main',
        `last commit: ${hash} first commit subject`,
        'uncommitted: 4',
        ' M README.md',
        '?? apps/vigia/x.ts',
        '?? docs/d.md',
        '?? skeleton/core/new.ts',
      ].join('\n') + '\n',
    );
  });

  it('never mentions the file under notes/', () => {
    const { fixture } = dirtyRepository();
    const text = formatSessionStart(readRepoState(fixture.dir));
    expect(text).not.toContain('secret-location');
    expect(text).not.toContain('notes');
  });

  it('shows the first 15 paths and counts the rest', () => {
    const fixture = repository();
    for (let i = 10; i < 27; i++) fixture.write(`docs/f${i}.md`, 'x\n');
    const lines = formatSessionStart(readRepoState(fixture.dir)).split('\n');
    expect(lines[2]).toBe('uncommitted: 17');
    expect(lines.slice(3, 18)).toHaveLength(15);
    expect(lines[18]).toBe('… and 2 more');
  });

  it('keeps the whole text under 1 500 characters for very long paths', () => {
    const fixture = repository();
    for (let i = 0; i < 20; i++) fixture.write(`docs/${'long-name-'.repeat(12)}${i}.md`, 'x\n');
    expect(formatSessionStart(readRepoState(fixture.dir)).length).toBeLessThanOrEqual(1500);
  });

  it('says detached at the short hash for a detached head', () => {
    const fixture = repository();
    const hash = fixture.git('rev-parse', '--short', 'HEAD').trim();
    fixture.git('checkout', '-q', '--detach');
    const text = formatSessionStart(readRepoState(fixture.dir));
    expect(text.split('\n')[0]).toBe(`branch: detached at ${hash}`);
    expect(text).toContain('uncommitted: 0');
  });

  it('says so in one line when the folder is not a git repository (Req 3.2)', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kiro-guard-plain-'));
    made.push(dir);
    const text = formatSessionStart(readRepoState(dir));
    expect(text).toBe('git state is not available: this folder is not a git repository.\n');
  });
});

describe('formatStopReminder (Req 3.3)', () => {
  it('names the changed packages and the four root checks, in order', () => {
    const { fixture } = dirtyRepository();
    const state = readRepoState(fixture.dir);
    expect(formatStopReminder(state)).toBe(
      [
        'Files changed under skeleton/ or apps/ (apps/vigia, skeleton/core).',
        'Before you report this as done, run from the repository root:',
        '  timeout 900 pnpm test',
        '  pnpm typecheck',
        '  pnpm lint',
        '  pnpm format:check',
      ].join('\n') + '\n',
    );
  });

  it('prints nothing when only docs/ and notes/ changed', () => {
    const fixture = repository();
    fixture.write('docs/d.md', 'x\n');
    fixture.write('notes/n.txt', 'x\n');
    expect(formatStopReminder(readRepoState(fixture.dir))).toBe('');
  });

  it('prints nothing when only notes/ changed under a skeleton-like name', () => {
    const fixture = repository();
    fixture.write('notes/skeleton/core/a.ts', 'x\n');
    expect(formatStopReminder(readRepoState(fixture.dir))).toBe('');
  });

  it('prints nothing without a repository', () => {
    expect(formatStopReminder(null)).toBe('');
  });
});
