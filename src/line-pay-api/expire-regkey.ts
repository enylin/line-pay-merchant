import { LinePayApiClients } from '@/payment-api/type'
import { FormatError } from './error/format'
import { EmptyObject, GeneralRequestConfig, GeneralResponseBody } from './type'

export type ExpireRegKeyRequestBody = EmptyObject

export type ExpireRegKeyRequestConfig = GeneralRequestConfig & {
  /**
   * A key used for automatic payment
   */
  regKey: string
  /**
   * Request body of expireRegKey API
   */
  body?: ExpireRegKeyRequestBody
}

export type ExpireRegKeyResponseBody = GeneralResponseBody

export const defaultTimeout = 20000

export const expireRegKeyWithClient: LinePayApiClients['expireRegKey'] =
  httpClient =>
  async ({ regKey, body = {}, timeout }) => {
    if (!regKey) throw new FormatError('"regKey" is required')

    const { data } = await httpClient.post<
      ExpireRegKeyRequestBody,
      ExpireRegKeyResponseBody
    >(`/v3/payments/preapprovedPay/${regKey}/expire`, body, {
      timeout: timeout ?? defaultTimeout
    })

    return data
  }
