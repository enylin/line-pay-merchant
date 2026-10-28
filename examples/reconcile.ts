import {
  autoReconcile,
  createLinePayClient,
  needsReconcile,
  type ReconcileContext
} from 'line-pay-merchant'

// An unset variable is the empty string, which createLinePayClient refuses by name.
const channelId = process.env.LINE_PAY_CHANNEL_ID ?? ''

const linePay = createLinePayClient({
  channelId,
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env: 'sandbox'
})

// #region basic
export async function confirmOrder(transactionId: string, amount: number) {
  try {
    const { body } = await linePay.confirm({
      transactionId,
      amount,
      currency: 'TWD'
    })
    return { paid: true, orderId: body.info.orderId }
  } catch (error) {
    // Anything but a timeout or a cut connection is an ordinary failure.
    if (!needsReconcile(error)) throw error

    // The payment may have gone through. Ask the payment details.
    const result = await linePay.reconcile(error)

    if (result.status === 'applied' && result.operation === 'confirm') {
      // Not received from LINE Pay but inferred from the payment details. Check
      // result.body.info.orderId against the order you sent to `request`.
      return { paid: true, orderId: result.body.info.orderId }
    }
    // `not-applied` and `indeterminate` alike: one look does not settle it. A
    // payment that LINE Pay is still processing is not in the details yet, and
    // "not there now" is not "never". Keep the order as it is, tell the user it
    // is being checked, and look again a few minutes later (see the background
    // job): only a second look that still finds nothing lets the user try again.
    return { paid: false, checking: true, status: result.status }
  }
}
// #endregion basic

// #region auto
export const autoLinePay = createLinePayClient({
  channelId,
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env: 'sandbox'
}).with(autoReconcile())

export async function confirmWithAutoReconcile(
  transactionId: string,
  amount: number
) {
  const { body, meta } = await autoLinePay.confirm({
    transactionId,
    amount,
    currency: 'TWD'
  })

  // A recovered result was inferred, not received. Keep that in your logs.
  if (meta.recovered) {
    console.warn('confirm was recovered', meta.recovered.reason, {
      notes: meta.recovered.notes
    })
  }
  return body.info
}
// #endregion auto

// #region context
export async function confirmWithRecord(
  transactionId: string,
  amount: number,
  save: (context: ReconcileContext) => Promise<void>
) {
  // Write down what is about to happen *before* it happens. If the process dies
  // before LINE Pay answers, this is all that is left.
  const context: ReconcileContext = {
    operation: 'confirm',
    startedAt: new Date(),
    // The channel of the client: a worker with other credentials would find
    // nothing, and without it reconcile does not take "not found" for "it did
    // not happen".
    channelId,
    transactionId,
    amount,
    currency: 'TWD'
  }
  await save(context)

  return linePay.confirm({ transactionId, amount, currency: 'TWD' })
}

/** Later, from another process: the saved context stands in for the error. */
export function settleLater(context: ReconcileContext) {
  return linePay.reconcile(context)
}
// #endregion context

// #region refund-record
export async function refundWithRecord(
  transactionId: string,
  refundAmount: number,
  save: (context: ReconcileContext) => Promise<void>
) {
  // A refund is not idempotent, so the record matters even more here: it is the
  // only way to find out later whether the refund happened.
  await save({
    operation: 'refund',
    startedAt: new Date(),
    channelId,
    transactionId,
    refundAmount
  })

  return linePay.refund({ transactionId, refundAmount })
}
// #endregion refund-record
