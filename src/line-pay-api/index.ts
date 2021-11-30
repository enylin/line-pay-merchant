import { createAuthHttpClient } from './auth-http-client'
import { confirm, ConfirmRequestBody, ConfirmResponseBody } from './confirm'
import { request, RequestRequestBody, RequestResponseBody } from './request'
import { LineMerchantConfig } from './type'

export type Response<R> = {
  data: R
  status: number
}
export interface HttpClient {
  get: <R>(url: string) => Promise<Response<R>>
  post: <T, R>(url: string, body: T) => Promise<Response<R>>
}

export interface ApiClient {
  /**
   * An API to request payment information to LINE Pay. User can change settings such as order information or various payment methods. Once the request is successful, a transaction ID is generated and with the ID, you can complete the payment or process refund.
   *
   * @param { RequestRequestBody } body Request body of request API
   * @returns { RequestResponseBody } response body of request API
   * @throws
   */
  request: (body: RequestRequestBody) => Promise<RequestResponseBody>
  /**
   * An API for the merchant to complete the payment when the user approves with the [ConfirmURL](https://pay.line.me/documents/online_v3_en.html?shell#confirmurl-spec) or [Check Payment Status API](https://pay.line.me/documents/online_v3_en.html?shell#check-payment-status-api). Status of a payment where authorization and purchase are separated because 'options.payment.capture' of the Request API is set as `false` will be in purchase standby (Authentication) even after it is completed. To complete the purchase, an additional purchase process is required through the [Capture API](https://pay.line.me/documents/online_v3_en.html?shell#capture-api).
   *
   * @param { string } transactionId ID of the transaction
   * @param { ConfirmRequestBody } body Request body of confirm API
   * @returns { ConfirmResponseBody } response body of confirm API
   * @throws
   */
  confirm: (
    transactionId: string,
    body: ConfirmRequestBody
  ) => Promise<ConfirmResponseBody>
}

export function createApiClient(
  merchantConfig: LineMerchantConfig,
  httpClient: HttpClient = createAuthHttpClient(merchantConfig)
): ApiClient {
  return {
    request: request(httpClient),
    confirm: confirm(httpClient)
  }
}
