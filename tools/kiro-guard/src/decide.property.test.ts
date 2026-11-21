import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { decide, RULE_IDS } from './decide.ts';
import { ALLOWED_COMMANDS, REFUSED_COMMANDS } from './rule-cases.ts';
import { CONTEXT, fileEvent, ROOT, shellEvent } from './test-helpers.ts';

const NUM_RUNS = 200;

const BAD_TEXT = /undefined|null|\[object|NaN/;

/** Wrappers of Req 1.5. Each puts a command inside another shell construct. */
const WRAPPERS: readonly (readonly [string, (command: string) => string])[] = [
  ['cd x &&', (c) => `cd x && ${c}`],
  ['; true', (c) => `${c}; true`],
  ['true ||', (c) => `true || ${c}`],
  ['| cat', (c) => `${c} | cat`],
  ['bash -c', (c) => `bash -c '${c}'`],
  ['sudo', (c) => `sudo ${c}`],
  ['echo $()', (c) => `echo $(${c})`],
  ['back-quotes', (c) => `echo \`${c}\``],
  ['env', (c) => `env FOO=1 ${c}`],
];

/**
 * Domain: any JSON value as the event (objects, arrays, strings, numbers, nesting), and events of
 * the right shape whose strings are arbitrary, including quotes, `$(`, back-quotes, NUL and long
 * text. Nothing is excluded.
 */
const eventArb: fc.Arbitrary<unknown> = fc.oneof(
  fc.jsonValue(),
  fc.record({
    hook_event_name: fc.string(),
    cwd: fc.oneof(fc.string(), fc.constant(ROOT), fc.integer()),
    tool_name: fc.oneof(fc.string(), fc.constantFrom('fs_write', 'write', 'execute_bash', 'shell')),
    tool_input: fc.oneof(
      fc.jsonValue(),
      fc.record({
        command: fc.string({ size: 'large', unit: 'binary' }),
        path: fc.string({ unit: 'binary' }),
        text: fc.string(),
      }),
      fc.record({ command: fc.stringMatching(/^[a-z$()`'"; |&<>\n-]{0,60}$/) }),
    ),
  }),
);

describe('decide is total (Req 1.1)', () => {
  // Property: for all JSON values as the event and any subset of the rule ids as `only`, decide
  // returns a Decision without throwing, with a rule id of the closed set and clean words.
  // Validates Req 1.1.
  it('never throws and never returns unclean words', () => {
    fc.assert(
      fc.property(eventArb, fc.subarray([...RULE_IDS]), (event, only) => {
        const decision = decide(event, { ...CONTEXT, only });
        expect(typeof decision.allow).toBe('boolean');
        if (!decision.allow) {
          expect(RULE_IDS).toContain(decision.rule);
          expect(decision.reason).not.toMatch(BAD_TEXT);
          expect(decision.instead).not.toMatch(BAD_TEXT);
        }
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('every spelling of a path of the Notes folder is refused (Req 1.4)', () => {
  /**
   * Domain: names of 1 to 12 characters from [a-z0-9._-], one or two levels below notes/.
   * Excludes the names `.` and `..`, which are not names: a detour `./../notes` leaves the
   * repository, and that is an example test of its own (paths.test.ts, "a sibling's notes").
   */
  const nameArb = fc
    .stringMatching(/^[a-z0-9._-]{1,12}$/)
    .filter((name) => name !== '.' && name !== '..');
  const subArb = fc.array(nameArb, { minLength: 1, maxLength: 2 }).map((parts) => parts.join('/'));
  const spellingArb = fc.record({
    sub: subArb,
    form: fc.constantFrom(
      'relative',
      'dot',
      'detour',
      'absolute',
      'doubled',
      'home',
      'homeVar',
      'braced',
    ),
    trailing: fc.constantFrom('', '/'),
    detour: nameArb,
  });

  function spell(s: { sub: string; form: string; trailing: string; detour: string }): string {
    const tail = `notes/${s.sub}${s.trailing}`;
    switch (s.form) {
      case 'relative':
        return tail;
      case 'dot':
        return `./${tail}`;
      case 'detour':
        return `${s.detour}/../${tail}`;
      case 'absolute':
        return `${ROOT}/${tail}`;
      case 'doubled':
        return `${ROOT}//notes//${s.sub}${s.trailing}`;
      case 'home':
        return `~/p/${tail}`;
      case 'homeVar':
        return `$HOME/p/${tail}`;
      default:
        return `\${HOME}/p/${tail}`;
    }
  }

  // Property: for all ways of writing a path below notes/, as a file tool's path and as a shell
  // word, the Decision is a refusal by notes-private. Validates Req 1.4.
  it('as a path field and as a shell word', () => {
    fc.assert(
      fc.property(
        spellingArb,
        fc.constantFrom('read_file', 'fs_write', 'unknown_tool'),
        (s, tool) => {
          const path = spell(s);
          for (const event of [fileEvent(tool, { path }), shellEvent(`cat ${path}`)]) {
            const decision = decide(event, CONTEXT);
            expect(decision.allow).toBe(false);
            if (!decision.allow) expect(decision.rule).toBe('notes-private');
          }
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property: a path that merely resembles the Notes folder is never refused for that reason.
  // Domain: the names `notesX`, `Xnotes`, `docs/notes` below the repository root.
  it('does not refuse the neighbours', () => {
    fc.assert(
      fc.property(nameArb, fc.constantFrom('docs/notes', 'notes-', '-notes'), (name, base) => {
        const path = base.endsWith('-')
          ? `${base}${name}/a`
          : base === '-notes'
            ? `${name}-notes/a`
            : `${base}/${name}`;
        const decision = decide(fileEvent('read_file', { path }), CONTEXT);
        expect(decision.allow).toBe(true);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('wrapping a command does not change its decision (Req 1.5)', () => {
  const refused = Object.entries(REFUSED_COMMANDS).flatMap(([rule, commands]) =>
    (commands ?? []).map((command) => [rule, command] as const),
  );

  // Property: for all refused commands of the table and all wrappers, the same rule refuses.
  // Domain: the table's commands, which contain no single quote. Validates Req 1.5.
  it('keeps a refused command refused by the same rule', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...refused),
        fc.constantFrom(...WRAPPERS),
        ([rule, command], [, wrap]) => {
          const decision = decide(shellEvent(wrap(command)), CONTEXT);
          expect(decision.allow).toBe(false);
          if (!decision.allow) expect(decision.rule).toBe(rule);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  // Property: for all allowed commands of the table and all wrappers, the call is still allowed.
  it('keeps an allowed command allowed', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...ALLOWED_COMMANDS),
        fc.constantFrom(...WRAPPERS),
        (command, [, wrap]) => {
          expect(decide(shellEvent(wrap(command)), CONTEXT).allow).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});
