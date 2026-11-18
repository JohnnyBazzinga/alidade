/** Deep equality with `Object.is` on every number (so `-0` and `0`, and every bit, count). */
export function deepSame(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' || typeof b === 'number') return Object.is(a, b);
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(
    (key) =>
      key in b &&
      deepSame((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
  );
}
