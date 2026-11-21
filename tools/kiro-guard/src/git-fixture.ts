// A temporary git repository for the Guard's tests. Not part of the Guard itself. Fixed author
// data, no signing, no network, and a home folder inside the temporary folder.

import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

export interface Fixture {
  readonly dir: string;
  git(...args: string[]): string;
  write(relativePath: string, text: string): void;
}

export function makeRepository(): Fixture {
  const dir = mkdtempSync(join(tmpdir(), 'kiro-guard-'));
  const git = (...args: string[]): string =>
    execFileSync('git', ['-c', 'commit.gpgsign=false', ...args], {
      cwd: dir,
      encoding: 'utf8',
      env: {
        PATH: process.env['PATH'],
        HOME: dir,
        GIT_CONFIG_NOSYSTEM: '1',
        GIT_AUTHOR_NAME: 'tester',
        GIT_AUTHOR_EMAIL: 'tester@example.com',
        GIT_COMMITTER_NAME: 'tester',
        GIT_COMMITTER_EMAIL: 'tester@example.com',
      },
    });
  const write = (relativePath: string, text: string): void => {
    const path = join(dir, relativePath);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, text);
  };
  git('init', '-q', '-b', 'main');
  write('README.md', 'first\n');
  git('add', 'README.md');
  git('commit', '-q', '-m', 'first commit subject');
  return { dir, git, write };
}
