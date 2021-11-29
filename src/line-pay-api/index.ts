import { createAuthHttpClient } from './auth-http-client'
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
   * @param { HttpClient } httpClient HTTP client
   * @returns { RequestResponseBody } response body of request API
   * @throws
   */
  request: (body: RequestRequestBody) => Promise<RequestResponseBody>
}

export function createApiClient(
  merchantConfig: LineMerchantConfig,
  httpClient: HttpClient = createAuthHttpClient(merchantConfig)
): ApiClient {
  return {
    request: request(httpClient)
  }
}
