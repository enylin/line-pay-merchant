import { inspect } from 'node:util'

import { describe, expect, it } from 'vitest'

import {
  type AnyLinePayError,
  isLinePayAbortError,
  isLinePayApiError,
  isLinePayError,
  isLinePayHttpError,
  isLinePayMiddlewareError,
  isLinePayNetworkError,
  isLinePayTimeoutError,
  isLinePayValidationError,
  LinePayAbortError,
  LinePayApiError,
  LinePayError,
  type LinePayErrorCode,
  LinePayHttpError,
  LinePayMiddlewareError,
  LinePayNetworkError,
  LinePayTimeoutError,
  LinePayValidationError,
  needsReconcile,
  type ReconcileContext
} from './index'
import {
  classifyReturnCode,
  isStatusReturnCode,
  SUCCESS_RETURN_CODE
} from './return-codes'

const apiBody = (returnCode: string) => ({
  returnCode,
  returnMessage: 'message'
})

/** One error of each class. A class that is missing here does not compile. */
const everyKind = (): Record<LinePayErrorCode, AnyLinePayError> => ({
  LINE_PAY_VALIDATION_ERROR: new LinePayValidationError({
    issues: [{ path: 'x', message: 'is bad' }]
  }),
  LINE_PAY_API_ERROR: new LinePayApiError({
    body: apiBody('1106'),
    httpStatus: 200
  }),
  LINE_PAY_HTTP_ERROR: new LinePayHttpError({
    httpStatus: 502,
    reason: 'http-status',
    outcome: 'unknown'
  }),
  LINE_PAY_NETWORK_ERROR: new LinePayNetworkError({
    reason: 'dns',
    outcome: 'not-sent'
  }),
  LINE_PAY_TIMEOUT_ERROR: new LinePayTimeoutError({ timeoutMs: 300 }),
  LINE_PAY_ABORT_ERROR: new LinePayAbortError({
    abortReason: 'stop',
    outcome: 'unknown'
  }),
  LINE_PAY_MIDDLEWARE_ERROR: new LinePayMiddlewareError({
    operation: 'confirm'
  })
})

describe('error classes', () => {
  it('sets name, code and outcome on every class', () => {
    const cases: [AnyLinePayError, string, string, string][] = [
      [
        everyKind().LINE_PAY_VALIDATION_ERROR,
        'LinePayValidationError',
        'LINE_PAY_VALIDATION_ERROR',
        'not-sent'
      ],
      [
        everyKind().LINE_PAY_API_ERROR,
        'LinePayApiError',
        'LINE_PAY_API_ERROR',
        'rejected'
      ],
      [
        everyKind().LINE_PAY_HTTP_ERROR,
        'LinePayHttpError',
        'LINE_PAY_HTTP_ERROR',
        'unknown'
      ],
      [
        everyKind().LINE_PAY_NETWORK_ERROR,
        'LinePayNetworkError',
        'LINE_PAY_NETWORK_ERROR',
        'not-sent'
      ],
      [
        everyKind().LINE_PAY_TIMEOUT_ERROR,
        'LinePayTimeoutError',
        'LINE_PAY_TIMEOUT_ERROR',
        'unknown'
      ],
      [
        everyKind().LINE_PAY_ABORT_ERROR,
        'LinePayAbortError',
        'LINE_PAY_ABORT_ERROR',
        'unknown'
      ],
      [
        everyKind().LINE_PAY_MIDDLEWARE_ERROR,
        'LinePayMiddlewareError',
        'LINE_PAY_MIDDLEWARE_ERROR',
        'unknown'
      ]
    ]

    for (const [error, name, code, outcome] of cases) {
      expect(error).toBeInstanceOf(Error)
      expect(error).toBeInstanceOf(LinePayError)
      expect(error.name).toBe(name)
      expect(error.code).toBe(code)
      expect(error.outcome).toBe(outcome)
      expect(String(error)).toMatch(new RegExp(`^${name}: `))
    }
  })

  it('keeps the cause', () => {
    const cause = new TypeError('fetch failed')
    const error = new LinePayNetworkError({
      reason: 'other',
      outcome: 'unknown',
      cause
    })
    expect(error.cause).toBe(cause)
  })

  it('has no cause property at all when there is no cause', () => {
    const error = new LinePayNetworkError({
      reason: 'dns',
      outcome: 'not-sent'
    })
    expect('cause' in error).toBe(false)
    expect(Object.hasOwn(error, 'cause')).toBe(false)
  })

  it('keeps the cause of every class that can have one', () => {
    const cause = new Error('underneath')
    const timeout = new LinePayTimeoutError({ timeoutMs: 5, cause })
    const validation = new LinePayValidationError({ issues: [], cause })
    const middleware = new LinePayMiddlewareError({
      operation: 'void',
      cause
    })
    expect(timeout.cause).toBe(cause)
    expect(validation.cause).toBe(cause)
    expect(middleware.cause).toBe(cause)
    // An abort is the caller's own doing: what it gave is the cause.
    const reason = new DOMException('stop', 'AbortError')
    const abort = new LinePayAbortError({
      abortReason: reason,
      outcome: 'unknown'
    })
    expect(abort.cause).toBe(reason)
    expect(abort.abortReason).toBe(reason)
  })

  it('describes the cause as the message of an error, or a string, and nothing else', () => {
    const describe = (cause: unknown) =>
      new LinePayNetworkError({
        reason: 'other',
        outcome: 'unknown',
        cause
      }).toJSON().cause
    expect(describe(new TypeError('fetch failed'))).toBe('fetch failed')
    expect(describe('refused')).toBe('refused')
    // An object may hold anything, a header or a token among it.
    expect(describe({ message: 'looks like an error', token: 'secret' })).toBe(
      undefined
    )
    expect(describe(42)).toBe(undefined)
    expect(describe(null)).toBe(undefined)
  })

  it('does not let a URL in the message of the cause carry a regKey into a log', () => {
    // `node-fetch` and others name the URL in their errors, and the regKey is a
    // segment of the path of the pre-approved calls.
    const describe = (cause: unknown) =>
      new LinePayNetworkError({
        reason: 'other',
        outcome: 'unknown',
        cause
      }).toJSON().cause
    const path =
      'https://api-pay.line.me/v4/payments/preapprovedPay/RK9A2BA1937EQTO/payment'
    expect(
      describe(new Error(`request to ${path} failed, reason: socket hang up`))
    ).toBe('request to https://api-pay.line.me failed, reason: socket hang up')
    expect(describe(`connect to (${path}) refused`)).toBe(
      'connect to (https://api-pay.line.me) refused'
    )
    expect(
      describe(new Error(`${path}?creditCardAuth=true and http://x`))
    ).toBe('https://api-pay.line.me and http://x')
    // Text without a URL is left as it is.
    expect(describe(new Error('connect ECONNREFUSED 127.0.0.1:443'))).toBe(
      'connect ECONNREFUSED 127.0.0.1:443'
    )
    // What looks like a URL and cannot be read as one goes whole: nothing tells
    // where its host ends.
    expect(
      describe(new Error('connect to http://[::1/preapprovedPay/RK9A failed'))
    ).toBe('connect to <url> failed')
  })

  it('takes linear time for a long message of the cause, whatever is in it', () => {
    // A message that a `fetch` of one's own builds from what it received. The
    // search for a scheme must not start over for every letter: 200,000
    // characters took half a minute that way.
    const describe = (cause: unknown) =>
      new LinePayNetworkError({
        reason: 'other',
        outcome: 'unknown',
        cause
      }).toJSON().cause
    const started = Date.now()

    const plain = describe(new Error('a'.repeat(200_000)))
    const dotted = describe(new Error('a.'.repeat(100_000)))
    const urls = describe(new Error('http://h/p '.repeat(20_000)))

    expect(plain).toBe('a'.repeat(200_000))
    expect(dotted).toBe('a.'.repeat(100_000))
    expect(urls).toBe('http://h '.repeat(20_000))
    expect(Date.now() - started).toBeLessThan(2000)
  })

  it('keeps its name replaceable but out of enumeration', () => {
    const error = new LinePayTimeoutError({ timeoutMs: 1000 })
    expect(Object.keys(error)).not.toContain('name')
    const descriptor = Object.getOwnPropertyDescriptor(error, 'name')
    expect(descriptor).toMatchObject({
      writable: true,
      configurable: true,
      enumerable: false
    })
    error.name = 'Renamed'
    expect(error.name).toBe('Renamed')
  })

  it('words an HTTP error by what was wrong with it', () => {
    expect(
      new LinePayHttpError({
        httpStatus: 502,
        reason: 'http-status',
        outcome: 'unknown'
      }).message
    ).toBe('LINE Pay responded with HTTP 502')
    expect(
      new LinePayHttpError({
        httpStatus: 200,
        reason: 'invalid-response',
        outcome: 'unknown'
      }).message
    ).toBe(
      'LINE Pay responded with HTTP 200, but the body is not a valid LINE Pay response'
    )
    expect(
      new LinePayHttpError({
        httpStatus: 200,
        reason: 'unexpected-shape',
        outcome: 'unknown'
      }).message
    ).toBe(
      'LINE Pay responded with HTTP 200, but the body does not have the fields that the operation promises (the body as it was received is in error.body)'
    )
  })

  it('formats validation issues without an operation', () => {
    expect(
      new LinePayValidationError({
        issues: [{ path: 'env', message: 'is required' }]
      }).message
    ).toBe('Invalid input: env is required')
  })

  it('formats validation issues into the message', () => {
    const error = new LinePayValidationError({
      issues: [
        { path: 'transactionId', message: 'must be 1 to 19 digits' },
        { path: 'amount', message: 'must be greater than 0' }
      ],
      operation: 'confirm'
    })
    expect(error.message).toBe(
      'Invalid input for confirm: transactionId must be 1 to 19 digits; amount must be greater than 0'
    )
    expect(error.operation).toBe('confirm')
    expect(error.issues).toHaveLength(2)
  })

  it('calls a configuration a configuration, and an input an input', () => {
    const issues = [{ path: 'env', message: 'is required' }]
    expect(
      new LinePayValidationError({ issues, subject: 'configuration' }).message
    ).toBe('Invalid configuration: env is required')
    expect(
      new LinePayValidationError({ issues, subject: 'input' }).message
    ).toBe('Invalid input: env is required')
  })

  it('derives the category and the outcome of an API error from the return code', () => {
    expect(
      new LinePayApiError({ body: apiBody('1106'), httpStatus: 200 })
    ).toMatchObject({ category: 'unclassified', outcome: 'rejected' })
    expect(
      new LinePayApiError({ body: apiBody('1172'), httpStatus: 200 })
    ).toMatchObject({ category: 'duplicate', outcome: 'rejected' })
    for (const code of ['1152', '1165']) {
      expect(
        new LinePayApiError({ body: apiBody(code), httpStatus: 200 })
      ).toMatchObject({ category: 'duplicate', outcome: 'rejected' })
    }
    // A code that does not say that the call was refused: it may have taken effect.
    expect(
      new LinePayApiError({ body: apiBody('9000'), httpStatus: 200 })
    ).toMatchObject({ category: 'unresolved', outcome: 'unknown' })
    expect(
      new LinePayApiError({ body: apiBody('1280'), httpStatus: 200 })
    ).toMatchObject({ category: 'unresolved', outcome: 'unknown' })
    expect(
      new LinePayApiError({ body: apiBody('1999'), httpStatus: 200 })
    ).toMatchObject({ category: 'unresolved', outcome: 'unknown' })
  })

  it('lets the category and the outcome be told', () => {
    const body = apiBody('0110')
    expect(
      new LinePayApiError({ body, httpStatus: 200, outcome: 'unknown' }).outcome
    ).toBe('unknown')
    const told = new LinePayApiError({
      body,
      httpStatus: 200,
      category: 'unresolved'
    })
    expect(told.category).toBe('unresolved')
    expect(told.outcome).toBe('unknown')
    expect(
      new LinePayApiError({
        body: apiBody('9000'),
        httpStatus: 200,
        outcome: 'rejected'
      }).outcome
    ).toBe('rejected')
  })

  it('exposes the LINE Pay response on API errors', () => {
    const body = { returnCode: '1172', returnMessage: 'duplicate', extra: 1 }
    const error = new LinePayApiError({ body, httpStatus: 200 })
    expect(error.returnCode).toBe('1172')
    expect(error.returnMessage).toBe('duplicate')
    expect(error.httpStatus).toBe(200)
    expect(error.body).toBe(body)
    expect(error.category).toBe('duplicate')
  })

  it('words an API error with the return code, and the message if there is one', () => {
    expect(
      new LinePayApiError({
        body: { returnCode: '1106', returnMessage: 'header error' },
        httpStatus: 200
      }).message
    ).toBe('LINE Pay returned 1106: header error')
    // `interpretResponse` makes the message an empty string when LINE Pay sent none.
    expect(
      new LinePayApiError({
        body: { returnCode: '1106', returnMessage: '' },
        httpStatus: 400
      }).message
    ).toBe('LINE Pay returned 1106')
  })

  it('says which operation a middleware broke the rule for, and that the outcome is unknown', () => {
    const error = new LinePayMiddlewareError({ operation: 'refund' })
    expect(error.message).toBe(
      'A middleware returned something that is not the result of refund'
    )
    expect(error.operation).toBe('refund')
    expect(error.outcome).toBe('unknown')
  })
})

describe('the shape of an error', () => {
  it('has the fields of its own kind and no others, as enumerable properties', () => {
    const kinds = everyKind()
    const own = (error: AnyLinePayError) => Object.keys(error).sort()
    expect(own(kinds.LINE_PAY_VALIDATION_ERROR)).toEqual([
      'code',
      'issues',
      'outcome'
    ])
    expect(own(kinds.LINE_PAY_API_ERROR)).toEqual([
      'category',
      'code',
      'httpStatus',
      'outcome',
      'returnCode',
      'returnMessage'
    ])
    expect(own(kinds.LINE_PAY_HTTP_ERROR)).toEqual([
      'code',
      'httpStatus',
      'outcome',
      'reason'
    ])
    expect(own(kinds.LINE_PAY_NETWORK_ERROR)).toEqual([
      'code',
      'outcome',
      'reason'
    ])
    expect(own(kinds.LINE_PAY_TIMEOUT_ERROR)).toEqual([
      'code',
      'outcome',
      'timeoutMs'
    ])
    expect(own(kinds.LINE_PAY_ABORT_ERROR)).toEqual([
      'abortReason',
      'code',
      'outcome'
    ])
    expect(own(kinds.LINE_PAY_MIDDLEWARE_ERROR)).toEqual([
      'code',
      'operation',
      'outcome'
    ])
  })

  it('has no property for what it does not have', () => {
    // A field that was never set is not there as `undefined` either: a copy of
    // the error, or a `for in`, would otherwise list it.
    const network = new LinePayNetworkError({
      reason: 'dns',
      outcome: 'not-sent'
    })
    for (const name of [
      'operation',
      'meta',
      'reconcileConclusion',
      'causeCode',
      'cause'
    ]) {
      expect(Object.hasOwn(network, name), name).toBe(false)
    }
    // The context is there from the start, and out of sight.
    expect(Object.getOwnPropertyDescriptor(network, 'context')).toEqual({
      value: undefined,
      enumerable: false,
      writable: true,
      configurable: true
    })
    expect(network.operation).toBeUndefined()
    expect(network.meta).toBeUndefined()
    expect(network.reconcileConclusion).toBeUndefined()
    expect(network.causeCode).toBeUndefined()
  })

  it('shows the cause code of a network error once it has one', () => {
    const network = new LinePayNetworkError({
      reason: 'connection-refused',
      causeCode: 'ECONNREFUSED',
      outcome: 'not-sent'
    })
    expect(Object.keys(network)).toContain('causeCode')
    expect(network.toJSON()).toMatchObject({ causeCode: 'ECONNREFUSED' })
  })

  it('shows what the client attaches, except the context, which stays out of sight', () => {
    const error = new LinePayTimeoutError({ timeoutMs: 5 })
    const startedAt = new Date('2026-10-27T00:00:00Z')
    error.operation = 'confirm'
    error.meta = { operation: 'confirm', startedAt, durationMs: 7, attempts: 2 }
    error.reconcileConclusion = { status: 'indeterminate', reason: 'unclear' }
    error.context = {
      operation: 'confirm',
      startedAt,
      transactionId: '2021121300698360310'
    }

    expect(Object.keys(error).sort()).toEqual([
      'code',
      'meta',
      'operation',
      'outcome',
      'reconcileConclusion',
      'timeoutMs'
    ])
    // Assigning to it later does not make it enumerable.
    expect(Object.getOwnPropertyDescriptor(error, 'context')).toMatchObject({
      enumerable: false,
      writable: true,
      configurable: true
    })
    expect(error.context?.transactionId).toBe('2021121300698360310')
    expect(JSON.stringify({ ...error })).not.toContain('2021121300698360310')
  })

  it('has the same first keys in the JSON of every class, and then its own', () => {
    const kinds = everyKind()
    const keys = (error: AnyLinePayError) => Object.keys(error.toJSON())
    const base = ['name', 'code', 'message', 'outcome']
    expect(keys(kinds.LINE_PAY_VALIDATION_ERROR)).toEqual([...base, 'issues'])
    expect(keys(kinds.LINE_PAY_API_ERROR)).toEqual([
      ...base,
      'returnCode',
      'returnMessage',
      'httpStatus',
      'category'
    ])
    expect(keys(kinds.LINE_PAY_HTTP_ERROR)).toEqual([
      ...base,
      'httpStatus',
      'reason'
    ])
    expect(keys(kinds.LINE_PAY_NETWORK_ERROR)).toEqual([...base, 'reason'])
    expect(keys(kinds.LINE_PAY_TIMEOUT_ERROR)).toEqual([...base, 'timeoutMs'])
    // What the signal was aborted with is the cause, and a text is told.
    expect(keys(kinds.LINE_PAY_ABORT_ERROR)).toEqual([...base, 'cause'])
    expect(keys(kinds.LINE_PAY_MIDDLEWARE_ERROR)).toEqual([
      ...base,
      'operation'
    ])
  })

  it('writes what the client attached in the JSON of every class, in one place', () => {
    const startedAt = new Date('2026-10-27T01:02:03.456Z')
    for (const error of Object.values(everyKind())) {
      error.operation = 'refund'
      error.meta = {
        operation: 'refund',
        startedAt,
        durationMs: 1234,
        attempts: 3,
        httpStatus: 503
      }
      error.reconcileConclusion = { status: 'not-applied', reason: 'none' }
      const json = error.toJSON()
      expect(json).toMatchObject({
        operation: 'refund',
        meta: {
          operation: 'refund',
          startedAt: '2026-10-27T01:02:03.456Z',
          durationMs: 1234,
          attempts: 3,
          httpStatus: 503
        },
        reconcileConclusion: { status: 'not-applied', reason: 'none' }
      })
      expect(Object.keys(json).slice(0, 7)).toEqual([
        'name',
        'code',
        'message',
        'outcome',
        'operation',
        'meta',
        'reconcileConclusion'
      ])
      // It is a copy: changing the view does not change the error.
      expect(json.reconcileConclusion).not.toBe(error.reconcileConclusion)
    }
  })

  it('leaves out the status of a call that got no response', () => {
    const error = new LinePayTimeoutError({ timeoutMs: 5 })
    error.meta = {
      operation: 'void',
      startedAt: new Date('2026-10-27T00:00:00Z'),
      durationMs: 5,
      attempts: 1
    }
    // Strictly: a key whose value is undefined would be there for a copy of the view.
    expect(error.toJSON().meta).toStrictEqual({
      operation: 'void',
      startedAt: '2026-10-27T00:00:00.000Z',
      durationMs: 5,
      attempts: 1
    })
  })

  it('survives JSON as the view it is', () => {
    const error = new LinePayApiError({
      body: apiBody('1106'),
      httpStatus: 400,
      operation: 'confirm'
    })
    error.meta = {
      operation: 'confirm',
      startedAt: new Date('2026-10-27T00:00:00Z'),
      durationMs: 9,
      attempts: 1,
      httpStatus: 400
    }
    expect(JSON.parse(JSON.stringify(error))).toEqual(
      JSON.parse(JSON.stringify(error.toJSON()))
    )
  })

  it('does not come through structuredClone as one of its classes', () => {
    // The copy is a plain Error: it keeps the message, the stack and the cause,
    // and not the fields of the class. The view is what to send across.
    const error = new LinePayApiError({
      body: apiBody('1106'),
      httpStatus: 400
    })
    const copy: unknown = structuredClone(error)
    expect(copy).toBeInstanceOf(Error)
    expect(copy).not.toBeInstanceOf(LinePayApiError)
    expect(isLinePayError(copy)).toBe(false)
    expect(copy).toHaveProperty('message', error.message)
    expect(structuredClone(error.toJSON())).toEqual(error.toJSON())
  })
})

describe('the union of the classes', () => {
  /** What a caller can write: a switch on `code`, which the compiler checks. */
  function kind(error: AnyLinePayError): string {
    switch (error.code) {
      case 'LINE_PAY_VALIDATION_ERROR':
        return `${error.issues.length} issue`
      case 'LINE_PAY_API_ERROR':
        return error.returnCode
      case 'LINE_PAY_HTTP_ERROR':
        return `HTTP ${error.httpStatus}`
      case 'LINE_PAY_NETWORK_ERROR':
        return error.reason
      case 'LINE_PAY_TIMEOUT_ERROR':
        return `${error.timeoutMs} ms`
      case 'LINE_PAY_ABORT_ERROR':
        return String(error.abortReason)
      case 'LINE_PAY_MIDDLEWARE_ERROR':
        return error.operation ?? 'no operation'
      default: {
        const unhandled: never = error
        return unhandled
      }
    }
  }

  it('is told apart by its code', () => {
    const kinds = everyKind()
    expect(kind(kinds.LINE_PAY_VALIDATION_ERROR)).toBe('1 issue')
    expect(kind(kinds.LINE_PAY_API_ERROR)).toBe('1106')
    expect(kind(kinds.LINE_PAY_HTTP_ERROR)).toBe('HTTP 502')
    expect(kind(kinds.LINE_PAY_NETWORK_ERROR)).toBe('dns')
    expect(kind(kinds.LINE_PAY_TIMEOUT_ERROR)).toBe('300 ms')
    expect(kind(kinds.LINE_PAY_ABORT_ERROR)).toBe('stop')
    expect(kind(kinds.LINE_PAY_MIDDLEWARE_ERROR)).toBe('confirm')
  })

  it('is what isLinePayError lets through', () => {
    const caught: unknown = new LinePayTimeoutError({ timeoutMs: 5 })
    if (!isLinePayError(caught)) expect.unreachable()
    expect(kind(caught)).toBe('5 ms')
  })

  it('has the code of its class on every member', () => {
    for (const [code, error] of Object.entries(everyKind())) {
      expect(error.code).toBe(code)
    }
  })
})

describe('type guards', () => {
  it('recognise the library errors by brand, not by instanceof', () => {
    // An error created by another copy of the package carries the same brand.
    const foreign = Object.assign(new Error('foreign copy'), {
      code: 'LINE_PAY_API_ERROR',
      outcome: 'rejected'
    })
    Object.defineProperty(foreign, Symbol.for('line-pay-merchant.error'), {
      value: true
    })

    expect(foreign).not.toBeInstanceOf(LinePayError)
    expect(isLinePayError(foreign)).toBe(true)
    expect(isLinePayApiError(foreign)).toBe(true)
  })

  it('reject everything else', () => {
    for (const value of [
      new Error('plain'),
      new TypeError('x'),
      { code: 'LINE_PAY_API_ERROR' },
      'LINE_PAY_API_ERROR',
      null,
      undefined,
      42
    ]) {
      expect(isLinePayError(value)).toBe(false)
      expect(isLinePayApiError(value)).toBe(false)
    }
  })

  it('narrow by error code', () => {
    const kinds = everyKind()
    const guards = [
      ['LINE_PAY_VALIDATION_ERROR', isLinePayValidationError],
      ['LINE_PAY_API_ERROR', isLinePayApiError],
      ['LINE_PAY_HTTP_ERROR', isLinePayHttpError],
      ['LINE_PAY_NETWORK_ERROR', isLinePayNetworkError],
      ['LINE_PAY_TIMEOUT_ERROR', isLinePayTimeoutError],
      ['LINE_PAY_ABORT_ERROR', isLinePayAbortError],
      ['LINE_PAY_MIDDLEWARE_ERROR', isLinePayMiddlewareError]
    ] as const
    for (const [code, guard] of guards) {
      for (const error of Object.values(kinds)) {
        expect(guard(error), `${code} / ${error.code}`).toBe(
          error.code === code
        )
      }
    }
  })
})

describe('output safety', () => {
  const error = new LinePayApiError({
    body: apiBody('2101'),
    httpStatus: 200,
    category: 'unclassified',
    operation: 'request'
  })

  it('serialises a whitelist only', () => {
    expect(JSON.parse(JSON.stringify(error))).toEqual({
      name: 'LinePayApiError',
      code: 'LINE_PAY_API_ERROR',
      message: 'LINE Pay returned 2101: message',
      outcome: 'rejected',
      operation: 'request',
      returnCode: '2101',
      returnMessage: 'message',
      httpStatus: 200,
      category: 'unclassified'
    })
  })

  it('serialises every kind of error without bodies, causes or context', () => {
    const secretish = 'Bearer should-never-be-logged'
    const context = {
      operation: 'confirm',
      startedAt: new Date(),
      transactionId: '2021121300698360310'
    } as const
    const cause = new TypeError('fetch failed')
    const errors: [AnyLinePayError, Record<string, unknown>][] = [
      [
        new LinePayValidationError({
          issues: [{ path: 'a', message: 'is bad' }],
          operation: 'confirm'
        }),
        { issues: [{ path: 'a', message: 'is bad' }] }
      ],
      [
        new LinePayHttpError({
          httpStatus: 502,
          reason: 'http-status',
          outcome: 'unknown',
          body: { token: secretish },
          bodyText: secretish
        }),
        { httpStatus: 502, reason: 'http-status' }
      ],
      [
        new LinePayNetworkError({
          reason: 'dns',
          causeCode: 'ENOTFOUND',
          outcome: 'not-sent',
          cause
        }),
        { reason: 'dns', causeCode: 'ENOTFOUND', cause: 'fetch failed' }
      ],
      [new LinePayTimeoutError({ timeoutMs: 300 }), { timeoutMs: 300 }],
      [new LinePayAbortError({ abortReason: 'stop', outcome: 'unknown' }), {}],
      [new LinePayMiddlewareError({ operation: 'confirm' }), {}]
    ]
    for (const [error, extra] of errors) {
      error.context = context
      const json: unknown = JSON.parse(JSON.stringify(error))
      expect(json).toMatchObject({
        name: error.name,
        code: error.code,
        outcome: error.outcome,
        ...extra
      })
      expect(json).not.toHaveProperty('context')
      expect(json).not.toHaveProperty('body')
      expect(json).not.toHaveProperty('bodyText')
      expect(JSON.stringify(json)).not.toContain('Bearer')
    }
  })

  it('does not print the brand symbol', () => {
    expect(inspect(error)).not.toContain('line-pay-merchant.error')
  })

  // console.log(error), console.error({ error }) and every logger that falls back
  // on util.inspect print all the properties of an error unless told otherwise.
  describe('what a log line prints (util.inspect, console)', () => {
    const personal = '+886-912-345-678'
    const secretish = 'Bearer should-never-be-logged'
    const context: ReconcileContext = {
      operation: 'payPreapproved',
      startedAt: new Date('2026-10-27T00:00:00Z'),
      orderId: 'order-1',
      amount: 1000,
      currency: 'TWD'
    }

    const loud: [string, AnyLinePayError][] = [
      [
        'an API error',
        new LinePayApiError({
          body: {
            returnCode: '2101',
            returnMessage: 'bad',
            info: { phone: personal }
          },
          httpStatus: 200
        })
      ],
      [
        'an HTTP error',
        new LinePayHttpError({
          httpStatus: 502,
          reason: 'http-status',
          outcome: 'unknown',
          body: { phone: personal },
          bodyText: `{"phone":"${personal}"}`
        })
      ],
      [
        'a network error',
        new LinePayNetworkError({
          reason: 'other',
          outcome: 'unknown',
          cause: Object.assign(new TypeError('fetch failed'), {
            cause: { headers: { authorization: secretish }, phone: personal }
          })
        })
      ]
    ]

    it.each(loud)(
      'prints neither body nor context nor cause of %s',
      (_name, error) => {
        error.context = context
        for (const printed of [
          inspect(error),
          inspect(error, { depth: 10 }),
          inspect({ wrapped: { error } }, { depth: 10 }),
          inspect(error, { colors: true })
        ]) {
          expect(printed).not.toContain(personal)
          expect(printed).not.toContain(secretish)
          expect(printed).not.toContain('order-1')
          expect(printed).not.toContain('startedAt')
        }
      }
    )

    it('prints the stack and the fields that serialisation has', () => {
      const printed = inspect(error)
      expect(printed).toContain(
        'LinePayApiError: LINE Pay returned 2101: message'
      )
      expect(printed).toContain('    at ')
      expect(printed).toContain("returnCode: '2101'")
      expect(printed).toContain("outcome: 'rejected'")
    })

    it('prints how the call went and what was concluded, and still not the context', () => {
      const failed = new LinePayTimeoutError({ timeoutMs: 20_000 })
      failed.operation = 'refund'
      failed.meta = {
        operation: 'refund',
        startedAt: new Date('2026-10-27T00:00:00Z'),
        durationMs: 61_000,
        attempts: 3
      }
      failed.reconcileConclusion = {
        status: 'indeterminate',
        reason: 'The details do not settle it.'
      }
      failed.context = { ...context, operation: 'refund' }

      const printed = inspect(failed)
      expect(printed).toContain('attempts: 3')
      expect(printed).toContain('durationMs: 61000')
      expect(printed).toContain("startedAt: '2026-10-27T00:00:00.000Z'")
      expect(printed).toContain("status: 'indeterminate'")
      expect(printed).not.toContain('order-1')
    })

    it('leaves the body to whoever asks for it by name', () => {
      const withBody = new LinePayApiError({
        body: {
          returnCode: '2101',
          returnMessage: 'bad',
          info: { phone: personal }
        },
        httpStatus: 200
      })
      expect(withBody.body).toMatchObject({ info: { phone: personal } })
    })

    it('keeps the body where a logger that copies the properties does not find it', () => {
      // The `err` serializer of pino, and `{ ...error }`, take the enumerable
      // properties of an error. The body of a response can hold a regKey.
      const regKey = 'RK9A2BA1937EQTO'
      const api = new LinePayApiError({
        body: { returnCode: '2101', returnMessage: 'bad', info: { regKey } },
        httpStatus: 200
      })
      const http = new LinePayHttpError({
        httpStatus: 200,
        reason: 'unexpected-shape',
        outcome: 'unknown',
        body: { info: { regKey } },
        bodyText: `{"info":{"regKey":"${regKey}"}}`
      })
      for (const error of [api, http]) {
        const copied: Record<string, unknown> = {}
        for (const key in error) copied[key] = Reflect.get(error, key)
        expect(JSON.stringify({ ...error, ...copied })).not.toContain(regKey)
        expect(Object.keys(error)).not.toContain('body')
        expect(Object.keys(error)).not.toContain('bodyText')
      }
      // Whoever asks for it by name has it.
      expect(api.body).toMatchObject({ info: { regKey } })
      expect(http.body).toEqual({ info: { regKey } })
      expect(http.bodyText).toContain(regKey)
      // It is a value like any other: it can be read, and it is not a getter.
      expect(Object.getOwnPropertyDescriptor(api, 'body')).toMatchObject({
        enumerable: false,
        writable: true,
        configurable: true
      })
      expect(Object.getOwnPropertyDescriptor(http, 'bodyText')).toMatchObject({
        enumerable: false,
        writable: true,
        configurable: true
      })
    })

    it('keeps the context where a logger that copies the properties does not find it', () => {
      const orderId = 'order-secret-42'
      for (const failed of Object.values(everyKind())) {
        failed.context = { ...context, orderId }
        const copied: Record<string, unknown> = {}
        for (const key in failed) copied[key] = Reflect.get(failed, key)
        expect(JSON.stringify({ ...failed, ...copied })).not.toContain(orderId)
        expect(Object.keys(failed)).not.toContain('context')
        expect(Object.getOwnPropertyNames(failed)).toContain('context')
        // Whoever asks for it by name has it.
        expect(failed.context?.orderId).toBe(orderId)
      }
    })

    it('does not depend on the inspect function it is given', () => {
      const print: unknown = Reflect.get(
        error,
        Symbol.for('nodejs.util.inspect.custom')
      )
      if (typeof print !== 'function') {
        expect.unreachable('the error has no custom inspect function')
      }
      const printed = String(Reflect.apply(print, error, [2, {}]))
      expect(printed).toContain('\n  "returnCode": "2101"')
      expect(printed).not.toContain(personal)
    })

    it('prints the name and the message of an error that has lost its stack', () => {
      const lost = new LinePayTimeoutError({ timeoutMs: 1000 })
      Object.defineProperty(lost, 'stack', { value: undefined })

      expect(inspect(lost)).toMatch(
        new RegExp(`^LinePayTimeoutError: ${lost.message}\\n`)
      )
    })

    it('keeps the custom printing out of enumeration, and off the error itself', () => {
      const custom = Symbol.for('nodejs.util.inspect.custom')
      expect(Object.getOwnPropertySymbols(error)).not.toContain(custom)
      expect(
        Object.prototype.propertyIsEnumerable.call(
          LinePayError.prototype,
          custom
        )
      ).toBe(false)
      expect(custom in error).toBe(true)
      expect(
        Object.getOwnPropertyDescriptor(LinePayError.prototype, custom)
      ).toMatchObject({ writable: true, configurable: true, enumerable: false })
    })
  })

  it('never carries the channel secret', () => {
    const secret = 'super-secret-channel-key'
    const failing = new LinePayNetworkError({
      reason: 'other',
      outcome: 'unknown',
      cause: new TypeError('fetch failed')
    })
    const text = JSON.stringify(failing) + inspect(failing, { depth: 5 })
    expect(text).not.toContain(secret)
  })
})

describe('needsReconcile', () => {
  const context = (
    operation: ReconcileContext['operation']
  ): ReconcileContext => ({
    operation,
    startedAt: new Date('2026-10-27T00:00:00Z'),
    transactionId: '2021121300698360310'
  })

  const unknownTimeout = (operation: ReconcileContext['operation']) => {
    const error = new LinePayTimeoutError({ timeoutMs: 1000 })
    error.context = context(operation)
    return error
  }

  it('is true for an unknown outcome on a money-moving operation', () => {
    for (const op of [
      'confirm',
      'capture',
      'void',
      'refund',
      'payPreapproved'
    ] as const) {
      expect(needsReconcile(unknownTimeout(op))).toBe(true)
    }
  })

  it('is true for a duplicate return code', () => {
    for (const code of ['1152', '1165', '1172', '1198']) {
      const error = new LinePayApiError({
        body: apiBody(code),
        httpStatus: 200,
        category: classifyReturnCode(code)
      })
      error.context = context('confirm')
      expect(needsReconcile(error)).toBe(true)
    }
  })

  it('is true for a middleware that broke the rule, when the call can be looked up', () => {
    const error = new LinePayMiddlewareError({ operation: 'refund' })
    error.context = context('refund')
    expect(needsReconcile(error)).toBe(true)
    const read = new LinePayMiddlewareError({ operation: 'paymentDetails' })
    read.context = context('paymentDetails')
    expect(needsReconcile(read)).toBe(false)
  })

  it('is false when nothing can be looked up', () => {
    // read operations, request and expireRegKey are not reconcilable
    for (const op of [
      'request',
      'paymentDetails',
      'checkPaymentStatus',
      'checkRegKey',
      'expireRegKey'
    ] as const) {
      expect(needsReconcile(unknownTimeout(op))).toBe(false)
    }
    // no context attached
    expect(needsReconcile(new LinePayTimeoutError({ timeoutMs: 1 }))).toBe(
      false
    )
  })

  it('is false for anything that is not an error of this library', () => {
    const lookalike = {
      outcome: 'unknown',
      context: context('confirm'),
      code: 'LINE_PAY_TIMEOUT_ERROR'
    }
    for (const value of [
      null,
      undefined,
      'timeout',
      42,
      {},
      lookalike,
      Object.assign(new Error('plain'), {
        outcome: 'unknown',
        context: context('confirm')
      })
    ]) {
      expect(needsReconcile(value)).toBe(false)
    }
  })

  it('takes a duplicate for a duplicate only on an error that LINE Pay answered', () => {
    const http = new LinePayHttpError({
      httpStatus: 400,
      reason: 'http-status',
      outcome: 'rejected'
    })
    http.context = context('confirm')
    Object.assign(http, { category: 'duplicate' })
    expect(needsReconcile(http)).toBe(false)
  })

  it('is false for rejected and not-sent failures', () => {
    const rejected = new LinePayApiError({
      body: apiBody('1106'),
      httpStatus: 200
    })
    rejected.context = context('confirm')
    const notSent = new LinePayNetworkError({
      reason: 'dns',
      outcome: 'not-sent'
    })
    notSent.context = context('confirm')
    const validation = new LinePayValidationError({ issues: [] })
    validation.context = context('confirm')

    expect(needsReconcile(rejected)).toBe(false)
    expect(needsReconcile(notSent)).toBe(false)
    expect(needsReconcile(validation)).toBe(false)
    expect(needsReconcile(new Error('plain'))).toBe(false)
  })
})

describe('return codes', () => {
  it('knows 0000 as the success, and the other 0xxx codes as statuses', () => {
    expect(SUCCESS_RETURN_CODE).toBe('0000')
    expect(isStatusReturnCode('0000')).toBe(false)
    for (const code of ['0110', '0121', '0122', '0123']) {
      expect(isStatusReturnCode(code)).toBe(true)
    }
    for (const code of ['1106', '1172', '2101', '9000']) {
      expect(isStatusReturnCode(code)).toBe(false)
    }
  })

  it('classifies the duplicate codes', () => {
    for (const code of ['1152', '1165', '1172', '1198']) {
      expect(classifyReturnCode(code)).toBe('duplicate')
    }
    expect(classifyReturnCode('1106')).toBe('unclassified')
  })

  it('classifies the codes that do not say no as unresolved', () => {
    for (const code of [
      '1145',
      '1179',
      '1199',
      '1280',
      '1999',
      '2042',
      '9000',
      '1900',
      '1909'
    ]) {
      expect(classifyReturnCode(code), code).toBe('unresolved')
    }
    for (const code of ['1899', '1910', '1990', '1142', '1150']) {
      expect(classifyReturnCode(code), code).toBe('unclassified')
    }
  })

  it('makes an unresolved answer an unknown outcome unless told otherwise', () => {
    const body = apiBody('9000')
    const outcomeOf = (category: 'unresolved' | 'duplicate' | 'unclassified') =>
      new LinePayApiError({ body, httpStatus: 200, category }).outcome
    expect(outcomeOf('unresolved')).toBe('unknown')
    expect(outcomeOf('duplicate')).toBe('rejected')
    expect(outcomeOf('unclassified')).toBe('rejected')
    expect(
      new LinePayApiError({
        body,
        httpStatus: 200,
        category: 'unresolved',
        outcome: 'rejected'
      }).outcome
    ).toBe('rejected')
  })
})
