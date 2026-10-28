import {
  createLinePayClient,
  isLinePayValidationError,
  LinePayTimeoutError,
  type Middleware
} from 'line-pay-merchant'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createPaymentService } from './payment-service'
import {
  createMemoryOrderStore,
  type Order,
  type OrderStore
} from './shared/orders'

// #region harness
const TX = '2021121300698360310'
const CONFIRM_URL_QUERY = `transactionId=${TX}&orderId=order-1`

const reply = (body: unknown) => new Response(JSON.stringify(body))
const ok = (info: unknown) =>
  reply({ returnCode: '0000', returnMessage: 'Success.', info })

const reservation = ok({
  transactionId: TX,
  paymentAccessToken: '1',
  paymentUrl: {
    web: 'https://sandbox-web-pay.line.me/web/payment/wait?x',
    app: 'line://pay/payment/x'
  }
})
const confirmation = ok({
  orderId: 'order-1',
  transactionId: TX,
  payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }],
  packages: []
})
const capturedPayment = ok([
  {
    transactionId: TX,
    orderId: 'order-1',
    transactionDate: '2026-10-27T00:00:10Z',
    transactionType: 'PAYMENT',
    payStatus: 'CAPTURE',
    productName: 'Tea',
    merchantName: 'Tea Shop',
    currency: 'TWD',
    payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }],
    packages: []
  }
])
// What Node.js throws when the connection breaks after the request was sent.
const connectionReset = () =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new Error('read ECONNRESET'), { code: 'ECONNRESET' })
  })

const newOrder = (patch: Partial<Order> = {}): Order => ({
  id: 'order-1',
  items: [{ name: 'Tea', quantity: 2, price: 500 }],
  total: 1000,
  status: 'created',
  updatedAt: new Date(),
  ...patch
})

/** A payment service whose LINE Pay answers with the given responses, in order. */
function setup(order: Order, ...answers: (Response | Error)[]) {
  const queue = [...answers]
  const fetch = vi.fn<typeof globalThis.fetch>(() => {
    const next = queue.shift()
    if (next === undefined) throw new Error('unexpected request to LINE Pay')
    // A Response can be read once: hand out a copy, so that it can be reused.
    return next instanceof Error
      ? Promise.reject(next)
      : Promise.resolve(next.clone())
  })
  const orders = createMemoryOrderStore([order])
  const linePay = createLinePayClient({
    channelId: '1234567890',
    channelSecretKey: 'channel-secret-key-for-tests',
    env: 'sandbox',
    fetch,
    // No retries: the tests decide what LINE Pay answers, call by call.
    middleware: []
  })
  const payments = createPaymentService({
    linePay,
    orders,
    siteUrl: 'https://shop.example',
    channelId: '1234567890'
  })
  return { payments, orders, fetch, queue }
}

// #endregion harness

/** The URL and the body of the n-th request that reached `fetch`. */
function sentRequest(fetch: ReturnType<typeof setup>['fetch'], index: number) {
  const [input, init] = fetch.mock.calls[index] ?? []
  return {
    url: input instanceof Request ? input.url : String(input),
    body: typeof init?.body === 'string' ? init.body : ''
  }
}

const status = async (orders: ReturnType<typeof setup>['orders']) =>
  (await orders.find('order-1'))?.status

beforeEach(() => {
  // Only the clock: the time limits of the requests keep running.
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-27T00:00:00Z'))
})
afterEach(() => {
  vi.useRealTimers()
})

describe('startCheckout', () => {
  it('reserves the payment and hands back the LINE Pay page', async () => {
    const { payments, orders } = setup(newOrder(), reservation)

    const url = await payments.startCheckout('order-1')

    expect(url).toBe('https://sandbox-web-pay.line.me/web/payment/wait?x')
    expect(await orders.find('order-1')).toMatchObject({
      status: 'awaiting-approval',
      transactionId: TX
    })
  })
})

describe('confirmPayment', () => {
  const awaiting = () =>
    newOrder({ status: 'awaiting-approval', transactionId: TX })

  it('confirms with the amount of the order and marks it paid', async () => {
    const { payments, orders, fetch } = setup(awaiting(), confirmation)

    const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(result.kind).toBe('paid')
    expect(await status(orders)).toBe('paid')
    const { url, body } = sentRequest(fetch, 0)
    expect(url).toContain(`/v4/payments/${TX}/confirm`)
    expect(JSON.parse(body)).toEqual({ amount: 1000, currency: 'TWD' })
  })

  it('does not call LINE Pay again when the user reloads the page', async () => {
    const { payments, fetch } = setup(awaiting(), confirmation)

    await payments.confirmPayment(CONFIRM_URL_QUERY)
    const again = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(again.kind).toBe('paid')
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  it('confirms once when two requests arrive together', async () => {
    const { payments, fetch } = setup(awaiting(), confirmation)

    const results = await Promise.all([
      payments.confirmPayment(CONFIRM_URL_QUERY),
      payments.confirmPayment(CONFIRM_URL_QUERY)
    ])

    expect(results.map(result => result.kind).sort()).toEqual([
      'in-progress',
      'paid'
    ])
    expect(fetch).toHaveBeenCalledTimes(1)
  })

  // #region forged-test
  it('refuses a transaction ID that is not 1 to 19 digits, before any lookup', async () => {
    const { payments, fetch } = setup(awaiting())

    const error: unknown = await payments
      .confirmPayment('transactionId=1/../refund')
      .catch((e: unknown) => e)

    expect(isLinePayValidationError(error)).toBe(true)
    expect(fetch).not.toHaveBeenCalled()
  })
  // #endregion forged-test

  it('answers unknown-order for a transaction that is not ours', async () => {
    const { payments, fetch } = setup(awaiting())

    const result = await payments.confirmPayment('transactionId=999')

    expect(result.kind).toBe('unknown-order')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('gives the order back to the user when LINE Pay refuses', async () => {
    const { payments, orders } = setup(
      awaiting(),
      reply({ returnCode: '1106', returnMessage: 'rejected' })
    )

    const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(result).toMatchObject({ kind: 'declined', returnCode: '1106' })
    expect(await status(orders)).toBe('awaiting-approval')
  })

  describe('when the connection breaks after confirm was sent', () => {
    // #region unknown-outcome-test
    it('finds the payment in the payment details and marks it paid', async () => {
      const { payments, orders, fetch } = setup(
        awaiting(),
        connectionReset(),
        capturedPayment
      )

      const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

      expect(result.kind).toBe('paid')
      expect(await status(orders)).toBe('paid')
      expect(fetch).toHaveBeenCalledTimes(2) // confirm, then the lookup
    })
    // #endregion unknown-outcome-test

    it('does not let the user try again at once when the payment is not there yet', async () => {
      // One look at the payment details right after a timeout proves little: they
      // can be late. The order stays "confirming" for the sweeper to look again.
      const { payments, orders } = setup(awaiting(), connectionReset(), ok([]))

      const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

      expect(result.kind).toBe('in-progress')
      expect(await status(orders)).toBe('confirming')
    })

    it('gives the order back when a second look, minutes later, still shows nothing', async () => {
      const { payments, orders, queue } = setup(
        awaiting(),
        connectionReset(),
        ok([])
      )
      await payments.confirmPayment(CONFIRM_URL_QUERY)

      vi.setSystemTime(Date.now() + 10 * 60_000)
      queue.push(ok([]))
      await payments.settlePending({
        olderThanMs: 5 * 60_000,
        giveUpAfterMs: 60 * 60_000
      })

      expect(await status(orders)).toBe('awaiting-approval')
    })

    it('finds the payment that showed up late, and never gives the order back', async () => {
      const { payments, orders, queue } = setup(
        awaiting(),
        connectionReset(),
        ok([]) // not in the payment details yet...
      )
      await payments.confirmPayment(CONFIRM_URL_QUERY)

      vi.setSystemTime(Date.now() + 10 * 60_000)
      queue.push(capturedPayment) // ...and there when the sweeper looks again
      await payments.settlePending({
        olderThanMs: 5 * 60_000,
        giveUpAfterMs: 60 * 60_000
      })

      expect(await status(orders)).toBe('paid')
    })

    it('keeps the order "confirming" when it cannot tell, and settles it later', async () => {
      const { payments, orders, queue } = setup(
        awaiting(),
        connectionReset(),
        connectionReset() // the lookup fails too
      )

      const result = await payments.confirmPayment(CONFIRM_URL_QUERY)
      expect(result.kind).toBe('in-progress')
      expect(await status(orders)).toBe('confirming')

      // Later, from a scheduled job: LINE Pay is reachable again.
      vi.setSystemTime(Date.now() + 10 * 60_000)
      queue.push(capturedPayment)
      await payments.settlePending({
        olderThanMs: 5 * 60_000,
        giveUpAfterMs: 60 * 60_000
      })

      expect(await status(orders)).toBe('paid')
    })

    it('hands the order to a person when it is still unclear after a long time', async () => {
      const { payments, orders, queue } = setup(
        awaiting(),
        connectionReset(),
        connectionReset()
      )
      await payments.confirmPayment(CONFIRM_URL_QUERY)

      vi.setSystemTime(Date.now() + 2 * 60 * 60_000)
      queue.push(connectionReset())
      await payments.settlePending({
        olderThanMs: 5 * 60_000,
        giveUpAfterMs: 60 * 60_000
      })

      expect(await status(orders)).toBe('needs-attention')
    })

    describe('one order that cannot be settled', () => {
      const order = (id: string, transactionId: string): Order =>
        newOrder({
          id,
          status: 'confirming',
          transactionId,
          pendingConfirm: {
            operation: 'confirm',
            startedAt: new Date(),
            channelId: '1234567890',
            transactionId,
            amount: 1000,
            currency: 'TWD'
          }
        })

      const sweepWith = (
        store: ReturnType<typeof createMemoryOrderStore>,
        ...answers: Response[]
      ) => {
        const linePay = createLinePayClient({
          channelId: '1234567890',
          channelSecretKey: 'channel-secret-key-for-tests',
          env: 'sandbox',
          fetch: () => {
            const answer = answers.shift()
            return answer === undefined
              ? Promise.reject(new Error('no answer was scripted'))
              : Promise.resolve(answer.clone())
          },
          middleware: []
        })
        const payments = createPaymentService({
          linePay,
          orders: store,
          siteUrl: 'https://shop.example',
          channelId: '1234567890'
        })
        vi.setSystemTime(Date.now() + 10 * 60_000)
        return payments.settlePending({
          olderThanMs: 5 * 60_000,
          giveUpAfterMs: 60 * 60_000
        })
      }

      it('is left for the next round when LINE Pay answers nonsense', async () => {
        const orders = createMemoryOrderStore([
          order('order-a', '2021121300698360001'),
          order('order-b', TX)
        ])

        await sweepWith(
          orders,
          new Response('<html>maintenance</html>', { status: 200 }),
          capturedPayment
        )

        expect((await orders.find('order-a'))?.status).toBe('confirming')
        expect((await orders.find('order-b'))?.status).toBe('paid')
      })

      it('does not hold up the others when the database fails, and is reported', async () => {
        const store = createMemoryOrderStore([
          order('order-a', TX),
          order('order-b', TX)
        ])
        const flaky = {
          ...store,
          transition: (...args: Parameters<typeof store.transition>) =>
            args[0] === 'order-a'
              ? Promise.reject(new Error('the database is down'))
              : store.transition(...args)
        }

        const sweep = sweepWith(flaky, capturedPayment, capturedPayment)

        await expect(sweep).rejects.toThrow(AggregateError)
        expect((await store.find('order-b'))?.status).toBe('paid')
        expect((await store.find('order-a'))?.status).toBe('confirming')
      })
    })

    it('settles an order whose process died before it heard back', async () => {
      // No error was ever seen. Only the context written down before the call
      // is left.
      const { payments, orders } = setup(
        newOrder({
          status: 'confirming',
          transactionId: TX,
          pendingConfirm: {
            operation: 'confirm',
            startedAt: new Date(),
            channelId: '1234567890',
            transactionId: TX,
            amount: 1000,
            currency: 'TWD'
          }
        }),
        capturedPayment
      )

      vi.setSystemTime(Date.now() + 10 * 60_000)
      await payments.settlePending({
        olderThanMs: 5 * 60_000,
        giveUpAfterMs: 60 * 60_000
      })

      expect(await status(orders)).toBe('paid')
    })
  })
})

// The order is touched by the request of the user, by a second request of the
// same user, and by the sweeper, and any of them may be slow. None of them may
// undo what another one has done.
describe('an order that more than one actor is at', () => {
  const CHANNEL = '1234567890'
  const connectionRefused = () =>
    Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        syscall: 'connect'
      })
    })

  const build = (
    orders: ReturnType<typeof createMemoryOrderStore>,
    fetch: typeof globalThis.fetch,
    extra: { middleware?: Middleware[] } = {}
  ) =>
    createPaymentService({
      linePay: createLinePayClient({
        channelId: CHANNEL,
        channelSecretKey: 'channel-secret-key-for-tests',
        env: 'sandbox',
        fetch,
        middleware: extra.middleware ?? []
      }),
      orders,
      siteUrl: 'https://shop.example',
      channelId: CHANNEL
    })

  const awaiting = () =>
    newOrder({ status: 'awaiting-approval', transactionId: TX })
  /** An order the way the service leaves it, the channel on the record. */
  const confirming = (
    claimId: string,
    channelId: string | null = CHANNEL
  ): Order =>
    newOrder({
      status: 'confirming',
      transactionId: TX,
      claimId,
      pendingConfirm: {
        operation: 'confirm',
        startedAt: new Date(),
        ...(channelId === null ? {} : { channelId }),
        transactionId: TX,
        amount: 1000,
        currency: 'TWD'
      }
    })
  const sweep = (payments: ReturnType<typeof build>) => {
    vi.setSystemTime(Date.now() + 10 * 60_000)
    return payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })
  }

  it('is marked paid even though a sweeper gave it back while the lookup was going on', async () => {
    const orders = createMemoryOrderStore([awaiting()])
    let calls = 0
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      calls++
      if (calls === 1) throw connectionReset() // the confirm
      // The lookup is slow. Meanwhile the sweeper looked, saw nothing yet, and
      // gave the order back.
      await orders.transition(
        'order-1',
        { status: 'confirming' },
        'awaiting-approval'
      )
      return capturedPayment.clone()
    })

    const result = await build(orders, fetch).confirmPayment(CONFIRM_URL_QUERY)

    expect(result.kind).toBe('paid')
    expect(await status(orders)).toBe('paid')
  })

  it('tells what the order is now when another actor handed it to a person first', async () => {
    // The payment is for another order ID, and the sweeper saw that first.
    const orders = createMemoryOrderStore([
      newOrder({
        status: 'awaiting-approval',
        transactionId: TX,
        linePayOrderId: 'order-1-aaaaaaaa'
      })
    ])
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await orders.transition(
        'order-1',
        { status: 'confirming' },
        'needs-attention'
      )
      return confirmation.clone()
    })

    const result = await build(orders, fetch).confirmPayment(CONFIRM_URL_QUERY)

    expect(result).toMatchObject({
      kind: 'in-progress',
      order: { status: 'needs-attention' }
    })
  })

  it('does not say paid when it could not be marked paid', async () => {
    // The payment is there, but the order is in a state that nothing leads to
    // paid from: a record that does not match what the user is told.
    const orders = createMemoryOrderStore([awaiting()])
    const stuck = {
      ...orders,
      transition: (...args: Parameters<typeof orders.transition>) =>
        args[2] === 'paid'
          ? Promise.resolve(undefined)
          : orders.transition(...args)
    }
    let calls = 0
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      calls++ === 0
        ? Promise.reject(connectionReset())
        : Promise.resolve(capturedPayment.clone())
    )

    const result = await build(stuck, fetch).confirmPayment(CONFIRM_URL_QUERY)

    expect(result.kind).toBe('in-progress')
  })

  it('does not give back the claim of a newer request when a slow one fails', async () => {
    // Request A fails "not sent" only after the sweeper gave A's claim back and
    // request B took the order. A's release must not undo B's claim.
    const orders = createMemoryOrderStore([awaiting()])
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await orders.transition(
        'order-1',
        { status: 'confirming' },
        'awaiting-approval'
      )
      await orders.transition(
        'order-1',
        { status: 'awaiting-approval' },
        'confirming',
        { claimId: 'claim-b' }
      )
      throw connectionRefused()
    })

    const result = await build(orders, fetch).confirmPayment(CONFIRM_URL_QUERY)

    expect(result).toMatchObject({ kind: 'retry', order: { id: 'order-1' } })
    expect(await orders.find('order-1')).toMatchObject({
      status: 'confirming',
      claimId: 'claim-b'
    })
  })

  it('does not touch an order whose claim changed hands while the sweeper was looking', async () => {
    const orders = createMemoryOrderStore([confirming('claim-a')])
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      await orders.transition(
        'order-1',
        { status: 'confirming', claimId: 'claim-a' },
        'awaiting-approval'
      )
      await orders.transition(
        'order-1',
        { status: 'awaiting-approval' },
        'confirming',
        { claimId: 'claim-b' }
      )
      return ok([]).clone()
    })

    await sweep(build(orders, fetch))

    expect(await orders.find('order-1')).toMatchObject({
      status: 'confirming',
      claimId: 'claim-b'
    })
  })

  it('leaves an order in progress when the error has nothing to look the call up with', async () => {
    // An unknown outcome from further in (a deadline middleware, say) carries no
    // context. It is not "never sent" and not "refused": the sweeper has the
    // record that was written before the call.
    const deadline: Middleware = () =>
      Promise.reject(new LinePayTimeoutError({ timeoutMs: 1000 }))
    const orders = createMemoryOrderStore([awaiting()])
    const fetch = vi.fn<typeof globalThis.fetch>()

    const result = await build(orders, fetch, {
      middleware: [deadline]
    }).confirmPayment(CONFIRM_URL_QUERY)

    expect(result.kind).toBe('in-progress')
    expect(await status(orders)).toBe('confirming')
  })

  it('writes the channel of the client on the record it makes before it confirms', async () => {
    const orders = createMemoryOrderStore([awaiting()])
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(confirmation.clone())
    )

    await build(orders, fetch).confirmPayment(CONFIRM_URL_QUERY)

    expect((await orders.find('order-1'))?.pendingConfirm).toMatchObject({
      operation: 'confirm',
      channelId: CHANNEL,
      transactionId: TX,
      amount: 1000
    })
  })

  it('does not look a payment up with the credentials of another channel', async () => {
    // A worker started with the wrong credentials sees no payments at all, and
    // that would read as "it did not happen".
    const orders = createMemoryOrderStore([confirming('claim-a', 'another')])
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(ok([]).clone())
    )

    await sweep(build(orders, fetch))

    expect(fetch).not.toHaveBeenCalled()
    expect(await status(orders)).toBe('confirming')
  })

  it('does not give an order back on a record that does not say which channel it is of', async () => {
    // "Nothing found" proves nothing for it: the sweeper may be on the wrong
    // credentials. The order is left to a person, as one whose answer is unclear.
    const orders = createMemoryOrderStore([confirming('claim-a', null)])
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(ok([]).clone())
    )

    await sweep(build(orders, fetch))

    expect(fetch).toHaveBeenCalledTimes(1)
    expect(await status(orders)).toBe('confirming')
  })

  it('settles the other orders when the answer for one of them is malformed', async () => {
    const OTHER_TX = '2021121300698360311'
    const order = (id: string, transactionId: string): Order => ({
      ...confirming(`claim-${id}`),
      id,
      transactionId,
      pendingConfirm: {
        operation: 'confirm',
        startedAt: new Date(),
        channelId: CHANNEL,
        transactionId,
        amount: 1000,
        currency: 'TWD'
      }
    })
    const orders = createMemoryOrderStore([
      order('order-1', TX),
      order('order-2', OTHER_TX)
    ])
    const fetch = vi.fn<typeof globalThis.fetch>(input => {
      const url = input instanceof Request ? input.url : String(input)
      return Promise.resolve(
        url.includes(OTHER_TX)
          ? ok([
              {
                transactionId: OTHER_TX,
                orderId: 'order-2',
                transactionDate: '2026-10-27T00:00:10Z',
                transactionType: 'PAYMENT',
                payStatus: 'CAPTURE',
                productName: 'Tea',
                merchantName: 'Tea Shop',
                currency: 'TWD',
                payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }],
                packages: []
              }
            ])
          : // 0000 and no "info" at all
            reply({ returnCode: '0000', returnMessage: 'Success.' })
      )
    })

    await sweep(build(orders, fetch))

    expect((await orders.find('order-2'))?.status).toBe('paid')
    // Not paid, not given back, not given up on: a person can still be asked.
    expect((await orders.find('order-1'))?.status).toBe('confirming')
  })
})

describe('startCheckout, when it goes wrong', () => {
  const build = (
    orders: ReturnType<typeof createMemoryOrderStore>,
    fetch: typeof globalThis.fetch
  ) =>
    createPaymentService({
      linePay: createLinePayClient({
        channelId: '1234567890',
        channelSecretKey: 'channel-secret-key-for-tests',
        env: 'sandbox',
        fetch,
        middleware: []
      }),
      orders,
      siteUrl: 'https://shop.example',
      channelId: '1234567890'
    })

  const reserved = (transactionId: string) =>
    ok({
      transactionId,
      paymentAccessToken: '1',
      paymentUrl: {
        web: `https://sandbox-web-pay.line.me/web/payment/wait?tx=${transactionId}`,
        app: 'line://pay/payment/x'
      }
    })

  it('asks again with a new order ID after an answer that never came', async () => {
    // LINE Pay may have kept the order ID of the first try. Asking with the same
    // one would be refused as a duplicate, however often it is repeated.
    const orders = createMemoryOrderStore([newOrder()])
    const orderIds: string[] = []
    let calls = 0
    const fetch = vi.fn<typeof globalThis.fetch>((_input, init) => {
      const sent: unknown = JSON.parse(
        typeof init?.body === 'string' ? init.body : '{}'
      )
      orderIds.push(
        typeof sent === 'object' &&
          sent !== null &&
          'orderId' in sent &&
          typeof sent.orderId === 'string'
          ? sent.orderId
          : ''
      )
      return calls++ === 0
        ? Promise.reject(connectionReset())
        : Promise.resolve(reservation.clone())
    })
    const payments = build(orders, fetch)

    await expect(payments.startCheckout('order-1')).rejects.toMatchObject({
      outcome: 'unknown'
    })
    expect(await status(orders)).toBe('created')
    await payments.startCheckout('order-1')

    expect(orderIds).toHaveLength(2)
    expect(orderIds[0]).not.toBe(orderIds[1])
    for (const id of orderIds) expect(id).toMatch(/^order-1-[0-9a-f]{8}$/)
    expect(await status(orders)).toBe('awaiting-approval')
  })

  it('lets a user who cancelled at LINE Pay pay again, with a reservation of its own', async () => {
    // The cancel page only sends the user back to the shop: the order is still
    // "awaiting-approval". Without a way back from there the user could never pay.
    const orders = createMemoryOrderStore([newOrder()])
    let calls = 0
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(reserved(`2021121300698360${++calls}00`).clone())
    )
    const payments = build(orders, fetch)

    await payments.startCheckout('order-1')
    const first = (await orders.find('order-1'))?.transactionId
    const again = await payments.startCheckout('order-1')

    const second = (await orders.find('order-1'))?.transactionId
    expect(second).not.toBe(first)
    expect(again).toContain(`tx=${second ?? ''}`)
    // The old reservation is not the order's any more: confirming it finds no
    // order, so it is never confirmed and expires.
    expect(
      await payments.confirmPayment(`transactionId=${first ?? ''}`)
    ).toEqual({ kind: 'unknown-order' })
  })

  it('does not restart an order that is being confirmed or is paid', async () => {
    for (const status of ['confirming', 'paid', 'needs-attention'] as const) {
      const orders = createMemoryOrderStore([newOrder({ status })])
      const fetch = vi.fn<typeof globalThis.fetch>(() =>
        Promise.resolve(reserved(TX).clone())
      )
      await expect(
        build(orders, fetch).startCheckout('order-1'),
        status
      ).rejects.toThrow(/cannot be paid/)
      expect(fetch).not.toHaveBeenCalled()
    }
  })

  it('does not send the user to a reservation that lost the race of two clicks', async () => {
    const orders = createMemoryOrderStore([newOrder()])
    let calls = 0
    const fetch = vi.fn<typeof globalThis.fetch>(() =>
      Promise.resolve(reserved(`2021121300698360${++calls}00`).clone())
    )
    const payments = build(orders, fetch)

    const results = await Promise.allSettled([
      payments.startCheckout('order-1'),
      payments.startCheckout('order-1')
    ])

    expect(results.map(result => result.status).sort()).toEqual([
      'fulfilled',
      'rejected'
    ])
    const winner = results.find(
      (result): result is PromiseFulfilledResult<string> =>
        result.status === 'fulfilled'
    )
    if (winner === undefined) expect.unreachable('one checkout should win')
    const order = await orders.find('order-1')
    // The order knows the transaction the user was sent to, and no other.
    expect(winner.value).toContain(`tx=${order?.transactionId ?? ''}`)
  })
})

describe('startCheckout: the order ID of LINE Pay', () => {
  it('keeps the order ID it sent, to compare with the payment later', async () => {
    const { payments, orders, fetch } = setup(newOrder(), reservation)

    await payments.startCheckout('order-1')

    const sent: unknown = JSON.parse(sentRequest(fetch, 0).body)
    const kept = (await orders.find('order-1'))?.linePayOrderId
    expect(kept).toMatch(/^order-1-[0-9a-f]{8}$/)
    expect(sent).toMatchObject({ orderId: kept })
  })
})

describe('confirmPayment: what a user and the shop are told', () => {
  const awaiting = () =>
    newOrder({ status: 'awaiting-approval', transactionId: TX })
  // What Node.js throws when the connection could not be made at all.
  const connectionRefused = () =>
    Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        syscall: 'connect'
      })
    })

  it('tells the user to try again, and gives the order back, when the request never left', async () => {
    const { payments, orders } = setup(awaiting(), connectionRefused())

    const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(result).toMatchObject({ kind: 'retry' })
    expect(await status(orders)).toBe('awaiting-approval')
  })

  it('hands an order that has no record of the confirm to a person, without a lookup', async () => {
    const { payments, orders, fetch } = setup(
      newOrder({ status: 'confirming', transactionId: TX, claimId: 'claim-a' })
    )

    vi.setSystemTime(Date.now() + 10 * 60_000)
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })

    expect(await status(orders)).toBe('needs-attention')
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('onPaid: fulfilment', () => {
  const CHANNEL = '1234567890'
  const awaiting = (patch: Partial<Order> = {}) =>
    newOrder({ status: 'awaiting-approval', transactionId: TX, ...patch })

  const build = (
    orders: ReturnType<typeof createMemoryOrderStore>,
    answers: Response[],
    onPaid: (order: Order) => Promise<void>
  ) =>
    createPaymentService({
      linePay: createLinePayClient({
        channelId: CHANNEL,
        channelSecretKey: 'channel-secret-key-for-tests',
        env: 'sandbox',
        fetch: () => {
          const answer = answers.shift()
          return answer === undefined
            ? Promise.reject(new Error('no answer was scripted'))
            : Promise.resolve(answer.clone())
        },
        middleware: []
      }),
      orders,
      siteUrl: 'https://shop.example',
      channelId: CHANNEL,
      onPaid
    })

  it('runs once, for the request that made the order paid, not for the loser or a reload', async () => {
    const orders = createMemoryOrderStore([awaiting()])
    const fulfilled: Order[] = []
    const payments = build(orders, [confirmation, confirmation], order => {
      fulfilled.push(order)
      return Promise.resolve()
    })

    const results = await Promise.all([
      payments.confirmPayment(CONFIRM_URL_QUERY),
      payments.confirmPayment(CONFIRM_URL_QUERY)
    ])
    const reload = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(results.map(result => result.kind)).toContain('paid')
    expect(reload.kind).toBe('paid')
    expect(fulfilled).toHaveLength(1)
    expect(fulfilled[0]).toMatchObject({ id: 'order-1', status: 'paid' })
  })

  it('has finished when confirmPayment answers', async () => {
    const orders = createMemoryOrderStore([awaiting()])
    const fulfilled: string[] = []
    const payments = build(orders, [confirmation], async order => {
      await new Promise<void>(resolve => setTimeout(resolve, 5))
      fulfilled.push(order.id)
    })

    await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(fulfilled).toEqual(['order-1'])
  })

  it('does not run for an order that another process made paid first', async () => {
    const orders = createMemoryOrderStore([awaiting()])
    const fulfilled: Order[] = []
    const payments = createPaymentService({
      linePay: createLinePayClient({
        channelId: CHANNEL,
        channelSecretKey: 'channel-secret-key-for-tests',
        env: 'sandbox',
        fetch: async () => {
          // While LINE Pay answers, a sweeper of another process finds the
          // payment, marks the order paid and fulfils it.
          await orders.transition('order-1', { status: 'confirming' }, 'paid')
          return confirmation.clone()
        },
        middleware: []
      }),
      orders,
      siteUrl: 'https://shop.example',
      channelId: CHANNEL,
      onPaid: order => {
        fulfilled.push(order)
        return Promise.resolve()
      }
    })

    const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(result).toMatchObject({ kind: 'paid', order: { status: 'paid' } })
    expect(fulfilled).toHaveLength(0)
  })

  it('lets the error of the hook through, with the order paid and not fulfilled again', async () => {
    const orders = createMemoryOrderStore([awaiting()])
    let calls = 0
    const payments = build(orders, [confirmation], () => {
      calls++
      return Promise.reject(new Error('the mail server is down'))
    })

    await expect(payments.confirmPayment(CONFIRM_URL_QUERY)).rejects.toThrow(
      'the mail server is down'
    )

    // The money is taken and the order is paid: whoever reloads is told so, and
    // the hook is not run again. This is what the outbox is for.
    expect(await orders.find('order-1')).toMatchObject({ status: 'paid' })
    expect((await payments.confirmPayment(CONFIRM_URL_QUERY)).kind).toBe('paid')
    expect(calls).toBe(1)
  })

  it('runs for an order that the sweeper found paid', async () => {
    const orders = createMemoryOrderStore([
      newOrder({
        status: 'confirming',
        transactionId: TX,
        claimId: 'claim-a',
        pendingConfirm: {
          operation: 'confirm',
          startedAt: new Date(),
          channelId: CHANNEL,
          transactionId: TX,
          amount: 1000,
          currency: 'TWD'
        }
      })
    ])
    const fulfilled: Order[] = []
    const payments = build(
      orders,
      [capturedPayment, capturedPayment],
      order => {
        fulfilled.push(order)
        return Promise.resolve()
      }
    )

    vi.setSystemTime(Date.now() + 10 * 60_000)
    const sweep = () =>
      payments.settlePending({
        olderThanMs: 5 * 60_000,
        giveUpAfterMs: 60 * 60_000
      })
    await sweep()
    await sweep()

    expect(fulfilled).toHaveLength(1)
    expect(fulfilled[0]).toMatchObject({ status: 'paid' })
  })

  it('marks the order paid when the payment carries the order ID that was reserved', async () => {
    const orders = createMemoryOrderStore([
      awaiting({ linePayOrderId: 'order-1' })
    ])
    const fulfilled: Order[] = []
    const payments = build(orders, [confirmation], order => {
      fulfilled.push(order)
      return Promise.resolve()
    })

    const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(result.kind).toBe('paid')
    expect(fulfilled).toHaveLength(1)
  })

  it('does not mark the order paid when the payment carries another order ID', async () => {
    // Money moved, and not for this order: a person looks, nothing is fulfilled.
    const orders = createMemoryOrderStore([
      awaiting({ linePayOrderId: 'order-1-aaaaaaaa' })
    ])
    const fulfilled: Order[] = []
    const payments = build(orders, [confirmation], order => {
      fulfilled.push(order)
      return Promise.resolve()
    })

    const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

    // What the caller is told is the order as it is now, not as it was read.
    expect(result).toMatchObject({
      kind: 'in-progress',
      order: { status: 'needs-attention' }
    })
    expect(await orders.find('order-1')).toMatchObject({
      status: 'needs-attention'
    })
    expect(fulfilled).toHaveLength(0)
  })

  it('compares the order ID of a payment found by reconcile too', async () => {
    const orders = createMemoryOrderStore([
      newOrder({
        status: 'confirming',
        transactionId: TX,
        claimId: 'claim-a',
        linePayOrderId: 'order-1-aaaaaaaa',
        pendingConfirm: {
          operation: 'confirm',
          startedAt: new Date(),
          channelId: CHANNEL,
          transactionId: TX,
          amount: 1000,
          currency: 'TWD'
        }
      })
    ])
    const fulfilled: Order[] = []
    const payments = build(orders, [capturedPayment], order => {
      fulfilled.push(order)
      return Promise.resolve()
    })

    vi.setSystemTime(Date.now() + 10 * 60_000)
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })

    expect(await orders.find('order-1')).toMatchObject({
      status: 'needs-attention'
    })
    expect(fulfilled).toHaveLength(0)
  })
})

/** A store that answers a moment later, as a database does. */
function slow(store: OrderStore): OrderStore {
  const pause = () => new Promise<void>(resolve => setTimeout(resolve, 1))
  return {
    find: async id => {
      await pause()
      return store.find(id)
    },
    findByTransactionId: async transactionId => {
      await pause()
      return store.findByTransactionId(transactionId)
    },
    findStale: async (status, before) => {
      await pause()
      return store.findStale(status, before)
    },
    transition: async (id, when, to, patch) => {
      await pause()
      return store.transition(id, when, to, patch)
    }
  }
}

// Every step has to wait for the one before it. A memory store answers at once,
// so a forgotten `await` would not show; this one makes it show.
describe('with a store that answers later', () => {
  const CHANNEL = '1234567890'
  const build = (
    memory: ReturnType<typeof createMemoryOrderStore>,
    answers: (Response | Error)[],
    onPaid?: (order: Order) => Promise<void>
  ) => {
    const queue = [...answers]
    return createPaymentService({
      linePay: createLinePayClient({
        channelId: CHANNEL,
        channelSecretKey: 'channel-secret-key-for-tests',
        env: 'sandbox',
        fetch: () => {
          const next = queue.shift()
          if (next === undefined) {
            return Promise.reject(new Error('no answer was scripted'))
          }
          return next instanceof Error
            ? Promise.reject(next)
            : Promise.resolve(next.clone())
        },
        middleware: []
      }),
      orders: slow(memory),
      siteUrl: 'https://shop.example',
      channelId: CHANNEL,
      ...(onPaid === undefined ? {} : { onPaid })
    })
  }
  const awaiting = (patch: Partial<Order> = {}) =>
    newOrder({ status: 'awaiting-approval', transactionId: TX, ...patch })
  const confirming = (patch: Partial<Order> = {}) =>
    newOrder({
      status: 'confirming',
      transactionId: TX,
      claimId: 'claim-a',
      pendingConfirm: {
        operation: 'confirm',
        startedAt: new Date(),
        channelId: CHANNEL,
        transactionId: TX,
        amount: 1000,
        currency: 'TWD'
      },
      ...patch
    })
  const refused = () => reply({ returnCode: '1106', returnMessage: 'rejected' })
  const connectionRefused = () =>
    Object.assign(new TypeError('fetch failed'), {
      cause: Object.assign(new Error('connect ECONNREFUSED'), {
        code: 'ECONNREFUSED',
        syscall: 'connect'
      })
    })
  const sweep = (
    payments: ReturnType<typeof build>,
    giveUpAfterMs = 60 * 60_000
  ) => {
    vi.setSystemTime(Date.now() + 10 * 60_000)
    return payments.settlePending({ olderThanMs: 5 * 60_000, giveUpAfterMs })
  }

  it('has paid when confirmPayment says so, and has fulfilled once', async () => {
    const memory = createMemoryOrderStore([awaiting()])
    const fulfilled: Order[] = []
    const payments = build(memory, [confirmation], order => {
      fulfilled.push(order)
      return Promise.resolve()
    })

    const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

    expect(result.kind).toBe('paid')
    expect((await memory.find('order-1'))?.status).toBe('paid')
    expect(fulfilled).toHaveLength(1)
  })

  it('has given the order back when confirmPayment says declined or retry', async () => {
    for (const [answer, kind] of [
      [refused(), 'declined'],
      [connectionRefused(), 'retry']
    ] as const) {
      const memory = createMemoryOrderStore([awaiting()])

      const result = await build(memory, [answer]).confirmPayment(
        CONFIRM_URL_QUERY
      )

      expect(result.kind).toBe(kind)
      expect((await memory.find('order-1'))?.status).toBe('awaiting-approval')
    }
  })

  it('has flagged an order whose payment is another order ID, before it says so', async () => {
    const memory = createMemoryOrderStore([
      awaiting({ linePayOrderId: 'order-1-aaaaaaaa' })
    ])

    const result = await build(memory, [confirmation]).confirmPayment(
      CONFIRM_URL_QUERY
    )

    expect(result.kind).toBe('in-progress')
    expect((await memory.find('order-1'))?.status).toBe('needs-attention')
  })

  it('has settled what a sweep says it settled', async () => {
    const paid = createMemoryOrderStore([confirming()])
    await sweep(build(paid, [capturedPayment]))
    expect((await paid.find('order-1'))?.status).toBe('paid')

    const given = createMemoryOrderStore([confirming()])
    await sweep(build(given, [ok([])]))
    expect((await given.find('order-1'))?.status).toBe('awaiting-approval')

    const flagged = createMemoryOrderStore([
      confirming({ linePayOrderId: 'order-1-aaaaaaaa' })
    ])
    await sweep(build(flagged, [capturedPayment]))
    expect((await flagged.find('order-1'))?.status).toBe('needs-attention')

    const none = createMemoryOrderStore([
      confirming({ pendingConfirm: undefined })
    ])
    await sweep(build(none, []))
    expect((await none.find('order-1'))?.status).toBe('needs-attention')
  })

  it('has handed an order that stays unclear to a person, but only after the time it was given', async () => {
    const early = createMemoryOrderStore([confirming()])
    await sweep(build(early, [connectionReset()]), 60 * 60_000)
    expect((await early.find('order-1'))?.status).toBe('confirming')

    const late = createMemoryOrderStore([confirming()])
    await sweep(build(late, [connectionReset()]), 60_000)
    expect((await late.find('order-1'))?.status).toBe('needs-attention')
  })

  it('has reserved the payment when startCheckout says so', async () => {
    const memory = createMemoryOrderStore([newOrder()])

    const url = await build(memory, [reservation]).startCheckout('order-1')

    expect(url).toBe('https://sandbox-web-pay.line.me/web/payment/wait?x')
    expect(await memory.find('order-1')).toMatchObject({
      status: 'awaiting-approval',
      transactionId: TX
    })
  })
})

describe('what the service refuses or leaves alone', () => {
  it('does not start an order that does not exist', async () => {
    const { payments, fetch } = setup(newOrder())

    await expect(payments.startCheckout('nope')).rejects.toThrow(
      /Order nope cannot be paid/
    )
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reserves with the amount of the order, in TWD, and the URLs of the site', async () => {
    const { payments, fetch } = setup(newOrder(), reservation)

    await payments.startCheckout('order-1')

    const sent: unknown = JSON.parse(sentRequest(fetch, 0).body)
    expect(sent).toMatchObject({
      amount: 1000,
      currency: 'TWD',
      packages: [
        {
          id: 'order-1',
          amount: 1000,
          products: [{ name: 'Tea', quantity: 2, price: 500 }]
        }
      ],
      redirectUrls: {
        confirmUrl: 'https://shop.example/line-pay/confirm',
        cancelUrl: 'https://shop.example/line-pay/cancel'
      }
    })
  })

  it.each(['created', 'confirming', 'needs-attention'] as const)(
    'does not confirm an order that is %s',
    async status => {
      const { payments, fetch } = setup(newOrder({ status, transactionId: TX }))

      const result = await payments.confirmPayment(CONFIRM_URL_QUERY)

      expect(result.kind).toBe('in-progress')
      expect(fetch).not.toHaveBeenCalled()
      expect((await payments.confirmPayment(CONFIRM_URL_QUERY)).kind).toBe(
        'in-progress'
      )
    }
  )

  it('lets an error that is not from the library go, and leaves the order as it is', async () => {
    const bug: Middleware = () => {
      throw new TypeError('a bug of ours')
    }
    const orders = createMemoryOrderStore([
      newOrder({ status: 'awaiting-approval', transactionId: TX })
    ])
    const payments = createPaymentService({
      linePay: createLinePayClient({
        channelId: '1234567890',
        channelSecretKey: 'channel-secret-key-for-tests',
        env: 'sandbox',
        fetch: () => Promise.reject(new Error('not reached')),
        middleware: [bug]
      }),
      orders,
      siteUrl: 'https://shop.example',
      channelId: '1234567890'
    })

    await expect(payments.confirmPayment(CONFIRM_URL_QUERY)).rejects.toThrow(
      TypeError
    )

    expect((await orders.find('order-1'))?.status).toBe('confirming')
  })

  it('leaves an order alone that is not old enough, and only then', async () => {
    const { payments, orders, fetch } = setup(
      newOrder({
        status: 'confirming',
        transactionId: TX,
        claimId: 'claim-a',
        pendingConfirm: {
          operation: 'confirm',
          startedAt: new Date(),
          channelId: '1234567890',
          transactionId: TX,
          amount: 1000,
          currency: 'TWD'
        }
      }),
      capturedPayment
    )

    // One minute: younger than the five the sweep waits for.
    vi.setSystemTime(Date.now() + 60_000)
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })
    expect(fetch).not.toHaveBeenCalled()
    expect(await status(orders)).toBe('confirming')

    // Six minutes: old enough.
    vi.setSystemTime(Date.now() + 5 * 60_000)
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })
    expect(await status(orders)).toBe('paid')
  })

  it('gives up on an order only after the time it was given has passed', async () => {
    const { payments, orders } = setup(
      newOrder({
        status: 'confirming',
        transactionId: TX,
        claimId: 'claim-a',
        pendingConfirm: {
          operation: 'confirm',
          startedAt: new Date(),
          channelId: '1234567890',
          transactionId: TX,
          amount: 1000,
          currency: 'TWD'
        }
      }),
      connectionReset(),
      connectionReset()
    )

    // Exactly the time given: not yet.
    vi.setSystemTime(Date.now() + 10 * 60_000)
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 10 * 60_000
    })
    expect(await status(orders)).toBe('confirming')

    // A moment later.
    vi.setSystemTime(Date.now() + 1)
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 10 * 60_000
    })
    expect(await status(orders)).toBe('needs-attention')
  })
})
