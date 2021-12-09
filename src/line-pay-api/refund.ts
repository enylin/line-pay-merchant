import { HttpClient } from '.'

export type RefundRequestBody = {
  /**
   * Refund amount
   * - Full refund if not returned
   */
  refundAmount: number
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

export type RefundResponseBody = {
  /**
   * Return code
   */
  returnCode: string
  /**
   * Return message or reason for failure
   */
  returnMessage: string
  /**
   * Refund information
   */
  info: Info
}

export const refund =
  (httpClient: HttpClient) =>
  async (transactionId: string, body: RefundRequestBody) => {
    const { data } = await httpClient.post<
      RefundRequestBody,
      RefundResponseBody
    >(`/v3/payments/${transactionId}/refund`, body)

    return data
  }
