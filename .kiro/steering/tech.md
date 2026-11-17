---
inclusion: always
---

# Tech

## Stack

- **Language:** TypeScript, `strict` mode, ES modules only.
- **Runtime:** Node 24 for tooling and tests; evergreen mobile browsers (Safari on iOS, Chrome on Android) for the apps.
- **Package manager:** pnpm workspaces. Never use npm or yarn commands.
- **Build:** Vite.
- **Tests:** Vitest. Property-based tests use `fast-check`.
- **UI:** React, in `skeleton/ui` and the apps only.
- **Maps:** MapLibre GL JS.
- **Astronomy:** `astronomy-engine` for ephemerides. Do not hand-write planetary theory.
- **Geomagnetism:** `magvar` 2.2.0 (MIT, WMM2025) for magnetic declination, in `skeleton/sensors` only, imported by one wrapper module. Do not hand-write the World Magnetic Model.
- **Lint and format:** ESLint and Prettier, run from the repo root.

Pin exact dependency versions in `package.json` (no `^` or `~`).

## Commands

Run from the repo root.

| Purpose | Command |
|---|---|
| Install | `pnpm install` |
| All tests, once | `pnpm test` |
| Tests for one package | `pnpm --filter <package> test` |
| Type check | `pnpm typecheck` |
| Lint | `pnpm lint` |
| Dev server for an app | `pnpm --filter <app> dev` |

Tests must run once and exit. Never start a watch mode or a dev server from an automated task.

## Rules

- `skeleton/core` has **zero runtime dependencies** and no access to the DOM, the network, the clock or randomness. Time and random seeds are passed in as arguments.
- No `any`. No non-null assertions (`!`) in `skeleton/core`.
- Functions in `skeleton/core` are pure and return `Result` values for expected failures. They throw only on programmer error.
- Do not add a dependency to do something that takes under 30 lines to write correctly, and do not hand-write something a pinned dependency already does well.
- Browser sensor APIs (device orientation, geolocation, page visibility, screen orientation, permissions) are touched only inside `skeleton/sensors`. The camera image (`getUserMedia`) belongs to `skeleton/ui`. Everything else receives plain data.
- Secrets never go in the repo. API keys are read from environment variables and documented in `.env.example`.
