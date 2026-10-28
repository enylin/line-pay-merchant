import { describe, expect, it } from 'vitest'

import { isLinePayValidationError } from '../errors'
import { messageOf } from '../test/helpers'
import {
  amountsEqual,
  Checker,
  CURRENCIES,
  isRegKey,
  isTransactionId,
  pathSegment
} from './validate'

describe('currencies and amounts', () => {
  it('lists the three currencies of the type', () => {
    expect([...CURRENCIES].sort()).toEqual(['THB', 'TWD', 'USD'])
  })

  it('takes amounts for equal when they differ by less than a billionth', () => {
    expect(amountsEqual(0.1 + 0.2, 0.3)).toBe(true)
    expect(amountsEqual(0, 1e-10)).toBe(true)
    expect(amountsEqual(0, 1e-9)).toBe(false)
    expect(amountsEqual(1000, 1000.01)).toBe(false)
  })
})

describe('transaction IDs', () => {
  it.each(['1', '2021121300698360310', '9999999999999999999'])(
    'accepts %s',
    value => {
      expect(isTransactionId(value)).toBe(true)
      expect(pathSegment('transactionId', value)).toBe(value)
    }
  )

  // Regression A4: version 0.9 put these straight into the signed URL path.
  it.each([
    '',
    ' ',
    '12345678901234567890',
    '../../v3/payments/preapprovedPay/RK123/expire?x=',
    '123/../456',
    '123?x=1',
    '123#frag',
    '123 ',
    '٢٠٢١',
    'abc',
    '1e5'
  ])('rejects %j', value => {
    expect(isTransactionId(value)).toBe(false)
    expect(() => pathSegment('transactionId', value)).toThrow(
      expect.objectContaining({ code: 'LINE_PAY_VALIDATION_ERROR' })
    )
  })

  it('rejects non-strings', () => {
    for (const value of [123, undefined, null, {}, ['1']]) {
      expect(isTransactionId(value)).toBe(false)
    }
  })
})

describe('regKeys', () => {
  it('accepts alphanumeric keys', () => {
    expect(isRegKey('RK9A2BA1937EQTO')).toBe(true)
    expect(pathSegment('regKey', 'RK9A2BA1937EQTO')).toBe('RK9A2BA1937EQTO')
  })

  it.each([
    '',
    'RK/../request',
    'RK 1',
    'RK?x',
    'a'.repeat(65),
    'RK-1',
    'RK_1'
  ])('rejects %j', value => {
    expect(isRegKey(value)).toBe(false)
    expect(() => pathSegment('regKey', value)).toThrow(
      expect.objectContaining({ code: 'LINE_PAY_VALIDATION_ERROR' })
    )
  })
})

describe('Checker', () => {
  it('collects every problem before throwing', () => {
    const check = new Checker()
    check.nonEmptyString('orderId', '')
    check.positiveNumber('amount', -1)
    check.oneOf('currency', 'JPY', ['USD', 'TWD', 'THB'])

    expect(check.issues.map(issue => issue.path)).toEqual([
      'orderId',
      'amount',
      'currency'
    ])
    try {
      check.throwIfInvalid({ operation: 'request' })
      expect.unreachable()
    } catch (error) {
      expect(isLinePayValidationError(error)).toBe(true)
      expect(messageOf(error)).toContain('Invalid input for request')
    }
  })

  it('does not throw when everything is valid', () => {
    const check = new Checker()
    check.nonEmptyString('orderId', 'order-1', 100)
    check.positiveNumber('amount', 100.5)
    check.oneOf('currency', 'TWD', ['USD', 'TWD', 'THB'])
    expect(() => check.throwIfInvalid({ operation: 'request' })).not.toThrow()
  })

  it('enforces the maximum length', () => {
    const check = new Checker()
    check.nonEmptyString('orderId', 'x'.repeat(101), 100)
    expect(check.issues[0]?.message).toBe('must be at most 100 characters')
  })

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY, '10', null, undefined])(
    'rejects %j as an amount',
    value => {
      const check = new Checker()
      check.positiveNumber('amount', value)
      expect(check.issues).toHaveLength(1)
    }
  )
})
