import { GeneralResponseBody } from '@/line-pay-api/type'
import { isTimeoutError } from '../line-pay-api/error/timeout'
import { ApiHandler, ApiResponse } from '../payment-api/type'

export const createTimeoutRetryHandler =
  <Req, Res extends GeneralResponseBody>(
    maxRetry = 10,
    timeout = 5000
  ): ApiHandler<Req, ApiResponse<Res>> =>
  async (req, next) =>
    new Promise((resolve, reject) => {
      const f = async (count: number, originalError: unknown) => {
        try {
          resolve(await next(req))
        } catch (e) {
          if (isTimeoutError(e)) {
            if (count < maxRetry) setTimeout(() => f(count + 1, e), timeout)
            else reject(originalError)
          }
          reject(e)
        }
      }
      f(0, new Error())
    })
