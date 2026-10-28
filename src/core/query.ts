import { LinePayValidationError } from '../errors'
import { isArray } from './guard'

export type QueryScalar = string | number | boolean
export type QueryValue = QueryScalar | readonly QueryScalar[] | undefined
export type QueryParams = Record<string, QueryValue>

/** `encodeURIComponent` throws on a lone surrogate; that is an input problem. */
function encode(path: string, text: string): string {
  try {
    return encodeURIComponent(text)
  } catch {
    throw new LinePayValidationError({
      issues: [
        {
          path,
          message:
            'must be well-formed text (it holds half of a surrogate pair)'
        }
      ]
    })
  }
}

/**
 * Build the query string (without the leading `?`). Arrays use repeated keys,
 * `a=1&a=2`, and `undefined` values are skipped.
 *
 * The signature covers exactly this string, so whichever format LINE Pay expects
 * for arrays, the request stays self-consistent.
 *
 * TODO(v4-spec): version 0.9 sent `a=1%2C2` (comma-joined, then encoded) and only
 * tested a single element. Confirm the accepted format against the V4 reference
 * or the sandbox. A lookup of one value (which is all `reconcile` does) is the
 * same in both formats.
 */
export function buildQuery(params: QueryParams): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue
    // What a caller who is not bound by types passes is turned into text as it is.
    const values: readonly unknown[] = isArray(value) ? value : [value]
    for (const item of values) {
      parts.push(`${encode(key, key)}=${encode(key, String(item))}`)
    }
  }
  return parts.join('&')
}
