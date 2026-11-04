import { at } from './at'

/**
 * A small seeded PRNG for the property-based tests (mulberry32), so that every
 * failure can be reproduced: the failing assertion names the seed and the case,
 * and `PROPERTY_SEED=<seed> npx vitest run <file>` replays exactly that run.
 *
 * Each test passes its own default seed, so the suite is deterministic.
 */
export interface Random {
  readonly seed: number
  /** A float in [0, 1). */
  next(): number
  /** An integer in [min, max], both included. */
  int(min: number, max: number): number
  bool(probability?: number): boolean
  pick<T>(items: readonly T[]): T
  /** `length` items of `alphabet` (code points or longer units) joined together. */
  string(
    alphabet: readonly string[],
    minLength: number,
    maxLength: number
  ): string
  shuffle<T>(items: readonly T[]): T[]
}

/** The seed of a test: `PROPERTY_SEED` when it is set, otherwise the test's own. */
export function seedOf(defaultSeed: number): number {
  const fromEnv = process.env.PROPERTY_SEED
  if (fromEnv === undefined || fromEnv === '') return defaultSeed >>> 0
  const parsed = Number(fromEnv)
  if (!Number.isInteger(parsed)) {
    throw new Error(`PROPERTY_SEED must be an integer, got ${fromEnv}`)
  }
  return parsed >>> 0
}

export function createRandom(seed: number): Random {
  let state = seed >>> 0
  const next = (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
  const int = (min: number, max: number): number =>
    min + Math.floor(next() * (max - min + 1))
  const pick = <T>(items: readonly T[]): T => {
    if (items.length === 0) throw new Error('pick() from an empty list')
    return at(items, int(0, items.length - 1))
  }
  return {
    seed,
    next,
    int,
    bool: (probability = 0.5) => next() < probability,
    pick,
    string: (alphabet, minLength, maxLength) => {
      let out = ''
      for (let i = int(minLength, maxLength); i > 0; i--) out += pick(alphabet)
      return out
    },
    shuffle: items => {
      const copy = [...items]
      for (let i = copy.length - 1; i > 0; i--) {
        const j = int(0, i)
        const atI = at(copy, i)
        copy[i] = at(copy, j)
        copy[j] = atI
      }
      return copy
    }
  }
}

/** Characters that tend to break parsers, encoders and validators. */
export const HOSTILE_CHARS: readonly string[] = [
  ...'abcXYZ0123456789',
  ...' \t\n\r\v\f',
  ...'/\\.?#&=%+;:,@!$\'"()*[]{}<>|^`~-_',
  '\u0000',
  '\u007f',
  ' ', // no-break space
  'é', // é
  '٠', // Arabic-Indic digit zero
  '٣', // Arabic-Indic digit three
  '１', // full-width digit one
  ' ', // line separator
  '‮', // right-to-left override
  '﻿', // byte order mark
  '中', // 中
  '\u{1f600}', // an emoji, two UTF-16 units
  '\u{1d7e2}', // mathematical sans-serif digit zero
  '%2F',
  '%00',
  '%zz',
  '..'
]

/** A string of `length` ASCII digits; it may start with 0. */
export function digits(random: Random, length: number): string {
  let out = ''
  for (let i = 0; i < length; i++) out += String(random.int(0, 9))
  return out
}
