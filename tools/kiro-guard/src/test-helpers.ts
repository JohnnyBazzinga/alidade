// Shared helpers of the Guard's tests. Not part of the Guard itself.

import type { GuardContext } from './decide.ts';

export const ROOT = '/home/u/p';

/** A fake `realPrefix`: `/home/u/p/link` is a symlink to the Notes folder. */
export function fakeRealPrefix(path: string): string {
  return path === `${ROOT}/link` || path.startsWith(`${ROOT}/link/`)
    ? `${ROOT}/notes${path.slice(`${ROOT}/link`.length)}`
    : path;
}

export const CONTEXT: GuardContext = {
  repositoryRootAbs: ROOT,
  homeAbs: '/home/u',
  realPrefix: fakeRealPrefix,
};

export function shellEvent(command: string, cwd: string = ROOT): unknown {
  return { hook_event_name: 'PreToolUse', cwd, tool_name: 'execute_bash', tool_input: { command } };
}

export function fileEvent(toolName: string, toolInput: unknown, cwd: string = ROOT): unknown {
  return { hook_event_name: 'PreToolUse', cwd, tool_name: toolName, tool_input: toolInput };
}
