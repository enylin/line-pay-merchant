import { LinePayApiClients } from '@/payment-api/type'
import { GeneralRequestConfig, GeneralResponseBody } from './type'

export type RefundRequestBody = {
  /**
   * Refund amount
   * - Full refund if not returned
   */
  refundAmount: number
}

export type RefundRequestConfig = GeneralRequestConfig & {
  /**
   * ID of the transaction
   */
  transactionId: string
  /**
   * Request body of refund API
   */
  body: RefundRequestBody
}

export type Info = {
  /**
   * Refund transaction ID (Newly issued, 19 digits)
   */
  refundTransactionId: string
  /**
   * Refund transaction date (ISO 8601)
   */
  refundTransactionDate: string
}

export type RefundResponseBody = GeneralResponseBody & {
  /**
   * Refund information
   */
  info: Info
}

export const defaultTimeout = 20000

export const refundWithClient: LinePayApiClients['refund'] =
  httpClient =>
  async ({ transactionId, body, timeout }) => {
    const { data } = await httpClient.post<
      RefundRequestBody,
      RefundResponseBody
    >(`/v3/payments/${transactionId}/refund`, body, {
      timeout: timeout ?? defaultTimeout
    })

    return data
  }
