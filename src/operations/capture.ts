import { type Guard, hasShape, isListOf, isString } from '../core/guard'
import {
  isPayInfo,
  isPaymentProvider,
  RESPONSE_FIELDS
} from '../core/response-guards'
import { CURRENCIES, pathSegment } from '../core/validate'
import type {
  Currency,
  LinePayResponse,
  PayInfo,
  PaymentProvider
} from '../types'
import type { OperationDefinition } from './define'

export interface CaptureOptions {
  extra: {
    /**
     * Points restriction (Taiwan only). `useLimit` is the amount that cannot be
     * paid with points; `rewardLimit` the amount that earns no reward points.
     */
    promotionRestriction: Record<string, unknown>
  }
}

/** Fields of the capture API. `transactionId` goes into the URL. */
export interface CaptureInput {
  transactionId: string
  amount: number
  currency: Currency
  options?: CaptureOptions
}

export interface CaptureResponse extends LinePayResponse {
  info: {
    orderId: string
    transactionId: string
    payInfo: PayInfo[]
    /** TODO(v4-spec): added in the 2025-11 API change log. */
    paymentProvider?: PaymentProvider
  }
}

const isCaptureResponse: Guard<CaptureResponse> = hasShape({
  ...RESPONSE_FIELDS,
  info: hasShape(
    {
      orderId: isString,
      transactionId: isString,
      payInfo: isListOf(isPayInfo)
    },
    { paymentProvider: isPaymentProvider }
  )
})

export const captureOperation: OperationDefinition<
  CaptureInput,
  CaptureResponse
> = {
  method: 'POST',
  defaultTimeout: 60_000,
  effect: 'settle',
  response: isCaptureResponse,
  path: input =>
    `/v4/payments/authorizations/${pathSegment('transactionId', input.transactionId)}/capture`,
  check(input, c) {
    c.onlyFields(
      '',
      input,
      ['transactionId', 'amount', 'currency', 'options'],
      'a capture'
    )
    c.positiveNumber('amount', input.amount)
    c.oneOf('currency', input.currency, CURRENCIES)
  },
  body: ({ transactionId: _transactionId, ...body }) => body,
  reconcileFields: ({ transactionId, amount, currency }) => ({
    transactionId,
    amount,
    currency
  })
}
