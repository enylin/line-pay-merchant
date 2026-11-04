import { describe, expect, it, vi } from 'vitest'

import { createLinePayClient } from '../client'
import type {
  AnyCallContext,
  AnyResult,
  CallContext,
  Middleware
} from '../client-types'
import { isLinePayMiddlewareError, needsReconcile } from '../errors'
import type { OperationName } from '../operations/names'
import {
  CHANNEL_ID,
  INPUTS,
  messageOf,
  SAMPLES,
  SECRET,
  TX
} from '../test/helpers'
import { compose, resultOf } from './pipeline'

const startedAt = new Date('2026-10-27T00:00:00Z')

const ctx: AnyCallContext = {
  operation: 'confirm',
  input: { transactionId: TX, amount: 1, currency: 'TWD' },
  options: {},
  startedAt,
  client: createLinePayClient({
    channelId: CHANNEL_ID,
    channelSecretKey: SECRET,
    env: 'sandbox'
  })
}

/** A result of confirm that can be told from another by its message. */
const result = (marker: string): AnyResult => ({
  body: { ...SAMPLES.confirm, returnMessage: marker },
  meta: { operation: 'confirm', startedAt, durationMs: 0, attempts: 1 }
})

describe('compose', () => {
  it('runs the terminal step when there is no middleware', async () => {
    const terminal = vi.fn(() => Promise.resolve(result('t')))
    expect(await compose([], terminal)(ctx)).toEqual(result('t'))
    expect(terminal).toHaveBeenCalledWith(ctx)
  })

  it('puts the first middleware on the outside', async () => {
    const order: string[] = []
    const layer =
      (name: string): Middleware =>
      async (_ctx, next) => {
        order.push(`${name}:before`)
        const out = await next()
        order.push(`${name}:after`)
        return out
      }
    const terminal = () => {
      order.push('terminal')
      return Promise.resolve(result('t'))
    }
    await compose([layer('a'), layer('b')], terminal)(ctx)
    expect(order).toEqual([
      'a:before',
      'b:before',
      'terminal',
      'b:after',
      'a:after'
    ])
  })

  it('lets a middleware call next() more than once', async () => {
    const terminal = vi.fn(() => Promise.resolve(result('t')))
    const inner = vi.fn<Middleware>((_ctx, next) => next())
    const twice: Middleware = async (_ctx, next) => {
      await next()
      return next()
    }
    await compose([twice, inner], terminal)(ctx)
    expect(inner).toHaveBeenCalledTimes(2)
    expect(terminal).toHaveBeenCalledTimes(2)
  })

  it('lets a middleware answer without calling next()', async () => {
    const terminal = vi.fn(() => Promise.resolve(result('t')))
    const shortCircuit: Middleware = () => Promise.resolve(result('cached'))
    expect(await compose([shortCircuit], terminal)(ctx)).toEqual(
      result('cached')
    )
    expect(terminal).not.toHaveBeenCalled()
  })

  it('turns a synchronous throw into a rejection', async () => {
    const broken: Middleware = () => {
      throw new Error('sync failure')
    }
    await expect(
      compose([broken], () => Promise.resolve(result('t')))(ctx)
    ).rejects.toThrow('sync failure')
  })

  it('hands errors to the middleware outside', async () => {
    const catcher: Middleware = async (_ctx, next) => {
      try {
        return await next()
      } catch {
        return result('recovered')
      }
    }
    const out = await compose([catcher], () =>
      Promise.reject(new Error('inner failure'))
    )(ctx)
    expect(out).toEqual(result('recovered'))
  })
})

describe('resultOf', () => {
  const meta = { startedAt, durationMs: 5, attempts: 2 }
  const callOf = <K extends OperationName>(operation: K): CallContext<K> => ({
    operation,
    input: INPUTS[operation],
    options: {},
    startedAt,
    client: ctx.client
  })

  it('hands back the body and the meta of a result of that operation', () => {
    const received: AnyResult = {
      body: SAMPLES.refund,
      meta: { operation: 'refund', ...meta }
    }
    const checked = resultOf(callOf('refund'), received, CHANNEL_ID)
    expect(checked.body).toBe(SAMPLES.refund)
    expect(checked.meta).toBe(received.meta)
  })

  it('accepts every operation its own sample', () => {
    expect(
      resultOf(
        callOf('request'),
        {
          body: SAMPLES.request,
          meta: { operation: 'request', ...meta }
        },
        CHANNEL_ID
      ).body.info.transactionId
    ).toBe(TX)
    expect(
      resultOf(
        callOf('paymentDetails'),
        {
          body: SAMPLES.paymentDetails,
          meta: { operation: 'paymentDetails', ...meta }
        },
        CHANNEL_ID
      ).body.info
    ).toHaveLength(1)
  })

  const refusal = (wrong: AnyResult) => {
    try {
      resultOf(callOf('refund'), wrong, CHANNEL_ID)
    } catch (error) {
      return error
    }
    return expect.unreachable('the result of another operation was accepted')
  }

  it('refuses a body that another operation would have returned', () => {
    // A middleware that answers a refund with the result of a confirm.
    const error = refusal({
      body: SAMPLES.confirm,
      meta: { operation: 'refund', ...meta }
    })
    expect(isLinePayMiddlewareError(error)).toBe(true)
    expect(messageOf(error)).toBe(
      'A middleware returned something that is not the result of refund'
    )
  })

  it('refuses a body that is cut short', () => {
    const error = refusal({
      body: { returnCode: '0000', returnMessage: 'ok' },
      meta: { operation: 'refund', ...meta }
    })
    expect(isLinePayMiddlewareError(error)).toBe(true)
  })

  it('does not know whether the request went out, and lets the call be looked up', () => {
    const error = refusal({
      body: SAMPLES.confirm,
      meta: { operation: 'refund', ...meta }
    })
    if (!isLinePayMiddlewareError(error)) expect.unreachable()
    expect(error.outcome).toBe('unknown')
    expect(error.operation).toBe('refund')
    expect(error.context).toEqual({
      operation: 'refund',
      startedAt,
      channelId: CHANNEL_ID,
      transactionId: TX,
      refundAmount: 20
    })
    expect(needsReconcile(error)).toBe(true)
    // The numbers of a result that was never read are not a fact about the call.
    expect(error.meta).toBeUndefined()
  })
})
