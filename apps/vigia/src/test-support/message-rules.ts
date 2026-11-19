// Req 2.3 and 2.4 (the code and the fixed words) as a list of problems, shared by the example test
// of the table and by the component test of the notices (test support, not exported). The rules
// are UI's own (UI Req 3.3): one sentence of at most 160 characters ending in a full stop, none of
// the forbidden strings, and not the reason's code.

import type { Message } from '@alidade/ui';

const FORBIDDEN = /_|NaN|Infinity|undefined|null|\[object/;

export function partsOf(message: Message): string[] {
  return [message.whatHappened, message.whatToDo];
}

/** The rules as a list of problems (empty when the part is fine). */
export function problemsOf(part: string, code: string): string[] {
  const problems: string[] = [];
  if (part.length === 0) problems.push('empty');
  if (part.length > 160) problems.push('over 160 characters');
  if (!part.endsWith('.')) problems.push('no full stop at the end');
  if ((part.match(/[.!?](\s|$)/g) ?? []).length !== 1) problems.push('not one sentence');
  if (FORBIDDEN.test(part)) problems.push('forbidden text');
  if (part.includes(code)) problems.push('contains the code');
  return problems;
}
