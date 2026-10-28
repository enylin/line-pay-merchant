import { describe, expect, it } from 'vitest'

import { buildQuery } from './query'

describe('buildQuery', () => {
  it('serialises scalars in insertion order', () => {
    expect(
      buildQuery({ orderId: '20211216004', amount: 100, sandbox: false })
    ).toBe('orderId=20211216004&amount=100&sandbox=false')
  })

  it('repeats the key for arrays', () => {
    expect(
      buildQuery({ transactionId: ['111', '222'], orderId: ['a', 'b'] })
    ).toBe('transactionId=111&transactionId=222&orderId=a&orderId=b')
  })

  it('serialises a single-element array like a scalar', () => {
    expect(buildQuery({ transactionId: ['2021113000697317600'] })).toBe(
      'transactionId=2021113000697317600'
    )
  })

  it('percent-encodes keys and values', () => {
    expect(buildQuery({ 'a b': 'c&d=e', q: '中文/?' })).toBe(
      'a%20b=c%26d%3De&q=%E4%B8%AD%E6%96%87%2F%3F'
    )
  })

  it('skips undefined values and empty arrays', () => {
    expect(buildQuery({ a: undefined, b: [], c: 'x' })).toBe('c=x')
    expect(buildQuery({})).toBe('')
  })
})
