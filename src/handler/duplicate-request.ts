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

/**
 * Create a handler for confirm and refund API. The handler will handle the 1172 and 1198 error by calling the payment details API and verify the transaction result.
 *
 * @param converter convert payment details to response body (confirm/refund)
 * @returns API handler
 */
export const createDuplicateRequestHandler =
  <
    Req extends ConfirmRequestConfig | RefundRequestConfig,
    Res extends ConfirmResponseBody | RefundResponseBody
  >(
    converter: (
      req: Req,
      paymentDetailsResponseBody: PaymentDetailsResponseBody
    ) => Res
  ): ApiHandler<Req, ApiResponse<Res>> =>
  async (req, next, httpClient) => {
    try {
      return await next(req)
    } catch (e) {
      // 1172: There is a record of transaction with the same order number.
      // 1198: API call request has been duplicated.
      if (
        isLinePayApiError(e) &&
        (e.data.returnCode === '1172' || e.data.returnCode === '1198')
      ) {
        const paymentDetails = createPaymentApi(
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

          return {
            body: converter(req, paymentDetailsResponse.body),
            comments: {}
          }
        } catch (paymentDetailsError) {
          throw e
        }
      }
      throw e
    }
  }
