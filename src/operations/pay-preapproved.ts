import { type Guard, hasShape, isString } from '../core/guard'
import { isPaymentProvider, RESPONSE_FIELDS } from '../core/response-guards'
import { CURRENCIES, pathSegment } from '../core/validate'
import type { Currency, LinePayResponse, PaymentProvider } from '../types'
import type { OperationDefinition } from './define'

/** Fields of the pre-approved payment API. `regKey` goes into the URL. */
export interface PayPreapprovedInput {
  regKey: string
  productName: string
  amount: number
  currency: Currency
  /** A unique order ID, at most 100 characters. Also the key to reconcile. */
  orderId: string
  /** `false` only authorizes; capture later with `capture`. */
  capture?: boolean
}

export interface PayPreapprovedResponse extends LinePayResponse {
  info: {
    orderId?: string
    /** 19 digits. */
    transactionId: string
    /** ISO 8601. */
    transactionDate: string
    /** The V4 clearing provider (TSP or EPI). */
    paymentProvider?: PaymentProvider
    /** ISO 8601. Only when `capture` is `false`. */
    authorizationExpireDate?: string
  }
}

const isPayPreapprovedResponse: Guard<PayPreapprovedResponse> = hasShape({
  ...RESPONSE_FIELDS,
  info: hasShape(
    { transactionId: isString, transactionDate: isString },
    {
      orderId: isString,
      authorizationExpireDate: isString,
      paymentProvider: isPaymentProvider
    }
  )
})

export const payPreapprovedOperation: OperationDefinition<
  PayPreapprovedInput,
  PayPreapprovedResponse
> = {
  method: 'POST',
  defaultTimeout: 40_000,
  effect: 'settle',
  response: isPayPreapprovedResponse,
  path: input =>
    `/v4/payments/preapprovedPay/${pathSegment('regKey', input.regKey)}/payment`,
  check(input, c) {
    c.onlyFields(
      '',
      input,
      ['regKey', 'productName', 'amount', 'currency', 'orderId', 'capture'],
      'a pre-approved payment'
    )
    c.nonEmptyString('productName', input.productName)
    c.positiveNumber('amount', input.amount)
    c.oneOf('currency', input.currency, CURRENCIES)
    c.nonEmptyString('orderId', input.orderId, 100)
    // `false` authorizes without capturing: a text of 'false' is not that.
    if (input.capture !== undefined) c.boolean('capture', input.capture)
  },
  body: ({ regKey: _regKey, ...body }) => body,
  // Not the regKey: it is a credential, and reconcile looks the payment up by
  // its order ID.
  reconcileFields: ({ orderId, amount, currency }) => ({
    orderId,
    amount,
    currency
  })
}
