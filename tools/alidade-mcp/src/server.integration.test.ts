// Req 5.8: build the server into a temporary folder, start that file with `node`, speak the
// protocol over its standard input and output, and close standard input.

import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixArgs } from './synthetic.testkit.ts';

const PACKAGE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
const MODERN = { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } };

let outDir = '';
let bundle = '';

beforeAll(async () => {
  outDir = mkdtempSync(join(tmpdir(), 'alidade-mcp-'));
  await build({
    root: PACKAGE_DIR,
    configFile: join(PACKAGE_DIR, 'vite.config.ts'),
    logLevel: 'silent',
    build: { outDir, emptyOutDir: true },
  });
  bundle = join(outDir, 'server.mjs');
});

afterAll(() => {
  if (outDir !== '') rmSync(outDir, { recursive: true, force: true });
});

type Message = Record<string, unknown>;

/** A running server and the lines it has written. */
class Session {
  private readonly child: ChildProcess;
  private pending = '';
  private readonly lines: string[] = [];
  private waiting: ((line: string) => void) | null = null;
  readonly stderrText: string[] = [];
  readonly exited: Promise<number | null>;

  constructor() {
    this.child = spawn('node', [bundle]);
    this.child.stdout.setEncoding('utf8');
    this.child.stderr.setEncoding('utf8');
    this.child.stdout.on('data', (chunk: string) => {
      this.pending += chunk;
      let newline = this.pending.indexOf('\n');
      while (newline >= 0) {
        this.deliver(this.pending.slice(0, newline));
        this.pending = this.pending.slice(newline + 1);
        newline = this.pending.indexOf('\n');
      }
    });
    this.child.stderr.on('data', (chunk: string) => this.stderrText.push(chunk));
    this.exited = new Promise((resolve) => this.child.on('exit', resolve));
  }

  private deliver(line: string): void {
    if (this.waiting === null) this.lines.push(line);
    else {
      const resolve = this.waiting;
      this.waiting = null;
      resolve(line);
    }
  }

  send(message: unknown): void {
    this.child.stdin.write(
      (typeof message === 'string' ? message : JSON.stringify(message)) + '\n',
    );
  }

  /** Writes text exactly as given, with no newline added. */
  sendRaw(text: string): void {
    this.child.stdin.write(text);
  }

  /** The next line the server writes, parsed; fails if it does not come within 10 seconds. */
  async next(): Promise<Message> {
    const queued = this.lines.shift();
    const line =
      queued ??
      (await new Promise<string>((resolve, reject) => {
        this.waiting = resolve;
        setTimeout(() => reject(new Error('no answer within 10 s')), 10_000);
      }));
    return JSON.parse(line) as Message;
  }

  /** Every line not yet read. */
  get unread(): number {
    return this.lines.length;
  }

  close(): Promise<number | null> {
    this.child.stdin.end();
    return Promise.race([
      this.exited,
      new Promise<number | null>((resolve) => setTimeout(() => resolve(-1), 5000)),
    ]);
  }

  kill(): void {
    this.child.kill();
  }
}

function get(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) current = (current as Record<string, unknown> | undefined)?.[key];
  return current;
}

describe('the built server over stdio (Req 5.8)', () => {
  it('answers a whole session, writes only JSON-RPC to standard output, and exits 0 when stdin closes', async () => {
    const session = new Session();
    try {
      session.send({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2025-11-25',
          capabilities: {},
          clientInfo: { name: 't', version: '1' },
        },
      });
      const init = await session.next();
      expect(init['id']).toBe(1);
      expect(get(init, 'result', 'protocolVersion')).toBe('2025-11-25');
      expect(get(init, 'result', 'capabilities')).toStrictEqual({ tools: {} });

      session.send({ jsonrpc: '2.0', method: 'notifications/initialized' });

      session.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const list = await session.next();
      expect(list['id']).toBe(2);
      const names = (get(list, 'result', 'tools') as { name: string }[]).map((tool) => tool.name);
      expect(names).toStrictEqual(['fix_from_bearings', 'magnetic_declination', 'local_offset']);
      // The notification above was not answered: the next line is the answer to request 2.

      session.send({
        jsonrpc: '2.0',
        id: 3,
        method: 'tools/call',
        params: { name: 'fix_from_bearings', arguments: fixArgs() },
      });
      const fix = await session.next();
      expect(get(fix, 'result', 'isError')).toBe(false);
      expect(get(fix, 'result', 'structuredContent', 'ok')).toBe(true);
      expect(get(fix, 'result', 'structuredContent', 'ellipse95', 'semiMajorM')).toBeGreaterThan(0);

      session.send({
        jsonrpc: '2.0',
        id: 4,
        method: 'tools/call',
        params: {
          name: 'magnetic_declination',
          arguments: { latDeg: 30, lonDeg: -40, timeUtcMs: Date.UTC(2026, 5, 1) },
        },
      });
      const declination = await session.next();
      expect(get(declination, 'result', 'structuredContent', 'positiveEast')).toBe(true);

      session.send({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'local_offset',
          arguments: {
            direction: 'to_offset',
            origin: { latDeg: 30, lonDeg: -40 },
            position: { latDeg: 30.01, lonDeg: -40 },
          },
        },
      });
      const offset = await session.next();
      expect(get(offset, 'result', 'structuredContent', 'northM')).toBeGreaterThan(1000);

      session.send({ jsonrpc: '2.0', id: 6, method: 'ping' });
      expect(get(await session.next(), 'result')).toStrictEqual({});

      session.send({ jsonrpc: '2.0', id: 7, method: 'server/discover', params: MODERN });
      const discover = await session.next();
      expect(get(discover, 'result', 'supportedVersions')).toStrictEqual([
        '2026-07-28',
        '2025-11-25',
        '2025-06-18',
      ]);

      session.send({ jsonrpc: '2.0', id: 8, method: 'tools/list', params: MODERN });
      expect(get(await session.next(), 'result', 'resultType')).toBe('complete');

      session.send({ jsonrpc: '2.0', id: 9, method: 'resources/list' });
      const unknown = await session.next();
      expect(unknown['id']).toBe(9);
      expect(get(unknown, 'error', 'code')).toBe(-32601);

      session.send('{ this is not json');
      const invalid = await session.next();
      expect(invalid['id']).toBeNull();
      expect(get(invalid, 'error', 'code')).toBe(-32700);

      session.send({ jsonrpc: '2.0', id: 10, method: 'tools/call', params: { name: 'nope' } });
      expect(get(await session.next(), 'error', 'code')).toBe(-32602);

      // A line over 1 MiB is answered once with -32600 and the server carries on.
      session.send('x'.repeat(1_100_000));
      const tooLong = await session.next();
      expect(get(tooLong, 'error', 'code')).toBe(-32600);
      expect(tooLong['id']).toBeNull();
      session.send({ jsonrpc: '2.0', id: 11, method: 'ping' });
      expect((await session.next())['id']).toBe(11);

      expect(session.unread).toBe(0);
      expect(await session.close()).toBe(0);
      expect(session.stderrText.join('')).toBe('');
    } finally {
      session.kill();
    }
  });

  it('exits 0 at once when standard input is closed without a word', async () => {
    const session = new Session();
    try {
      expect(await session.close()).toBe(0);
    } finally {
      session.kill();
    }
  });

  it('answers a last line that has no newline when standard input closes', async () => {
    const session = new Session();
    try {
      session.sendRaw(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }));
      expect(session.unread).toBe(0);
      const closed = session.close();
      expect((await session.next())['id']).toBe(1);
      expect(await closed).toBe(0);
    } finally {
      session.kill();
    }
  });
});
