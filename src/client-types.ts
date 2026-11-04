import type { AnyLinePayError, CallMeta } from './errors'
import type {
  CaptureInput,
  CaptureResponse,
  CheckPaymentStatusInput,
  CheckPaymentStatusResponse,
  CheckRegKeyInput,
  CheckRegKeyResponse,
  ConfirmInput,
  ConfirmResponse,
  ExpireRegKeyInput,
  ExpireRegKeyResponse,
  OperationInput,
  OperationOutput,
  PaymentDetailsInput,
  PaymentDetailsResponse,
  PayPreapprovedInput,
  PayPreapprovedResponse,
  RefundInput,
  RefundResponse,
  RequestPaymentInput,
  RequestPaymentResponse,
  VoidInput,
  VoidResponse
} from './operations'
import type { OperationName, ReconcilableOperation } from './operations/names'

/** Settings of one call. They are separate from the fields sent to LINE Pay. */
export interface CallOptions {
  /**
   * Time limit of this attempt in milliseconds. Overrides `timeouts[operation]`
   * and `timeout` of the client configuration, and the operation's default.
   */
  timeout?: number
  /**
   * Cancels the call. Use `AbortSignal.timeout(8000)` to bound the total time,
   * retries included.
   */
  signal?: AbortSignal
}

/** How a call that succeeded went; a call that failed has the {@link CallMeta} on its error. */
export interface ResultMeta extends CallMeta {
  /** Present only when `reconcile` inferred this result after an unknown outcome. */
  recovered?: RecoveryInfo
}

/** Why a result was inferred instead of received. Log it: it is part of the audit trail. */
export interface RecoveryInfo {
  /** `unknown-outcome`: a timeout or a cut connection. `duplicate`: LINE Pay answered with a duplicate code. */
  reason: 'unknown-outcome' | 'duplicate'
  /** The error that made the recovery necessary. */
  cause: AnyLinePayError
  /** What the evidence does not show. Read them. */
  notes: readonly string[]
}

export interface LinePayResult<Body> {
  /** The LINE Pay response as it was sent. IDs beyond 2^53 are strings. */
  body: Body
  meta: ResultMeta
}

/** What a middleware sees of one call. */
export interface CallContext<K extends OperationName = OperationName> {
  readonly operation: K
  readonly input: OperationInput<K>
  readonly options: Readonly<CallOptions>
  readonly startedAt: Date
  /** The client the call was made on, with its complete middleware stack. */
  readonly client: LinePayClient
}

/** A context of any operation. Narrow it by checking `operation`. */
export type AnyCallContext = {
  [K in OperationName]: CallContext<K>
}[OperationName]

/**
 * The result of the operation `K`. For several operations at once it is the
 * union of their results, which is what the compiler needs to follow a call
 * through code that is generic over the operation.
 */
export type ResultOf<K extends OperationName> = {
  [P in K]: LinePayResult<OperationOutput<P>>
}[K]

/** A result of any operation. */
export type AnyResult = ResultOf<OperationName>

/**
 * Wraps a call. Call `next()` to continue with the inner middleware and, in the end,
 * the request. `next()` may be called more than once, as a retry does.
 * Middleware registered first is the outermost.
 */
export type Middleware = (
  ctx: AnyCallContext,
  next: () => Promise<AnyResult>
) => Promise<AnyResult>

/**
 * A call that took effect, as `reconcile` found it in the payment details. For
 * several operations at once it is the union of their results, tagged by
 * `operation`: narrow it by checking that field.
 */
export type AppliedResult<
  K extends ReconcilableOperation = ReconcilableOperation
> = {
  [P in K]: {
    status: 'applied'
    operation: P
    body: OperationOutput<P>
    notes: readonly string[]
  }
}[K]

/**
 * What `reconcile` found out about a call whose outcome was unknown.
 *
 * - `applied`: LINE Pay did process it. `body` is built from the payment details,
 *   not received from the API.
 * - `not-applied`: it did not take effect. Either the error proves it (the
 *   request was never sent, or LINE Pay refused it), or the payment details show
 *   no sign of it. The second kind is never concluded for a refund, whose absence
 *   from the details proves nothing, nor for a context that does not name its
 *   channel. It is what one look found: a payment that is still being processed
 *   shows up later, so look again after a while before repeating. LINE Pay is
 *   expected to refuse a second confirm, capture or void when the first took
 *   effect (verify that in the V4 sandbox); a second payPreapproved is refused
 *   only with the same orderId, and a new orderId is a new payment.
 * - `indeterminate`: the evidence does not settle it. Look again later, or check
 *   the Merchant Center.
 */
export type ReconcileResult =
  | AppliedResult
  | {
      status: 'not-applied'
      operation: ReconcilableOperation
      reason: string
    }
  | {
      status: 'indeterminate'
      /** Absent when the error carries nothing to look up. */
      operation?: OperationName
      reason: string
    }

/**
 * A LINE Pay client. It is immutable: `with()` returns a new client.
 *
 * Every method takes one flat input object (path parameters and body or query
 * fields side by side) and an optional {@link CallOptions}.
 */
export interface LinePayClient {
  /**
   * Reserve a payment. Send the user to `body.info.paymentUrl.web` (or `.app`,
   * from an app), then call `confirm` when they return to your confirmUrl.
   *
   * @example
   * const { body } = await linePay.request({
   *   amount: 1000,
   *   currency: 'TWD',
   *   orderId: 'order-1',
   *   packages: [{ id: 'p1', amount: 1000, products: [{ name: 'Tea', quantity: 2, price: 500 }] }],
   *   redirectUrls: { confirmUrl: 'https://shop.example/confirm', cancelUrl: 'https://shop.example/cancel' }
   * })
   */
  request(
    input: RequestPaymentInput,
    options?: CallOptions
  ): Promise<LinePayResult<RequestPaymentResponse>>

  /**
   * Complete the payment after the user approved it. An unknown outcome (a
   * timeout) does not mean the payment failed; see `reconcile`.
   *
   * @example
   * const { body } = await linePay.confirm({ transactionId, amount: 1000, currency: 'TWD' })
   */
  confirm(
    input: ConfirmInput,
    options?: CallOptions
  ): Promise<LinePayResult<ConfirmResponse>>

  /** Capture a payment that was authorized only (`options.payment.capture` was `false`). */
  capture(
    input: CaptureInput,
    options?: CallOptions
  ): Promise<LinePayResult<CaptureResponse>>

  /** Void an authorization that has not been captured. */
  void(
    input: VoidInput,
    options?: CallOptions
  ): Promise<LinePayResult<VoidResponse>>

  /**
   * Refund a payment, fully or partially. A refund is not idempotent: never
   * repeat it blindly after an unknown outcome.
   *
   * @example
   * const { body } = await linePay.refund({ transactionId, refundAmount: 20 })
   */
  refund(
    input: RefundInput,
    options?: CallOptions
  ): Promise<LinePayResult<RefundResponse>>

  /** Look up payments, refunds and orders by transaction ID or order ID. */
  paymentDetails(
    input: PaymentDetailsInput,
    options?: CallOptions
  ): Promise<LinePayResult<PaymentDetailsResponse>>

  /** Poll whether the user approved a payment request (instead of using the confirmUrl). */
  checkPaymentStatus(
    input: CheckPaymentStatusInput,
    options?: CallOptions
  ): Promise<LinePayResult<CheckPaymentStatusResponse>>

  /** Check the status of a registration key (pre-approved payment). */
  checkRegKey(
    input: CheckRegKeyInput,
    options?: CallOptions
  ): Promise<LinePayResult<CheckRegKeyResponse>>

  /** Charge a registration key without user approval. */
  payPreapproved(
    input: PayPreapprovedInput,
    options?: CallOptions
  ): Promise<LinePayResult<PayPreapprovedResponse>>

  /** Expire a registration key. */
  expireRegKey(
    input: ExpireRegKeyInput,
    options?: CallOptions
  ): Promise<LinePayResult<ExpireRegKeyResponse>>

  /**
   * Returns a new client with more middleware, placed inside the existing stack.
   * The client it is called on does not change.
   */
  with(...middleware: Middleware[]): LinePayClient

  /**
   * Find out, from the payment details, whether a call with an unknown outcome
   * (a timeout, a cut connection, or a duplicate answer) took effect. It only
   * concludes from evidence and never repeats the operation.
   *
   * Pass the error the call threw. If the process died before it got an answer
   * there is no error: save a {@link ReconcileContext} before making the call,
   * and pass that from a background job instead.
   *
   * @example
   * try {
   *   await linePay.confirm({ transactionId, amount, currency })
   * } catch (error) {
   *   if (!needsReconcile(error)) throw error
   *   const result = await linePay.reconcile(error)
   *   if (result.status === 'applied' && result.operation === 'confirm') {
   *     markPaid(result.body.info)
   *   }
   * }
   */
  reconcile(
    errorOrContext: unknown,
    options?: CallOptions
  ): Promise<ReconcileResult>
}
