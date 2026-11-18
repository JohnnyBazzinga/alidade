// Req 3.3 (the code and the fixed words) as a list of problems, shared by the example test and P-3.11 (test support, not exported).

import type { Message } from '../math/messages';

const FORBIDDEN = /_|NaN|Infinity|undefined|null|\[object/;

export function partsOf(message: Message): string[] {
  return [message.whatHappened, message.whatToDo];
}

/** Req 3.3 as a list of problems (empty when the part is fine). */
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
