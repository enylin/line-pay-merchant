import { createLinePayClient, type LinePayClient } from 'line-pay-merchant'

// #region options
// Say which one it is, and fail when it is neither: a typo must not make a
// production server talk to the sandbox, or a laptop to production.
const env = process.env.LINE_PAY_ENV
if (env !== 'sandbox' && env !== 'production') {
  throw new Error('Set LINE_PAY_ENV to "sandbox" or "production"')
}

export const linePay = createLinePayClient({
  channelId: process.env.LINE_PAY_CHANNEL_ID ?? '',
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env,

  // Time limit of one attempt, in milliseconds. The defaults are what LINE Pay
  // recommends (20 to 60 seconds, 40 for a confirm): a limit shorter than the
  // call needs only leaves you with more unknown outcomes. Shorten only a read
  // that nothing depends on, as here; the lookups of `reconcile` (paymentDetails)
  // need all the time LINE Pay says they take.
  timeouts: { checkPaymentStatus: 10_000 }
})
// #endregion options

// #region multi-tenant
export interface Merchant {
  id: string
  channelId: string
  channelSecretKey: string
  sandbox: boolean
}

const clients = new Map<
  string,
  { credentials: string; client: LinePayClient }
>()

/**
 * One client per merchant. A client is cheap, immutable and keeps no state.
 * It is made again when the merchant's credentials change, so that a secret that
 * was rotated after a leak takes effect at once, not at the next restart.
 */
export function linePayFor(merchant: Merchant): LinePayClient {
  const credentials = [
    merchant.channelId,
    merchant.channelSecretKey,
    merchant.sandbox
  ].join('\n')
  const cached = clients.get(merchant.id)
  if (cached?.credentials === credentials) return cached.client

  const client = createLinePayClient({
    channelId: merchant.channelId,
    channelSecretKey: merchant.channelSecretKey,
    env: merchant.sandbox ? 'sandbox' : 'production'
  })
  clients.set(merchant.id, { credentials, client })
  return client
}
// #endregion multi-tenant

// #region per-call
export async function statusWithin(transactionId: string, signal: AbortSignal) {
  // `timeout` limits this attempt; `signal` bounds the call as a whole,
  // retries included. Both are optional.
  return linePay.checkPaymentStatus(
    { transactionId },
    { timeout: 5_000, signal }
  )
}
// #endregion per-call
