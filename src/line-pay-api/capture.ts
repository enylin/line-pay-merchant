import { LinePayApiClients } from '@/payment-api/type'
import { FormatError } from './error/format'
import { GeneralRequestConfig, GeneralResponseBody } from './type'

/** Request */
export type Options = {
  extra: {
    /**
     * 點數限制資訊 (Taiwan only)
     *
     * - useLimit: 不可使用點數折抵的金額
     * - rewardLimit: 不可回饋點數的金額
     * ```json
     * "promotionRestriction": {
     *     "useLimit": 100,
     *     "rewardLimit": 100
     * }
     * ```
     */
    promotionRestriction: Record<string, unknown>
  }
}

export type CaptureRequestBody = {
  /**
   * Payment amount
   */
  amount: number
  /**
   * Payment currency (ISO 4217)
   * - Supported currencies: USD, JPY, TWD, THB
   */
  currency: string
  /**
   * Options
   */
  options?: Options
}

export type CaptureRequestConfig = GeneralRequestConfig & {
  /**
   * ID of the transaction
   */
  transactionId: string
  /**
   * Request body of capture API
   */
  body: CaptureRequestBody
}

/** Response */
export type PayInfo = {
  /**
   * A payment method used to process the payment
   * - Credit card: CREDIT_CARD
   * - Balance: BALANCE
   * - Discount: DISCOUNT
   */
  method: 'CREDIT_CARD' | 'BALANCE' | 'DISCOUNT'
  /**
   * Payment amount
   */
  amount: number
}

export type Info = {
  /**
   * An order ID sent from the merchant when reserving a payment.
   */
  orderId: string
  /**
   * A transaction ID returned as the payment reservation result (19 digits).
   */
  transactionId: string
  /**
   * Payment information
   */
  payInfo: PayInfo[]
}

export type CaptureResponseBody = GeneralResponseBody & {
  /**
   * Capture information
   */
  info: Info
}

export const defaultTimeout = 60000

export const captureWithClient: LinePayApiClients['capture'] =
  httpClient =>
  async ({ transactionId, body, timeout }) => {
    if (!transactionId) throw new FormatError('"transactionId" is required')

    if (!body) throw new FormatError('"body" is required')

    const { data } = await httpClient.post<
      CaptureRequestBody,
      CaptureResponseBody
    >(`/v3/payments/authorizations/${transactionId}/capture`, body, {
      timeout: timeout ?? defaultTimeout
    })

    return data
  }
