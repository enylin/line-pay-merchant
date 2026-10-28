import { getEventListeners } from 'node:events'

import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isLinePayAbortError,
  isLinePayNetworkError,
  isLinePayTimeoutError
} from '../errors'
import { at } from '../test/at'
import { failure } from '../test/helpers'
import { closedPort, closeServers, startServer } from '../test/server'
import { type FetchImpl, MAX_RESPONSE_BYTES, sendRequest } from './transport'

const baseRequest = {
  method: 'POST',
  url: 'https://sandbox-api-pay.line.me/v4/payments/request',
  headers: { 'X-LINE-ChannelId': '1' },
  body: '{"a":1}',
  timeoutMs: 1000
} as const

const okFetch = (status = 200, text = '{}') =>
  vi.fn<FetchImpl>(() => Promise.resolve(new Response(text, { status })))

/** A response with no stream for a body, such as the `fetch` of a library may return. */
function withoutStream(
  response: Response,
  text?: () => Promise<string>
): Response {
  Object.defineProperty(response, 'body', { value: undefined })
  if (text !== undefined)
    Object.defineProperty(response, 'text', { value: text })
  return response
}

/** What Node.js throws when `fetch` cannot complete: TypeError + the real cause. */
function fetchFailed(cause: unknown): TypeError {
  return Object.assign(new TypeError('fetch failed'), { cause })
}
const withCode = (code: string, syscall?: string, message = code) =>
  Object.assign(new Error(message), {
    code,
    ...(syscall === undefined ? {} : { syscall })
  })
/** A connection that could not be made, as Node.js reports it. */
const refused = (code = 'ECONNREFUSED') =>
  withCode(
    code,
    code === 'ENOTFOUND' || code === 'EAI_AGAIN' ? 'getaddrinfo' : 'connect'
  )

describe('sendRequest with an injected fetch', () => {
  it('passes the request on, never following redirects', async () => {
    const fetch = okFetch(200, '{"returnCode":"0000"}')
    const result = await sendRequest({ ...baseRequest, fetch })

    expect(result).toEqual({ status: 200, text: '{"returnCode":"0000"}' })
    expect(fetch).toHaveBeenCalledTimes(1)
    const [url, init] = at(fetch.mock.calls, 0)
    expect(url).toBe(baseRequest.url)
    expect(init).toMatchObject({
      method: 'POST',
      headers: baseRequest.headers,
      body: '{"a":1}',
      redirect: 'error'
    })
    expect(init?.signal).toBeInstanceOf(AbortSignal)
  })

  it('sends no body for GET', async () => {
    const fetch = okFetch()
    const { body: _body, ...rest } = baseRequest
    await sendRequest({ ...rest, method: 'GET', fetch })
    expect(at(fetch.mock.calls, 0)[1]).not.toHaveProperty('body')
  })

  it('calls fetch on its own, not as a method of the request', async () => {
    // The global fetch of a browser or a Worker throws "Illegal invocation"
    // when it is called with any other `this`.
    const fetch = okFetch()

    await sendRequest({ ...baseRequest, fetch })

    expect(fetch.mock.contexts[0]).toBeUndefined()
  })

  it('returns non-2xx responses to the caller instead of throwing', async () => {
    const result = await sendRequest({
      ...baseRequest,
      fetch: okFetch(502, '<html>Bad Gateway</html>')
    })
    expect(result).toEqual({ status: 502, text: '<html>Bad Gateway</html>' })
  })
})

describe('sendRequest: the size of the response', () => {
  const pause = () => new Promise<void>(resolve => setTimeout(resolve, 10))
  const chunked = (chunks: number, size: number) =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull(controller) {
          if (chunks-- > 0) controller.enqueue(new Uint8Array(size).fill(0x61))
          else controller.close()
        }
      }),
      { status: 200 }
    )

  it('reads a response up to the limit', async () => {
    const result = await sendRequest({
      ...baseRequest,
      fetch: () => Promise.resolve(chunked(8, 1024 * 1024))
    })
    expect(result.text).toHaveLength(MAX_RESPONSE_BYTES)
  })

  it('stops at the first byte past the limit', async () => {
    let pulled = 0
    let cancelled = false
    const fetch: FetchImpl = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            pull(controller) {
              pulled++
              controller.enqueue(new Uint8Array(1024 * 1024).fill(0x61))
            },
            async cancel() {
              await pause()
              cancelled = true
            }
          })
        )
      )

    const error = await failure(sendRequest({ ...baseRequest, fetch }))
    expect(cancelled).toBe(true)

    expect(error).toMatchObject({
      code: 'LINE_PAY_HTTP_ERROR',
      reason: 'body-too-large',
      httpStatus: 200,
      // The request was sent, and nothing can be said about what became of it.
      outcome: 'unknown'
    })
    // 8 MiB are allowed, the ninth megabyte is the one that tips it. A stream that
    // never ends was not read further.
    expect(pulled).toBeLessThanOrEqual(11)
  })

  it('refuses at once a body that says it is too long', async () => {
    let pulled = 0
    let cancelled = false
    const fetch: FetchImpl = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            pull() {
              pulled++
            },
            // It takes a moment, and the error waits for it.
            async cancel() {
              await pause()
              cancelled = true
            }
          }),
          { headers: { 'content-length': String(MAX_RESPONSE_BYTES + 1) } }
        )
      )

    const error = await failure(sendRequest({ ...baseRequest, fetch }))

    expect(error).toMatchObject({ reason: 'body-too-large' })
    // The stream fills its queue once when it is made; nothing was read after
    // that, and it was told to stop.
    expect(pulled).toBeLessThanOrEqual(1)
    expect(cancelled).toBe(true)
  })

  it('refuses a body that is not made of bytes, and stops reading it', async () => {
    let cancelled = false
    const chunks = new ReadableStream<string>({
      start(controller) {
        controller.enqueue('text, not bytes')
      },
      async cancel() {
        await pause()
        cancelled = true
      }
    })
    const response = new Response('unused')
    Object.defineProperty(response, 'body', { value: chunks })

    const error = await failure(
      sendRequest({ ...baseRequest, fetch: () => Promise.resolve(response) })
    )

    expect(error).toMatchObject({
      code: 'LINE_PAY_HTTP_ERROR',
      reason: 'invalid-response',
      httpStatus: 200,
      outcome: 'unknown'
    })
    expect(cancelled).toBe(true)
  })

  it('takes a body that is as long as the limit, and says so', async () => {
    const response = new Response('{"a":1}', {
      headers: { 'content-length': String(MAX_RESPONSE_BYTES) }
    })
    expect(
      await sendRequest({
        ...baseRequest,
        fetch: () => Promise.resolve(response)
      })
    ).toEqual({ status: 200, text: '{"a":1}' })
  })

  it('reads a response that has a body and no headers', async () => {
    const response = new Response('{"a":1}')
    Object.defineProperty(response, 'headers', { value: undefined })

    expect(
      await sendRequest({
        ...baseRequest,
        fetch: () => Promise.resolve(response)
      })
    ).toEqual({ status: 200, text: '{"a":1}' })
  })

  it('reads text from a response that is not a stream', async () => {
    const fetch: FetchImpl = () =>
      Promise.resolve(withoutStream(new Response('{"a":1}')))
    expect(await sendRequest({ ...baseRequest, fetch })).toEqual({
      status: 200,
      text: '{"a":1}'
    })
  })

  it('reads an empty body and a multi-byte character split across chunks', async () => {
    const empty = await sendRequest({
      ...baseRequest,
      fetch: () => Promise.resolve(new Response(null, { status: 204 }))
    })
    expect(empty).toEqual({ status: 204, text: '' })

    const bytes = new TextEncoder().encode('珍珠奶茶🧋')
    const split = await sendRequest({
      ...baseRequest,
      fetch: () =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(bytes.slice(0, 4))
                controller.enqueue(bytes.slice(4, 13))
                controller.enqueue(bytes.slice(13))
                controller.close()
              }
            })
          )
        )
    })
    expect(split.text).toBe('珍珠奶茶🧋')
  })
})

describe('sendRequest: what it leaves behind', () => {
  const hanging: FetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })

  it('leaves no listener on a signal that lives on, whatever the calls did', async () => {
    const forever = new AbortController()
    const calls: Promise<unknown>[] = []
    for (let i = 0; i < 25; i++) {
      calls.push(
        sendRequest({
          ...baseRequest,
          fetch: okFetch(),
          signal: forever.signal
        })
      )
      calls.push(
        sendRequest({
          ...baseRequest,
          fetch: () => Promise.reject(new Error('boom')),
          signal: forever.signal
        }).catch(() => undefined)
      )
      calls.push(
        sendRequest({
          ...baseRequest,
          timeoutMs: 1,
          fetch: hanging,
          signal: forever.signal
        }).catch(() => undefined)
      )
    }
    await Promise.all(calls)

    expect(getEventListeners(forever.signal, 'abort')).toHaveLength(0)
  })

  it('stops the timer when the call is over', async () => {
    vi.useFakeTimers()
    try {
      await sendRequest({ ...baseRequest, fetch: okFetch() })
      expect(vi.getTimerCount()).toBe(0)

      await sendRequest({
        ...baseRequest,
        fetch: () => Promise.reject(new Error('boom'))
      }).catch(() => undefined)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
    }
  })

  it('aborts the request with a timeout reason when the time is up', async () => {
    let reason: unknown
    const fetch: FetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reason = init.signal?.reason
          reject(reason)
        })
      })
    await failure(sendRequest({ ...baseRequest, timeoutMs: 10, fetch }))
    expect(reason).toMatchObject({ name: 'TimeoutError' })
  })

  it('passes the reason of the caller to the request when the caller aborts', async () => {
    let reason: unknown
    const fetch: FetchImpl = (_url, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reason = init.signal?.reason
          reject(reason)
        })
      })
    const controller = new AbortController()
    const pending = failure(
      sendRequest({ ...baseRequest, fetch, signal: controller.signal })
    )
    controller.abort('the user left')
    await pending
    expect(reason).toBe('the user left')
  })
})

describe('sendRequest: the timer', () => {
  const real = { set: globalThis.setTimeout, clear: globalThis.clearTimeout }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not let its timer keep the process alive', async () => {
    const unref = vi.fn()
    vi.stubGlobal('setTimeout', (callback: () => void, ms?: number) => {
      const handle = real.set(callback, ms)
      Object.defineProperty(handle, 'unref', { value: unref })
      return handle
    })

    await sendRequest({ ...baseRequest, fetch: okFetch() })

    expect(unref).toHaveBeenCalledTimes(1)
  })

  // In a browser or a Worker a timer is a number, and an object where unref is
  // not a method has none: the call must not need it.
  it.each([
    [
      'a number',
      (handle: unknown) => Number(Reflect.get(Object(handle), 'id'))
    ],
    ['an object without unref', (handle: unknown) => ({ handle })]
  ])('works where a timer is %s', async (_name, wrap) => {
    const started = new Map<unknown, ReturnType<typeof setTimeout>>()
    let ids = 0
    vi.stubGlobal('setTimeout', (callback: () => void, ms?: number) => {
      const handle = real.set(callback, ms)
      Object.defineProperty(handle, 'id', { value: ++ids })
      const timer = wrap(handle)
      started.set(timer, handle)
      return timer
    })
    vi.stubGlobal('clearTimeout', (timer: unknown) => {
      const handle = started.get(timer)
      if (handle !== undefined) real.clear(handle)
      started.delete(timer)
    })

    const result = await sendRequest({
      ...baseRequest,
      fetch: okFetch(200, '{"a":1}')
    })

    expect(result).toEqual({ status: 200, text: '{"a":1}' })
    // The timer was cleared: nothing is left that could abort a later call.
    expect(started.size).toBe(0)
  })
})

describe('sendRequest: timeouts and cancellation', () => {
  /** A fetch that only ends when its signal is aborted. */
  const hangingFetch: FetchImpl = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
    })

  it('reports a timeout with an unknown outcome', async () => {
    const error = await failure(
      sendRequest({ ...baseRequest, timeoutMs: 20, fetch: hangingFetch })
    )
    expect(isLinePayTimeoutError(error)).toBe(true)
    expect(error).toMatchObject({ outcome: 'unknown', timeoutMs: 20 })
  })

  it('keeps what the fetch failed with as the cause of a timeout, like any other failure', async () => {
    const error = await failure(
      sendRequest({ ...baseRequest, timeoutMs: 20, fetch: hangingFetch })
    )
    expect(error.cause).toMatchObject({ name: 'TimeoutError' })
    expect(error.toJSON().cause).toBe('The operation timed out.')
  })

  it('does not even call fetch when the signal is already aborted', async () => {
    const fetch = okFetch()
    const controller = new AbortController()
    controller.abort('stop')
    const error = await failure(
      sendRequest({ ...baseRequest, fetch, signal: controller.signal })
    )
    expect(isLinePayAbortError(error)).toBe(true)
    expect(error.outcome).toBe('not-sent')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('reports a caller abort during the request as unknown', async () => {
    const controller = new AbortController()
    const pending = failure(
      sendRequest({
        ...baseRequest,
        fetch: hangingFetch,
        signal: controller.signal
      })
    )
    controller.abort('user went away')
    const error = await pending
    expect(isLinePayAbortError(error)).toBe(true)
    expect(error).toMatchObject({
      outcome: 'unknown',
      abortReason: 'user went away'
    })
  })

  it('keeps the time limit when the caller passes a signal of its own', async () => {
    // A signal that never fires must not take the time limit away.
    const error = await failure(
      sendRequest({
        ...baseRequest,
        timeoutMs: 20,
        fetch: hangingFetch,
        signal: new AbortController().signal
      })
    )
    expect(isLinePayTimeoutError(error)).toBe(true)
    expect(error.outcome).toBe('unknown')
  })

  it('prefers the caller abort over the timeout', async () => {
    const controller = new AbortController()
    const pending = failure(
      sendRequest({
        ...baseRequest,
        timeoutMs: 5,
        fetch: (_url, init) =>
          new Promise((_resolve, reject) => {
            setTimeout(() => {
              controller.abort('caller')
              reject(init?.signal?.reason)
            }, 30)
          }),
        signal: controller.signal
      })
    )
    expect(isLinePayAbortError(await pending)).toBe(true)
  })
})

describe('sendRequest: failure classification', () => {
  const classify = (thrown: unknown) =>
    failure(
      sendRequest({
        ...baseRequest,
        fetch: () => Promise.reject(thrown)
      })
    )

  it.each([
    ['ECONNREFUSED', 'connection-refused'],
    ['ENOTFOUND', 'dns'],
    ['EAI_AGAIN', 'dns'],
    ['ENETUNREACH', 'network-unreachable'],
    ['EHOSTUNREACH', 'network-unreachable']
  ])('%s means the request was never sent', async (code, reason) => {
    const error = await classify(fetchFailed(refused(code)))
    expect(isLinePayNetworkError(error)).toBe(true)
    expect(error).toMatchObject({
      outcome: 'not-sent',
      reason,
      causeCode: code
    })
  })

  it('reads the attempts of an AggregateError, not the code it carries itself', async () => {
    // Node.js gives the aggregate the code of its FIRST attempt. Here the second
    // address connected and the connection was reset after the request went out.
    const firstRefusedThenReset = fetchFailed(
      Object.assign(new AggregateError([]), {
        code: 'ECONNREFUSED',
        errors: [refused(), withCode('ECONNRESET', 'read')]
      })
    )
    expect(await classify(firstRefusedThenReset)).toMatchObject({
      outcome: 'unknown'
    })
  })

  it('does not leave an attempt without a code out of the count', async () => {
    // One address was refused; the other failed in a way that says nothing.
    const oneUnknown = fetchFailed(
      Object.assign(new AggregateError([]), {
        errors: [refused(), new Error('socket hang up')]
      })
    )
    expect(await classify(oneUnknown)).toMatchObject({ outcome: 'unknown' })

    const none = fetchFailed(
      Object.assign(new AggregateError([]), { errors: [] })
    )
    expect(await classify(none)).toMatchObject({ outcome: 'unknown' })

    // An attempt that is no object at all counts as one that says nothing.
    for (const nothing of [null, undefined, 'refused', 7]) {
      const withNothing = fetchFailed(
        Object.assign(new AggregateError([]), {
          errors: [refused(), nothing]
        })
      )
      expect(await classify(withNothing), String(nothing)).toMatchObject({
        outcome: 'unknown'
      })
    }
  })

  it('treats an AggregateError as not sent only if every attempt never connected', async () => {
    const allRefused = fetchFailed(
      Object.assign(new AggregateError([]), {
        errors: [refused(), refused()]
      })
    )
    expect(await classify(allRefused)).toMatchObject({ outcome: 'not-sent' })

    const mixed = fetchFailed(
      Object.assign(new AggregateError([]), {
        errors: [refused(), withCode('ETIMEDOUT', 'connect')]
      })
    )
    expect(await classify(mixed)).toMatchObject({ outcome: 'unknown' })
  })

  it.each([
    [
      'UND_ERR_SOCKET',
      fetchFailed(withCode('UND_ERR_SOCKET', undefined, 'other side closed'))
    ],
    ['ECONNRESET', fetchFailed(withCode('ECONNRESET', 'read'))],
    [
      'terminated',
      Object.assign(new TypeError('terminated'), { cause: new Error('x') })
    ]
  ])('%s may have been processed', async (_name, thrown) => {
    expect(await classify(thrown)).toMatchObject({
      outcome: 'unknown',
      reason: 'connection-reset'
    })
  })

  // A refused connection shows the request never left only while the
  // connection is being made. The kernel reports the same codes for a connection
  // that exists, when an ICMP error finally declares it dead (`read ECONNREFUSED`):
  // by then the request is out and may be processed.
  it.each([
    ['ECONNREFUSED', 'read'],
    ['ECONNREFUSED', 'write'],
    ['EHOSTUNREACH', 'read'],
    ['ENETUNREACH', 'write'],
    ['ECONNREFUSED', undefined]
  ])(
    'does not take %s from a %s for a request that never left',
    async (code, syscall) => {
      const error = await classify(fetchFailed(withCode(code, syscall)))
      expect(error).toMatchObject({ outcome: 'unknown', causeCode: code })
      if (!isLinePayNetworkError(error)) throw error
      expect(['connection-reset', 'other']).toContain(error.reason)
    }
  )

  it('knows a connection that was torn down from one that was never made', async () => {
    expect(
      await classify(fetchFailed(withCode('ECONNREFUSED', 'read')))
    ).toMatchObject({ reason: 'connection-reset' })
  })

  it('takes a port that fetch refuses to use for a request that never left', async () => {
    const error = await classify(fetchFailed(new Error('bad port')))
    expect(error).toMatchObject({ outcome: 'not-sent', reason: 'other' })
  })

  it('does not find an error code in the prototype of the table of codes', async () => {
    // A code that reads like a property every object has (`constructor`,
    // `toString`) is not one of the codes of a connection that could not be made:
    // the request would be taken for one that never left, and sent again.
    for (const code of [
      'constructor',
      'toString',
      'hasOwnProperty',
      'valueOf',
      '__proto__'
    ]) {
      expect(
        await classify(fetchFailed(withCode(code, 'connect'))),
        code
      ).toMatchObject({ outcome: 'unknown', reason: 'other' })
    }
  })

  it('recognises a blocked redirect', async () => {
    const error = await classify(fetchFailed(new Error('unexpected redirect')))
    expect(error).toMatchObject({ outcome: 'unknown', reason: 'redirect' })
  })

  it('stays conservative about anything it does not recognise', async () => {
    for (const thrown of [
      new Error('boom'),
      fetchFailed(withCode('CERT_HAS_EXPIRED', 'connect')),
      fetchFailed(undefined),
      'a string was thrown',
      // A `fetch` of one's own may reject with anything, nothing included.
      undefined,
      null,
      // Only the TypeError of the engine says that a connection was cut.
      new Error('terminated'),
      // A cause that says nothing readable: a string, a number, a list.
      fetchFailed('ECONNREFUSED'),
      fetchFailed(111),
      fetchFailed([withCode('ECONNREFUSED', 'connect')]),
      fetchFailed({ errors: 'not a list' })
    ]) {
      expect(await classify(thrown)).toMatchObject({
        code: 'LINE_PAY_NETWORK_ERROR',
        outcome: 'unknown',
        reason: 'other'
      })
    }
  })

  it('does not take a code that is not text for the code of the error', async () => {
    const error = await classify(fetchFailed({ code: 42, syscall: 7 }))

    expect(error).toMatchObject({ outcome: 'unknown', reason: 'other' })
    if (!isLinePayNetworkError(error)) throw error
    expect(error.causeCode).toBeUndefined()
  })

  it('keeps the original error as the cause', async () => {
    const original = fetchFailed(refused())
    expect((await classify(original)).cause).toBe(original)
  })

  // Once the response has begun to arrive the request is out, whatever the error
  // says: this is the failure the kernel reports as ECONNREFUSED on a connection
  // that is dead, and a refund must not be sent again because of it.
  it.each(['ECONNREFUSED', 'EHOSTUNREACH', 'ENETUNREACH', 'ENOTFOUND'])(
    'never calls %s while the body is read a request that never left',
    async code => {
      const fetch: FetchImpl = () =>
        Promise.resolve(
          new Response(
            new ReadableStream<Uint8Array>({
              start(controller) {
                controller.enqueue(new TextEncoder().encode('{"returnCo'))
              },
              pull() {
                throw fetchFailed(refused(code))
              }
            }),
            { status: 200 }
          )
        )

      const error = await failure(sendRequest({ ...baseRequest, fetch }))

      expect(error).toMatchObject({
        code: 'LINE_PAY_NETWORK_ERROR',
        outcome: 'unknown',
        reason: 'connection-reset'
      })
    }
  )

  it('takes any failure while the body is read for a connection that was cut', async () => {
    const fetch: FetchImpl = () =>
      Promise.resolve(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('{"returnCo'))
            },
            pull() {
              throw new Error('something nobody has seen')
            }
          })
        )
      )

    const error = await failure(sendRequest({ ...baseRequest, fetch }))

    expect(error).toMatchObject({
      code: 'LINE_PAY_NETWORK_ERROR',
      outcome: 'unknown',
      reason: 'connection-reset'
    })
  })

  it('classifies a failure while reading the body too', async () => {
    const fetch: FetchImpl = () =>
      Promise.resolve(
        withoutStream(new Response('x'), () =>
          Promise.reject(new TypeError('terminated'))
        )
      )
    const error = await failure(sendRequest({ ...baseRequest, fetch }))
    expect(error).toMatchObject({
      outcome: 'unknown',
      reason: 'connection-reset'
    })
  })
})

describe('sendRequest against a real HTTP server', () => {
  afterEach(closeServers)

  const request = (url: string, extra: Record<string, unknown> = {}) =>
    sendRequest({
      ...baseRequest,
      url,
      fetch: (input, init) => fetch(input, init),
      ...extra
    })

  it('delivers method, headers and body, and returns status and text', async () => {
    const seen: Record<string, unknown> = {}
    const { url } = await startServer((req, res) => {
      let body = ''
      req.on('data', (chunk: unknown) => (body += String(chunk)))
      req.on('end', () => {
        Object.assign(seen, {
          method: req.method,
          channelId: req.headers['x-line-channelid'],
          body
        })
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end('{"returnCode":"0000","returnMessage":"ok"}')
      })
    })

    const result = await request(`${url}/v4/payments/request`)
    expect(result.status).toBe(200)
    expect(JSON.parse(result.text)).toEqual({
      returnCode: '0000',
      returnMessage: 'ok'
    })
    expect(seen).toEqual({ method: 'POST', channelId: '1', body: '{"a":1}' })
  })

  it('times out when the server answers too late', async () => {
    const { url } = await startServer((_req, res) => {
      setTimeout(() => res.end('{}'), 1500)
    })
    const started = Date.now()
    const error = await failure(request(url, { timeoutMs: 100 }))
    expect(isLinePayTimeoutError(error)).toBe(true)
    expect(Date.now() - started).toBeLessThan(1500)
  })

  it('recognises a refused connection as not sent', async () => {
    const closed = await closedPort()
    const error = await failure(request(`http://127.0.0.1:${closed}/x`))
    expect(error).toMatchObject({
      code: 'LINE_PAY_NETWORK_ERROR',
      outcome: 'not-sent',
      reason: 'connection-refused'
    })
  })

  it('does not forward the signature header when a server redirects', async () => {
    const forwarded: unknown[] = []
    const target = await startServer((req, res) => {
      forwarded.push(req.headers['x-line-authorization'])
      res.end('{}')
    })
    const origin = await startServer((_req, res) => {
      res.writeHead(302, {
        location: `http://localhost:${target.port}/stolen`
      })
      res.end()
    })

    const error = await failure(
      request(origin.url, {
        headers: { 'X-LINE-Authorization': 'SIGNATURE' }
      })
    )
    expect(error).toMatchObject({ outcome: 'unknown', reason: 'redirect' })
    expect(forwarded).toEqual([])
  })

  it('reports a connection that is cut after the request was sent', async () => {
    const { url } = await startServer((req, _res) => {
      req.resume()
      req.on('end', () => req.socket.destroy())
    })
    const error = await failure(request(url))
    expect(error).toMatchObject({
      code: 'LINE_PAY_NETWORK_ERROR',
      outcome: 'unknown',
      reason: 'connection-reset'
    })
  })

  it('reports a response that dies half way', async () => {
    const { url } = await startServer((_req, res) => {
      res.writeHead(200, { 'content-length': '100' })
      res.write('{"returnCode"')
      setTimeout(() => res.socket?.destroy(), 20)
    })
    const error = await failure(request(url))
    expect(error).toMatchObject({
      outcome: 'unknown',
      reason: 'connection-reset'
    })
  })
})
