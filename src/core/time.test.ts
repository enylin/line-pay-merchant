import { describe, expect, it } from 'vitest'

import { instantOf, toDate, wholeSeconds } from './time'

describe('instantOf', () => {
  it('reads timestamps that carry a UTC offset', () => {
    const expected = Date.UTC(2026, 9, 27, 0, 0, 30)
    for (const text of [
      '2026-10-27T00:00:30Z',
      '2026-10-27T00:00:30.000Z',
      '2026-10-27T00:00:30z',
      '2026-10-27T08:00:30+08:00',
      '2026-10-27T08:00:30+0800',
      '2026-10-26T19:00:30-05:00'
    ]) {
      expect(instantOf(text), text).toBe(expected)
    }
  })

  it('does not trust a timestamp without an offset, or one that is no date', () => {
    for (const text of [
      '2026-10-27T00:00:30',
      '2026-10-27',
      '',
      'not a date',
      '2026-13-45T99:99:99Z',
      // Not ISO 8601, and read in the local zone by Date.parse although they end
      // like an offset.
      '10-27-2026',
      'Oct 27 2026 10:00:00 -0500',
      '2026-10-27 10:00:00 -0500',
      '2026-10-27T00:00:30 Z',
      ' 2026-10-27T00:00:30Z',
      '2026-10-27T00:00:30Z\n'
    ]) {
      expect(instantOf(text), text).toBeNaN()
    }
  })
})

describe('toDate', () => {
  const instant = Date.UTC(2026, 9, 27)

  it('takes a Date, an ISO string with an offset, or milliseconds', () => {
    expect(toDate(new Date(instant))?.getTime()).toBe(instant)
    expect(toDate('2026-10-27T00:00:00Z')?.getTime()).toBe(instant)
    expect(toDate('2026-10-27T08:00:00+08:00')?.getTime()).toBe(instant)
    expect(toDate(instant)?.getTime()).toBe(instant)
  })

  it('does not take a count of seconds for milliseconds', () => {
    // 1_761_523_200 is 2025-10-27 in seconds, and January 1970 in milliseconds.
    expect(toDate(1_761_523_200)).toBeUndefined()
    expect(toDate(0)).toBeUndefined()
    expect(toDate(-1)).toBeUndefined()
    expect(toDate(1e12 - 1)).toBeUndefined()
    expect(toDate(1e12)?.getTime()).toBe(1e12)
    expect(toDate(1_761_523_200_000)?.getTime()).toBe(1_761_523_200_000)
  })

  it('does not take it for a moment of the call when it is given as a Date or as text', () => {
    // The same mistake as seconds for milliseconds, in the forms of a saved context.
    const earliest = '2001-09-09T01:46:40Z' // 1e12 milliseconds
    expect(toDate(new Date(1_761_523_200))).toBeUndefined() // seconds in a Date
    expect(toDate(new Date(0))).toBeUndefined()
    const fromNull: unknown = Reflect.construct(Date, [null]) // a NULL column
    expect(toDate(fromNull)).toBeUndefined()
    expect(toDate(new Date(1e12 - 1))).toBeUndefined()
    expect(toDate(new Date(1e12))?.getTime()).toBe(1e12)
    expect(toDate('1970-01-01T00:00:00Z')).toBeUndefined()
    expect(toDate('0001-01-01T00:00:00Z')).toBeUndefined()
    expect(toDate('-000001-01-01T00:00:00Z')).toBeUndefined()
    expect(toDate('2001-09-09T01:46:39.999Z')).toBeUndefined()
    expect(toDate(earliest)?.getTime()).toBe(1e12)
  })

  it('returns a new Date, not the one it was given', () => {
    const given = new Date(instant)
    expect(toDate(given)).not.toBe(given)
  })

  it('refuses everything else', () => {
    for (const value of [
      undefined,
      null,
      '2026-10-27T00:00:00',
      'yesterday',
      new Date(Number.NaN),
      Number.NaN,
      Infinity,
      {},
      true
    ]) {
      expect(toDate(value)).toBeUndefined()
    }
  })
})

describe('wholeSeconds', () => {
  it('rounds down', () => {
    expect(wholeSeconds(1999)).toBe(1)
    expect(wholeSeconds(2000)).toBe(2)
    expect(wholeSeconds(2001)).toBe(2)
  })
})
