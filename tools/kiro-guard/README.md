# @alidade/kiro-guard

Hook commands for Kiro, used by the project agent `.kiro/agents/alidade.json` and by the three IDE hooks in `.kiro/hooks/`. It has no dependencies. Node 24 runs the TypeScript directly:

```
node tools/kiro-guard/src/main.ts <subcommand>
```

**The guard is a guard against mistakes, not a security boundary.** The agent's permission rules, which deny reading and writing `notes/`, are the second line for that folder.

Start Kiro at the repository root: the hook commands are relative paths.

## Subcommands

| Subcommand                        | Used by                                           | What it does                                                                                                                         |
| --------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pre-tool-use [--only <rule-id>]` | agent `PreToolUse` hook; IDE hook `notes-private` | Reads the hook event on standard input. Exit 0 and no output to allow; exit 2 and one line on standard error to refuse.              |
| `session-start`                   | agent `SessionStart` hook                         | Prints the branch, the last commit and the uncommitted files (never anything under `notes/`), at most 1 500 characters.              |
| `stop`                            | agent `Stop` hook                                 | When files under `skeleton/` or `apps/` changed, prints the four root checks. Never asks the session to continue.                    |
| `math-tests`                      | IDE hook `math-tests-on-save`                     | Runs `timeout 300 pnpm --filter <package> exec vitest run <test files>` for a saved `apps/*/src/math` or `skeleton/*/src/math` file. |
| `check-spec [path]`               | IDE hook `spec-format-on-save`                    | Checks a `.kiro/specs/<name>/requirements.md` against the format of the existing specifications.                                     |

## What `pre-tool-use` refuses and allows

The refusal line has the form `kiro-guard: refused [<rule id>] <reason> Instead: <what to do>`.

| Rule id              | Refused                                                                                                                      | Still allowed                                                       |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `notes-private`      | any path that resolves to `notes/` or below, in any tool, as a field, a shell word or a redirect target                      | `docs/notes/a.md`, `notes.md`, a write whose text mentions `notes/` |
| `no-pkill`           | `pkill`, `killall`                                                                                                           | `kill 123`, `echo pkill`                                            |
| `no-git-commit`      | `git commit`, also after `-C`, `-c` and `--git-dir`                                                                          | `git status`, `git diff`, `git log -1`                              |
| `no-git-push`        | `git push`                                                                                                                   | `git fetch --dry-run`                                               |
| `no-dev-server`      | `pnpm dev`, `pnpm preview`, `pnpm start`, `vite`, `vite dev`, `vite preview`                                                 | `pnpm --filter @alidade/nonius build`, `vite build`                 |
| `no-watch-mode`      | `vitest` without `run`, `related` or `--run`                                                                                 | `timeout 60 vitest run src/a.test.ts`                               |
| `install-offline`    | `pnpm add` without `--offline`; `pnpm install` and `pnpm i` without `--offline` or `--frozen-lockfile`                       | `pnpm add --offline x`, `pnpm install --frozen-lockfile`            |
| `test-needs-timeout` | `pnpm test`, `pnpm test:*`, `pnpm run test…`, `vitest run` and the like, without `timeout` in front                          | `timeout 600 pnpm test`, `pnpm typecheck`, `pnpm lint`              |
| `write-outside-repo` | a write tool (`fs_write`, `write`, `str_replace`, `fs_append`, `delete_file`) with a path outside the repository and `/tmp/` | a write to `tools/kiro-guard/src/a.ts` or `/tmp/out.txt`            |
| `bad-input`          | an event that is not one JSON object, or is longer than 1 MiB (fail closed)                                                  |                                                                     |

How it reads a call: for every tool, whatever its name, it examines every string of `tool_input` except the body keys (`text`, `content`, `file_text`, `oldStr`, `newStr`, `old_str`, `new_str`, `query`, `prompt`); the value of `pattern` is examined up to its first glob character. Any string under `command` is read as a shell command: split at `;`, `&&`, `||`, `|`, `&` and newlines, quotes removed, `$( … )`, back-quotes and `bash -c '…'` read to a depth of four, and the prefixes `env`, `sudo`, `nice`, `nohup`, `time`, `xargs`, `command`, `exec`, `npx`, `timeout` skipped. Paths are resolved against the event's `cwd` (`.`, `..`, `~`, `$HOME` and symlinks included).

## Limits

- A command built from variables, globs, `eval`, an encoding or a script file is not understood and is allowed (`src/limits.test.ts` records each as an example).
- A shell word that is `notes/` is refused wherever it appears, even as a `grep` pattern. That is a false positive, kept on purpose.
- Redirects are not read for `write-outside-repo`; only the write tools' `path` is.
- The tool identifiers of real `PreToolUse` events were not observed (the documentation shows both `read_file` and `read`), which is why the guard classifies by the shape of the input and the hook matcher is `*`.

## The Kiro files

- **`.kiro/agents/alidade.json`**: passes `kiro-cli agent validate`. That command only type-checks (it accepts an unknown trigger and an unknown rule effect), so `src/agent-file.test.ts` checks the file against the documented triggers, effects and capabilities.
- **`.kiro/hooks/*.json`** (`math-tests-on-save`, `spec-format-on-save`, `notes-private`): **written to the schema in the Kiro documentation (`kiro.dev/docs/hooks/`) and checked against that documentation by `src/hooks-files.test.ts`. They were not run in the Kiro IDE, which cannot run on the machine that built them.** Not verified: that a save by the user, and not only by the agent, fires `PostFileSave`; the name of the field that carries the saved path (`math-tests` reads every string of the event and falls back on `git status`); the tool identifiers in `PreToolUse` events.
- In CLI V3 the files of `.kiro/hooks/` also run for every agent, so with the `alidade` agent the `notes-private` check runs twice. Both runs are identical.

## Tests

`timeout 300 pnpm --filter @alidade/kiro-guard test`. The temporary git repositories of the tests are created under the system's temporary folder, with fixed author data, and removed afterwards.
