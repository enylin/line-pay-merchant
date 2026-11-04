import { describe, expect, it, vi } from 'vitest'

import { withoutReviverSource } from '../test/helpers'
import { hasLosslessJson, parseLossless } from './json'

describe('parseLossless', () => {
  it('parses ordinary JSON like JSON.parse', () => {
    const text =
      '{"a":1,"b":"two","c":[true,null,3.5],"d":{"e":-7},"f":1000.5,"g":0}'
    expect(parseLossless(text)).toEqual(JSON.parse(text))
  })

  it('returns integers beyond 2^53 as strings, wherever they appear', () => {
    const parsed = parseLossless(
      '{"transactionId":2021121300698360310,' +
        '"info":[{"refundTransactionId":2021121300698360312,"n":5}],' +
        '"deep":{"deeper":{"id":9007199254740993}}}'
    )
    expect(parsed).toEqual({
      transactionId: '2021121300698360310',
      info: [{ refundTransactionId: '2021121300698360312', n: 5 }],
      deep: { deeper: { id: '9007199254740993' } }
    })
  })

  // Regression A6: version 0.9 only quoted `transactionId` and
  // `refundTransactionId`, so this field came back rounded.
  it('keeps originalTransactionId exact', () => {
    const parsed = parseLossless(
      '{"originalTransactionId":2021121300698360311}'
    )
    expect(parsed).toEqual({ originalTransactionId: '2021121300698360311' })
    expect(JSON.parse('{"originalTransactionId":2021121300698360311}')).toEqual(
      {
        originalTransactionId: 2021121300698360300
      }
    )
  })

  it('handles negative and top-level numbers', () => {
    expect(parseLossless('-9007199254740993')).toBe('-9007199254740993')
    expect(parseLossless('2021121300698360310')).toBe('2021121300698360310')
  })

  it('leaves safe integers, decimals and strings alone', () => {
    expect(parseLossless('{"a":9007199254740991}')).toEqual({
      a: 9007199254740991
    })
    expect(parseLossless('{"a":1000.5,"b":"2021121300698360310"}')).toEqual({
      a: 1000.5,
      b: '2021121300698360310'
    })
  })

  it('throws a SyntaxError for invalid JSON', () => {
    expect(() => parseLossless('<html>')).toThrow(SyntaxError)
    expect(() => parseLossless('')).toThrow(SyntaxError)
  })
})

describe('hasLosslessJson', () => {
  it('is true where JSON.parse gives the source text of a number', () => {
    expect(hasLosslessJson()).toBe(true)
  })

  it('is false where the reviver gets no third argument', () => {
    withoutReviverSource()
    try {
      expect(hasLosslessJson()).toBe(false)
    } finally {
      vi.restoreAllMocks()
    }
  })

  it('is false where the third argument has no source', () => {
    vi.spyOn(JSON, 'parse').mockImplementation(
      (
        text: string,
        reviver?: (key: string, value: unknown, context: object) => unknown
      ): unknown => {
        reviver?.call({}, '', Number(text), {})
        return Number(text)
      }
    )
    try {
      expect(hasLosslessJson()).toBe(false)
    } finally {
      vi.restoreAllMocks()
    }
  })
})
