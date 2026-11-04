import { describe, expect, it } from 'vitest'

import {
  isLinePayValidationError,
  type LinePayValidationError
} from '../errors'
import { applyUntyped } from '../test/helpers'
import { parseConfirmQuery } from './confirm-query'

const TX = '2021121300698360310'

function invalid(source: unknown): LinePayValidationError {
  try {
    applyUntyped(parseConfirmQuery, [source])
  } catch (error) {
    if (isLinePayValidationError(error)) return error
    throw error
  }
  throw new Error('expected parseConfirmQuery to throw')
}

const issuesOf = (source: unknown) =>
  invalid(source).issues.map(issue => `${issue.path} ${issue.message}`)

describe('parseConfirmQuery', () => {
  describe('accepts what LINE Pay appends', () => {
    it('reads a bare query string', () => {
      expect(parseConfirmQuery(`transactionId=${TX}&orderId=order-1`)).toEqual({
        transactionId: TX,
        orderId: 'order-1'
      })
    })

    it('reads a query string with its question mark', () => {
      expect(parseConfirmQuery(`?transactionId=${TX}`)).toEqual({
        transactionId: TX
      })
    })

    it('leaves the fragment out of a query string with its question mark', () => {
      // `location.search + location.hash`, for example.
      expect(parseConfirmQuery(`?transactionId=${TX}&orderId=o-1#top`)).toEqual(
        { transactionId: TX, orderId: 'o-1' }
      )
      expect(parseConfirmQuery(`?transactionId=${TX}#x`)).toEqual({
        transactionId: TX
      })
    })

    it('reads a path or a whole URL, ignoring the rest of it', () => {
      expect(
        parseConfirmQuery(`/confirm?transactionId=${TX}&orderId=o#frag`)
      ).toEqual({ transactionId: TX, orderId: 'o' })
      expect(
        parseConfirmQuery(
          `https://shop.example/confirm?transactionId=${TX}&orderId=o`
        )
      ).toEqual({ transactionId: TX, orderId: 'o' })
    })

    it('reads URL and URLSearchParams objects', () => {
      const url = new URL(`https://shop.example/confirm?transactionId=${TX}`)
      expect(parseConfirmQuery(url)).toEqual({ transactionId: TX })
      expect(parseConfirmQuery(url.searchParams)).toEqual({ transactionId: TX })
    })

    it('reads a parsed query object, such as req.query of Express', () => {
      expect(
        parseConfirmQuery({ transactionId: TX, orderId: 'order-1' })
      ).toEqual({ transactionId: TX, orderId: 'order-1' })
      // Object.create(null), as the querystring module makes them.
      const bare: Record<string, unknown> = {
        __proto__: null,
        transactionId: TX
      }
      expect(parseConfirmQuery(bare)).toEqual({ transactionId: TX })
    })

    it('decodes the order ID', () => {
      expect(
        parseConfirmQuery(`transactionId=${TX}&orderId=ORD%2F2026%2F001`)
      ).toEqual({ transactionId: TX, orderId: 'ORD/2026/001' })
    })

    it('does not mistake a slash inside a bare query string for a path', () => {
      expect(
        parseConfirmQuery(`orderId=ORD/2026/001&transactionId=${TX}`)
      ).toEqual({ transactionId: TX, orderId: 'ORD/2026/001' })
    })

    it('keeps 19-digit IDs as strings', () => {
      const { transactionId } = parseConfirmQuery({
        transactionId: '9223372036854775807'
      })
      expect(transactionId).toBe('9223372036854775807')
    })

    it('leaves the order ID out when there is none', () => {
      expect(parseConfirmQuery({ transactionId: TX })).not.toHaveProperty(
        'orderId'
      )
      expect(
        parseConfirmQuery({ transactionId: TX, orderId: undefined })
      ).not.toHaveProperty('orderId')
    })
  })

  describe('refuses what a user could put there', () => {
    it('requires a transaction ID', () => {
      expect(issuesOf('')).toEqual(['transactionId is missing'])
      expect(issuesOf({})).toEqual(['transactionId is missing'])
      expect(issuesOf(`orderId=o`)).toEqual(['transactionId is missing'])
    })

    it('requires 1 to 19 digits and nothing else', () => {
      const bad = [
        '',
        'abc',
        '12 3',
        '-1',
        '1e3',
        '0x10',
        '1.5',
        ' 1',
        '1\n',
        '1'.repeat(20),
        '１２３', // full-width digits
        '../../v4/payments/1/refund',
        '1/confirm?x=',
        '1%2F..',
        `${TX}'; DROP TABLE orders;--`
      ]
      for (const transactionId of bad) {
        expect(
          issuesOf({ transactionId }),
          JSON.stringify(transactionId)
        ).toEqual(['transactionId must be a string of 1 to 19 digits'])
      }
    })

    it('refuses a transaction ID that is not a string', () => {
      // A number above 2^53 has already lost digits by the time it gets here.
      for (const transactionId of [123, Number(TX), true, null, {}, []]) {
        expect(issuesOf({ transactionId }).join()).toMatch(
          /transactionId (must be a string of 1 to 19 digits|is missing)/
        )
      }
    })

    it('refuses a transaction ID given more than once', () => {
      const expected = ['transactionId is given more than once']
      expect(issuesOf(`transactionId=${TX}&transactionId=${TX}`)).toEqual(
        expected
      )
      expect(issuesOf({ transactionId: [TX, TX] })).toEqual(expected)
      expect(
        issuesOf(
          new URLSearchParams([
            ['transactionId', TX],
            ['transactionId', '1']
          ])
        )
      ).toEqual(expected)
    })

    it('refuses the shapes qs builds from nested keys', () => {
      // ?transactionId[a]=1 and ?transactionId[]=1 become an object and an array.
      expect(issuesOf({ transactionId: { a: '1' } })).toEqual([
        'transactionId must be a string of 1 to 19 digits'
      ])
      expect(issuesOf({ transactionId: ['1'], orderId: { $ne: '' } })).toEqual([
        'transactionId must be a single value, not a list',
        'orderId must be a string of 1 to 100 characters'
      ])
    })

    it('does not take a list of one for a single value', () => {
      // ?transactionId[]=123 is what qs makes of a bracketed key. LINE Pay never
      // sends one, so a list of one is somebody's attempt, and it is refused.
      expect(issuesOf({ transactionId: [TX] })).toEqual([
        'transactionId must be a single value, not a list'
      ])
      expect(issuesOf({ transactionId: TX, orderId: ['o'] })).toEqual([
        'orderId must be a single value, not a list'
      ])
      // An empty list says nothing at all.
      expect(issuesOf({ transactionId: [] })).toEqual([
        'transactionId is missing'
      ])
    })

    it('limits the order ID to 100 characters', () => {
      expect(
        parseConfirmQuery({ transactionId: TX, orderId: 'o'.repeat(100) })
          .orderId
      ).toHaveLength(100)
      for (const orderId of ['', 'o'.repeat(101), 7, ['a', 'b'], {}]) {
        expect(issuesOf({ transactionId: TX, orderId }).join()).toMatch(
          /orderId (must be a string of 1 to 100 characters|is given more than once)/
        )
      }
    })

    it('reports every problem at once', () => {
      expect(issuesOf({ transactionId: 'x', orderId: '' })).toEqual([
        'transactionId must be a string of 1 to 19 digits',
        'orderId must be a string of 1 to 100 characters'
      ])
    })

    it('does not accept an order ID in the place of a transaction ID', () => {
      expect(issuesOf({ orderId: TX })).toEqual(['transactionId is missing'])
    })

    it('ignores keys it does not know', () => {
      expect(
        parseConfirmQuery({
          transactionId: TX,
          __proto__: { transactionId: 'x' },
          amount: '1',
          extra: 'y'
        })
      ).toEqual({ transactionId: TX })
    })

    it('throws a library error for a source it cannot read', () => {
      for (const source of [undefined, null, 42, true]) {
        expect(issuesOf(source)).toEqual([
          'source must be a URL, a query string or an object of parameters'
        ])
      }
      expect(issuesOf('http://[bad')).toEqual(['source is not a valid URL'])
    })
  })
})
