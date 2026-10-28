import {
  type LinePayApiBody,
  LinePayApiError,
  LinePayHttpError
} from '../errors'
import {
  classifyReturnCode,
  isStatusReturnCode,
  SUCCESS_RETURN_CODE
} from '../errors/return-codes'
import { isRecord } from './guard'
import { parseLossless } from './json'
import type { TransportResponse } from './transport'

const BODY_TEXT_LIMIT = 2048

/**
 * A proxy can emit any non-2xx status after forwarding the request to LINE Pay.
 * Even 400, 408 or 429 is not proof that a money-moving call did not happen.
 * LINE Pay documents 200 responses with application-level return codes.
 */
function truncate(text: string): string {
  return text.length > BODY_TEXT_LIMIT ? text.slice(0, BODY_TEXT_LIMIT) : text
}

function tryParse(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: parseLossless(text) }
  } catch {
    return { ok: false }
  }
}

/**
 * What a LINE Pay answer has for certain: a return code. The message may be
 * missing, or `null`: it is never worth losing the code over (a duplicate code
 * must lead to a lookup whatever else the answer lacks).
 */
interface Envelope {
  returnCode: string
  returnMessage?: string | null
  [key: string]: unknown
}

function isEnvelope(value: unknown): value is Envelope {
  if (!isRecord(value)) return false
  const { returnCode, returnMessage } = value
  return (
    typeof returnCode === 'string' &&
    returnCode.length === 4 &&
    (returnMessage === undefined ||
      returnMessage === null ||
      typeof returnMessage === 'string')
  )
}

/**
 * Turn an HTTP response into a LINE Pay response body, or throw.
 *
 * - non-2xx: an error with `outcome: 'unknown'`, even for 4xx, because a
 *   gateway may already have forwarded a money-moving request to LINE Pay.
 *   A valid failing `returnCode` remains available on `LinePayApiError`
 * - 2xx that is not a LINE Pay response (a proxy page, an empty body):
 *   `LinePayHttpError` with `unknown`, because it may not even come from LINE Pay
 * - 2xx with a failing `returnCode`: `LinePayApiError`
 * - 2xx with a status code (`0xxx` other than `0000`): returned only for an
 *   operation that defines such statuses; for any other it is an
 *   `LinePayApiError` with `unknown`, because it may mean anything
 */
export function interpretResponse(
  response: TransportResponse,
  options: { statusCodes?: boolean } = {}
): {
  body: LinePayApiBody
  httpStatus: number
} {
  const { status, text } = response
  const parsed = tryParse(text)

  if (status < 200 || status > 299) {
    // LINE Pay says what failed even with a status that is not 200. Keep the
    // return code: a duplicate must still lead to a lookup.
    if (
      parsed.ok &&
      isEnvelope(parsed.value) &&
      parsed.value.returnCode !== SUCCESS_RETURN_CODE &&
      !isStatusReturnCode(parsed.value.returnCode)
    ) {
      const body: LinePayApiBody = {
        ...parsed.value,
        returnMessage: parsed.value.returnMessage ?? ''
      }
      const category = classifyReturnCode(body.returnCode)
      throw new LinePayApiError({
        body,
        httpStatus: status,
        category,
        outcome: 'unknown'
      })
    }
    throw new LinePayHttpError({
      httpStatus: status,
      reason: 'http-status',
      outcome: 'unknown',
      body: parsed.ok ? parsed.value : undefined,
      bodyText: truncate(text)
    })
  }

  if (!parsed.ok || !isEnvelope(parsed.value)) {
    throw new LinePayHttpError({
      httpStatus: status,
      reason: 'invalid-response',
      outcome: 'unknown',
      body: parsed.ok ? parsed.value : undefined,
      bodyText: truncate(text)
    })
  }

  const body: LinePayApiBody = {
    ...parsed.value,
    returnMessage: parsed.value.returnMessage ?? ''
  }

  if (body.returnCode === SUCCESS_RETURN_CODE) {
    return { body, httpStatus: status }
  }
  if (isStatusReturnCode(body.returnCode)) {
    if (options.statusCodes === true) return { body, httpStatus: status }
    // A status the operation does not define. LINE Pay answered, but it did not
    // say what became of the call, so it is not a success and not a refusal.
    throw new LinePayApiError({
      body,
      httpStatus: status,
      category: 'unclassified',
      outcome: 'unknown'
    })
  }
  throw new LinePayApiError({ body, httpStatus: status })
}
