import { PaymentApi } from './payment-api/type'

export type LinePayClient = {
  /**
   * An API to request payment information to LINE Pay. User can change settings such as order information or various payment methods. Once the request is successful, a transaction ID is generated and with the ID, you can complete the payment or process refund.
   *
   * Example:
   * ```ts
   * const res = await linePayClient.request.send({
   *   body: {
   *     amount: 1000,
   *     currency: 'TWD',
   *     orderId: '20211209003',
   *     packages: [
   *       {
   *         id: 'c99abc79-3b29-4f40-8851-bc618ca57857',
   *         amount: 1000,
   *         products: [
   *           {
   *             name: 'Demo Product',
   *             quantity: 2,
   *             price: 500
   *           }
   *         ]
   *       }
   *     ],
   *     redirectUrls: {
   *       confirmUrl: 'https://example.com/confirmUrl',
   *       cancelUrl: 'https://example.com/cancelUrl'
   *     }
   *   }
   * })
   * ```
   */
  request: PaymentApi<'request'>
  /**
   * An API for the merchant to complete the payment when the user approves with the [ConfirmURL](https://pay.line.me/documents/online_v3_en.html?shell#confirmurl-spec) or [Check Payment Status API](https://pay.line.me/documents/online_v3_en.html?shell#check-payment-status-api). Status of a payment where authorization and purchase are separated because 'options.payment.capture' of the Request API is set as `false` will be in purchase standby (Authentication) even after it is completed. To complete the purchase, an additional purchase process is required through the [Capture API](https://pay.line.me/documents/online_v3_en.html?shell#capture-api).
   *
   * Example:
   * ```ts
   * const res = await linePayClient.confirm
   *   .send({
   *     transactionId: '2021121300698360310',
   *     body: {
   *       currency: 'TWD',
   *       amount: 1000
   *     }
   * })
   * ```
   */
  confirm: PaymentApi<'confirm'>
  /**
   * Transactions that have set options.payment.capture as `false` when requesting the Request API payment will be put on hold when the payment is completed with the Confirm API. In order to finalize the payment, an additional purchase with Capture API is required.
   *
   * Example:
   * ```ts
   * const res = await linePayClient.capture
   *   .send({
   *     transactionId: '2021121300698360310',
   *     body: {
   *       amount: 1000,
   *       currency: 'TWD'
   *     }
   * })
   * ```
   */
  capture: PaymentApi<'capture'>
  /**
   * An API to refund transactions that has been completed the payment (purchase). The transaction ID of LINE Pay user must be passed when refunded and partial refund is also possible.
   *
   * Example:
   * ```ts
   * const res = await linePayClient.refund
   *   .send({
   *     transactionId: '2021121300698360310',
   *     body: {
   *       refundAmount: 20
   *     }
   * })
   * ```
   */
  refund: PaymentApi<'refund'>
  /**
   * An API to check transaction history in LINE Pay. You can check histories of authorizations and payment completions. With fields setting, you can selectively check transaction information or order information as needed.
   *
   * Example:
   * ```ts
   * const res = await linePayClient.paymentDetails
   *   .send({
   *     params: {
   *       transactionId: ['2021113000697335210'],
   *       orderId: ['20211209003'],
   *     }
   * })
   * ```
   */
  paymentDetails: PaymentApi<'paymentDetails'>

  /**
   * An API to check payment request status of LINE Pay. The merchant should regularly check user payment confirm status **without using the ConfirmURL** and decide if it is possible to complete the payment.
   *
   * Example:
   * ```ts
   * const res = await linePayClient.checkPaymentStatus
   *   .send({
   *     params: {
   *       transactionId: '2021121900699011210'
   *     }
   * })
   * ```
   */
  checkPaymentStatus: PaymentApi<'checkPaymentStatus'>
}
