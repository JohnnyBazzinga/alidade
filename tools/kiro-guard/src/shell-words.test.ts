import { describe, expect, it } from 'vitest';
import { commandsOf, segmentsOf } from './shell-words.ts';

describe('segmentsOf', () => {
  it('splits at every separator outside quotes', () => {
    expect(segmentsOf('a b; c && d || e | f & g\nh')).toStrictEqual([
      ['a', 'b'],
      ['c'],
      ['d'],
      ['e'],
      ['f'],
      ['g'],
      ['h'],
    ]);
  });

  it('keeps separators inside quotes and removes the quotes', () => {
    expect(segmentsOf(`echo "a; b" 'c && d' e\\;f`)).toStrictEqual([
      ['echo', 'a; b', 'c && d', 'e;f'],
    ]);
  });

  it('joins adjacent quoted and plain parts into one word', () => {
    expect(segmentsOf(`pk""ill 'x'y`)).toStrictEqual([['pkill', 'xy']]);
  });

  it('reads command substitutions and back-quotes as further segments', () => {
    expect(segmentsOf('echo $(pkill x) `git push`')).toStrictEqual([
      ['echo'],
      ['pkill', 'x'],
      ['git', 'push'],
    ]);
  });

  it('reads a substitution inside double quotes but not inside single quotes', () => {
    expect(segmentsOf('echo "$(pkill x)"')).toStrictEqual([
      ['echo', ''],
      ['pkill', 'x'],
    ]);
    expect(segmentsOf(`echo '$(pkill x)'`)).toStrictEqual([['echo', '$(pkill x)']]);
  });

  it('reads substitutions nested to depth 4 and the rest deeper as plain text', () => {
    expect(segmentsOf('$(a $(b $(c $(pkill x))))').some((s) => s[0] === 'pkill')).toBe(true);
    expect(segmentsOf('$(a $(b $(c $(d $(pkill x)))))').some((s) => s[0] === 'pkill')).toBe(false);
  });

  it('treats parentheses as separators and drops empty segments', () => {
    expect(segmentsOf('(a b); ; (c)')).toStrictEqual([['a', 'b'], ['c']]);
    expect(segmentsOf('')).toStrictEqual([]);
  });

  it('does not throw on unbalanced quotes and substitutions', () => {
    expect(() => segmentsOf(`echo "abc $(def`)).not.toThrow();
    expect(() => segmentsOf("echo 'abc")).not.toThrow();
    expect(() => segmentsOf('echo `abc')).not.toThrow();
  });
});

describe('commandsOf', () => {
  const first = (command: string) => commandsOf(command)[0];

  it('drops assignments and prefixes with their options', () => {
    expect(first('FOO=1 BAR=2 env -i X=1 sudo -u root nice -n 5 git status')).toMatchObject({
      command: 'git',
      args: ['status'],
    });
    expect(first('xargs -n 1 echo hi')).toMatchObject({ command: 'echo', args: ['hi'] });
    expect(first('npx -y vite build')).toMatchObject({ command: 'vite', args: ['build'] });
  });

  it('takes the basename of the command', () => {
    expect(first('/usr/bin/git push')).toMatchObject({ command: 'git', args: ['push'] });
  });

  it('knows whether a timeout wraps the command, with its options and duration', () => {
    expect(first('timeout 600 pnpm test')).toMatchObject({ timeoutWrapped: true, command: 'pnpm' });
    expect(first('FOO=1 timeout -k 5 60 pnpm test')).toMatchObject({
      timeoutWrapped: true,
      command: 'pnpm',
      args: ['test'],
    });
    expect(first('time pnpm test')).toMatchObject({ timeoutWrapped: false, command: 'pnpm' });
    expect(first('pnpm test')).toMatchObject({ timeoutWrapped: false });
  });

  it('goes into bash -c, sh -c and zsh -c scripts and into substitutions', () => {
    const commands = commandsOf(`bash -c 'cd x && pkill y'; echo $(git push)`);
    expect(commands.map((c) => c.command)).toContain('pkill');
    expect(commands.map((c) => c.command)).toContain('git');
    expect(commandsOf(`sh -c "zsh -c 'pkill y'"`).map((c) => c.command)).toContain('pkill');
  });

  it('returns no command for an empty or assignment-only segment', () => {
    expect(commandsOf('FOO=1')).toStrictEqual([]);
    expect(commandsOf('')).toStrictEqual([]);
  });
});
