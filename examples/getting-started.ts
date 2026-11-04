// #region client
import { createLinePayClient } from 'line-pay-merchant'

export const linePay = createLinePayClient({
  channelId: process.env.LINE_PAY_CHANNEL_ID ?? '',
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env: 'sandbox' // 'production' for real payments
})
// #endregion client

// #region request
export async function reservePayment() {
  const { body } = await linePay.request({
    amount: 1000,
    currency: 'TWD',
    // A new one for every try: LINE Pay refuses an order ID it has seen.
    orderId: `order-${crypto.randomUUID()}`,
    packages: [
      {
        id: 'package-1',
        amount: 1000,
        products: [{ name: 'Tea', quantity: 2, price: 500 }]
      }
    ],
    redirectUrls: {
      confirmUrl: 'https://shop.example/line-pay/confirm',
      cancelUrl: 'https://shop.example/line-pay/cancel'
    }
  })

  // Send the user to body.info.paymentUrl.web (or .app on a phone).
  // Keep body.info.transactionId: you need it to confirm.
  return body.info
}
// #endregion request

// #region confirm
export async function confirmPayment(transactionId: string) {
  const { body, meta } = await linePay.confirm({
    transactionId,
    amount: 1000, // the amount of your order, from your database
    currency: 'TWD'
  })

  console.log(body.info.orderId, meta.durationMs)
  return body.info
}
// #endregion confirm
