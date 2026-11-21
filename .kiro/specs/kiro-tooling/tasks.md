# Implementation Plan: kiro-tooling

Packages: `tools/kiro-guard` (`@alidade/kiro-guard`) and `tools/alidade-mcp` (`@alidade/mcp`), and the Kiro files named in `design.md` §1. Source of truth: `requirements.md` and `design.md` in this folder. `D7`, `§4.2` point into `design.md`; `Req N.M` into `requirements.md`.

## Working rules for every task

Vigia's working rules (`.kiro/specs/vigia/tasks.md`, "Working rules for every task") hold word for word, with these differences and additions:

- `math-conventions.md`, `tech.md`, `testing.md` are binding. **pnpm only**, exact versions, **no new dependency** (the two packages use only versions already in `skeleton/core/package.json` and `skeleton/sensors/package.json`), no `any`, no watch mode, **no dev server**, `timeout` in front of every test run, **no `pkill`**, **no commit**, **no network**, and **`notes/` is private: never read, never listed**.
- **Tests first** in every task: written before the code and seen to fail (the report names the failing run). **A failing property or example means stop**: say whether the code, the property or the requirement is wrong, with the evidence. Never weaken a tolerance, narrow a generator or delete an assertion.
- **Small commands.** Each command is one thing; files are written with the file tool; a command that starts a process the task did not need is a mistake.
- **`pnpm install` only as `pnpm install --offline`**, and only in task 1.1. WHEN it wants the network, stop and report.
- Do not edit `requirements.md`, `design.md`, anything under `skeleton/` or `apps/`, or the steering except the one row of task 5.2. Nothing of these packages goes into `skeleton/` or `apps/`.
- Every file the Guard or the server reads at run time is named in the README of its package. Neither package reads a file that the task did not create or that is not in `.git`.
- Each task ends with `timeout <n> pnpm --filter <package> test` and `pnpm --filter <package> typecheck` passing for what it touched, and `pnpm lint` and `pnpm format:check` from the root.
- **Stops for review:** after task 3 (the Guard and the Kiro files, before the server) and after task 5 (the end), and at any failing property.

## Tasks

- [x] 1. Scaffold and spikes (D2, D3, §7.4)
  - [x] 1.1 Add `'tools/*'` to `pnpm-workspace.yaml`; create `tools/kiro-guard` and `tools/alidade-mcp` with `package.json` (private, `type: module`, scripts `test` and `typecheck`; the MCP package also `build`; `@alidade/core` and `@alidade/sensors` as `workspace:*` in the MCP package only; `fast-check`, `typescript`, `vite`, `vitest` at the repository's versions), `tsconfig.json` (extends the base; `allowImportingTsExtensions`, `erasableSyntaxOnly`, `types: []`), `vitest.config.ts` (`environment: 'node'`, a `provide` of `propertyRuns: 200`) and a `src/node-shim.d.ts` with only the members each package will import. Run `pnpm install --offline`; record the diff of `pnpm-lock.yaml` (importers only; no external package added).
    - _Requirements: 1.1, 5.1_
  - [x] 1.2 Spike, throwaway files, reported and deleted: (a) `node tools/kiro-guard/src/<file>.ts` runs a TypeScript file with an explicit `.ts` import and prints; (b) a one-line server entry that imports `declinationAt` and `solve` from the two packages bundles with `vite build` (SSR, `noExternal: true`) and `node dist/<file>.mjs` prints a declination for a fixed position and time; (c) `kiro-cli agent validate` on the sample of §2 exits `0` and prints nothing. **WHEN (b) fails, stop and report; the design depends on it.**
    - _Requirements: 5.1, 6.2_
  - [x] 1.3 ESLint and Prettier cover the new folders (the root `eslint.config.js` already applies `tseslint.recommended` to every file; add nothing unless a throwaway file with `any` passes lint). Report what was needed.
    - _Requirements: 1.1_

- [x] 2. The guard's decisions, tests first (D4 to D6, §4.1 to §4.3)
  - [x] 2.1 Tests first: `shell-words.test.ts` (quotes, separators, `$( … )`, back-quotes, depth 4, assignments, each prefix, `bash -c`), `paths.test.ts` (every spelling of Req 1.4 over a fake `realPrefix`, the three allowed neighbours `docs/notes`, `notes.md`, `skeleton/core/notes.ts`), `decide.test.ts` (one example per cell of the rules table of Req 1.3, both columns, plus the repository's real commands), `decide.property.test.ts` (Req 1.1, 1.4, 1.5 as in §8), `limits.test.ts` (each limit of Req 1.6 as an example that is allowed).
    - _Requirements: 1.1 to 1.7_
  - [x] 2.2 Code: `shell-words.ts`, `paths.ts`, `decide.ts`. Every rule is one function with its id and its `Instead:` text; the reasons are plain words and name what to do (for `notes-private`: "ask the lead to paste the part you need"; for `test-needs-timeout`: the corrected command).
    - _Requirements: 1.1 to 1.7_
  - [x] 2.3 `main.ts` with `pre-tool-use` only: standard input to `decide`, exit codes and the single line of Req 1.2, `--only`. Tests: a spawned `node main.ts pre-tool-use` with an allowed event, a refused one, invalid JSON, a non-object and an input of more than 1 MiB.
    - _Requirements: 1.2, 1.7_

- [x] 3. Session hooks, IDE commands, the agent and the hook files (D1, §4.4, §4.5, §5, §6)
  - [x] 3.1 Tests first: `repo-state.test.ts` (a temporary git repository with a branch, a commit, uncommitted files in `skeleton/`, `apps/`, `docs/`, `notes/`; detached head; not a repository; exact strings of both outputs; the `notes/` name absent), `math-tests.test.ts` (event shapes: path under any key; absolute and relative; a test file, a source file, a file without tests, a file outside `src/math`; the command line built, with `spawnSync` replaced by a recorder), `check-spec.test.ts` (each rule of Req 4.3 with a broken copy; the six real requirements files pass).
    - _Requirements: 3.1 to 3.4, 4.2, 4.3_
  - [x] 3.2 Code: `repo-state.ts`, `math-tests.ts`, `check-spec.ts` and the dispatch for `session-start`, `stop`, `math-tests`, `check-spec` in `main.ts`; the Guard's `README.md` (the rules table, the limits, the hook events as far as they are known, what is unverified).
    - _Requirements: 3.1 to 3.4, 4.2, 4.3_
  - [x] 3.3 Tests first: `agent-file.test.ts` (Req 2.1 to 2.6, the documented sets as constants with their pages) and `hooks-files.test.ts` (Req 4.1, 4.4). Then write `.kiro/agents/alidade.json` and the three files of `.kiro/hooks/`. Run `kiro-cli agent validate --path .kiro/agents/alidade.json` (exit `0`) and `kiro-cli agent upgrade --dry-run` on a copy of `.kiro/agents` in `/tmp` (no errors); record both outputs.
    - _Requirements: 2.1 to 2.6, 4.1, 4.4_
  - [x] 3.4 Checkpoint 3: `timeout 300 pnpm --filter @alidade/kiro-guard test`, typecheck, root lint and format check. Run `node tools/kiro-guard/src/main.ts session-start` and `stop` for real in the repository, and `check-spec` on this specification's `requirements.md`; paste the outputs. **Stop for review.**
    - _Requirements: 3, 4_

- [x] 4. The MCP server (D7 to D12, §7)
  - [x] 4.1 Tests first: `framing.test.ts` (split lines, partial lines, `\r\n`, the 1 MiB cap and the resync), `check.test.ts` (each checker, unknown fields, the schema-to-check test of D11), `protocol.test.ts` (every example of Req 5.3 to 5.6, both eras, each error code, notifications never answered, a throwing handler gives `-32603` with a fixed message), `protocol.property.test.ts` (Req 5.7), `outcome.test.ts` (non-finite found at any depth), `messages.test.ts` (completeness over `Reason`, `SENSOR_REASONS` and the two MCP reasons; no code, underscore or `NaN` in a message), and the source scan of Req 5.1.
    - _Requirements: 5.1 to 5.7, 6.5, 6.6_
  - [x] 4.2 Code: `framing.ts`, `json-rpc.ts`, `check.ts`, `outcome.ts`, `messages.ts`, `protocol.ts`, `server.ts`, with a stub registry of one handler.
    - _Requirements: 5.1 to 5.7_
  - [x] 4.3 Tests first for the handlers: one example file per tool (the checks of Req 6.1 to 6.3, each reason, the synthetic fire of Req 6.7 built with Core's `initialAzimuthRad`, `1 m`, the declination equal to `declinationAt` through `radToDeg`, the round trip within `1e-6 m`), and `*.property.test.ts` with `hostileArb` and the in-domain arbitraries of §8 (Req 6.6). Then `tools/fix-from-bearings.ts`, `tools/magnetic-declination.ts`, `tools/local-offset.ts` and the registry with the three input schemas.
    - _Requirements: 6.1 to 6.7_
  - [x] 4.4 Tests first: `server.integration.test.ts` (Req 5.8; it builds to a temporary folder in its setup). Then `vite.config.ts` (SSR build, §7.4) and the `build` script, `dist/` in `.gitignore` if it is not there already.
    - _Requirements: 5.2, 5.8, 6.8_

- [x] 5. Registration, the README, the end (Req 6.8, §9)
  - [x] 5.1 Write `.kiro/settings/mcp.json` (Req 6.8). Tests first: `readme-example.test.ts` (Req 6.8's extraction and comparison). Then the package `README.md`: what it is, the three tools with their arguments, how to build and start it, how to see it in Kiro, the worked example (a synthetic fire seen from two synthetic posts: two bearings with their sigmas, the request, the answer with the 95 % ellipse), the limits (true azimuths, degrees, no file, no network, 64 bearings).
    - _Requirements: 6.8_
  - [x] 5.2 Add one row for `/tools` to `.kiro/steering/structure.md` (the lead approved): `tools/kiro-guard` and `tools/alidade-mcp`, what each is, and that they import only the skeleton and Node.
    - _Requirements: 1.1, 5.1_
  - [x] 5.3 Final checkpoint: from the root, `timeout 900 pnpm test`, `pnpm typecheck`, `pnpm lint`, `pnpm format:check`; `kiro-cli agent validate` again; the three `.kiro/hooks` files and the agent and `mcp.json` formatted with `pnpm exec prettier --check --ignore-path /dev/null`; `git status` to show that only the intended files changed. The report lists, for each of the six requirements, the test that proves each criterion, and the list of unverified points of design §9 and Req 4.5. **Stop for review.**
    - _Requirements: all_
