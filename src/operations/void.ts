import { type Guard, hasShape } from '../core/guard'
import { RESPONSE_FIELDS } from '../core/response-guards'
import { pathSegment } from '../core/validate'
import type { LinePayResponse } from '../types'
import type { OperationDefinition } from './define'

/** Voids an authorization that has not been captured. */
export interface VoidInput {
  transactionId: string
}

export type VoidResponse = LinePayResponse

const isVoidResponse: Guard<VoidResponse> = hasShape(RESPONSE_FIELDS)

export const voidOperation: OperationDefinition<VoidInput, VoidResponse> = {
  method: 'POST',
  defaultTimeout: 20_000,
  effect: 'settle',
  response: isVoidResponse,
  path: input =>
    `/v4/payments/authorizations/${pathSegment('transactionId', input.transactionId)}/void`,
  check(input, c) {
    c.onlyFields('', input, ['transactionId'], 'a void')
  },
  body: () => ({}),
  reconcileFields: ({ transactionId }) => ({ transactionId })
}
