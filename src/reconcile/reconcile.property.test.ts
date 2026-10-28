import { describe, expect, it } from 'vitest'

import { createLinePayClient } from '../client'
import type { ReconcileResult } from '../client-types'
import { isArray, isRecord } from '../core/guard'
import { isLinePayError, LinePayApiError, LinePayTimeoutError } from '../errors'
import {
  RECONCILABLE_OPERATIONS,
  type ReconcilableOperation
} from '../operations/names'
import { at } from '../test/at'
import {
  CHANNEL_ID,
  fetchFailed,
  json,
  raw,
  scriptedFetch,
  SECRET,
  type Step
} from '../test/helpers'
import { createRandom, digits, type Random, seedOf } from '../test/random'

/**
 * Random payment-details answers against the rules of reconcile, as the guide
 * states them ("How each operation is judged", docs/en/guide/unknown-outcome.md):
 *
 * - a refund is never `not-applied` when it was looked up;
 * - `applied` and `not-applied` only with the evidence the table names;
 * - every answer is a well-formed ReconcileResult, and reconcile throws nothing
 *   but LinePayErrors for whatever LINE Pay (or a proxy) sends.
 */

const TX = '2021121300698360310'
const OTHER_TX = '2021121300698360999'
const ORDER = 'order-1'
/** The call began 300 ms into a second: refunds are compared by the second. */
const START = Date.UTC(2026, 9, 27, 0, 0, 0) + 300
const RECOVERED = 'Recovered from the payment details by reconcile'

type Status = ReconcileResult['status']

interface RefundModel {
  refundTransactionId: string
  transactionType: string
  refundAmount: number
  refundTransactionDate: string
  /** The instant the date means, or undefined when it must not be trusted. */
  instant: number | undefined
}

interface EntryModel {
  transactionId: string
  orderId: string
  transactionDate: string
  transactionType: string
  payStatus: string
  productName: string
  merchantName: string
  currency: string
  payInfo: { method: string; amount: number }[]
  packages: unknown[]
  refundList?: RefundModel[]
  authorizationExpireDate?: string
}

interface Ctx {
  operation: ReconcilableOperation
  transactionId: string
  orderId: string
  amount?: number
  currency?: string
  refundAmount?: number
  /** An error of the client always has it; a context that was saved may not. */
  channelId?: string
}

const pad = (n: number, width = 2) => String(Math.abs(n)).padStart(width, '0')

function dateText(
  random: Random,
  instant: number
): { text: string; instant: number | undefined } {
  const offset = random.pick([0, 0, 480, -300, 330, 540])
  const local = new Date(instant + offset * 60_000)
  const base =
    `${local.getUTCFullYear()}-${pad(local.getUTCMonth() + 1)}-${pad(local.getUTCDate())}` +
    `T${pad(local.getUTCHours())}:${pad(local.getUTCMinutes())}:${pad(local.getUTCSeconds())}`
  switch (random.int(0, 6)) {
    case 0:
      return { text: base, instant: undefined } // no zone: never trusted
    case 1:
      return {
        text: random.pick(['not a date', '', '2026-13-45T99:99:99Z']),
        instant: undefined
      }
    case 2:
      return {
        text: `${base}.${pad(local.getUTCMilliseconds(), 3)}Z`.replace(
          'Z',
          offset === 0 ? 'Z' : ''
        ),
        instant: offset === 0 ? instant : undefined
      }
    default: {
      const zone =
        offset === 0
          ? 'Z'
          : `${offset < 0 ? '-' : '+'}${pad(Math.trunc(offset / 60))}:${pad(offset % 60)}`
      return { text: base + zone, instant: instant - (instant % 1000) }
    }
  }
}

/**
 * When the payment was made, against the start of the call (300 ms into
 * 00:00:00Z). A payment dated before the call is an earlier use of the order ID.
 */
const PAYMENT_DATES = [
  '2026-10-27T00:00:10Z',
  '2026-10-27T00:00:10Z',
  '2026-10-27T00:00:10Z',
  '2026-10-27T00:00:00Z', // the same second as the call
  '2026-10-26T23:59:59Z', // the second before
  '2026-09-27T00:00:00Z', // last month
  '2026-10-27T00:00:10', // no time zone: not trusted
  'soon'
]
const paymentDate = (random: Random): string => random.pick(PAYMENT_DATES)
const paymentIsFromTheCall = (entry: EntryModel): boolean =>
  entry.transactionDate === '2026-10-27T00:00:10Z'

function amountFor(random: Random, ctx: Ctx): number {
  return random.pick([
    ctx.amount ?? 1000,
    1000,
    999,
    1000.5,
    0.1,
    -1000,
    0,
    random.int(1, 5000) / 100
  ])
}

/** payInfo whose amounts add up to `total` (split in cents), or to something else. */
function payInfoFor(
  random: Random,
  ctx: Ctx
): { method: string; amount: number }[] {
  if (random.bool(0.6) && ctx.amount !== undefined) {
    const cents = Math.round(ctx.amount * 100)
    const discount = random.bool() ? random.int(0, Math.max(0, cents - 1)) : 0
    const parts = discount === 0 ? [cents] : [cents - discount, discount]
    return parts.map((c, i) => ({
      method: i === 0 ? 'CREDIT_CARD' : 'DISCOUNT',
      amount: c / 100
    }))
  }
  const list: { method: string; amount: number }[] = []
  for (let n = random.int(0, 3); n > 0; n--)
    list.push({ method: 'CREDIT_CARD', amount: amountFor(random, ctx) })
  return list
}

/**
 * A refund of the list. A `tidy` one has a type and a date that the rule can
 * read; the others may have neither, and then the rule cannot say whether the
 * entry is the refund of the call.
 */
function refundFor(random: Random, ctx: Ctx, tidy = false): RefundModel {
  const instant =
    START +
    random.pick([
      -86_400_000,
      -1000,
      -300,
      -301,
      0,
      699,
      700,
      1000,
      60_000,
      random.int(-5e6, 5e6)
    ])
  let date = dateText(random, instant)
  while (tidy && date.instant === undefined) date = dateText(random, instant)
  const amount = random.pick([
    ctx.refundAmount ?? 1000,
    20,
    20.5,
    1000,
    random.int(1, 3000) / 100
  ])
  return {
    refundTransactionId: `${random.int(1, 9)}${digits(random, 18)}`,
    transactionType: random.pick(
      tidy
        ? ['PARTIAL_REFUND', 'PARTIAL_REFUND', 'PAYMENT_REFUND']
        : ['PARTIAL_REFUND', 'PARTIAL_REFUND', 'PAYMENT_REFUND', 'OTHER_REFUND']
    ),
    refundAmount: random.bool(0.6) ? -amount : amount,
    refundTransactionDate: date.text,
    instant: date.instant
  }
}

/**
 * A refund the call may have made: from the second it began or later, of the
 * amount it asked for (or a full refund, if it asked for none).
 */
function matchingRefund(random: Random, ctx: Ctx): RefundModel {
  const date = dateText(
    random,
    START + random.pick([0, 699, 700, 1000, 60_000])
  )
  const amount = ctx.refundAmount ?? 1000
  return {
    refundTransactionId: `${random.int(1, 9)}${digits(random, 18)}`,
    transactionType:
      ctx.refundAmount === undefined
        ? 'PAYMENT_REFUND'
        : random.pick(['PARTIAL_REFUND', 'PAYMENT_REFUND']),
    refundAmount: random.bool(0.6) ? -amount : amount,
    refundTransactionDate: date.text,
    instant: date.instant
  }
}

/**
 * Half of the entries are the payment the call is about, consistent with it,
 * and half of those get exactly one field wrong: the near misses tell a rule
 * that checks a field from one that does not.
 */
function entryFor(random: Random, ctx: Ctx): EntryModel {
  if (random.bool(0.5)) {
    const cents = Math.round((ctx.amount ?? 1000) * 100)
    const entry: EntryModel = {
      transactionId: TX,
      orderId: ORDER,
      transactionDate: paymentDate(random),
      transactionType: 'PAYMENT',
      payStatus: random.pick(
        ctx.operation === 'void'
          ? ['VOIDED_AUTHORIZATION', 'VOIDED_AUTHORIZATION', 'AUTHORIZATION']
          : ctx.operation === 'capture'
            ? ['CAPTURE', 'CAPTURE', 'AUTHORIZATION']
            : ['CAPTURE', 'AUTHORIZATION']
      ),
      productName: 'Tea',
      merchantName: 'Tea Shop',
      currency: ctx.currency ?? 'TWD',
      payInfo: random.bool()
        ? [{ method: 'CREDIT_CARD', amount: cents / 100 }]
        : [
            { method: 'CREDIT_CARD', amount: (cents - 150) / 100 },
            { method: 'DISCOUNT', amount: 150 / 100 }
          ],
      packages: [{ id: 'p1', amount: 1000 }]
    }
    if (ctx.operation === 'refund' && random.bool(0.4)) {
      // One refund that fits the call, among others that may or may not.
      const tidy = random.bool(0.7)
      entry.refundList = [
        matchingRefund(random, ctx),
        ...Array.from({ length: random.int(0, 2) }, () =>
          refundFor(random, ctx, tidy)
        )
      ]
    } else if (ctx.operation === 'refund' || random.bool(0.3)) {
      const tidy = random.bool(0.5)
      entry.refundList = Array.from({ length: random.int(0, 3) }, () =>
        refundFor(random, ctx, tidy)
      )
    }
    if (random.bool()) {
      switch (random.int(0, 5)) {
        case 0:
          entry.transactionId = OTHER_TX
          break
        case 1:
          entry.orderId = 'order-2'
          break
        case 2:
          entry.transactionType = random.pick([
            'PAYMENT_REFUND',
            'PARTIAL_REFUND'
          ])
          break
        case 3:
          entry.payStatus = random.pick([
            'CAPTURE',
            'AUTHORIZATION',
            'VOIDED_AUTHORIZATION',
            'EXPIRED_AUTHORIZATION',
            'SOMETHING_NEW'
          ])
          break
        case 4:
          entry.currency = random.pick(['USD', 'THB', 'TWD'])
          break
        default:
          entry.payInfo = [
            {
              method: 'CREDIT_CARD',
              amount: random.pick([
                cents / 100 + 0.01,
                cents / 100 - 1,
                -cents / 100,
                0
              ])
            }
          ]
      }
    }
    return entry
  }
  const entry: EntryModel = {
    transactionId: random.pick([
      TX,
      TX,
      TX,
      OTHER_TX,
      `${random.int(1, 9)}${digits(random, 18)}`
    ]),
    orderId: random.pick([
      ORDER,
      ORDER,
      'order-2',
      `order-${random.int(3, 9)}`
    ]),
    transactionDate: paymentDate(random),
    transactionType: random.pick([
      'PAYMENT',
      'PAYMENT',
      'PAYMENT',
      'PAYMENT_REFUND',
      'PARTIAL_REFUND',
      'OTHER'
    ]),
    payStatus: random.pick([
      'CAPTURE',
      'AUTHORIZATION',
      'VOIDED_AUTHORIZATION',
      'EXPIRED_AUTHORIZATION',
      'SOMETHING_NEW'
    ]),
    productName: 'Tea',
    merchantName: 'Tea Shop',
    currency: random.pick(['TWD', 'TWD', 'TWD', 'USD', 'THB', 'JPY']),
    payInfo: payInfoFor(random, ctx),
    packages: [{ id: 'p1', amount: 1000 }]
  }
  if (random.bool(0.7)) {
    entry.refundList = Array.from({ length: random.int(0, 4) }, () =>
      refundFor(random, ctx)
    )
  }
  if (random.bool(0.3)) entry.authorizationExpireDate = '2026-11-03T00:00:10Z'
  return entry
}

function contextFor(random: Random): Ctx {
  const operation = random.pick(RECONCILABLE_OPERATIONS)
  const ctx: Ctx = {
    operation,
    transactionId: TX,
    orderId: ORDER
  }
  if (random.bool(0.8)) ctx.channelId = CHANNEL_ID
  if (operation === 'refund') {
    const refundAmount = random.pick([20, 20.5, 1000, undefined])
    if (refundAmount !== undefined) ctx.refundAmount = refundAmount
    // A saved context may carry the amount of the payment too; a refund ignores it.
    if (random.bool(0.3)) ctx.amount = random.pick([1000, 20.5])
  } else if (operation !== 'void') {
    const amount = random.pick([1000, 1000, 1000, 1000.5, 99.99, undefined])
    if (amount !== undefined) ctx.amount = amount
    const currency = random.pick(['TWD', 'TWD', 'TWD', 'TWD', 'USD', undefined])
    if (currency !== undefined) ctx.currency = currency
  }
  return ctx
}

/** The serialised answer, with the 19-digit IDs written as bare numbers as LINE Pay does. */
function detailsText(random: Random, info: unknown): string {
  const text = JSON.stringify(
    { returnCode: '0000', returnMessage: 'Success.', info },
    (key, value: unknown) => (key === 'instant' ? undefined : value)
  )
  return random.bool(0.8)
    ? text.replace(
        /("(?:transactionId|refundTransactionId|originalTransactionId)":)"(\d{19})"/g,
        '$1$2'
      )
    : text
}

function subjectFor(
  random: Random,
  ctx: Ctx
): { kind: string; subject: unknown } {
  const fields: Record<string, unknown> = { ...ctx }
  if (ctx.operation === 'payPreapproved') delete fields.transactionId
  else delete fields.orderId
  switch (random.int(0, 2)) {
    case 0: {
      const error = new LinePayTimeoutError({
        timeoutMs: 1000,
        operation: ctx.operation
      })
      error.context = {
        ...fields,
        operation: ctx.operation,
        startedAt: new Date(START)
      }
      return { kind: 'timeout', subject: error }
    }
    case 1: {
      const error = new LinePayApiError({
        body: { returnCode: '1172', returnMessage: 'duplicate' },
        httpStatus: 200,
        operation: ctx.operation
      })
      error.context = {
        ...fields,
        operation: ctx.operation,
        startedAt: new Date(START)
      }
      return { kind: 'duplicate', subject: error }
    }
    default: {
      // A context saved before the call, read back from JSON.
      const startedAt = random.pick<unknown>([
        new Date(START),
        new Date(START).toISOString(),
        START
      ])
      return {
        kind: 'saved',
        subject: { ...fields, operation: ctx.operation, startedAt }
      }
    }
  }
}

const sumOf = (entry: EntryModel) =>
  entry.payInfo.reduce((sum, pay) => sum + pay.amount, 0)
const close = (a: number, b: number) => Math.abs(a - b) < 1e-6
const matchesCall = (entry: EntryModel, ctx: Ctx) =>
  ctx.amount !== undefined &&
  entry.currency === ctx.currency &&
  close(sumOf(entry), ctx.amount)

/** What a context must carry for the lookup of its operation (the guide's table). */
const NEEDS: Record<ReconcilableOperation, ('amount' | 'currency')[]> = {
  confirm: ['amount', 'currency'],
  capture: ['amount', 'currency'],
  void: [],
  refund: [],
  payPreapproved: ['amount', 'currency']
}
const lacksWhatItNeeds = (ctx: Ctx): boolean =>
  NEEDS[ctx.operation].some(field => ctx[field] === undefined)

/** Every refund that could be the call's: any, for a full refund, else of its amount. */
function possibleRefunds(entry: EntryModel, ctx: Ctx): RefundModel[] {
  return (entry.refundList ?? []).filter(
    refund =>
      ctx.refundAmount === undefined ||
      close(Math.abs(refund.refundAmount), ctx.refundAmount)
  )
}

/** One of those that cannot be read: a type no rule knows, or a date without a zone. */
const unreadableRefund = (refund: RefundModel): boolean =>
  !['PAYMENT_REFUND', 'PARTIAL_REFUND'].includes(refund.transactionType) ||
  refund.instant === undefined

function refundCandidates(entry: EntryModel, ctx: Ctx): RefundModel[] {
  const since = Math.floor(START / 1000)
  return possibleRefunds(entry, ctx).filter(
    refund =>
      refund.instant !== undefined &&
      Math.floor(refund.instant / 1000) > since &&
      (ctx.refundAmount !== undefined ||
        refund.transactionType === 'PAYMENT_REFUND')
  )
}

/**
 * "Nothing found" is a verdict (not-applied) only if nothing speaks against it:
 * the answer lists nothing at all, LINE Pay did not call the call a duplicate,
 * and the context names the channel the credentials of the client belong to.
 */
const absenceProves = (
  ctx: Ctx,
  info: EntryModel[],
  duplicate: boolean
): boolean => info.length === 0 && !duplicate && ctx.channelId !== undefined

/** The answer the guide's table gives for one entry of the transaction, or the order's payments. */
function judge(ctx: Ctx, info: EntryModel[], duplicate: boolean): Status {
  if (ctx.operation === 'payPreapproved') {
    // An entry with the order ID that is neither a payment nor a refund is
    // something the rule cannot read: no verdict, least of all "not charged".
    const unreadable = info.some(
      e =>
        e.orderId === ORDER &&
        !['PAYMENT', 'PAYMENT_REFUND', 'PARTIAL_REFUND'].includes(
          e.transactionType
        )
    )
    if (unreadable) return 'indeterminate'
    const payments = info.filter(
      e => e.orderId === ORDER && e.transactionType === 'PAYMENT'
    )
    if (payments.length === 0) {
      return absenceProves(ctx, info, duplicate)
        ? 'not-applied'
        : 'indeterminate'
    }
    const [payment, ...others] = payments
    if (payment === undefined || others.length > 0) return 'indeterminate'
    const charged =
      payment.payStatus === 'CAPTURE' || payment.payStatus === 'AUTHORIZATION'
    return charged && matchesCall(payment, ctx) && paymentIsFromTheCall(payment)
      ? 'applied'
      : 'indeterminate'
  }
  const payment = info.find(e => e.transactionId === TX)
  if (payment === undefined) {
    return ctx.operation === 'confirm' && absenceProves(ctx, info, duplicate)
      ? 'not-applied'
      : 'indeterminate'
  }
  return judgeEntry(ctx, payment)
}

function judgeEntry(ctx: Ctx, payment: EntryModel): Status {
  // The transaction is something else than a payment (a refund, a type no rule
  // knows): whatever its state says, it is not the payment of the call.
  if (payment.transactionType !== 'PAYMENT') return 'indeterminate'
  switch (ctx.operation) {
    case 'confirm':
      return payment.transactionType === 'PAYMENT' &&
        (payment.payStatus === 'CAPTURE' ||
          payment.payStatus === 'AUTHORIZATION') &&
        matchesCall(payment, ctx)
        ? 'applied'
        : 'indeterminate'
    case 'capture':
      if (payment.payStatus === 'AUTHORIZATION') return 'not-applied'
      return payment.payStatus === 'CAPTURE' && matchesCall(payment, ctx)
        ? 'applied'
        : 'indeterminate'
    case 'void':
      if (payment.payStatus === 'VOIDED_AUTHORIZATION') return 'applied'
      return ['AUTHORIZATION', 'CAPTURE', 'EXPIRED_AUTHORIZATION'].includes(
        payment.payStatus
      )
        ? 'not-applied'
        : 'indeterminate'
    case 'refund':
      // What cannot be read may be the call's refund: it is not left out.
      if (possibleRefunds(payment, ctx).some(unreadableRefund)) {
        return 'indeterminate'
      }
      return refundCandidates(payment, ctx).length === 1
        ? 'applied'
        : 'indeterminate'
    default:
      throw new Error('unreachable')
  }
}

function expectWellFormed(
  result: ReconcileResult,
  ctx: Ctx,
  where: string
): void {
  expect(['applied', 'not-applied', 'indeterminate'], where).toContain(
    result.status
  )
  expect(result.operation, where).toBe(ctx.operation)
  if (result.status === 'applied') {
    expect(result.body, where).toMatchObject({
      returnCode: '0000',
      returnMessage: RECOVERED
    })
    expect(
      isArray(result.notes) &&
        result.notes.every(note => typeof note === 'string'),
      where
    ).toBe(true)
  } else {
    expect(
      typeof result.reason === 'string' && result.reason.length > 0,
      where
    ).toBe(true)
  }
}

function clientAnswering(step: Step) {
  const { fetch, calls } = scriptedFetch(step)
  return {
    client: createLinePayClient({
      channelId: CHANNEL_ID,
      channelSecretKey: SECRET,
      env: 'sandbox',
      fetch,
      middleware: []
    }),
    calls
  }
}

async function settle(
  promise: Promise<ReconcileResult>
): Promise<{ result: ReconcileResult } | { error: unknown }> {
  try {
    return { result: await promise }
  } catch (error) {
    return { error }
  }
}

describe('reconcile: property-based, well-typed answers', () => {
  it('answers what the guide says, with the evidence it names, in any order', async () => {
    const random = createRandom(seedOf(0x2e_c0))
    const seenStatus = new Map<string, number>()
    // Every operation reaches every answer it can give, and often enough to
    // count. Some of them are rare in the random stream (a capture that is not
    // applied needs an open authorization, a full context and a lookup that
    // answers), so the stream goes on, up to a limit, until all of them are met.
    const answers = [
      'confirm:applied',
      'confirm:not-applied',
      'confirm:indeterminate',
      'capture:applied',
      'capture:not-applied',
      'capture:indeterminate',
      'void:applied',
      'void:not-applied',
      'void:indeterminate',
      'payPreapproved:applied',
      'payPreapproved:not-applied',
      'payPreapproved:indeterminate',
      'refund:applied',
      'refund:indeterminate'
    ]
    const OFTEN_ENOUGH = 5
    const allMet = () =>
      answers.every(what => (seenStatus.get(what) ?? 0) >= OFTEN_ENOUGH)
    for (let i = 0; i < 3500 || (!allMet() && i < 40_000); i++) {
      const ctx = contextFor(random)
      let info = Array.from({ length: random.int(0, 4) }, () =>
        entryFor(random, ctx)
      )
      // Duplicates: the same transaction listed twice, maybe in another state.
      if (info.length > 0 && random.bool(0.15)) {
        const copy = {
          ...random.pick(info),
          payStatus: random.pick([
            'CAPTURE',
            'AUTHORIZATION',
            'VOIDED_AUTHORIZATION'
          ])
        }
        info = random.shuffle([...info, copy])
      }
      const lookup = random.pick([
        'details',
        'details',
        'details',
        'details',
        'details',
        'nosuch1150',
        'api1104',
        'reset',
        'http502',
        'html'
      ] as const)
      const { kind, subject } = subjectFor(random, ctx)
      const where = `seed=${random.seed} case=${i} subject=${kind} lookup=${lookup} ctx=${JSON.stringify(ctx)} info=${JSON.stringify(info)}`

      const step: Step = {
        details: () => raw(detailsText(random, info)),
        nosuch1150: () =>
          json({ returnCode: '1150', returnMessage: 'no such transaction' }),
        api1104: () =>
          json({ returnCode: '1104', returnMessage: 'merchant error' }),
        reset: fetchFailed('ECONNRESET'),
        http502: raw('bad gateway', 502),
        html: raw('<html>maintenance</html>')
      }[lookup]
      const { client, calls } = clientAnswering(step)
      const result = await client.reconcile(subject)
      count(seenStatus, `${ctx.operation}:${result.status}`)

      expectWellFormed(result, ctx, where)
      if (ctx.operation === 'refund')
        expect(result.status, `${where}: a refund`).not.toBe('not-applied')

      // A context without what its operation compares, and a refund that LINE Pay
      // refused as a duplicate, get no lookup and no verdict.
      if (
        lacksWhatItNeeds(ctx) ||
        (kind === 'duplicate' &&
          (ctx.operation === 'refund' || ctx.operation === 'payPreapproved'))
      ) {
        expect(result.status, where).toBe('indeterminate')
        expect(calls, where).toHaveLength(0)
        continue
      }
      expect(calls, where).toHaveLength(1)

      if (lookup !== 'details' && lookup !== 'nosuch1150') {
        expect(result.status, where).toBe('indeterminate')
        continue
      }
      const listed = lookup === 'nosuch1150' ? [] : info
      const ofTransaction = listed.filter(e => e.transactionId === TX)

      if (ctx.operation === 'payPreapproved' || ofTransaction.length <= 1) {
        // One entry for the transaction: the answer is fully determined.
        expect(result.status, where).toBe(
          judge(ctx, listed, kind === 'duplicate')
        )
      } else {
        // The same transaction listed twice: at least the safety rules hold.
        if (result.status === 'applied') {
          expect(
            ofTransaction.some(e => judgeEntry(ctx, e) === 'applied'),
            `${where}: applied without evidence`
          ).toBe(true)
        }
        if (result.status === 'not-applied') {
          expect(
            ofTransaction.some(e => judgeEntry(ctx, e) === 'not-applied'),
            `${where}: not-applied without evidence`
          ).toBe(true)
        }
      }

      if (result.status === 'applied') {
        // The body is built from the evidence, never from the call.
        const info: unknown =
          'info' in result.body ? result.body.info : undefined
        const field = (name: string): unknown =>
          isRecord(info) ? info[name] : undefined
        if (ctx.operation === 'confirm' || ctx.operation === 'capture')
          expect(field('transactionId'), where).toBe(TX)
        if (ctx.operation === 'payPreapproved')
          expect(field('orderId'), where).toBe(ORDER)
        if (ctx.operation === 'refund') {
          const payment = at(ofTransaction, 0)
          const refund = at(refundCandidates(payment, ctx), 0)
          expect(info, where).toEqual({
            refundTransactionId: refund.refundTransactionId,
            refundTransactionDate: refund.refundTransactionDate
          })
        }
      }

      // The order of the entries and of the refunds does not matter (no duplicates).
      if (ofTransaction.length <= 1 && random.bool(0.3)) {
        const shuffled = random
          .shuffle(info)
          .map(e =>
            e.refundList
              ? { ...e, refundList: random.shuffle(e.refundList) }
              : e
          )
        const again = await clientAnswering(
          raw(detailsText(random, shuffled))
        ).client.reconcile(subject)
        if (lookup === 'details')
          expect(again, `${where}: shuffled`).toEqual(result)
      }
    }
    for (const what of answers) {
      expect(
        seenStatus.get(what) ?? 0,
        `${what} in ${JSON.stringify([...seenStatus])}`
      ).toBeGreaterThanOrEqual(OFTEN_ENOUGH)
    }
  })
})

function count(map: Map<string, number>, key: string): void {
  map.set(key, (map.get(key) ?? 0) + 1)
}

// ---------------------------------------------------------------------------
// Answers of the wrong shape: missing or wrong-typed fields, null entries.

function hostileValue(random: Random, valid: () => unknown): unknown {
  return random.bool(0.5)
    ? valid()
    : random.pick<unknown>([
        undefined,
        null,
        7,
        'x',
        true,
        {},
        [],
        [null],
        Number('123')
      ])
}

function hostileEntry(random: Random, ctx: Ctx): unknown {
  const roll = random.int(0, 9)
  if (roll === 0) return random.pick<unknown>([null, 7, 'x', [], {}])
  const valid = entryFor(random, ctx)
  const entry: Record<string, unknown> = { ...valid }
  for (const key of [
    'transactionId',
    'orderId',
    'transactionType',
    'payStatus',
    'currency'
  ] as const) {
    if (random.bool(0.15)) entry[key] = hostileValue(random, () => valid[key])
  }
  if (random.bool(0.4)) {
    entry.payInfo = random.pick<unknown>([
      undefined,
      null,
      {},
      'x',
      [null],
      [{}],
      [{ method: 'CREDIT_CARD', amount: null }],
      valid.payInfo.map(p => ({
        ...p,
        amount: random.pick<unknown>([
          String(p.amount),
          null,
          true,
          { value: p.amount }
        ])
      }))
    ])
  }
  if (random.bool(0.4)) {
    entry.refundList = random.pick<unknown>([
      null,
      {},
      'x',
      7,
      [null],
      [{}],
      (valid.refundList ?? []).map(r => ({
        ...r,
        refundAmount: String(r.refundAmount)
      })),
      (valid.refundList ?? []).map(r => ({
        ...r,
        refundTransactionDate: Date.parse(r.refundTransactionDate)
      }))
    ])
  }
  return entry
}

function hostileInfo(random: Random, ctx: Ctx): unknown {
  const roll = random.int(0, 5)
  if (roll === 0)
    return random.pick<unknown>([undefined, null, {}, 'x', 7, true])
  return Array.from({ length: random.int(1, 4) }, () =>
    hostileEntry(random, ctx)
  )
}

interface HostileCase {
  ctx: Ctx
  subject: unknown
  info: unknown
  where: string
  outcome: { result: ReconcileResult } | { error: unknown }
}

let hostile: Promise<HostileCase[]> | undefined

/** The same hostile cases for both tests below: they are generated once. */
function hostileCases(): Promise<HostileCase[]> {
  hostile ??= generateHostileCases()
  return hostile
}

async function generateHostileCases(): Promise<HostileCase[]> {
  const random = createRandom(seedOf(0x4057_11e))
  const cases: HostileCase[] = []
  for (let i = 0; i < 800; i++) {
    const ctx = contextFor(random)
    const info = hostileInfo(random, ctx)
    const { kind, subject } = subjectFor(random, ctx)
    const text = detailsText(random, info)
    const outcome = await settle(
      clientAnswering(raw(text)).client.reconcile(subject)
    )
    cases.push({
      ctx,
      subject,
      info,
      outcome,
      where: `seed=${random.seed} case=${i} subject=${kind} ctx=${JSON.stringify(ctx)} body=${text}`
    })
  }
  return cases
}

/** Typed evidence: the entry is an object whose fields have the types the API documents. */
function typedEvidence(ctx: Ctx, info: unknown): boolean {
  if (!isArray(info)) return false
  const entries = info.filter(
    (e): e is Record<string, unknown> =>
      typeof e === 'object' && e !== null && !isArray(e)
  )
  const amountsAddUp = (e: Record<string, unknown>) => {
    if (ctx.amount === undefined) return true
    if (!isArray(e.payInfo)) return false
    const amounts = e.payInfo.map((p: unknown) =>
      isRecord(p) ? p.amount : undefined
    )
    return (
      amounts.every(a => typeof a === 'number') &&
      close(
        amounts.reduce((s, a) => s + a, 0),
        ctx.amount
      )
    )
  }
  if (ctx.operation === 'payPreapproved') {
    const payments = entries.filter(
      e => e.orderId === ORDER && e.transactionType === 'PAYMENT'
    )
    return (
      payments.length === 1 &&
      amountsAddUp(at(payments, 0)) &&
      at(payments, 0).currency === ctx.currency
    )
  }
  return entries.some(e => {
    if (e.transactionId !== TX) return false
    if (ctx.operation === 'void') return e.payStatus === 'VOIDED_AUTHORIZATION'
    if (ctx.operation === 'refund') {
      return (
        isArray(e.refundList) &&
        e.refundList.some(
          (r: unknown) =>
            isRecord(r) &&
            typeof r.refundAmount === 'number' &&
            typeof r.refundTransactionDate === 'string'
        )
      )
    }
    return e.currency === ctx.currency && amountsAddUp(e)
  })
}

describe('reconcile: property-based, answers of the wrong shape', () => {
  it('answers well-formed, never not-applied for a refund, and applied only for the right entry', async () => {
    for (const { ctx, outcome, where } of await hostileCases()) {
      // An answer of the wrong shape is no reason to throw, not even an error of
      // the library: reconcile answers.
      if (!('result' in outcome)) {
        expect.unreachable(`${where}: threw ${String(outcome.error)}`)
      }
      const { result } = outcome
      expectWellFormed(result, ctx, where)
      if (ctx.operation === 'refund')
        expect(result.status, where).not.toBe('not-applied')
    }
  })

  // The rules read `body.info`, `payInfo` and `refundList`: an answer of the wrong
  // shape must not make reconcile throw a TypeError, and `sum + amount` must not
  // add strings and booleans as JavaScript does ('10' + '00' is 1000).
  it('never throws a non-library error, and never infers applied from values of the wrong type', async () => {
    const problems: string[] = []
    for (const { ctx, info, outcome, where } of await hostileCases()) {
      if ('error' in outcome && !isLinePayError(outcome.error)) {
        problems.push(`${where}: threw ${String(outcome.error)}`)
      }
      if (
        'result' in outcome &&
        outcome.result.status === 'applied' &&
        !typedEvidence(ctx, info)
      ) {
        problems.push(`${where}: applied without typed evidence`)
      }
    }
    expect(problems).toEqual([])
  })
})

describe('reconcile: answers of the wrong shape, one by one', () => {
  const confirm: Ctx = {
    operation: 'confirm',
    transactionId: TX,
    orderId: ORDER,
    amount: 1000,
    currency: 'TWD'
  }
  const refund: Ctx = {
    operation: 'refund',
    transactionId: TX,
    orderId: ORDER,
    refundAmount: 20
  }
  const pay: Ctx = {
    operation: 'payPreapproved',
    transactionId: TX,
    orderId: ORDER,
    amount: 1000,
    currency: 'TWD'
  }
  const payment = (extra: Record<string, unknown>) => ({
    transactionId: TX,
    orderId: ORDER,
    transactionType: 'PAYMENT',
    payStatus: 'CAPTURE',
    currency: 'TWD',
    payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }],
    ...extra
  })
  const lost = (ctx: Ctx) => {
    const error = new LinePayTimeoutError({
      timeoutMs: 1000,
      operation: ctx.operation
    })
    const { operation, ...fields } = ctx
    error.context = { ...fields, operation, startedAt: new Date(START) }
    return error
  }

  // Each answer must give `indeterminate` (or at least not `applied`), not a TypeError.
  it.each([
    ['info is missing', confirm, '{"returnCode":"0000","returnMessage":"OK"}'],
    [
      'info is null',
      confirm,
      '{"returnCode":"0000","returnMessage":"OK","info":null}'
    ],
    [
      'info is an object',
      pay,
      '{"returnCode":"0000","returnMessage":"OK","info":{}}'
    ],
    [
      'an entry is null',
      confirm,
      '{"returnCode":"0000","returnMessage":"OK","info":[null]}'
    ],
    [
      'payInfo is missing',
      confirm,
      JSON.stringify({
        returnCode: '0000',
        returnMessage: 'OK',
        info: [payment({ payInfo: undefined })]
      })
    ],
    [
      'refundList is a string',
      refund,
      JSON.stringify({
        returnCode: '0000',
        returnMessage: 'OK',
        info: [payment({ refundList: 'none' })]
      })
    ],
    [
      'a refund entry is null',
      refund,
      JSON.stringify({
        returnCode: '0000',
        returnMessage: 'OK',
        info: [payment({ refundList: [null] })]
      })
    ],
    [
      'payInfo amounts are strings that concatenate to the amount',
      confirm,
      JSON.stringify({
        returnCode: '0000',
        returnMessage: 'OK',
        info: [payment({ payInfo: [{ amount: '10' }, { amount: '00' }] })]
      })
    ],
    [
      'a payInfo amount is a boolean',
      confirm,
      JSON.stringify({
        returnCode: '0000',
        returnMessage: 'OK',
        info: [payment({ payInfo: [{ amount: 999 }, { amount: true }] })]
      })
    ]
  ] as const)('%s', async (_name, ctx, body) => {
    const result = await clientAnswering(raw(body)).client.reconcile(lost(ctx))
    expect(result.status).not.toBe('applied')
    expect(result.status).toBe('indeterminate')
  })
})
