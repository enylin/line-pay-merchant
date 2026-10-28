import {
  LinePayValidationError,
  type LinePayValidationErrorInit,
  type ValidationIssue
} from '../errors'
import type { Currency } from '../types'

const TRANSACTION_ID = /^\d{1,19}$/
const REG_KEY = /^[A-Za-z0-9]{1,64}$/

export const CURRENCIES = [
  'USD',
  'TWD',
  'THB'
] as const satisfies readonly Currency[]

// Every currency of the type is in the list: a currency added to one and not to
// the other would make every typed call fail its own validation.
const _everyCurrencyIsListed: [
  Exclude<Currency, (typeof CURRENCIES)[number]>
] extends [never]
  ? true
  : never = true

/** Amounts are compared with a tolerance: sums of prices such as 0.1 + 0.2 are not exact. */
export const amountsEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) < 1e-9

export function isTransactionId(value: unknown): value is string {
  return typeof value === 'string' && TRANSACTION_ID.test(value)
}

export function isRegKey(value: unknown): value is string {
  return typeof value === 'string' && REG_KEY.test(value)
}

/**
 * Validate a value that is placed into the URL path and return it encoded.
 *
 * This always runs, even with `validate: false`: the transaction ID usually comes
 * from the query string of the confirmUrl, which the user controls, and it is part
 * of what gets signed. Version 0.9 interpolated it unchecked.
 */
export function pathSegment(
  kind: 'transactionId' | 'regKey',
  value: unknown
): string {
  if (kind === 'transactionId') {
    if (!isTransactionId(value)) {
      throw new LinePayValidationError({
        issues: [
          {
            path: 'transactionId',
            message: 'must be a string of 1 to 19 digits'
          }
        ]
      })
    }
    return encodeURIComponent(value)
  }
  if (!isRegKey(value)) {
    throw new LinePayValidationError({
      issues: [{ path: 'regKey', message: 'must be 1 to 64 letters or digits' }]
    })
  }
  return encodeURIComponent(value)
}

/** Collects several problems of one input before throwing a single error. */
export class Checker {
  readonly issues: ValidationIssue[] = []

  fail(path: string, message: string): void {
    this.issues.push({ path, message })
  }

  nonEmptyString(path: string, value: unknown, maxLength?: number): void {
    if (typeof value !== 'string' || value.length === 0) {
      this.fail(path, 'must be a non-empty string')
    } else if (maxLength !== undefined && value.length > maxLength) {
      this.fail(path, `must be at most ${maxLength} characters`)
    }
  }

  finiteNumber(path: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      this.fail(path, 'must be a finite number')
    }
  }

  nonNegativeNumber(path: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      this.fail(path, 'must be a finite number, 0 or greater')
    }
  }

  /**
   * Fields the operation does not have. A misspelled optional field would be left
   * out without a word, and a caller who passes on what a user sent (`...req.body`)
   * would have the user's own fields signed and sent.
   */
  onlyFields(
    path: string,
    value: object,
    allowed: readonly string[],
    what: string
  ): void {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        this.fail(
          path === '' ? key : `${path}.${key}`,
          `is not a field of ${what}`
        )
      }
    }
  }

  positiveNumber(path: string, value: unknown): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
      this.fail(path, 'must be a finite number greater than 0')
    }
  }

  boolean(path: string, value: unknown): void {
    if (typeof value !== 'boolean') this.fail(path, 'must be true or false')
  }

  oneOf(path: string, value: unknown, allowed: readonly string[]): void {
    if (typeof value !== 'string' || !allowed.includes(value)) {
      this.fail(path, `must be one of ${allowed.join(', ')}`)
    }
  }

  throwIfInvalid(
    about: Pick<LinePayValidationErrorInit, 'operation' | 'subject'> = {}
  ): void {
    if (this.issues.length > 0) {
      throw new LinePayValidationError({ ...about, issues: this.issues })
    }
  }
}
