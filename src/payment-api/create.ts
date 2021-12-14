import { HttpClient } from '@/line-pay-api/type'
import {
  ApiResponse,
  ApiHandler,
  PaymentApi,
  LinePayApiClients,
  RequestConfig,
  ResponseBody
} from './type'

export function createPaymentApi<T extends keyof LinePayApiClients>(
  type: T,
  createSender: (
    httpClient: HttpClient
  ) => (req: RequestConfig<T>) => Promise<ResponseBody<T>>,
  httpClient: HttpClient,
  handlers: ApiHandler<T>[] = []
): PaymentApi<T> {
  const addHandlers = (...fs: ApiHandler<T>[]) => {
    handlers.push(...fs)
    return createPaymentApi(type, createSender, httpClient, handlers)
  }

  const sender = async (
    req: RequestConfig<T>
  ): Promise<ApiResponse<ResponseBody<T>>> => ({
    body: await createSender(httpClient)(req),
    comments: {}
  })

  const getHandler = (i: number) => async (req: RequestConfig<T>) =>
    i < 0
      ? sender(req)
      : handlers[i]({
          type,
          req,
          next: getHandler(i - 1),
          httpClient
        })

  const send = async (req: RequestConfig<T>) =>
    getHandler(handlers.length - 1)(req)

  return {
    addHandler: addHandlers,
    addHandlers,
    send
  }
}
