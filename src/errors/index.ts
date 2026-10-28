import type { OperationName } from '../operations/names'
import { isReconcilableOperation } from '../operations/names'
import { classifyReturnCode, type ReturnCodeCategory } from './return-codes'

/**
 * Brand used by the type guards instead of `instanceof`. A package that ships
 * both ESM and CommonJS can be loaded twice in one process, and `instanceof`
 * is `false` across the two copies. `Symbol.for` returns the same symbol in
 * both, so the brand check keeps working.
 */
const BRAND = Symbol.for('line-pay-merchant.error')

export type LinePayErrorCode =
  | 'LINE_PAY_VALIDATION_ERROR'
  | 'LINE_PAY_API_ERROR'
  | 'LINE_PAY_HTTP_ERROR'
  | 'LINE_PAY_NETWORK_ERROR'
  | 'LINE_PAY_TIMEOUT_ERROR'
  | 'LINE_PAY_ABORT_ERROR'
  | 'LINE_PAY_MIDDLEWARE_ERROR'

/**
 * What the caller may assume about the request that failed.
 *
 * - `not-sent`: the request definitely did not leave this process (or never
 *   got past the connection phase), so nothing moved. A request that failed on
 *   the way out can be sent again as it is; one that was refused as invalid has
 *   to be fixed first. "Definitely" rests on the `fetch` in use sending a request
 *   once per call, and refusing redirects.
 * - `unknown`: the request may have reached LINE Pay and may have been
 *   processed, but no trustworthy response came back. Do not treat it as a
 *   failure; for operations that move money, use `reconcile`.
 * - `rejected`: LINE Pay (or something in front of it) refused the request.
 */
export type Outcome = 'not-sent' | 'unknown' | 'rejected'

/**
 * One problem with an input or a configuration.
 *
 * `path` is where it is, written the way the field is reached: `amount`,
 * `packages[0].products[1].price`, `transactionId[2]`. For an input it is relative
 * to the input object, and `input` alone means the whole input (it is not an
 * object that can be copied, say). The call options, the second argument of a
 * call, are `options.timeout` and `options.signal`: the input of `request` has an
 * `options` field of its own, whose paths read `options.payment.capture`. For a
 * configuration it is relative to the configuration object (`timeouts.refund`).
 */
export interface ValidationIssue {
  readonly path: string
  readonly message: string
}

/**
 * The minimum facts `reconcile` needs to look a call up. The client attaches one
 * to the error of every call that was made (`error.context`); an error that comes
 * before there is a call, such as bad call options, has none. It never contains
 * headers, signatures or the channel secret.
 *
 * To reconcile a call whose error you never saw, because the process died before
 * it got an answer, write one down before making the call and pass it to
 * `client.reconcile` later. Every field it needs must be there, with the type
 * shown, or `reconcile` answers `indeterminate` and says which one is wrong:
 *
 * | operation        | needs                                 | also uses      |
 * | ---------------- | ------------------------------------- | -------------- |
 * | `confirm`        | `transactionId`, `amount`, `currency` |                |
 * | `capture`        | `transactionId`, `amount`, `currency` |                |
 * | `void`           | `transactionId`                       |                |
 * | `refund`         | `transactionId`                       | `refundAmount` |
 * | `payPreapproved` | `orderId`, `amount`, `currency`       |                |
 *
 * `channelId` is on the context of every error: keep it on a context you save.
 * When a context carries one, `reconcile` refuses to look it up with a client of
 * another channel. Without one it never concludes `not-applied` from a payment
 * that is not there: a client with the wrong credentials sees nothing, and
 * "nothing" would read as "it did not happen".
 */
export interface ReconcileContext {
  readonly operation: OperationName
  /**
   * When the call began. A refund, and a pre-approved payment, are looked for
   * from this second on. A context that was saved comes back from JSON with a
   * string or a number here, and `reconcile` accepts an ISO 8601 string with a
   * time zone or milliseconds too.
   */
  readonly startedAt: Date
  /** The channel of the client that made the call. */
  readonly channelId?: string
  /** 1 to 19 digits, as a string. */
  readonly transactionId?: string
  /** As a string, the one of the call. */
  readonly orderId?: string
  /** What the call asked for; the payment must match it. */
  readonly amount?: number
  readonly currency?: string
  /** Leave it out for a full refund. */
  readonly refundAmount?: number
}

export interface ReconcileConclusion {
  readonly status: 'not-applied' | 'indeterminate'
  readonly reason: string
}

/**
 * How a call went, as far as it is known: `result.meta` for a call that succeeded
 * and `error.meta` for one that failed, in the same shape.
 */
export interface CallMeta {
  operation: OperationName
  startedAt: Date
  /** Total time in milliseconds, retries and waiting between them included. */
  durationMs: number
  /**
   * How many times the request was attempted, including attempts that never
   * connected. A call that was refused before it could be sent counts as one.
   */
  attempts: number
  /**
   * HTTP status of the last response. Absent when there was none: a network
   * error, a timeout, an abort, an input that was refused, or a result that was
   * recovered by `reconcile` (the original call never produced a response).
   */
  httpStatus?: number
}

/** The part of the init of every error that is not about its own kind. */
export interface LinePayErrorOptions {
  /** The operation that was being called, when there is one. */
  readonly operation?: OperationName | undefined
  /** The failure underneath, kept as `error.cause`. */
  readonly cause?: unknown
}

export interface LinePayErrorInit extends LinePayErrorOptions {
  readonly outcome: Outcome
}

/**
 * The safe view of an error that `toJSON()` returns and that `console.log` and
 * `util.inspect` print: no response body, no context, no headers or signatures,
 * and the cause as its message alone. A key that has no value is left out.
 */
export interface LinePayErrorJSON {
  readonly name: string
  readonly code: LinePayErrorCode
  readonly message: string
  readonly outcome: Outcome
  readonly operation?: OperationName
  /** `startedAt` is an ISO 8601 string. */
  readonly meta?: {
    readonly operation: OperationName
    readonly startedAt: string
    readonly durationMs: number
    readonly attempts: number
    readonly httpStatus?: number
  }
  readonly reconcileConclusion?: ReconcileConclusion
  /** The message of the cause, with the paths of any URLs in it removed. */
  readonly cause?: string
}

/**
 * Put what LINE Pay sent on an error where whoever asks for it by name finds it
 * (`error.body`), but not where a logger finds it by itself. Serializers such as
 * the `err` of pino, and `{ ...error }`, copy the enumerable properties of an
 * error, and the body of a response can hold a regKey, a masked card number or an
 * address.
 */
function keepApart(target: object, name: string, value: unknown): void {
  Object.defineProperty(target, name, {
    value,
    enumerable: false,
    writable: true,
    configurable: true
  })
}

/**
 * A message that names a URL names its path, and the path of some calls holds a
 * regKey (`.../preapprovedPay/<regKey>/payment`). The `fetch` of a user may put
 * the URL into the message of its errors (`node-fetch` does), so the host stays
 * and the rest of the URL goes.
 */
function withoutUrlPaths(text: string): string {
  // The scheme is bounded, so that the search does not start over for every
  // letter of a long text that has no URL in it (that takes quadratic time).
  return text.replace(/[a-z][a-z0-9+.-]{0,31}:\/\/[^\s'"<>)]+/gi, candidate => {
    try {
      const url = new URL(candidate)
      return `${url.protocol}//${url.host}`
    } catch {
      return '<url>'
    }
  })
}

/**
 * What can be said of a failure in a log: the message of an error, or a text,
 * without the paths of the URLs in it. Anything else says nothing.
 */
export function describeCause(cause: unknown): string | undefined {
  if (cause instanceof Error) return withoutUrlPaths(cause.message)
  return typeof cause === 'string' ? withoutUrlPaths(cause) : undefined
}

/**
 * Base class of every error this library throws on purpose. It cannot be
 * constructed itself: what an error is, is its class, and `code` tells which one
 * (see {@link AnyLinePayError}).
 *
 * `operation`, `context`, `meta` and `reconcileConclusion` are filled in after the
 * error was made, by the client and by the `retryWhenNotSent` and `autoReconcile`
 * middleware, so they can be assigned; they are absent until then.
 *
 * The brand is not part of the type: a `unique symbol` in the declarations is a
 * different type in the ESM and in the CommonJS copy of them, and an error of one
 * would not be assignable to the other.
 *
 * An error does not survive `structuredClone` or `postMessage` as one of these
 * classes: the copy is a plain `Error` with the name, message, stack and cause.
 * Send `error.toJSON()` instead.
 */
export abstract class LinePayError extends Error {
  /** Which class the error is. */
  abstract readonly code: LinePayErrorCode
  readonly outcome: Outcome
  /** The operation that was being called. Set when it is known. */
  declare operation?: OperationName | undefined
  /**
   * Attached by the client so that `reconcile` can look the call up again. Not
   * enumerable, like the response body: a logger that copies the properties of an
   * error does not write down the order and the transaction.
   */
  declare context?: ReconcileContext | undefined
  /** How the call went; the totals of a retry are in it. */
  declare meta?: CallMeta | undefined
  /** Set by `autoReconcile` when it could not resolve the call to "applied". */
  declare reconcileConclusion?: ReconcileConclusion | undefined

  protected constructor(name: string, message: string, init: LinePayErrorInit) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause })
    Object.defineProperty(this, BRAND, { value: true })
    Object.defineProperty(this, 'name', {
      value: name,
      writable: true,
      configurable: true
    })
    keepApart(this, 'context', undefined)
    this.outcome = init.outcome
    if (init.operation !== undefined) this.operation = init.operation
  }

  /** A safe, loggable view: no headers, secrets or signatures. */
  toJSON(): LinePayErrorJSON {
    const cause = describeCause(this.cause)
    const { meta, reconcileConclusion } = this
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      outcome: this.outcome,
      ...(this.operation === undefined ? {} : { operation: this.operation }),
      ...(meta === undefined
        ? {}
        : {
            meta: {
              operation: meta.operation,
              startedAt: meta.startedAt.toJSON(),
              durationMs: meta.durationMs,
              attempts: meta.attempts,
              ...(meta.httpStatus === undefined
                ? {}
                : { httpStatus: meta.httpStatus })
            }
          }),
      ...(reconcileConclusion === undefined
        ? {}
        : {
            reconcileConclusion: {
              status: reconcileConclusion.status,
              reason: reconcileConclusion.reason
            }
          }),
      ...(cause === undefined ? {} : { cause })
    }
  }
}

/**
 * What `console.log(error)` and `util.inspect(error)` print. Left alone they print
 * every property of the error: the response body, the context, the cause with its
 * own properties. This prints the stack and the same safe view as `toJSON()`, so
 * that a line logged the usual way carries what a log should have and no more.
 * (`error.body` is there for whoever needs it, who asks for it by name.)
 */
Object.defineProperty(
  LinePayError.prototype,
  Symbol.for('nodejs.util.inspect.custom'),
  {
    value: function inspectLinePayError(
      this: LinePayError,
      _depth: number,
      options: object,
      inspect?: (value: unknown, options?: object) => string
    ): string {
      const view = this.toJSON()
      return `${this.stack ?? `${this.name}: ${this.message}`}\n${
        inspect === undefined
          ? JSON.stringify(view, null, 2)
          : inspect(view, options)
      }`
    },
    writable: true,
    configurable: true
  }
)

export interface LinePayValidationErrorInit extends LinePayErrorOptions {
  /** Every problem that was found, not only the first. */
  readonly issues: readonly ValidationIssue[]
  /** What was checked. `input` by default. */
  readonly subject?: 'input' | 'configuration'
}

function formatIssues(init: LinePayValidationErrorInit): string {
  const where = init.operation === undefined ? '' : ` for ${init.operation}`
  const detail = init.issues.map(i => `${i.path} ${i.message}`).join('; ')
  return `Invalid ${init.subject ?? 'input'}${where}: ${detail}`
}

/** The input or the configuration is invalid. Nothing was sent. */
export class LinePayValidationError extends LinePayError {
  override readonly code = 'LINE_PAY_VALIDATION_ERROR'
  declare readonly outcome: 'not-sent'
  readonly issues: readonly ValidationIssue[]

  constructor(init: LinePayValidationErrorInit) {
    super('LinePayValidationError', formatIssues(init), {
      outcome: 'not-sent',
      operation: init.operation,
      cause: init.cause
    })
    this.issues = init.issues
  }

  override toJSON(): LinePayErrorJSON & {
    readonly issues: readonly ValidationIssue[]
  } {
    return { ...super.toJSON(), issues: this.issues }
  }
}

export interface LinePayApiBody {
  returnCode: string
  returnMessage: string
  [key: string]: unknown
}

export interface LinePayApiErrorInit {
  /** The response body, with a `returnMessage` (an empty one if LINE Pay sent none). */
  readonly body: LinePayApiBody
  readonly httpStatus: number
  /** The category of `body.returnCode` by default. */
  readonly category?: ReturnCodeCategory
  /**
   * `unknown` for the category `unresolved`, `rejected` for any other by default.
   */
  readonly outcome?: 'rejected' | 'unknown'
  readonly operation?: OperationName | undefined
}

/**
 * LINE Pay answered, and the `returnCode` says the request failed (`rejected`).
 * It is `unknown` when the answer does not say that the call was refused: a code
 * of the category `unresolved` (an internal error, a payment that is still being
 * processed), or a status the operation does not define.
 */
export class LinePayApiError extends LinePayError {
  override readonly code = 'LINE_PAY_API_ERROR'
  declare readonly outcome: 'rejected' | 'unknown'
  readonly returnCode: string
  readonly returnMessage: string
  readonly httpStatus: number
  /**
   * The response body as LINE Pay sent it. Not enumerable: a logger that copies
   * the properties of an error does not write it down.
   */
  declare readonly body: LinePayApiBody
  readonly category: ReturnCodeCategory

  constructor(init: LinePayApiErrorInit) {
    const { body } = init
    const category = init.category ?? classifyReturnCode(body.returnCode)
    super(
      'LinePayApiError',
      body.returnMessage === ''
        ? `LINE Pay returned ${body.returnCode}`
        : `LINE Pay returned ${body.returnCode}: ${body.returnMessage}`,
      {
        outcome:
          init.outcome ?? (category === 'unresolved' ? 'unknown' : 'rejected'),
        operation: init.operation
      }
    )
    this.returnCode = body.returnCode
    this.returnMessage = body.returnMessage
    this.httpStatus = init.httpStatus
    keepApart(this, 'body', body)
    this.category = category
  }

  override toJSON(): LinePayErrorJSON & {
    readonly returnCode: string
    readonly returnMessage: string
    readonly httpStatus: number
    readonly category: ReturnCodeCategory
  } {
    return {
      ...super.toJSON(),
      returnCode: this.returnCode,
      returnMessage: this.returnMessage,
      httpStatus: this.httpStatus,
      category: this.category
    }
  }
}

export type HttpErrorReason =
  'http-status' | 'invalid-response' | 'unexpected-shape' | 'body-too-large'

export interface LinePayHttpErrorInit extends LinePayErrorOptions {
  readonly httpStatus: number
  readonly reason: HttpErrorReason
  /** `rejected` for a status of 4xx, `unknown` for anything else. */
  readonly outcome: 'rejected' | 'unknown'
  readonly body?: unknown
  readonly bodyText?: string | undefined
}

const HTTP_ERROR_MESSAGES: Readonly<
  Record<HttpErrorReason, (httpStatus: number) => string>
> = {
  'http-status': status => `LINE Pay responded with HTTP ${status}`,
  'invalid-response': status =>
    `LINE Pay responded with HTTP ${status}, but the body is not a valid LINE Pay response`,
  'unexpected-shape': status =>
    `LINE Pay responded with HTTP ${status}, but the body does not have the fields that the operation promises (the body as it was received is in error.body)`,
  'body-too-large': status =>
    `LINE Pay responded with HTTP ${status}, but the body is too large to read`
}

/**
 * The HTTP status was not 2xx, the body of a 2xx response is not a LINE Pay
 * response (for example an HTML page from a proxy), or it is one without the
 * fields that the operation promises (`reason: 'unexpected-shape'`, the body as
 * it was received is in `body`).
 */
export class LinePayHttpError extends LinePayError {
  override readonly code = 'LINE_PAY_HTTP_ERROR'
  declare readonly outcome: 'rejected' | 'unknown'
  readonly httpStatus: number
  readonly reason: HttpErrorReason
  /**
   * What was received, parsed (for an answer that is no LINE Pay response, or
   * not the one the operation promises). Not enumerable, like `bodyText`.
   */
  declare readonly body?: unknown
  /** Start of the response text, cut at 2 KB. Not enumerable. */
  declare readonly bodyText?: string | undefined

  constructor(init: LinePayHttpErrorInit) {
    super(
      'LinePayHttpError',
      HTTP_ERROR_MESSAGES[init.reason](init.httpStatus),
      init
    )
    this.httpStatus = init.httpStatus
    this.reason = init.reason
    keepApart(this, 'body', init.body)
    keepApart(this, 'bodyText', init.bodyText)
  }

  override toJSON(): LinePayErrorJSON & {
    readonly httpStatus: number
    readonly reason: HttpErrorReason
  } {
    return {
      ...super.toJSON(),
      httpStatus: this.httpStatus,
      reason: this.reason
    }
  }
}

export type NetworkErrorReason =
  | 'connection-refused'
  | 'dns'
  | 'network-unreachable'
  | 'connection-reset'
  | 'redirect'
  | 'other'

export interface LinePayNetworkErrorInit extends LinePayErrorOptions {
  readonly reason: NetworkErrorReason
  /** Node.js error code of the underlying failure, for example `ECONNREFUSED`. */
  readonly causeCode?: string | undefined
  /** `not-sent` only when the connection was never made. */
  readonly outcome: 'not-sent' | 'unknown'
}

/** `fetch` failed before a usable HTTP response arrived. */
export class LinePayNetworkError extends LinePayError {
  override readonly code = 'LINE_PAY_NETWORK_ERROR'
  declare readonly outcome: 'not-sent' | 'unknown'
  readonly reason: NetworkErrorReason
  /** Node.js error code of the underlying failure, for example `ECONNREFUSED`. */
  declare readonly causeCode?: string | undefined

  constructor(init: LinePayNetworkErrorInit) {
    super(
      'LinePayNetworkError',
      `Network error while calling LINE Pay (${init.reason})`,
      init
    )
    this.reason = init.reason
    if (init.causeCode !== undefined) this.causeCode = init.causeCode
  }

  override toJSON(): LinePayErrorJSON & {
    readonly reason: NetworkErrorReason
    readonly causeCode?: string
  } {
    return {
      ...super.toJSON(),
      reason: this.reason,
      ...(this.causeCode === undefined ? {} : { causeCode: this.causeCode })
    }
  }
}

export interface LinePayTimeoutErrorInit extends LinePayErrorOptions {
  /** The limit that passed, in milliseconds. */
  readonly timeoutMs: number
}

/** The time limit passed before LINE Pay answered. The outcome is unknown. */
export class LinePayTimeoutError extends LinePayError {
  override readonly code = 'LINE_PAY_TIMEOUT_ERROR'
  declare readonly outcome: 'unknown'
  readonly timeoutMs: number

  constructor(init: LinePayTimeoutErrorInit) {
    super(
      'LinePayTimeoutError',
      `LINE Pay did not respond within ${init.timeoutMs} ms`,
      { outcome: 'unknown', operation: init.operation, cause: init.cause }
    )
    this.timeoutMs = init.timeoutMs
  }

  override toJSON(): LinePayErrorJSON & { readonly timeoutMs: number } {
    return { ...super.toJSON(), timeoutMs: this.timeoutMs }
  }
}

export interface LinePayAbortErrorInit {
  /** What the signal was aborted with. It is also the `cause`. */
  readonly abortReason: unknown
  /** `not-sent` when the request had not gone out yet. */
  readonly outcome: 'not-sent' | 'unknown'
  readonly operation?: OperationName | undefined
}

/** The caller's `AbortSignal` fired. */
export class LinePayAbortError extends LinePayError {
  override readonly code = 'LINE_PAY_ABORT_ERROR'
  declare readonly outcome: 'not-sent' | 'unknown'
  readonly abortReason: unknown

  constructor(init: LinePayAbortErrorInit) {
    super('LinePayAbortError', 'The request was aborted by the caller', {
      outcome: init.outcome,
      operation: init.operation,
      cause: init.abortReason
    })
    this.abortReason = init.abortReason
  }
}

export interface LinePayMiddlewareErrorInit extends LinePayErrorOptions {
  /** The operation whose result was wrong. */
  readonly operation: OperationName
}

/**
 * A middleware handed back something that is not the result of the operation. The
 * request may well have been sent, and have taken effect: the outcome is unknown,
 * and the error carries the context, so that `reconcile` can look the call up.
 */
export class LinePayMiddlewareError extends LinePayError {
  override readonly code = 'LINE_PAY_MIDDLEWARE_ERROR'
  declare readonly outcome: 'unknown'

  constructor(init: LinePayMiddlewareErrorInit) {
    super(
      'LinePayMiddlewareError',
      `A middleware returned something that is not the result of ${init.operation}`,
      { outcome: 'unknown', operation: init.operation, cause: init.cause }
    )
  }
}

/**
 * An error of this library, as one of its classes. `code` tells them apart, so
 * that a `switch` on it narrows the error to its class (and to the `outcome` it
 * can have), and the compiler can check that every class is handled.
 */
export type AnyLinePayError =
  | LinePayValidationError
  | LinePayApiError
  | LinePayHttpError
  | LinePayNetworkError
  | LinePayTimeoutError
  | LinePayAbortError
  | LinePayMiddlewareError

export function isLinePayError(error: unknown): error is AnyLinePayError {
  return (
    typeof error === 'object' &&
    error !== null &&
    Reflect.get(error, BRAND) === true
  )
}

function hasCode(error: unknown, code: LinePayErrorCode): boolean {
  return isLinePayError(error) && error.code === code
}

export function isLinePayValidationError(
  error: unknown
): error is LinePayValidationError {
  return hasCode(error, 'LINE_PAY_VALIDATION_ERROR')
}

export function isLinePayApiError(error: unknown): error is LinePayApiError {
  return hasCode(error, 'LINE_PAY_API_ERROR')
}

export function isLinePayHttpError(error: unknown): error is LinePayHttpError {
  return hasCode(error, 'LINE_PAY_HTTP_ERROR')
}

export function isLinePayNetworkError(
  error: unknown
): error is LinePayNetworkError {
  return hasCode(error, 'LINE_PAY_NETWORK_ERROR')
}

export function isLinePayTimeoutError(
  error: unknown
): error is LinePayTimeoutError {
  return hasCode(error, 'LINE_PAY_TIMEOUT_ERROR')
}

export function isLinePayAbortError(
  error: unknown
): error is LinePayAbortError {
  return hasCode(error, 'LINE_PAY_ABORT_ERROR')
}

export function isLinePayMiddlewareError(
  error: unknown
): error is LinePayMiddlewareError {
  return hasCode(error, 'LINE_PAY_MIDDLEWARE_ERROR')
}

/**
 * An error of a call that `client.reconcile` can look up: it carries the context.
 * It is what `needsReconcile` narrows to, and not plain `AnyLinePayError`: a type
 * guard to the union would leave `never` in the `else` branch of an error that
 * is a `LinePayError` but needs no lookup.
 */
export type ReconcilableError = AnyLinePayError & { context: ReconcileContext }

/**
 * `true` when the failed call may already have taken effect and can be looked up
 * with `client.reconcile(error)`: its outcome is unknown, or LINE Pay said it
 * is a duplicate (`category: 'duplicate'`). Only operations that move money or
 * change state qualify.
 */
export function needsReconcile(error: unknown): error is ReconcilableError {
  if (!isLinePayError(error) || error.context === undefined) return false
  if (!isReconcilableOperation(error.context.operation)) return false
  return (
    error.outcome === 'unknown' ||
    (isLinePayApiError(error) && error.category === 'duplicate')
  )
}
