import { HttpClient } from '@/line-pay-api/type'
import { ApiResponse, ApiHandler, PaymentApi, LinePayApiClients } from './type'

type Awaited<T> = T extends PromiseLike<infer U> ? Awaited<U> : T

type RequestConfig<T extends keyof LinePayApiClients> = Parameters<
  ReturnType<LinePayApiClients[T]>
>[0]

type ResponseBody<T extends keyof LinePayApiClients> = Awaited<
  ReturnType<ReturnType<LinePayApiClients[T]>>
>

export function createPaymentApi<T extends keyof LinePayApiClients>(
  type: T,
  createSender: (
    httpClient: HttpClient
  ) => (req: RequestConfig<T>) => Promise<ResponseBody<T>>,
  httpClient: HttpClient,
  handlers: ApiHandler<RequestConfig<T>, ApiResponse<ResponseBody<T>>>[] = []
): PaymentApi<T> {
  const addHandlers = (
    ...fs: ApiHandler<RequestConfig<T>, ApiResponse<ResponseBody<T>>>[]
  ) => {
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
