import {
  autoReconcile,
  createLinePayClient,
  type Middleware,
  retryWhenNotSent
} from 'line-pay-merchant'

// #region logging
/** Log every call: what it was, how long it took, and how it ended. */
export const logCalls: Middleware = async (ctx, next) => {
  try {
    const result = await next()
    console.info({
      operation: ctx.operation,
      // `ctx.input` is narrowed by `ctx.operation`.
      transactionId:
        ctx.operation === 'confirm' ? ctx.input.transactionId : undefined,
      durationMs: result.meta.durationMs,
      attempts: result.meta.attempts,
      // Present only when reconcile inferred the result. Keep it in the logs.
      recovered: result.meta.recovered?.reason
    })
    return result
  } catch (error) {
    // An error prints a safe view, to the console as well: its stack, code,
    // outcome and return code. No response body, headers or secret.
    console.warn({ operation: ctx.operation, error })
    throw error
  }
}
// #endregion logging

// #region guard
/** Refuse to refund from this process, for example in a reporting job. */
export const noRefunds: Middleware = (ctx, next) => {
  if (ctx.operation === 'refund') {
    return Promise.reject(new Error('Refunds are disabled in this process'))
  }
  return next()
}
// #endregion guard

// #region compose
export const linePay = createLinePayClient({
  channelId: process.env.LINE_PAY_CHANNEL_ID ?? '',
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env: 'sandbox',
  // The first one is the outermost: it sees the final result of the others.
  middleware: [logCalls, retryWhenNotSent(), autoReconcile()]
})
// #endregion compose
