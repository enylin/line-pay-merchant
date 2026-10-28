/**
 * LINE Pay answers HTTP 200 for API-level failures and puts the result in
 * `returnCode`. `0000` is success.
 */
export const SUCCESS_RETURN_CODE = '0000'

/**
 * The other codes that start with `0` are statuses, not failures: the status
 * check of a payment answers with them (waiting, cancelled, done). No other
 * operation is known to.
 */
export function isStatusReturnCode(returnCode: string): boolean {
  return returnCode !== SUCCESS_RETURN_CODE && returnCode.startsWith('0')
}

/**
 * - `duplicate`: the call (or the order ID) already exists. The first call may well
 *   have succeeded.
 * - `unresolved`: LINE Pay answered, but not with a refusal: it failed inside, is
 *   still working on it, or cannot handle the payment in its current state. The
 *   call may have taken effect, so the outcome is `unknown`.
 * - `unclassified`: every other failing code. LINE Pay refused the call.
 */
export type ReturnCodeCategory = 'duplicate' | 'unresolved' | 'unclassified'

const DUPLICATE_CODES: ReadonlySet<string> = new Set([
  // The transaction already exists.
  '1152',
  // The payment has already been refunded. Another refund may exist.
  '1165',
  // There is already a transaction with the same order ID / the call was
  // already made. The first call may well have succeeded.
  '1172',
  // The same API call is being processed (duplicate request).
  '1198'
])

// TODO(v4-spec): these come from the 0.9 documentation and from independent V4
// clients that copy the result-code table, not from the official table. A code
// missing here is treated as a refusal, which is the less safe side: add one
// when the table is at hand.
const UNRESOLVED_CODES: ReadonlySet<string> = new Set([
  // The payment is being processed.
  '1145',
  // The payment cannot be handled in its current state: it may be the effect of
  // an earlier call that did go through (a void of a voided authorization).
  '1179',
  // Internal error while handling the request.
  '1199',
  // Temporary credit card payment error: check before repeating a charge.
  '1280',
  // V4 refund/void explicitly allow retry for 1999; it is not a duplicate.
  // Keep the outcome unknown until the transaction has been checked.
  '1999',
  // Returned by the refund API; the meaning is not public.
  '2042',
  // Internal error.
  '9000'
])

/** 1900 to 1909: a temporary error, "try again later". */
const TEMPORARY_ERROR = /^190\d$/

/**
 * Classify a failing return code.
 *
 * TODO(v4-spec): the complete result-code table of the V4 reference is not
 * available yet; see `UNRESOLVED_CODES`.
 */
export function classifyReturnCode(returnCode: string): ReturnCodeCategory {
  if (DUPLICATE_CODES.has(returnCode)) return 'duplicate'
  if (UNRESOLVED_CODES.has(returnCode) || TEMPORARY_ERROR.test(returnCode)) {
    return 'unresolved'
  }
  return 'unclassified'
}
