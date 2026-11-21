import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createFramer } from './framing.ts';
import { handleLine, TOO_LONG_RESPONSE } from './protocol.ts';

const NUM_RUNS = 200;

const METHODS = [
  'initialize',
  'ping',
  'server/discover',
  'tools/list',
  'tools/call',
  'notifications/initialized',
  'nope',
];

/** Domain: a request object with a known or random method, an id of any JSON kind, and params of any JSON value. */
const validishArb = fc
  .record({
    jsonrpc: fc.constantFrom('2.0', '2.0', '2.0', '1.0'),
    id: fc.oneof(fc.integer(), fc.string(), fc.constant(null), fc.jsonValue()),
    method: fc.oneof(fc.constantFrom(...METHODS), fc.string()),
    params: fc.oneof(fc.jsonValue(), fc.constant(undefined)),
  })
  .map((message) => JSON.stringify(message));

/** Domain: a valid message with one character inserted, deleted or replaced at a random place. */
const mutatedArb = fc
  .tuple(
    validishArb,
    fc.nat(400),
    fc.string({ maxLength: 2 }),
    fc.constantFrom('insert', 'delete', 'replace'),
  )
  .map(([line, at, text, kind]) => {
    const index = at % (line.length + 1);
    if (kind === 'insert') return line.slice(0, index) + text + line.slice(index);
    if (kind === 'delete') return line.slice(0, index) + line.slice(index + 1);
    return line.slice(0, index) + text + line.slice(index + 1);
  });

/** Domain: any string, including lone surrogates, NUL and control characters, up to a few hundred characters; no newline. */
const randomArb = fc
  .string({ unit: 'binary', maxLength: 300 })
  .map((text) => text.replace(/\n/g, ' '));

const lineArb = fc.oneof(validishArb, mutatedArb, randomArb);

function expectOneJsonLine(response: string): void {
  expect(response).not.toContain('\n');
  const message = JSON.parse(response) as Record<string, unknown>;
  expect(message['jsonrpc']).toBe('2.0');
  expect('result' in message !== 'error' in message).toBe(true);
}

describe('the line handler is total (Req 5.7)', () => {
  // Property: for all lines (valid, mutated or random), handleLine returns without throwing either
  // nothing or exactly one line of valid JSON-RPC with one of result and error. Validates Req 5.7.
  it('never throws and never writes a line that is not valid JSON-RPC', () => {
    fc.assert(
      fc.property(lineArb, (line) => {
        const response = handleLine(line);
        if (response !== null) expectOneJsonLine(response);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  // Property: a valid request with an integer id is answered exactly once, with that id, whatever
  // its method and params. Validates Req 5.5, 5.7. Domain: ids are integers; params any JSON.
  it('answers a valid request once, with its id', () => {
    fc.assert(
      fc.property(
        fc.integer(),
        fc.constantFrom(...METHODS.filter((method) => !method.startsWith('notifications/'))),
        fc.jsonValue(),
        (id, method, params) => {
          const response = handleLine(JSON.stringify({ jsonrpc: '2.0', id, method, params }));
          expect(response).not.toBeNull();
          expect((JSON.parse(response ?? '') as Record<string, unknown>)['id']).toBe(id);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

describe('the framer and the handler together (Req 5.2, 5.7)', () => {
  // Property: for all sequences of lines cut into chunks anywhere, every output line is valid
  // JSON-RPC, every valid request (distinct integer id) is answered exactly once, and a line over
  // the cap is answered with the too-long error. Validates Req 5.2, 5.7.
  it('answers every request once however the input is cut', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            lineArb.map((text) => ({ valid: false, text })),
            fc.constant({ valid: true, text: '' }),
          ),
          {
            maxLength: 12,
          },
        ),
        fc.array(fc.integer({ min: 1, max: 40 }), { minLength: 1, maxLength: 8 }),
        (specs, cuts) => {
          const lines = specs.map((spec, index) =>
            spec.valid
              ? JSON.stringify({ jsonrpc: '2.0', id: 1000 + index, method: 'ping' })
              : spec.text,
          );
          const input = lines.join('\n') + '\n';
          const framer = createFramer(2000);
          const outputs: string[] = [];
          let position = 0;
          for (let i = 0; position < input.length; i++) {
            const size = cuts[i % cuts.length] ?? 1;
            for (const frame of framer.push(input.slice(position, position + size))) {
              const response = frame.kind === 'line' ? handleLine(frame.text) : TOO_LONG_RESPONSE;
              if (response !== null) outputs.push(response);
            }
            position += size;
          }
          for (const frame of framer.end()) {
            const response = frame.kind === 'line' ? handleLine(frame.text) : TOO_LONG_RESPONSE;
            if (response !== null) outputs.push(response);
          }
          for (const output of outputs) expectOneJsonLine(output);
          specs.forEach((spec, index) => {
            if (!spec.valid) return;
            const answered = outputs.filter(
              (output) => (JSON.parse(output) as Record<string, unknown>)['id'] === 1000 + index,
            );
            expect(answered).toHaveLength(1);
          });
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('answers a line over the cap with the too-long error and carries on', () => {
    const framer = createFramer(50);
    const frames = framer.push(
      'x'.repeat(60) + '\n' + JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n',
    );
    expect(frames.map((frame) => frame.kind)).toStrictEqual(['too-long', 'line']);
  });
});
