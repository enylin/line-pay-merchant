import type { Middleware, ReconcileResult } from '../client-types'
import { callMeta } from '../core/annotate'
import { describeCause, isLinePayApiError, needsReconcile } from '../errors'
import {
  isReconcilableOperation,
  RECONCILABLE_OPERATIONS,
  type ReconcilableOperation
} from '../operations/names'

export interface AutoReconcileOptions {
  /** Operations to reconcile. All five reconcilable operations by default. */
  operations?: readonly ReconcilableOperation[]
}

/**
 * When a call ends with an unknown outcome (or LINE Pay answers with a duplicate
 * code), look the payment up with `client.reconcile`. If it was processed, the
 * call returns the inferred result, marked in `meta.recovered`. Otherwise the
 * original error is thrown again, with the conclusion in
 * `error.reconcileConclusion`.
 *
 * It is not on by default: it turns an error into a success, so you opt in.
 * Place it inside `retryWhenNotSent()`.
 */
export function autoReconcile(options: AutoReconcileOptions = {}): Middleware {
  const enabled = new Set<string>(options.operations ?? RECONCILABLE_OPERATIONS)

  return async (ctx, next) => {
    try {
      return await next()
    } catch (error) {
      if (
        !enabled.has(ctx.operation) ||
        !isReconcilableOperation(ctx.operation) ||
        !needsReconcile(error)
      ) {
        throw error
      }

      let result: ReconcileResult
      try {
        result = await ctx.client.reconcile(error, {
          signal: ctx.options.signal
        })
      } catch (lookupFailure) {
        // The error that matters is the one of the call. A lookup that broke
        // (a bug in a middleware, say) must not take its place.
        error.reconcileConclusion = {
          status: 'indeterminate',
          reason: `The lookup itself failed: ${
            describeCause(lookupFailure) ??
            'with something that is not an error'
          }`
        }
        throw error
      }

      if (result.status !== 'applied') {
        error.reconcileConclusion = {
          status: result.status,
          reason: result.reason
        }
        throw error
      }

      return {
        body: result.body,
        meta: {
          ...callMeta(ctx, 1),
          recovered: {
            reason:
              isLinePayApiError(error) && error.category === 'duplicate'
                ? 'duplicate'
                : 'unknown-outcome',
            cause: error,
            notes: result.notes
          }
        }
      }
    }
  }
}
