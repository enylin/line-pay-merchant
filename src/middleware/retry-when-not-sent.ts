import type {
  AnyCallContext,
  AnyResult,
  CallContext,
  Middleware
} from '../client-types'
import { attachMeta, statusOf } from '../core/annotate'
import {
  type AnyLinePayError,
  isLinePayAbortError,
  isLinePayError,
  isLinePayNetworkError,
  LinePayAbortError,
  LinePayValidationError
} from '../errors'
import { operations } from '../operations/index'
import type { OperationEffect, OperationName } from '../operations/names'

export interface RetryOptions {
  /** Attempts in total, the first one included. Default 3. */
  maxAttempts?: number
  /** Start of the exponential backoff in milliseconds. Default 200. */
  baseDelayMs?: number
  /** Upper bound of one wait in milliseconds. Default 2000. */
  maxDelayMs?: number
  /** Replaces `Math.random`; for tests. */
  random?: () => number
  /** Replaces the timer; for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
}

function defaultSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted === true) {
      reject(
        new LinePayAbortError({
          abortReason: signal.reason,
          outcome: 'not-sent'
        })
      )
      return
    }
    const onAbort = () => {
      clearTimeout(timer)
      reject(
        new LinePayAbortError({
          abortReason: signal?.reason,
          outcome: 'not-sent'
        })
      )
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

function positiveInteger(
  value: number | undefined,
  fallback: number,
  path: string
) {
  if (value === undefined) return fallback
  if (!Number.isInteger(value) || value < 1) {
    throw new LinePayValidationError({
      issues: [{ path, message: 'must be a positive integer' }],
      subject: 'configuration'
    })
  }
  return value
}

/**
 * A retry is safe in two cases only:
 *
 * - the request never left (`not-sent` network error), for every operation;
 * - the operation only reads, and what went wrong leaves its outcome unknown (a
 *   timeout, a broken connection, a server error); a read that LINE Pay refused
 *   would be refused again, and one the caller aborted is not repeated.
 *
 * An operation that moves money is never repeated after an unknown outcome: use
 * `reconcile` to find out what happened.
 */
function canRetry(error: AnyLinePayError, ctx: AnyCallContext): boolean {
  if (isLinePayAbortError(error)) return false
  if (isLinePayNetworkError(error) && error.outcome === 'not-sent') return true
  return effectOf(ctx) === 'read' && error.outcome === 'unknown'
}

/** What this call does. A call whose input cannot be read is not taken for a read. */
function effectOf<K extends OperationName>(
  ctx: CallContext<K>
): OperationEffect {
  const definition = operations[ctx.operation]
  try {
    return definition.effectOf?.(ctx.input) ?? definition.effect
  } catch {
    return 'create'
  }
}

/**
 * The caller gave up while the middleware was waiting to try again. It is still
 * an abort, but what is known about the call is what its last attempt said: that
 * attempt's outcome, operation, context and last response, which a plain abort
 * does not carry.
 */
function interrupted(
  abort: unknown,
  last: AnyLinePayError,
  ctx: AnyCallContext,
  attempts: number
): unknown {
  if (!isLinePayAbortError(abort)) return abort
  const error = new LinePayAbortError({
    abortReason: abort.abortReason,
    outcome: last.outcome === 'not-sent' ? 'not-sent' : 'unknown',
    operation: last.operation
  })
  error.context = last.context
  attachMeta(error, ctx, attempts, statusOf(last))
  return error
}

function withTotals(
  result: AnyResult,
  attempts: number,
  ctx: AnyCallContext
): AnyResult {
  return {
    ...result,
    meta: {
      ...result.meta,
      attempts,
      durationMs: Date.now() - ctx.startedAt.getTime()
    }
  }
}

/**
 * Repeat a call when that is provably safe, with capped exponential backoff and full
 * jitter. This is the default middleware of a client.
 */
export function retryWhenNotSent(options: RetryOptions = {}): Middleware {
  const maxAttempts = positiveInteger(options.maxAttempts, 3, 'maxAttempts')
  const baseDelayMs = positiveInteger(options.baseDelayMs, 200, 'baseDelayMs')
  const maxDelayMs = positiveInteger(options.maxDelayMs, 2000, 'maxDelayMs')
  const random = options.random ?? Math.random
  const sleep = options.sleep ?? defaultSleep

  return async (ctx, next) => {
    for (let attempt = 1; ; attempt++) {
      try {
        const result = await next()
        return attempt === 1 ? result : withTotals(result, attempt, ctx)
      } catch (error) {
        if (!isLinePayError(error)) throw error
        if (attempt >= maxAttempts || !canRetry(error, ctx)) {
          // The error is the last one: after a retry it says how many attempts
          // were made. Without one, what a step further in said stands (like the
          // meta of a result that was not repeated).
          if (attempt > 1 || error.meta === undefined) {
            attachMeta(error, ctx, attempt)
          }
          throw error
        }
        const ceiling = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
        try {
          await sleep(random() * ceiling, ctx.options.signal)
        } catch (abort) {
          throw interrupted(abort, error, ctx, attempt)
        }
      }
    }
  }
}
