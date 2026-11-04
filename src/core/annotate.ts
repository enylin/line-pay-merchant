import type { CallContext } from '../client-types'
import {
  type AnyLinePayError,
  type CallMeta,
  isLinePayApiError,
  isLinePayHttpError
} from '../errors'
import { operations } from '../operations/index'
import type { OperationName } from '../operations/names'

/** What of a call is needed to tell how it went. */
type Started = Pick<CallContext, 'operation' | 'startedAt'>

/** How a call went up to now, from its start. */
export function callMeta(
  ctx: Started,
  attempts: number,
  httpStatus?: number
): CallMeta {
  return {
    operation: ctx.operation,
    startedAt: ctx.startedAt,
    durationMs: Date.now() - ctx.startedAt.getTime(),
    attempts,
    ...(httpStatus === undefined ? {} : { httpStatus })
  }
}

/**
 * Attach what `reconcile` needs to an error: the operation, when the call started
 * and the identifying fields of the input. It is done here, before the middleware
 * see the error.
 */
export function attachContext<K extends OperationName>(
  error: AnyLinePayError,
  ctx: CallContext<K>,
  channelId: string
): void {
  error.operation ??= ctx.operation
  let fields = {}
  try {
    fields = operations[ctx.operation].reconcileFields?.(ctx.input) ?? {}
  } catch {
    // The input is malformed; there is nothing to look up.
  }
  error.context = {
    ...fields,
    operation: ctx.operation,
    startedAt: ctx.startedAt,
    channelId
  }
}

/** The status of the response an error is the answer of LINE Pay to, if it is. */
export function statusOf(error: AnyLinePayError): number | undefined {
  return isLinePayApiError(error) || isLinePayHttpError(error)
    ? error.httpStatus
    : undefined
}

/**
 * Attach how the call went to an error: the attempts so far, the time since it
 * began, and the status of the last response, which is the error's own when it is
 * the answer of LINE Pay.
 */
export function attachMeta(
  error: AnyLinePayError,
  ctx: Started,
  attempts: number,
  httpStatus: number | undefined = statusOf(error)
): void {
  error.meta = callMeta(ctx, attempts, httpStatus)
}
