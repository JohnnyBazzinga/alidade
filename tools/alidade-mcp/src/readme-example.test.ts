// Req 6.8: the README's worked example cannot go stale. Each request in it is run through the line
// handler and the answer is compared with the README's. Also checks the registration in
// .kiro/settings/mcp.json and what the README promises about versions and the build.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { handleLine, SUPPORTED_VERSIONS } from './protocol.ts';
import { TOOLS } from './tools.ts';

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(PACKAGE_DIR, '../..');
const README = readFileSync(join(PACKAGE_DIR, 'README.md'), 'utf8');

/** The JSON blocks that follow `<!-- request:<name> -->` and `<!-- answer:<name> -->`. */
function blocks(kind: 'request' | 'answer'): Map<string, unknown> {
  const found = new Map<string, unknown>();
  const pattern = new RegExp(
    `<!--\\s*${kind}:(\\w+)\\s*-->\\s*\`\`\`json\\n([\\s\\S]*?)\\n\`\`\``,
    'g',
  );
  for (const match of README.matchAll(pattern)) {
    found.set(match[1] ?? '', JSON.parse(match[2] ?? ''));
  }
  return found;
}

/**
 * Deep equality with numbers compared to 1e-6 (absolute below 1, relative above): the README shows
 * the answers rounded to 6 decimals, and residuals of about 1e-12 depend on the platform's
 * floating point. Everything that is not a number must be equal.
 */
function expectClose(actual: unknown, expected: unknown, path = 'answer'): void {
  if (typeof expected === 'number') {
    expect(typeof actual, path).toBe('number');
    const difference = Math.abs((actual as number) - expected);
    expect(difference, path).toBeLessThanOrEqual(1e-6 * Math.max(1, Math.abs(expected)));
  } else if (Array.isArray(expected)) {
    expect(Array.isArray(actual), path).toBe(true);
    expect((actual as unknown[]).length, path).toBe(expected.length);
    expected.forEach((item, index) =>
      expectClose((actual as unknown[])[index], item, `${path}[${index}]`),
    );
  } else if (typeof expected === 'object' && expected !== null) {
    expect(Object.keys(actual as object).sort(), path).toStrictEqual(Object.keys(expected).sort());
    for (const [key, value] of Object.entries(expected)) {
      expectClose((actual as Record<string, unknown>)[key], value, `${path}.${key}`);
    }
  } else {
    expect(actual, path).toStrictEqual(expected);
  }
}

describe('the README worked example (Req 6.8)', () => {
  const requests = blocks('request');
  const answers = blocks('answer');

  it('has at least the fix and the declination, each with a request and an answer', () => {
    expect([...requests.keys()].sort()).toStrictEqual([...answers.keys()].sort());
    expect(requests.has('fix')).toBe(true);
    expect(requests.has('declination')).toBe(true);
  });

  it.each(['fix', 'declination'])('the %s answer is what the server answers today', (name) => {
    const request = requests.get(name);
    expect(request).toBeDefined();
    const response = handleLine(JSON.stringify(request));
    expect(response).not.toBeNull();
    const result = (
      JSON.parse(response ?? '') as { result: { isError: boolean; structuredContent: unknown } }
    ).result;
    expect(result.isError).toBe(false);
    expectClose(result.structuredContent, answers.get(name));
  });

  it('shows the 95 % ellipse of the fix', () => {
    const fix = answers.get('fix') as Record<string, unknown>;
    expect(fix['ellipse95']).toMatchObject({ semiMajorM: expect.any(Number) });
    expect(fix['ellipse1Sigma']).toBeDefined();
  });
});

describe('what the README says (Req 6.8)', () => {
  it('names the three protocol versions the server speaks', () => {
    for (const version of SUPPORTED_VERSIONS) expect(README).toContain(version);
  });

  it('says to build once, with the command, and that the server never builds', () => {
    expect(README).toContain('pnpm --filter @alidade/mcp build');
    expect(README).toMatch(/dist\/server\.mjs/);
    expect(README).toMatch(/never builds/i);
  });

  it('says how to see the server in Kiro', () => {
    expect(README).toContain('/mcp');
    expect(README).toContain('MCP Servers');
  });

  it('names each tool', () => {
    for (const tool of TOOLS) expect(README).toContain(tool.name);
  });
});

describe('.kiro/settings/mcp.json (Req 6.8)', () => {
  type Config = {
    mcpServers: Record<
      string,
      { command: string; args: string[]; autoApprove: string[]; env?: unknown }
    >;
  };
  const load = (): Config =>
    JSON.parse(readFileSync(join(ROOT, '.kiro/settings/mcp.json'), 'utf8')) as Config;

  it('registers one server, alidade, that runs the built file with node', () => {
    const config = load();
    expect(Object.keys(config.mcpServers)).toStrictEqual(['alidade']);
    expect(config.mcpServers['alidade']).toMatchObject({
      command: 'node',
      args: ['tools/alidade-mcp/dist/server.mjs'],
    });
  });

  it('auto-approves exactly the three tools, which read nothing and write nothing, and has no env', () => {
    const config = load();
    expect(config.mcpServers['alidade']?.autoApprove).toStrictEqual(TOOLS.map((tool) => tool.name));
    expect(config.mcpServers['alidade']).not.toHaveProperty('env');
  });
});
