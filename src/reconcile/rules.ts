import type {
  AppliedResult,
  CallOptions,
  LinePayClient,
  ReconcileResult
} from '../client-types'
import { instantOf, wholeSeconds } from '../core/time'
import { amountsEqual } from '../core/validate'
import {
  isLinePayApiError,
  isLinePayError,
  type ReconcileContext
} from '../errors'
import type {
  ConfirmResponse,
  OperationOutput,
  PaymentDetailsInfo,
  PaymentDetailsInput,
  RefundEntry
} from '../operations'
import type { ReconcilableOperation } from '../operations/names'
import type {
  PayInfo,
  PaymentProvider,
  ResponsePackage,
  SelectedShipping
} from '../types'

const RECOVERED = 'Recovered from the payment details by reconcile'

const UNREADABLE =
  'The payment details are not in the shape the API promises, so nothing can be concluded from them.'

export interface RuleEnv {
  readonly client: LinePayClient
  readonly context: ReconcileContext
  readonly options: CallOptions | undefined
  /** LINE Pay refused this very call as a duplicate. */
  readonly duplicate: boolean
}

/**
 * A payment of the payment details, with every field the rules read. The details
 * come from the network, and a rule that read a missing field would answer with a
 * `TypeError` instead of an answer: an entry that lacks one is not read at all.
 */
interface Payment {
  readonly transactionId: string
  readonly orderId: string
  /** V4 omits payStatus in ordinary payment-details responses. */
  readonly payStatus: string | undefined
  readonly currency: string
  readonly payInfo: PayInfo[]
  readonly packages: ResponsePackage[]
  readonly refundList: RefundEntry[]
  readonly transactionDate: string | undefined
  readonly authorizationExpireDate: string | undefined
  readonly shipping: SelectedShipping | undefined
  readonly paymentProvider: PaymentProvider | undefined
}

/** One entry of the payment details. */
type Entry =
  | { readonly kind: 'payment'; readonly payment: Payment }
  | {
      readonly kind: 'other'
      readonly transactionId: string
      readonly orderId: string | undefined
      readonly transactionType: string
    }

type Details =
  | { readonly ok: true; readonly entries: readonly Entry[] }
  | { readonly ok: false; readonly reason: string }

const applied = <K extends ReconcilableOperation>(
  operation: K,
  body: OperationOutput<K>,
  notes: readonly string[] = []
): AppliedResult<K> => ({ status: 'applied', operation, body, notes })

const notApplied = (
  operation: ReconcilableOperation,
  reason: string
): ReconcileResult => ({ status: 'not-applied', operation, reason })

const indeterminate = (
  operation: ReconcilableOperation,
  reason: string
): ReconcileResult => ({ status: 'indeterminate', operation, reason })

/** A `PAYMENT` entry with everything the rules read, or `undefined`. */
function toPayment(info: PaymentDetailsInfo): Payment | undefined {
  const { transactionId, orderId, payStatus, currency, payInfo } = info
  if (
    transactionId === '' ||
    orderId === undefined ||
    currency === undefined ||
    payInfo === undefined
  ) {
    return undefined
  }
  return {
    transactionId,
    orderId,
    payStatus,
    currency,
    payInfo,
    packages: info.packages ?? [],
    refundList: info.refundList ?? [],
    transactionDate: info.transactionDate,
    authorizationExpireDate: info.authorizationExpireDate,
    shipping: info.shipping,
    paymentProvider: info.paymentProvider
  }
}

/**
 * The entries of the payment details, or `undefined` when a payment among them
 * lacks what the rules read. The answer has passed the guard of `paymentDetails`
 * (every entry has an ID and a type, and what else it has is of the right type),
 * so what is left to check is what only a payment must have.
 */
function parseEntries(
  info: readonly PaymentDetailsInfo[]
): readonly Entry[] | undefined {
  const entries: Entry[] = []
  for (const item of info) {
    if (item.transactionType === 'PAYMENT') {
      const payment = toPayment(item)
      if (payment === undefined) return undefined
      entries.push({ kind: 'payment', payment })
    } else {
      entries.push({
        kind: 'other',
        transactionId: item.transactionId,
        orderId: item.orderId,
        transactionType: item.transactionType
      })
    }
  }
  return entries
}

async function readDetails(
  env: RuleEnv,
  query: PaymentDetailsInput
): Promise<Details> {
  try {
    const { body } = await env.client.paymentDetails(query, env.options)
    const entries = parseEntries(body.info)
    return entries === undefined
      ? { ok: false, reason: UNREADABLE }
      : { ok: true, entries }
  } catch (error) {
    // TODO(v4-spec): 1150 means "no such transaction" in V3 (observed in the
    // sandbox, not documented). It is evidence, not a failure to read.
    if (isLinePayApiError(error) && error.returnCode === '1150') {
      return { ok: true, entries: [] }
    }
    if (isLinePayError(error)) {
      return {
        ok: false,
        reason: `The payment details could not be read (${error.code}).`
      }
    }
    throw error
  }
}

// TODO(v4-spec): the sum of payInfo is taken to be the amount of the payment,
// discounts included. If it is not, a payment that was made is reported as
// `indeterminate` (never as `applied`), which is the safe side.
const paidAmount = (payment: Payment) =>
  payment.payInfo.reduce((sum, pay) => sum + pay.amount, 0)

/**
 * The payment is in the currency, and for the amount, that the call asked for.
 * `reconcile` has seen to it that the context carries both; if one is missing all
 * the same, nothing matches.
 */
const matchesCall = (payment: Payment, context: ReconcileContext) =>
  context.currency !== undefined &&
  context.amount !== undefined &&
  payment.currency === context.currency &&
  amountsEqual(paidAmount(payment), context.amount)

function byTransactionId(env: RuleEnv): PaymentDetailsInput {
  return { transactionId: [env.context.transactionId ?? ''] }
}

/** Every entry that carries the transaction ID. There should be one. */
function withTransactionId(
  entries: readonly Entry[],
  transactionId: string | undefined
): Entry[] {
  return entries.filter(entry =>
    entry.kind === 'payment'
      ? entry.payment.transactionId === transactionId
      : entry.transactionId === transactionId
  )
}

type Lookup =
  | { readonly found: 'payment'; readonly payment: Payment }
  | { readonly found: 'nothing' }
  | { readonly found: 'unclear'; readonly reason: string }

/** The one payment with the transaction ID of the call, or why there is none. */
function lookUpPayment(
  entries: readonly Entry[],
  transactionId: string | undefined
): Lookup {
  const [entry, ...more] = withTransactionId(entries, transactionId)
  if (entry === undefined) return { found: 'nothing' }
  if (more.length > 0) {
    return {
      found: 'unclear',
      reason: 'Several entries carry this transaction ID.'
    }
  }
  if (entry.kind === 'other') {
    return {
      found: 'unclear',
      reason: `The transaction is a ${entry.transactionType}, not a payment.`
    }
  }
  return { found: 'payment', payment: entry.payment }
}

/**
 * "It is not there" says that the call did not happen only if the search could
 * have found it and nothing speaks against it. Nothing may speak against it:
 *
 * - LINE Pay itself answered that the call duplicates another one, so what it
 *   duplicates exists;
 * - the answer holds entries that are not the one asked for (an ID that differs
 *   in a character LINE Pay does not mind, say), and the one asked for may be
 *   among what cannot be matched;
 * - the context does not say on which channel the call was made, and with the
 *   credentials of another channel nothing would show up either.
 */
function absent(
  operation: ReconcilableOperation,
  env: RuleEnv,
  entries: readonly Entry[],
  reason: string
): ReconcileResult {
  if (env.duplicate) {
    return indeterminate(
      operation,
      'LINE Pay answered that this call duplicates another one, so something exists that it duplicates, and it is not among the payment details: look in the Merchant Center.'
    )
  }
  if (entries.length > 0) {
    return indeterminate(
      operation,
      'The payment details hold entries, but none of them is the payment of this call (an ID that differs in a character, say), so they cannot show that nothing happened.'
    )
  }
  if (env.context.channelId === undefined) {
    return indeterminate(
      operation,
      `${reason} That proves nothing here: the context does not say on which channel the call was made, and with the credentials of another channel the payment would not show up either. Save channelId with the context.`
    )
  }
  return notApplied(operation, reason)
}

const AUTHORIZED_NOTE =
  'The payment is authorized, not captured. That is as it should be if the call asked not to capture. If it asked to capture (the default), look at the payment again before treating it as paid: an authorization that is never captured expires.'

const REGKEY_NOTE =
  'If the payment request used payType PREAPPROVED, the regKey is only returned by confirm. ' +
  'It cannot be recovered from the payment details, so treat that case by hand. ' +
  'If the original error is an unexpected-shape one, the response as received is in its body, and the regKey may be in it.'

/**
 * The payment shows in the payment details once confirm went through (as
 * authorized or captured). The amount must match what was asked for.
 */
export async function reconcileConfirm(env: RuleEnv): Promise<ReconcileResult> {
  const { context } = env
  const details = await readDetails(env, byTransactionId(env))
  if (!details.ok) return indeterminate('confirm', details.reason)

  const lookup = lookUpPayment(details.entries, context.transactionId)
  if (lookup.found === 'nothing') {
    return absent(
      'confirm',
      env,
      details.entries,
      'The payment is not in the payment details: the user has not approved it, or confirm did not go through.'
    )
  }
  if (lookup.found === 'unclear') return indeterminate('confirm', lookup.reason)

  const { payment } = lookup
  if (payment.payStatus === undefined) {
    return indeterminate(
      'confirm',
      'The V4 payment details omit payStatus, so capture versus authorization cannot be verified.'
    )
  }
  if (
    payment.payStatus !== 'CAPTURE' &&
    payment.payStatus !== 'AUTHORIZATION'
  ) {
    return indeterminate(
      'confirm',
      `The payment was confirmed but is now ${payment.payStatus}.`
    )
  }
  if (!matchesCall(payment, context)) {
    return indeterminate(
      'confirm',
      'The payment exists, but its amount or currency differs from the confirm call.'
    )
  }

  const body: ConfirmResponse = {
    returnCode: '0000',
    returnMessage: RECOVERED,
    info: {
      orderId: payment.orderId,
      transactionId: payment.transactionId,
      payInfo: payment.payInfo,
      packages: payment.packages
    }
  }
  if (typeof payment.authorizationExpireDate === 'string') {
    body.info.authorizationExpireDate = payment.authorizationExpireDate
  }
  if (payment.shipping !== undefined) body.info.shipping = payment.shipping
  if (payment.paymentProvider !== undefined) {
    body.info.paymentProvider = payment.paymentProvider
  }
  return applied(
    'confirm',
    body,
    payment.payStatus === 'AUTHORIZATION'
      ? [REGKEY_NOTE, AUTHORIZED_NOTE]
      : [REGKEY_NOTE]
  )
}

export async function reconcileCapture(env: RuleEnv): Promise<ReconcileResult> {
  const { context } = env
  const details = await readDetails(env, byTransactionId(env))
  if (!details.ok) return indeterminate('capture', details.reason)

  const lookup = lookUpPayment(details.entries, context.transactionId)
  if (lookup.found === 'nothing') {
    return indeterminate(
      'capture',
      'The payment is not in the payment details.'
    )
  }
  if (lookup.found === 'unclear') return indeterminate('capture', lookup.reason)

  const { payment } = lookup
  if (payment.payStatus === undefined) {
    return indeterminate(
      'capture',
      'The V4 payment details omit payStatus, so capture cannot be verified.'
    )
  }
  switch (payment.payStatus) {
    case 'AUTHORIZATION':
      return notApplied('capture', 'The payment is still only authorized.')
    case 'CAPTURE':
      if (!matchesCall(payment, context)) {
        return indeterminate(
          'capture',
          'The payment is captured, but its amount or currency differs from the capture call.'
        )
      }
      return applied(
        'capture',
        {
          returnCode: '0000',
          returnMessage: RECOVERED,
          info: {
            orderId: payment.orderId,
            transactionId: payment.transactionId,
            payInfo: payment.payInfo
          }
        },
        [
          'The payment details do not say who captured it. If another call captured the same payment, this one did not.'
        ]
      )
    default:
      return indeterminate(
        'capture',
        `The payment is ${payment.payStatus}, so it cannot be captured.`
      )
  }
}

export async function reconcileVoid(env: RuleEnv): Promise<ReconcileResult> {
  const { context } = env
  const details = await readDetails(env, byTransactionId(env))
  if (!details.ok) return indeterminate('void', details.reason)

  const lookup = lookUpPayment(details.entries, context.transactionId)
  if (lookup.found === 'nothing') {
    return indeterminate('void', 'The payment is not in the payment details.')
  }
  if (lookup.found === 'unclear') return indeterminate('void', lookup.reason)

  const { payment } = lookup
  if (payment.payStatus === undefined) {
    return indeterminate(
      'void',
      'The V4 payment details omit payStatus, so void cannot be verified.'
    )
  }
  switch (payment.payStatus) {
    case 'VOIDED_AUTHORIZATION':
      return applied('void', { returnCode: '0000', returnMessage: RECOVERED })
    case 'AUTHORIZATION':
      return notApplied('void', 'The authorization is still open.')
    case 'CAPTURE':
      return notApplied(
        'void',
        'The payment was captured, so it cannot have been voided.'
      )
    case 'EXPIRED_AUTHORIZATION':
      return notApplied('void', 'The authorization expired; it was not voided.')
    default:
      return indeterminate('void', `The payment is ${payment.payStatus}.`)
  }
}

/** The transaction types of a refund. */
const REFUND_TYPES: ReadonlySet<string> = new Set([
  'PAYMENT_REFUND',
  'PARTIAL_REFUND'
])

/** The order ID is the key: LINE Pay refuses a second payment with the same one. */
export async function reconcilePayPreapproved(
  env: RuleEnv
): Promise<ReconcileResult> {
  const { context } = env
  // A repeated order ID can resolve to an earlier charge. A timestamp and
  // amount are not enough to attribute that charge to this API invocation.
  if (env.duplicate) {
    return indeterminate(
      'payPreapproved',
      'LINE Pay rejected this request as a duplicate. An earlier payment may exist for this order ID; do not attribute it to this call.'
    )
  }
  const details = await readDetails(env, { orderId: [context.orderId ?? ''] })
  if (!details.ok) return indeterminate('payPreapproved', details.reason)

  // An entry with this order ID that is neither a payment nor a refund is
  // something this rule does not know. Not finding a payment next to it must not
  // read as "nothing was charged".
  for (const entry of details.entries) {
    if (
      entry.kind === 'other' &&
      entry.orderId === context.orderId &&
      !REFUND_TYPES.has(entry.transactionType)
    ) {
      return indeterminate(
        'payPreapproved',
        `An entry with this order ID is a ${entry.transactionType}, which this rule does not know how to read.`
      )
    }
  }

  const matches = details.entries.flatMap(entry =>
    entry.kind === 'payment' && entry.payment.orderId === context.orderId
      ? [entry.payment]
      : []
  )
  if (matches.length === 0) {
    return absent(
      'payPreapproved',
      env,
      details.entries,
      'No payment with this order ID exists.'
    )
  }
  const [payment] = matches
  if (matches.length > 1 || payment === undefined) {
    return indeterminate(
      'payPreapproved',
      'Several payments carry this order ID.'
    )
  }
  // A voided or expired authorization with this order ID is not a charge.
  if (payment.payStatus === undefined) {
    return indeterminate(
      'payPreapproved',
      'The V4 payment details omit payStatus, so the charge cannot be verified.'
    )
  }
  if (
    payment.payStatus !== 'CAPTURE' &&
    payment.payStatus !== 'AUTHORIZATION'
  ) {
    return indeterminate(
      'payPreapproved',
      `A payment with this order ID exists, but it is ${payment.payStatus}.`
    )
  }
  if (!matchesCall(payment, context)) {
    return indeterminate(
      'payPreapproved',
      'A payment with this order ID exists, but its amount or currency differs from the call.'
    )
  }
  if (typeof payment.transactionDate !== 'string') {
    return indeterminate(
      'payPreapproved',
      'A payment with this order ID exists, but it has no transaction date.'
    )
  }
  // Since timestamps may omit milliseconds, a payment in the same second as
  // this call may have happened *before* it. Never claim it as this call's.
  // A missing time zone is also not evidence.
  if (
    !(
      wholeSeconds(instantOf(payment.transactionDate)) >
      wholeSeconds(context.startedAt.getTime())
    )
  ) {
    return indeterminate(
      'payPreapproved',
      'A payment with this order ID exists, but it is not provably after the call began (or its date cannot be read), so it may be an earlier use of the order ID.'
    )
  }

  const info: {
    orderId: string
    transactionId: string
    transactionDate: string
    authorizationExpireDate?: string
  } = {
    orderId: payment.orderId,
    transactionId: payment.transactionId,
    transactionDate: payment.transactionDate
  }
  if (typeof payment.authorizationExpireDate === 'string') {
    info.authorizationExpireDate = payment.authorizationExpireDate
  }
  return applied(
    'payPreapproved',
    { returnCode: '0000', returnMessage: RECOVERED, info },
    payment.payStatus === 'AUTHORIZATION' ? [AUTHORIZED_NOTE] : []
  )
}

/**
 * A refund is not idempotent, so this rule never concludes `not-applied`: not
 * finding the refund does not prove that LINE Pay did not make it (it may still be
 * processing). It answers `applied` only when exactly one refund of the right
 * amount was made in a later second. Same-second timestamps are ambiguous.
 */
export async function reconcileRefund(env: RuleEnv): Promise<ReconcileResult> {
  const { context } = env
  // LINE Pay refused this very call as a duplicate. A refund of that amount may
  // well exist, made by the call it duplicates, but then this call made none: to
  // report "applied" for it would count one refund twice.
  if (env.duplicate) {
    return indeterminate(
      'refund',
      'LINE Pay refused this call as a duplicate. An earlier refund may exist, but it cannot be told whether it is this call that made it: look in the Merchant Center before refunding again.'
    )
  }
  const details = await readDetails(env, byTransactionId(env))
  if (!details.ok) return indeterminate('refund', details.reason)

  const lookup = lookUpPayment(details.entries, context.transactionId)
  if (lookup.found === 'nothing') {
    return indeterminate('refund', 'The payment is not in the payment details.')
  }
  if (lookup.found === 'unclear') return indeterminate('refund', lookup.reason)

  // What could be this call's refund: any refund when the call refunded
  // everything, else one of the amount it asked for. An entry of those that this
  // rule cannot read (a type it does not know, a date without a time zone) may be
  // the one, and must not be left out of the count: a refund that was found would
  // then pass as "exactly one" when it is another's.
  const possible = lookup.payment.refundList.filter(
    refund =>
      context.refundAmount === undefined ||
      amountsEqual(Math.abs(refund.refundAmount), context.refundAmount)
  )
  if (
    possible.some(
      refund =>
        !REFUND_TYPES.has(refund.transactionType) ||
        Number.isNaN(instantOf(refund.refundTransactionDate))
    )
  ) {
    return indeterminate(
      'refund',
      "The refund list holds an entry that could be this refund but cannot be read (a type this rule does not know, or a date without a time zone), so it cannot be told which refund is this call's: look in the Merchant Center before refunding again."
    )
  }

  // A timestamp equal to the call's starting second may be an earlier refund.
  // Never claim a same-second refund as this request's. Other concurrent
  // refunds are still ambiguous; callers must serialize by transaction ID.
  const since = wholeSeconds(context.startedAt.getTime())
  const candidates = possible.filter(
    refund =>
      wholeSeconds(instantOf(refund.refundTransactionDate)) > since &&
      (context.refundAmount !== undefined ||
        refund.transactionType === 'PAYMENT_REFUND')
  )

  const [refund] = candidates
  if (candidates.length === 1 && refund !== undefined) {
    return applied(
      'refund',
      {
        returnCode: '0000',
        returnMessage: RECOVERED,
        info: {
          refundTransactionId: refund.refundTransactionId,
          refundTransactionDate: refund.refundTransactionDate
        }
      },
      [
        'Matched by amount and a later whole second. This does not identify the API call: concurrent refunds of the same amount can still be confused. Serialize refunds of one transaction and check the Merchant Center before relying on an inferred refund.'
      ]
    )
  }
  return indeterminate(
    'refund',
    candidates.length === 0
      ? 'No matching refund shows up since the call started. It may still be processing: ask again later, or look in the Merchant Center, before refunding again.'
      : 'Several refunds of this amount were made since the call started; it cannot be told which one belongs to this call.'
  )
}
