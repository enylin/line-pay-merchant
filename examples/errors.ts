import {
  type AnyLinePayError,
  isLinePayApiError,
  isLinePayError,
  isLinePayValidationError,
  type LinePayClient,
  needsReconcile
} from 'line-pay-merchant'

// #region branch
export async function refundOrder(
  linePay: LinePayClient,
  transactionId: string,
  refundAmount: number
) {
  try {
    const { body } = await linePay.refund({ transactionId, refundAmount })
    return {
      refunded: true,
      refundTransactionId: body.info.refundTransactionId
    }
  } catch (error) {
    if (isLinePayValidationError(error)) {
      // Nothing was sent: the input is wrong. `error.issues` says which field.
      throw error
    }
    // Ask this before looking at the answer of LINE Pay: some answers are no
    // refusal (a duplicate, an internal error), and the refund may have happened.
    if (needsReconcile(error)) {
      // Never send it again before you know.
      const result = await linePay.reconcile(error)
      if (result.status === 'applied' && result.operation === 'refund') {
        return {
          refunded: true,
          refundTransactionId: result.body.info.refundTransactionId
        }
      }
      // Not "false": nobody knows. A person looks in the Merchant Center.
      return { refunded: 'unknown', reconcile: result.status }
    }
    if (isLinePayApiError(error)) {
      // LINE Pay answered and refused. See `error.returnCode`.
      return { refunded: false, reason: error.returnCode }
    }
    throw error
  }
}
// #endregion branch

// #region outcome
export function describeFailure(error: unknown): string {
  if (!isLinePayError(error)) return 'a bug in our own code'

  switch (error.outcome) {
    case 'not-sent':
      return 'nothing left this process: nothing moved (fix the input first if it was invalid)'
    case 'rejected':
      // A duplicate is "rejected" too, and the first call may have worked.
      return needsReconcile(error)
        ? 'LINE Pay says it is a duplicate: reconcile, the first call may have worked'
        : 'LINE Pay refused it'
    case 'unknown':
      return 'it may have been processed: reconcile before doing anything else'
  }
}
// #endregion outcome

// #region code
/**
 * One line for the log, whatever went wrong. There is no `default`: the compiler
 * stops this function from building if a kind of error is added that it forgets.
 */
export function summarize(error: AnyLinePayError): string {
  switch (error.code) {
    case 'LINE_PAY_VALIDATION_ERROR':
      return `the input is invalid: ${error.issues.map(i => i.path).join(', ')}`
    case 'LINE_PAY_API_ERROR':
      return `LINE Pay said ${error.returnCode} (${error.category})`
    case 'LINE_PAY_HTTP_ERROR':
      return `HTTP ${error.httpStatus}: ${error.reason}`
    case 'LINE_PAY_NETWORK_ERROR':
      return `the network failed: ${error.reason}`
    case 'LINE_PAY_TIMEOUT_ERROR':
      return `no answer within ${error.timeoutMs} ms`
    case 'LINE_PAY_ABORT_ERROR':
      return 'the call was aborted'
    case 'LINE_PAY_MIDDLEWARE_ERROR':
      return 'a middleware handed back something that is not a result'
  }
}
// #endregion code
