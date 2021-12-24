import { LinePayApiClients } from '@/payment-api/type'
import { FormatError } from './error/format'
import { GeneralRequestConfig, GeneralResponseBody } from './type'

export type CheckRegKeyRequestParams = {
  /**
   * Whether credit cards issued with RegKey have authorized minimum amount
   * - True : Through LINE Pay verification and authentication of minimum amount of credit card, check the status of RegKey. It requires review from the LINE Pay manager.
   * - False : Check the RegKey status with LINE Pay verification.
   */
  creditCardAuth?: boolean
}

export type CheckRegKeyRequestConfig = GeneralRequestConfig & {
  /**
   * A key used for automatic payment
   */
  regKey: string
  /**
   * Request parameters of check regKey API
   */
  params?: CheckRegKeyRequestParams
}

export type CheckRegKeyResponseBody = GeneralResponseBody

export const defaultTimeout = 20000

export const checkRegKeyWithClient: LinePayApiClients['checkRegKey'] =
  httpClient =>
  async ({ params, regKey, timeout }) => {
    if (!regKey) throw new FormatError('"regKey" is required')

    const { data } = await httpClient.get<
      CheckRegKeyRequestParams,
      CheckRegKeyResponseBody
    >(`/v3/payments/preapprovedPay/${regKey}/check`, {
      params,
      timeout: timeout ?? defaultTimeout
    })

    return data
  }
