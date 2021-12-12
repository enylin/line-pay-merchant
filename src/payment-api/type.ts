import { GeneralResponseBody, HttpClient } from '@/line-pay-api/type'

export type ApiHandler<Req, Res> = (
  req: Req,
  next: (req: Req) => Promise<Res>,
  httpClient: HttpClient
) => Promise<Res>

export type ApiResponse<Body extends GeneralResponseBody> = {
  body: Body
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
   * @param Request request config
   */
  send(Request: Req): Promise<Res>
}
