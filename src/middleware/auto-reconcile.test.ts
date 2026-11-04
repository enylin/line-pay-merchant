import { inspect } from 'node:util'

import { describe, expect, it } from 'vitest'

import { createLinePayClient } from '../client'
import type { Middleware } from '../client-types'
import {
  isLinePayApiError,
  isLinePayNetworkError,
  LinePayTimeoutError
} from '../errors'
import { at } from '../test/at'
import {
  CHANNEL_ID,
  detailsResponse,
  failure,
  fetchFailed,
  json,
  paymentInfo,
  raw,
  type RecordedCall,
  scriptedFetch,
  SECRET,
  type Step,
  TX
} from '../test/helpers'
import { autoReconcile } from './auto-reconcile'
import { retryWhenNotSent } from './retry-when-not-sent'

const config = {
  channelId: CHANNEL_ID,
  channelSecretKey: SECRET,
  env: 'sandbox'
} as const

const confirmInput = {
  transactionId: TX,
  amount: 1000,
  currency: 'TWD'
} as const

function clientWith(middleware: Middleware[], ...steps: Step[]) {
  const { fetch, calls } = scriptedFetch(...steps)
  return {
    client: createLinePayClient({ ...config, fetch, middleware }),
    calls
  }
}

const describeCall = (call: RecordedCall) => {
  const url = new URL(call.url)
  return `${call.method} ${url.pathname}${url.search}`
}

/** A request that never answers; it ends when its signal fires. */
const hang: Step = call =>
  new Promise((_resolve, reject) => {
    call.signal?.addEventListener('abort', () => reject(call.signal?.reason), {
      once: true
    })
  })

describe('autoReconcile', () => {
  describe('when the payment went through', () => {
    it('returns the recovered result after a cut connection', async () => {
      const { client, calls } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET'),
        detailsResponse(paymentInfo())
      )

      const { body, meta } = await client.confirm(confirmInput)

      expect(body.info.transactionId).toBe(TX)
      expect(meta).toMatchObject({ operation: 'confirm', attempts: 1 })
      expect(meta.httpStatus).toBeUndefined()
      expect(meta.recovered).toMatchObject({ reason: 'unknown-outcome' })
      expect(meta.recovered?.notes[0]).toMatch(/regKey/)
      expect(describeCall(at(calls, 0))).toBe(`POST /v4/payments/${TX}/confirm`)
      expect(calls.map(describeCall)).toEqual([
        `POST /v4/payments/${TX}/confirm`,
        `GET /v4/payments?transactionId=${TX}`
      ])
    })

    it('keeps the error that made the recovery necessary in the audit trail', async () => {
      const { client } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET'),
        detailsResponse(paymentInfo())
      )

      const { meta } = await client.confirm(confirmInput)

      const cause = meta.recovered?.cause
      expect(isLinePayNetworkError(cause)).toBe(true)
      expect(cause?.outcome).toBe('unknown')
      expect(cause?.operation).toBe('confirm')
    })

    it('recovers a timeout, which is the common case', async () => {
      const { client, calls } = clientWith(
        [autoReconcile()],
        hang,
        detailsResponse(paymentInfo())
      )

      const { meta } = await client.confirm(confirmInput, { timeout: 20 })

      expect(meta.recovered?.cause.code).toBe('LINE_PAY_TIMEOUT_ERROR')
      expect(calls).toHaveLength(2)
    })

    it('recovers when LINE Pay says the call is a duplicate (1172)', async () => {
      const { client } = clientWith(
        [autoReconcile()],
        json({ returnCode: '1172', returnMessage: 'duplicate' }),
        detailsResponse(paymentInfo())
      )

      const { meta } = await client.confirm(confirmInput)

      expect(meta.recovered?.reason).toBe('duplicate')
      expect(isLinePayApiError(meta.recovered?.cause)).toBe(true)
    })

    it('calls an unknown outcome behind a status code what it is, not a duplicate', async () => {
      // 0110 is a status code of checkPaymentStatus. Confirm has no use for it, so
      // the call is an unknown outcome and an API error all the same.
      const { client } = clientWith(
        [autoReconcile()],
        json({ returnCode: '0110', returnMessage: 'status' }),
        detailsResponse(paymentInfo())
      )

      const { meta } = await client.confirm(confirmInput)

      expect(isLinePayApiError(meta.recovered?.cause)).toBe(true)
      expect(meta.recovered?.reason).toBe('unknown-outcome')
    })

    it('reports how long the whole call took, the lookup included', async () => {
      const { client } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET'),
        detailsResponse(paymentInfo())
      )

      const before = Date.now()
      const { meta } = await client.confirm(confirmInput)

      expect(meta.startedAt.getTime()).toBeGreaterThanOrEqual(before - 1)
      expect(meta.durationMs).toBeGreaterThanOrEqual(0)
      expect(meta.durationMs).toBeLessThan(5000)
    })

    it('recovers a pre-approved payment by its order ID', async () => {
      // The payment has to be from the time of the call, or later.
      const { client, calls } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET'),
        detailsResponse(
          paymentInfo({
            transactionDate: new Date(Date.now() + 60_000).toISOString()
          })
        )
      )

      const { body, meta } = await client.payPreapproved({
        regKey: 'RK9A2BA1937EQTO',
        productName: 'Tea',
        amount: 1000,
        currency: 'TWD',
        orderId: 'order-1'
      })

      expect(body.info).toMatchObject({ orderId: 'order-1', transactionId: TX })
      expect(meta.recovered).toBeDefined()
      expect(describeCall(at(calls, 1))).toBe(
        'GET /v4/payments?orderId=order-1'
      )
    })

    it('counts the attempts when it sits inside retryWhenNotSent', async () => {
      const { client, calls } = clientWith(
        [retryWhenNotSent({ sleep: async () => {} }), autoReconcile()],
        fetchFailed('ECONNREFUSED'),
        fetchFailed('ECONNRESET'),
        detailsResponse(paymentInfo())
      )

      const { meta } = await client.confirm(confirmInput)

      // Refused (not sent, retried), cut (unknown, reconciled), lookup.
      expect(calls.map(describeCall)).toEqual([
        `POST /v4/payments/${TX}/confirm`,
        `POST /v4/payments/${TX}/confirm`,
        `GET /v4/payments?transactionId=${TX}`
      ])
      expect(meta.attempts).toBe(2)
      expect(meta.recovered).toBeDefined()
    })

    it('is added to the default stack by with()', async () => {
      const { fetch, calls } = scriptedFetch(
        fetchFailed('ECONNRESET'),
        detailsResponse(paymentInfo())
      )
      const client = createLinePayClient({ ...config, fetch }).with(
        autoReconcile()
      )

      const { meta } = await client.confirm(confirmInput)

      expect(meta.recovered).toBeDefined()
      expect(calls).toHaveLength(2)
    })
  })

  describe('when it cannot say the payment went through', () => {
    it('rethrows the original error with what it found out', async () => {
      const { client, calls } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET'),
        detailsResponse()
      )

      const error = await failure(client.confirm(confirmInput))

      expect(isLinePayNetworkError(error)).toBe(true)
      expect(error.outcome).toBe('unknown')
      expect(error.reconcileConclusion?.status).toBe('not-applied')
      expect(error.reconcileConclusion?.reason).toMatch(
        /not in the payment details/
      )
      expect(calls).toHaveLength(2)
    })

    it('says so when the details are unreadable', async () => {
      const { client } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET'),
        fetchFailed('ECONNRESET')
      )

      const error = await failure(client.confirm(confirmInput))

      expect(error.reconcileConclusion).toEqual({
        status: 'indeterminate',
        reason:
          'The payment details could not be read (LINE_PAY_NETWORK_ERROR).'
      })
    })

    it('never repeats a refund, and leaves the call unresolved when it cannot tell (0.9 bug A2)', async () => {
      const { client, calls } = clientWith(
        [autoReconcile()],
        hang,
        detailsResponse(paymentInfo())
      )

      const error = await failure(
        client.refund({ transactionId: TX, refundAmount: 20 }, { timeout: 20 })
      )

      expect(error.code).toBe('LINE_PAY_TIMEOUT_ERROR')
      expect(error.reconcileConclusion?.status).toBe('indeterminate')
      expect(calls.filter(call => call.method === 'POST')).toHaveLength(1)
      expect(calls).toHaveLength(2)
    })

    it('recovers a refund only when the details show it', async () => {
      const { client } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET'),
        detailsResponse(
          paymentInfo({
            refundList: [
              {
                refundTransactionId: '2021121300698360311',
                transactionType: 'PARTIAL_REFUND',
                refundAmount: -20,
                refundTransactionDate: new Date(Date.now() + 5000).toISOString()
              }
            ]
          })
        )
      )

      const { body, meta } = await client.refund({
        transactionId: TX,
        refundAmount: 20
      })

      expect(body.info.refundTransactionId).toBe('2021121300698360311')
      expect(meta.recovered?.notes[0]).toMatch(
        /Matched by amount and a later whole second/
      )
    })

    it('does not count one refund twice when LINE Pay refused the second as a duplicate', async () => {
      // Two refunds of the same amount at once: the first went through, the
      // second got 1198. The refund that exists is the first one's.
      const { client, calls } = clientWith(
        [autoReconcile()],
        json({ returnCode: '1198', returnMessage: 'duplicate' }),
        detailsResponse(
          paymentInfo({
            refundList: [
              {
                refundTransactionId: '2021121300698360311',
                transactionType: 'PARTIAL_REFUND',
                refundAmount: -20,
                refundTransactionDate: new Date(Date.now() + 5000).toISOString()
              }
            ]
          })
        )
      )

      const error = await failure(
        client.refund({ transactionId: TX, refundAmount: 20 })
      )

      expect(isLinePayApiError(error)).toBe(true)
      expect(error.reconcileConclusion?.status).toBe('indeterminate')
      expect(calls).toHaveLength(1)
    })

    it('throws the error of the call, not the failure of the lookup that came after it', async () => {
      // A middleware that breaks on the lookup: a bug in it must not replace the
      // error that says what happened to the payment.
      const failOnLookup: Middleware = (ctx, next) => {
        if (ctx.operation === 'paymentDetails') {
          throw new Error('the lookup middleware broke')
        }
        return next()
      }
      const { client } = clientWith(
        [failOnLookup, autoReconcile()],
        fetchFailed('ECONNRESET')
      )

      const error = await failure(client.confirm(confirmInput))

      expect(isLinePayNetworkError(error)).toBe(true)
      expect(error.outcome).toBe('unknown')
      expect(error.reconcileConclusion).toEqual({
        status: 'indeterminate',
        reason: 'The lookup itself failed: the lookup middleware broke'
      })
    })

    it('does not let the failure of the lookup carry a regKey into a log', async () => {
      // `node-fetch` and others put the URL in their messages, and the regKey is a
      // segment of the path of a pre-approved payment.
      const url =
        'https://api-pay.line.me/v4/payments/preapprovedPay/RK9A2BA1937EQTO/payment'
      const failOnLookup: Middleware = (ctx, next) => {
        if (ctx.operation === 'paymentDetails') {
          throw new Error(`request to ${url} failed, reason: socket hang up`)
        }
        return next()
      }
      const { client } = clientWith(
        [failOnLookup, autoReconcile()],
        fetchFailed('ECONNRESET')
      )

      const error = await failure(client.confirm(confirmInput))

      expect(error.reconcileConclusion?.reason).toBe(
        'The lookup itself failed: request to https://api-pay.line.me failed, reason: socket hang up'
      )
      expect(JSON.stringify(error)).not.toContain('RK9A2BA1937EQTO')
      expect(inspect(error)).not.toContain('RK9A2BA1937EQTO')
    })

    it.each([
      ['a text', 'it broke', 'The lookup itself failed: it broke'],
      [
        'something that is not an error',
        { token: 'Bearer should-never-be-logged' },
        'The lookup itself failed: with something that is not an error'
      ]
    ])(
      'says what the lookup failed with when it is %s',
      async (_name, thrown, reason) => {
        const failOnLookup: Middleware = (ctx, next) =>
          ctx.operation === 'paymentDetails' ? Promise.reject(thrown) : next()
        const { client } = clientWith(
          [failOnLookup, autoReconcile()],
          fetchFailed('ECONNRESET')
        )

        const error = await failure(client.confirm(confirmInput))

        expect(error.reconcileConclusion).toEqual({
          status: 'indeterminate',
          reason
        })
      }
    )

    it('does not reconcile with a signal that has already fired', async () => {
      const controller = new AbortController()
      const { client, calls } = clientWith(
        [autoReconcile()],
        call => {
          controller.abort()
          return Promise.reject(call.signal?.reason)
        },
        detailsResponse(paymentInfo())
      )

      const error = await failure(
        client.confirm(confirmInput, { signal: controller.signal })
      )

      expect(error.code).toBe('LINE_PAY_ABORT_ERROR')
      expect(error.reconcileConclusion).toEqual({
        status: 'indeterminate',
        reason: 'The payment details could not be read (LINE_PAY_ABORT_ERROR).'
      })
      expect(calls).toHaveLength(1)
    })
  })

  describe('when there is nothing to reconcile', () => {
    it('leaves a refusal alone', async () => {
      const { client, calls } = clientWith(
        [autoReconcile()],
        json({ returnCode: '1106', returnMessage: 'header error' })
      )

      const error = await failure(client.confirm(confirmInput))

      expect(isLinePayApiError(error)).toBe(true)
      expect(error.reconcileConclusion).toBeUndefined()
      expect(calls).toHaveLength(1)
    })

    it('leaves a request that was not sent alone', async () => {
      const { client, calls } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNREFUSED')
      )

      const error = await failure(client.confirm(confirmInput))

      expect(error.outcome).toBe('not-sent')
      expect(error.reconcileConclusion).toBeUndefined()
      expect(calls).toHaveLength(1)
    })

    it('leaves invalid input alone', async () => {
      const { client, calls } = clientWith([autoReconcile()])

      const error = await failure(
        client.confirm({ ...confirmInput, transactionId: '../x' })
      )

      expect(error.code).toBe('LINE_PAY_VALIDATION_ERROR')
      expect(calls).toHaveLength(0)
    })

    it('leaves operations that cannot be looked up alone', async () => {
      const { client, calls } = clientWith(
        [autoReconcile()],
        fetchFailed('ECONNRESET')
      )

      const created = await failure(
        client.request({
          amount: 1000,
          currency: 'TWD',
          orderId: 'order-1',
          packages: [
            {
              id: 'p1',
              amount: 1000,
              products: [{ name: 'Tea', quantity: 1, price: 1000 }]
            }
          ],
          redirectUrls: {
            confirmUrl: 'https://shop.example/confirm',
            cancelUrl: 'https://shop.example/cancel'
          }
        })
      )
      const read = await failure(client.paymentDetails({ transactionId: [TX] }))

      expect(created.reconcileConclusion).toBeUndefined()
      expect(read.reconcileConclusion).toBeUndefined()
      expect(calls).toHaveLength(2)
    })

    it('only reconciles the operations it was given', async () => {
      const { client, calls } = clientWith(
        [autoReconcile({ operations: ['confirm'] })],
        fetchFailed('ECONNRESET'), // refund
        fetchFailed('ECONNRESET'), // confirm
        detailsResponse(paymentInfo()) // lookup
      )

      const refund = await failure(
        client.refund({ transactionId: TX, refundAmount: 20 })
      )
      expect(refund.reconcileConclusion).toBeUndefined()
      expect(calls).toHaveLength(1)

      const confirm = await client.confirm(confirmInput)
      expect(confirm.meta.recovered).toBeDefined()
    })

    it('is not part of the default stack', async () => {
      const { fetch, calls } = scriptedFetch(
        fetchFailed('ECONNRESET'),
        detailsResponse(paymentInfo())
      )
      const client = createLinePayClient({ ...config, fetch })

      const error = await failure(client.confirm(confirmInput))

      expect(error.reconcileConclusion).toBeUndefined()
      expect(calls).toHaveLength(1)
    })

    it('passes on errors that are not from the library', async () => {
      const boom = new Error('boom')
      const { client } = clientWith([
        autoReconcile(),
        () => Promise.reject(boom)
      ])

      await expect(client.confirm(confirmInput)).rejects.toBe(boom)
    })

    it('never reconciles an operation that cannot be reconciled, whatever it is told', async () => {
      // `operations` is typed, but a list built at run time can hold anything,
      // and a middleware further in can throw an error made for another call.
      const foreign = new LinePayTimeoutError({ timeoutMs: 1000 })
      foreign.context = {
        operation: 'confirm',
        startedAt: new Date(),
        transactionId: TX,
        amount: 1000,
        currency: 'TWD'
      }
      let thrown = false
      const { client, calls } = clientWith(
        [
          // @ts-expect-error a read is not an operation that reconcile looks up
          autoReconcile({ operations: ['paymentDetails'] }),
          (_ctx, next) => {
            if (thrown) return next()
            thrown = true
            return Promise.reject(foreign)
          }
        ],
        detailsResponse(paymentInfo())
      )

      const error = await failure(
        client.paymentDetails({ transactionId: [TX] })
      )

      expect(error).toBe(foreign)
      expect(error.reconcileConclusion).toBeUndefined()
      expect(calls).toHaveLength(0)
    })
  })

  it('rethrows the original error when the payment details are malformed', async () => {
    const { client } = clientWith(
      [autoReconcile()],
      fetchFailed('ECONNRESET'),
      raw('{"returnCode":"0000","returnMessage":"Success."}')
    )

    const error = await failure(client.confirm(confirmInput))

    expect(isLinePayNetworkError(error)).toBe(true)
    expect(error.outcome).toBe('unknown')
    expect(error.reconcileConclusion?.status).toBe('indeterminate')
  })
})
