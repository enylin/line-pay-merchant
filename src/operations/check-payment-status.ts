import {
  type Guard,
  hasShape,
  isListOf,
  isNumber,
  isString
} from '../core/guard'
import { RESPONSE_FIELDS } from '../core/response-guards'
import { pathSegment } from '../core/validate'
import type { LinePayResponse } from '../types'
import type { OperationDefinition } from './define'

export interface CheckPaymentStatusInput {
  transactionId: string
}

/**
 * The status of the request is carried by `returnCode`; codes that start with `0`
 * are returned as they are and not thrown. **Here `0000` is not a success**:
 *
 * | `returnCode` | Meaning                                                  |
 * | ------------ | -------------------------------------------------------- |
 * | `0000`       | The user has not authorized the payment yet.             |
 * | `0110`       | Authorized: `confirm` can be called.                     |
 * | `0121`       | Canceled by the user, or timed out (20 minutes). Final.  |
 * | `0122`       | Failed. Final.                                           |
 * | `0123`       | Completed. Final.                                        |
 *
 * Mark an order paid on the result of `confirm` (or of `reconcile`), never on
 * what this says.
 *
 * TODO(v4-spec): these are the V3 meanings. A third-party V4 SDK documents
 * status strings (`PENDING`, `AUTHORIZED`, ...); verify against the reference.
 */
export interface CheckPaymentStatusResponse extends LinePayResponse {
  info?: { shipping?: { methodId: string; feeAmount: number } }[]
}

const isCheckPaymentStatusResponse: Guard<CheckPaymentStatusResponse> =
  hasShape(RESPONSE_FIELDS, {
    info: isListOf(
      hasShape(
        {},
        { shipping: hasShape({ methodId: isString, feeAmount: isNumber }) }
      )
    )
  })

export const checkPaymentStatusOperation: OperationDefinition<
  CheckPaymentStatusInput,
  CheckPaymentStatusResponse
> = {
  method: 'GET',
  defaultTimeout: 20_000,
  effect: 'read',
  response: isCheckPaymentStatusResponse,
  statusCodes: true,
  path: input =>
    `/v4/payments/requests/${pathSegment('transactionId', input.transactionId)}/check`,
  check(input, c) {
    c.onlyFields('', input, ['transactionId'], 'a payment status check')
  },
  query: () => ({})
}
