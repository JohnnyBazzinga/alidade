// Reads a shell command well enough to find the commands in it (design §4.2). Nothing is
// evaluated: no variable, glob or `eval` is resolved (Req 1.6).

/** How many levels of `$( … )` and back-quotes are read; deeper text stays one word. */
const MAX_SUBSTITUTION_DEPTH = 4;

/** How many levels of `bash -c '…'` are read. */
const MAX_SCRIPT_DEPTH = 4;

export interface Analysed {
  /** The command word, by its basename, after assignments and prefixes. */
  readonly command: string;
  /** The words after the command word. */
  readonly args: readonly string[];
  /** True when a `timeout` came before the command word. */
  readonly timeoutWrapped: boolean;
  /** Every word of the segment, as read, for the path check. */
  readonly words: readonly string[];
}

/** Index of the `)` that closes a `$(` whose body starts at `start`, or the end of the text. */
function matchParen(text: string, start: number): number {
  let depth = 1;
  let quote: string | null = null;
  for (let i = start; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '\\' && quote !== "'") {
      i++;
    } else if (quote !== null) {
      if (ch === quote) quote = null;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return text.length;
}

/** Index of the back-quote that closes one opened before `start`, or the end of the text. */
function matchBackquote(text: string, start: number): number {
  for (let i = start; i < text.length; i++) {
    if (text.charAt(i) === '\\') i++;
    else if (text.charAt(i) === '`') return i;
  }
  return text.length;
}

/**
 * The segments of a command: runs of words between `;`, `&&`, `||`, `|`, `&`, parentheses and
 * newlines outside quotes, with quotes removed. Command substitutions and back-quotes are read as
 * further segments, placed after the segments of the text that holds them.
 */
export function segmentsOf(command: string, depth = 0): string[][] {
  const segments: string[][] = [];
  const nested: string[][] = [];
  let words: string[] = [];
  let word = '';
  let inWord = false;
  let quote: '"' | "'" | null = null;

  const endWord = (): void => {
    if (inWord) words.push(word);
    word = '';
    inWord = false;
  };
  const endSegment = (): void => {
    endWord();
    if (words.length > 0) segments.push(words);
    words = [];
  };
  const substitution = (inner: string, raw: string): void => {
    if (depth < MAX_SUBSTITUTION_DEPTH) nested.push(...segmentsOf(inner, depth + 1));
    else word += raw;
  };

  let i = 0;
  while (i < command.length) {
    const ch = command.charAt(i);
    if (quote === "'") {
      if (ch === "'") quote = null;
      else word += ch;
      i++;
    } else if (ch === '\\') {
      word += command.charAt(i + 1);
      inWord = true;
      i += 2;
    } else if (ch === '$' && command.charAt(i + 1) === '(') {
      const end = matchParen(command, i + 2);
      substitution(command.slice(i + 2, end), command.slice(i, end + 1));
      i = end + 1;
    } else if (ch === '`') {
      const end = matchBackquote(command, i + 1);
      substitution(command.slice(i + 1, end), command.slice(i, end + 1));
      i = end + 1;
    } else if (quote === '"') {
      if (ch === '"') quote = null;
      else word += ch;
      i++;
    } else if (ch === "'" || ch === '"') {
      quote = ch;
      inWord = true;
      i++;
    } else if (';|&\n()'.includes(ch)) {
      endSegment();
      i++;
    } else if (ch === ' ' || ch === '\t' || ch === '\r') {
      endWord();
      i++;
    } else {
      word += ch;
      inWord = true;
      i++;
    }
  }
  endSegment();
  return [...segments, ...nested];
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=/;

/** Words that run another command; their own options are skipped. */
const PREFIXES: ReadonlySet<string> = new Set([
  'env',
  'sudo',
  'command',
  'nice',
  'nohup',
  'time',
  'xargs',
  'exec',
  'npx',
  'pnpx',
  'bunx',
]);

/** Options of the prefixes that take a value in the next word. */
const OPTIONS_WITH_VALUE: ReadonlySet<string> = new Set([
  '-u',
  '-n',
  '-I',
  '-g',
  '-C',
  '-p',
  '-L',
  '-P',
  '-s',
  '-t',
]);

const SHELLS: ReadonlySet<string> = new Set(['bash', 'sh', 'zsh']);

export function basename(word: string): string {
  const slash = word.lastIndexOf('/');
  return slash >= 0 ? word.slice(slash + 1) : word;
}

function skipOptions(words: readonly string[], from: number): number {
  let i = from;
  while (i < words.length && (words[i] ?? '').startsWith('-') && words[i] !== '-') {
    i += OPTIONS_WITH_VALUE.has(words[i] ?? '') ? 2 : 1;
  }
  return i;
}

function skipTimeoutArguments(words: readonly string[], from: number): number {
  let i = from;
  while (i < words.length && (words[i] ?? '').startsWith('-')) {
    const takesValue = ['-k', '-s', '--kill-after', '--signal'].includes(words[i] ?? '');
    i += takesValue ? 2 : 1;
  }
  if (i < words.length && /^\d/.test(words[i] ?? '')) i++;
  return i;
}

/** The command of one segment, or null when it holds only assignments. */
export function analyse(words: readonly string[]): Analysed | null {
  let i = 0;
  let timeoutWrapped = false;
  for (let guard = 0; guard < 32; guard++) {
    while (i < words.length && ASSIGNMENT.test(words[i] ?? '')) i++;
    if (i >= words.length) return null;
    const name = basename(words[i] ?? '');
    if (name === 'timeout') {
      timeoutWrapped = true;
      i = skipTimeoutArguments(words, i + 1);
    } else if (PREFIXES.has(name)) {
      i = skipOptions(words, i + 1);
    } else {
      return { command: name, args: words.slice(i + 1), timeoutWrapped, words };
    }
  }
  return null;
}

/** Every command in a shell command, including those in substitutions and `bash -c` scripts. */
export function commandsOf(command: string, depth = 0): Analysed[] {
  const found: Analysed[] = [];
  for (const words of segmentsOf(command)) {
    const analysed = analyse(words);
    if (analysed === null) continue;
    found.push(analysed);
    if (SHELLS.has(analysed.command) && depth < MAX_SCRIPT_DEPTH) {
      const flag = analysed.args.indexOf('-c');
      const script = flag >= 0 ? analysed.args[flag + 1] : undefined;
      if (script !== undefined) found.push(...commandsOf(script, depth + 1));
    }
  }
  return found;
}
