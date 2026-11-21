import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DOCUMENTED_CAPABILITIES,
  DOCUMENTED_EFFECTS,
  DOCUMENTED_HOOK_FIELDS,
  DOCUMENTED_TRIGGERS,
  GUARD_COMMANDS,
} from './kiro-files.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const AGENT_PATH = '.kiro/agents/alidade.json';

interface Rule {
  capability: string;
  match: string[];
  effect: string;
}
interface Hook {
  name: string;
  trigger: string;
  matcher?: string;
  action: { type: string; command: string };
  timeout: number;
}
interface Agent {
  name: string;
  description: string;
  prompt: string;
  tools: string[];
  includeMcpJson: boolean;
  resources: string[];
  toolsSettings: {
    write: { allowedPaths: string[]; deniedPaths: string[] };
    read: { deniedPaths: string[] };
    shell: { deniedCommands: string[] };
  };
  permissions: { rules: Rule[] };
  hooks: Hook[];
}

const text = readFileSync(resolve(ROOT, AGENT_PATH), 'utf8');
const agent = JSON.parse(text) as Agent;

describe('.kiro/agents/alidade.json (Req 2)', () => {
  it('has the name, a description and a short inline prompt with the five rules (Req 2.2)', () => {
    expect(agent.name).toBe('alidade');
    expect(agent.description.length).toBeGreaterThan(20);
    expect(agent.prompt.split('\n').length).toBeLessThanOrEqual(12);
    for (const word of ['steering', 'pnpm', 'notes/', 'commit', 'timeout']) {
      expect(agent.prompt).toContain(word);
    }
  });

  it('has the tools and includes the workspace MCP file (Req 2.2)', () => {
    expect(agent.tools).toStrictEqual(['read', 'write', 'shell', '@alidade']);
    expect(agent.includeMcpJson).toBe(true);
  });

  it('has exactly the five steering files as resources, and they exist (Req 2.3)', () => {
    expect(agent.resources).toStrictEqual(
      ['math-conventions', 'product', 'structure', 'tech', 'testing'].map(
        (name) => `file://.kiro/steering/${name}.md`,
      ),
    );
    for (const resource of agent.resources) {
      expect(existsSync(resolve(ROOT, resource.slice('file://'.length)))).toBe(true);
    }
  });

  it('uses only documented capabilities and effects, and allows only writes (Req 2.4, 2.5)', () => {
    for (const rule of agent.permissions.rules) {
      expect(DOCUMENTED_CAPABILITIES).toContain(rule.capability);
      expect(DOCUMENTED_EFFECTS).toContain(rule.effect);
      expect(rule.match.length).toBeGreaterThan(0);
    }
    const allows = agent.permissions.rules.filter((rule) => rule.effect === 'allow');
    expect(allows).toStrictEqual([{ capability: 'fs_write', match: ['./**'], effect: 'allow' }]);
  });

  it('denies reading and writing notes/ and the three shell commands (Req 2.4)', () => {
    const denied = (capability: string): string[] =>
      agent.permissions.rules
        .filter((rule) => rule.effect === 'deny' && rule.capability === capability)
        .flatMap((rule) => rule.match);
    expect(denied('fs_read')).toStrictEqual(['notes/**']);
    expect(denied('fs_write')).toStrictEqual(['notes/**']);
    expect(denied('shell')).toStrictEqual(['git commit *', 'git push *', 'pkill *']);
  });

  it('says the same in toolsSettings (the 2.x engine) as in permissions (V3) (Req 2.4)', () => {
    const rules = agent.permissions.rules;
    const matches = (capability: string, effect: string): string[] =>
      rules
        .filter((rule) => rule.capability === capability && rule.effect === effect)
        .flatMap((rule) => rule.match);
    expect(agent.toolsSettings.write.allowedPaths).toStrictEqual(matches('fs_write', 'allow'));
    expect(agent.toolsSettings.write.deniedPaths).toStrictEqual(matches('fs_write', 'deny'));
    expect(agent.toolsSettings.read.deniedPaths).toStrictEqual(matches('fs_read', 'deny'));
    expect(agent.toolsSettings.shell.deniedCommands).toStrictEqual(
      matches('shell', 'deny').map((glob) => glob.replace(/ \*$/, ' .*')),
    );
  });

  it('has exactly three hooks, with documented triggers, that run the guard (Req 2.5)', () => {
    expect(agent.hooks.map((hook) => [hook.trigger, hook.action.command])).toStrictEqual([
      ['SessionStart', 'node tools/kiro-guard/src/main.ts session-start'],
      ['PreToolUse', 'node tools/kiro-guard/src/main.ts pre-tool-use'],
      ['Stop', 'node tools/kiro-guard/src/main.ts stop'],
    ]);
    for (const hook of agent.hooks) {
      expect(DOCUMENTED_TRIGGERS).toContain(hook.trigger);
      expect(hook.action.type).toBe('command');
      expect(hook.name.length).toBeGreaterThan(0);
      expect(hook.timeout).toBeGreaterThan(0);
      expect(hook.timeout).toBeLessThanOrEqual(10);
      for (const field of Object.keys(hook)) expect(DOCUMENTED_HOOK_FIELDS).toContain(field);
      const [, script, subcommand] = hook.action.command.split(' ');
      expect(existsSync(resolve(ROOT, script ?? ''))).toBe(true);
      expect(GUARD_COMMANDS).toContain(subcommand);
    }
    expect(agent.hooks[1]?.matcher).toBe('*');
  });

  it('names notes only in the deny rules and the prompt (Req 2.5)', () => {
    const rest: Record<string, unknown> = { ...agent };
    delete rest['prompt'];
    delete rest['toolsSettings'];
    delete rest['permissions'];
    expect(JSON.stringify(rest)).not.toContain('notes');
    for (const rule of agent.permissions.rules) {
      if (JSON.stringify(rule).includes('notes')) expect(rule.effect).toBe('deny');
    }
  });

  it('names no absolute path and no user name (Req 2.6)', () => {
    expect(text).not.toMatch(/\/home\/|\/Users\/|C:\\|joao/);
    for (const value of [
      agent.prompt,
      ...agent.resources,
      ...agent.hooks.map((h) => h.action.command),
    ]) {
      expect(value).not.toMatch(/(^|\s|file:\/\/)\/[a-z]/);
    }
  });
});
