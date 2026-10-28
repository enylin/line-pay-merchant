import { type Guard, hasShape, isListOf, isString } from '../core/guard'
import {
  isPayInfo,
  isPaymentProvider,
  isResponsePackage,
  isSelectedShipping,
  RESPONSE_FIELDS
} from '../core/response-guards'
import { CURRENCIES, pathSegment } from '../core/validate'
import type {
  Currency,
  LinePayResponse,
  PayInfo,
  PaymentProvider,
  ResponsePackage,
  SelectedShipping
} from '../types'
import type { OperationDefinition } from './define'

/** Fields of the confirm API. `transactionId` goes into the URL. */
export interface ConfirmInput {
  /**
   * Transaction ID returned by `request`. It is also on the confirmUrl, but that
   * one comes from the browser: use the ID you stored for the order, or check
   * that the one from the URL is that one.
   */
  transactionId: string
  /** Must equal the amount of the request. */
  amount: number
  currency: Currency
}

export interface ConfirmResponse extends LinePayResponse {
  info: {
    orderId: string
    transactionId: string
    /** Only when the payment was authorized without capture. ISO 8601. */
    authorizationExpireDate?: string
    /**
     * Key for payments without approval (15 characters). It is only returned
     * here, so store it right away.
     */
    regKey?: string
    payInfo: PayInfo[]
    packages?: ResponsePackage[]
    shipping?: SelectedShipping
    /** TODO(v4-spec): added in the 2025-11 API change log. */
    paymentProvider?: PaymentProvider
  }
}

const isConfirmResponse: Guard<ConfirmResponse> = hasShape({
  ...RESPONSE_FIELDS,
  info: hasShape(
    {
      orderId: isString,
      transactionId: isString,
      payInfo: isListOf(isPayInfo)
    },
    {
      authorizationExpireDate: isString,
      regKey: isString,
      packages: isListOf(isResponsePackage),
      shipping: isSelectedShipping,
      paymentProvider: isPaymentProvider
    }
  )
})

export const confirmOperation: OperationDefinition<
  ConfirmInput,
  ConfirmResponse
> = {
  method: 'POST',
  defaultTimeout: 40_000,
  effect: 'settle',
  response: isConfirmResponse,
  path: input =>
    `/v4/payments/${pathSegment('transactionId', input.transactionId)}/confirm`,
  check(input, c) {
    c.onlyFields(
      '',
      input,
      ['transactionId', 'amount', 'currency'],
      'a confirm'
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
