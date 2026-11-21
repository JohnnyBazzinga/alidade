// JSON-RPC 2.0 messages as one line each (Req 5.2). Nothing here reads a stream.

export type Json =
  null | boolean | number | string | readonly Json[] | { readonly [key: string]: Json };

export const PARSE_ERROR = -32700;
export const INVALID_REQUEST = -32600;
export const METHOD_NOT_FOUND = -32601;
export const INVALID_PARAMS = -32602;
export const INTERNAL_ERROR = -32603;
/** MCP 2026-07-28: the requested protocol version is not supported. */
export const UNSUPPORTED_VERSION = -32022;

/** The id of a response: the request's id, or null when there is none to give. */
export type ResponseId = string | number | null;

/** One response line holding an error. `JSON.stringify` writes no newline inside a string. */
export function errorLine(id: ResponseId, code: number, message: string, data?: Json): string {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  });
}

/** One response line holding a result. */
export function resultLine(id: ResponseId, result: Json): string {
  return JSON.stringify({ jsonrpc: '2.0', id, result });
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** An own property of a record, or undefined: inherited names such as `constructor` are not read. */
export function own(record: Record<string, unknown>, key: string): unknown {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

export function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
