import { describe, expect, it } from 'vitest';
import { createHandler, handleLine, SUPPORTED_VERSIONS, TOO_LONG_RESPONSE } from './protocol.ts';
import type { ToolDefinition } from './tool-definition.ts';

type Message = Record<string, unknown>;

/** The answer to one line, parsed; fails the test if there is none or it is not one JSON line. */
function answer(line: string, handler: (line: string) => string | null = handleLine): Message {
  const response = handler(line);
  expect(response).not.toBeNull();
  expect(response).not.toContain('\n');
  return JSON.parse(response ?? '') as Message;
}

function request(id: unknown, method: string, params?: unknown): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method,
    ...(params === undefined ? {} : { params }),
  });
}

function get(value: unknown, ...path: string[]): unknown {
  let current = value;
  for (const key of path) current = (current as Record<string, unknown> | undefined)?.[key];
  return current;
}

const MODERN = { _meta: { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' } };

describe('initialize (Req 5.3)', () => {
  it.each(['2025-11-25', '2025-06-18'])(
    'answers the requested version %s with itself',
    (version) => {
      const message = answer(
        request(1, 'initialize', { protocolVersion: version, capabilities: {} }),
      );
      expect(message).toMatchObject({ jsonrpc: '2.0', id: 1 });
      expect(get(message, 'result', 'protocolVersion')).toBe(version);
      expect(get(message, 'result', 'capabilities')).toStrictEqual({ tools: {} });
      expect(get(message, 'result', 'serverInfo', 'name')).toBe('alidade');
      expect(typeof get(message, 'result', 'instructions')).toBe('string');
      expect(get(message, 'result', 'resultType')).toBeUndefined();
    },
  );

  it.each([['2024-11-05'], ['1900-01-01'], [5], [undefined]])(
    'answers the latest legacy version for %j',
    (version) => {
      const params = version === undefined ? {} : { protocolVersion: version };
      expect(get(answer(request(1, 'initialize', params)), 'result', 'protocolVersion')).toBe(
        '2025-11-25',
      );
    },
  );

  it('keeps a string id and a null id', () => {
    expect(answer(request('abc', 'initialize', {})).id).toBe('abc');
    expect(answer(request(null, 'ping')).id).toBeNull();
  });
});

describe('ping, server/discover, notifications (Req 5.3)', () => {
  it('answers ping with an empty result', () => {
    expect(get(answer(request(7, 'ping')), 'result')).toStrictEqual({});
  });

  it('answers server/discover with versions, capabilities, server info and instructions', () => {
    const message = answer(request(2, 'server/discover', MODERN));
    expect(get(message, 'result', 'resultType')).toBe('complete');
    expect(get(message, 'result', 'supportedVersions')).toStrictEqual([
      '2026-07-28',
      '2025-11-25',
      '2025-06-18',
    ]);
    expect(get(message, 'result', 'capabilities')).toStrictEqual({ tools: {} });
    expect(get(message, 'result', '_meta', 'io.modelcontextprotocol/serverInfo', 'name')).toBe(
      'alidade',
    );
    expect(typeof get(message, 'result', 'instructions')).toBe('string');
  });

  it('answers server/discover without _meta too (a probe by an older client)', () => {
    expect(get(answer(request(2, 'server/discover')), 'result', 'supportedVersions')).toBeDefined();
  });

  it.each(['notifications/initialized', 'notifications/cancelled', 'notifications/whatever'])(
    'never answers the notification %s',
    (method) => {
      expect(handleLine(JSON.stringify({ jsonrpc: '2.0', method }))).toBeNull();
      expect(handleLine(JSON.stringify({ jsonrpc: '2.0', method, params: { a: 1 } }))).toBeNull();
    },
  );

  it('never answers a request without an id, not even to say the method is unknown', () => {
    expect(handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'nope' }))).toBeNull();
    expect(
      handleLine(JSON.stringify({ jsonrpc: '2.0', method: 'tools/call', params: 5 })),
    ).toBeNull();
  });
});

describe('the two eras (Req 5.4)', () => {
  it('serves a request without _meta as legacy: no resultType', () => {
    expect(get(answer(request(1, 'tools/list')), 'result', 'resultType')).toBeUndefined();
  });

  it('serves a request with the 2026-07-28 _meta as modern: resultType complete', () => {
    const message = answer(request(1, 'tools/list', MODERN));
    expect(get(message, 'result', 'resultType')).toBe('complete');
    expect(get(message, 'result', 'tools')).toBeDefined();
  });

  it('accepts every supported version in _meta', () => {
    for (const version of SUPPORTED_VERSIONS) {
      const params = { _meta: { 'io.modelcontextprotocol/protocolVersion': version } };
      expect(answer(request(1, 'ping', params)).error).toBeUndefined();
    }
  });

  it.each(['1900-01-01', '2027-01-01', '', 5, null])(
    'answers -32022 with the supported list for the _meta version %j',
    (version) => {
      const params = { _meta: { 'io.modelcontextprotocol/protocolVersion': version } };
      const message = answer(request(4, 'tools/list', params));
      expect(message.result).toBeUndefined();
      expect(get(message, 'error', 'code')).toBe(-32022);
      expect(get(message, 'error', 'data')).toStrictEqual({
        supported: ['2026-07-28', '2025-11-25', '2025-06-18'],
        requested: version,
      });
      expect(message.id).toBe(4);
    },
  );
});

describe('tools/list', () => {
  it('lists the three tools, in a fixed order, each with a schema of type object', () => {
    const tools = get(answer(request(1, 'tools/list')), 'result', 'tools') as Message[];
    expect(tools.map((tool) => tool.name)).toStrictEqual([
      'fix_from_bearings',
      'magnetic_declination',
      'local_offset',
    ]);
    for (const tool of tools) {
      expect(typeof tool.description).toBe('string');
      expect(get(tool, 'inputSchema', 'type')).toBe('object');
      expect(get(tool, 'inputSchema', 'oneOf')).toBeUndefined();
      expect(get(tool, 'inputSchema', 'additionalProperties')).toBe(false);
    }
  });
});

describe('tools/call (Req 5.6)', () => {
  const LOCAL = {
    name: 'local_offset',
    arguments: {
      direction: 'to_offset',
      origin: { latDeg: 30, lonDeg: -40 },
      position: { latDeg: 30.01, lonDeg: -40 },
    },
  };

  it('answers a success with isError false, the outcome as JSON text and as structuredContent', () => {
    const message = answer(request(3, 'tools/call', LOCAL));
    const result = get(message, 'result') as Message;
    expect(result.isError).toBe(false);
    const content = result.content as Message[];
    expect(content).toHaveLength(1);
    expect(content[0]?.type).toBe('text');
    const text = JSON.parse(String(content[0]?.text)) as Message;
    expect(text).toStrictEqual(result.structuredContent);
    expect(text.ok).toBe(true);
    expect(text.northM).toBeGreaterThan(1000);
  });

  it('answers a failure of the tool with isError true and no structuredContent', () => {
    const bad = { name: 'local_offset', arguments: { direction: 'sideways', origin: {} } };
    const result = get(answer(request(3, 'tools/call', bad)), 'result') as Message;
    expect(result.isError).toBe(true);
    expect(result.structuredContent).toBeUndefined();
    const outcome = JSON.parse(String((result.content as Message[])[0]?.text)) as Message;
    expect(outcome).toMatchObject({ ok: false, reason: 'invalid_arguments', field: 'direction' });
  });

  it('serves arguments that are missing as an empty object', () => {
    const result = get(answer(request(3, 'tools/call', { name: 'local_offset' })), 'result');
    expect(get(result, 'isError')).toBe(true);
  });

  it('adds resultType to a modern call', () => {
    const result = get(answer(request(3, 'tools/call', { ...LOCAL, ...MODERN })), 'result');
    expect(get(result, 'resultType')).toBe('complete');
    expect(get(result, 'isError')).toBe(false);
  });
});

describe('protocol errors (Req 5.5)', () => {
  const code = (line: string): unknown => get(answer(line), 'error', 'code');

  it('answers invalid JSON with -32700 and a null id', () => {
    for (const line of ['{', 'not json', '{"jsonrpc":"2.0",', '\u0000']) {
      const message = answer(line);
      expect(get(message, 'error', 'code')).toBe(-32700);
      expect(message.id).toBeNull();
    }
  });

  it.each(['5', '"x"', 'null', 'true', '[]', '[{"jsonrpc":"2.0","id":1,"method":"ping"}]'])(
    'answers the value %s, which is not a request object, with -32600 and a null id',
    (line) => {
      const message = answer(line);
      expect(get(message, 'error', 'code')).toBe(-32600);
      expect(message.id).toBeNull();
    },
  );

  it('answers a wrong or missing jsonrpc, or a method that is not a string, with -32600 and the id', () => {
    for (const body of [
      { id: 1, method: 'ping' },
      { jsonrpc: '1.0', id: 1, method: 'ping' },
      { jsonrpc: '2.0', id: 1 },
      { jsonrpc: '2.0', id: 1, method: 5 },
    ]) {
      const message = answer(JSON.stringify(body));
      expect(get(message, 'error', 'code')).toBe(-32600);
      expect(message.id).toBe(1);
    }
  });

  it.each([{}, [], true])('answers an id of %j with -32600 and a null id', (id) => {
    const message = answer(JSON.stringify({ jsonrpc: '2.0', id, method: 'ping' }));
    expect(get(message, 'error', 'code')).toBe(-32600);
    expect(message.id).toBeNull();
  });

  it('answers an unknown method with -32601', () => {
    expect(code(request(1, 'resources/list'))).toBe(-32601);
    expect(code(request(1, 'initialized'))).toBe(-32601);
  });

  it('answers params that are not an object with -32602', () => {
    for (const params of [5, 'x', [], null, true]) {
      expect(code(request(1, 'ping', params))).toBe(-32602);
    }
  });

  it('answers tools/call without a string name, with arguments that are not an object, or an unknown tool with -32602', () => {
    expect(code(request(1, 'tools/call', {}))).toBe(-32602);
    expect(code(request(1, 'tools/call', { name: 5 }))).toBe(-32602);
    expect(code(request(1, 'tools/call', { name: 'local_offset', arguments: [] }))).toBe(-32602);
    expect(code(request(1, 'tools/call', { name: 'local_offset', arguments: 'x' }))).toBe(-32602);
    const unknown = answer(request(1, 'tools/call', { name: 'no_such_tool' }));
    expect(get(unknown, 'error', 'code')).toBe(-32602);
    expect(String(get(unknown, 'error', 'message'))).toContain('Unknown tool');
  });

  it('has exactly one of result and error in every answer', () => {
    for (const line of [request(1, 'ping'), request(1, 'nope'), 'x', request(1, 'tools/list')]) {
      const message = answer(line);
      expect('result' in message !== 'error' in message).toBe(true);
    }
  });

  it('answers a line that was too long with -32600 and a null id', () => {
    const message = JSON.parse(TOO_LONG_RESPONSE) as Message;
    expect(get(message, 'error', 'code')).toBe(-32600);
    expect(message.id).toBeNull();
    expect(TOO_LONG_RESPONSE).not.toContain('\n');
  });
});

describe('a handler that misbehaves (design D9, D10)', () => {
  function toolWith(handler: ToolDefinition['handler']): ToolDefinition {
    return { name: 'stub', description: 'stub', inputSchema: { type: 'object' }, handler };
  }
  const call = request(1, 'tools/call', { name: 'stub', arguments: {} });

  it('answers -32603 with a fixed message that does not leak the exception text', () => {
    const handler = createHandler([
      toolWith(() => {
        throw new Error('secret detail /home/x');
      }),
    ]);
    const message = answer(call, handler);
    expect(get(message, 'error', 'code')).toBe(-32603);
    expect(JSON.stringify(message)).not.toContain('secret');
    expect(message.id).toBe(1);
  });

  it('turns a non-finite number in an outcome into the non_finite_result failure', () => {
    const handler = createHandler([toolWith(() => ({ ok: true, value: NaN }))]);
    const result = get(answer(call, handler), 'result') as Message;
    expect(result.isError).toBe(true);
    expect(JSON.parse(String((result.content as Message[])[0]?.text))).toMatchObject({
      ok: false,
      reason: 'non_finite_result',
    });
  });
});
