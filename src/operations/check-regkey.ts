import { type Guard, hasShape } from '../core/guard'
import { RESPONSE_FIELDS } from '../core/response-guards'
import { pathSegment } from '../core/validate'
import type { LinePayResponse } from '../types'
import type { OperationDefinition } from './define'

/** Fields of the check regKey API. `regKey` goes into the URL. */
export interface CheckRegKeyInput {
  regKey: string
  /**
   * `true` verifies the card with a minimum authorization (needs approval from
   * the LINE Pay manager). `false` checks the status with LINE Pay only. A check
   * with `true` is not repeated by `retryWhenNotSent` after an unknown outcome.
   */
  creditCardAuth?: boolean
}

export type CheckRegKeyResponse = LinePayResponse

const isCheckRegKeyResponse: Guard<CheckRegKeyResponse> =
  hasShape(RESPONSE_FIELDS)

export const checkRegKeyOperation: OperationDefinition<
  CheckRegKeyInput,
  CheckRegKeyResponse
> = {
  method: 'GET',
  defaultTimeout: 20_000,
  effect: 'read',
  response: isCheckRegKeyResponse,
  // With `creditCardAuth` the check places a card authorization. It is not a
  // read any more: repeating it after an unknown outcome could authorize the card
  // again. Anything but an explicit `false` counts, so that a value of the wrong
  // type, which is sent all the same, does not slip through as a read.
  effectOf: input =>
    input.creditCardAuth === undefined || input.creditCardAuth === false
      ? 'read'
      : 'create',
  path: input =>
    `/v4/payments/preapprovedPay/${pathSegment('regKey', input.regKey)}/check`,
  check(input, c) {
    c.onlyFields('', input, ['regKey', 'creditCardAuth'], 'a regKey check')
    if (input.creditCardAuth !== undefined) {
      c.boolean('creditCardAuth', input.creditCardAuth)
    }
  },
  query: input => ({ creditCardAuth: input.creditCardAuth })
}
