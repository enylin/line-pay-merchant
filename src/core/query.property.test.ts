import { describe, expect, it } from 'vitest'

import { percentEncode } from '../test/oracles'
import {
  createRandom,
  HOSTILE_CHARS,
  type Random,
  seedOf
} from '../test/random'
import {
  buildQuery,
  type QueryParams,
  type QueryScalar,
  type QueryValue
} from './query'

/** What a scalar becomes in the query, written down without calling String(). */
function textOf(value: QueryScalar): string {
  return typeof value === 'string' ? value : `${value}`
}

const isScalar = (value: QueryValue): value is QueryScalar =>
  typeof value === 'string' ||
  typeof value === 'number' ||
  typeof value === 'boolean'

const WELL_FORMED = HOSTILE_CHARS // no lone surrogates: those cannot be UTF-8 encoded

function scalar(random: Random): QueryScalar {
  switch (random.int(0, 6)) {
    case 0:
      return random.int(-1_000_000, 1_000_000)
    case 1:
      return random.pick([
        0,
        -0,
        0.1,
        -2.5,
        1e21,
        1e-7,
        2 ** 53,
        Number.MAX_VALUE,
        Number.NaN,
        Number.POSITIVE_INFINITY
      ])
    case 2:
      return random.bool()
    case 3:
      return random.pick([
        '',
        '2021121300698360310',
        'a b',
        'a+b',
        'a&b=c',
        '中文',
        '%41',
        '\u{1f600}'
      ])
    default:
      return random.string(WELL_FORMED, 0, 12)
  }
}

function params(random: Random): {
  params: QueryParams
  pairs: [string, string][]
} {
  const result: QueryParams = {}
  for (let n = random.int(0, 6); n > 0; n--) {
    const key = random.bool(0.3)
      ? random.pick([
          'transactionId',
          'orderId',
          'fields',
          'creditCardAuth',
          '0',
          '10',
          'a b',
          '&',
          '='
        ])
      : random.string(WELL_FORMED, 1, 8)
    const roll = random.int(0, 4)
    if (roll === 0) result[key] = undefined
    else if (roll === 1) {
      const items: QueryScalar[] = []
      for (let i = random.int(0, 4); i > 0; i--) items.push(scalar(random))
      result[key] = items
    } else result[key] = scalar(random)
  }
  // The expected pairs, in the order the object hands its keys out.
  const pairs: [string, string][] = []
  for (const key of Object.keys(result)) {
    const value = result[key]
    if (value === undefined) continue
    const items = isScalar(value) ? [value] : value
    for (const item of items) pairs.push([key, textOf(item)])
  }
  return { params: result, pairs }
}

describe('buildQuery: property-based', () => {
  it('matches an independent encoder and survives a round trip through URLSearchParams', () => {
    const random = createRandom(seedOf(0x9e_e7))
    for (let i = 0; i < 2000; i++) {
      const { params: input, pairs } = params(random)
      const where = `seed=${random.seed} case=${i} params=${JSON.stringify(input)}`
      const query = buildQuery(input)

      expect(query, where).toBe(
        pairs
          .map(
            ([key, value]) => `${percentEncode(key)}=${percentEncode(value)}`
          )
          .join('&')
      )
      expect([...new URLSearchParams(query)], where).toEqual(pairs)
      // Nothing but unreserved characters, escapes and the two separators.
      expect(query, where).toMatch(/^[A-Za-z0-9\-_.!~*'()%=&]*$/)
      expect(query === '' ? 0 : query.split('&').length, where).toBe(
        pairs.length
      )
    }
  })
})
