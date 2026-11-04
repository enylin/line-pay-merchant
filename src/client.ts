import type {
  AnyCallContext,
  CallContext,
  CallOptions,
  LinePayClient,
  Middleware,
  ResultOf
} from './client-types'
import {
  isValidTimeout,
  type LinePayConfig,
  resolveConfig,
  TIMEOUT_MESSAGE
} from './config'
import { createExecutor } from './core/execute'
import { compose, resultOf, type Terminal } from './core/pipeline'
import { isPlainObject, snapshotOf } from './core/snapshot'
import { Checker } from './core/validate'
import type { OperationInput } from './operations'
import type { OperationName } from './operations/names'
import { reconcile } from './reconcile'

/**
 * The options of a call, as the call will use them. What is checked is the copy,
 * not the object that was given: an option that a copy leaves out (behind a
 * getter, on a prototype) would otherwise pass the check and then not be there.
 */
function optionsOf(
  options: unknown,
  operation: OperationName
): Readonly<CallOptions> {
  const checker = new Checker()
  let timeout: number | undefined
  let signal: AbortSignal | undefined
  if (!isPlainObject(options)) {
    checker.fail('options', 'must be a plain object')
  } else {
    const own = { ...options }
    checker.onlyFields(
      'options',
      own,
      ['timeout', 'signal'],
      'the call options'
    )
    if (own.timeout !== undefined) {
      if (isValidTimeout(own.timeout)) timeout = own.timeout
      else checker.fail('options.timeout', TIMEOUT_MESSAGE)
    }
    if (own.signal !== undefined) {
      if (own.signal instanceof AbortSignal) signal = own.signal
      else checker.fail('options.signal', 'must be an AbortSignal')
    }
  }
  checker.throwIfInvalid({ operation })
  return Object.freeze({
    ...(timeout === undefined ? {} : { timeout }),
    ...(signal === undefined ? {} : { signal })
  })
}

function buildClient(
  terminal: Terminal,
  middleware: readonly Middleware[],
  channelId: string
): LinePayClient {
  const run = compose(middleware, terminal)

  // Each method names its operation itself, so that the compiler can follow the
  // call through the middleware (which handle every operation) and back to the
  // result that this method promises.
  const contextOf = <K extends OperationName>(
    operation: K,
    input: OperationInput<K>,
    options: CallOptions
  ): CallContext<K> => {
    return {
      operation,
      options: optionsOf(options, operation),
      input: snapshotOf(input, operation),
      startedAt: new Date(),
      client
    }
  }

  // The context is made inside the call, so that a call whose options or input
  // are refused is a rejection like any other. `K & AnyCallContext` is the context
  // of one operation, and still a context the middleware accept.
  const call = async <K extends OperationName>(
    make: () => CallContext<K> & AnyCallContext
  ): Promise<ResultOf<K>> => {
    const ctx = make()
    return resultOf<K>(ctx, await run(ctx), channelId)
  }

  const client: LinePayClient = {
    request: (input, options = {}) =>
      call(() => contextOf('request', input, options)),
    confirm: (input, options = {}) =>
      call(() => contextOf('confirm', input, options)),
    capture: (input, options = {}) =>
      call(() => contextOf('capture', input, options)),
    void: (input, options = {}) =>
      call(() => contextOf('void', input, options)),
    refund: (input, options = {}) =>
      call(() => contextOf('refund', input, options)),
    paymentDetails: (input, options = {}) =>
      call(() => contextOf('paymentDetails', input, options)),
    checkPaymentStatus: (input, options = {}) =>
      call(() => contextOf('checkPaymentStatus', input, options)),
    checkRegKey: (input, options = {}) =>
      call(() => contextOf('checkRegKey', input, options)),
    payPreapproved: (input, options = {}) =>
      call(() => contextOf('payPreapproved', input, options)),
    expireRegKey: (input, options = {}) =>
      call(() => contextOf('expireRegKey', input, options)),
    with: (...more) => {
      // The chain ends at the first thing that is not a function: what follows
      // it would never run, a guard among it.
      const checker = new Checker()
      more.forEach((entry: unknown, index) => {
        if (typeof entry !== 'function') {
          checker.fail(`middleware[${index}]`, 'must be a function')
        }
      })
      checker.throwIfInvalid({ subject: 'configuration' })
      return buildClient(terminal, [...middleware, ...more], channelId)
    },
    reconcile: (errorOrContext, options) =>
      reconcile(client, channelId, errorOrContext, options)
  }
  return Object.freeze(client)
}

/**
 * Create a client. It does not connect to anything and keeps no global state, so
 * creating one per merchant is cheap.
 *
 * @example
 * const linePay = createLinePayClient({
 *   channelId: process.env.LINE_PAY_CHANNEL_ID ?? '',
 *   channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
 *   env: 'sandbox'
 * })
 *
 * @throws {LinePayValidationError} when the configuration is invalid.
 */
export function createLinePayClient(config: LinePayConfig): LinePayClient {
  const resolved = resolveConfig(config)
  return buildClient(
    createExecutor(resolved),
    resolved.middleware,
    resolved.channelId
  )
}
