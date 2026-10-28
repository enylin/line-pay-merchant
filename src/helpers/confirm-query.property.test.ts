import { describe, expect, it } from 'vitest'

import { isRecord } from '../core/guard'
import { isLinePayValidationError } from '../errors'
import { at } from '../test/at'
import { applyUntyped } from '../test/helpers'
import { isTransactionIdOracle, percentEncode } from '../test/oracles'
import {
  createRandom,
  digits,
  HOSTILE_CHARS,
  type Random,
  seedOf
} from '../test/random'
import {
  type ConfirmQuery,
  type ConfirmQuerySource,
  parseConfirmQuery
} from './confirm-query'

/**
 * The confirmUrl query comes from the user's browser. Whatever arrives,
 * parseConfirmQuery must either return exactly one transaction ID of 1 to 19
 * ASCII digits (and maybe one order ID of 1 to 100 characters), or throw a
 * LinePayValidationError. No other error, and no other character, gets through.
 */

type Pair = [key: string, value: string]

function transactionIdValue(random: Random): string {
  switch (random.int(0, 7)) {
    case 0:
    case 1:
    case 2:
      return digits(random, random.int(1, 19))
    case 3:
      return digits(random, random.int(20, 25))
    case 4: {
      const valid = digits(random, random.int(1, 19))
      const at = random.int(0, valid.length)
      return valid.slice(0, at) + random.pick(HOSTILE_CHARS) + valid.slice(at)
    }
    case 5:
      return random.string(HOSTILE_CHARS, 0, 25)
    default:
      return random.pick([
        '2021121300698360310',
        '0',
        '0000000000000000000',
        '9999999999999999999',
        '1\n',
        ' 1',
        '1 ',
        '+1',
        '-1',
        '1e3',
        '0x1',
        '１２３',
        '١٢٣',
        '../../v4/payments/1/refund',
        ''
      ])
  }
}

function orderIdValue(random: Random): string {
  switch (random.int(0, 3)) {
    case 0:
      return 'x'.repeat(random.pick([0, 1, 99, 100, 101, 150]))
    case 1:
      return `order-${random.int(1, 99_999)}`
    default:
      return random.string([...HOSTILE_CHARS, '中', 'é'], 0, 110)
  }
}

const DECOY_KEYS = [
  'transactionid',
  'TransactionId',
  'transactionId[]',
  'transactionId ',
  ' transactionId',
  'transaction%49d', // a literal key: the percent sign is encoded along with it
  'orderid',
  'orderId[]',
  'amount',
  '__proto__',
  'constructor',
  'toString',
  ''
]

function generatePairs(random: Random): Pair[] {
  const pairs: Pair[] = []
  for (let n = random.pick([1, 1, 1, 1, 0, 2, 3]); n > 0; n--) {
    pairs.push(['transactionId', transactionIdValue(random)])
  }
  for (let n = random.pick([0, 1, 1, 1, 2]); n > 0; n--) {
    pairs.push(['orderId', orderIdValue(random)])
  }
  for (let n = random.int(0, 3); n > 0; n--) {
    pairs.push([random.pick(DECOY_KEYS), random.string(HOSTILE_CHARS, 0, 10)])
  }
  return random.shuffle(pairs)
}

/** Form encoding: percent escapes, and `+` for a space now and then. */
function encode(random: Random, text: string): string {
  const encoded = percentEncode(text)
  return random.bool(0.3) ? encoded.replaceAll('%20', '+') : encoded
}

function objectOf(random: Random, pairs: Pair[]): Record<string, unknown> {
  const grouped = new Map<string, string[]>()
  for (const [key, value] of pairs)
    grouped.set(key, [...(grouped.get(key) ?? []), value])
  const object: Record<string, unknown> = random.bool(0.3)
    ? { __proto__: null }
    : {}
  for (const [key, values] of grouped) {
    // A parameter given once is a string. Only a repeated one is a list: a list of
    // one is refused (see the unit test), so the model does not generate it.
    const value = values.length === 1 ? values[0] : values
    // A data property, so that `__proto__` stays a key, as qs and querystring build it.
    Object.defineProperty(object, key, {
      value,
      enumerable: true,
      configurable: true,
      writable: true
    })
  }
  return object
}

function sourceOf(
  random: Random,
  pairs: Pair[]
): { form: string; source: ConfirmQuerySource } {
  const query = pairs
    .map(([key, value]) => `${encode(random, key)}=${encode(random, value)}`)
    .join('&')
  const fragment = random.pick([
    '',
    '',
    '#',
    '#top',
    `#transactionId=${digits(random, 5)}`
  ])
  switch (random.int(0, 6)) {
    case 0:
      return { form: 'bare', source: query }
    case 1:
      // A leading question mark makes it a URL: the fragment is not part of it.
      return { form: 'question mark', source: `?${query}${fragment}` }
    case 2:
      return { form: 'path', source: `/line-pay/confirm?${query}${fragment}` }
    case 3:
      return {
        form: 'URL string',
        source: `https://shop.example/line-pay/confirm?${query}${fragment}`
      }
    case 4:
      return { form: 'URLSearchParams', source: new URLSearchParams(pairs) }
    case 5:
      return {
        form: 'URL',
        source: new URL(`https://shop.example/confirm?${query}${fragment}`)
      }
    default:
      return { form: 'object', source: objectOf(random, pairs) }
  }
}

/** The answer the model expects, from the pairs it generated. */
function expectedOf(
  pairs: Pair[]
): { ok: ConfirmQuery } | { issues: { path: string; message: string }[] } {
  const transactionIds = pairs
    .filter(([key]) => key === 'transactionId')
    .map(([, value]) => value)
  const orderIds = pairs
    .filter(([key]) => key === 'orderId')
    .map(([, value]) => value)
  const issues: { path: string; message: string }[] = []
  if (transactionIds.length === 0)
    issues.push({ path: 'transactionId', message: 'is missing' })
  else if (transactionIds.length > 1)
    issues.push({ path: 'transactionId', message: 'is given more than once' })
  else if (!isTransactionIdOracle(transactionIds[0])) {
    issues.push({
      path: 'transactionId',
      message: 'must be a string of 1 to 19 digits'
    })
  }
  if (orderIds.length > 1)
    issues.push({ path: 'orderId', message: 'is given more than once' })
  else if (
    orderIds.length === 1 &&
    !(at(orderIds, 0).length >= 1 && at(orderIds, 0).length <= 100)
  ) {
    issues.push({
      path: 'orderId',
      message: 'must be a string of 1 to 100 characters'
    })
  }
  if (issues.length > 0) return { issues }
  const transactionId = at(transactionIds, 0)
  return {
    ok:
      orderIds.length === 1
        ? { transactionId, orderId: at(orderIds, 0) }
        : { transactionId }
  }
}

function outcome(source: unknown): { ok: unknown } | { error: unknown } {
  try {
    return { ok: applyUntyped(parseConfirmQuery, [source]) }
  } catch (error) {
    return { error }
  }
}

/** The safety invariant, for any input at all. */
function expectSafe(
  result: { ok: unknown } | { error: unknown },
  where: string
): void {
  if ('error' in result) {
    const { error } = result
    if (!isLinePayValidationError(error)) {
      expect.unreachable(`${where}: threw ${String(error)}`)
    }
    expect(error.issues.length, where).toBeGreaterThan(0)
    return
  }
  const { ok } = result
  if (!isRecord(ok)) expect.unreachable(`${where}: answered ${String(ok)}`)
  expect(
    Object.keys(ok).every(key => key === 'transactionId' || key === 'orderId'),
    where
  ).toBe(true)
  expect(
    isTransactionIdOracle(ok.transactionId),
    `${where}: ${JSON.stringify(ok)}`
  ).toBe(true)
  if ('orderId' in ok) {
    const { orderId } = ok
    expect(typeof orderId, where).toBe('string')
    expect(
      typeof orderId === 'string' &&
        orderId.length >= 1 &&
        orderId.length <= 100,
      where
    ).toBe(true)
  }
}

describe('parseConfirmQuery: property-based', () => {
  it('answers exactly what the generated parameters call for, in every source form', () => {
    const random = createRandom(seedOf(0xc0_f1))
    for (let i = 0; i < 3000; i++) {
      const pairs = generatePairs(random)
      const { form, source } = sourceOf(random, pairs)
      const where = `seed=${random.seed} case=${i} form=${form} pairs=${JSON.stringify(pairs)}`
      const result = outcome(source)
      expectSafe(result, where)

      const expected = expectedOf(pairs)
      if ('ok' in expected) {
        expect(result, where).toEqual({ ok: expected.ok })
      } else {
        if (!('error' in result) || !isLinePayValidationError(result.error)) {
          expect.unreachable(`${where}: ${JSON.stringify(result)}`)
        }
        expect(result.error.issues, where).toEqual(expected.issues)
      }
    }
  })

  it('never throws anything but a LinePayValidationError, and never lets other characters through, for raw hostile input', () => {
    const random = createRandom(seedOf(0x0_4057))
    const chars = [
      ...HOSTILE_CHARS,
      '\uD800',
      '\uDBFF',
      '\uDC00',
      'transactionId=',
      'orderId=',
      '&',
      '=',
      '?',
      '#',
      '//',
      'http://',
      'javascript:',
      '[',
      ']',
      '%',
      '%E4',
      '%ZZ'
    ]
    const values = (): unknown =>
      random.pick<unknown>([
        random.string(chars, 0, 30),
        digits(random, random.int(1, 19)),
        random.int(0, 1e9),
        Number('2021121300698360310'),
        null,
        undefined,
        true,
        [],
        [digits(random, 5)],
        [digits(random, 5), digits(random, 5)],
        { 0: digits(random, 5) },
        { $ne: '' },
        new Date(0),
        10n,
        Symbol('x'),
        () => digits(random, 5)
      ])
    for (let i = 0; i < 4000; i++) {
      let source: unknown
      switch (random.int(0, 4)) {
        case 0:
          source = random.string(chars, 0, 60)
          break
        case 1:
          source = `${random.pick(['', '?', '/', 'https://shop.example/', 'http://[', '//evil.example/'])}transactionId=${random.string(chars, 0, 25)}${random.pick(['', '&orderId=' + random.string(chars, 0, 20)])}`
          break
        case 2:
          source = {
            transactionId: values(),
            orderId: random.bool() ? values() : undefined,
            [random.string(chars, 0, 5)]: values()
          }
          break
        case 3:
          source = values()
          break
        default: {
          const first = random.string(chars, 0, 25)
          const more: [string, string][] = random.bool()
            ? [['transactionId', digits(random, 3)]]
            : []
          source = new URLSearchParams([['transactionId', first], ...more])
        }
      }
      const where = `seed=${random.seed} case=${i} source=${typeof source === 'string' ? JSON.stringify(source) : typeof source}`
      expectSafe(outcome(source), where)
    }
  })
})
