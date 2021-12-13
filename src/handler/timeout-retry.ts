import { GeneralResponseBody } from '../line-pay-api/type'
import { isTimeoutError } from '../line-pay-api/error/timeout'
import { ApiHandler, ApiResponse } from '../payment-api/type'

/**
 * Create a handler that retries the request if it fails with a timeout error.
 *
 * @param maxRetry maximum number of retries
 * @param timeout milliseconds to wait before retrying
 * @returns a handler that retries the request if it fails with a timeout error
 */
export const createTimeoutRetryHandler =
  <Req, Res extends GeneralResponseBody>(
    maxRetry = 10,
    timeout = 5000
  ): ApiHandler<Req, ApiResponse<Res>> =>
  async ({ req, next }) =>
    new Promise((resolve, reject) => {
      const f = async (count: number, originalError: unknown) => {
        try {
          const res = await next(req)

          if (
            originalError !== null &&
            res.comments.originalLinePayApiError !== undefined
          ) {
            res.comments.originalLinePayApiError = originalError
          }

          resolve(res)
        } catch (e) {
          if (isTimeoutError(e)) {
            if (count < maxRetry) setTimeout(() => f(count + 1, e), timeout)
            else reject(originalError)
          }
          reject(e)
        }
      }

      f(0, null)
    })
