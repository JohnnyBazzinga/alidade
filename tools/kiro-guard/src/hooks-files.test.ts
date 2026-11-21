import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { DOCUMENTED_HOOK_FIELDS, DOCUMENTED_TRIGGERS, GUARD_COMMANDS } from './kiro-files.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const HOOKS_DIR = resolve(ROOT, '.kiro/hooks');

interface HookFile {
  version: string;
  hooks: {
    name: string;
    trigger: string;
    matcher: string;
    action: { type: string; command: string };
    timeout: number;
  }[];
}

const FILES = ['math-tests-on-save.json', 'spec-format-on-save.json', 'notes-private.json'];

function load(name: string): HookFile {
  return JSON.parse(readFileSync(resolve(HOOKS_DIR, name), 'utf8')) as HookFile;
}

describe('.kiro/hooks (Req 4.1)', () => {
  it('holds exactly the three files', () => {
    expect(readdirSync(HOOKS_DIR).sort()).toStrictEqual([...FILES].sort());
  });

  it.each(FILES)('%s follows the documented schema, version v1, one hook', (file) => {
    const parsed = load(file);
    expect(parsed.version).toBe('v1');
    expect(parsed.hooks).toHaveLength(1);
    const hook = parsed.hooks[0];
    expect(hook).toBeDefined();
    if (hook === undefined) return;
    for (const field of Object.keys(hook)) expect(DOCUMENTED_HOOK_FIELDS).toContain(field);
    expect(hook.name.length).toBeGreaterThan(0);
    expect(DOCUMENTED_TRIGGERS).toContain(hook.trigger);
    expect(hook.action.type).toBe('command');
    expect(hook.timeout).toBeGreaterThan(0);
    const [node, script, subcommand] = hook.action.command.split(' ');
    expect(node).toBe('node');
    expect(existsSync(resolve(ROOT, script ?? ''))).toBe(true);
    expect(GUARD_COMMANDS).toContain(subcommand);
  });
});

describe('math-tests-on-save.json', () => {
  const hook = load('math-tests-on-save.json').hooks[0];
  it('has the trigger, command and timeout of Req 4.1', () => {
    expect(hook).toMatchObject({
      trigger: 'PostFileSave',
      action: { type: 'command', command: 'node tools/kiro-guard/src/main.ts math-tests' },
      timeout: 330,
    });
  });

  const matcher = new RegExp(hook?.matcher ?? '(?!)');
  it.each([
    'apps/vigia/src/math/solve.ts',
    '/abs/path/skeleton/ui/src/math/x/y.ts',
    'apps/nonius/src/math/sun.test.ts',
    'apps/nonius/src/math/sun.property.test.ts',
  ])('matches %s', (path) => {
    expect(matcher.test(path)).toBe(true);
  });
  it.each([
    'apps/vigia/src/components/a.ts',
    'skeleton/core/src/angle.ts',
    'apps/vigia/src/math/a.md',
    'tools/kiro-guard/src/math/a.ts',
    'apps/vigia/src/mathematics/a.ts',
  ])('does not match %s', (path) => {
    expect(matcher.test(path)).toBe(false);
  });
});

describe('spec-format-on-save.json', () => {
  const hook = load('spec-format-on-save.json').hooks[0];
  it('has the trigger, command and timeout of Req 4.1', () => {
    expect(hook).toMatchObject({
      trigger: 'PostFileSave',
      action: { type: 'command', command: 'node tools/kiro-guard/src/main.ts check-spec' },
      timeout: 10,
    });
  });

  const matcher = new RegExp(hook?.matcher ?? '(?!)');
  it.each(['.kiro/specs/vigia/requirements.md', '/abs/p/.kiro/specs/x/requirements.md'])(
    'matches %s',
    (path) => {
      expect(matcher.test(path)).toBe(true);
    },
  );
  it.each([
    '.kiro/specs/vigia/design.md',
    'docs/requirements.md',
    '.kiro/specs/requirements.md',
    '.kiro/steering/requirements.md',
  ])('does not match %s', (path) => {
    expect(matcher.test(path)).toBe(false);
  });
});

describe('notes-private.json (Req 4.4)', () => {
  it('runs the guard limited to the one rule, on every tool', () => {
    expect(load('notes-private.json').hooks[0]).toMatchObject({
      trigger: 'PreToolUse',
      matcher: '*',
      action: {
        type: 'command',
        command: 'node tools/kiro-guard/src/main.ts pre-tool-use --only notes-private',
      },
      timeout: 10,
    });
  });
});
