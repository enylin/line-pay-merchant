/**
 * LINE Pay transaction IDs are 19-digit integers, larger than 2^53, so a plain
 * `JSON.parse` rounds them (`2021121300698360311` becomes `2021121300698360300`).
 *
 * The `source` argument of a `JSON.parse` reviver (available since V8 11.4, so on
 * every supported Node.js) carries the original text of a primitive. Every
 * integer outside the safe range is returned as that text, so the ID types in
 * this library are strings. Version 0.9 patched two field names with a regular
 * expression and missed `originalTransactionId`.
 */
type Reviver = (
  this: unknown,
  key: string,
  value: unknown,
  context?: { source?: string }
) => unknown

const reviver: Reviver = (_key, value, context) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Number.isSafeInteger(value) &&
  typeof context?.source === 'string'
    ? context.source
    : value

export function parseLossless(text: string): unknown {
  return JSON.parse(text, reviver)
}

/**
 * Whether this engine hands the source text of a number to the reviver. Without
 * it the IDs are rounded and nothing says so, so a client is not created.
 */
export function hasLosslessJson(): boolean {
  let source: unknown
  JSON.parse('1', (_key, value: unknown, context?: { source?: string }) => {
    source = context?.source
    return value
  })
  return typeof source === 'string'
}
