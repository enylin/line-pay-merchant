import { describe, expect, it } from 'vitest'

import { isLinePayValidationError } from '../errors'
import { isTransactionIdOracle, onlyAsciiAlphanumerics } from '../test/oracles'
import {
  createRandom,
  digits,
  HOSTILE_CHARS,
  type Random,
  seedOf
} from '../test/random'
import {
  amountsEqual,
  Checker,
  isRegKey,
  isTransactionId,
  pathSegment
} from './validate'

// The oracles use character codes, not the regular expressions under test.
const expectRegKey = (value: unknown): boolean =>
  typeof value === 'string' &&
  value.length >= 1 &&
  value.length <= 64 &&
  onlyAsciiAlphanumerics(value)

const ALPHANUMERICS = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
]

/** Mostly near-valid strings: a valid value with one hostile edit, or a length at the edge. */
function candidate(
  random: Random,
  alphabet: readonly string[],
  maxValid: number
): string {
  const base = random.string(alphabet, 0, maxValid + 2)
  const edit = random.int(0, 5)
  const hostile = random.pick([...HOSTILE_CHARS, '\uD800', '\uDFFF', '\n'])
  const at = random.int(0, base.length)
  if (edit === 0) return base.slice(0, at) + hostile + base.slice(at)
  if (edit === 1)
    return base + random.pick(['\n', '\r\n', ' ', '\u0000', '/', '?', '#'])
  if (edit === 2) return random.pick(['\n', ' ', '+', '-', '0x', '.']) + base
  if (edit === 3) return random.string(alphabet, maxValid - 1, maxValid + 1)
  return base
}

const NON_STRINGS: unknown[] = [
  0,
  123,
  Number('2021121300698360310'),
  -1,
  Number.NaN,
  123n,
  true,
  null,
  undefined,
  ['1'],
  { toString: () => '123' },
  Object('123'), // a String object
  Symbol('123'),
  () => '1'
]

describe('validate: property-based', () => {
  it('isTransactionId and pathSegment accept exactly 1 to 19 ASCII digits', () => {
    const random = createRandom(seedOf(0x7a_1d))
    const inputs: unknown[] = [...NON_STRINGS]
    for (let i = 0; i < 3000; i++)
      inputs.push(candidate(random, [...'0123456789'], 19))
    for (let i = 0; i < 200; i++) inputs.push(digits(random, random.int(1, 19)))

    for (const [i, value] of inputs.entries()) {
      const where = `seed=${random.seed} case=${i} value=${typeof value === 'string' ? JSON.stringify(value) : typeof value}`
      const valid = isTransactionIdOracle(value)
      expect(isTransactionId(value), where).toBe(valid)
      if (valid) {
        // Digits need no encoding: the segment is the value itself.
        expect(pathSegment('transactionId', value), where).toBe(value)
      } else {
        let thrown: unknown
        try {
          pathSegment('transactionId', value)
        } catch (error) {
          thrown = error
        }
        if (!isLinePayValidationError(thrown)) expect.unreachable(where)
        expect(thrown.issues, where).toEqual([
          {
            path: 'transactionId',
            message: 'must be a string of 1 to 19 digits'
          }
        ])
      }
    }
  })

  it('isRegKey and pathSegment accept exactly 1 to 64 ASCII letters or digits', () => {
    const random = createRandom(seedOf(0x4e9))
    const inputs: unknown[] = [...NON_STRINGS]
    for (let i = 0; i < 3000; i++)
      inputs.push(candidate(random, ALPHANUMERICS, 64))

    for (const [i, value] of inputs.entries()) {
      const where = `seed=${random.seed} case=${i} value=${typeof value === 'string' ? JSON.stringify(value) : typeof value}`
      const valid = expectRegKey(value)
      expect(isRegKey(value), where).toBe(valid)
      if (valid) {
        expect(pathSegment('regKey', value), where).toBe(value)
      } else {
        expect(() => pathSegment('regKey', value), where).toThrow(
          expect.objectContaining({
            code: 'LINE_PAY_VALIDATION_ERROR',
            issues: [
              { path: 'regKey', message: 'must be 1 to 64 letters or digits' }
            ]
          })
        )
      }
    }
  })

  it('accepts a regKey at the length limit and in any letter case', () => {
    // 'must be 1 to 64 letters or digits'
    for (const key of [
      'a'.repeat(64),
      'Z'.repeat(64),
      'abcdefghijklmnopqrstuvwxyz',
      'rk9a2ba1937eqto',
      'Rk9'
    ]) {
      expect(isRegKey(key), key).toBe(true)
      expect(pathSegment('regKey', key)).toBe(key)
    }
    expect(isRegKey('a'.repeat(65))).toBe(false)
  })

  it('never lets a path segment carry a character that changes the URL', () => {
    const random = createRandom(seedOf(0x5e9))
    for (let i = 0; i < 3000; i++) {
      const value = random.string([...HOSTILE_CHARS, ...'0123456789'], 0, 25)
      for (const kind of ['transactionId', 'regKey'] as const) {
        let segment: string | undefined
        try {
          segment = pathSegment(kind, value)
        } catch {
          continue
        }
        expect(
          segment,
          `seed=${random.seed} case=${i} ${kind}=${JSON.stringify(value)}`
        ).toMatch(/^[A-Za-z0-9]{1,64}$/)
        expect(
          new URL(`https://api-pay.line.me/v4/payments/${segment}/confirm`)
            .pathname
        ).toBe(`/v4/payments/${segment}/confirm`)
      }
    }
  })
})

describe('amountsEqual: property-based', () => {
  it('equates sums of prices with their exact total, and nothing a cent away', () => {
    const random = createRandom(seedOf(0xa_0e9))
    for (let i = 0; i < 3000; i++) {
      // Prices in cents, added up in floating point, against the exact total.
      const cents: number[] = []
      for (let n = random.int(1, 8); n > 0; n--)
        cents.push(random.int(1, 999_999))
      const floating = cents.reduce((sum, c) => sum + c / 100, 0)
      const exact = cents.reduce((sum, c) => sum + c, 0)
      const where = `seed=${random.seed} case=${i} cents=${cents.join(',')}`

      expect(amountsEqual(floating, exact / 100), where).toBe(true)
      expect(amountsEqual(exact / 100, floating), where).toBe(true)
      for (const delta of [1, -1, random.int(2, 1000), -random.int(2, 1000)]) {
        expect(
          amountsEqual(floating, (exact + delta) / 100),
          `${where} delta=${delta}`
        ).toBe(false)
        expect(
          amountsEqual((exact + delta) / 100, floating),
          `${where} delta=${delta}`
        ).toBe(false)
      }
    }
  })

  it('tolerates rounding noise only, not a millionth', () => {
    expect(amountsEqual(0.1 + 0.2, 0.3)).toBe(true)
    expect(amountsEqual(1000, 1000.000001)).toBe(false)
    expect(amountsEqual(1000.000001, 1000)).toBe(false)
    expect(amountsEqual(0.001, 0)).toBe(false)
    expect(amountsEqual(-20, 20)).toBe(false)
    expect(amountsEqual(Number.NaN, Number.NaN)).toBe(false)
    expect(
      amountsEqual(Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY)
    ).toBe(false)
  })
})

describe('Checker: boundaries', () => {
  it('accepts a string of exactly maxLength characters', () => {
    const check = new Checker()
    check.nonEmptyString('orderId', 'x'.repeat(100), 100)
    check.nonEmptyString('orderId', 'x', 1)
    expect(check.issues).toEqual([])
  })

  it('accepts the smallest positive amount and refuses both zeros', () => {
    const check = new Checker()
    check.positiveNumber('amount', Number.MIN_VALUE)
    expect(check.issues).toEqual([])
    check.positiveNumber('amount', -0)
    check.positiveNumber('amount', 0)
    expect(check.issues).toHaveLength(2)
  })

  it('finiteNumber accepts zero and negatives (a discount line) but not NaN or Infinity', () => {
    const check = new Checker()
    for (const value of [0, -0, -150, 0.5]) check.finiteNumber('price', value)
    expect(check.issues).toEqual([])
    for (const value of [Number.NaN, Number.NEGATIVE_INFINITY, '5', null])
      check.finiteNumber('price', value)
    expect(check.issues).toHaveLength(4)
  })
})
