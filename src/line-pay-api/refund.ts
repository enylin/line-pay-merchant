import { LinePayApiClients } from '@/payment-api/type'
import { FormatError } from './error/format'
import { GeneralRequestConfig, GeneralResponseBody } from './type'

/** Request */
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

/** Response */
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
    if (!transactionId) throw new FormatError('"transactionId" is required')

    if (!body) throw new FormatError('"body" is required')

    const { data } = await httpClient.post<
      RefundRequestBody,
      RefundResponseBody
    >(`/v3/payments/${transactionId}/refund`, body, {
      timeout: timeout ?? defaultTimeout
    })

    return data
  }
