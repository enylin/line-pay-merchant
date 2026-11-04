import type {
  AnyCallContext,
  AnyResult,
  CallContext,
  Middleware,
  ResultOf
} from '../client-types'
import { LinePayMiddlewareError } from '../errors'
import { operations } from '../operations/index'
import type { OperationName } from '../operations/names'
import { attachContext } from './annotate'

export type Terminal = (ctx: AnyCallContext) => Promise<AnyResult>

/**
 * Chain the middleware around the terminal step. Each `next()` starts the inner
 * part of the chain again, so a middleware may call it several times.
 */
export function compose(
  middleware: readonly Middleware[],
  terminal: Terminal
): Terminal {
  return ctx => {
    const run = async (index: number): Promise<AnyResult> => {
      const current = middleware[index]
      return current === undefined
        ? terminal(ctx)
        : current(ctx, () => run(index + 1))
    }
    return run(0)
  }
}

/**
 * The result of the operation that was called. A middleware may hand back any
 * result the type of `AnyResult` allows, so the body is checked once more against
 * what the operation promises: the caller gets the type it was told it gets, or an
 * error that says a middleware broke the rule. The request may have been sent and
 * taken effect by then, so the error carries the context of the call.
 */
export function resultOf<K extends OperationName>(
  ctx: CallContext<K>,
  result: AnyResult,
  channelId: string
): ResultOf<K> {
  const body: unknown = result.body
  if (!operations[ctx.operation].response(body)) {
    const error = new LinePayMiddlewareError({ operation: ctx.operation })
    attachContext(error, ctx, channelId)
    throw error
  }
  return { body, meta: result.meta }
}
