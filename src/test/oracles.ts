/**
 * Independent reference implementations for the property-based tests. They are
 * written differently from the code under test (character codes instead of
 * regular expressions, TextEncoder instead of encodeURIComponent), so that a
 * bug cannot hide in both at once.
 */

/**
 * RFC 3986 unreserved characters, plus the marks `!*'()` that encodeURIComponent
 * keeps. (The URL parser rewrites `'` to `%27` once the query is set on a URL, and
 * the executor signs the URL as the parser leaves it; the signature tests of
 * src/core/execute.test.ts and src/wire.test.ts cover that.)
 */
const KEEP = new Set([
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_.!~*'()"
])
const utf8 = new TextEncoder()

/** Percent-encode the UTF-8 bytes of every other character as %XX. */
export function percentEncode(text: string): string {
  let out = ''
  for (const ch of text) {
    if (KEEP.has(ch)) {
      out += ch
      continue
    }
    for (const byte of utf8.encode(ch)) {
      out += `%${byte.toString(16).toUpperCase().padStart(2, '0')}`
    }
  }
  return out
}

export function onlyAsciiDigits(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    if (code < 48 || code > 57) return false
  }
  return true
}

export function onlyAsciiAlphanumerics(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i)
    const digit = code >= 48 && code <= 57
    const upper = code >= 65 && code <= 90
    const lower = code >= 97 && code <= 122
    if (!digit && !upper && !lower) return false
  }
  return true
}

/** A LINE Pay transaction ID as the library defines it: a string of 1 to 19 ASCII digits. */
export const isTransactionIdOracle = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 19 &&
  onlyAsciiDigits(value)
