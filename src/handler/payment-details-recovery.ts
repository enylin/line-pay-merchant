import { ConfirmResponseBody } from '../line-pay-api/confirm'
import {
  PaymentDetailsResponseBody,
  paymentDetailsWithClient
} from '../line-pay-api/payment-details'
import { RefundResponseBody } from '../line-pay-api/refund'
import { createPaymentApi } from '../payment-api/create'
import { isLinePayApiError } from '../line-pay-api/error/line-pay-api'
import {
  ApiHandler,
  ApiResponse,
  RequestConfig,
  ResponseBody
} from '../payment-api/type'
import { isTimeoutError } from '../line-pay-api/error/timeout'
import { HttpClient } from '@/line-pay-api/type'

/**
 * Convert confirm response or refund response body to payment details response body
 */
export type PaymentDetailsConverter<T extends 'confirm' | 'refund'> = (
  req: RequestConfig<T>,
  paymentDetailsResponseBody: PaymentDetailsResponseBody
) => ResponseBody<T>

/**
 * Response converter for confirm API. Convert the response body from payment details API to confirm API.
 *
 * @param req original request
 * @param paymentDetails response body from payment details API
 * @returns confirm API response body
 */
export function paymentDetailsToConfirm<T extends 'confirm'>(
  req: RequestConfig<T>,
  paymentDetails: PaymentDetailsResponseBody
): ConfirmResponseBody {
  const { transactionId } = req
  const info = paymentDetails.info.find(i => i.transactionId === transactionId)

  if (!info) throw new Error('Transaction ID not found in payment details')

  return {
    returnCode: paymentDetails.returnCode,
    returnMessage: paymentDetails.returnMessage,
    info
  }
}

/**
 * Response converter for refund API. Convert the response body from payment details API to refund API.
 *
 * @param req original request
 * @param paymentDetails response body from payment details API
 * @returns refund API response body
 */
export function paymentDetailsToRefund<T extends 'refund'>(
  req: RequestConfig<T>,
  paymentDetails: PaymentDetailsResponseBody
): RefundResponseBody {
  const { transactionId } = req
  const info = paymentDetails.info.find(i => i.transactionId === transactionId)

  if (!info) throw new Error('Transaction ID not found in payment details')

  return {
    returnCode: paymentDetails.returnCode,
    returnMessage: paymentDetails.returnMessage,
    info: {
      refundTransactionId: transactionId,
      refundTransactionDate: info.transactionDate
    }
  }
}

// 1172: There is a record of transaction with the same order number.
// 1198: API call request has been duplicated.
const defaultPredicate = (error: unknown) =>
  isTimeoutError(error) ||
  (isLinePayApiError(error) &&
    (error.data.returnCode === '1172' || error.data.returnCode === '1198'))

async function fix<T extends 'confirm' | 'refund'>(
  converter: PaymentDetailsConverter<T>,
  req: RequestConfig<T>,
  httpClient: HttpClient,
  error: unknown
): Promise<ApiResponse<ResponseBody<T>>> {
  try {
    const paymentDetails = createPaymentApi(
      'paymentDetails',
      paymentDetailsWithClient,
      httpClient
    )

    // Check with payment details API
    const paymentDetailsResponse = await paymentDetails.send({
      params: {
        transactionId: [req.transactionId]
      }
    })

    const comments: Record<string, unknown> = {}

    if (isLinePayApiError(error)) {
      comments.originalLinePayApiError = error
    }

    return {
      body: converter(req, paymentDetailsResponse.body),
      comments
    }
  } catch (paymentDetailsError) {
    // Failed to fix. Throw the original exception.
    throw error
  }
}

/**
 * Create a handler for confirm and refund API. The handler will handle the 1172 and 1198 error and timeout error by calling the payment details API and verify the transaction result.
 *
 * @param converter convert payment details to response body (confirm/refund)
 * @param predicate predicate to determine whether the error should be handled
 * @returns API handler
 */
export const createPaymentDetailsRecoveryHandler =
  <T extends 'confirm' | 'refund'>(
    converter: PaymentDetailsConverter<T>,
    predicate = defaultPredicate
  ): ApiHandler<T> =>
  async ({ req, next, httpClient }) => {
    try {
      return await next(req)
    } catch (e) {
      if (!predicate(e)) throw e

      return fix(converter, req, httpClient, e)
    }
  }
