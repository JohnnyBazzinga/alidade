// The alphabet of the sighting code and of the identifiers (Req 8.2, design §7.2, §8).
//
// 31 symbols: the digits 2 to 9 and the letters but I, L and O. The order is the symbol's value:
// `2` is 0 and `Z` is 30. None is altered by a messaging app or a URL (no space, `+`, `/`, `=`,
// `%`, `&`, `?`, no lower case) and none is easily confused when read aloud or copied by hand
// (`0`, `O`, `1`, `I`, `L` are not in it). There is no case folding and no look-alike mapping
// anywhere: a character outside the alphabet is damage.

export const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const ALPHABET_SIZE = 31;

const VALUE_OF = new Map<string, number>([...ALPHABET].map((symbol, value) => [symbol, value]));

/** The value 0 to 30 of a symbol, or `null` for anything else (a longer string included). */
export function symbolValue(symbol: string): number | null {
  return VALUE_OF.get(symbol) ?? null;
}

/** The symbol of a value that is an integer from 0 to 30, or `null`. */
export function symbolAt(value: number): string | null {
  return Number.isInteger(value) && value >= 0 && value < ALPHABET_SIZE
    ? ALPHABET.charAt(value)
    : null;
}

/** True when every character of `text` is a symbol (the empty string included). */
export function isAlphabetString(text: string): boolean {
  for (const character of text) {
    if (!VALUE_OF.has(character)) return false;
  }
  return true;
}

/** `code` in groups of five symbols joined by hyphens (50 symbols: ten groups, 59 characters). */
export function groupCode(code: string): string {
  const groups: string[] = [];
  for (let at = 0; at < code.length; at += 5) groups.push(code.slice(at, at + 5));
  return groups.join('-');
}

/** `text` without whitespace and hyphens, which a messaging app or a reader may add. */
export function stripCode(text: string): string {
  return text.replace(/[\s-]/g, '');
}
