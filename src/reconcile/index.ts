import type {
  CallOptions,
  LinePayClient,
  ReconcileResult
} from '../client-types'
import { isNumber, isRecord } from '../core/guard'
import { toDate } from '../core/time'
import { isTransactionId } from '../core/validate'
import {
  isLinePayApiError,
  isLinePayError,
  type LinePayApiError,
  type LinePayHttpError,
  needsReconcile,
  type ReconcileContext
} from '../errors'
import {
  isOperationName,
  isReconcilableOperation,
  type ReconcilableOperation
} from '../operations/names'
import {
  reconcileCapture,
  reconcileConfirm,
  reconcilePayPreapproved,
  reconcileRefund,
  reconcileVoid,
  type RuleEnv
} from './rules'

const rules = {
  confirm: reconcileConfirm,
  capture: reconcileCapture,
  void: reconcileVoid,
  refund: reconcileRefund,
  payPreapproved: reconcilePayPreapproved
} as const

type Field = 'transactionId' | 'orderId' | 'amount' | 'currency'

/** What the lookup of each operation cannot do without. */
const NEEDS: Readonly<Record<ReconcilableOperation, readonly Field[]>> = {
  confirm: ['transactionId', 'amount', 'currency'],
  capture: ['transactionId', 'amount', 'currency'],
  void: ['transactionId'],
  refund: ['transactionId'],
  payPreapproved: ['orderId', 'amount', 'currency']
}

const usableAmount = (value: unknown): number | undefined =>
  isNumber(value) ? value : undefined
const usableText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined
const usableTransactionId = (value: unknown): string | undefined =>
  isTransactionId(value) ? value : undefined

/** Why a field a lookup needs cannot be used. */
function refusal(field: Field, given: unknown): string {
  if (field === 'transactionId' || field === 'orderId') {
    return `The context carries no ${field} to look up.`
  }
  if (given === undefined) {
    return `The context carries no ${field} to compare with.`
  }
  return `The context's ${field} must be ${field === 'amount' ? 'a finite number' : 'a non-empty string'}.`
}

/**
 * The context to look a call up with, from the fields of one. A context may come
 * out of a database, so a field is checked for its type and not just for being
 * there: a number where an order ID belongs would never equal the string LINE Pay
 * reports, and "nothing found" would read as "did not happen". Returns why the
 * context cannot be used instead when it cannot.
 */
function readContext(
  fields: Readonly<Record<string, unknown>>,
  operation: ReconcilableOperation,
  startedAt: Date
): ReconcileContext | string {
  const read = {
    transactionId: usableTransactionId(fields.transactionId),
    orderId: usableText(fields.orderId),
    amount: usableAmount(fields.amount),
    currency: usableText(fields.currency)
  }
  for (const field of NEEDS[operation]) {
    if (read[field] === undefined) return refusal(field, fields[field])
  }

  const { refundAmount, channelId } = fields
  if (refundAmount !== undefined && usableAmount(refundAmount) === undefined) {
    return "The context's refundAmount must be a finite number, or left out for a full refund."
  }
  if (channelId !== undefined && usableText(channelId) === undefined) {
    return "The context's channelId must be a non-empty string."
  }
  return {
    operation,
    startedAt,
    channelId: usableText(channelId),
    transactionId: read.transactionId,
    orderId: read.orderId,
    amount: read.amount,
    currency: read.currency,
    refundAmount: usableAmount(refundAmount)
  }
}

/** What refused the call: only LINE Pay's answer, or a proxy's, can be `rejected`. */
function describeRefusal(error: LinePayApiError | LinePayHttpError): string {
  return isLinePayApiError(error)
    ? `returnCode ${error.returnCode}`
    : `HTTP ${error.httpStatus}`
}

/**
 * What a context carries itself. A field it does not have must not be found on
 * `Object.prototype`, where another part of the program may have put one (the
 * same reason `resolveConfig` reads the configuration this way): the lookup would
 * be of a payment the context never named.
 */
function ownFields(value: object): Readonly<Record<string, unknown>> {
  const own: Record<string, unknown> = { ...value }
  Object.setPrototypeOf(own, null)
  return own
}

/** A context as it was found, before it is checked. */
interface Candidate {
  readonly operation: string
  readonly startedAt: Date
  readonly fields: Readonly<Record<string, unknown>>
}

/** What the caller passed, as a context: an error's own, or one that was saved. */
function candidateOf(subject: unknown): Candidate | string | undefined {
  if (isLinePayError(subject)) {
    const { context } = subject
    return context === undefined
      ? undefined
      : {
          operation: context.operation,
          startedAt: context.startedAt,
          fields: ownFields(context)
        }
  }
  if (!isRecord(subject)) return undefined
  const fields = ownFields(subject)
  if (typeof fields.operation !== 'string') return undefined

  // A context that was saved comes back from JSON with a string or a number.
  const startedAt = toDate(fields.startedAt)
  if (startedAt === undefined) {
    return 'The context needs startedAt: a Date, an ISO 8601 string with a time zone, or milliseconds since the epoch (a number of seconds is not milliseconds).'
  }
  return { operation: fields.operation, startedAt, fields }
}

/**
 * Look up whether a call took effect. The lookups go through `client`, so its
 * middleware applies to them too.
 *
 * It takes an error of this client, or a context that was saved before the call
 * (the process may have died before it got an answer, and then there is no error).
 *
 * Only an unknown outcome (or a duplicate answer) needs a lookup. An error that
 * proves the call did not happen, because it was never sent or LINE Pay refused
 * it, is answered without one.
 */
export async function reconcile(
  client: LinePayClient,
  channelId: string,
  subject: unknown,
  options?: CallOptions
): Promise<ReconcileResult> {
  // Never sent: no context is needed to know that, and an input that was refused
  // before it could be sent (bad call options, say) has none.
  if (isLinePayError(subject) && subject.outcome === 'not-sent') {
    const operation = subject.context?.operation ?? subject.operation
    if (operation !== undefined && isReconcilableOperation(operation)) {
      return {
        status: 'not-applied',
        operation,
        reason: 'The request was never sent, so it did not take effect.'
      }
    }
  }

  const candidate = candidateOf(subject)
  if (typeof candidate === 'string') {
    return { status: 'indeterminate', reason: candidate }
  }
  if (candidate === undefined) {
    return {
      status: 'indeterminate',
      reason:
        'There is nothing to look up: pass an error thrown by a call of this client, or the context of a call.'
    }
  }
  const { operation } = candidate
  if (!isReconcilableOperation(operation)) {
    return {
      status: 'indeterminate',
      ...(isOperationName(operation) ? { operation } : {}),
      reason: `Reconcile is not supported for ${operation}.`
    }
  }

  if (isLinePayError(subject)) {
    if (subject.outcome === 'rejected' && !needsReconcile(subject)) {
      return {
        status: 'not-applied',
        operation,
        reason: `LINE Pay refused the call (${describeRefusal(subject)}), so it did not take effect.`
      }
    }
  }

  const context = readContext(candidate.fields, operation, candidate.startedAt)
  if (typeof context === 'string') {
    return { status: 'indeterminate', operation, reason: context }
  }
  if (context.channelId !== undefined && context.channelId !== channelId) {
    return {
      status: 'indeterminate',
      operation,
      reason: `The call was made on channel ${context.channelId}, and this client is channel ${channelId}: with other credentials the payment would not be found, and that would say nothing.`
    }
  }

  const duplicate =
    isLinePayApiError(subject) && subject.category === 'duplicate'
  const env: RuleEnv = { client, context, options, duplicate }
  return rules[operation](env)
}
