import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const MAIN = fileURLToPath(new URL('./main.ts', import.meta.url));
const ROOT = resolve(dirname(MAIN), '../../..');

function run(args: readonly string[], input: string) {
  return spawnSync('node', [MAIN, ...args], { input, encoding: 'utf8', timeout: 30_000 });
}

function event(command: string): string {
  return JSON.stringify({
    hook_event_name: 'PreToolUse',
    cwd: ROOT,
    tool_name: 'execute_bash',
    tool_input: { command },
  });
}

describe('pre-tool-use (Req 1.2)', () => {
  it('allows with exit 0 and nothing on either stream', () => {
    const result = run(['pre-tool-use'], event('git status'));
    expect(result).toMatchObject({ status: 0, stdout: '', stderr: '' });
  });

  it('refuses with exit 2, nothing on standard output and one line on standard error', () => {
    const result = run(['pre-tool-use'], event('git push origin main'));
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toMatch(/^kiro-guard: refused \[no-git-push\] [^\n]+ Instead: [^\n]+\n$/);
  });

  it('refuses the Notes folder of the repository the script lives in', () => {
    const result = run(['pre-tool-use'], event('cat notes/a.md'));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('[notes-private]');
  });

  it('refuses a test run without timeout and allows it with', () => {
    expect(run(['pre-tool-use'], event('pnpm test')).status).toBe(2);
    expect(run(['pre-tool-use'], event('timeout 600 pnpm test')).status).toBe(0);
  });

  it.each([
    ['text that is not JSON', 'not json'],
    ['an empty input', ''],
    ['a JSON array', '[]'],
    ['a JSON string', '"x"'],
    ['more than 1 MiB', JSON.stringify({ tool_input: { text: 'a'.repeat(1_100_000) } })],
  ])('refuses %s as bad-input', (_name, input) => {
    const result = run(['pre-tool-use'], input);
    expect(result.status).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('[bad-input]');
  });
});

describe('pre-tool-use --only (Req 1.7)', () => {
  it('applies only the listed rule', () => {
    expect(run(['pre-tool-use', '--only', 'notes-private'], event('git push')).status).toBe(0);
    const refused = run(['pre-tool-use', '--only', 'notes-private'], event('cat notes/a'));
    expect(refused.status).toBe(2);
    expect(refused.stderr).toContain('[notes-private]');
  });

  it('also reads --only=<rule>', () => {
    expect(run(['pre-tool-use', '--only=notes-private'], event('git push')).status).toBe(0);
  });

  it('refuses when the rule id is not known, so that a typo does not turn the guard off', () => {
    const result = run(['pre-tool-use', '--only', 'notes-privte'], event('git status'));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('[bad-input]');
  });
});

describe('the command line', () => {
  it('prints usage and exits 1 for an unknown subcommand', () => {
    const result = run(['nonsense'], '');
    expect(result.status).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('usage');
  });
});

describe('session-start and stop (Req 3)', () => {
  it('session-start prints the branch and last commit of this repository, never notes/', () => {
    const result = run(['session-start'], '{"hook_event_name":"SessionStart"}');
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toMatch(/^branch: .+\nlast commit: [0-9a-f]+ .+\nuncommitted: \d+\n/);
    expect(result.stdout).not.toMatch(/^.. notes(\/|$)/m);
  });

  it('stop exits 0 whatever the state, and prints the reminder or nothing', () => {
    const result = run(['stop'], '{"hook_event_name":"Stop"}');
    expect(result.status).toBe(0);
    expect(result.stdout === '' || result.stdout.includes('timeout 900 pnpm test')).toBe(true);
  });

  it('both ignore standard input that is not JSON', () => {
    expect(run(['session-start'], 'not json').status).toBe(0);
    expect(run(['stop'], '').status).toBe(0);
  });
});

describe('check-spec (Req 4.3)', () => {
  it('exits 0 with no output for a good file given as an argument', () => {
    expect(run(['check-spec', '.kiro/specs/kiro-tooling/requirements.md'], '')).toMatchObject({
      status: 0,
      stdout: '',
      stderr: '',
    });
  });

  it('takes the path from the hook event when no argument is given', () => {
    const event = JSON.stringify({
      hook_event_name: 'PostFileSave',
      file: '.kiro/specs/vigia/requirements.md',
    });
    expect(run(['check-spec'], event).status).toBe(0);
  });

  it('exits 1 for a path that is not a requirements file, or is under notes/', () => {
    for (const path of ['docs/a.md', 'notes/.kiro/specs/x/requirements.md']) {
      const result = run(['check-spec', path], '');
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('requirements');
    }
  });

  it('exits 1 when the event names no requirements file', () => {
    expect(run(['check-spec'], '{"a":"docs/a.md"}').status).toBe(1);
  });
});

describe('math-tests (Req 4.2)', () => {
  it('says so, with exit 0, for a math file that has no test file', () => {
    const event = JSON.stringify({ path: 'apps/vigia/src/math/no-such-file-anywhere.ts' });
    const result = run(['math-tests'], event);
    expect(result.status).toBe(0);
    expect(result.stdout).toBe(
      'math-tests: no test file for apps/vigia/src/math/no-such-file-anywhere.ts\n',
    );
  });
});
