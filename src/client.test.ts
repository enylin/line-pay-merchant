import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLinePayClient } from './client'
import type { AnyCallContext, Middleware } from './client-types'
import {
  isLinePayApiError,
  isLinePayError,
  isLinePayHttpError,
  isLinePayMiddlewareError,
  isLinePayNetworkError,
  isLinePayTimeoutError,
  isLinePayValidationError,
  needsReconcile
} from './errors'
import { retryWhenNotSent } from './middleware/retry-when-not-sent'
import type { RefundInput } from './operations'
import { OPERATION_NAMES } from './operations/names'
import { at } from './test/at'
import {
  applyUntyped,
  CHANNEL_ID,
  detailsResponse,
  expectValidSignature,
  failure,
  fetchFailed,
  inheriting,
  json,
  ok,
  okTextFor,
  operationOf,
  paymentInfo,
  raw,
  scriptedFetch,
  SECRET,
  success,
  TX,
  untyped,
  withUntyped
} from './test/helpers'
import { closeServers, startServer } from './test/server'

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

/**
 * What types allow and a snapshot does not carry: a refund whose amount sits
 * behind a name of the class's own. Type-checks as a `RefundInput`.
 */
class RefundRequest implements RefundInput {
  #cents: number
  transactionId: string
  constructor(transactionId: string, cents: number) {
    this.transactionId = transactionId
    this.#cents = cents
  }
  get refundAmount(): number {
    return this.#cents / 100
  }
}

describe('createLinePayClient', () => {
  it('exposes the ten operations, with() and reconcile() and nothing else', () => {
    const client = createLinePayClient(config)
    expect(Object.keys(client).sort()).toEqual(
      [...OPERATION_NAMES, 'reconcile', 'with'].sort()
    )
    for (const name of OPERATION_NAMES)
      expect(typeof client[name]).toBe('function')
  })

  it('is frozen and does not expose the secret', () => {
    const client = createLinePayClient(config)
    expect(Object.isFrozen(client)).toBe(true)
    expect(JSON.stringify(client)).not.toContain(SECRET)
    expect(
      Object.values(client).every((v: unknown) => typeof v === 'function')
    ).toBe(true)
  })

  it('rejects an invalid configuration at creation', () => {
    expect(() =>
      applyUntyped(createLinePayClient, [{ ...config, env: 'development' }])
    ).toThrow(/renamed to 'sandbox'/)
  })

  it('does not touch the network when it is created', () => {
    const { fetch } = scriptedFetch()
    createLinePayClient({ ...config, fetch })
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('status codes', () => {
  it('returns them for the payment status check', async () => {
    const { fetch } = scriptedFetch(
      json({ returnCode: '0121', returnMessage: 'cancelled' })
    )
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })

    const { body } = await linePay.checkPaymentStatus({ transactionId: TX })

    expect(body.returnCode).toBe('0121')
  })

  it('treats one on a call that moves money as an unknown outcome', async () => {
    const { fetch } = scriptedFetch(
      json({ returnCode: '0110', returnMessage: 'processing' })
    )
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })

    const error = await failure(linePay.confirm(confirmInput))

    expect(isLinePayApiError(error)).toBe(true)
    expect(error.outcome).toBe('unknown')
    // So it is looked up, not trusted and not given up on.
    expect(needsReconcile(error)).toBe(true)
  })
})

describe('a call', () => {
  it('sends a signed request and returns the body with lossless IDs', async () => {
    const { fetch, calls } = scriptedFetch(
      raw(
        `{"returnCode":"0000","returnMessage":"Success.","info":{"orderId":"o-1","transactionId":${TX},"payInfo":[],"packages":[]}}`
      )
    )
    const linePay = createLinePayClient({ ...config, fetch })

    const { body, meta } = await linePay.confirm(confirmInput)

    expect(calls).toHaveLength(1)
    const call = at(calls, 0)
    expect(call).toMatchObject({
      url: `https://sandbox-api-pay.line.me/v4/payments/${TX}/confirm`,
      method: 'POST',
      body: '{"amount":1000,"currency":"TWD"}'
    })
    expect(call.headers).toMatchObject({
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': CHANNEL_ID
    })
    expectValidSignature(call)

    expect(body.info.transactionId).toBe(TX)
    expect(meta).toMatchObject({
      operation: 'confirm',
      attempts: 1,
      httpStatus: 200
    })
    expect(meta.startedAt).toBeInstanceOf(Date)
    expect(meta.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('signs a GET over the query string, with repeated keys for arrays', async () => {
    const { fetch, calls } = scriptedFetch(success([]))
    const linePay = createLinePayClient({ ...config, fetch })

    await linePay.paymentDetails({ transactionId: [TX, '1'], orderId: ['a b'] })

    const call = at(calls, 0)
    expect(call.method).toBe('GET')
    expect(call.url).toBe(
      `https://sandbox-api-pay.line.me/v4/payments?transactionId=${TX}&transactionId=1&orderId=a%20b`
    )
    expect(call.body).toBeUndefined()
    expectValidSignature(call)
  })

  it('uses a fresh nonce for every request', async () => {
    const { fetch, calls } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    await linePay.confirm(confirmInput)
    await linePay.confirm(confirmInput)
    const nonces = calls.map(c => c.headers['X-LINE-Authorization-Nonce'])
    expect(new Set(nonces).size).toBe(2)
  })

  it('selects the production host and the device profile', async () => {
    const { fetch, calls } = scriptedFetch(ok)
    const linePay = createLinePayClient({
      ...config,
      env: 'production',
      merchantDeviceProfileId: 'pos-7',
      merchantDeviceType: 'POS',
      fetch
    })
    await linePay.void({ transactionId: TX })
    expect(at(calls, 0).url).toBe(
      `https://api-pay.line.me/v4/payments/authorizations/${TX}/void`
    )
    expect(at(calls, 0).headers['X-LINE-MerchantDeviceProfileId']).toBe('pos-7')
  })

  it('does not sign the path prefix of a custom baseUrl', async () => {
    const { fetch, calls } = scriptedFetch(ok)
    const linePay = createLinePayClient({
      ...config,
      baseUrl: 'https://proxy.example.com/linepay/',
      fetch
    })
    await linePay.void({ transactionId: TX })
    expect(at(calls, 0).url).toBe(
      `https://proxy.example.com/linepay/v4/payments/authorizations/${TX}/void`
    )
    // The signature covers the LINE Pay path only: the proxy strips its prefix.
    const { createHmac } = await import('node:crypto')
    const nonce = at(calls, 0).headers['X-LINE-Authorization-Nonce']
    const expected = createHmac('sha256', SECRET)
      .update(`${SECRET}/v4/payments/authorizations/${TX}/void{}${nonce}`)
      .digest('base64')
    expect(at(calls, 0).headers['X-LINE-Authorization']).toBe(expected)
  })

  it('returns codes that start with 0 instead of throwing', async () => {
    const { fetch } = scriptedFetch(
      json({ returnCode: '0121', returnMessage: 'cancelled' })
    )
    const linePay = createLinePayClient({ ...config, fetch })
    const { body } = await linePay.checkPaymentStatus({ transactionId: TX })
    expect(body.returnCode).toBe('0121')
  })
})

// A caller that reuses one object for its next call must not change which
// payment an earlier call is about, whether it is retried or it fails.
describe('the input of a call', () => {
  it('is the one of the moment of the call, for every attempt of a retry', async () => {
    const { fetch, calls } = scriptedFetch(fetchFailed('ECONNREFUSED'), ok)
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [
        retryWhenNotSent({
          sleep: () => {
            // The caller moves on to the next refund while this one waits.
            input.transactionId = '2222222222222222222'
            input.refundAmount = 999
            return Promise.resolve()
          }
        })
      ]
    })
    const input = { transactionId: TX, refundAmount: 10 }

    await linePay.refund(input)

    expect(calls.map(call => call.url)).toEqual([
      expect.stringContaining(`/${TX}/refund`),
      expect.stringContaining(`/${TX}/refund`)
    ])
    expect(calls.map(call => call.body)).toEqual([
      '{"refundAmount":10}',
      '{"refundAmount":10}'
    ])
  })

  it('is the one of the moment of the call in the context of the error', async () => {
    const input = { transactionId: TX, amount: 1000, currency: 'TWD' as const }
    const { fetch } = scriptedFetch(() => {
      input.transactionId = '2222222222222222222'
      input.amount = 30
      throw fetchFailed('ECONNRESET')
    })
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })

    const error = await failure(linePay.confirm(input))

    expect(error.context).toMatchObject({
      operation: 'confirm',
      transactionId: TX,
      amount: 1000,
      currency: 'TWD'
    })
  })

  it('is not the object of the caller', async () => {
    const seen: unknown[] = []
    const { fetch } = scriptedFetch()
    const spy: Middleware = (ctx, next) => {
      seen.push(ctx.input)
      return next()
    }
    const linePay = createLinePayClient({ ...config, fetch, middleware: [spy] })
    const input = { transactionId: TX, amount: 1, currency: 'TWD' as const }

    await linePay.confirm(input)

    expect(seen[0]).toEqual(input)
    expect(seen[0]).not.toBe(input)
  })

  it('keeps a key that has no value, which the checks look for', async () => {
    const { fetch, calls } = scriptedFetch()
    const linePay = createLinePayClient({ ...config, fetch })

    const error = await failure(
      linePay.refund({ transactionId: TX, refundAmount: undefined })
    )

    expect(isLinePayValidationError(error)).toBe(true)
    expect(calls).toHaveLength(0)
  })

  // "No refundAmount" is how a full refund is asked for. An input whose amount a
  // copy does not carry must not turn into one.
  describe('what a copy does not carry', () => {
    const lost = {
      'a class that keeps the amount behind a #private name': () =>
        new RefundRequest(TX, 2000),
      'an object that has the amount from its prototype': () =>
        inheriting({ refundAmount: 20 }),
      'a refundAmount that is not enumerable': () =>
        Object.defineProperty({ transactionId: TX }, 'refundAmount', {
          value: 20,
          enumerable: false
        })
    }

    it.each(Object.entries(lost))(
      'is not sent as a full refund: %s',
      async (_name, make) => {
        const { fetch, calls } = scriptedFetch(ok)
        const linePay = createLinePayClient({ ...config, fetch })
        const input = Object.assign(make(), { transactionId: TX })

        const error = await failure(untyped(linePay, 'refund', input))

        expect(isLinePayValidationError(error)).toBe(true)
        expect(error).toMatchObject({
          outcome: 'not-sent',
          operation: 'refund'
        })
        expect(calls).toHaveLength(0)
      }
    )

    it('is refused with validate: false too', async () => {
      const { fetch, calls } = scriptedFetch(ok)
      const linePay = createLinePayClient({ ...config, fetch, validate: false })

      const error = await failure(
        untyped(linePay, 'refund', new RefundRequest(TX, 2000))
      )

      expect(isLinePayValidationError(error)).toBe(true)
      expect(calls).toHaveLength(0)
    })

    it('is refused for the other operations that read an optional field', async () => {
      class Authorize {
        get capture() {
          return false
        }
      }
      const { fetch, calls } = scriptedFetch(ok)
      const linePay = createLinePayClient({ ...config, fetch })
      const payment = {
        regKey: 'RK9A2BA1937EQTO',
        productName: 'Tea',
        amount: 100,
        currency: 'TWD',
        orderId: 'order-1'
      }

      const preapproved = await failure(
        untyped(
          linePay,
          'payPreapproved',
          inheriting({ capture: false }, payment)
        )
      )
      const request = await failure(
        untyped(linePay, 'request', {
          amount: 100,
          currency: 'TWD',
          orderId: 'order-1',
          packages: [
            {
              id: 'p1',
              amount: 100,
              products: [{ name: 'Tea', quantity: 1, price: 100 }]
            }
          ],
          redirectUrls: {
            confirmUrl: 'https://shop.example/confirm',
            cancelUrl: 'https://shop.example/cancel'
          },
          options: { payment: new Authorize() }
        })
      )

      expect(isLinePayValidationError(preapproved)).toBe(true)
      expect(isLinePayValidationError(request)).toBe(true)
      expect(request.message).toContain('options.payment')
      expect(calls).toHaveLength(0)
    })

    it('still takes the plain object that a class instance is spread into', async () => {
      const { fetch, calls } = scriptedFetch(ok)
      const linePay = createLinePayClient({ ...config, fetch })
      const instance = new RefundRequest(TX, 2000)

      await linePay.refund({
        transactionId: instance.transactionId,
        refundAmount: instance.refundAmount
      })

      expect(calls.map(call => call.body)).toEqual(['{"refundAmount":20}'])
    })
  })

  it.each([
    ['a function', { transactionId: TX, amount: 1, currency: 'TWD', f() {} }],
    ['a symbol', { transactionId: TX, amount: 1, currency: 'TWD', s: Symbol() }]
  ])(
    'is refused when it holds %s, as a validation error',
    async (_name, input) => {
      const { fetch, calls } = scriptedFetch()
      const linePay = createLinePayClient({ ...config, fetch })

      const error = await failure(untyped(linePay, 'confirm', input))

      expect(isLinePayValidationError(error)).toBe(true)
      expect(error).toMatchObject({ outcome: 'not-sent', operation: 'confirm' })
      expect(error.cause).toBeDefined()
      expect(calls).toHaveLength(0)
    }
  )

  it.each([
    ['a BigInt', () => ({ n: 10n })],
    [
      'a value that refers to itself',
      () => {
        const loop: Record<string, unknown> = { a: 1 }
        loop.self = loop
        return loop
      }
    ]
  ])('is refused when JSON cannot hold %s', async (_name, extra) => {
    const { fetch, calls } = scriptedFetch()
    const linePay = createLinePayClient({ ...config, fetch, validate: false })

    const error = await failure(
      untyped(linePay, 'confirm', {
        transactionId: TX,
        amount: 1,
        currency: 'TWD',
        ...extra()
      })
    )

    expect(isLinePayValidationError(error)).toBe(true)
    expect(error).toMatchObject({ outcome: 'not-sent' })
    expect(calls).toHaveLength(0)
  })

  it('passes anything that is not an object on to the check that names it', async () => {
    const { fetch } = scriptedFetch()
    const linePay = createLinePayClient({ ...config, fetch })
    for (const input of [undefined, null, 'x', 42, () => 1, Symbol('x')]) {
      const error = await failure(untyped(linePay, 'confirm', input))
      expect(isLinePayValidationError(error)).toBe(true)
      expect(error.message).toMatch(/input must be an object/)
    }
  })
})

describe('input checks', () => {
  it('rejects bad input without calling fetch', async () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(
      untyped(linePay, 'confirm', {
        transactionId: TX,
        amount: 0,
        currency: 'JPY'
      })
    )
    expect(isLinePayValidationError(error)).toBe(true)
    expect(error.outcome).toBe('not-sent')
    expect(error.operation).toBe('confirm')
    expect(fetch).not.toHaveBeenCalled()
  })

  it.each([undefined, null, 'x', 5])('rejects %j as an input', async value => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(untyped(linePay, 'confirm', value))
    expect(isLinePayValidationError(error)).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })

  // Regression A4: version 0.9 signed and sent these path parameters unchecked.
  it('never lets a transactionId change the path', async () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    for (const transactionId of [
      '../../v3/payments/preapprovedPay/RK123/expire?x=',
      '123/../456',
      '123?x=1'
    ]) {
      const error = await failure(
        linePay.confirm({ ...confirmInput, transactionId })
      )
      expect(isLinePayValidationError(error)).toBe(true)
    }
    expect(fetch).not.toHaveBeenCalled()
  })

  it('skips the business rules with validate: false, but not the path check', async () => {
    const { fetch, calls } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, validate: false, fetch })

    await untyped(linePay, 'confirm', {
      transactionId: TX,
      amount: 0,
      currency: 'JPY'
    })
    expect(calls).toHaveLength(1)

    const error = await failure(
      linePay.confirm({ ...confirmInput, transactionId: '../x' })
    )
    expect(isLinePayValidationError(error)).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it.each([
    { timeout: 0 },
    { timeout: -1 },
    { timeout: Number.NaN },
    { timeout: '5000' },
    { signal: 'abort' },
    { timeout: 1000, retries: 3 },
    { signall: new AbortController().signal },
    'options',
    null,
    ['timeout'],
    new Date(0)
  ])('rejects the call options %j', async options => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(
      untyped(linePay, 'confirm', confirmInput, options)
    )
    expect(isLinePayValidationError(error)).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('the options of a call', () => {
  it('are refused when they come from a class or a prototype, which a copy leaves out', async () => {
    const controller = new AbortController()
    class Options {
      get signal() {
        return controller.signal
      }
    }
    const { fetch, calls } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })

    for (const options of [new Options(), inheriting({ timeout: 5 })]) {
      const error = await failure(
        untyped(linePay, 'confirm', confirmInput, options)
      )
      expect(isLinePayValidationError(error)).toBe(true)
      expect(error).toMatchObject({ outcome: 'not-sent', operation: 'confirm' })
    }
    expect(calls).toHaveLength(0)
  })

  it('are frozen, with the two that exist and nothing else', async () => {
    const seen: unknown[] = []
    const spy: Middleware = (ctx, next) => {
      seen.push(ctx.options)
      return next()
    }
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch, middleware: [spy] })
    const signal = new AbortController().signal

    await linePay.confirm(confirmInput, { timeout: 5000, signal })
    await linePay.confirm(confirmInput)
    await linePay.confirm(confirmInput, { timeout: undefined })

    expect(seen).toStrictEqual([{ timeout: 5000, signal }, {}, {}])
    expect(seen.map(options => Object.isFrozen(options))).toEqual([
      true,
      true,
      true
    ])
  })
})

describe('failures', () => {
  it('turns a LINE Pay failure into an API error that keeps the body', async () => {
    const { fetch } = scriptedFetch(
      json({ returnCode: '1172', returnMessage: 'duplicate' })
    )
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(linePay.confirm(confirmInput))
    expect(isLinePayApiError(error)).toBe(true)
    expect(error).toMatchObject({
      returnCode: '1172',
      category: 'duplicate',
      outcome: 'rejected',
      operation: 'confirm'
    })
  })

  // Regression A5: version 0.9 let these escape as a bare SyntaxError.
  it.each([
    [
      'an HTML page with status 502',
      raw('<html>Bad Gateway</html>', 502),
      'unknown'
    ],
    ['an HTML page with status 200', raw('<html>login</html>'), 'unknown'],
    ['an empty body', raw(''), 'unknown'],
    ['status 403', raw('{"msg":"forbidden"}', 403), 'unknown']
  ])('types the response of %s', async (_name, response, outcome) => {
    const { fetch } = scriptedFetch(response)
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })
    const error = await failure(linePay.confirm(confirmInput))
    expect(isLinePayHttpError(error)).toBe(true)
    expect(error.outcome).toBe(outcome)
  })

  it('tells what reconcile needs about a call that went wrong', async () => {
    const { fetch } = scriptedFetch(raw('<html>Bad Gateway</html>', 502))
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(
      linePay.refund({ transactionId: TX, refundAmount: 20 })
    )
    expect(error.context).toMatchObject({
      operation: 'refund',
      transactionId: TX,
      refundAmount: 20
    })
    expect(error.context?.startedAt).toBeInstanceOf(Date)
    expect(needsReconcile(error)).toBe(true)
  })

  it('does not call a failed read reconcilable', async () => {
    const { fetch } = scriptedFetch(raw('<html>Bad Gateway</html>', 502))
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })
    const error = await failure(linePay.paymentDetails({ orderId: ['a'] }))
    expect(needsReconcile(error)).toBe(false)
  })

  it('keeps no secret in an error', async () => {
    const { fetch } = scriptedFetch(raw('<html>Bad Gateway</html>', 502))
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(linePay.refund({ transactionId: TX }))
    expect(JSON.stringify(error)).not.toContain(SECRET)
    expect(JSON.stringify(error.context)).not.toContain(SECRET)
  })
})

describe('what an error says about its call', () => {
  const retry = retryWhenNotSent({ baseDelayMs: 1, maxDelayMs: 1 })

  it('tells how an answer of LINE Pay went, with its status', async () => {
    const { fetch } = scriptedFetch(
      json({ returnCode: '1106', returnMessage: 'refused' }, 400)
    )
    const linePay = createLinePayClient({ ...config, fetch })
    const before = Date.now()
    const error = await failure(linePay.confirm(confirmInput))

    expect(error.operation).toBe('confirm')
    expect(error.meta).toMatchObject({
      operation: 'confirm',
      attempts: 1,
      httpStatus: 400
    })
    expect(error.meta?.startedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(error.meta?.durationMs).toBeGreaterThanOrEqual(0)
    // The same moment as the context, so that the two can be put side by side.
    expect(error.meta?.startedAt).toBe(error.context?.startedAt)
  })

  it('tells the status of an HTTP error too', async () => {
    const { fetch } = scriptedFetch(raw('<html>Bad Gateway</html>', 502))
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })
    const error = await failure(linePay.confirm(confirmInput))
    expect(error.meta).toMatchObject({ attempts: 1, httpStatus: 502 })
  })

  it('has no status when there was no answer', async () => {
    const { fetch } = scriptedFetch(fetchFailed('ECONNRESET'))
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })
    const error = await failure(linePay.confirm(confirmInput))
    expect(isLinePayNetworkError(error)).toBe(true)
    expect(error.meta).toMatchObject({ operation: 'confirm', attempts: 1 })
    expect(error.meta).not.toHaveProperty('httpStatus')
  })

  it('counts every attempt that the retry middleware made', async () => {
    const { fetch, calls } = scriptedFetch(fetchFailed('ECONNREFUSED'))
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [retry]
    })
    const error = await failure(linePay.confirm(confirmInput))

    expect(calls).toHaveLength(3)
    expect(isLinePayNetworkError(error)).toBe(true)
    expect(error.outcome).toBe('not-sent')
    expect(error.meta).toMatchObject({ operation: 'confirm', attempts: 3 })
  })

  it('counts them the same way in the result of a call that worked in the end', async () => {
    const { fetch } = scriptedFetch(fetchFailed('ECONNREFUSED'), ok)
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [retry]
    })
    const { meta } = await linePay.confirm(confirmInput)
    expect(meta).toMatchObject({
      operation: 'confirm',
      attempts: 2,
      httpStatus: 200
    })
  })

  it('has the call of an input that the rules refuse, although nothing was sent', async () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(
      untyped(linePay, 'confirm', { ...confirmInput, amount: 0 })
    )

    expect(isLinePayValidationError(error)).toBe(true)
    expect(error.outcome).toBe('not-sent')
    expect(error.meta).toMatchObject({ operation: 'confirm', attempts: 1 })
    expect(error.meta).not.toHaveProperty('httpStatus')
    expect(error.context).toMatchObject({ operation: 'confirm' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('has no call when the call was refused before it began', async () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(
      untyped(linePay, 'confirm', confirmInput, { timeout: -1 })
    )

    if (!isLinePayValidationError(error)) throw error
    expect(error.operation).toBe('confirm')
    expect(error.context).toBeUndefined()
    expect(error.meta).toBeUndefined()
    expect(error.issues).toHaveLength(1)
    expect(error.issues[0]?.path).toBe('options.timeout')
  })

  it('names the operation in the message of a refused path parameter, like the other rules', async () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })

    const path = await failure(
      untyped(linePay, 'confirm', { ...confirmInput, transactionId: '12/34' })
    )
    const rule = await failure(
      untyped(linePay, 'confirm', { ...confirmInput, amount: 0 })
    )

    expect(path.message).toBe(
      'Invalid input for confirm: transactionId must be a string of 1 to 19 digits'
    )
    expect(rule.message).toMatch(/^Invalid input for confirm: /)
    expect(path).toMatchObject({ operation: 'confirm', outcome: 'not-sent' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('names a field the same way when the copy refuses it and when the rules do', async () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const paths = async (input: unknown) => {
      const error = await failure(untyped(linePay, 'refund', input))
      if (!isLinePayValidationError(error)) throw error
      return error.issues.map(issue => issue.path)
    }

    expect(
      await paths({
        transactionId: TX,
        get refundAmount() {
          return 20
        }
      })
    ).toEqual(['refundAmount'])
    expect(await paths({ transactionId: TX, refundAmount: -5 })).toEqual([
      'refundAmount'
    ])
    expect(await paths({ transactionId: TX, refundAmout: 5 })).toEqual([
      'refundAmout'
    ])
    // The input as a whole is `input`.
    expect(await paths(5)).toEqual(['input'])
  })

  it('shows how the call went in its safe view, and not what it was about', async () => {
    const { fetch } = scriptedFetch(raw('<html>Bad Gateway</html>', 502))
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })
    const error = await failure(
      linePay.refund({ transactionId: TX, refundAmount: 20 })
    )

    const view = JSON.stringify(error)
    expect(view).toContain('"attempts":1')
    expect(view).toContain('"httpStatus":502')
    expect(view).toContain(error.meta?.startedAt.toISOString())
    expect(view).not.toContain(TX)
    expect(view).not.toContain(CHANNEL_ID)
  })
})

describe('default middleware', () => {
  it('repeats a call whose connection could not be made', async () => {
    const { fetch, calls } = scriptedFetch(fetchFailed('ECONNREFUSED'), ok)
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [retryWhenNotSent({ baseDelayMs: 1, maxDelayMs: 1 })]
    })
    const { meta } = await linePay.confirm(confirmInput)
    expect(calls).toHaveLength(2)
    expect(meta.attempts).toBe(2)
  })

  it('has the retry middleware without being asked', async () => {
    const { fetch, calls } = scriptedFetch(fetchFailed('ECONNREFUSED'), ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const { meta } = await linePay.confirm(confirmInput)
    expect(meta.attempts).toBe(2)
    expect(calls).toHaveLength(2)
  })

  it('does not repeat a confirm that timed out', async () => {
    const hanging = (call: { signal: AbortSignal | undefined }) =>
      new Promise<Response>((_resolve, reject) => {
        call.signal?.addEventListener('abort', () =>
          reject(call.signal?.reason)
        )
      })
    const { fetch, calls } = scriptedFetch(hanging)
    const linePay = createLinePayClient({ ...config, fetch })
    const error = await failure(linePay.confirm(confirmInput, { timeout: 20 }))
    expect(isLinePayTimeoutError(error)).toBe(true)
    expect(calls).toHaveLength(1)
  })

  it('can be switched off', async () => {
    const { fetch, calls } = scriptedFetch(fetchFailed('ECONNREFUSED'))
    const linePay = createLinePayClient({ ...config, fetch, middleware: [] })
    await failure(linePay.confirm(confirmInput))
    expect(calls).toHaveLength(1)
  })
})

describe('with() and middleware', () => {
  it.each([undefined, null, 'retry', {}, 42])(
    'refuses %j in the chain: what follows it would never run',
    entry => {
      const { fetch } = scriptedFetch(ok)
      const linePay = createLinePayClient({ ...config, fetch })
      const guard: Middleware = (_ctx, next) => next()

      expect(() => withUntyped(linePay, guard, entry, guard)).toThrowError(
        /middleware\[1\] must be a function/
      )
    }
  )

  it('calls the middleware it refuses a configuration, and has nothing to say about a call', () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    let thrown: unknown
    try {
      withUntyped(linePay, 'retry')
    } catch (error) {
      thrown = error
    }
    if (!isLinePayValidationError(thrown)) throw thrown
    expect(thrown.message).toBe(
      'Invalid configuration: middleware[0] must be a function'
    )
    expect(thrown.operation).toBeUndefined()
    expect(thrown.context).toBeUndefined()
    expect(thrown.meta).toBeUndefined()
  })

  it('takes none, or any number of functions', () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({ ...config, fetch })
    const pass: Middleware = (_ctx, next) => next()

    expect(() => linePay.with()).not.toThrow()
    expect(() => linePay.with(pass, pass, pass)).not.toThrow()
  })

  const tag =
    (name: string, log: string[]): Middleware =>
    async (_ctx: AnyCallContext, next) => {
      log.push(`${name}:in`)
      const result = await next()
      log.push(`${name}:out`)
      return result
    }

  it('puts middleware registered first on the outside', async () => {
    const log: string[] = []
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [tag('first', log), tag('second', log)]
    })
    await linePay.confirm(confirmInput)
    expect(log).toEqual(['first:in', 'second:in', 'second:out', 'first:out'])
  })

  it('places what with() adds inside the existing stack', async () => {
    const log: string[] = []
    const { fetch } = scriptedFetch(ok)
    const base = createLinePayClient({
      ...config,
      fetch,
      middleware: [tag('base', log)]
    })
    await base.with(tag('added', log)).confirm(confirmInput)
    expect(log).toEqual(['base:in', 'added:in', 'added:out', 'base:out'])
  })

  // Regression A1: in 0.9, addHandler() pushed into an array that every user of the
  // client shared, so each request made the next one call more handlers.
  it('never changes the client it was called on', async () => {
    const { fetch, calls } = scriptedFetch(ok)
    const base = createLinePayClient({ ...config, fetch, middleware: [] })
    const seen: number[] = []

    for (let request = 1; request <= 5; request++) {
      const derived = base.with(async (_ctx, next) => {
        seen.push(request)
        return next()
      })
      await derived.confirm(confirmInput)
    }

    // each derived client ran only its own middleware, once
    expect(seen).toEqual([1, 2, 3, 4, 5])
    // and every call produced exactly one request
    expect(calls).toHaveLength(5)

    // the base client has none of it
    await base.confirm(confirmInput)
    expect(seen).toHaveLength(5)
    expect(calls).toHaveLength(6)
  })

  it('does not multiply requests when the same stack is rebuilt for every call', async () => {
    const { fetch, calls } = scriptedFetch(fetchFailed('ECONNREFUSED'))
    const base = createLinePayClient({ ...config, fetch, middleware: [] })
    const retry = retryWhenNotSent({
      maxAttempts: 2,
      baseDelayMs: 1,
      maxDelayMs: 1
    })

    for (let request = 1; request <= 4; request++) {
      calls.length = 0
      await failure(base.with(retry).confirm(confirmInput))
      // 0.9 made 2, 4, 8, 16 requests here
      expect(calls).toHaveLength(2)
    }
  })

  it('gives a middleware the call and the client with its whole stack', async () => {
    const { fetch } = scriptedFetch()
    const contexts: AnyCallContext[] = []
    const inner = vi.fn<Middleware>((_ctx, next) => next())
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [
        async (ctx, next) => {
          contexts.push(ctx)
          if (ctx.operation === 'confirm') {
            // a call made through ctx.client goes through the same stack
            await ctx.client.paymentDetails({ transactionId: [TX] })
          }
          return next()
        },
        inner
      ]
    })

    await linePay.confirm(confirmInput)

    expect(contexts[0]).toMatchObject({
      operation: 'confirm',
      input: confirmInput
    })
    expect(at(contexts, 0).client).toBe(linePay)
    expect(contexts[1]).toMatchObject({ operation: 'paymentDetails' })
    expect(inner).toHaveBeenCalledTimes(2)
  })

  it('refuses a middleware that answers with the result of another operation', async () => {
    const { fetch } = scriptedFetch()
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [
        async (_ctx, next) => {
          const result = await next()
          // A LINE Pay response, but not the one of a confirm.
          return {
            ...result,
            body: { returnCode: '0000', returnMessage: 'Success.' }
          }
        }
      ]
    })
    const error = await failure(linePay.confirm(confirmInput))
    expect(isLinePayMiddlewareError(error)).toBe(true)
    expect(error.message).toBe(
      'A middleware returned something that is not the result of confirm'
    )
  })

  it('says that a call a middleware spoiled may have been made, and can be looked up', async () => {
    const { fetch } = scriptedFetch(
      ok,
      detailsResponse(paymentInfo({ payStatus: 'CAPTURE' }))
    )
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [
        async (ctx, next) => {
          const result = await next()
          // The lookup of reconcile goes through the middleware too.
          if (ctx.operation !== 'confirm') return result
          return {
            ...result,
            body: { returnCode: '0000', returnMessage: 'Success.' }
          }
        }
      ]
    })
    const error = await failure(linePay.confirm(confirmInput))

    // The request went out and LINE Pay confirmed: nothing says it did not.
    expect(error).toMatchObject({ outcome: 'unknown', operation: 'confirm' })
    expect(error.context).toMatchObject({
      operation: 'confirm',
      channelId: CHANNEL_ID,
      transactionId: TX,
      amount: 1000,
      currency: 'TWD'
    })
    expect(needsReconcile(error)).toBe(true)
    expect(await linePay.reconcile(error)).toMatchObject({
      status: 'applied',
      operation: 'confirm'
    })
  })

  it('lets a middleware replace the result', async () => {
    const { fetch } = scriptedFetch(ok)
    const linePay = createLinePayClient({
      ...config,
      fetch,
      middleware: [
        async (_ctx, next) => {
          const result = await next()
          return { ...result, meta: { ...result.meta, attempts: 99 } }
        }
      ]
    })
    expect((await linePay.confirm(confirmInput)).meta.attempts).toBe(99)
  })
})

// Whole milliseconds only reach a timer in some runtimes: a fractional timeout is
// either refused up front, or works. It must not make every call throw a RangeError.
describe('a timeout the configuration accepts', () => {
  it.each([
    ['as config.timeout', { timeout: 1500.5 }, {}],
    ['as config.timeouts[operation]', { timeouts: { void: 99.9 } }, {}],
    ['as the timeout of the call', {}, { timeout: 0.5 }]
  ])('can be used %s', async (_name, extra, options) => {
    const { fetch } = scriptedFetch(ok)
    let linePay: ReturnType<typeof createLinePayClient>
    try {
      linePay = createLinePayClient({ ...config, ...extra, fetch })
    } catch (error) {
      // Refusing it up front would be fine too.
      expect(isLinePayValidationError(error)).toBe(true)
      return
    }
    const outcome = await linePay.void({ transactionId: TX }, options).then(
      () => 'sent',
      (error: unknown) => error
    )
    expect(outcome === 'sent' || isLinePayError(outcome)).toBe(true)
  })
})

// Regression A3: in 0.9 the `timeout` of the configuration never took effect,
// because every operation passed its own default and overrode it.
describe('timeouts', () => {
  afterEach(closeServers)

  /** A LINE Pay that answers after `delayMs`. */
  async function slowServer(delayMs: number) {
    const { url } = await startServer((req, res) => {
      req.resume()
      setTimeout(() => {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(
          okTextFor(
            operationOf({
              url: new URL(req.url ?? '/', 'http://x').href,
              method: req.method ?? 'GET'
            })
          )
        )
      }, delayMs)
    })
    return url
  }

  const client = (baseUrl: string, extra: object = {}) =>
    createLinePayClient({ ...config, baseUrl, middleware: [], ...extra })

  it('applies the timeout of the configuration', async () => {
    const baseUrl = await slowServer(400)
    const started = Date.now()
    const error = await failure(
      client(baseUrl, { timeout: 100 }).confirm(confirmInput)
    )
    expect(isLinePayTimeoutError(error)).toBe(true)
    // Before the server would have answered (400 ms); the error says the rest.
    expect(Date.now() - started).toBeLessThan(400)
  })

  it('lets a per-operation timeout beat the general one', async () => {
    const baseUrl = await slowServer(250)
    const linePay = client(baseUrl, {
      timeout: 100,
      timeouts: { confirm: 2000 }
    })
    await expect(linePay.confirm(confirmInput)).resolves.toBeDefined()
    // other operations still use the general timeout
    expect(
      isLinePayTimeoutError(await failure(linePay.void({ transactionId: TX })))
    ).toBe(true)
  })

  it('lets the timeout of the call beat everything else', async () => {
    const baseUrl = await slowServer(250)
    const linePay = client(baseUrl, {
      timeout: 100,
      timeouts: { confirm: 2000 }
    })
    expect(
      isLinePayTimeoutError(
        await failure(linePay.confirm(confirmInput, { timeout: 50 }))
      )
    ).toBe(true)
    await expect(
      client(baseUrl, { timeout: 50 }).confirm(confirmInput, { timeout: 2000 })
    ).resolves.toBeDefined()
  })

  it('stops when the caller aborts', async () => {
    const baseUrl = await slowServer(1500)
    const controller = new AbortController()
    setTimeout(() => controller.abort('user left'), 50)
    const started = Date.now()
    const error = await failure(
      client(baseUrl).confirm(confirmInput, { signal: controller.signal })
    )
    expect(error.code).toBe('LINE_PAY_ABORT_ERROR')
    expect(Date.now() - started).toBeLessThan(1500)
  })
})
