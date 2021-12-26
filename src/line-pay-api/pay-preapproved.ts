import { LinePayApiClients } from '@/payment-api/type'
import { FormatError } from './error/format'
import { GeneralRequestConfig, GeneralResponseBody } from './type'

export type PayPreapprovedRequestBody = {
  /**
   * Product name
   */
  productName: string
  /**
   * Product amount
   */
  amount: number
  /**
   * Payment currency ([ISO 4217](https://en.wikipedia.org/wiki/ISO_4217))\
   * Supported currencies are as follows.
   * - USD
   * - JPY
   * - TWD
   * - THB
   */
  currency: string
  /**
   * An unique order ID
   */
  orderId: string
  /**
   * Purchasement
   * - True : Authorized and purchased
   * - False : Authorized but need to purchase with Capture API
   */
  capture?: boolean
}

export type PayPreapprovedRequestConfig = GeneralRequestConfig & {
  /**
   * A key used for automatic payment
   */
  regKey: string
  /**
   * Request body of payPreapproved API
   */
  body: PayPreapprovedRequestBody
}

export type Info = {
  /**
   * An unique order ID sent upon requesting for payment.
   */
  orderId: string
  /**
   * A transaction ID returned as the payment reservation result (19 digits).
   */
  transactionId: string
  /**
   * Transaction date ([ISO 8601](https://en.wikipedia.org/wiki/ISO_8601))
   */
  transactionDate: string
  /**
   * Expiration date ([ISO 8601](https://en.wikipedia.org/wiki/ISO_8601))
   */
  authorizationExpireDate?: string
}

export type PayPreapprovedResponseBody = GeneralResponseBody & {
  /**
   * PayPreapproved information
   */
  info: Info
}

export const defaultTimeout = 40000

export const payPreapprovedWithClient: LinePayApiClients['payPreapproved'] =
  httpClient =>
  async ({ regKey, body, timeout }) => {
    if (!regKey) throw new FormatError('"regKey" is required')

    if (!body) throw new FormatError('"body" is required')

    const { data } = await httpClient.post<
      PayPreapprovedRequestBody,
      PayPreapprovedResponseBody
    >(`/v3/payments/preapprovedPay/${regKey}/payment`, body, {
      timeout: timeout ?? defaultTimeout
    })

    return data
  }
