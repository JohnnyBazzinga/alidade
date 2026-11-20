// The lines a text wraps to, for the height arithmetic of the screens (test support, not exported).

/** The advance of one monospace character, in ems: 0.6 measured, 0.63 with a 5 % margin. */
export const ADVANCE_EM = 0.63;

/** The lines `text` wraps to in `widthPx` at `fontPx` (greedy, at spaces; a long word breaks). */
export function wrappedLines(text: string, widthPx: number, fontPx: number): number {
  const perLine = Math.max(1, Math.floor(widthPx / (ADVANCE_EM * fontPx)));
  let count = 1;
  let used = 0;
  for (const word of text.trim().split(/\s+/)) {
    const need = used === 0 ? word.length : used + 1 + word.length;
    if (need <= perLine) used = need;
    else if (word.length <= perLine) {
      count += 1;
      used = word.length;
    } else {
      count += Math.ceil(word.length / perLine) - (used === 0 ? 1 : 0);
      used = word.length % perLine;
    }
  }
  return count;
}
