/**
 * Every operation the client exposes. The names match the 0.9 API so that call
 * sites only change shape, not vocabulary.
 */
export const OPERATION_NAMES = Object.freeze([
  'request',
  'confirm',
  'capture',
  'void',
  'refund',
  'paymentDetails',
  'checkPaymentStatus',
  'checkRegKey',
  'payPreapproved',
  'expireRegKey'
] as const)

export type OperationName = (typeof OPERATION_NAMES)[number]

/**
 * Operations whose "unknown outcome" can be resolved by looking at the payment
 * details afterwards. `request`, the read operations and `expireRegKey` are not
 * in this list on purpose: a payment that was only requested moves no money and
 * is asked for again with a new order ID, and the others have nothing to look up.
 * Both lists are frozen: they decide, for every client of the process, which
 * calls are looked up.
 */
export const RECONCILABLE_OPERATIONS = Object.freeze([
  'confirm',
  'capture',
  'void',
  'refund',
  'payPreapproved'
] as const)

export type ReconcilableOperation = (typeof RECONCILABLE_OPERATIONS)[number]

export function isOperationName(value: unknown): value is OperationName {
  return OPERATION_NAMES.some(name => name === value)
}

export function isReconcilableOperation(
  value: unknown
): value is ReconcilableOperation {
  return RECONCILABLE_OPERATIONS.some(name => name === value)
}

/**
 * How an operation behaves when its outcome is unknown.
 *
 * - `read`: no side effect, always safe to repeat.
 * - `create`: reserves a payment but moves no money.
 * - `settle`: moves money or changes state, and the server rejects duplicates.
 * - `refund`: moves money and is NOT idempotent (partial refunds can repeat).
 */
export type OperationEffect = 'read' | 'create' | 'settle' | 'refund'
