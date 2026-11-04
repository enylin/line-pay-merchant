import type { AnyCallContext, CallContext, ResultOf } from '../client-types'
import type { ResolvedConfig } from '../config'
import {
  isLinePayError,
  isLinePayValidationError,
  LinePayHttpError,
  LinePayValidationError
} from '../errors'
import { operations } from '../operations/index'
import type { OperationName } from '../operations/names'
import { attachContext, attachMeta, callMeta } from './annotate'
import type { Terminal } from './pipeline'
import { buildQuery } from './query'
import { interpretResponse } from './response'
import { authHeaders, createSigner } from './sign'
import { sendRequest } from './transport'
import { Checker } from './validate'

/** The JSON of a body. What cannot be written as JSON is an input problem. */
function stringify(value: unknown): string {
  try {
    return JSON.stringify(value)
  } catch (cause) {
    throw new LinePayValidationError({
      issues: [
        {
          path: 'input',
          message:
            'cannot be written as JSON (a BigInt, or a value that refers to itself)'
        }
      ],
      cause
    })
  }
}

/**
 * A path parameter is checked without knowing which operation it is for. What is
 * refused is refused for the operation that was called, like every other problem
 * with its input.
 */
function refusedFor(error: unknown, operation: OperationName): unknown {
  return isLinePayValidationError(error)
    ? new LinePayValidationError({
        issues: error.issues,
        operation,
        cause: error.cause
      })
    : error
}

/** The last step of every call: validate, sign, send, interpret. */
export function createExecutor(config: ResolvedConfig): Terminal {
  const sign = createSigner(config.channelSecretKey)

  const execute = async <K extends OperationName>(
    ctx: CallContext<K>
  ): Promise<ResultOf<K>> => {
    const definition = operations[ctx.operation]
    const { input } = ctx
    if (typeof input !== 'object' || input === null) {
      throw new LinePayValidationError({
        issues: [{ path: 'input', message: 'must be an object' }],
        operation: ctx.operation
      })
    }

    // Path parameters and the rules about what a request means are always
    // checked; the business rules can be switched off.
    let path: string
    try {
      path = definition.path(input)
    } catch (error) {
      throw refusedFor(error, ctx.operation)
    }
    const checker = new Checker()
    definition.invariants?.(input, checker)
    if (config.validate) definition.check?.(input, checker)
    checker.throwIfInvalid({ operation: ctx.operation })

    // The signature covers exactly what is sent. The query is signed the way the
    // URL parser leaves it, and that URL is what goes to `fetch`: the parser
    // rewrites a few characters (a quote becomes %27), and a signature made from
    // the text before it would not match the request.
    const target = new URL(config.baseUrl + path)
    let payload: string
    let body: string | undefined
    if (definition.method === 'GET') {
      const query = buildQuery(definition.query(input))
      if (query !== '') target.search = query
      payload = target.search.slice(1)
    } else {
      payload = stringify(definition.body(input))
      body = payload
    }

    const nonce = crypto.randomUUID()
    const signature = await sign(path, payload, nonce)

    const response = await sendRequest({
      fetch: config.fetch,
      method: definition.method,
      url: target.href,
      headers: authHeaders({
        channelId: config.channelId,
        nonce,
        signature,
        merchantDeviceProfileId: config.merchantDeviceProfileId,
        merchantDeviceType: config.merchantDeviceType
      }),
      body,
      timeoutMs:
        ctx.options.timeout ??
        config.timeouts[ctx.operation] ??
        config.timeout ??
        definition.defaultTimeout,
      signal: ctx.options.signal
    })

    const { body: received, httpStatus } = interpretResponse(response, {
      statusCodes: definition.statusCodes === true
    })
    // The type of the response is what this check found, not what was hoped for.
    // (It is checked as `unknown` so that the compiler narrows it to the type of
    // the operation.)
    const parsed: unknown = received
    if (!definition.response(parsed)) {
      throw new LinePayHttpError({
        httpStatus,
        reason: 'unexpected-shape',
        outcome: 'unknown',
        body: received
      })
    }
    return { body: parsed, meta: callMeta(ctx, 1, httpStatus) }
  }

  return async (ctx: AnyCallContext) => {
    try {
      return await execute(ctx)
    } catch (error) {
      if (isLinePayError(error)) {
        attachContext(error, ctx, config.channelId)
        attachMeta(error, ctx, 1)
      }
      throw error
    }
  }
}
