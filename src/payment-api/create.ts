import { HttpClient } from '@/line-pay-api/type'
import { ApiResponse, ApiHandler, PaymentApi } from './type'

export function createPaymentApi<Req, Res>(
  createSender: (httpClient: HttpClient) => (req: Req) => Promise<Res>,
  httpClient: HttpClient,
  handlers: ApiHandler<Req, ApiResponse<Res>>[] = []
): PaymentApi<Req, ApiResponse<Res>> {
  const addHandlers = (...fs: ApiHandler<Req, ApiResponse<Res>>[]) => {
    handlers.push(...fs)
    return createPaymentApi(createSender, httpClient, handlers)
  }

  const sender = async (req: Req): Promise<ApiResponse<Res>> => ({
    body: await createSender(httpClient)(req),
    comments: {}
  })

  const getHandler = (i: number) => async (req: Req) =>
    i < 0 ? sender(req) : handlers[i](req, getHandler(i - 1), httpClient)

  const send = async (req: Req) => getHandler(handlers.length - 1)(req)

  return {
    addHandler: addHandlers,
    addHandlers,
    send
  }
}
