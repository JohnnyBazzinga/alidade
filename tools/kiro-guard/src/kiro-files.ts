// What Kiro's documentation says about the files this package writes, as constants for the tests
// of those files (agent-file.test.ts, hooks-files.test.ts). `kiro-cli agent validate` accepts any
// trigger name and any rule effect (checked on kiro-cli 3.5.0), so these tests are the check.
// Not part of the Guard at run time.

/** kiro.dev/docs/hooks/types, CLI column: the triggers of the current (V3) documentation. */
export const DOCUMENTED_TRIGGERS: readonly string[] = [
  'UserPromptSubmit',
  'Stop',
  'SessionStart',
  'SessionEnd',
  'PreCompact',
  'PostCompact',
  'PreToolUse',
  'PermissionRequest',
  'PostToolUse',
  'PostFileCreate',
  'PostFileSave',
  'PostFileDelete',
  'PreTaskExecution',
  'PostTaskExecution',
];

/** kiro.dev/docs/custom-agents/configuration-reference, "permissions": the three effects. */
export const DOCUMENTED_EFFECTS: readonly string[] = ['allow', 'ask', 'deny'];

/** The same page: the capabilities of a permission rule and the meta-capabilities. */
export const DOCUMENTED_CAPABILITIES: readonly string[] = [
  'fs_read',
  'fs_write',
  'shell',
  'web_fetch',
  'web_search',
  'mcp',
  'subagent',
  'skill',
  'power',
  'context',
  'diagnostics',
  'sandbox_network',
  'all',
  'builtin',
  'filesystem',
];

/** kiro.dev/docs/hooks, the schema table: the fields of one hook. */
export const DOCUMENTED_HOOK_FIELDS: readonly string[] = [
  'name',
  'description',
  'trigger',
  'matcher',
  'action',
  'timeout',
  'enabled',
  'confirm',
];

/** The subcommands of `main.ts`. */
export const GUARD_COMMANDS: readonly string[] = [
  'pre-tool-use',
  'session-start',
  'stop',
  'math-tests',
  'check-spec',
];
