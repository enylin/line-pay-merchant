import {
  isLinePayError,
  LinePayAbortError,
  type LinePayError,
  LinePayHttpError,
  LinePayNetworkError,
  LinePayTimeoutError,
  type NetworkErrorReason
} from '../errors'
import { isArray, isRecord } from './guard'

export type FetchImpl = typeof fetch

export interface TransportRequest {
  readonly fetch: FetchImpl
  readonly method: 'GET' | 'POST'
  readonly url: string
  readonly headers: Record<string, string>
  readonly body?: string | undefined
  readonly timeoutMs: number
  readonly signal?: AbortSignal | undefined
}

export interface TransportResponse {
  readonly status: number
  readonly text: string
}

/**
 * More than any answer of LINE Pay: a page of 100 transactions is a few hundred
 * kilobytes. A response that goes on longer is not read to the end.
 */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024

/**
 * Error codes of a connection that could not be made. Nothing was sent when one of
 * these shows up while connecting, so the request can safely be tried again.
 *
 * A `Map`, not an object: an error whose code reads `constructor` or `toString`
 * must not be found in the table through the prototype of an object, because
 * what is found here is taken for "never sent" and sent again.
 */
const NOT_SENT_CODES: ReadonlyMap<string, NetworkErrorReason> = new Map([
  ['ECONNREFUSED', 'connection-refused'],
  ['ENOTFOUND', 'dns'],
  ['EAI_AGAIN', 'dns'],
  ['ENETUNREACH', 'network-unreachable'],
  ['EHOSTUNREACH', 'network-unreachable']
])

/**
 * Where the failing system call was made. The same codes come from a connection
 * that already exists: the kernel reports an ICMP error on it when it finally
 * declares the connection dead, as `read ECONNREFUSED`. By then the request is
 * out, so only a failure of `connect` or of the lookup of the name shows that
 * nothing was sent.
 */
const CONNECTING_SYSCALLS: ReadonlySet<string> = new Set([
  'connect',
  'getaddrinfo'
])

/** What one attempt to connect left behind. */
interface Attempt {
  readonly code: string | undefined
  readonly syscall: string | undefined
  readonly message: string | undefined
}

function readAttempt(value: unknown): Attempt {
  if (!isRecord(value)) {
    return { code: undefined, syscall: undefined, message: undefined }
  }
  const { code, syscall, message } = value
  return {
    code: typeof code === 'string' ? code : undefined,
    syscall: typeof syscall === 'string' ? syscall : undefined,
    message: typeof message === 'string' ? message : undefined
  }
}

/** What an error says caused it, if it says anything. */
function causeOf(error: unknown): unknown {
  return isRecord(error) ? error.cause : undefined
}

/**
 * The attempts behind a failure. Node.js reports `fetch` failures as
 * `TypeError: fetch failed` with the real error in `cause`. When several
 * addresses were tried, the cause is an `AggregateError`: its own `code` is only
 * that of the first attempt, so the attempts are read one by one, and one that
 * says nothing counts as something unknown rather than being left out.
 */
function findAttempts(error: unknown): Attempt[] {
  const cause = causeOf(error)
  if (cause === undefined || cause === null) return []
  const nested = isRecord(cause) ? cause.errors : undefined
  return isArray(nested) ? nested.map(readAttempt) : [readAttempt(cause)]
}

function neverConnected(attempt: Attempt): boolean {
  if (attempt.message === 'bad port') {
    // `fetch` refuses some ports before it connects to anything.
    return true
  }
  return (
    attempt.code !== undefined &&
    NOT_SENT_CODES.has(attempt.code) &&
    attempt.syscall !== undefined &&
    CONNECTING_SYSCALLS.has(attempt.syscall)
  )
}

function causeMessage(error: unknown): string {
  const cause = causeOf(error)
  return cause instanceof Error ? cause.message : ''
}

export function classifyFetchError(
  error: unknown,
  context: {
    readonly timeoutMs: number
    readonly timedOut: boolean
    readonly userSignal?: AbortSignal | undefined
    /** The response had begun to arrive: the request was out. */
    readonly afterResponse?: boolean
  }
): LinePayError {
  // The caller's own cancellation wins over the timeout.
  if (context.userSignal?.aborted === true) {
    return new LinePayAbortError({
      abortReason: context.userSignal.reason,
      outcome: 'unknown'
    })
  }
  // The timer covers the whole exchange and cannot tell the connection phase
  // from the read phase, so the outcome is `unknown`.
  if (context.timedOut) {
    return new LinePayTimeoutError({
      timeoutMs: context.timeoutMs,
      cause: error
    })
  }

  const attempts = findAttempts(error)
  const [first] = attempts
  if (
    context.afterResponse !== true &&
    attempts.length > 0 &&
    attempts.every(neverConnected)
  ) {
    return new LinePayNetworkError({
      reason: NOT_SENT_CODES.get(first?.code ?? '') ?? 'other',
      causeCode: first?.code,
      outcome: 'not-sent',
      cause: error
    })
  }

  let reason: NetworkErrorReason = 'other'
  if (
    context.afterResponse === true ||
    attempts.some(
      attempt =>
        attempt.code === 'UND_ERR_SOCKET' ||
        attempt.code === 'ECONNRESET' ||
        // Refused or unreachable, but not while connecting: a connection that
        // existed was torn down.
        (attempt.code !== undefined && NOT_SENT_CODES.has(attempt.code))
    )
  ) {
    reason = 'connection-reset'
  } else if (/redirect/i.test(causeMessage(error))) {
    reason = 'redirect'
  } else if (error instanceof TypeError && error.message === 'terminated') {
    reason = 'connection-reset'
  }
  return new LinePayNetworkError({
    reason,
    causeCode: first?.code,
    // Anything that is not provably "never connected" may have been processed.
    outcome: 'unknown',
    cause: error
  })
}

/**
 * The text of the response, read in pieces so that a response without an end does
 * not fill the memory. Past the limit it stops reading.
 */
async function readText(response: Response): Promise<string> {
  // A `fetch` of one's own may answer with a body that is no stream.
  const stream: ReadableStream<unknown> | null = response.body
  if (stream === null || typeof stream?.getReader !== 'function') {
    return response.text()
  }

  const tooLarge = () =>
    new LinePayHttpError({
      httpStatus: response.status,
      reason: 'body-too-large',
      outcome: 'unknown'
    })
  const declared = Number(response.headers?.get('content-length'))
  const reader: ReadableStreamDefaultReader<unknown> = stream.getReader()
  if (declared > MAX_RESPONSE_BYTES) {
    await reader.cancel().catch(() => undefined)
    throw tooLarge()
  }

  const chunks: Uint8Array[] = []
  let size = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    if (!(value instanceof Uint8Array)) {
      await reader.cancel().catch(() => undefined)
      throw new LinePayHttpError({
        httpStatus: response.status,
        reason: 'invalid-response',
        outcome: 'unknown'
      })
    }
    size += value.byteLength
    if (size > MAX_RESPONSE_BYTES) {
      await reader.cancel().catch(() => undefined)
      throw tooLarge()
    }
    chunks.push(value)
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(bytes)
}

/**
 * Send one HTTP request. Redirects are never followed: `fetch` would forward the
 * custom `X-LINE-Authorization` header to another origin, and the LINE Pay API
 * does not redirect.
 */
export async function sendRequest(
  request: TransportRequest
): Promise<TransportResponse> {
  const { signal: userSignal, timeoutMs } = request

  if (userSignal?.aborted === true) {
    throw new LinePayAbortError({
      abortReason: userSignal.reason,
      outcome: 'not-sent'
    })
  }

  // One controller ends the exchange, whether the time is up or the caller gives
  // up. `AbortSignal.any` would do, but on Node.js 22 it keeps a little memory for
  // every composite made from a signal that lives on, such as one for the whole
  // server.
  const controller = new AbortController()
  let timedOut = false
  const timer = setTimeout(() => {
    timedOut = true
    controller.abort(
      new DOMException('The operation timed out.', 'TimeoutError')
    )
  }, timeoutMs)
  // Like `AbortSignal.timeout`: the timer alone does not keep a process alive.
  if (typeof timer === 'object' && typeof timer.unref === 'function') {
    timer.unref()
  }
  const onAbort = () => controller.abort(userSignal?.reason)
  userSignal?.addEventListener('abort', onAbort, { once: true })

  try {
    const init: RequestInit = {
      method: request.method,
      headers: request.headers,
      signal: controller.signal,
      redirect: 'error'
    }
    if (request.body !== undefined) init.body = request.body

    // Called on its own, not as `request.fetch(...)`: the global `fetch` of a
    // browser or a Worker throws "Illegal invocation" with any other `this`.
    const { fetch: send } = request
    let response: Response
    try {
      response = await send(request.url, init)
    } catch (error) {
      throw classifyFetchError(error, { timeoutMs, timedOut, userSignal })
    }

    // From here on the request is out, whatever the error says.
    try {
      return { status: response.status, text: await readText(response) }
    } catch (error) {
      if (isLinePayError(error)) throw error
      throw classifyFetchError(error, {
        timeoutMs,
        timedOut,
        userSignal,
        afterResponse: true
      })
    }
  } finally {
    clearTimeout(timer)
    userSignal?.removeEventListener('abort', onAbort)
  }
}
