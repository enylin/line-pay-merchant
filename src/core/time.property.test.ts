import { describe, expect, it } from 'vitest'

import {
  createRandom,
  HOSTILE_CHARS,
  type Random,
  seedOf
} from '../test/random'
import { instantOf, toDate, wholeSeconds } from './time'

const pad = (n: number, width = 2) => String(n).padStart(width, '0')

const FROM = Date.UTC(1971, 0, 1)
const TO = Date.UTC(2099, 11, 31)

/** `toDate` takes no moment before this: it is a count of seconds, or nothing. */
const EARLIEST = 1e12
const usable = (ms: number | undefined): number | undefined =>
  ms !== undefined && ms >= EARLIEST ? ms : undefined

interface Stamp {
  text: string
  /** The instant the text means, or undefined when it carries no UTC offset. */
  instant: number | undefined
}

/**
 * An ISO 8601 timestamp of `instant`, written in the local time of a random UTC
 * offset. The expected instant comes from arithmetic, not from Date.parse.
 */
function stamp(random: Random): Stamp {
  const instant = random.int(FROM, TO)
  const offset = random.bool(0.3) ? 0 : 15 * random.int(-48, 56) // -12:00 to +14:00
  const local = new Date(instant + offset * 60_000)
  const fraction = random.bool()
  const text =
    `${pad(local.getUTCFullYear(), 4)}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}` +
    (fraction ? `.${pad(local.getUTCMilliseconds(), 3)}` : '')
  const shown = fraction ? instant : instant - (instant % 1000)

  const roll = random.int(0, 5)
  if (roll === 0) return { text, instant: undefined } // no offset: local time of the reader
  if (offset === 0 && roll <= 2)
    return { text: text + random.pick(['Z', 'z']), instant: shown }
  const sign = offset < 0 ? '-' : '+'
  const hours = pad(Math.floor(Math.abs(offset) / 60))
  const minutes = pad(Math.abs(offset) % 60)
  if (roll === 3) return { text: `${text}${sign}${hours}`, instant: undefined } // no minutes: not trusted
  const colon = random.bool() ? ':' : ''
  return { text: `${text}${sign}${hours}${colon}${minutes}`, instant: shown }
}

describe('instantOf: property-based', () => {
  it('reads every zoned ISO 8601 timestamp to the instant it means, and refuses the others', () => {
    const random = createRandom(seedOf(0x71_3e))
    for (let i = 0; i < 4000; i++) {
      const { text, instant } = stamp(random)
      const where = `seed=${random.seed} case=${i} text=${text}`
      if (instant === undefined) expect(instantOf(text), where).toBeNaN()
      else expect(instantOf(text), where).toBe(instant)
    }
  })

  it('never trusts text whose offset-looking part is not at the end', () => {
    for (const text of [
      '+002026-10-27T00:00:30', // an expanded year, no zone: the "+0020" is the year
      '-002026-10-27T00:00:30',
      'Zone 2026-10-27 00:00:30',
      '2026-10-27T00:00:30Z ',
      '2026-10-27T08:00:30+08:00 (Taipei)',
      'Tue Oct 27 2026 08:00:30 GMT+0800 (Taipei Standard Time)'
    ]) {
      expect(instantOf(text), text).toBeNaN()
    }
    // The same expanded year with a zone is a real instant.
    expect(instantOf('+002026-10-27T00:00:30Z')).toBe(
      Date.UTC(2026, 9, 27, 0, 0, 30)
    )
  })

  it('answers NaN or a finite number for any text, and NaN without a trailing zone', () => {
    const random = createRandom(seedOf(0x9a4b))
    const endsWithZone = (text: string): boolean => {
      const last = text.at(-1)
      if (last === 'Z' || last === 'z') return true
      const tail = text.replace(':', '').slice(-5) // ±HHMM, with or without the colon
      return /^[+-]\d{4}$/.test(tail) || /^[+-]\d\d:\d\d$/.test(text.slice(-6))
    }
    for (let i = 0; i < 3000; i++) {
      const text = random.bool(0.5)
        ? random.string(HOSTILE_CHARS, 0, 30)
        : stamp(random).text + random.string(HOSTILE_CHARS, 0, 3)
      const value = instantOf(text)
      const where = `seed=${random.seed} case=${i} text=${JSON.stringify(text)}`
      expect(Number.isNaN(value) || Number.isFinite(value), where).toBe(true)
      if (!endsWithZone(text)) expect(value, where).toBeNaN()
    }
  })
})

describe('toDate: property-based', () => {
  it('returns a new, valid Date for every usable input, and undefined otherwise', () => {
    const random = createRandom(seedOf(0x70da7e))
    for (let i = 0; i < 3000; i++) {
      const roll = random.int(0, 4)
      const where = `seed=${random.seed} case=${i}`
      if (roll === 0) {
        const given = new Date(random.int(FROM, TO))
        const result = toDate(given)
        expect(result, where).not.toBe(given)
        expect(result?.getTime(), where).toBe(usable(given.getTime()))
      } else if (roll === 1) {
        // Milliseconds anywhere in the range of a Date, fractions included. A Date
        // keeps whole milliseconds, cut toward zero (TimeClip). Below 1e12 (before
        // September 2001) a number is more likely a count of seconds, and is refused.
        const ms = random.bool()
          ? random.int(-8.64e15, 8.64e15)
          : (random.next() - 0.5) * 1e13
        const expected = ms >= EARLIEST ? Math.trunc(ms) + 0 : undefined
        expect(toDate(ms)?.getTime(), `${where} ms=${ms}`).toBe(expected)
      } else if (roll === 2) {
        const { text, instant } = stamp(random)
        expect(toDate(text)?.getTime(), `${where} text=${text}`).toBe(
          usable(instant)
        )
      } else {
        const value = random.pick<unknown>([
          undefined,
          null,
          true,
          0n,
          Symbol('x'),
          {},
          [],
          [Date.UTC(2026, 0, 1)],
          { getTime: () => 0 },
          new Date(Number.NaN),
          Number.NaN,
          Number.POSITIVE_INFINITY,
          Number.NEGATIVE_INFINITY,
          '',
          '1793059230000' // milliseconds as a string are no ISO timestamp
        ])
        expect(toDate(value), `${where} value=${String(value)}`).toBeUndefined()
      }
    }
  })

  // `Number.isFinite` is not the range of a Date: a finite number beyond 8.64e15 ms
  // (nanoseconds stored by mistake, say) would be an Invalid Date, and `reconcile`
  // would look a refund up with a NaN window.
  it('refuses a number of milliseconds outside the range of a Date', () => {
    for (const ms of [8.64e15 + 1, -8.64e15 - 1, 1.79e18, Number.MAX_VALUE]) {
      expect(toDate(ms), String(ms)).toBeUndefined()
    }
  })
})

describe('wholeSeconds: property-based', () => {
  it('rounds down to the second, before 1970 too', () => {
    const random = createRandom(seedOf(0x5ec))
    for (let i = 0; i < 4000; i++) {
      const ms = random.bool()
        ? random.int(-1e13, 1e13)
        : (random.next() - 0.5) * 2e13
      const seconds = wholeSeconds(ms)
      const where = `seed=${random.seed} case=${i} ms=${ms}`
      expect(Number.isInteger(seconds), where).toBe(true)
      expect(seconds * 1000 <= ms, where).toBe(true)
      expect(ms < seconds * 1000 + 1000, where).toBe(true)
    }
    expect(wholeSeconds(-1)).toBe(-1)
    expect(wholeSeconds(-1000)).toBe(-1)
    expect(wholeSeconds(-1001)).toBe(-2)
  })
})
