import { type Guard, hasShape, isString } from '../core/guard'
import { RESPONSE_FIELDS } from '../core/response-guards'
import { pathSegment } from '../core/validate'
import type { LinePayResponse } from '../types'
import type { OperationDefinition } from './define'

/** Fields of the refund API. `transactionId` goes into the URL. */
export interface RefundInput {
  /** The transaction ID of the payment to refund. */
  transactionId: string
  /** Leave it out to refund the whole payment. */
  refundAmount?: number
}

export interface RefundResponse extends LinePayResponse {
  info: {
    /** The newly issued transaction ID of the refund. */
    refundTransactionId: string
    /** ISO 8601. */
    refundTransactionDate: string
  }
}

const isRefundResponse: Guard<RefundResponse> = hasShape({
  ...RESPONSE_FIELDS,
  info: hasShape({
    refundTransactionId: isString,
    refundTransactionDate: isString
  })
})

export const refundOperation: OperationDefinition<RefundInput, RefundResponse> =
  {
    method: 'POST',
    // Refunds are not idempotent: a partial refund can legitimately be repeated.
    defaultTimeout: 20_000,
    effect: 'refund',
    response: isRefundResponse,
    path: input =>
      `/v4/payments/${pathSegment('transactionId', input.transactionId)}/refund`,
    // Leaving the amount out refunds the whole payment, and that cannot be undone.
    // So whatever is not a plain amount must not turn into that, and these rules
    // hold with `validate: false` too:
    invariants(input, c) {
      // A key that is there without a value (a variable that was never set).
      if ('refundAmount' in input && input.refundAmount === undefined) {
        c.fail(
          'refundAmount',
          'is undefined; leave it out to refund the whole payment'
        )
      } else if (input.refundAmount !== undefined) {
        // NaN and the infinities are written as `null` by JSON.
        c.positiveNumber('refundAmount', input.refundAmount)
      }
      // A misspelled key (refundAmout) would be a full refund.
      for (const key of Object.keys(input)) {
        if (key !== 'transactionId' && key !== 'refundAmount') {
          c.fail(key, 'is not a field of a refund (the amount is refundAmount)')
        }
      }
    },
    body: input =>
      input.refundAmount === undefined
        ? {}
        : { refundAmount: input.refundAmount },
    reconcileFields: ({ transactionId, refundAmount }) =>
      refundAmount === undefined
        ? { transactionId }
        : { transactionId, refundAmount }
  }
