import { afterEach, describe, expect, it, vi } from 'vitest'

import { createLinePayClient } from '../client'
import type { LinePayClient } from '../client-types'
import { resolveConfig } from '../config'
import {
  isLinePayHttpError,
  isLinePayValidationError,
  needsReconcile
} from '../errors'
import { OPERATION_NAMES, type OperationName } from '../operations/names'
import { at } from '../test/at'
import {
  applyUntyped,
  callContext,
  CHANNEL_ID,
  detailsResponse,
  expectValidSignature,
  failure,
  fetchFailed,
  INPUTS,
  json,
  ok,
  okFor,
  paymentInfo,
  raw,
  REG_KEY,
  scriptedFetch,
  SECRET,
  success,
  TX,
  untyped
} from '../test/helpers'
import { createRandom, digits, HOSTILE_CHARS, seedOf } from '../test/random'
import { createExecutor } from './execute'

const config = {
  channelId: CHANNEL_ID,
  channelSecretKey: SECRET,
  env: 'sandbox'
} as const
const HOST = 'https://sandbox-api-pay.line.me'

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const run = (
  client: LinePayClient,
  operation: OperationName,
  input: unknown,
  options?: object
) => untyped(client, operation, input, options)

/** One valid input per operation, and the request it must become (V4 paths, written by hand). */
const CALLS: Record<
  OperationName,
  { input: unknown; method: string; url: string; body?: string }
> = {
  request: {
    input: {
      amount: 100,
      currency: 'TWD',
      orderId: 'o-1',
      packages: [
        {
          id: 'p1',
          amount: 100,
          products: [{ name: 'Tea', quantity: 1, price: 100 }]
        }
      ],
      redirectUrls: {
        confirmUrl: 'https://shop.example/c',
        cancelUrl: 'https://shop.example/x'
      }
    },
    method: 'POST',
    url: `${HOST}/v4/payments/request`,
    body: '{"amount":100,"currency":"TWD","orderId":"o-1","packages":[{"id":"p1","amount":100,"products":[{"name":"Tea","quantity":1,"price":100}]}],"redirectUrls":{"confirmUrl":"https://shop.example/c","cancelUrl":"https://shop.example/x"}}'
  },
  confirm: {
    input: { transactionId: TX, amount: 100, currency: 'TWD' },
    method: 'POST',
    url: `${HOST}/v4/payments/${TX}/confirm`,
    body: '{"amount":100,"currency":"TWD"}'
  },
  capture: {
    input: { transactionId: TX, amount: 100, currency: 'TWD' },
    method: 'POST',
    url: `${HOST}/v4/payments/authorizations/${TX}/capture`,
    body: '{"amount":100,"currency":"TWD"}'
  },
  void: {
    input: { transactionId: TX },
    method: 'POST',
    url: `${HOST}/v4/payments/authorizations/${TX}/void`,
    body: '{}'
  },
  refund: {
    input: { transactionId: TX, refundAmount: 20 },
    method: 'POST',
    url: `${HOST}/v4/payments/${TX}/refund`,
    body: '{"refundAmount":20}'
  },
  paymentDetails: {
    input: { transactionId: [TX], orderId: ['a', 'b'] },
    method: 'GET',
    url: `${HOST}/v4/payments?transactionId=${TX}&orderId=a&orderId=b`
  },
  // No query: no question mark either.
  checkPaymentStatus: {
    input: { transactionId: TX },
    method: 'GET',
    url: `${HOST}/v4/payments/requests/${TX}/check`
  },
  checkRegKey: {
    input: { regKey: REG_KEY },
    method: 'GET',
    url: `${HOST}/v4/payments/preapprovedPay/${REG_KEY}/check`
  },
  payPreapproved: {
    input: {
      regKey: REG_KEY,
      productName: 'Tea',
      amount: 100,
      currency: 'TWD',
      orderId: 'o-1'
    },
    method: 'POST',
    url: `${HOST}/v4/payments/preapprovedPay/${REG_KEY}/payment`,
    body: '{"productName":"Tea","amount":100,"currency":"TWD","orderId":"o-1"}'
  },
  expireRegKey: {
    input: { regKey: REG_KEY },
    method: 'POST',
    url: `${HOST}/v4/payments/preapprovedPay/${REG_KEY}/expire`,
    body: '{}'
  }
}

/** The defaults of docs/en/guide/configuration.md, "Timeouts". */
const DOCUMENTED_DEFAULT_MS: Record<OperationName, number> = {
  request: 20_000,
  confirm: 40_000,
  capture: 60_000,
  void: 20_000,
  refund: 20_000,
  paymentDetails: 60_000,
  checkPaymentStatus: 20_000,
  checkRegKey: 20_000,
  payPreapproved: 40_000,
  expireRegKey: 20_000
}

describe('executor: what is sent', () => {
  it.each(OPERATION_NAMES)(
    '%s sends exactly the documented request, signed',
    async operation => {
      const expected = CALLS[operation]
      const { fetch, calls } = scriptedFetch(ok)
      await run(
        createLinePayClient({ ...config, fetch, middleware: [] }),
        operation,
        expected.input
      )

      expect(calls).toHaveLength(1)
      expect(calls[0]).toMatchObject({
        method: expected.method,
        url: expected.url,
        body: expected.body
      })
      expectValidSignature(at(calls, 0))
    }
  )

  it('adds the query of checkRegKey only when there is one', async () => {
    const { fetch, calls } = scriptedFetch(ok)
    const client = createLinePayClient({ ...config, fetch, middleware: [] })
    await client.checkRegKey({ regKey: REG_KEY, creditCardAuth: false })
    expect(at(calls, 0).url).toBe(
      `${HOST}/v4/payments/preapprovedPay/${REG_KEY}/check?creditCardAuth=false`
    )
    expectValidSignature(at(calls, 0))
  })

  it('signs exactly what goes on the wire, for random query values and bodies', async () => {
    // The apostrophe is among them: the URL parser rewrites it to %27, and the
    // signature has to be of the URL that is sent.
    const chars = HOSTILE_CHARS
    const random = createRandom(seedOf(0x51_6e))
    const { fetch, calls } = scriptedFetch()
    const client = createLinePayClient({ ...config, fetch, middleware: [] })
    for (let i = 0; i < 150; i++) {
      const orderIds = Array.from({ length: random.int(1, 3) }, () =>
        random.string(chars, 1, 12)
      )
      const transactionIds = Array.from({ length: random.int(0, 2) }, () =>
        digits(random, random.int(1, 19))
      )
      await client.paymentDetails({
        orderId: orderIds,
        transactionId: transactionIds
      })
      await client.payPreapproved({
        regKey: REG_KEY,
        productName: random.string([...chars, '\uD800'], 1, 20),
        amount: random.int(1, 99_999) / 100,
        currency: 'TWD',
        orderId: random.string(chars, 1, 30)
      })
    }
    for (const [i, call] of calls.entries()) {
      // What fetch puts on the wire is the URL as the WHATWG parser writes it.
      expect(
        new URL(call.url).href,
        `seed=${random.seed} call=${i} ${call.url}`
      ).toBe(call.url)
      expectValidSignature(call)
    }
  })

  // encodeURIComponent leaves ' as it is, but the URL parser of fetch sends it as %27
  // in a query. The signature has to cover what the server receives.
  it('signs the query that is sent when a value contains an apostrophe', async () => {
    const { fetch, calls } = scriptedFetch(success([]))
    const client = createLinePayClient({ ...config, fetch, middleware: [] })
    await client.paymentDetails({ orderId: ["O'Brien-1"] })
    expect(new URL(at(calls, 0).url).href).toBe(at(calls, 0).url)
    expectValidSignature(at(calls, 0))
  })

  // A lone UTF-16 surrogate in a query value makes encodeURIComponent throw a
  // URIError: it must come out as a library error, or be sent.
  it('refuses a query value with a lone surrogate, and sends nothing', async () => {
    // It cannot be encoded: half of a surrogate pair is no text.
    const { fetch, calls } = scriptedFetch(success([]))
    const client = createLinePayClient({ ...config, fetch, middleware: [] })

    const error = await failure(
      client.paymentDetails({ orderId: ['order-\uD800'] })
    )

    expect(isLinePayValidationError(error)).toBe(true)
    expect(error).toMatchObject({ outcome: 'not-sent' })
    expect(error.message).toMatch(/half of a surrogate pair/)
    expect(calls).toHaveLength(0)
  })
})

describe('executor: what holds with validate: false', () => {
  const withoutBusinessRules = () => {
    const { fetch, calls } = scriptedFetch(ok)
    return {
      calls,
      client: createLinePayClient({
        ...config,
        validate: false,
        fetch,
        middleware: []
      })
    }
  }

  it.each([
    ['an amount that is there without a value', { refundAmount: undefined }],
    ['a misspelled amount', { refundAmout: 5 }],
    ['an amount that JSON writes as null', { refundAmount: Number.NaN }],
    ['an amount of 0', { refundAmount: 0 }]
  ])('refuses a refund with %s, and sends nothing', async (_what, fields) => {
    const { client, calls } = withoutBusinessRules()
    const error = await failure(
      run(client, 'refund', { transactionId: TX, ...fields })
    )
    expect(error).toMatchObject({
      code: 'LINE_PAY_VALIDATION_ERROR',
      outcome: 'not-sent'
    })
    expect(calls).toHaveLength(0)
  })

  it('still refunds everything when the amount is left out on purpose', async () => {
    const { client, calls } = withoutBusinessRules()
    await run(client, 'refund', { transactionId: TX })
    expect(at(calls, 0).body).toBe('{}')
  })

  it('does switch the business rules off', async () => {
    // An amount of 0 is a business rule of confirm; the path is checked all the same.
    const { client, calls } = withoutBusinessRules()
    await run(client, 'confirm', {
      transactionId: TX,
      amount: 0,
      currency: 'TWD'
    })
    expect(calls).toHaveLength(1)
    await expect(
      run(client, 'confirm', {
        transactionId: '../x',
        amount: 1,
        currency: 'TWD'
      })
    ).rejects.toMatchObject({ code: 'LINE_PAY_VALIDATION_ERROR' })
  })
})

describe('executor: time limits', () => {
  /** The milliseconds the transport sets its timer to for one call. */
  async function timeoutOf(
    operation: OperationName,
    extra: object,
    options?: object
  ): Promise<number | undefined> {
    const spy = vi.spyOn(globalThis, 'setTimeout')
    const { fetch } = scriptedFetch(ok)
    await run(
      createLinePayClient({ ...config, ...extra, fetch, middleware: [] }),
      operation,
      CALLS[operation].input,
      options
    )
    // The first timer of the call is the time limit: middleware is off.
    const ms = spy.mock.calls.find(
      ([, delay]) => typeof delay === 'number'
    )?.[1]
    spy.mockRestore()
    return ms
  }

  it.each(OPERATION_NAMES)(
    '%s waits as long as the documentation says by default',
    async operation => {
      expect(await timeoutOf(operation, {})).toBe(
        DOCUMENTED_DEFAULT_MS[operation]
      )
    }
  )

  it.each(OPERATION_NAMES)(
    '%s: the call beats timeouts[operation], which beats timeout',
    async operation => {
      const other = operation === 'request' ? 'confirm' : 'request'
      expect(await timeoutOf(operation, { timeout: 1111 })).toBe(1111)
      expect(
        await timeoutOf(operation, {
          timeout: 1111,
          timeouts: { [operation]: 2222 }
        })
      ).toBe(2222)
      expect(
        await timeoutOf(
          operation,
          { timeout: 1111, timeouts: { [operation]: 2222 } },
          { timeout: 3333 }
        )
      ).toBe(3333)
      expect(await timeoutOf(operation, { timeouts: { [other]: 4444 } })).toBe(
        DOCUMENTED_DEFAULT_MS[operation]
      )
      expect(await timeoutOf(operation, {}, { timeout: 5555 })).toBe(5555)
    }
  )
})

describe('executor: the context of an error', () => {
  it('dates it from when the call began, so that reconcile finds a refund made during the call', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-27T00:00:00.400Z'))
    const { fetch } = scriptedFetch(
      () => {
        // LINE Pay makes the refund two seconds in; the answer is lost three seconds later.
        vi.setSystemTime(new Date('2026-10-27T00:00:05Z'))
        return Promise.reject(fetchFailed('ECONNRESET'))
      },
      detailsResponse(
        paymentInfo({
          refundList: [
            {
              refundTransactionId: '2021121300698360311',
              transactionType: 'PARTIAL_REFUND',
              refundAmount: -20,
              refundTransactionDate: '2026-10-27T00:00:02Z'
            }
          ]
        })
      )
    )
    const client = createLinePayClient({ ...config, fetch, middleware: [] })

    const error = await failure(
      client.refund({ transactionId: TX, refundAmount: 20 })
    )

    expect(error.context?.startedAt.toISOString()).toBe(
      '2026-10-27T00:00:00.400Z'
    )
    expect(await client.reconcile(error)).toMatchObject({ status: 'applied' })
  })
})

describe('executor: a response that is not what the operation promises', () => {
  const clientFor = (...steps: Parameters<typeof scriptedFetch>) =>
    createLinePayClient({
      ...config,
      fetch: scriptedFetch(...steps).fetch,
      middleware: []
    })

  // They all have an info that the type says is there.
  const WITH_INFO = [
    'request',
    'confirm',
    'capture',
    'refund',
    'paymentDetails',
    'payPreapproved'
  ] as const

  it.each(WITH_INFO)(
    '%s: a success without its info is not taken for one',
    async operation => {
      const body = { returnCode: '0000', returnMessage: 'Success.' }
      const client = clientFor(json(body))

      const error = await failure(untyped(client, operation, INPUTS[operation]))

      expect(error).toMatchObject({
        code: 'LINE_PAY_HTTP_ERROR',
        reason: 'unexpected-shape',
        httpStatus: 200,
        outcome: 'unknown',
        operation
      })
      // What was received stays with the error, for whoever has to look at it.
      if (!isLinePayHttpError(error)) throw error
      expect(error.body).toEqual(body)
    }
  )

  it.each(['confirm', 'capture', 'refund', 'payPreapproved'] as const)(
    '%s: and so it is looked up, as an unknown outcome is',
    async operation => {
      const client = clientFor(
        json({ returnCode: '0000', returnMessage: 'Success.' })
      )
      const error = await failure(untyped(client, operation, INPUTS[operation]))
      expect(needsReconcile(error)).toBe(true)
      expect(error.context).toMatchObject({ operation })
    }
  )

  it.each(['request', 'paymentDetails'] as const)(
    '%s: there is nothing to look up for it',
    async operation => {
      const client = clientFor(
        json({ returnCode: '0000', returnMessage: 'Success.' })
      )
      const error = await failure(untyped(client, operation, INPUTS[operation]))
      expect(needsReconcile(error)).toBe(false)
    }
  )

  it.each([
    ['an HTML page', '<html>Bad gateway</html>'],
    ['JSON without a return code', '{"info":{"transactionId":"1"}}']
  ])(
    'keeps invalid-response for %s: it is not a LINE Pay response at all',
    async (_what, text) => {
      const client = clientFor(raw(text))
      const error = await failure(
        client.confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
      )
      expect(error).toMatchObject({
        code: 'LINE_PAY_HTTP_ERROR',
        reason: 'invalid-response',
        outcome: 'unknown'
      })
    }
  )

  it('refuses an ID that is a number: the IDs of LINE Pay are strings', async () => {
    // 19 digits come as strings, because they do not fit a number. A short one
    // would stay a number, and the type says string.
    const client = clientFor(
      raw(
        '{"returnCode":"0000","returnMessage":"ok","info":{"orderId":"o","transactionId":123,"payInfo":[]}}'
      )
    )
    const error = await failure(
      client.confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
    )
    expect(error).toMatchObject({ reason: 'unexpected-shape' })
  })

  it('refuses a field of the wrong type deep inside', async () => {
    const client = clientFor(
      json({
        returnCode: '0000',
        returnMessage: 'ok',
        info: {
          orderId: 'o',
          transactionId: TX,
          payInfo: [{ method: 'CREDIT_CARD', amount: '1000' }]
        }
      })
    )
    const error = await failure(
      client.confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
    )
    expect(error).toMatchObject({ reason: 'unexpected-shape' })
  })

  it('does not look at the body of a failure, only at its return code', async () => {
    const client = clientFor(
      json({ returnCode: '1172', returnMessage: 'duplicate' })
    )
    const error = await failure(
      client.confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
    )
    expect(error).toMatchObject({
      code: 'LINE_PAY_API_ERROR',
      returnCode: '1172'
    })
  })

  it('gives a result its type only after the body has been checked', async () => {
    const client = clientFor(okFor('confirm'))
    const { body } = await client.confirm({
      transactionId: TX,
      amount: 1000,
      currency: 'TWD'
    })
    expect(body.info.payInfo).toEqual([{ method: 'CREDIT_CARD', amount: 1000 }])
    expect(body.info.transactionId).toBe(TX)
  })
})

describe("executor: an error that is not the library's", () => {
  it('is let through as it is, with nothing added to it', async () => {
    const boom = new Error('the system has no randomness')
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw boom
    })
    const { fetch, calls } = scriptedFetch()
    const client = createLinePayClient({ ...config, fetch, middleware: [] })

    const thrown = await client
      .confirm({ transactionId: TX, amount: 1000, currency: 'TWD' })
      .then(
        () => undefined,
        (error: unknown) => error
      )

    expect(thrown).toBe(boom)
    expect(Object.keys(boom)).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('executor: an input that cannot be read', () => {
  it('lets what it throws through as it is, with nothing added to it', async () => {
    // Not an input a client lets through (it is copied first), but the executor
    // is the last step and does not rely on that.
    const boom = new RangeError('the input would not be read')
    const hostile = new Proxy(
      {},
      {
        get() {
          throw boom
        }
      }
    )
    const { fetch, calls } = scriptedFetch()
    const execute = createExecutor(resolveConfig({ ...config, fetch }))

    const thrown = await Promise.resolve(
      applyUntyped(execute, [{ ...callContext('confirm'), input: hostile }])
    ).then(
      () => undefined,
      (error: unknown) => error
    )

    expect(thrown).toBe(boom)
    expect(Object.keys(boom)).toEqual([])
    expect(calls).toHaveLength(0)
  })
})

describe('executor: the duration of a call', () => {
  it('is the time from the start of the call to its answer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-27T00:00:00Z'))
    const client = createLinePayClient({
      ...config,
      middleware: [],
      fetch: () => {
        // The answer comes 1.234 seconds after the call began.
        vi.setSystemTime(Date.now() + 1234)
        return Promise.resolve(okFor('confirm'))
      }
    })

    const { meta } = await client.confirm(INPUTS.confirm)

    expect(meta.durationMs).toBe(1234)
  })
})
