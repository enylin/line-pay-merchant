import { describe, expect, it } from 'vitest'

import { createLinePayClient } from '../client'
import type { ReconcileResult } from '../client-types'
import { isArray } from '../core/guard'
import type { PaymentDetailsInfo } from '../operations'
import {
  RECONCILABLE_OPERATIONS,
  type ReconcilableOperation
} from '../operations/names'
import { at } from '../test/at'
import {
  CHANNEL_ID,
  detailsResponse,
  json,
  messageOf,
  paymentInfo,
  scriptedFetch,
  SECRET,
  TX
} from '../test/helpers'

/**
 * The payment details come from the network. Whatever they hold, reconcile must
 * answer with a well-formed result and never let a TypeError escape: an escaped
 * error would replace the original error in autoReconcile and tell the caller
 * nothing about the payment.
 */

// A small seeded generator, so that a failure can be reproduced.
function prng(seed: number) {
  let state = seed >>> 0
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

const contexts: Record<ReconcilableOperation, object> = {
  confirm: { transactionId: TX, amount: 1000, currency: 'TWD' },
  capture: { transactionId: TX, amount: 1000, currency: 'TWD' },
  void: { transactionId: TX },
  refund: { transactionId: TX, refundAmount: 20 },
  payPreapproved: { orderId: 'order-1', amount: 1000, currency: 'TWD' }
}

const junk = (random: () => number): unknown => {
  const values = [
    undefined,
    null,
    0,
    -1,
    1.5,
    Number.MAX_SAFE_INTEGER,
    '',
    'x',
    '1000',
    true,
    [],
    {},
    [null],
    [{}],
    { amount: '5' }
  ]
  return values[Math.floor(random() * values.length)]
}

/** A valid payment entry with some of its fields replaced by junk or removed. */
function damaged(random: () => number): unknown {
  const entry: Record<string, unknown> = {
    ...paymentInfo({
      refundList: [
        {
          refundTransactionId: '2021121300698360311',
          transactionType: 'PARTIAL_REFUND',
          refundAmount: 20,
          refundTransactionDate: new Date().toISOString()
        }
      ]
    })
  }
  const keys = Object.keys(entry)
  const hits = 1 + Math.floor(random() * 3)
  for (let i = 0; i < hits; i++) {
    const key = at(keys, Math.floor(random() * keys.length))
    if (random() < 0.4) delete entry[key]
    else entry[key] = junk(random)
  }
  // Sometimes damage a nested entry as well.
  if (isArray(entry.payInfo) && random() < 0.5) {
    entry.payInfo = [{ method: 'CREDIT_CARD', amount: junk(random) }]
  }
  if (isArray(entry.refundList) && random() < 0.5) {
    entry.refundList = [
      { refundAmount: junk(random), refundTransactionDate: junk(random) }
    ]
  }
  return entry
}

function wellFormed(result: ReconcileResult): boolean {
  if (result.status === 'applied') {
    return typeof result.body === 'object' && isArray(result.notes)
  }
  return typeof result.reason === 'string' && result.reason.length > 0
}

/** Payment details with whatever entries, in the shape of a LINE Pay response. */
const details = (...info: unknown[]): Response =>
  json({ returnCode: '0000', returnMessage: 'ok', info })

describe('reconcile against payment details that are not what was promised', () => {
  const bodies: [string, () => Response][] = [
    ['info missing', () => json({ returnCode: '0000', returnMessage: 'ok' })],
    [
      'info null',
      () => json({ returnCode: '0000', returnMessage: 'ok', info: null })
    ],
    [
      'info an object',
      () => json({ returnCode: '0000', returnMessage: 'ok', info: {} })
    ],
    [
      'info a string',
      () => json({ returnCode: '0000', returnMessage: 'ok', info: 'none' })
    ],
    [
      'an entry that is null',
      () => json({ returnCode: '0000', returnMessage: 'ok', info: [null] })
    ],
    [
      'an entry that is a number',
      () => json({ returnCode: '0000', returnMessage: 'ok', info: [7] })
    ],
    [
      'an empty entry',
      () => json({ returnCode: '0000', returnMessage: 'ok', info: [{}] })
    ],
    [
      'an entry for the payment without payInfo',
      () => detailsResponse({ ...paymentInfo(), payInfo: undefined })
    ],
    [
      'payInfo that is not a list',
      () => details({ ...paymentInfo(), payInfo: 'x' })
    ],
    [
      'a refundList that is not a list',
      () => details({ ...paymentInfo(), refundList: 'x' })
    ]
  ]

  for (const operation of RECONCILABLE_OPERATIONS) {
    for (const [name, body] of bodies) {
      it(`${operation}: ${name}`, async () => {
        const { fetch } = scriptedFetch(body())
        const linePay = createLinePayClient({
          channelId: CHANNEL_ID,
          channelSecretKey: SECRET,
          env: 'sandbox',
          fetch,
          middleware: []
        })
        const context = {
          operation,
          startedAt: new Date(Date.now() - 1000),
          ...contexts[operation]
        }

        // It must answer, not throw: an error would replace the one of the call.
        const result = await linePay.reconcile(context)

        expect(wellFormed(result)).toBe(true)
        // Details that cannot be read must never be taken for "nothing there".
        if (operation === 'refund') {
          expect(result.status).not.toBe('not-applied')
        }
      })
    }
  }

  it.each([1, 2, 3, 4, 5, 6, 7, 8])(
    'survives randomly damaged entries (seed %i)',
    async seed => {
      const random = prng(seed)
      for (let round = 0; round < 60; round++) {
        for (const operation of RECONCILABLE_OPERATIONS) {
          const entries = Array.from(
            { length: Math.floor(random() * 4) },
            () => (random() < 0.7 ? damaged(random) : junk(random))
          )
          const { fetch } = scriptedFetch(
            json({ returnCode: '0000', returnMessage: 'ok', info: entries })
          )
          const linePay = createLinePayClient({
            channelId: CHANNEL_ID,
            channelSecretKey: SECRET,
            env: 'sandbox',
            fetch,
            middleware: []
          })

          const result = await linePay
            .reconcile({
              operation,
              startedAt: new Date(Date.now() - 1000),
              ...contexts[operation]
            })
            .catch((error: unknown) => {
              throw new Error(
                `${JSON.stringify({ seed, round, operation, entries })}: ${messageOf(error)}`,
                { cause: error }
              )
            })

          expect(wellFormed(result)).toBe(true)
        }
      }
    }
  )
})

describe('reconcile against a payment that lacks something the rules read', () => {
  // Normal V4 payments may omit payStatus. Identity, amount and currency
  // fields are still required before the rules can draw any conclusion.
  const lacking: [string, Partial<PaymentDetailsInfo>][] = [
    ['has an empty transactionId', { transactionId: '' }],
    ['has no orderId', { orderId: undefined }],
    ['has no currency', { currency: undefined }],
    ['has no payInfo', { payInfo: undefined }]
  ]

  for (const operation of RECONCILABLE_OPERATIONS) {
    it.each(lacking)(
      `${operation}: a payment that %s`,
      async (_name, patch) => {
        const { fetch } = scriptedFetch(
          detailsResponse(paymentInfo({ orderId: 'order-1', ...patch }))
        )
        const linePay = createLinePayClient({
          channelId: CHANNEL_ID,
          channelSecretKey: SECRET,
          env: 'sandbox',
          fetch,
          middleware: []
        })

        const result = await linePay.reconcile({
          operation,
          startedAt: new Date(Date.now() - 1000),
          channelId: CHANNEL_ID,
          ...contexts[operation]
        })

        expect(result.status).toBe('indeterminate')
        expect('reason' in result ? result.reason : '').toMatch(
          /not in the shape the API promises/
        )
      }
    )
  }
})
