// A complete payment flow on top of line-pay-merchant, independent of any web
// framework. The documentation pulls its code from the regions of this file, and
// CI type-checks and runs it, so what the docs show always compiles.
import {
  type ConfirmQuerySource,
  isLinePayApiError,
  isLinePayError,
  type LinePayClient,
  needsReconcile,
  parseConfirmQuery,
  type ReconcileContext
} from 'line-pay-merchant'

import type { Expect, Order, OrderStore } from './shared/orders'

export interface PaymentServiceOptions {
  linePay: LinePayClient
  orders: OrderStore
  /** Where your site lives, for the confirm and cancel URLs. */
  siteUrl: string
  /**
   * The channel ID of `linePay`. It goes on the context that is written down
   * before a confirm. Without it a lookup cannot conclude that a payment was
   * not made (a worker with the credentials of another channel finds nothing
   * either), and a worker of another channel would not be turned away.
   */
  channelId: string
  /**
   * Fulfilment (ship, send the mail, add the points). It runs once for an order,
   * in the process that made it `paid`: not for the user who reloads the page,
   * not for the request that lost the claim, not for a second sweeper. If the
   * process dies between the update and this call the order is paid and the
   * hook did not run; to cover that, write the work to do in the same
   * transaction as the update (an outbox) instead of doing it here. If it
   * throws, so does `confirmPayment`, with the order paid and the hook not run
   * again for it.
   */
  onPaid?: (order: Order) => Promise<void>
}

export type ConfirmResult =
  /** The order is paid. Also the answer when the user reloads the page. */
  | { kind: 'paid'; order: Order }
  /** Nobody knows yet. Say so; `settlePending` settles it. */
  | { kind: 'in-progress'; order: Order }
  /** LINE Pay refused it. The user may try again. */
  | { kind: 'declined'; order: Order; returnCode: string }
  /** It did not happen: the request never left. The user may try again. */
  | { kind: 'retry'; order: Order }
  | { kind: 'unknown-order' }

export interface SettleOptions {
  /**
   * Look at orders that have been "confirming" for this long. Longer than a
   * confirm and the lookups after it can take: with the default time limits that
   * is about four minutes in the worst case, so five is a good start.
   */
  olderThanMs: number
  /** Hand an order that is still unclear after this long to a person. */
  giveUpAfterMs: number
}

export function createPaymentService({
  linePay,
  orders,
  siteUrl,
  channelId,
  onPaid
}: PaymentServiceOptions) {
  // #region start
  /** Reserve the payment at LINE Pay. Send the user to the URL it returns. */
  async function startCheckout(orderId: string): Promise<string> {
    const order = await orders.find(orderId)
    // "awaiting-approval" too: the user who cancelled at LINE Pay, or closed the
    // page, comes back and pays again. The reservation they leave behind is not
    // the order's any more, so it is never confirmed, and it expires.
    if (order?.status !== 'created' && order?.status !== 'awaiting-approval') {
      throw new Error(`Order ${orderId} cannot be paid`)
    }

    // A new one for every try. If this request ends without an answer, LINE Pay
    // may have kept the order ID, and asking again with the same one would be
    // refused as a duplicate (1172), however often it is repeated.
    const linePayOrderId = `${order.id}-${crypto.randomUUID().slice(0, 8)}`
    const { body } = await linePay.request({
      amount: order.total,
      currency: 'TWD',
      orderId: linePayOrderId,
      packages: [
        {
          id: order.id,
          amount: order.total,
          products: order.items.map(({ name, quantity, price }) => ({
            name,
            quantity,
            price
          }))
        }
      ],
      redirectUrls: {
        confirmUrl: `${siteUrl}/line-pay/confirm`,
        cancelUrl: `${siteUrl}/line-pay/cancel`
      }
    })

    // The transaction ID is the key for confirm, refund and reconcile, and it
    // is what LINE Pay puts on the confirmUrl.
    const reserved = await orders.transition(
      order.id,
      {
        status: ['created', 'awaiting-approval'],
        // The reservation this request saw. Of two that are made at once, only
        // the first finds the order as it read it.
        transactionId: order.transactionId ?? null
      },
      'awaiting-approval',
      { transactionId: body.info.transactionId, linePayOrderId }
    )
    // Two clicks at once: the other request was first, and its transaction is
    // the one that counts. This one is never confirmed, and expires.
    if (reserved === undefined) {
      throw new Error(`Order ${orderId} is already being paid`)
    }
    return body.info.paymentUrl.web
  }
  // #endregion start

  // #region failure
  /** The order as its holder knows it: still `confirming`, and still its claim. */
  const held = (order: Order): Expect =>
    order.claimId === undefined
      ? { status: 'confirming' }
      : { status: 'confirming', claimId: order.claimId }

  /**
   * What LINE Pay shows is the fact, and the order follows it wherever it is
   * now: a sweeper may have given it back (confirming → awaiting-approval) while
   * we were still looking.
   */
  async function markPaid(
    order: Order,
    paidOrderId: string
  ): Promise<ConfirmResult> {
    // The payment is for the order ID this order was reserved with. A payment
    // that carries another one is not this order's, whatever its transaction ID
    // says: money moved and it is not clear for what, so a person looks.
    if (
      order.linePayOrderId !== undefined &&
      paidOrderId !== order.linePayOrderId
    ) {
      const flagged = await orders.transition(
        order.id,
        { status: ['confirming', 'awaiting-approval'] },
        'needs-attention'
      )
      return {
        kind: 'in-progress',
        order: flagged ?? (await orders.find(order.id)) ?? order
      }
    }

    const paid = await orders.transition(
      order.id,
      { status: ['confirming', 'awaiting-approval', 'needs-attention'] },
      'paid'
    )
    // Only the process that made the order paid fulfils it.
    if (paid !== undefined) await onPaid?.(paid)
    // Someone else may have been first, which is fine if it ends up paid.
    const current = paid ?? (await orders.find(order.id)) ?? order
    return current.status === 'paid'
      ? { kind: 'paid', order: current }
      : { kind: 'in-progress', order: current }
  }

  async function afterFailedConfirm(
    order: Order,
    error: unknown
  ): Promise<ConfirmResult> {
    // Not an error of this library, so a bug of ours. Leave the order
    // "confirming": settlePending looks at it later.
    if (!isLinePayError(error)) throw error

    if (needsReconcile(error)) {
      // A timeout, a cut connection, an internal error of LINE Pay, or
      // "duplicate": the payment may well have gone through.
      const result = await linePay.reconcile(error)
      if (result.status === 'applied' && result.operation === 'confirm') {
        return markPaid(order, result.body.info.orderId)
      }
      // Not even "not-applied" lets the user try at once. One look at the
      // payment details right after a timeout proves little: they can be late.
      // settlePending looks again, minutes later, and gives the order back if
      // there is still nothing.
      return { kind: 'in-progress', order }
    }

    // Sent, and no answer, but nothing to look the call up with: settlePending
    // has the context that was written down before the call.
    if (error.outcome === 'unknown') return { kind: 'in-progress', order }

    // Never sent, or refused by LINE Pay: it did not happen. Give the order back,
    // but only if it is still ours: a request that was slow must not release the
    // claim of a newer one.
    const released =
      (await orders.transition(order.id, held(order), 'awaiting-approval')) ??
      order
    if (isLinePayApiError(error)) {
      return { kind: 'declined', order: released, returnCode: error.returnCode }
    }
    return { kind: 'retry', order: released }
  }
  // #endregion failure

  // #region confirm
  /** Call it with the query of the confirmUrl, when the user comes back. */
  async function confirmPayment(
    source: ConfirmQuerySource
  ): Promise<ConfirmResult> {
    // The query comes from the user's browser. This refuses everything that is
    // not a single string of 1 to 19 digits.
    const { transactionId } = parseConfirmQuery(source)

    const order = await orders.findByTransactionId(transactionId)
    if (order === undefined) return { kind: 'unknown-order' }
    if (order.status === 'paid') return { kind: 'paid', order }
    if (order.status !== 'awaiting-approval') {
      return { kind: 'in-progress', order }
    }

    // Write down what is about to happen *before* it happens, and let only one
    // request through. If this process dies before LINE Pay answers, there is
    // no error to look at: settlePending reconciles from this record instead.
    const pendingConfirm: ReconcileContext = {
      operation: 'confirm',
      startedAt: new Date(),
      channelId,
      transactionId,
      amount: order.total,
      currency: 'TWD'
    }
    const claimed = await orders.transition(
      order.id,
      { status: 'awaiting-approval' },
      'confirming',
      { pendingConfirm, claimId: crypto.randomUUID() }
    )
    if (claimed === undefined) return { kind: 'in-progress', order }

    let paidOrderId: string
    try {
      // The amount is the one of our order, never one that came with the URL.
      const { body } = await linePay.confirm({
        transactionId,
        amount: claimed.total,
        currency: 'TWD'
      })
      paidOrderId = body.info.orderId
    } catch (error) {
      return afterFailedConfirm(claimed, error)
    }
    return markPaid(claimed, paidOrderId)
  }
  // #endregion confirm

  // #region sweep
  async function settleOne(order: Order, options: SettleOptions) {
    // Nothing was written down, so there is nothing to look up.
    if (order.pendingConfirm === undefined) {
      await orders.transition(order.id, held(order), 'needs-attention')
      return
    }

    const result = await linePay.reconcile(order.pendingConfirm)

    if (result.status === 'applied') {
      if (result.operation === 'confirm') {
        await markPaid(order, result.body.info.orderId)
      }
    } else if (result.status === 'not-applied') {
      // The second look, minutes after the first, still shows nothing. If the
      // user comes back to the confirmUrl and LINE Pay did process the first
      // confirm after all, the second one is refused as a duplicate, and
      // reconcile finds the payment. A claim that has changed hands since this
      // order was read is not touched.
      await orders.transition(order.id, held(order), 'awaiting-approval')
    } else if (order.updatedAt.getTime() < Date.now() - options.giveUpAfterMs) {
      await orders.transition(order.id, held(order), 'needs-attention')
    }
  }

  /**
   * Settle the orders whose confirm never got an answer. Run it every minute or
   * so: from cron, a queue, or `setInterval`, one run at a time.
   */
  async function settlePending(options: SettleOptions): Promise<void> {
    const stale = await orders.findStale(
      'confirming',
      new Date(Date.now() - options.olderThanMs)
    )

    // One order that cannot be settled must not hold up the others.
    const failures: unknown[] = []
    for (const order of stale) {
      try {
        await settleOne(order, options)
      } catch (error) {
        failures.push(error)
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        `${failures.length} of ${stale.length} orders could not be settled`
      )
    }
  }
  // #endregion sweep

  return { startCheckout, confirmPayment, settlePending }
}

export type PaymentService = ReturnType<typeof createPaymentService>
