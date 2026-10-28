import {
  type Guard,
  hasShape,
  isArray,
  isListOf,
  isNumber,
  isString
} from '../core/guard'
import {
  isPayInfo,
  isPaymentProvider,
  isResponsePackage,
  isSelectedShipping,
  RESPONSE_FIELDS
} from '../core/response-guards'
import { isTransactionId } from '../core/validate'
import { LinePayValidationError, type ValidationIssue } from '../errors'
import type {
  LinePayResponse,
  OpenString,
  PayInfo,
  PaymentProvider,
  ResponsePackage,
  SelectedShipping
} from '../types'
import type { OperationDefinition } from './define'

/**
 * Query of the payment details API. Pass at least one of the two ID lists.
 *
 * TODO(v4-spec): a list of several values is sent as repeated parameters
 * (`transactionId=1&transactionId=2`), where 0.9 sent them comma-joined, and
 * nothing has run against the V4 sandbox. Try a lookup of two values before you
 * depend on it. A list of one value is the same in both.
 */
export interface PaymentDetailsInput {
  /** Transaction IDs of payments or refunds. */
  transactionId?: string[]
  /** Your order IDs. */
  orderId?: string[]
}

export interface RefundEntry {
  /** 19 digits. */
  refundTransactionId: string
  /** `PAYMENT_REFUND` or `PARTIAL_REFUND`. */
  transactionType: OpenString<'PAYMENT_REFUND' | 'PARTIAL_REFUND'>
  /**
   * The amount that was refunded. The sandbox has been observed to report it as
   * a negative number, so compare absolute values.
   */
  refundAmount: number
  /** ISO 8601. */
  refundTransactionDate: string
}

export interface PromotionEvent {
  /** Alphanumeric event code. */
  code: string
  totalAmount: number
  productQuantity: number
}

/**
 * One payment or refund of the payment details. Only the ID and the type are
 * always there; the rest is what a payment carries, and what a refund does not
 * necessarily have (TODO(v4-spec): the shape of a refund entry is not verified).
 */
export interface PaymentDetailsInfo {
  /** 19 digits. */
  transactionId: string
  /** `PAYMENT`, `PAYMENT_REFUND` or `PARTIAL_REFUND`. */
  transactionType: OpenString<'PAYMENT' | 'PAYMENT_REFUND' | 'PARTIAL_REFUND'>
  orderId?: string
  /** ISO 8601. */
  transactionDate?: string
  /**
   * - `CAPTURE`: captured
   * - `AUTHORIZATION`: authorized, not yet captured
   * - `VOIDED_AUTHORIZATION`: authorization voided
   * - `EXPIRED_AUTHORIZATION`: authorization expired
   */
  payStatus?: OpenString<
    | 'CAPTURE'
    | 'AUTHORIZATION'
    | 'VOIDED_AUTHORIZATION'
    | 'EXPIRED_AUTHORIZATION'
  >
  productName?: string
  merchantName?: string
  /** ISO 4217. Older transactions can be in a currency the library no longer lists. */
  currency?: string
  /** ISO 8601. Present for authorizations. */
  authorizationExpireDate?: string
  payInfo?: PayInfo[]
  /** Refunds of the original transaction. */
  refundList?: RefundEntry[]
  /** Set when this entry is a refund: the payment that was refunded (19 digits). */
  originalTransactionId?: string
  packages?: ResponsePackage[]
  shipping?: SelectedShipping
  events?: PromotionEvent[]
  /** TODO(v4-spec): added in the 2025-11 API change log. */
  paymentProvider?: PaymentProvider
}

export interface PaymentDetailsResponse extends LinePayResponse {
  info: PaymentDetailsInfo[]
}

const isRefundEntry: Guard<RefundEntry> = hasShape({
  refundTransactionId: isString,
  transactionType: isString,
  refundAmount: isNumber,
  refundTransactionDate: isString
})

const isPromotionEvent: Guard<PromotionEvent> = hasShape({
  code: isString,
  totalAmount: isNumber,
  productQuantity: isNumber
})

const isPaymentDetailsInfo: Guard<PaymentDetailsInfo> = hasShape(
  { transactionId: isString, transactionType: isString },
  {
    orderId: isString,
    transactionDate: isString,
    payStatus: isString,
    productName: isString,
    merchantName: isString,
    currency: isString,
    authorizationExpireDate: isString,
    payInfo: isListOf(isPayInfo),
    refundList: isListOf(isRefundEntry),
    originalTransactionId: isString,
    packages: isListOf(isResponsePackage),
    shipping: isSelectedShipping,
    events: isListOf(isPromotionEvent),
    paymentProvider: isPaymentProvider
  }
)

const isPaymentDetailsResponse: Guard<PaymentDetailsResponse> = hasShape({
  ...RESPONSE_FIELDS,
  info: isListOf(isPaymentDetailsInfo)
})

const isEmpty = (list: unknown) => !isArray(list) || list.length === 0

/**
 * The transaction IDs of a lookup, as strings. A number would be rounded without
 * a word (`2021121300698360311` becomes `2021121300698360300`) and the wrong
 * payment would be looked up, so this is checked even with `validate: false`.
 */
function transactionIds(ids: unknown): string[] | undefined {
  if (ids === undefined) return undefined
  if (!isArray(ids)) {
    throw new LinePayValidationError({
      issues: [{ path: 'transactionId', message: 'must be an array of IDs' }]
    })
  }
  const valid: string[] = []
  const issues: ValidationIssue[] = []
  ids.forEach((id: unknown, index) => {
    if (isTransactionId(id)) {
      valid.push(id)
    } else {
      issues.push({
        path: `transactionId[${index}]`,
        message: 'must be a string of 1 to 19 digits'
      })
    }
  })
  if (issues.length > 0) throw new LinePayValidationError({ issues })
  return valid
}

export const paymentDetailsOperation: OperationDefinition<
  PaymentDetailsInput,
  PaymentDetailsResponse
> = {
  method: 'GET',
  defaultTimeout: 60_000,
  effect: 'read',
  response: isPaymentDetailsResponse,
  path: () => '/v4/payments',
  check(input, c) {
    c.onlyFields(
      '',
      input,
      ['transactionId', 'orderId'],
      'a payment details lookup'
    )
    if (isEmpty(input.transactionId) && isEmpty(input.orderId)) {
      c.fail('transactionId', 'or orderId must contain at least one value')
    }
    if (isArray(input.orderId)) {
      input.orderId.forEach((id: unknown, index) => {
        c.nonEmptyString(`orderId[${index}]`, id)
      })
    }
  },
  query: input => ({
    transactionId: transactionIds(input.transactionId),
    orderId: input.orderId
  })
}
