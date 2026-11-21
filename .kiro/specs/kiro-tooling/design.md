# Design Document: kiro-tooling

## 1. Context and scope

Packages: `tools/kiro-guard` (`@alidade/kiro-guard`) and `tools/alidade-mcp` (`@alidade/mcp`), plus the files `.kiro/agents/alidade.json`, `.kiro/hooks/*.json` (three) and `.kiro/settings/mcp.json`. Source of truth: `requirements.md` in this folder. `Req N.M` points there. Neither package is imported by `skeleton/` or `apps/`. `tools/alidade-mcp` imports `@alidade/core` and `@alidade/sensors` through their `src/index.ts` only; `tools/kiro-guard` imports nothing but Node built-ins. The steering gets one row for `/tools` in `structure.md`, with the lead's approval (§9).

## 2. What was read, and where

Read in this session (the pages carry update dates up to 2026-11-12). Where a page moved, the address that answered is given.

| Page                                                                                                                                                                         | What it settled                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kiro.dev/docs/custom-agents/configuration-reference/`                                                                                                                       | Agent fields: `name`, `description`, `prompt`, `tools` (selectors `read`, `write`, `shell`, `web`, `@builtin`, `@<server>`, `@<server>/<tool>`, `*`), `permissions.rules` (`capability`, `match`, `effect` of `allow`, `ask`, `deny`, `exclude`; deny wins), `resources` (`file://`), `hooks` (array of `name`, `trigger`, `matcher`, `action`, PascalCase triggers), `includeMcpJson`. `toolsSettings` is 2.x and ignored by V3.                                                   |
| `kiro.dev/docs/hooks/`, `/hooks/types/`, `/hooks/actions/`                                                                                                                   | Standalone hook file `.kiro/hooks/<id>.json`: `version: "v1"`, `hooks[]` with `name`, `trigger`, `matcher`, `action.type` `command` or `agent`, `action.command`, `timeout` in seconds (default 60), `enabled`. Triggers: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Stop`, `PostFileSave`, and others. Event on standard input. Exit `0`: standard output goes to the agent. Other exit: standard error to the agent; for `PreToolUse` the call is blocked. |
| `kiro.dev/docs/cli/2x-reference/`                                                                                                                                            | Exit code `2` is the one that blocks a `preToolUse` call and returns standard error to the agent; other non-zero codes only warn. CLI V3 accepts the camelCase names (`agentSpawn`, `preToolUse`, `stop`) as aliases of `SessionStart`, `PreToolUse`, `Stop`.                                                                                                                                                                                                                       |
| `kiro.dev/docs/reference/built-in-tools/`                                                                                                                                    | Tool names `read`, `write`, `shell`, `glob`, `grep`, with aliases `fs_read`, `fs_write`, `execute_bash`; `toolsSettings` shape for the 2.x engine.                                                                                                                                                                                                                                                                                                                                  |
| `kiro.dev/docs/mcp/configuration/`                                                                                                                                           | `.kiro/settings/mcp.json`: `mcpServers.<name>` with `command`, `args`, `env`, `disabled`, `autoApprove`, `disabledTools`; workspace overrides user; saved changes hot-reload. A hook sees an MCP tool as `mcp_<server>_<tool>`.                                                                                                                                                                                                                                                     |
| `modelcontextprotocol.io/specification/latest/…` (version `2026-07-28`): `basic/transports`, `basic/transports/stdio`, `basic/versioning`, `server/discover`, `server/tools` | stdio is newline-delimited JSON-RPC, no embedded newlines, standard output only for messages, standard error for logs, shutdown by closing standard input. **Version `2026-07-28` has no `initialize`**: each request carries `_meta["io.modelcontextprotocol/protocolVersion"]`, `server/discover` is mandatory, errors `-32022` for an unsupported version, results carry `resultType`. Tool errors are results with `isError: true`; unknown tool is `-32602`.                   |
| `modelcontextprotocol.io/specification/2025-11-25/basic/lifecycle.md`                                                                                                        | The legacy handshake: `initialize` (`protocolVersion`, `capabilities`, `clientInfo`) answered with the same version when supported, then `notifications/initialized`.                                                                                                                                                                                                                                                                                                               |

JSON-RPC 2.0 error codes (`-32700`, `-32600`, `-32601`, `-32602`, `-32603`) are from the JSON-RPC 2.0 specification, not re-read.

**Checked on this machine with kiro-cli 3.5.0** (`kiro-cli agent validate`, `upgrade --dry-run`, in a scratch folder): `validate` prints nothing and exits `0` for a valid file, and exits `1` for a wrong type (`"tools": "x"`); it exits `0` for a hook trigger `Bogus` and a rule effect `nope`. It type-checks, it does not check names. `upgrade` rewrites a 2.x file into the "universal" form that both engines load: hooks as an array with camelCase triggers, `toolsSettings` kept, and `permissions.rules` added. Hence the dual form of Req 2.4 and the independent test of Req 2.1.

## 3. Design decisions

- **D1: One guard, five subcommands (Req 1, 3, 4).** A single `main.ts` dispatches `pre-tool-use`, `session-start`, `stop`, `math-tests`, `check-spec`. The decision logic is a pure function in its own file; everything that touches a process or a file is in `main.ts` and `repo-state.ts`. This is the "one small script with its own tests" of the brief; the IDE hooks reuse it instead of adding a second script.
- **D2: Node runs the TypeScript directly.** Node 24 strips types (`node a.ts` verified in a scratch folder), so the hooks are `node tools/kiro-guard/src/main.ts …` with no build and no `tsx`. The sources use `import './x.ts'` (explicit extension), no enum, no parameter property, no namespace. The package's `tsconfig` adds `allowImportingTsExtensions` and `erasableSyntaxOnly`.
- **D3: No `@types/node`; a small ambient shim.** The repository has no `@types/node` and the brief forbids a new dependency. Each of the two packages has a `src/node-shim.d.ts` declaring only the members it imports (`node:fs`, `node:path`, `node:os`, `node:child_process`, `node:process`), in the pattern of Sensors' `magvar.d.ts`. `tsc` then fails if a source uses a member that is not declared.
- **D4: Fail closed for `pre-tool-use`, open for the others.** A guard that lets a call through when it cannot read the event protects nothing; `pre-tool-use` refuses on bad input (Req 1.2). `session-start`, `stop` and the IDE commands only inform, so their failure is a one-line message and exit `0`, or `1` with a message for `math-tests` and `check-spec`, which are about a result.
- **D5: Classify by the shape of the input, not by the tool's name.** The documentation shows both `read_file`, `execute_bash`, `fs_write` and `read`, `write`, `shell` as identifiers, and nothing here can run a session to see which a `PreToolUse` event carries. So `notes-private` examines every string of `tool_input` outside the Body keys, whatever the tool; the shell rules apply to any `tool_input.command` that is a string; `write-outside-repo` applies to the names `fs_write`, `write`, `str_replace`, `fs_append`, `delete_file` and takes `tool_input.path`. A new tool name that the guard does not know is still covered by `notes-private`.
- **D6: The hook matcher is `*`.** Matching by name would repeat D5's problem in the matcher. The guard is fast (one parse, no process).
- **D7: The server is dual-era (Req 5.3, 5.4).** The current specification dropped `initialize`. Which era Kiro's client speaks is not stated for kiro-cli 3.5.0 and is not tested here (it would need the client). A server of a few hundred lines can answer both: `initialize` selects nothing (the server is stateless), and a request with the `_meta` version is answered as modern. The era costs one `if` in the result builder.
- **D8: Hand-written JSON-RPC, three layers (Req 5).** `framing.ts` (bytes to lines, the 1 MiB cap), `protocol.ts` (`handleLine(line): string | null`, pure, the only function the property test needs), `tools.ts` (the registry and the three handlers). `server.ts` is the 20-line loop that reads standard input and writes standard output. No other module touches a stream.
- **D9: A Tool outcome is a value, a protocol error is an error (Req 5.5, 5.6).** Handlers return `Outcome`; they never throw. `protocol.ts` wraps the call in `try`; a thrown exception becomes error `-32603` with a fixed message (never the exception's text) and a test with a deliberately throwing handler shows it.
- **D10: Finite output by construction (Req 6.6).** `outcome.ts` has `finiteOrFailure(value)`, which walks the outcome and returns `non_finite_result` if any number is not finite. Every handler returns through it. The property test asserts both that no output is non-finite and, separately, that the `non_finite_result` branch is never taken for in-domain input (it is a guard, not the check).
- **D11: Strict arguments (Req 6.5).** One small `check.ts` with `object(value, shape)`, `finiteNumber`, `string(min, max)`, `array(min, max)`, `boolean`, each returning `{ ok, value } | { ok: false, field }`; it rejects unknown fields. It is under 60 lines and replaces a schema library. The JSON Schema in `tools/list` is written by hand beside each handler and a test checks that the schema and the check agree: the properties the schema lists are exactly those that valid arguments use (at every depth), every property it marks required is insisted on by the handler (with that field named in the failure), an unknown property is refused, and the stated bounds (`minItems`, `maxItems`, `minLength`, `maxLength`) are the ones enforced. A generator of values from a schema was considered and not built: `local_offset` has two variants that a top-level `oneOf` would describe, which some model APIs refuse in a tool's input schema, so the schema is flat and the variants are in the description.
- **D12: Messages are a table (Req 6.5).** `messages.ts` holds `Record<Reason, string>` for Core's 12 reasons, one for Sensors' extra reasons (taken from `SENSOR_REASONS` so the table is typed against the real set), and `invalid_arguments`, `non_finite_result`. Core's and Sensors' reason sets are not copied: the table's type is `Record<Reason | SensorReason | McpReason, string>`.

## 4. The guard (`tools/kiro-guard/src`)

### 4.1 Files

`main.ts` (dispatch, standard input, exit codes) · `decide.ts` (`decide`, rule table) · `shell-words.ts` (§4.2) · `paths.ts` (§4.3) · `repo-state.ts` (git through `execFileSync`; `session-start`, `stop`, status parsing) · `math-tests.ts` · `check-spec.ts` · `node-shim.d.ts` · each with its `*.test.ts`; `decide.property.test.ts`; `README.md` with the rules table and the limits of Req 1.6.

### 4.2 Reading a shell command

`tokenise(command): Segment[]`. One pass over the characters with states `plain`, `single`, `double`, `escape`: split at `;`, `&&`, `||`, `|`, `&` and newline outside quotes; a word is a run of non-blank characters with quotes removed. `$(…)` and back-quotes are cut out and tokenised as further segments, to a depth of 4 (deeper: the rest is one word). `commandOf(segment)` drops `VAR=value` words, then the prefix words of Req 1.5 with their own options (`sudo -u x`, `env -i`, `nice -n 5`, `xargs -n 1`), and, for `bash|sh|zsh -c <script>`, recurses into `<script>`. The result is `{ command, args }`, from which the rules of the table are plain `if`s over `command` and `args`. Nothing is evaluated: no variable, glob or `eval` (Req 1.6).

`test-needs-timeout` looks at the segment before prefix stripping: the first word after assignments must be `timeout`; `timeout` is stripped, together with its options and its duration, only to find the command it wraps, so that `timeout 5 pnpm dev` is still `no-dev-server`.

### 4.3 Paths

`resolveNotes(value, cwd, homeAbs, repositoryRootAbs): boolean`: `~`, `$HOME`, `${HOME}` at the start become `homeAbs`; `path.resolve(cwd, value)` removes `.`, `..`, doubled and trailing slashes; the longest existing prefix goes through `realpathSync` (so a symlink into `notes/` is caught) and the rest is appended. `decide` is pure, so `realpath` is passed in the context as a function `realPrefix(path) => string`; the tests give a fake one, `main.ts` the real one. A value that is not a string, or is longer than 4 096 characters, is skipped as a path (it is still read as a shell word if it is a command).

### 4.4 `session-start` and `stop`

`repo-state.ts` runs, in the Repository root: `git rev-parse --abbrev-ref HEAD` (and `git rev-parse --short HEAD` when the answer is `HEAD`), `git status --porcelain=v1 -z`, `git log -1 --format=%h %s`, each through `execFileSync('git', [...], { cwd, encoding: 'utf8', timeout: 5000, env: { ...minimal, LC_ALL: 'C' } })`. The porcelain output is parsed (status letters, `-z`, renames) into `{ status, path }[]`, filtered of `notes/`. `formatSessionStart(state)` and `formatStopReminder(state)` are pure and tested as exact strings.

Kiro's documentation says the `Stop` hook's standard output is added to the agent's context. The agent has finished its turn, so the reminder reaches it with the next message. `{"decision": "block"}` would make the session continue (2.x reference), and Req 3.3 forbids it: a reminder that forces another turn each time files are dirty would loop.

### 4.5 `math-tests` and `check-spec`

`math-tests` collects strings ending in `.ts` from the event (any depth, any key), normalises each against the Repository root, keeps those that match `^(apps|skeleton)/[^/]+/src/math/.+\.ts$`, reads `<package>/package.json` for the package name, and spawns `timeout 300 pnpm --filter <name> exec vitest run <relative files>` with `spawnSync` (argument array, no shell), the guard's own rules not applying since it is not a tool call. `check-spec` is a line scanner over the file; each problem is `<path>:<line>: <message>`.

## 5. The agent file (`.kiro/agents/alidade.json`)

```json
{
  "name": "alidade",
  "description": "…",
  "prompt": "…",
  "tools": ["read", "write", "shell", "@alidade"],
  "includeMcpJson": true,
  "resources": ["file://.kiro/steering/math-conventions.md", "…"],
  "toolsSettings": {
    "write": { "allowedPaths": ["./**"], "deniedPaths": ["notes/**"] },
    "read": { "deniedPaths": ["notes/**"] },
    "shell": { "deniedCommands": ["git commit .*", "git push .*", "pkill .*"] }
  },
  "permissions": {
    "rules": [
      { "capability": "fs_write", "match": ["./**"], "effect": "allow" },
      { "capability": "fs_read", "match": ["notes/**"], "effect": "deny" },
      { "capability": "fs_write", "match": ["notes/**"], "effect": "deny" },
      {
        "capability": "shell",
        "match": ["git commit *", "git push *", "pkill *"],
        "effect": "deny"
      }
    ]
  },
  "hooks": [
    {
      "name": "repo-state",
      "trigger": "SessionStart",
      "action": { "type": "command", "command": "node tools/kiro-guard/src/main.ts session-start" },
      "timeout": 10
    },
    {
      "name": "guard",
      "trigger": "PreToolUse",
      "matcher": "*",
      "action": { "type": "command", "command": "node tools/kiro-guard/src/main.ts pre-tool-use" },
      "timeout": 10
    },
    {
      "name": "root-checks",
      "trigger": "Stop",
      "action": { "type": "command", "command": "node tools/kiro-guard/src/main.ts stop" },
      "timeout": 10
    }
  ]
}
```

The `fs_write` allow for `./**` only removes the prompt for writes inside the workspace; a write outside it still prompts (no rule matches) and is refused by `write-outside-repo`. Deny beats allow in the agent's rules, so `notes/**` stays denied. `includeMcpJson` lets the server be defined once, in `.kiro/settings/mcp.json`; the `tools` list still limits the agent to `@alidade` among MCP servers. The hook commands are relative to the workspace root, where the documentation says command hooks run.

The builder confirms the file with `kiro-cli agent validate --path` and `upgrade --dry-run` on a copy, and with `agent-file.test.ts`, which holds the documented sets (triggers, effects, capabilities) as constants with the page each came from in a comment.

## 6. The IDE hooks, and how their schema was checked

The three files of Req 4.1 follow the schema table of `kiro.dev/docs/hooks/` field by field. The IDE cannot run here, so the check is: (1) the documentation's own example (`lint-on-save.json`) is the pattern; (2) `hooks-files.test.ts` validates each file against the documented required fields, value sets and types, and compiles each `matcher` as a regular expression against example paths; (3) no kiro-cli command loads hook files without starting a session, so the files are not loaded by Kiro here, and the report says so. What the documentation does not say, and what stays unverified: whether a human's save fires `PostFileSave` (the text says "when the agent saves or modifies files"), the name of the path field in the event, the tool identifiers in `PreToolUse`. `math-tests` therefore reads every string of the event and falls back on `git status`, and `notes-private` examines every string of `tool_input`.

In CLI V3 the files of `.kiro/hooks/` also run for every agent, so with the `alidade` agent `notes-private` runs twice. Both runs are identical and refuse with the same line.

## 7. The MCP server (`tools/alidade-mcp`)

### 7.1 Protocol

As Req 5. `protocol.ts` exports `handleLine(line: string): string | null`. `SERVER_NAME` is `alidade`; the version is read from nothing (a constant `0.1.0`). `instructions` is two sentences that say what the tools are and that every bearing is true, in degrees, with a sigma. Request and notification are told apart by the presence of `id`.

### 7.2 Files

`framing.ts` · `protocol.ts` · `json-rpc.ts` (types, `parseMessage`, `errorLine`, `resultLine`) · `check.ts` · `outcome.ts` · `messages.ts` · `tools.ts` (registry: name, description, `inputSchema`, handler) · `tools/fix-from-bearings.ts`, `tools/magnetic-declination.ts`, `tools/local-offset.ts` · `server.ts` · `node-shim.d.ts`; `README.md`; tests next to the code, with `protocol.property.test.ts`, `tools/*.property.test.ts`, `server.integration.test.ts`, `readme-example.test.ts`.

### 7.3 The three handlers

`fix_from_bearings`: check arguments (D11) → for each bearing build a `BearingWire` `{ v: 1, kind: 'bearing', … }` and call `parseBearing` → `solve(new BearingModel(), bearings, { outlierRejection })` → `ellipse95(fix.ellipse)` → convert with `radToDeg` → `finiteOrFailure`. A failure of `parseBearing` or `solve` becomes `{ ok: false, reason, message, field?, id? }`. `magnetic_declination`: check → `declinationAt` → `radToDeg`. `local_offset`: check → `projectToLocalPlane` or `unprojectToLocalPlane`, converting positions with `degToRad`/`radToDeg`. A conversion that returns a failure (non-finite) is passed on as the failure.

### 7.4 Running the TypeScript of the skeleton

Core and Sensors are imported as source, with extensionless relative imports, which Node's type stripping does not resolve. So the server is **bundled**: `vite build` in SSR mode (`build.ssr: 'src/server.ts'`, `ssr.noExternal: true`, output `dist/server.mjs`, target `node24`) with `@alidade/core`, `@alidade/sensors` and `magvar` inlined. `pnpm --filter @alidade/mcp build` writes the one file `dist/server.mjs`; `.kiro/settings/mcp.json` runs it with `node`; the README says to build once. There is no launcher: a client that starts a server which runs a bundler risks bundler output on standard output, which must carry only JSON-RPC, and a slow start. Diagnostics go to standard error. `dist/` is gitignored. Task 1 first confirms that the bundle runs (a spike with a one-line server importing `declinationAt`) and stops if `magvar` or the sensors index does not bundle for Node.

## 8. Tests

- **Guard.** Table-driven examples, one row per cell of the rules table of Req 1.3, both columns. Properties (≥ 200 cases, domains stated): `decide` total over arbitrary JSON; every spelling of a notes path refused (generator: prefix, `..` detours, slashes, `~`, absolute, over a fake `realPrefix`); wrapping (Req 1.5) preserves refused and allowed for a fixed list of 20 commands of each kind. Example tests for each limit of Req 1.6 and for the real commands of the repository's task lists (`timeout 600 pnpm --filter @alidade/core test` allowed; `pnpm --filter @alidade/core test` refused). `repo-state` and `stop` against a git repository created in a temporary folder with fixed author data.
- **Agent and hook files.** `agent-file.test.ts`, `hooks-files.test.ts` as in §5 and §6; `check-spec` on all six requirements files.
- **MCP.** Handlers as pure functions with property tests: `bearingsArb` (2 to 8 bearings, positions within 80° of the equator, the poles excluded, sigmas inside `[0.01°, 45°]`), `hostileArb` (any JSON including `1e999`, `-0`, long strings, deep nesting to 50), `declinationArgsArb`, `offsetArgsArb`; the example tests for each excluded case and each reason's message. `protocol.property.test.ts` for Req 5.7. The integration test (Req 5.8) builds with `vite build` in `beforeAll`, builds to a temporary folder (the Vite `build` API with `outDir` there), spawns that file with `node` and checks the answers; a test timeout of 120 s and `timeout` in front of the run.
- No test reads `notes/`, the network, or the clock; the integration test spawns only `node`.

## 9. Open points and limits

- **`/tmp` and the working rules.** Decided by the lead: `write-outside-repo` allows the Repository root and `/tmp/` (test outputs live there), and never `notes/`.
- **`pnpm add` needs a human.** `install-offline` refuses `pnpm add` without `--offline`, so a task that adds a dependency (nonius 1.3) stops there and the lead runs the command. `pnpm install --offline` (used by this spec's task 1 to link the two new packages) is allowed.
- **Additions to the brief's list:** `killall` with `pkill`; `no-watch-mode` (bare `vitest`, from `tech.md`); `write-outside-repo` (the repository and `/tmp/`). Each is one row of the table and can be dropped.
- **`structure.md` has no `/tools`.** Task 5 adds one row (the lead approved); it is the only edit to the steering.
- **`skeleton/*/src/math`** exists only in `skeleton/ui`; Core and Sensors keep their files directly in `src/`. The matcher of the brief's example therefore covers `apps/vigia`, `apps/nonius` and `skeleton/ui` and no other part of the skeleton. Widening it to `skeleton/core/src/*.ts` is possible; it is not done because those folders' tests are the longest.
- **Unverified without a session:** the tool identifiers and the path field in real hook events; the era of Kiro's MCP client; whether `args` of an MCP server are resolved against the workspace root (`/mcp` shows whether the server started; the README says so).
