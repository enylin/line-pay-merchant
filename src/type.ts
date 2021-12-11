import {
  ConfirmRequestConfig,
  ConfirmResponseBody
} from './line-pay-api/confirm'
import {
  PaymentDetailsRequestConfig,
  PaymentDetailsResponseBody
} from './line-pay-api/payment-details'
import { RefundRequestConfig, RefundResponseBody } from './line-pay-api/refund'
import {
  RequestRequestConfig,
  RequestResponseBody
} from './line-pay-api/request'
import { ApiResponse, PaymentApi } from './payment-api/type'

export type LinePayClient = {
  /**
   * An API to request payment information to LINE Pay. User can change settings such as order information or various payment methods. Once the request is successful, a transaction ID is generated and with the ID, you can complete the payment or process refund.
   */
  request: PaymentApi<RequestRequestConfig, ApiResponse<RequestResponseBody>>
  /**
   * An API for the merchant to complete the payment when the user approves with the [ConfirmURL](https://pay.line.me/documents/online_v3_en.html?shell#confirmurl-spec) or [Check Payment Status API](https://pay.line.me/documents/online_v3_en.html?shell#check-payment-status-api). Status of a payment where authorization and purchase are separated because 'options.payment.capture' of the Request API is set as `false` will be in purchase standby (Authentication) even after it is completed. To complete the purchase, an additional purchase process is required through the [Capture API](https://pay.line.me/documents/online_v3_en.html?shell#capture-api).
   */
  confirm: PaymentApi<ConfirmRequestConfig, ApiResponse<ConfirmResponseBody>>
  /**
   * An API to refund transactions that has been completed the payment (purchase). The transaction ID of LINE Pay user must be passed when refunded and partial refund is also possible.
   */
  refund: PaymentApi<RefundRequestConfig, ApiResponse<RefundResponseBody>>

  paymentDetails: PaymentApi<
    PaymentDetailsRequestConfig,
    ApiResponse<PaymentDetailsResponseBody>
  >
}
