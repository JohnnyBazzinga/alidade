---
inclusion: fileMatch
fileMatchPattern: "**/*.test.ts"
---

# Testing

## What to write

- **Property-based tests** (`fast-check`) for every correctness property in a spec's design. Each one names the property and the requirements it validates in a comment above the test.
- **Example tests** for specific known values: published reference cases, fixtures, and each failure reason.
- **Statistical tests** use a fixed seed passed in as an argument, so they are deterministic.

## Rules

1. **A failing property is information.** When a property test fails, first decide whether the code, the property or the requirement is wrong, and say which. Never weaken a tolerance, narrow a generator or delete an assertion just to get a pass.
2. **No fake tests.** A test must fail if the behaviour it names is broken. Tests that only check that a function exists, that a value is defined, or that mock the unit under test are not acceptable.
3. **Fixtures are read-only.** If a test disagrees with a fixture, the code or the test is wrong.
4. **Generators state their domain.** Each generator documents the ranges it draws from and what it excludes (for example, positions within 1° of a pole). Degenerate cases that are excluded from one property must be covered by a test of their own.
5. **Shrunk counterexamples are kept.** When a property test finds a real bug, add the shrunk counterexample as an example test before fixing the code.
6. **Tolerances come from the spec**, not from whatever makes the test pass. Compare angles with `wrapPi(a - b)`.
7. **Run at least 200 cases** per property.

## Running

`pnpm test` runs everything once and exits. Do not use watch mode.
