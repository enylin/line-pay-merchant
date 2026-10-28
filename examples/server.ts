import { createLinePayClient } from 'line-pay-merchant'

import { createApp } from './express'
import { createPaymentService } from './payment-service'
import { createMemoryOrderStore } from './shared/orders'

// #region wiring
// An unset variable is the empty string, which createLinePayClient refuses by name.
const channelId = process.env.LINE_PAY_CHANNEL_ID ?? ''
const linePay = createLinePayClient({
  channelId,
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env: 'sandbox'
})

const payments = createPaymentService({
  linePay,
  orders: createMemoryOrderStore(), // your database
  siteUrl: 'https://shop.example',
  channelId
})

createApp(payments).listen(3000)

// Settle the confirms that never got an answer. One run at a time: a run that is
// slow (LINE Pay is) must not be joined by the next one.
let sweeping = false
setInterval(() => {
  if (sweeping) return
  sweeping = true
  payments
    .settlePending({ olderThanMs: 5 * 60_000, giveUpAfterMs: 60 * 60_000 })
    .catch((error: unknown) => console.error('settlePending failed', error))
    .finally(() => {
      sweeping = false
    })
}, 60_000)
// #endregion wiring
