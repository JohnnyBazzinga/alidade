import { describe, expect, it } from 'vitest';
import { decide, RULE_IDS, type GuardContext, type RuleId } from './decide.ts';
import { ALLOWED_COMMANDS, REFUSED_COMMANDS } from './rule-cases.ts';
import { CONTEXT, fileEvent, ROOT, shellEvent } from './test-helpers.ts';

function ruleOf(event: unknown, context: GuardContext = CONTEXT): RuleId | 'allow' {
  const decision = decide(event, context);
  return decision.allow ? 'allow' : decision.rule;
}

describe('the rules table of Req 1.3: refused', () => {
  for (const [rule, commands] of Object.entries(REFUSED_COMMANDS)) {
    it.each(commands ?? [])(`refuses %s as ${rule}`, (command) => {
      expect(ruleOf(shellEvent(command))).toBe(rule);
    });
  }
});

describe('the rules table of Req 1.3: still allowed', () => {
  it.each(ALLOWED_COMMANDS)('allows %s', (command) => {
    expect(ruleOf(shellEvent(command))).toBe('allow');
  });
});

describe('notes-private', () => {
  it.each([
    ['read_file', { path: 'notes/a.md' }],
    ['fs_read', { path: `${ROOT}/notes/a.md` }],
    ['read', { paths: ['docs/a.md', './notes'] }],
    ['fs_write', { path: 'notes/out.md', text: 'x' }],
    ['str_replace', { path: 'skeleton/../notes/a', oldStr: 'a', newStr: 'b' }],
    ['glob', { pattern: 'notes/**/*.md' }],
    ['grep', { pattern: 'x', path: '~/p/notes' }],
    ['some_future_tool', { deep: { list: [{ target: 'link/a.md' }] } }],
  ])('refuses %s with %j', (tool, input) => {
    expect(ruleOf(fileEvent(tool, input))).toBe('notes-private');
  });

  it.each([
    'cat notes/a.md',
    `ls ${ROOT}/notes`,
    'cd notes && ls',
    'cat < notes/a',
    'echo hi > notes/out',
    'grep -r x ./notes/',
    'cat --file=notes/a',
    'bash -c "cat notes/a"',
    'echo $(cat notes/a)',
  ])('refuses the shell command %s', (command) => {
    expect(ruleOf(shellEvent(command))).toBe('notes-private');
  });

  it('uses the event cwd for relative paths', () => {
    expect(ruleOf(fileEvent('read_file', { path: 'a.md' }, `${ROOT}/notes`))).toBe('notes-private');
    expect(ruleOf(fileEvent('read_file', { path: 'a.md' }, `${ROOT}/docs`))).toBe('allow');
  });

  it.each([
    ['read_file', { path: 'docs/notes/a.md' }],
    ['read_file', { path: 'notes.md' }],
    ['read_file', { path: 'skeleton/core/notes.ts' }],
    ['fs_write', { path: 'docs/a.md', text: 'see notes/ for more' }],
    ['fs_write', { path: 'docs/a.md', content: 'notes/a' }],
    ['str_replace', { path: 'docs/a.md', oldStr: 'notes/a', newStr: 'notes/b' }],
    ['grep', { pattern: 'x', path: 'docs' }],
  ])('allows %s with %j', (tool, input) => {
    expect(ruleOf(fileEvent(tool, input))).toBe('allow');
  });
});

describe('write-outside-repo', () => {
  it.each([
    ['fs_write', '/etc/x'],
    ['write', '../other/x'],
    ['str_replace', '/tmpx/a'],
    ['fs_append', '/tmp/../etc/x'],
    ['delete_file', '/home/u/q/a'],
  ])('refuses %s to %s', (tool, path) => {
    expect(ruleOf(fileEvent(tool, { path, text: 'x' }))).toBe('write-outside-repo');
  });

  it.each([
    ['fs_write', 'tools/kiro-guard/src/a.ts'],
    ['write', '/tmp/out.txt'],
    ['str_replace', `${ROOT}/README.md`],
  ])('allows %s to %s', (tool, path) => {
    expect(ruleOf(fileEvent(tool, { path, text: 'x' }))).toBe('allow');
  });

  it('does not restrict reads outside the repository', () => {
    expect(ruleOf(fileEvent('read_file', { path: '/etc/hostname' }))).toBe('allow');
  });

  it('says notes-private, not write-outside-repo, for a write to notes', () => {
    expect(ruleOf(fileEvent('fs_write', { path: 'notes/a', text: 'x' }))).toBe('notes-private');
  });
});

describe('bad-input', () => {
  it.each([null, [], 'x', 5, true, undefined])('refuses the event %j', (event) => {
    expect(ruleOf(event)).toBe('bad-input');
  });

  it('allows an event with no tool input', () => {
    expect(ruleOf({ hook_event_name: 'PreToolUse' })).toBe('allow');
    expect(ruleOf({ tool_input: 'text' })).toBe('allow');
  });
});

describe('context.only (Req 1.7)', () => {
  const only: GuardContext = { ...CONTEXT, only: ['notes-private'] };

  it('applies only the listed rules', () => {
    expect(ruleOf(shellEvent('git push'), only)).toBe('allow');
    expect(ruleOf(shellEvent('pnpm test'), only)).toBe('allow');
    expect(ruleOf(fileEvent('fs_write', { path: '/etc/x', text: 'a' }), only)).toBe('allow');
    expect(ruleOf(shellEvent('cat notes/a'), only)).toBe('notes-private');
  });

  it('an empty list applies nothing', () => {
    expect(ruleOf(shellEvent('cat notes/a'), { ...CONTEXT, only: [] })).toBe('allow');
  });
});

describe('the Decision', () => {
  it('carries a reason and an instruction in plain words, without echoing the input', () => {
    const refusals = [
      shellEvent('pkill undefined'),
      shellEvent('cat notes/null'),
      null,
      shellEvent('git push [object Object]'),
    ];
    for (const event of refusals) {
      const decision = decide(event, CONTEXT);
      expect(decision.allow).toBe(false);
      if (decision.allow) continue;
      expect(RULE_IDS).toContain(decision.rule);
      for (const text of [decision.reason, decision.instead]) {
        expect(text.length).toBeGreaterThan(10);
        expect(text).not.toMatch(/undefined|null|\[object|NaN/);
      }
    }
  });

  it('names what to do instead for a test run without timeout', () => {
    const decision = decide(shellEvent('pnpm --filter @alidade/core test'), CONTEXT);
    expect(decision.allow).toBe(false);
    if (!decision.allow) expect(decision.instead).toContain('timeout');
  });
});
