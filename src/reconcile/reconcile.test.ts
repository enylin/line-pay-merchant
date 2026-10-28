import { describe, expect, it } from 'vitest'

import { createLinePayClient } from '../client'
import type { ReconcileResult } from '../client-types'
import {
  isLinePayApiError,
  LinePayApiError,
  LinePayHttpError,
  LinePayNetworkError,
  LinePayTimeoutError,
  LinePayValidationError,
  needsReconcile,
  type ReconcileContext
} from '../errors'
import type { ReconcilableOperation } from '../operations/names'
import { at } from '../test/at'
import {
  CHANNEL_ID,
  detailsResponse,
  expectValidSignature,
  failure,
  fetchFailed,
  json,
  paymentInfo,
  raw,
  scriptedFetch,
  SECRET,
  type Step,
  TX
} from '../test/helpers'

const config = {
  channelId: CHANNEL_ID,
  channelSecretKey: SECRET,
  env: 'sandbox'
} as const

const START = new Date('2026-10-27T00:00:00Z')
const OTHER_TX = '2021121300698360999'
const REFUND_TX = '2021121300698360311'

function clientWith(...steps: Step[]) {
  const { fetch, calls } = scriptedFetch(...steps)
  const client = createLinePayClient({ ...config, fetch, middleware: [] })
  return { client, calls }
}

/** A call that timed out, with the facts the client would have attached (the channel too). */
function lost(
  context: Omit<ReconcileContext, 'startedAt'> & { startedAt?: Date }
): LinePayTimeoutError {
  const error = new LinePayTimeoutError({
    timeoutMs: 1000,
    operation: context.operation
  })
  error.context = { startedAt: START, channelId: CHANNEL_ID, ...context }
  return error
}

/** The answers that call a call a duplicate: the first one may well have gone through. */
const DUPLICATE_CODES = ['1152', '1165', '1172', '1198']

const confirmed = lost({
  operation: 'confirm',
  transactionId: TX,
  amount: 1000,
  currency: 'TWD'
})

function expectStatus<S extends ReconcileResult['status']>(
  result: ReconcileResult,
  status: S
): Extract<ReconcileResult, { status: S }> {
  if (!hasStatus(result, status)) {
    throw new Error(`expected ${status}, got ${JSON.stringify(result)}`)
  }
  return result
}

function hasStatus<S extends ReconcileResult['status']>(
  result: ReconcileResult,
  status: S
): result is Extract<ReconcileResult, { status: S }> {
  return result.status === status
}

function lookupOf(call: { url: string }) {
  const url = new URL(call.url)
  return url.pathname + url.search
}

describe('client.reconcile: nothing to look up', () => {
  it('answers indeterminate for anything that is not an error of this client', async () => {
    const { client, calls } = clientWith()
    const properties = {
      operation: 'confirm',
      startedAt: START,
      channelId: CHANNEL_ID,
      transactionId: TX,
      amount: 1000,
      currency: 'TWD'
    }
    for (const value of [
      new Error('plain'),
      'boom',
      undefined,
      null,
      { context: { operation: 'confirm' } },
      new LinePayTimeoutError({ timeoutMs: 1000 }), // a library error that carries no context
      // The properties of a context do not make a context of a function or a list.
      Object.assign(() => 1, properties),
      Object.assign([], properties)
    ]) {
      const result = expectStatus(
        await client.reconcile(value),
        'indeterminate'
      )
      expect(result.operation).toBeUndefined()
      expect(result.reason).toMatch(/nothing to look up/)
    }
    expect(calls).toHaveLength(0)
  })

  it('names the operation when it cannot be reconciled', async () => {
    const { client, calls } = clientWith()
    for (const operation of [
      'request',
      'paymentDetails',
      'checkPaymentStatus',
      'checkRegKey',
      'expireRegKey'
    ] as const) {
      const result = expectStatus(
        await client.reconcile(lost({ operation })),
        'indeterminate'
      )
      expect(result.operation).toBe(operation)
      expect(result.reason).toBe(`Reconcile is not supported for ${operation}.`)
    }
    expect(calls).toHaveLength(0)
  })

  it('does not look up a transaction ID that is missing or malformed', async () => {
    const { client, calls } = clientWith()
    for (const transactionId of [
      undefined,
      '',
      'abc',
      '../x',
      '1'.repeat(20)
    ]) {
      const result = expectStatus(
        await client.reconcile(
          lost({
            operation: 'confirm',
            ...(transactionId === undefined ? {} : { transactionId })
          })
        ),
        'indeterminate'
      )
      expect(result.reason).toBe(
        'The context carries no transactionId to look up.'
      )
    }
    const noOrder = await client.reconcile(
      lost({ operation: 'payPreapproved' })
    )
    expect(noOrder).toMatchObject({
      status: 'indeterminate',
      operation: 'payPreapproved',
      reason: 'The context carries no orderId to look up.'
    })
    expect(calls).toHaveLength(0)
  })
})

describe('client.reconcile: a context that was saved', () => {
  // The process may die between sending confirm and getting the answer. Then
  // there is no error, only what was written down before the call.
  const saved = {
    operation: 'confirm',
    startedAt: START,
    transactionId: TX,
    amount: 1000,
    currency: 'TWD'
  } as const

  it('looks the call up like an error would', async () => {
    const { client, calls } = clientWith(detailsResponse(paymentInfo()))

    const result = expectStatus(await client.reconcile(saved), 'applied')

    expect(result.operation).toBe('confirm')
    expect(lookupOf(at(calls, 0))).toBe(`/v4/payments?transactionId=${TX}`)
  })

  it('works for a refund, within the window since it began', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          refundList: [
            {
              refundTransactionId: REFUND_TX,
              transactionType: 'PARTIAL_REFUND',
              refundAmount: 20,
              refundTransactionDate: '2026-10-27T00:00:30Z'
            }
          ]
        })
      )
    )
    const context = {
      operation: 'refund',
      startedAt: START,
      transactionId: TX,
      refundAmount: 20
    } as const

    expectStatus(await client.reconcile(context), 'applied')
  })

  it('does not take it for an error: nothing proves it was or was not sent', async () => {
    // Unlike an error with outcome not-sent, a context says nothing about how
    // the call went, so the payment details decide.
    const { client, calls } = clientWith(detailsResponse())

    expectStatus(
      await client.reconcile({ ...saved, channelId: CHANNEL_ID }),
      'not-applied'
    )

    expect(calls).toHaveLength(1)
  })

  it.each([
    ['outcome: not-sent', { outcome: 'not-sent' }],
    ['outcome: rejected', { outcome: 'rejected' }]
  ])(
    'is not an error because it says %s: only a brand makes an error',
    async (_name, forged) => {
      // A record from a database cannot talk its way out of the lookup.
      const { client, calls } = clientWith(detailsResponse(paymentInfo()))

      const result = await client.reconcile({ ...saved, ...forged })

      expect(result.status).toBe('applied')
      expect(calls).toHaveLength(1)
    }
  )

  it('does not take a record for a duplicate answer because it says so', async () => {
    const { client, calls } = clientWith(
      detailsResponse(
        paymentInfo({
          refundList: [
            {
              refundTransactionId: REFUND_TX,
              transactionType: 'PARTIAL_REFUND',
              refundAmount: 20,
              refundTransactionDate: '2026-10-27T00:00:30Z'
            }
          ]
        })
      )
    )

    const result = await client.reconcile({
      operation: 'refund',
      startedAt: START,
      transactionId: TX,
      refundAmount: 20,
      category: 'duplicate'
    })

    expect(result.status).toBe('applied')
    expect(calls).toHaveLength(1)
  })

  it('takes identifiers of one character', async () => {
    const { client, calls } = clientWith(detailsResponse())

    const result = await client.reconcile({
      operation: 'payPreapproved',
      startedAt: START,
      orderId: 'x',
      amount: 1,
      currency: 'TWD',
      channelId: 'c'
    })

    // The channel is another one, and it was read: it is not "no channel".
    const refused = expectStatus(result, 'indeterminate')
    expect(refused.reason).toContain('channel c')
    expect(calls).toHaveLength(0)
    const looked = clientWith(detailsResponse())
    await looked.client.reconcile({
      operation: 'payPreapproved',
      startedAt: START,
      orderId: 'x',
      amount: 1,
      currency: 'TWD',
      channelId: CHANNEL_ID
    })
    expect(lookupOf(at(looked.calls, 0))).toBe('/v4/payments?orderId=x')
  })

  it('does not call it not-applied when it does not say which channel it is of', async () => {
    // With the credentials of another channel the payment would not be found
    // either: "not there" says nothing about the call.
    const { client } = clientWith(detailsResponse(), detailsResponse())

    const confirm = expectStatus(await client.reconcile(saved), 'indeterminate')
    const preapproved = expectStatus(
      await client.reconcile({
        operation: 'payPreapproved',
        startedAt: START,
        orderId: 'order-1',
        amount: 1000,
        currency: 'TWD'
      }),
      'indeterminate'
    )

    expect(confirm.reason).toMatch(/Save channelId with the context/)
    expect(preapproved.reason).toMatch(/Save channelId with the context/)
  })

  it('still finds a payment without it: a payment that is there needs no channel to be believed', async () => {
    const { client } = clientWith(detailsResponse(paymentInfo()))

    expectStatus(await client.reconcile(saved), 'applied')
  })

  it('takes what comes back from JSON: an ISO string with a time zone, or milliseconds', async () => {
    // A context written to a database or a queue is a string or a number when
    // it is read again.
    for (const startedAt of [
      START.toISOString(),
      '2026-10-27T08:00:00+08:00',
      START.getTime()
    ]) {
      const { client } = clientWith(detailsResponse(paymentInfo()))
      expectStatus(await client.reconcile({ ...saved, startedAt }), 'applied')
    }
  })

  it('asks for a startedAt it can trust', async () => {
    const { client, calls } = clientWith()
    for (const startedAt of [
      undefined,
      null,
      '2026-10-27T00:00:00', // no time zone: read in the zone of the process
      'yesterday',
      new Date(NaN),
      NaN,
      {}
    ]) {
      const result = expectStatus(
        await client.reconcile({ ...saved, startedAt }),
        'indeterminate'
      )
      expect(result.reason).toMatch(/^The context needs startedAt: a Date/)
    }
    expect(calls).toHaveLength(0)
  })

  it('refuses an operation it cannot look up, and an identifier it cannot use', async () => {
    const { client, calls } = clientWith()

    expect(
      await client.reconcile({ operation: 'request', startedAt: START })
    ).toMatchObject({ status: 'indeterminate', operation: 'request' })
    expect(
      await client.reconcile({ ...saved, transactionId: '1/../2' })
    ).toMatchObject({
      status: 'indeterminate',
      reason: 'The context carries no transactionId to look up.'
    })
    const nonsense = await client.reconcile({
      operation: 'nonsense',
      startedAt: START
    })
    expect(nonsense).toMatchObject({
      status: 'indeterminate',
      reason: 'Reconcile is not supported for nonsense.'
    })
    // It names an operation only when it is one.
    expect(nonsense).not.toHaveProperty('operation')
    expect(calls).toHaveLength(0)
  })
})

describe('client.reconcile: a context that cannot be trusted', () => {
  // A context comes out of a database: a field of the wrong type must not turn
  // "found nothing" into "did not happen".
  const confirming = {
    operation: 'confirm',
    startedAt: START,
    transactionId: TX,
    amount: 1000,
    currency: 'TWD'
  } as const

  it.each([
    [
      'an amount that is a string',
      { amount: '1000' },
      "The context's amount must be a finite number."
    ],
    [
      'an amount that is NaN',
      { amount: Number.NaN },
      "The context's amount must be a finite number."
    ],
    [
      'no amount',
      { amount: undefined },
      'The context carries no amount to compare with.'
    ],
    [
      'no currency',
      { currency: undefined },
      'The context carries no currency to compare with.'
    ],
    [
      'a currency that is a number',
      { currency: 840 },
      "The context's currency must be a non-empty string."
    ],
    [
      'an empty currency',
      { currency: '' },
      "The context's currency must be a non-empty string."
    ],
    [
      'a channel that is a number',
      { channelId: 1234567890 },
      "The context's channelId must be a non-empty string."
    ]
  ])('says what is wrong with %s', async (_name, patch, reason) => {
    const { client, calls } = clientWith()

    const result = await client.reconcile({ ...confirming, ...patch })

    expect(result).toMatchObject({ status: 'indeterminate', reason })
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['an amount that is a string', { amount: '1000' }],
    ['an amount that is NaN', { amount: Number.NaN }],
    ['an amount that is infinite', { amount: Number.POSITIVE_INFINITY }],
    ['no amount', { amount: undefined }],
    ['no currency', { currency: undefined }],
    ['a currency that is a number', { currency: 840 }],
    ['an empty currency', { currency: '' }],
    ['a transactionId that is a number', { transactionId: 2021121300698360 }]
  ])('does not look up a confirm with %s', async (_name, patch) => {
    const { client, calls } = clientWith(detailsResponse(paymentInfo()))
    const result = await client.reconcile({ ...confirming, ...patch })
    expect(result.status).toBe('indeterminate')
    expect(calls).toHaveLength(0)
  })

  it.each([
    ['an order ID that is a number', { orderId: 12345 }],
    ['an empty order ID', { orderId: '' }],
    ['no amount', { amount: undefined }],
    ['no currency', { currency: undefined }]
  ])('does not look up a payPreapproved with %s', async (_name, patch) => {
    const { client, calls } = clientWith(detailsResponse())
    const result = await client.reconcile({
      operation: 'payPreapproved',
      startedAt: START,
      orderId: 'order-1',
      amount: 1000,
      currency: 'TWD',
      ...patch
    })
    // Not "no payment with this order ID": nothing was looked up.
    expect(result.status).toBe('indeterminate')
    expect(calls).toHaveLength(0)
  })

  it('reads only what the context itself carries, not what Object.prototype has gained', async () => {
    // Another part of the program polluted the prototype. A field the context does
    // not have must not be found there: the lookup would be of another payment.
    const { client, calls } = clientWith(detailsResponse(paymentInfo()))
    const { transactionId: _kept, ...withoutTransaction } = confirming
    const polluted = (name: string, value: unknown) => {
      Object.defineProperty(Object.prototype, name, {
        value,
        configurable: true,
        enumerable: false
      })
    }
    polluted('transactionId', OTHER_TX)
    try {
      const result = await client.reconcile(withoutTransaction)
      expect(result.status).toBe('indeterminate')
      expect(calls).toHaveLength(0)

      // And the error that carries its context the same way.
      const error = new LinePayTimeoutError({
        timeoutMs: 1000,
        operation: 'confirm'
      })
      error.context = { ...withoutTransaction }
      expect((await client.reconcile(error)).status).toBe('indeterminate')
      expect(calls).toHaveLength(0)
    } finally {
      Reflect.deleteProperty(Object.prototype, 'transactionId')
    }
  })

  it('does not look up a refund whose amount is not a number', async () => {
    const { client, calls } = clientWith(detailsResponse(paymentInfo()))
    const result = await client.reconcile({
      operation: 'refund',
      startedAt: START,
      transactionId: TX,
      refundAmount: '20'
    })
    expect(result.status).toBe('indeterminate')
    expect(calls).toHaveLength(0)
  })

  it('does not take a number of seconds for a number of milliseconds', async () => {
    const { client, calls } = clientWith(detailsResponse())
    const result = expectStatus(
      await client.reconcile({
        operation: 'refund',
        startedAt: START.getTime() / 1000,
        transactionId: TX,
        refundAmount: 20
      }),
      'indeterminate'
    )
    expect(result.reason).toMatch(/seconds is not milliseconds/)
    expect(calls).toHaveLength(0)
  })

  it('looks up a context of its own channel, and of none', async () => {
    for (const channelId of [CHANNEL_ID, undefined]) {
      const { client, calls } = clientWith(detailsResponse(paymentInfo()))
      expectStatus(
        await client.reconcile({ ...confirming, channelId }),
        'applied'
      )
      expect(calls).toHaveLength(1)
    }
  })

  it('refuses a context of another channel: other credentials would see nothing', async () => {
    const { client, calls } = clientWith(detailsResponse())
    const result = expectStatus(
      await client.reconcile({ ...confirming, channelId: '999' }),
      'indeterminate'
    )
    expect(result.reason).toContain('999')
    expect(result.reason).toContain(CHANNEL_ID)
    expect(calls).toHaveLength(0)
  })

  it('puts the channel on the context of every error', async () => {
    const { client } = clientWith(fetchFailed('ECONNRESET'))
    const error = await failure(
      client.confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
    )
    expect(error.context?.channelId).toBe(CHANNEL_ID)
  })

  it('answers not-applied to a call refused before it left, without a context', async () => {
    // Bad call options are refused before the call exists, so the error has no
    // context. It is still known that nothing was sent.
    const { client, calls } = clientWith()
    const error = await failure(
      client.confirm(
        { transactionId: TX, amount: 1000, currency: 'TWD' },
        { timeout: -5 }
      )
    )
    expect(error.context).toBeUndefined()

    expect(await client.reconcile(error)).toMatchObject({
      status: 'not-applied',
      operation: 'confirm'
    })
    expect(calls).toHaveLength(0)
  })
})

describe('client.reconcile: errors that already settle it', () => {
  const operations: ReconcilableOperation[] = [
    'confirm',
    'capture',
    'void',
    'refund',
    'payPreapproved'
  ]

  it('says not-applied when the request was never sent, for every operation', async () => {
    const { client, calls } = clientWith()
    for (const operation of operations) {
      const error = new LinePayNetworkError({
        reason: 'connection-refused',
        outcome: 'not-sent'
      })
      error.context = { operation, startedAt: START }
      // Includes refund: the transport proves nothing was sent, which is not an
      // absence of evidence in the payment details.
      expect(await client.reconcile(error)).toEqual({
        status: 'not-applied',
        operation,
        reason: 'The request was never sent, so it did not take effect.'
      })
    }
    expect(calls).toHaveLength(0)
  })

  it('does not call a call that is not reconcilable not-applied, though it was never sent', async () => {
    const { client, calls } = clientWith()
    const error = new LinePayNetworkError({
      reason: 'connection-refused',
      outcome: 'not-sent',
      operation: 'request'
    })
    error.context = { operation: 'request', startedAt: START }

    const result = await client.reconcile(error)

    expect(result).toMatchObject({
      status: 'indeterminate',
      operation: 'request',
      reason: 'Reconcile is not supported for request.'
    })
    expect(calls).toHaveLength(0)
  })

  it('says not-applied when LINE Pay refused the call', async () => {
    const { client, calls } = clientWith()

    const api = new LinePayApiError({
      body: { returnCode: '1106', returnMessage: 'header error' },
      httpStatus: 200
    })
    api.context = { operation: 'confirm', startedAt: START, transactionId: TX }

    const http = new LinePayHttpError({
      httpStatus: 403,
      reason: 'http-status',
      outcome: 'rejected'
    })
    http.context = { operation: 'refund', startedAt: START, transactionId: TX }

    const validation = new LinePayValidationError({ issues: [] })
    validation.context = { operation: 'void', startedAt: START }

    expect(await client.reconcile(api)).toEqual({
      status: 'not-applied',
      operation: 'confirm',
      reason:
        'LINE Pay refused the call (returnCode 1106), so it did not take effect.'
    })
    expect(await client.reconcile(http)).toEqual({
      status: 'not-applied',
      operation: 'refund',
      reason: 'LINE Pay refused the call (HTTP 403), so it did not take effect.'
    })
    // Never sent, so it needs no lookup even with a bad identifier.
    expect(
      expectStatus(await client.reconcile(validation), 'not-applied')
    ).toMatchObject({ operation: 'void' })
    expect(calls).toHaveLength(0)
  })

  it('still looks up a duplicate answer', async () => {
    for (const returnCode of DUPLICATE_CODES) {
      const { client, calls } = clientWith(detailsResponse(paymentInfo()))
      const error = new LinePayApiError({
        body: { returnCode, returnMessage: 'duplicate' },
        httpStatus: 200
      })
      const { context } = confirmed
      if (context === undefined) expect.unreachable('a lost call has a context')
      error.context = { ...context }

      expectStatus(await client.reconcile(error), 'applied')
      expect(calls).toHaveLength(1)
    }
  })
})

// LINE Pay answering with an internal error, or "in progress", did not say no. A
// refund that got 9000 may well have been booked: it must be looked up, and it
// must never be reported as "did not happen".
describe('client.reconcile: an answer that is not a refusal', () => {
  const codes = [
    '1145',
    '1179',
    '1199',
    '1280',
    '1999',
    '2042',
    '9000',
    '1900',
    '1909'
  ]

  it.each(codes)('looks up a refund that got %s', async code => {
    const { client, calls } = clientWith(
      json({ returnCode: code, returnMessage: 'could not finish' }),
      detailsResponse(paymentInfo({ refundList: [] }))
    )

    const error = await failure(
      client.refund({ transactionId: TX, refundAmount: 100 })
    )
    if (!isLinePayApiError(error)) throw error
    expect(error).toMatchObject({
      outcome: 'unknown',
      category: 'unresolved',
      returnCode: code
    })
    expect(needsReconcile(error)).toBe(true)

    const result = await client.reconcile(error)

    expect(result.status).toBe('indeterminate')
    expect(calls).toHaveLength(2)
    expect(lookupOf(at(calls, 1))).toBe(`/v4/payments?transactionId=${TX}`)
  })

  it('finds the refund when it was booked after all', async () => {
    const later = new Date(Date.now() + 5000).toISOString()
    const { client } = clientWith(
      json({ returnCode: '9000', returnMessage: 'internal error' }),
      detailsResponse(
        paymentInfo({
          refundList: [
            {
              refundTransactionId: REFUND_TX,
              transactionType: 'PARTIAL_REFUND',
              refundAmount: -100,
              refundTransactionDate: later
            }
          ]
        })
      )
    )
    const error = await client
      .refund({ transactionId: TX, refundAmount: 100 })
      .catch((e: unknown) => e)

    expectStatus(await client.reconcile(error), 'applied')
  })

  it.each(codes)(
    'finds a confirm that got %s in the payment details',
    async code => {
      const { client } = clientWith(
        json({ returnCode: code, returnMessage: 'could not finish' }),
        detailsResponse(paymentInfo())
      )
      const error = await client
        .confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
        .catch((e: unknown) => e)

      expectStatus(await client.reconcile(error), 'applied')
    }
  )

  it('still takes an ordinary refusal for a refusal', async () => {
    const { client, calls } = clientWith(
      json({ returnCode: '1142', returnMessage: 'insufficient balance' })
    )
    const error = await client
      .confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
      .catch((e: unknown) => e)

    expect(error).toMatchObject({ outcome: 'rejected' })
    expect(needsReconcile(error)).toBe(false)
    expectStatus(await client.reconcile(error), 'not-applied')
    expect(calls).toHaveLength(1)
  })
})

describe('client.reconcile: a refund that LINE Pay refused as a duplicate', () => {
  // Two refunds of the same amount made at once: LINE Pay makes the first and
  // answers the second with 1198. Finding the first refund must not make the
  // second one "applied", or one refund is counted twice.
  it.each(DUPLICATE_CODES)(
    'is indeterminate for %s, without a lookup',
    async code => {
      const { client, calls } = clientWith(
        json({ returnCode: code, returnMessage: 'duplicate' }),
        detailsResponse(
          paymentInfo({
            refundList: [
              {
                refundTransactionId: REFUND_TX,
                transactionType: 'PARTIAL_REFUND',
                refundAmount: -100,
                refundTransactionDate: new Date(Date.now() + 5000).toISOString()
              }
            ]
          })
        )
      )
      const error = await client
        .refund({ transactionId: TX, refundAmount: 100 })
        .catch((e: unknown) => e)
      expect(needsReconcile(error)).toBe(true)

      const result = expectStatus(
        await client.reconcile(error),
        'indeterminate'
      )

      expect(result.reason).toMatch(/duplicate/)
      expect(calls).toHaveLength(1)
    }
  )
})

describe('client.reconcile: how it looks the call up', () => {
  it('asks the payment details with a signed GET', async () => {
    const { client, calls } = clientWith(detailsResponse(paymentInfo()))

    await client.reconcile(confirmed)

    expect(calls).toHaveLength(1)
    const call = at(calls, 0)
    expect(call.method).toBe('GET')
    expect(lookupOf(call)).toBe(`/v4/payments?transactionId=${TX}`)
    expectValidSignature(call)
  })

  it('passes the call options on to the lookup', async () => {
    const { client, calls } = clientWith(detailsResponse(paymentInfo()))

    const result = expectStatus(
      await client.reconcile(confirmed, { signal: AbortSignal.abort() }),
      'indeterminate'
    )

    // An aborted signal stops the lookup before anything is sent.
    expect(calls).toHaveLength(0)
    expect(result.reason).toBe(
      'The payment details could not be read (LINE_PAY_ABORT_ERROR).'
    )
  })

  it('goes through the middleware of the client', async () => {
    const { fetch } = scriptedFetch(detailsResponse(paymentInfo()))
    const seen: string[] = []
    const client = createLinePayClient({
      ...config,
      fetch,
      middleware: [
        (ctx, next) => {
          seen.push(ctx.operation)
          return next()
        }
      ]
    })

    await client.reconcile(confirmed)

    expect(seen).toEqual(['paymentDetails'])
  })

  it('does not hide a bug of the caller behind indeterminate', async () => {
    const boom = new Error('a middleware broke')
    const { fetch } = scriptedFetch(detailsResponse(paymentInfo()))
    const client = createLinePayClient({
      ...config,
      fetch,
      middleware: [() => Promise.reject(boom)]
    })

    await expect(client.reconcile(confirmed)).rejects.toBe(boom)
  })

  it('leaves the error it was given untouched', async () => {
    const { client } = clientWith(detailsResponse())
    const before = JSON.stringify(confirmed.context)

    await client.reconcile(confirmed)

    expect(JSON.stringify(confirmed.context)).toBe(before)
    expect(confirmed.reconcileConclusion).toBeUndefined()
  })

  it('gives up with indeterminate when the lookup itself fails', async () => {
    const cases: [Step, string][] = [
      [fetchFailed('ECONNRESET'), 'LINE_PAY_NETWORK_ERROR'],
      [raw('<html>bad gateway</html>', 502), 'LINE_PAY_HTTP_ERROR'],
      [raw('not json'), 'LINE_PAY_HTTP_ERROR'],
      [
        json({ returnCode: '1104', returnMessage: 'no such channel' }),
        'LINE_PAY_API_ERROR'
      ]
    ]
    for (const [step, code] of cases) {
      const { client } = clientWith(step)
      const result = expectStatus(
        await client.reconcile(confirmed),
        'indeterminate'
      )
      expect(result.reason).toBe(
        `The payment details could not be read (${code}).`
      )
    }
  })

  it('reads "no such transaction" (1150) as an empty answer, not a failure', async () => {
    const { client } = clientWith(
      json({ returnCode: '1150', returnMessage: 'not found' })
    )
    expectStatus(await client.reconcile(confirmed), 'not-applied')
  })
})

describe('reconcile confirm', () => {
  it('is applied when the payment is captured for the amount that was asked', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          packages: [{ id: 'p1', amount: 1000 }],
          payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }]
        })
      )
    )

    const result = expectStatus(await client.reconcile(confirmed), 'applied')

    expect(result.operation).toBe('confirm')
    expect(result.body).toEqual({
      returnCode: '0000',
      returnMessage: 'Recovered from the payment details by reconcile',
      info: {
        orderId: 'order-1',
        transactionId: TX,
        payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }],
        packages: [{ id: 'p1', amount: 1000 }]
      }
    })
  })

  it('keeps 19-digit IDs exact', async () => {
    const { client } = clientWith(
      detailsResponse(paymentInfo({ transactionId: '2021121300698360311' }))
    )
    const error = lost({
      operation: 'confirm',
      transactionId: '2021121300698360311',
      amount: 1000,
      currency: 'TWD'
    })

    const result = expectStatus(await client.reconcile(error), 'applied')

    // 2021121300698360311 is not representable as a double.
    expect(
      result.operation === 'confirm' && result.body.info.transactionId
    ).toBe('2021121300698360311')
  })

  it('is applied for an authorization, and carries when it expires', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          payStatus: 'AUTHORIZATION',
          authorizationExpireDate: '2026-11-03T00:00:10Z'
        })
      )
    )

    const result = expectStatus(await client.reconcile(confirmed), 'applied')

    expect(result.body).toMatchObject({
      info: { authorizationExpireDate: '2026-11-03T00:00:10Z' }
    })
  })

  it('says that an authorization is not a capture, which a default confirm leaves', async () => {
    // The context cannot say whether the request asked to capture. A payment that
    // is only held and is never captured expires: the caller is told to look.
    const authorized = clientWith(
      detailsResponse(paymentInfo({ payStatus: 'AUTHORIZATION' }))
    )
    const captured = clientWith(detailsResponse(paymentInfo()))

    const held = expectStatus(
      await authorized.client.reconcile(confirmed),
      'applied'
    )
    const paid = expectStatus(
      await captured.client.reconcile(confirmed),
      'applied'
    )

    expect(held.notes).toHaveLength(2)
    expect(held.notes[1]).toMatch(/authorized, not captured/)
    expect(held.notes[1]).toMatch(/expires/)
    expect(paid.notes).toHaveLength(1)
  })

  it('hands over shipping and payment provider when the payment has them', async () => {
    const shipping = { methodId: 's1', feeAmount: 0 }
    const paymentProvider = 'TSP'
    const { client } = clientWith(
      detailsResponse(paymentInfo({ shipping, paymentProvider }))
    )

    const result = expectStatus(await client.reconcile(confirmed), 'applied')

    expect(result.body).toMatchObject({ info: { shipping, paymentProvider } })
  })

  it('is indeterminate when several entries carry the transaction ID', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo(),
        paymentInfo({ payStatus: 'AUTHORIZATION' })
      )
    )

    const result = expectStatus(
      await client.reconcile(confirmed),
      'indeterminate'
    )

    expect(result.reason).toBe('Several entries carry this transaction ID.')
  })

  it('hands over only what the payment has', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          packages: undefined,
          payInfo: [{ method: 'X', amount: 1000 }]
        })
      )
    )

    const result = expectStatus(await client.reconcile(confirmed), 'applied')

    expect(result.body).toStrictEqual({
      returnCode: '0000',
      returnMessage: 'Recovered from the payment details by reconcile',
      info: {
        orderId: 'order-1',
        transactionId: TX,
        payInfo: [{ method: 'X', amount: 1000 }],
        packages: []
      }
    })
  })

  it('always warns that the regKey cannot be recovered', async () => {
    const { client } = clientWith(detailsResponse(paymentInfo()))

    const result = expectStatus(await client.reconcile(confirmed), 'applied')

    expect(result.notes).toHaveLength(1)
    expect(result.notes[0]).toMatch(/regKey/)
    expect(result.notes[0]).toMatch(/PREAPPROVED/)
    expect(result.body).not.toHaveProperty('info.regKey')
  })

  it('adds up the payment methods: a discount is part of the amount', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          payInfo: [
            { method: 'CREDIT_CARD', amount: 900 },
            { method: 'DISCOUNT', amount: 100 }
          ]
        })
      )
    )
    expectStatus(await client.reconcile(confirmed), 'applied')
  })

  it('is not-applied when the payment is not in the details', async () => {
    const { client } = clientWith(detailsResponse())

    const result = expectStatus(
      await client.reconcile(confirmed),
      'not-applied'
    )

    expect(result.reason).toMatch(/not in the payment details/)
  })

  it('is indeterminate when the details hold only other transactions', async () => {
    // They are not the payment of the call, and they cannot show that there is
    // none: an ID that differs in a character, a lookup that returned too much.
    const { client } = clientWith(
      detailsResponse(paymentInfo({ transactionId: OTHER_TX }))
    )

    const result = expectStatus(
      await client.reconcile(confirmed),
      'indeterminate'
    )

    expect(result.reason).toMatch(/none of them is the payment of this call/)
  })

  it.each(DUPLICATE_CODES)(
    'is indeterminate when LINE Pay called the confirm a duplicate (%s) and the payment is not there',
    async code => {
      // What it duplicates exists. Not finding it is no proof that nothing
      // happened: it is a lookup that missed.
      const { client } = clientWith(
        json({ returnCode: code, returnMessage: 'duplicate' }),
        detailsResponse()
      )
      const error = await failure(
        client.confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
      )

      const result = expectStatus(
        await client.reconcile(error),
        'indeterminate'
      )

      expect(result.reason).toMatch(/duplicates another one/)
    }
  )

  it('is indeterminate when the payment exists but is not what confirm leaves', async () => {
    for (const payStatus of [
      'VOIDED_AUTHORIZATION',
      'EXPIRED_AUTHORIZATION',
      'SOMETHING_NEW'
    ]) {
      const { client } = clientWith(detailsResponse(paymentInfo({ payStatus })))
      const result = expectStatus(
        await client.reconcile(confirmed),
        'indeterminate'
      )
      expect(result.reason).toBe(
        `The payment was confirmed but is now ${payStatus}.`
      )
    }
  })

  it('is indeterminate when the amount or the currency differs', async () => {
    for (const info of [
      paymentInfo({ payInfo: [{ method: 'CREDIT_CARD', amount: 999 }] }),
      paymentInfo({ currency: 'USD' })
    ]) {
      const { client } = clientWith(detailsResponse(info))
      const result = expectStatus(
        await client.reconcile(confirmed),
        'indeterminate'
      )
      expect(result.reason).toMatch(/amount or currency differs/)
    }
  })

  it('is indeterminate when the transaction is a refund, not a payment', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          transactionType: 'PAYMENT_REFUND',
          originalTransactionId: OTHER_TX
        })
      )
    )
    const result = expectStatus(
      await client.reconcile(confirmed),
      'indeterminate'
    )
    expect(result.reason).toBe(
      'The transaction is a PAYMENT_REFUND, not a payment.'
    )
  })
})

describe('reconcile capture', () => {
  const capture = lost({
    operation: 'capture',
    transactionId: TX,
    amount: 1000,
    currency: 'TWD'
  })

  it('is applied when the authorization became a capture', async () => {
    const { client } = clientWith(detailsResponse(paymentInfo()))

    const result = expectStatus(await client.reconcile(capture), 'applied')

    expect(result.operation).toBe('capture')
    expect(result.body).toEqual({
      returnCode: '0000',
      returnMessage: 'Recovered from the payment details by reconcile',
      info: {
        orderId: 'order-1',
        transactionId: TX,
        payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }]
      }
    })
    expect(result.notes[0]).toMatch(/do not say who captured/)
  })

  it('is not-applied while the payment is still only authorized', async () => {
    const { client } = clientWith(
      detailsResponse(paymentInfo({ payStatus: 'AUTHORIZATION' }))
    )
    expect(
      expectStatus(await client.reconcile(capture), 'not-applied').reason
    ).toBe('The payment is still only authorized.')
  })

  it('is indeterminate for any other state', async () => {
    for (const payStatus of ['VOIDED_AUTHORIZATION', 'EXPIRED_AUTHORIZATION']) {
      const { client } = clientWith(detailsResponse(paymentInfo({ payStatus })))
      expect(
        expectStatus(await client.reconcile(capture), 'indeterminate').reason
      ).toBe(`The payment is ${payStatus}, so it cannot be captured.`)
    }
  })

  it('is indeterminate when the captured amount differs', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({ payInfo: [{ method: 'CREDIT_CARD', amount: 500 }] })
      )
    )
    expect(
      expectStatus(await client.reconcile(capture), 'indeterminate').reason
    ).toMatch(/differs from the capture call/)
  })

  it('is indeterminate when the payment cannot be found', async () => {
    const { client } = clientWith(detailsResponse())
    expect(
      expectStatus(await client.reconcile(capture), 'indeterminate').reason
    ).toBe('The payment is not in the payment details.')
  })
})

describe('reconcile void', () => {
  const voided = lost({ operation: 'void', transactionId: TX })

  it('is applied when the authorization was voided', async () => {
    const { client } = clientWith(
      detailsResponse(paymentInfo({ payStatus: 'VOIDED_AUTHORIZATION' }))
    )
    const result = expectStatus(await client.reconcile(voided), 'applied')
    expect(result.body).toEqual({
      returnCode: '0000',
      returnMessage: 'Recovered from the payment details by reconcile'
    })
  })

  it('is not-applied while the authorization is open, captured or expired', async () => {
    const reasons: Record<string, string> = {
      AUTHORIZATION: 'The authorization is still open.',
      CAPTURE: 'The payment was captured, so it cannot have been voided.',
      EXPIRED_AUTHORIZATION: 'The authorization expired; it was not voided.'
    }
    for (const [payStatus, reason] of Object.entries(reasons)) {
      const { client } = clientWith(detailsResponse(paymentInfo({ payStatus })))
      expect(
        expectStatus(await client.reconcile(voided), 'not-applied').reason
      ).toBe(reason)
    }
  })

  it('is indeterminate for an unknown state or a missing payment', async () => {
    const { client } = clientWith(
      detailsResponse(paymentInfo({ payStatus: 'SOMETHING_NEW' }))
    )
    expect(
      expectStatus(await client.reconcile(voided), 'indeterminate').reason
    ).toBe('The payment is SOMETHING_NEW.')

    const empty = clientWith(detailsResponse())
    expect(
      expectStatus(await empty.client.reconcile(voided), 'indeterminate').reason
    ).toBe('The payment is not in the payment details.')
  })
})

describe('reconcile payPreapproved', () => {
  const charged = lost({
    operation: 'payPreapproved',
    orderId: 'order-1',
    amount: 1000,
    currency: 'TWD'
  })

  it('looks the order up by its order ID, not by registration key', async () => {
    const { client, calls } = clientWith(detailsResponse(paymentInfo()))

    await client.reconcile(charged)

    expect(lookupOf(at(calls, 0))).toBe('/v4/payments?orderId=order-1')
    expect(at(calls, 0).url).not.toContain('RK9A2BA1937EQTO')
  })

  it('is applied when exactly one payment carries the order ID', async () => {
    const { client } = clientWith(detailsResponse(paymentInfo()))

    const result = expectStatus(await client.reconcile(charged), 'applied')

    expect(result.body).toEqual({
      returnCode: '0000',
      returnMessage: 'Recovered from the payment details by reconcile',
      info: {
        orderId: 'order-1',
        transactionId: TX,
        transactionDate: '2026-10-27T00:00:10Z'
      }
    })
  })

  it('carries the authorization expiry when there is one', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          payStatus: 'AUTHORIZATION',
          authorizationExpireDate: '2026-11-03T00:00:10Z'
        })
      )
    )
    const result = expectStatus(await client.reconcile(charged), 'applied')
    expect(result.body).toMatchObject({
      info: { authorizationExpireDate: '2026-11-03T00:00:10Z' }
    })
  })

  it('says that an authorization is not a capture, which a default payment leaves', async () => {
    const authorized = clientWith(
      detailsResponse(paymentInfo({ payStatus: 'AUTHORIZATION' }))
    )
    const captured = clientWith(detailsResponse(paymentInfo()))

    const held = expectStatus(
      await authorized.client.reconcile(charged),
      'applied'
    )
    const paid = expectStatus(
      await captured.client.reconcile(charged),
      'applied'
    )

    expect(held.notes).toHaveLength(1)
    expect(held.notes[0]).toMatch(/authorized, not captured/)
    expect(paid.notes).toEqual([])
  })

  it('ignores refunds and other orders in the answer', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          transactionId: REFUND_TX,
          transactionType: 'PAYMENT_REFUND'
        }),
        paymentInfo({ transactionId: OTHER_TX, orderId: 'order-2' }),
        paymentInfo()
      )
    )
    const result = expectStatus(await client.reconcile(charged), 'applied')
    expect(result.body).toMatchObject({ info: { transactionId: TX } })
  })

  it('does not take a voided or expired authorization for a charge', async () => {
    // A later call with the same order ID answers "duplicate", and the earlier
    // authorization is no longer a payment.
    for (const payStatus of ['VOIDED_AUTHORIZATION', 'EXPIRED_AUTHORIZATION']) {
      const { client } = clientWith(detailsResponse(paymentInfo({ payStatus })))
      expect(
        expectStatus(await client.reconcile(charged), 'indeterminate').reason
      ).toBe(`A payment with this order ID exists, but it is ${payStatus}.`)
    }
  })

  it('is indeterminate when the payment has no transaction date', async () => {
    const { client } = clientWith(
      detailsResponse(paymentInfo({ transactionDate: undefined }))
    )

    const result = expectStatus(
      await client.reconcile(charged),
      'indeterminate'
    )

    expect(result.reason).toBe(
      'A payment with this order ID exists, but it has no transaction date.'
    )
  })

  it('hands over only the order, the transaction and the date', async () => {
    const { client } = clientWith(detailsResponse(paymentInfo()))

    const result = expectStatus(await client.reconcile(charged), 'applied')

    expect(result.body).toStrictEqual({
      returnCode: '0000',
      returnMessage: 'Recovered from the payment details by reconcile',
      info: {
        orderId: 'order-1',
        transactionId: TX,
        transactionDate: '2026-10-27T00:00:10Z'
      }
    })
  })

  it('is not-applied when no payment carries the order ID', async () => {
    for (const step of [
      detailsResponse(),
      json({ returnCode: '1150', returnMessage: 'not found' })
    ]) {
      const { client } = clientWith(step)
      expect(
        expectStatus(await client.reconcile(charged), 'not-applied').reason
      ).toBe('No payment with this order ID exists.')
    }
  })

  it('is indeterminate when several payments carry the order ID', async () => {
    const { client } = clientWith(
      detailsResponse(paymentInfo(), paymentInfo({ transactionId: OTHER_TX }))
    )
    expect(
      expectStatus(await client.reconcile(charged), 'indeterminate').reason
    ).toBe('Several payments carry this order ID.')
  })

  it('is indeterminate when the amount or the currency differs', async () => {
    for (const info of [
      paymentInfo({ payInfo: [{ method: 'CREDIT_CARD', amount: 1 }] }),
      paymentInfo({ currency: 'THB' })
    ]) {
      const { client } = clientWith(detailsResponse(info))
      expect(
        expectStatus(await client.reconcile(charged), 'indeterminate').reason
      ).toMatch(/differs from the call/)
    }
  })
})

describe('reconcile payPreapproved: the time of the payment', () => {
  const charged = lost({
    operation: 'payPreapproved',
    orderId: 'order-1',
    amount: 1000,
    currency: 'TWD'
  })
  const dated = (transactionDate: string) =>
    detailsResponse(paymentInfo({ transactionDate }))

  // An order ID used before, and refused by LINE Pay as a duplicate, leads to a
  // payment that this call did not make.
  it('does not take a payment from before the call for this one', async () => {
    const { client } = clientWith(dated('2026-09-27T00:00:00Z'))
    const result = expectStatus(
      await client.reconcile(charged),
      'indeterminate'
    )
    expect(result.reason).toMatch(/not provably after the call began/)
  })

  it('never promotes a duplicate preapproved charge from an earlier matching order', async () => {
    const { client, calls } = clientWith(
      json({ returnCode: '1172', returnMessage: 'duplicate' }),
      detailsResponse(
        paymentInfo({
          transactionDate: new Date(Date.now() + 5000).toISOString()
        })
      )
    )
    const error = await failure(
      client.payPreapproved({
        regKey: 'RK9A2BA1937EQTO',
        productName: 'Tea',
        amount: 1000,
        currency: 'TWD',
        orderId: 'order-1'
      })
    )
    const result = expectStatus(await client.reconcile(error), 'indeterminate')
    expect(result.reason).toMatch(/duplicate/)
    expect(calls).toHaveLength(1)
  })

  it('does it with the duplicate answer that the reused ID gets', async () => {
    const { client } = clientWith(
      json({ returnCode: '1172', returnMessage: 'duplicate' }),
      dated('2026-09-27T00:00:00Z')
    )
    const error = await client
      .payPreapproved({
        regKey: 'RK9A2BA1937EQTO',
        productName: 'Tea',
        amount: 1000,
        currency: 'TWD',
        orderId: 'order-1'
      })
      .catch((e: unknown) => e)

    expectStatus(await client.reconcile(error), 'indeterminate')
  })

  it.each([
    ['a later second', '2026-10-27T00:00:20Z'],
    ['a time with an offset', '2026-10-27T08:00:10+08:00']
  ])('takes a payment of %s', async (_name, date) => {
    const { client } = clientWith(dated(date))
    expectStatus(await client.reconcile(charged), 'applied')
  })

  it.each([
    ['the same second as the call', '2026-10-27T00:00:00Z'],
    ['one second before', '2026-10-26T23:59:59Z'],
    ['without a time zone', '2026-10-27T00:00:10'],
    ['that is no date', 'soon']
  ])('does not take a payment dated %s', async (_name, date) => {
    const { client } = clientWith(dated(date))
    expectStatus(await client.reconcile(charged), 'indeterminate')
  })

  it('does not call it not-applied next to an entry it cannot read', async () => {
    // A kind of entry that carries the order ID but is not a payment or a
    // refund: whatever it is, "no payment found" would be a guess.
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({ transactionId: OTHER_TX, transactionType: 'PREAPPROVED' })
      )
    )
    const result = expectStatus(
      await client.reconcile(charged),
      'indeterminate'
    )
    expect(result.reason).toMatch(/PREAPPROVED/)
  })

  it('does not call it not-applied next to entries that are not its payment either', async () => {
    // A refund of the order without the payment it refunds, an entry of another
    // order: LINE Pay answered the lookup with something, and none of it is the
    // payment. "None was made" is then a guess.
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          transactionId: REFUND_TX,
          transactionType: 'PARTIAL_REFUND'
        }),
        paymentInfo({
          transactionId: OTHER_TX,
          orderId: 'order-2',
          transactionType: 'PREAPPROVED'
        })
      )
    )
    const result = expectStatus(
      await client.reconcile(charged),
      'indeterminate'
    )
    expect(result.reason).toMatch(/none of them is the payment of this call/)
  })

  it('does not take an order ID that differs in a character for its own', async () => {
    // LINE Pay may find "ORDER-1" for "order-1". If it is the payment of this
    // call it must not be passed over, and if it is not it must not be taken.
    for (const orderId of [
      'ORDER-1',
      'order-1 ',
      ' order-1',
      'order-1\u200b'
    ]) {
      const { client } = clientWith(detailsResponse(paymentInfo({ orderId })))
      expectStatus(await client.reconcile(charged), 'indeterminate')
    }
  })

  it.each(DUPLICATE_CODES)(
    'is indeterminate when LINE Pay called the call a duplicate (%s) and no payment is there',
    async code => {
      const { client } = clientWith(
        json({ returnCode: code, returnMessage: 'duplicate' }),
        detailsResponse()
      )
      const error = await failure(
        client.payPreapproved({
          regKey: 'RK9A2BA1937EQTO',
          productName: 'Tea',
          amount: 1000,
          currency: 'TWD',
          orderId: 'order-1'
        })
      )

      const result = expectStatus(
        await client.reconcile(error),
        'indeterminate'
      )

      expect(result.reason).toMatch(/duplicate/)
    }
  )
})

describe('reconcile refund', () => {
  const refunding = (
    context: Partial<ReconcileContext> = {}
  ): LinePayTimeoutError =>
    lost({
      operation: 'refund',
      transactionId: TX,
      refundAmount: 20,
      ...context
    })

  const refundEntry = (overrides: Record<string, unknown> = {}) => ({
    refundTransactionId: REFUND_TX,
    transactionType: 'PARTIAL_REFUND',
    refundAmount: 20,
    refundTransactionDate: '2026-10-27T00:00:30Z',
    ...overrides
  })

  it('can reconcile a refund when official-style payment details omit payStatus', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          payStatus: undefined,
          refundList: [refundEntry()]
        })
      )
    )
    expectStatus(await client.reconcile(refunding()), 'applied')
  })

  it('is applied when exactly one refund of that amount was made since the call began', async () => {
    const { client } = clientWith(
      detailsResponse(paymentInfo({ refundList: [refundEntry()] }))
    )

    const result = expectStatus(await client.reconcile(refunding()), 'applied')

    expect(result.operation).toBe('refund')
    expect(result.body).toEqual({
      returnCode: '0000',
      returnMessage: 'Recovered from the payment details by reconcile',
      info: {
        refundTransactionId: REFUND_TX,
        refundTransactionDate: '2026-10-27T00:00:30Z'
      }
    })
    expect(result.notes[0]).toMatch(
      /Matched by amount and a later whole second/
    )
  })

  it('takes the refund ID and date from the refund, not from the payment (0.9 bug A2)', async () => {
    // 0.9 answered a refund timeout with the original payment's IDs and
    // reported success.
    const { client } = clientWith(
      detailsResponse(paymentInfo({ refundList: [refundEntry()] }))
    )

    const result = expectStatus(await client.reconcile(refunding()), 'applied')

    expect(JSON.stringify(result.body)).not.toContain(TX)
    expect(JSON.stringify(result.body)).not.toContain('2026-10-27T00:00:10Z')
  })

  it('keeps 19-digit refund IDs exact', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({
          refundList: [
            refundEntry({ refundTransactionId: '2021121300698360311' })
          ]
        })
      )
    )
    const result = expectStatus(await client.reconcile(refunding()), 'applied')
    expect(result.body).toMatchObject({
      info: { refundTransactionId: '2021121300698360311' }
    })
  })

  it('compares absolute amounts: the sandbox reports a refund as negative', async () => {
    const { client } = clientWith(
      detailsResponse(
        paymentInfo({ refundList: [refundEntry({ refundAmount: -20 })] })
      )
    )
    expectStatus(await client.reconcile(refunding()), 'applied')
  })

  it('never concludes not-applied from the payment details (0.9 bug A2)', async () => {
    const wholly: [string, Step][] = [
      ['no refund list', detailsResponse(paymentInfo())],
      [
        'an empty refund list',
        detailsResponse(paymentInfo({ refundList: [] }))
      ],
      [
        'a refund of another amount',
        detailsResponse(
          paymentInfo({ refundList: [refundEntry({ refundAmount: 5 })] })
        )
      ],
      [
        'a refund from before the call',
        detailsResponse(
          paymentInfo({
            refundList: [
              refundEntry({ refundTransactionDate: '2026-10-26T00:00:00Z' })
            ]
          })
        )
      ],
      ['no such payment', detailsResponse()],
      [
        'an unknown transaction (1150)',
        json({ returnCode: '1150', returnMessage: 'x' })
      ],
      ['a lookup that failed', fetchFailed('ECONNRESET')]
    ]
    for (const [, step] of wholly) {
      const { client } = clientWith(step)
      expect(
        (await client.reconcile(refunding())).status,
        'a refund must never be reported as not applied from absence of evidence'
      ).toBe('indeterminate')
    }
  })

  it('explains why it cannot tell', async () => {
    const none = clientWith(detailsResponse(paymentInfo()))
    expect(
      expectStatus(await none.client.reconcile(refunding()), 'indeterminate')
        .reason
    ).toMatch(/may still be processing/)

    const several = clientWith(
      detailsResponse(
        paymentInfo({
          refundList: [
            refundEntry(),
            refundEntry({ refundTransactionId: '2021121300698360312' })
          ]
        })
      )
    )
    expect(
      expectStatus(await several.client.reconcile(refunding()), 'indeterminate')
        .reason
    ).toMatch(/Several refunds of this amount/)

    const missing = clientWith(detailsResponse())
    expect(
      expectStatus(await missing.client.reconcile(refunding()), 'indeterminate')
        .reason
    ).toBe('The payment is not in the payment details.')
  })

  describe('the time window', () => {
    const at = (offsetMs: number) =>
      new Date(START.getTime() + offsetMs).toISOString()

    const reconcileAt = async (refundTransactionDate: string) => {
      const { client } = clientWith(
        detailsResponse(
          paymentInfo({ refundList: [refundEntry({ refundTransactionDate })] })
        )
      )
      return (await client.reconcile(refunding())).status
    }

    it('does not take a refund made before the call began for this one', async () => {
      // An earlier refund of the same amount is somebody else's. If it were
      // taken for this call, a refund that never happened would be reported as
      // made, and the customer would not get the second payment back.
      expect(await reconcileAt(at(-1000))).toBe('indeterminate')
      expect(await reconcileAt(at(-60_000))).toBe('indeterminate')
    })

    it('compares by the second, because LINE Pay may report no fraction', async () => {
      // The call began 300 ms into the second; the refund is stamped with the
      // whole second it was made in.
      const startedAt = new Date(START.getTime() + 300)
      const run = async (refundTransactionDate: string) => {
        const { client } = clientWith(
          detailsResponse(
            paymentInfo({
              refundList: [refundEntry({ refundTransactionDate })]
            })
          )
        )
        return (await client.reconcile(refunding({ startedAt }))).status
      }

      expect(await run('2026-10-27T00:00:00Z')).toBe('indeterminate')
      expect(await run('2026-10-26T23:59:59Z')).toBe('indeterminate')
    })

    it('accepts a refund made after the call began', async () => {
      expect(await reconcileAt(at(0))).toBe('indeterminate')
      expect(await reconcileAt(at(10 * 60_000))).toBe('applied')
    })

    it('accepts timestamps with an offset', async () => {
      expect(await reconcileAt('2026-10-27T08:00:30+08:00')).toBe('applied')
      expect(await reconcileAt('2026-10-27T08:00:30+0800')).toBe('applied')
      expect(await reconcileAt('2026-10-27T07:58:00+08:00')).toBe(
        'indeterminate'
      )
    })

    it('does not trust a timestamp without a zone, or one that is not a date', async () => {
      // Read as local time, it would shift by the zone of the server.
      expect(await reconcileAt('2026-10-27T00:00:30')).toBe('indeterminate')
      expect(await reconcileAt('not a date')).toBe('indeterminate')
      expect(await reconcileAt('')).toBe('indeterminate')
    })
  })

  // An entry that the rule cannot read may be this call's refund. If it is left
  // out of the count, the refund that was found passes for "exactly one" when it
  // belongs to somebody else.
  describe('an entry it cannot read', () => {
    const other = (overrides: Record<string, unknown>) =>
      refundEntry({ refundTransactionId: OTHER_TX, ...overrides })

    it.each([
      ['a type it does not know', { transactionType: 'REFUND_REVERSAL' }],
      ['a payment', { transactionType: 'PAYMENT' }],
      [
        'a date without a time zone',
        { refundTransactionDate: '2026-10-27T00:00:30' }
      ],
      ['a date that is not one', { refundTransactionDate: 'not a date' }]
    ])(
      'is not left out of the count: %s, next to a refund that was found',
      async (_name, unreadable) => {
        const { client } = clientWith(
          detailsResponse(
            paymentInfo({ refundList: [refundEntry(), other(unreadable)] })
          )
        )

        const result = expectStatus(
          await client.reconcile(refunding()),
          'indeterminate'
        )

        expect(result.reason).toMatch(/cannot be read/)
      }
    )

    it('does not matter when it cannot be this refund: another amount', async () => {
      const { client } = clientWith(
        detailsResponse(
          paymentInfo({
            refundList: [
              refundEntry(),
              other({ transactionType: 'REFUND_REVERSAL', refundAmount: 7 }),
              other({ refundTransactionDate: 'not a date', refundAmount: 8 })
            ]
          })
        )
      )

      expectStatus(await client.reconcile(refunding()), 'applied')
    })

    it('counts for a full refund, where any entry may be it', async () => {
      const { client } = clientWith(
        detailsResponse(
          paymentInfo({
            refundList: [
              refundEntry({
                transactionType: 'PAYMENT_REFUND',
                refundAmount: 1000
              }),
              other({ transactionType: 'REFUND_REVERSAL', refundAmount: 7 })
            ]
          })
        )
      )
      const error = lost({ operation: 'refund', transactionId: TX })

      expectStatus(await client.reconcile(error), 'indeterminate')
    })

    it('does not make a refund of the right type and date wait for the unreadable one before the call', async () => {
      // The rule is not about the age of the unreadable entry: it cannot be read.
      const { client } = clientWith(
        detailsResponse(
          paymentInfo({
            refundList: [
              refundEntry(),
              other({ refundTransactionDate: '2020-01-01T00:00:00Z' })
            ]
          })
        )
      )

      expectStatus(await client.reconcile(refunding()), 'applied')
    })
  })

  describe('a full refund (no amount given)', () => {
    it('matches the PAYMENT_REFUND entry', async () => {
      const { client } = clientWith(
        detailsResponse(
          paymentInfo({
            refundList: [
              refundEntry({
                transactionType: 'PAYMENT_REFUND',
                refundAmount: 1000
              })
            ]
          })
        )
      )
      const error = lost({ operation: 'refund', transactionId: TX })
      expectStatus(await client.reconcile(error), 'applied')
    })

    it('does not take a partial refund for it', async () => {
      const { client } = clientWith(
        detailsResponse(paymentInfo({ refundList: [refundEntry()] }))
      )
      const error = lost({ operation: 'refund', transactionId: TX })
      expectStatus(await client.reconcile(error), 'indeterminate')
    })
  })
})
