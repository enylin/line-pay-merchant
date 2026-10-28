import { type Guard, hasShape } from '../core/guard'
import { RESPONSE_FIELDS } from '../core/response-guards'
import { pathSegment } from '../core/validate'
import type { LinePayResponse } from '../types'
import type { OperationDefinition } from './define'

export interface ExpireRegKeyInput {
  regKey: string
}

export type ExpireRegKeyResponse = LinePayResponse

const isExpireRegKeyResponse: Guard<ExpireRegKeyResponse> =
  hasShape(RESPONSE_FIELDS)

export const expireRegKeyOperation: OperationDefinition<
  ExpireRegKeyInput,
  ExpireRegKeyResponse
> = {
  method: 'POST',
  defaultTimeout: 20_000,
  effect: 'settle',
  response: isExpireRegKeyResponse,
  path: input =>
    `/v4/payments/preapprovedPay/${pathSegment('regKey', input.regKey)}/expire`,
  check(input, c) {
    c.onlyFields('', input, ['regKey'], 'expiring a regKey')
  },
  body: () => ({})
}
