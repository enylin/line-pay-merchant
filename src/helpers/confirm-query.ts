import { isArray } from '../core/guard'
import { isTransactionId } from '../core/validate'
import { LinePayValidationError, type ValidationIssue } from '../errors'

export type ConfirmQuerySource =
  string | URL | URLSearchParams | Readonly<Record<string, unknown>>

export interface ConfirmQuery {
  /** 1 to 19 digits, as a string. */
  transactionId: string
  /** Present when LINE Pay appended it. 1 to 100 characters. */
  orderId?: string
}

/** A whole URL or a path (with or without a query), as opposed to a bare query string. */
const LOOKS_LIKE_URL = /^(?:[a-z][a-z0-9+.-]*:\/\/|\/|\?)/i

function searchParamsOf(
  source: string | URL | URLSearchParams
): URLSearchParams {
  if (source instanceof URLSearchParams) return source
  if (source instanceof URL) return source.searchParams
  if (!LOOKS_LIKE_URL.test(source)) return new URLSearchParams(source)
  try {
    return new URL(source, 'http://localhost').searchParams
  } catch {
    throw new LinePayValidationError({
      issues: [{ path: 'source', message: 'is not a valid URL' }]
    })
  }
}

/** Every value given for each key, as it came in. Nothing is coerced. */
function valuesOf(source: ConfirmQuerySource): Map<string, unknown[]> {
  const values = new Map<string, unknown[]>()
  const add = (key: string, value: unknown) => {
    const list = values.get(key)
    if (list === undefined) values.set(key, [value])
    else list.push(value)
  }

  if (typeof source === 'object' && source !== null) {
    if (source instanceof URLSearchParams || source instanceof URL) {
      for (const [key, value] of searchParamsOf(source)) add(key, value)
      return values
    }
    // A parsed query, such as `req.query` of Express. A parameter given more than
    // once is a list of several values; a list of one (`?transactionId[]=1`) is
    // not a single value either, and is kept as the list it is.
    for (const [key, value] of Object.entries(source)) {
      if (value === undefined) continue
      if (isArray(value) && value.length !== 1) {
        for (const item of value) add(key, item)
      } else {
        add(key, value)
      }
    }
    return values
  }
  if (typeof source === 'string') {
    for (const [key, value] of searchParamsOf(source)) add(key, value)
    return values
  }
  throw new LinePayValidationError({
    issues: [
      {
        path: 'source',
        message: 'must be a URL, a query string or an object of parameters'
      }
    ]
  })
}

/** What reading a parameter found: its value, or what is wrong with it. */
type Read<T> = { readonly value: T } | { readonly problem: string }

const LIST_PROBLEM = 'must be a single value, not a list'

function readTransactionId(given: readonly unknown[]): Read<string> {
  const [transactionId] = given
  if (given.length === 0) return { problem: 'is missing' }
  if (given.length > 1) return { problem: 'is given more than once' }
  if (isArray(transactionId)) return { problem: LIST_PROBLEM }
  if (!isTransactionId(transactionId)) {
    return { problem: 'must be a string of 1 to 19 digits' }
  }
  return { value: transactionId }
}

function readOrderId(given: readonly unknown[]): Read<string | undefined> {
  const [orderId] = given
  if (given.length === 0) return { value: undefined }
  if (given.length > 1) return { problem: 'is given more than once' }
  if (isArray(orderId)) return { problem: LIST_PROBLEM }
  if (
    typeof orderId !== 'string' ||
    orderId.length === 0 ||
    orderId.length > 100
  ) {
    return { problem: 'must be a string of 1 to 100 characters' }
  }
  return { value: orderId }
}

/**
 * Read the parameters LINE Pay appends to the confirmUrl. The `transactionId`
 * comes from the user's browser, so anyone can put anything there: it has to be a
 * single string of 1 to 19 digits, and nothing else is let through.
 *
 * Find the order in your own database by the `transactionId` that you stored when
 * you called `request` for it, and take the amount and the currency from that
 * order, never from the URL. Do not find the order by the `orderId` of the URL and
 * then confirm the `transactionId` of the URL: the browser can pair any `orderId`
 * with any `transactionId`, so a cheap order could be paid with the approval of
 * somebody else's payment. If you do look the order up by `orderId`, check that
 * `order.transactionId === transactionId` before you go on.
 *
 * @example
 * const { transactionId } = parseConfirmQuery(req.query)
 * const order = await orders.findByTransactionId(transactionId) // none: answer 404
 *
 * @throws {LinePayValidationError} when a parameter is missing or malformed.
 */
export function parseConfirmQuery(source: ConfirmQuerySource): ConfirmQuery {
  const values = valuesOf(source)
  const transactionId = readTransactionId(values.get('transactionId') ?? [])
  const orderId = readOrderId(values.get('orderId') ?? [])

  if ('problem' in transactionId || 'problem' in orderId) {
    const issues: ValidationIssue[] = []
    if ('problem' in transactionId) {
      issues.push({ path: 'transactionId', message: transactionId.problem })
    }
    if ('problem' in orderId) {
      issues.push({ path: 'orderId', message: orderId.problem })
    }
    throw new LinePayValidationError({ issues })
  }
  return orderId.value === undefined
    ? { transactionId: transactionId.value }
    : { transactionId: transactionId.value, orderId: orderId.value }
}
