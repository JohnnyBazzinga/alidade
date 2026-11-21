// The MCP protocol over JSON-RPC 2.0, by hand (Req 5, design D7 to D9). `handleLine` is pure: it
// takes one line and returns one line or nothing. It answers both eras of the protocol: the
// `initialize` handshake of the versions up to 2025-11-25, and the per-request `_meta` version of
// 2026-07-28. The server keeps no state, so the order of requests does not matter.

import {
  hasOwn,
  INTERNAL_ERROR,
  INVALID_PARAMS,
  INVALID_REQUEST,
  isRecord,
  METHOD_NOT_FOUND,
  own,
  PARSE_ERROR,
  UNSUPPORTED_VERSION,
  errorLine,
  resultLine,
  type Json,
  type ResponseId,
} from './json-rpc.ts';
import { finiteOrFailure } from './outcome.ts';
import type { ToolDefinition } from './tool-definition.ts';
import { TOOLS } from './tools.ts';

/** Every version this server answers, the newest first (Req 5.3). */
export const SUPPORTED_VERSIONS = ['2026-07-28', '2025-11-25', '2025-06-18'] as const;

/** The versions of the `initialize` handshake. */
const LEGACY_VERSIONS: readonly string[] = ['2025-11-25', '2025-06-18'];
const LATEST_LEGACY_VERSION = '2025-11-25';

const VERSION_KEY = 'io.modelcontextprotocol/protocolVersion';
const SERVER_INFO_KEY = 'io.modelcontextprotocol/serverInfo';

const SERVER_INFO = { name: 'alidade', version: '0.1.0' };

const INSTRUCTIONS =
  'Three tools over the Alidade skeleton: fix_from_bearings, magnetic_declination and local_offset. ' +
  'Angles are in degrees, azimuths are TRUE (clockwise from true north), lengths are in metres, ' +
  'times are milliseconds since the Unix epoch in UTC, and every estimate comes with its uncertainty.';

/** The longest tool name echoed back in an error. */
const MAX_ECHOED_NAME = 100;

/** The answer to a line that was longer than the cap (Req 5.2). */
export const TOO_LONG_RESPONSE = errorLine(null, INVALID_REQUEST, 'Request too large');

function isUsableId(id: unknown): id is ResponseId {
  return id === null || typeof id === 'string' || typeof id === 'number';
}

/** `{}` plus `resultType` for a request of the current era. */
function withEra(result: { readonly [key: string]: Json }, modern: boolean): Json {
  return modern ? { ...result, resultType: 'complete' } : result;
}

export function createHandler(tools: readonly ToolDefinition[]): (line: string) => string | null {
  const listing = tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: tool.inputSchema,
  }));

  function callTool(id: ResponseId, params: Record<string, unknown>, modern: boolean): string {
    const name = own(params, 'name');
    if (typeof name !== 'string') return errorLine(id, INVALID_PARAMS, 'Invalid params: name');
    let args: unknown = {};
    if (hasOwn(params, 'arguments')) {
      args = own(params, 'arguments');
      if (!isRecord(args)) return errorLine(id, INVALID_PARAMS, 'Invalid params: arguments');
    }
    const tool = tools.find((candidate) => candidate.name === name);
    if (tool === undefined) {
      return errorLine(id, INVALID_PARAMS, `Unknown tool: ${name.slice(0, MAX_ECHOED_NAME)}`);
    }
    const outcome = finiteOrFailure(tool.handler(args));
    const text = JSON.stringify(outcome);
    const content = [{ type: 'text', text }];
    const result: { readonly [key: string]: Json } = outcome.ok
      ? { content, isError: false, structuredContent: outcome }
      : { content, isError: true };
    return resultLine(id, withEra(result, modern));
  }

  function respond(message: Record<string, unknown>): string | null {
    const method = own(message, 'method');
    const hasId = hasOwn(message, 'id');
    const rawId = own(message, 'id');
    const id: ResponseId = isUsableId(rawId) ? rawId : null;
    if (
      message['jsonrpc'] !== '2.0' ||
      typeof method !== 'string' ||
      (hasId && !isUsableId(rawId))
    ) {
      return errorLine(hasId ? id : null, INVALID_REQUEST, 'Invalid Request');
    }
    // A request without an id is a notification: it is never answered (Req 5.5).
    if (!hasId) return null;
    if (method.startsWith('notifications/')) return null;

    let params: Record<string, unknown> = {};
    if (hasOwn(message, 'params')) {
      const given = own(message, 'params');
      if (!isRecord(given)) return errorLine(id, INVALID_PARAMS, 'Invalid params');
      params = given;
    }

    // The era of the request (Req 5.4).
    const meta = own(params, '_meta');
    const modern = isRecord(meta) && hasOwn(meta, VERSION_KEY);
    if (modern) {
      const requested = own(meta, VERSION_KEY);
      const supported = SUPPORTED_VERSIONS as readonly unknown[];
      if (!supported.includes(requested)) {
        return errorLine(id, UNSUPPORTED_VERSION, 'Unsupported protocol version', {
          supported: [...SUPPORTED_VERSIONS],
          requested: requested as Json,
        });
      }
    }

    switch (method) {
      case 'initialize': {
        const requested = own(params, 'protocolVersion');
        const protocolVersion =
          typeof requested === 'string' && LEGACY_VERSIONS.includes(requested)
            ? requested
            : LATEST_LEGACY_VERSION;
        return resultLine(
          id,
          withEra(
            {
              protocolVersion,
              capabilities: { tools: {} },
              serverInfo: SERVER_INFO,
              instructions: INSTRUCTIONS,
            },
            modern,
          ),
        );
      }
      case 'ping':
        return resultLine(id, withEra({}, modern));
      case 'server/discover':
        return resultLine(id, {
          resultType: 'complete',
          supportedVersions: [...SUPPORTED_VERSIONS],
          capabilities: { tools: {} },
          _meta: { [SERVER_INFO_KEY]: SERVER_INFO },
          instructions: INSTRUCTIONS,
        });
      case 'tools/list':
        return resultLine(id, withEra({ tools: listing }, modern));
      case 'tools/call':
        return callTool(id, params, modern);
      default:
        return errorLine(id, METHOD_NOT_FOUND, 'Method not found');
    }
  }

  return (line: string): string | null => {
    let message: unknown;
    try {
      message = JSON.parse(line);
    } catch {
      return errorLine(null, PARSE_ERROR, 'Parse error');
    }
    if (!isRecord(message)) return errorLine(null, INVALID_REQUEST, 'Invalid Request');
    try {
      return respond(message);
    } catch {
      // A handler threw: say so with a fixed message that holds none of the exception's text.
      const id = own(message, 'id');
      return hasOwn(message, 'id')
        ? errorLine(isUsableId(id) ? id : null, INTERNAL_ERROR, 'Internal error')
        : null;
    }
  };
}

/** The handler of the server's own tools. */
export const handleLine = createHandler(TOOLS);
