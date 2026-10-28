import { getEventListeners } from 'node:events'

import { describe, expect, it, vi } from 'vitest'

import type { AnyCallContext, AnyResult } from '../client-types'
import {
  isLinePayAbortError,
  LinePayAbortError,
  LinePayApiError,
  type LinePayError,
  LinePayHttpError,
  LinePayNetworkError,
  LinePayTimeoutError,
  LinePayValidationError
} from '../errors'
import { at } from '../test/at'
import { callContext, failure, SAMPLES } from '../test/helpers'
import { retryWhenNotSent } from './retry-when-not-sent'

const context = callContext

const success = (): AnyResult => ({
  body: SAMPLES.confirm,
  meta: {
    operation: 'confirm',
    startedAt: new Date(),
    durationMs: 1,
    attempts: 1,
    httpStatus: 200
  }
})

const notSent = () =>
  new LinePayNetworkError({ reason: 'connection-refused', outcome: 'not-sent' })
const unknownNetwork = () =>
  new LinePayNetworkError({ reason: 'connection-reset', outcome: 'unknown' })
const timeout = () => new LinePayTimeoutError({ timeoutMs: 1000 })
const http502 = () =>
  new LinePayHttpError({
    httpStatus: 502,
    reason: 'http-status',
    outcome: 'unknown'
  })

/** `next` that fails with the given errors, then succeeds. */
function failing(...errors: LinePayError[]) {
  const queue = [...errors]
  return vi.fn(() => {
    const error = queue.shift()
    return error === undefined
      ? Promise.resolve(success())
      : Promise.reject(error)
  })
}

const instant = () =>
  vi.fn((_ms: number, _signal?: AbortSignal) => Promise.resolve())

describe('retryWhenNotSent: what it repeats', () => {
  it('passes a success through untouched', async () => {
    const next = failing()
    const result = await retryWhenNotSent()(context('confirm'), next)
    expect(next).toHaveBeenCalledTimes(1)
    expect(result.meta.attempts).toBe(1)
  })

  it.each(['confirm', 'refund', 'request', 'payPreapproved'] as const)(
    'repeats %s when the request never left',
    async operation => {
      const sleep = instant()
      const next = failing(notSent(), notSent())
      const result = await retryWhenNotSent({ sleep })(context(operation), next)
      expect(next).toHaveBeenCalledTimes(3)
      expect(sleep).toHaveBeenCalledTimes(2)
      expect(result.meta.attempts).toBe(3)
      expect(result.meta.durationMs).toBeGreaterThanOrEqual(100)
    }
  )

  // The reason this middleware exists in this form: version 0.9 retried timeouts.
  it.each([
    ['a timeout', timeout],
    ['a connection that was cut', unknownNetwork],
    ['an HTTP 502', http502]
  ])(
    'does not repeat a money-moving operation after %s',
    async (_name, make) => {
      for (const operation of [
        'confirm',
        'capture',
        'void',
        'refund',
        'payPreapproved'
      ] as const) {
        const next = failing(make())
        await expect(
          retryWhenNotSent({ sleep: instant() })(context(operation), next)
        ).rejects.toBeInstanceOf(Error)
        expect(next).toHaveBeenCalledTimes(1)
      }
    }
  )

  it.each([
    ['a timeout', timeout],
    ['a connection that was cut', unknownNetwork],
    ['an HTTP 502', http502]
  ])('repeats a read after %s', async (_name, make) => {
    for (const operation of [
      'paymentDetails',
      'checkPaymentStatus',
      'checkRegKey'
    ] as const) {
      const next = failing(make())
      const result = await retryWhenNotSent({ sleep: instant() })(
        context(operation),
        next
      )
      expect(next).toHaveBeenCalledTimes(2)
      expect(result.meta.attempts).toBe(2)
    }
  })

  it.each([
    ['a validation error', () => new LinePayValidationError({ issues: [] })],
    [
      'a LINE Pay error',
      () =>
        new LinePayApiError({
          body: { returnCode: '1106', returnMessage: 'm' },
          httpStatus: 200
        })
    ],
    [
      'an HTTP 403',
      () =>
        new LinePayHttpError({
          httpStatus: 403,
          reason: 'http-status',
          outcome: 'rejected'
        })
    ],
    [
      'an abort',
      () => new LinePayAbortError({ abortReason: 'stop', outcome: 'unknown' })
    ]
  ])('never repeats %s, not even a read', async (_name, make) => {
    const error = make()
    const next = failing(error)
    await expect(
      retryWhenNotSent({ sleep: instant() })(context('paymentDetails'), next)
    ).rejects.toBe(error)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('does not repeat an error that is not from this library', async () => {
    const next = vi.fn(() => Promise.reject(new Error('boom')))
    await expect(retryWhenNotSent()(context('confirm'), next)).rejects.toThrow(
      'boom'
    )
    expect(next).toHaveBeenCalledTimes(1)
  })

  // Whatever a middleware further in throws, it comes out the same, once.
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'boom'],
    ['a number', 42],
    [
      'a plain object that looks like an unknown outcome',
      { outcome: 'unknown' }
    ]
  ])('throws %s as it is, without trying again', async (_name, thrown) => {
    for (const operation of ['paymentDetails', 'confirm'] as const) {
      const next = vi.fn(() => Promise.reject(thrown))
      await expect(
        retryWhenNotSent({ sleep: instant() })(context(operation), next)
      ).rejects.toBe(thrown)
      expect(next).toHaveBeenCalledTimes(1)
    }
  })

  it('hands back the very result of a first attempt that worked', async () => {
    const result = success()
    const next = vi.fn(() => Promise.resolve(result))
    await expect(retryWhenNotSent()(context('confirm'), next)).resolves.toBe(
      result
    )
  })
})

describe('retryWhenNotSent: a check that places an authorization on the card', () => {
  /** A caller in plain JavaScript may pass anything as `creditCardAuth`. */
  const checking = (creditCardAuth: unknown): AnyCallContext => ({
    ...context('checkRegKey'),
    operation: 'checkRegKey',
    // @ts-expect-error `creditCardAuth` is not a boolean here, on purpose
    input: { regKey: 'RK1', creditCardAuth }
  })

  it.each([
    ['without creditCardAuth', undefined],
    ['with creditCardAuth false', false]
  ])(
    'repeats a check %s after an unknown outcome, as the read it is',
    async (_name, creditCardAuth) => {
      const next = failing(timeout())
      const result = await retryWhenNotSent({ sleep: instant() })(
        checking(creditCardAuth),
        next
      )
      expect(result.meta.attempts).toBe(2)
    }
  )

  it.each([
    ['true', true],
    ['a string that is sent as true', 'true'],
    ['a number', 1]
  ])(
    'does not repeat a check with creditCardAuth %s after an unknown outcome',
    async (_name, creditCardAuth) => {
      // The card could be authorized again.
      const next = failing(timeout(), timeout())
      await expect(
        retryWhenNotSent({ sleep: instant() })(checking(creditCardAuth), next)
      ).rejects.toBeInstanceOf(LinePayTimeoutError)
      expect(next).toHaveBeenCalledTimes(1)
    }
  )

  it('still repeats it when the request provably never left', async () => {
    const next = failing(notSent())
    const result = await retryWhenNotSent({ sleep: instant() })(
      checking({ regKey: 'RK1', creditCardAuth: true }),
      next
    )
    expect(result.meta.attempts).toBe(2)
  })

  it('does not take a call whose input cannot be read at all for a read', async () => {
    const unreadable: AnyCallContext = {
      ...context('checkRegKey'),
      operation: 'checkRegKey',
      input: Object.defineProperty({ regKey: 'RK1' }, 'creditCardAuth', {
        enumerable: true,
        get(): boolean {
          throw new Error('boom')
        }
      })
    }
    const next = failing(timeout(), timeout())

    await expect(
      retryWhenNotSent({ sleep: instant() })(unreadable, next)
    ).rejects.toBeInstanceOf(LinePayTimeoutError)
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('does not take a call whose input it cannot read for a read', async () => {
    const hostile = {
      get creditCardAuth(): boolean {
        throw new Error('boom')
      }
    }
    const next = failing(timeout(), timeout())
    await expect(
      retryWhenNotSent({ sleep: instant() })(checking(hostile), next)
    ).rejects.toBeInstanceOf(LinePayTimeoutError)
    expect(next).toHaveBeenCalledTimes(1)
  })
})

describe('retryWhenNotSent: pacing', () => {
  it('stops after maxAttempts and throws the last error', async () => {
    const sleep = instant()
    const last = notSent()
    const next = failing(notSent(), notSent(), last, notSent())
    await expect(
      retryWhenNotSent({ sleep })(context('confirm'), next)
    ).rejects.toBe(last)
    expect(next).toHaveBeenCalledTimes(3)
    expect(sleep).toHaveBeenCalledTimes(2)
  })

  it('honours a custom maxAttempts', async () => {
    const errors = [notSent(), notSent(), notSent(), notSent()]
    const next = failing(...errors)
    await expect(
      retryWhenNotSent({ maxAttempts: 1, sleep: instant() })(
        context('confirm'),
        next
      )
    ).rejects.toBe(errors[0])
    expect(next).toHaveBeenCalledTimes(1)
  })

  it('waits with capped exponential backoff and full jitter', async () => {
    const sleep = instant()
    const next = failing(notSent(), notSent(), notSent(), notSent(), notSent())
    await retryWhenNotSent({
      maxAttempts: 6,
      baseDelayMs: 100,
      maxDelayMs: 350,
      random: () => 1,
      sleep
    })(context('confirm'), next)
    // ceilings: 100, 200, 350 (400 capped), 350, 350
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
      100, 200, 350, 350, 350
    ])
  })

  it('starts at 200 ms, doubles, and stops growing at 2 s when nothing is set', async () => {
    const sleep = instant()
    const next = failing(
      notSent(),
      notSent(),
      notSent(),
      notSent(),
      notSent(),
      notSent(),
      notSent()
    )
    await retryWhenNotSent({ maxAttempts: 8, random: () => 1, sleep })(
      context('confirm'),
      next
    )
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([
      200, 400, 800, 1600, 2000, 2000, 2000
    ])
  })

  it('gives its default of three attempts', async () => {
    const errors = [notSent(), notSent(), notSent(), notSent()]
    const next = failing(...errors)
    await expect(
      retryWhenNotSent({ sleep: instant() })(context('confirm'), next)
    ).rejects.toBe(errors[2])
    expect(next).toHaveBeenCalledTimes(3)
  })

  it('reports the time of the whole call, the waits included', async () => {
    const result = await retryWhenNotSent({ sleep: instant() })(
      context('confirm'),
      failing(notSent())
    )
    // The context says the call began 100 ms ago.
    expect(result.meta.attempts).toBe(2)
    expect(result.meta.durationMs).toBeGreaterThanOrEqual(100)
    expect(result.meta.durationMs).toBeLessThan(5000)
  })

  it('scales each wait by the random factor', async () => {
    const sleep = instant()
    await retryWhenNotSent({ baseDelayMs: 200, random: () => 0.5, sleep })(
      context('confirm'),
      failing(notSent(), notSent())
    )
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([100, 200])
  })

  it('passes the caller signal to the timer', async () => {
    const controller = new AbortController()
    const sleep = instant()
    await retryWhenNotSent({ sleep })(
      context('confirm', controller.signal),
      failing(notSent())
    )
    expect(at(sleep.mock.calls, 0)[1]).toBe(controller.signal)
  })
})

describe('retryWhenNotSent: what an error says about the call', () => {
  it('counts the attempts when it gives up, and the time they took', async () => {
    const ctx = context('confirm')
    const error = await failure(
      retryWhenNotSent({ sleep: instant() })(
        ctx,
        failing(notSent(), notSent(), notSent())
      )
    )

    expect(error.meta).toMatchObject({
      operation: 'confirm',
      startedAt: ctx.startedAt,
      attempts: 3
    })
    // The context says the call began 100 ms ago.
    expect(error.meta?.durationMs).toBeGreaterThanOrEqual(100)
    // Nothing came back, so there is no status to tell.
    expect(error.meta).not.toHaveProperty('httpStatus')
  })

  it('says one attempt for an error it does not repeat, and the status of the answer', async () => {
    const refused = new LinePayApiError({
      body: { returnCode: '1106', returnMessage: 'refused' },
      httpStatus: 200
    })
    const error = await failure(
      retryWhenNotSent({ sleep: instant() })(
        context('confirm'),
        failing(refused)
      )
    )

    expect(error).toBe(refused)
    expect(error.meta).toMatchObject({
      operation: 'confirm',
      attempts: 1,
      httpStatus: 200
    })
  })

  it('leaves what a step further in said when nothing was repeated', async () => {
    const said = new LinePayHttpError({
      httpStatus: 503,
      reason: 'http-status',
      outcome: 'unknown'
    })
    const meta = {
      operation: 'confirm',
      startedAt: new Date('2026-10-27T00:00:00Z'),
      durationMs: 7,
      attempts: 4,
      httpStatus: 503
    } as const
    said.meta = meta

    const error = await failure(
      retryWhenNotSent({ sleep: instant() })(context('confirm'), failing(said))
    )

    expect(error).toBe(said)
    expect(error.meta).toBe(meta)
  })

  it('tells the status of the last response of a read that kept failing', async () => {
    const bad = () =>
      new LinePayHttpError({
        httpStatus: 503,
        reason: 'http-status',
        outcome: 'unknown'
      })
    const error = await failure(
      retryWhenNotSent({ sleep: instant() })(
        context('paymentDetails'),
        failing(bad(), bad(), bad())
      )
    )

    expect(error.meta).toMatchObject({
      operation: 'paymentDetails',
      attempts: 3,
      httpStatus: 503
    })
  })

  it('replaces what the attempt that failed counted with the totals', async () => {
    const attempt = notSent()
    attempt.meta = {
      operation: 'confirm',
      startedAt: new Date(),
      durationMs: 0,
      attempts: 1
    }
    const error = await failure(
      retryWhenNotSent({ maxAttempts: 2, sleep: instant() })(
        context('confirm'),
        failing(notSent(), attempt)
      )
    )

    expect(error).toBe(attempt)
    expect(error.meta?.attempts).toBe(2)
    expect(error.meta?.durationMs).toBeGreaterThanOrEqual(100)
  })

  it('keeps the status of the last answer when the caller gives up during the wait', async () => {
    const last = new LinePayHttpError({
      httpStatus: 503,
      reason: 'http-status',
      outcome: 'unknown'
    })
    const controller = new AbortController()
    const sleep = (_ms: number, signal?: AbortSignal) => {
      controller.abort('enough')
      return Promise.reject(
        new LinePayAbortError({
          abortReason: signal?.reason,
          outcome: 'not-sent'
        })
      )
    }

    const error = await failure(
      retryWhenNotSent({ sleep })(
        context('paymentDetails', controller.signal),
        failing(last)
      )
    )

    if (!isLinePayAbortError(error)) throw error
    expect(error.meta).toMatchObject({
      operation: 'paymentDetails',
      attempts: 1,
      httpStatus: 503
    })
    expect(error.meta?.durationMs).toBeGreaterThanOrEqual(100)
  })

  it('counts the attempts when the caller gives up during the second wait', async () => {
    const controller = new AbortController()
    let waits = 0
    const sleep = (_ms: number, signal?: AbortSignal) => {
      waits += 1
      if (waits < 2) return Promise.resolve()
      controller.abort('enough')
      return Promise.reject(
        new LinePayAbortError({
          abortReason: signal?.reason,
          outcome: 'not-sent'
        })
      )
    }

    const error = await failure(
      retryWhenNotSent({ sleep })(
        context('confirm', controller.signal),
        failing(notSent(), notSent(), notSent())
      )
    )

    if (!isLinePayAbortError(error)) throw error
    expect(error.meta).toMatchObject({ operation: 'confirm', attempts: 2 })
    expect(error.meta).not.toHaveProperty('httpStatus')
  })
})

describe('retryWhenNotSent: the default timer', () => {
  it('really waits, and then succeeds', async () => {
    const started = Date.now()
    const result = await retryWhenNotSent({
      baseDelayMs: 30,
      maxDelayMs: 30,
      random: () => 1
    })(context('confirm'), failing(notSent()))
    expect(result.meta.attempts).toBe(2)
    expect(Date.now() - started).toBeGreaterThanOrEqual(25)
  })

  it('stops waiting when the caller aborts', async () => {
    const controller = new AbortController()
    setTimeout(() => controller.abort('enough'), 20)
    const started = Date.now()
    const error = await failure(
      retryWhenNotSent({
        baseDelayMs: 2000,
        maxDelayMs: 2000,
        random: () => 1
      })(context('confirm', controller.signal), failing(notSent()))
    )
    if (!isLinePayAbortError(error)) throw error
    expect(error.outcome).toBe('not-sent')
    expect(Date.now() - started).toBeLessThan(1000)
  })

  it('says what its last attempt said when the caller aborts while it waits', async () => {
    // A read that timed out, then the caller gave up during the backoff: the
    // call is still "unknown", and the error must say which call it was.
    const last = timeout()
    last.operation = 'paymentDetails'
    last.context = {
      operation: 'paymentDetails',
      startedAt: new Date('2026-10-27T00:00:00Z')
    }
    const controller = new AbortController()
    setTimeout(() => controller.abort('enough'), 20)

    const error = await failure(
      retryWhenNotSent({
        baseDelayMs: 2000,
        maxDelayMs: 2000,
        random: () => 1
      })(context('paymentDetails', controller.signal), failing(last))
    )

    if (!isLinePayAbortError(error)) throw error
    expect(error.outcome).toBe('unknown')
    expect(error.operation).toBe('paymentDetails')
    expect(error.context).toBe(last.context)
    expect(error.abortReason).toBe('enough')
  })

  it('removes its abort listener once a wait is over', async () => {
    // A signal that outlives many calls (a shutdown signal, say) must not
    // collect one listener per retry.
    const controller = new AbortController()
    const result = await retryWhenNotSent({
      baseDelayMs: 1,
      maxDelayMs: 1,
      random: () => 1
    })(context('confirm', controller.signal), failing(notSent(), notSent()))
    expect(result.meta.attempts).toBe(3)
    expect(getEventListeners(controller.signal, 'abort')).toHaveLength(0)
  })

  it('passes on anything else a custom timer throws', async () => {
    const broken = new Error('the timer broke')
    await expect(
      retryWhenNotSent({
        sleep: () => Promise.reject(broken),
        random: () => 1
      })(context('confirm'), failing(notSent()))
    ).rejects.toBe(broken)
  })

  it('does not wait at all when the signal is already aborted', async () => {
    const controller = new AbortController()
    controller.abort('already')
    const error = await retryWhenNotSent({ random: () => 1 })(
      context('confirm', controller.signal),
      failing(notSent())
    ).catch((e: unknown) => e)
    expect(isLinePayAbortError(error)).toBe(true)
  })
})

describe('retryWhenNotSent: options', () => {
  it.each([
    { maxAttempts: 0 },
    { maxAttempts: 1.5 },
    { baseDelayMs: -1 },
    { maxDelayMs: 0 }
  ])('rejects %j', options => {
    expect(() => retryWhenNotSent(options)).toThrow(LinePayValidationError)
  })

  it('calls an option it refuses a configuration, by the name of the option', () => {
    expect(() => retryWhenNotSent({ maxAttempts: 0 })).toThrow(
      'Invalid configuration: maxAttempts must be a positive integer'
    )
  })
})
