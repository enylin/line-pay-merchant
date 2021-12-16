import {
  CaptureRequestConfig,
  CaptureResponseBody
} from '@/line-pay-api/capture'
import {
  ConfirmRequestConfig,
  ConfirmResponseBody
} from '@/line-pay-api/confirm'
import {
  PaymentDetailsRequestConfig,
  PaymentDetailsResponseBody
} from '@/line-pay-api/payment-details'
import { RefundRequestConfig, RefundResponseBody } from '@/line-pay-api/refund'
import {
  RequestRequestConfig,
  RequestResponseBody
} from '@/line-pay-api/request'
import {
  ApiClientBuilder,
  GeneralResponseBody,
  HttpClient
} from '@/line-pay-api/type'

/**
 * All LINE Pay API Clients supported by this library.
 */
export type LinePayApiClients = {
  request: ApiClientBuilder<RequestRequestConfig, RequestResponseBody>
  confirm: ApiClientBuilder<ConfirmRequestConfig, ConfirmResponseBody>
  capture: ApiClientBuilder<CaptureRequestConfig, CaptureResponseBody>
  refund: ApiClientBuilder<RefundRequestConfig, RefundResponseBody>
  paymentDetails: ApiClientBuilder<
    PaymentDetailsRequestConfig,
    PaymentDetailsResponseBody
  >
}

type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T

/**
 * Request config of LinePayApiClients
 */
export type RequestConfig<T extends keyof LinePayApiClients> = Parameters<
  ReturnType<LinePayApiClients[T]>
>[0]

/**
 * Response body of LinePayApiClients
 */
export type ResponseBody<T extends keyof LinePayApiClients> = Awaited<
  ReturnType<ReturnType<LinePayApiClients[T]>>
>

export type ApiHandlerParams<T extends keyof LinePayApiClients> = {
  /**
   * LINE Pay API type
   */
  type: keyof LinePayApiClients
  /**
   * The request object
   */
  req: RequestConfig<T>
  /**
   * The next handler or the request sending function
   *
   * @template T the type of the LINE Pay API
   * @param req request object
   * @throws {HttpError} if the request failed
   * @throws {TimeoutError} if the request timed out
   * @throws {LinePayApiError} if the response return code is not '0000'
   */
  next: (req: RequestConfig<T>) => Promise<ApiResponse<ResponseBody<T>>>
  /**
   * The HTTP client
   */
  httpClient: HttpClient
}

export type ApiHandler<T extends keyof LinePayApiClients> = (
  params: ApiHandlerParams<T>
) => Promise<ApiResponse<ResponseBody<T>>>

/**
 * @template Body response body type
 */
export type ApiResponse<Body extends GeneralResponseBody> = {
  /**
   * Response body
   */
  body: Body
  /**
   * Additional comments may be added by handlers
   */
  comments: Record<string, unknown>
}

export interface PaymentApi<T extends keyof LinePayApiClients> {
  /**
   * Add request/response handler to the API
   *
   * @param handler API handler
   */
  addHandler(handler: ApiHandler<T>): PaymentApi<T>
  /**
   * Add request/response handlers to the API
   *
   * @param handlers API handlers
   */
  addHandlers(...handlers: ApiHandler<T>[]): PaymentApi<T>
  /**
   * Send request to the API
   *
   * @param request request config
   * @returns the API response
   * @throws {HttpError} if the request failed
   * @throws {TimeoutError} if the request timed out
   * @throws {LinePayApiError} if the response return code is not '0000'
   */
  send(request: RequestConfig<T>): Promise<ApiResponse<ResponseBody<T>>>
}
