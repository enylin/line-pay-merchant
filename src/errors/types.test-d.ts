import { describe, expectTypeOf, it } from 'vitest'

import type {
  LinePayAbortError,
  LinePayApiError,
  LinePayMiddlewareError,
  LinePayValidationError
} from './index'
import {
  type AnyLinePayError,
  isLinePayApiError,
  isLinePayError,
  isLinePayHttpError,
  isLinePayMiddlewareError,
  isLinePayNetworkError,
  isLinePayTimeoutError,
  isLinePayValidationError,
  LinePayError,
  type LinePayErrorCode,
  LinePayHttpError,
  LinePayNetworkError,
  LinePayTimeoutError,
  needsReconcile,
  type ReconcilableError,
  type ReconcileContext
} from './index'

describe('the classes of errors, as types', () => {
  it('give every class a code of its own and the outcomes it can have', () => {
    expectTypeOf<
      LinePayValidationError['code']
    >().toEqualTypeOf<'LINE_PAY_VALIDATION_ERROR'>()
    expectTypeOf<
      LinePayValidationError['outcome']
    >().toEqualTypeOf<'not-sent'>()

    expectTypeOf<
      LinePayApiError['code']
    >().toEqualTypeOf<'LINE_PAY_API_ERROR'>()
    expectTypeOf<LinePayApiError['outcome']>().toEqualTypeOf<
      'rejected' | 'unknown'
    >()

    expectTypeOf<
      LinePayHttpError['code']
    >().toEqualTypeOf<'LINE_PAY_HTTP_ERROR'>()
    expectTypeOf<LinePayHttpError['outcome']>().toEqualTypeOf<
      'rejected' | 'unknown'
    >()

    expectTypeOf<
      LinePayNetworkError['code']
    >().toEqualTypeOf<'LINE_PAY_NETWORK_ERROR'>()
    expectTypeOf<LinePayNetworkError['outcome']>().toEqualTypeOf<
      'not-sent' | 'unknown'
    >()

    expectTypeOf<
      LinePayTimeoutError['code']
    >().toEqualTypeOf<'LINE_PAY_TIMEOUT_ERROR'>()
    expectTypeOf<LinePayTimeoutError['outcome']>().toEqualTypeOf<'unknown'>()

    expectTypeOf<
      LinePayAbortError['code']
    >().toEqualTypeOf<'LINE_PAY_ABORT_ERROR'>()
    expectTypeOf<LinePayAbortError['outcome']>().toEqualTypeOf<
      'not-sent' | 'unknown'
    >()

    expectTypeOf<
      LinePayMiddlewareError['code']
    >().toEqualTypeOf<'LINE_PAY_MIDDLEWARE_ERROR'>()
    expectTypeOf<LinePayMiddlewareError['outcome']>().toEqualTypeOf<'unknown'>()
  })

  it('are all of them, and only them, in the union', () => {
    expectTypeOf<AnyLinePayError['code']>().toEqualTypeOf<LinePayErrorCode>()
    expectTypeOf<AnyLinePayError>().toExtend<LinePayError>()
  })

  it('narrow with a switch on the code, and the compiler checks that none is left', () => {
    const handle = (error: AnyLinePayError): void => {
      switch (error.code) {
        case 'LINE_PAY_VALIDATION_ERROR':
          expectTypeOf(error).toEqualTypeOf<LinePayValidationError>()
          expectTypeOf(error.issues).not.toBeAny()
          break
        case 'LINE_PAY_API_ERROR':
          expectTypeOf(error).toEqualTypeOf<LinePayApiError>()
          expectTypeOf(error.returnCode).toEqualTypeOf<string>()
          break
        case 'LINE_PAY_HTTP_ERROR':
          expectTypeOf(error).toEqualTypeOf<LinePayHttpError>()
          break
        case 'LINE_PAY_NETWORK_ERROR':
          expectTypeOf(error).toEqualTypeOf<LinePayNetworkError>()
          break
        case 'LINE_PAY_TIMEOUT_ERROR':
          expectTypeOf(error).toEqualTypeOf<LinePayTimeoutError>()
          expectTypeOf(error.timeoutMs).toEqualTypeOf<number>()
          break
        case 'LINE_PAY_ABORT_ERROR':
          expectTypeOf(error).toEqualTypeOf<LinePayAbortError>()
          break
        case 'LINE_PAY_MIDDLEWARE_ERROR':
          expectTypeOf(error).toEqualTypeOf<LinePayMiddlewareError>()
          break
        default:
          expectTypeOf(error).toBeNever()
      }
    }
    expectTypeOf(handle).parameter(0).toEqualTypeOf<AnyLinePayError>()
  })

  it('narrow with the guards, from anything', () => {
    const caught: unknown = undefined
    if (isLinePayError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<AnyLinePayError>()
    }
    if (isLinePayValidationError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<LinePayValidationError>()
    }
    if (isLinePayApiError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<LinePayApiError>()
    }
    if (isLinePayHttpError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<LinePayHttpError>()
    }
    if (isLinePayNetworkError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<LinePayNetworkError>()
    }
    if (isLinePayTimeoutError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<LinePayTimeoutError>()
    }
    if (isLinePayMiddlewareError(caught)) {
      expectTypeOf(caught).toEqualTypeOf<LinePayMiddlewareError>()
    }
  })

  it('hand the context to whoever asks needsReconcile', () => {
    const caught: unknown = undefined
    if (needsReconcile(caught)) {
      expectTypeOf(caught).toEqualTypeOf<ReconcilableError>()
      expectTypeOf(caught.context).toEqualTypeOf<ReconcileContext>()
      expectTypeOf<(typeof caught)['code']>().toEqualTypeOf<LinePayErrorCode>()
    }
  })

  it('refuse an outcome the class cannot have', () => {
    void new LinePayHttpError({
      httpStatus: 502,
      reason: 'http-status',
      // A response came, so the request was sent.
      // @ts-expect-error not-sent is not an outcome of an HTTP error
      outcome: 'not-sent'
    })
    void new LinePayNetworkError({
      reason: 'other',
      // Nothing came back, so nothing can have been refused.
      // @ts-expect-error rejected is not an outcome of a network error
      outcome: 'rejected'
    })
    void new LinePayTimeoutError({
      timeoutMs: 1,
      // A time-out is always unknown, and there is nothing to choose.
      // @ts-expect-error a timeout error has no outcome in its init
      outcome: 'not-sent'
    })
  })

  it('cannot be made from the base class', () => {
    // @ts-expect-error the base class is abstract, and its constructor is not for callers
    void new LinePayError('LinePayError', 'message', { outcome: 'unknown' })
  })
})
