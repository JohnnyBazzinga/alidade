import type { Json } from './json-rpc.ts';
import type { Outcome } from './outcome.ts';

/** One tool: what `tools/list` says about it and the pure function that `tools/call` runs. */
export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** A JSON Schema of type object, written by hand beside the handler (design D11). */
  readonly inputSchema: { readonly [key: string]: Json };
  readonly handler: (args: unknown) => Outcome;
}
