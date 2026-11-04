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
 * V4 sandbox accepted both repeated keys and comma-separated values when
 * querying multiple transaction or order IDs. This SDK uses repeated keys,
 * and the signature covers the exact query string being sent.
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
