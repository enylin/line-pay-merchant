import { LinePayApiClients } from '@/payment-api/type'
import { FormatError } from './error/format'
import { EmptyObject, GeneralRequestConfig, GeneralResponseBody } from './type'

export type VoidRequestBody = EmptyObject

export type VoidRequestConfig = GeneralRequestConfig & {
  /**
   * ID of the transaction
   */
  transactionId: string
  /**
   * Request body of void API
   */
  body?: VoidRequestBody
}

export type VoidResponseBody = GeneralResponseBody

export const defaultTimeout = 20000

export const voidWithClient: LinePayApiClients['void'] =
  httpClient =>
  async ({ transactionId, body = {}, timeout }) => {
    if (!transactionId) throw new FormatError('"transactionId" is required')

    const { data } = await httpClient.post<VoidRequestBody, VoidResponseBody>(
      `/v3/payments/authorizations/${transactionId}/void`,
      body,
      {
        timeout: timeout ?? defaultTimeout
      }
    )

    return data
  }
