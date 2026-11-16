---
inclusion: always
---

# Structure

One repository, pnpm workspaces. The Skeleton Crew category requires the two applications to live in two separate folders of the same repo, with `/.kiro` at the root.

```
/.kiro                 specs, steering, hooks, agents, settings (never gitignored)
/skeleton
  /core                @alidade/core     pure math: angles, geodesy, observations, solver, uncertainty
  /sensors             @alidade/sensors  device orientation, GPS, declination; simulator source
  /ui                  @alidade/ui       camera image, sighting reticle, uncertainty ellipse map layer, simulator panel
/apps
  /vigia               wildfire smoke triangulation
  /nonius              celestial position fix
/docs                  judge-facing docs and recorded sighting fixtures
LICENSE                open source licence, detectable by GitHub
README.md
```

## Dependency direction

```
apps/*  ->  skeleton/ui  ->  skeleton/sensors  ->  skeleton/core
```

- Arrows point at what may be imported. Nothing imports upward.
- `skeleton/*` never imports from `apps/*`.
- The two apps never import from each other.
- `skeleton/core` imports nothing outside itself.

## Conventions

- One concept per file. File names are kebab-case; exported types are PascalCase; functions and variables are camelCase.
- Each package exports its public API from `src/index.ts` only. Deep imports across packages are forbidden.
- Tests sit next to the code: `foo.ts` and `foo.test.ts`. Property-based tests go in `foo.property.test.ts`.
- Reference data used by tests lives in `fixtures/` inside the package and is read-only: tests are fixed to match fixtures, fixtures are never edited to make a test pass.
- A feature moves into `skeleton/` only when both apps need it. Until then it stays in the app.
