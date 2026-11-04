import type { ReconcileContext } from 'line-pay-merchant'

export type OrderStatus =
  /** Not sent to LINE Pay yet. */
  | 'created'
  /** Reserved at LINE Pay; the user is approving it. */
  | 'awaiting-approval'
  /** Confirm was sent and has not been answered (yet). */
  | 'confirming'
  | 'paid'
  /** A person has to look at it, in the LINE Pay Merchant Center. */
  | 'needs-attention'

export interface OrderItem {
  name: string
  quantity: number
  price: number
}

export interface Order {
  id: string
  items: OrderItem[]
  /** In TWD. Always taken from here, never from the URL. */
  total: number
  status: OrderStatus
  /**
   * Returned by `request`; also what LINE Pay puts on the confirmUrl. Text, never
   * a number: it has 19 digits, which a JavaScript number cannot hold exactly. In
   * SQL a `TEXT` or `VARCHAR(19)` column, not `BIGINT`.
   */
  transactionId?: string
  /**
   * The order ID that was sent to `request` for the current reservation. LINE
   * Pay reports it back with the payment, and an order is only marked paid when
   * the payment carries this one. Text as well: it may have leading zeros.
   */
  linePayOrderId?: string
  /**
   * Who holds the order while it is `confirming`: a random token, new for every
   * claim. A request that took the order can release it; one that was slow and
   * whose claim has been replaced cannot.
   */
  claimId?: string
  /** Written down before confirm is sent, so a sweeper can reconcile it later. */
  pendingConfirm?: ReconcileContext
  updatedAt: Date
}

/** What an order has to be like for a change to be made. */
export interface Expect {
  status: OrderStatus | readonly OrderStatus[]
  /** Only the holder of this claim. */
  claimId?: string
  /**
   * Only while the order has this transaction ID (`null`: while it has none).
   * Whoever read the order and reserves a payment for it says which reservation
   * it saw, so that of two reservations made at once only one is kept.
   */
  transactionId?: string | null
}

export interface OrderStore {
  find(id: string): Promise<Order | undefined>
  findByTransactionId(transactionId: string): Promise<Order | undefined>
  /** Orders that have been in `status` since before `before`. */
  findStale(status: OrderStatus, before: Date): Promise<Order[]>
  /**
   * Change the order only if it is still as `when` says, and say whether it was.
   * Two requests for the same order must not both win: in SQL this is
   * `UPDATE orders SET status = $to WHERE id = $id AND status = ANY($status)
   * AND ($claimId IS NULL OR claim_id = $claimId)
   * AND ($check_tx = false OR transaction_id IS NOT DISTINCT FROM $transactionId)`.
   */
  transition(
    id: string,
    when: Expect,
    to: OrderStatus,
    patch?: Partial<
      Pick<
        Order,
        'transactionId' | 'linePayOrderId' | 'pendingConfirm' | 'claimId'
      >
    >
  ): Promise<Order | undefined>
}

/** An in-memory store, for the examples and the tests. Use your database. */
export function createMemoryOrderStore(orders: Order[] = []): OrderStore {
  const byId = new Map(orders.map(order => [order.id, order]))

  return {
    find: id => Promise.resolve(byId.get(id)),

    findByTransactionId: transactionId =>
      Promise.resolve(
        [...byId.values()].find(order => order.transactionId === transactionId)
      ),

    findStale: (status, before) =>
      Promise.resolve(
        [...byId.values()].filter(
          order => order.status === status && order.updatedAt < before
        )
      ),

    transition(id, when, to, patch) {
      const order = byId.get(id)
      const statuses: readonly OrderStatus[] =
        typeof when.status === 'string' ? [when.status] : when.status
      if (
        order === undefined ||
        !statuses.includes(order.status) ||
        (when.claimId !== undefined && order.claimId !== when.claimId) ||
        (when.transactionId !== undefined &&
          (order.transactionId ?? null) !== when.transactionId)
      ) {
        return Promise.resolve(undefined)
      }
      const next: Order = {
        ...order,
        ...patch,
        status: to,
        updatedAt: new Date()
      }
      byId.set(id, next)
      return Promise.resolve(next)
    }
  }
}
