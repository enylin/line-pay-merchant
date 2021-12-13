import {
  ConfirmRequestConfig,
  ConfirmResponseBody
} from '../line-pay-api/confirm'
import {
  PaymentDetailsResponseBody,
  paymentDetailsWithClient
} from '../line-pay-api/payment-details'
import { RefundRequestConfig, RefundResponseBody } from '../line-pay-api/refund'
import { createPaymentApi } from '../payment-api/create'
import { isLinePayApiError } from '../line-pay-api/error/line-pay-api'
import { ApiHandler, ApiResponse } from '../payment-api/type'
import { isTimeoutError } from '../line-pay-api/error/timeout'

/**
 * Response converter for confirm API. Convert the response body from payment details API to confirm API.
 *
 * @param req original request
 * @param paymentDetails response body from payment details API
 * @returns confirm API response body
 */
export function toConfirmResponse<
  Req extends ConfirmRequestConfig | RefundRequestConfig
>(req: Req, paymentDetails: PaymentDetailsResponseBody): ConfirmResponseBody {
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
export function toRefundResponse<
  Req extends ConfirmRequestConfig | RefundRequestConfig
>(req: Req, paymentDetails: PaymentDetailsResponseBody): RefundResponseBody {
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

export type PaymentDetailsConverter<
  Req extends ConfirmRequestConfig | RefundRequestConfig,
  Res extends ConfirmResponseBody | RefundResponseBody
> = (req: Req, paymentDetailsResponseBody: PaymentDetailsResponseBody) => Res

/**
 * Create a handler for confirm and refund API. The handler will handle the 1172 and 1198 error and timeout error by calling the payment details API and verify the transaction result.
 *
 * @param converter convert payment details to response body (confirm/refund)
 * @param predicate predicate to determine whether the error should be handled
 * @returns API handler
 */
export const createPaymentDetailsRecoveryHandler =
  <
    Req extends ConfirmRequestConfig | RefundRequestConfig,
    Res extends ConfirmResponseBody | RefundResponseBody
  >(
    converter: PaymentDetailsConverter<Req, Res>,
    predicate = defaultPredicate
  ): ApiHandler<Req, ApiResponse<Res>> =>
  async ({ req, next, httpClient }) => {
    try {
      return await next(req)
    } catch (e) {
      if (!predicate(e)) throw e

      const paymentDetails = createPaymentApi(
        'paymentDetails',
        paymentDetailsWithClient,
        httpClient
      )

      try {
        // Check with payment details API
        const paymentDetailsResponse = await paymentDetails.send({
          params: {
            transactionId: [req.transactionId]
          }
        })

        const comments: Record<string, unknown> = {}

        if (isLinePayApiError(e)) {
          comments.originalLinePayApiError = e
        }

        return {
          body: converter(req, paymentDetailsResponse.body),
          comments
        }
      } catch (paymentDetailsError) {
        throw e
      }
    }
  }
