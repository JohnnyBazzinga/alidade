// Argument checks (design D11): a few combinators that return the value or the name of the
// offending field. They replace a schema library. Unknown fields are refused.

import { isRecord } from './json-rpc.ts';

export type Checked<T> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly field: string };

const fail = (field: string): Checked<never> => ({ ok: false, field });

/** The path of a child field: `origin.latDeg`, or `latDeg` at the top. */
export function child(field: string, key: string): string {
  return field === '' ? key : `${field}.${key}`;
}

export function finiteNumber(value: unknown, field: string): Checked<number> {
  return typeof value === 'number' && Number.isFinite(value) ? { ok: true, value } : fail(field);
}

export function boundedString(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): Checked<string> {
  return typeof value === 'string' && value.length >= minLength && value.length <= maxLength
    ? { ok: true, value }
    : fail(field);
}

export function boolean(value: unknown, field: string): Checked<boolean> {
  return typeof value === 'boolean' ? { ok: true, value } : fail(field);
}

export function array(
  value: unknown,
  field: string,
  minLength: number,
  maxLength: number,
): Checked<unknown[]> {
  return Array.isArray(value) && value.length >= minLength && value.length <= maxLength
    ? { ok: true, value }
    : fail(field);
}

/** An object whose own keys are all in `allowed`; the first other key is named in the failure. */
export function objectOf(
  value: unknown,
  field: string,
  allowed: readonly string[],
): Checked<Record<string, unknown>> {
  if (!isRecord(value)) return fail(field);
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) return fail(child(field, key));
  }
  return { ok: true, value };
}
