// The limits of the Guard (Req 1.6), recorded as examples that are ALLOWED. If the Guard ever
// starts to understand one of them, the example changes sides and the README changes with it.

import { describe, expect, it } from 'vitest';
import { decide } from './decide.ts';
import { CONTEXT, shellEvent } from './test-helpers.ts';

describe('what the Guard does not understand', () => {
  it.each([
    ['a variable', 'X=notes; cat $X/a'],
    ['a variable holding a command', 'P=pkill; $P node'],
    ['a glob', 'cat n*es/a'],
    ['eval of an encoded command', 'eval "$(echo cGtpbGwgbm9kZQ== | base64 -d)"'],
    ['a script file', 'sh run-something.sh'],
    ['a redirect target built by cd', 'cd docs/.. && cd . && echo hi'],
  ])('allows %s', (_name, command) => {
    expect(decide(shellEvent(command), CONTEXT).allow).toBe(true);
  });
});
