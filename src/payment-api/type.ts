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

export type LinePayApiClients = {
  request: ApiClientBuilder<RequestRequestConfig, RequestResponseBody>
  confirm: ApiClientBuilder<ConfirmRequestConfig, ConfirmResponseBody>
  refund: ApiClientBuilder<RefundRequestConfig, RefundResponseBody>
  paymentDetails: ApiClientBuilder<
    PaymentDetailsRequestConfig,
    PaymentDetailsResponseBody
  >
}

export type ApiHandlerParams<Req, Res> = {
  /**
   * LINE Pay API type
   */
  type: keyof LinePayApiClients
  /**
   * The request object
   */
  req: Req
  /**
   * The next handler or the request sending function
   */
  next: (req: Req) => Promise<Res>
  /**
   * The HTTP client
   */
  httpClient: HttpClient
}

export type ApiHandler<Req, Res> = (
  params: ApiHandlerParams<Req, Res>
) => Promise<Res>

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

export interface PaymentApi<Req, Res> {
  /**
   * Add request/response handler to the API
   *
   * @param handler API handler
   */
  addHandler(handler: ApiHandler<Req, Res>): PaymentApi<Req, Res>
  /**
   * Add request/response handlers to the API
   *
   * @param handlers API handlers
   */
  addHandlers(...handlers: ApiHandler<Req, Res>[]): PaymentApi<Req, Res>
  /**
   * Send request to the API
   *
   * @param request request config
   */
  send(request: Req): Promise<Res>
}
