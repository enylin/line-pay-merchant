import { createHmac } from 'node:crypto'

import { expect, vi } from 'vitest'

import { createLinePayClient } from '../client'
import type { AnyCallContext, LinePayClient } from '../client-types'
import { isArray, isRecord } from '../core/guard'
import type { FetchImpl } from '../core/transport'
import { type AnyLinePayError, isLinePayError } from '../errors'
import type {
  OperationInput,
  OperationOutput,
  PaymentDetailsInfo
} from '../operations'
import type { OperationName } from '../operations/names'

export const CHANNEL_ID = '1234567890'
export const SECRET = 'channel-secret-key-for-tests'
export const TX = '2021121300698360310'
export const REG_KEY = 'RK9A2BA1937EQTO'

/** A response whose text is exactly what is passed, so big numbers stay raw. */
export const raw = (text: string, status = 200): Response =>
  new Response(text, { status })

export const json = (body: unknown, status = 200): Response =>
  raw(JSON.stringify(body), status)

export const success = (info: unknown = {}): Response =>
  json({ returnCode: '0000', returnMessage: 'Success.', info })

/** A payment as the payment details API lists it. Override what a test cares about. */
export function paymentInfo(
  overrides: Partial<PaymentDetailsInfo> = {}
): PaymentDetailsInfo {
  return {
    transactionId: TX,
    orderId: 'order-1',
    transactionDate: '2026-10-27T00:00:10Z',
    transactionType: 'PAYMENT',
    payStatus: 'CAPTURE',
    productName: 'Tea',
    merchantName: 'Tea Shop',
    currency: 'TWD',
    payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }],
    packages: [{ id: 'p1', amount: 1000 }],
    ...overrides
  }
}

/** LINE Pay writes its 19-digit IDs as bare numbers, not as strings. */
const withBareIds = (text: string): string =>
  text.replace(
    /("(?:transactionId|refundTransactionId|originalTransactionId)":)"(\d{1,19})"/g,
    '$1$2'
  )

/**
 * A payment details response. The 19-digit IDs are written as bare numbers, as
 * LINE Pay sends them, so a parser that goes through `Number` would corrupt them.
 */
export const detailsResponse = (...info: PaymentDetailsInfo[]): Response =>
  raw(
    withBareIds(
      JSON.stringify({
        returnCode: '0000',
        returnMessage: 'Success.',
        info
      })
    )
  )

/**
 * The smallest body each operation's type allows. The compiler checks that every
 * one of them is a response of its operation.
 */
export const SAMPLES: { [K in OperationName]: OperationOutput<K> } = {
  request: {
    returnCode: '0000',
    returnMessage: 'Success.',
    info: {
      transactionId: TX,
      paymentUrl: { web: 'https://web-pay.line.me/w/payments/wait' },
      paymentAccessToken: '187568751124'
    }
  },
  confirm: {
    returnCode: '0000',
    returnMessage: 'Success.',
    info: {
      orderId: 'order-1',
      transactionId: TX,
      payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }]
    }
  },
  capture: {
    returnCode: '0000',
    returnMessage: 'Success.',
    info: {
      orderId: 'order-1',
      transactionId: TX,
      payInfo: [{ method: 'CREDIT_CARD', amount: 1000 }]
    }
  },
  void: { returnCode: '0000', returnMessage: 'Success.' },
  refund: {
    returnCode: '0000',
    returnMessage: 'Success.',
    info: {
      refundTransactionId: '2021121300698360312',
      refundTransactionDate: '2026-10-27T00:05:00Z'
    }
  },
  paymentDetails: {
    returnCode: '0000',
    returnMessage: 'Success.',
    info: [paymentInfo()]
  },
  checkPaymentStatus: { returnCode: '0000', returnMessage: 'Success.' },
  checkRegKey: { returnCode: '0000', returnMessage: 'Success.' },
  payPreapproved: {
    returnCode: '0000',
    returnMessage: 'Success.',
    info: {
      orderId: 'order-1',
      transactionId: TX,
      transactionDate: '2026-10-27T00:00:10Z'
    }
  },
  expireRegKey: { returnCode: '0000', returnMessage: 'Success.' }
}

/** A valid input for each operation. */
export const INPUTS: { [K in OperationName]: OperationInput<K> } = {
  request: {
    amount: 100,
    currency: 'TWD',
    orderId: 'order-1',
    packages: [
      {
        id: 'p1',
        amount: 100,
        products: [{ name: 'Tea', quantity: 1, price: 100 }]
      }
    ],
    redirectUrls: {
      confirmUrl: 'https://shop.example/confirm',
      cancelUrl: 'https://shop.example/cancel'
    }
  },
  confirm: { transactionId: TX, amount: 1000, currency: 'TWD' },
  capture: { transactionId: TX, amount: 1000, currency: 'TWD' },
  void: { transactionId: TX },
  refund: { transactionId: TX, refundAmount: 20 },
  paymentDetails: { orderId: ['order-1'] },
  checkPaymentStatus: { transactionId: TX },
  checkRegKey: { regKey: REG_KEY },
  payPreapproved: {
    regKey: REG_KEY,
    productName: 'Tea',
    amount: 100,
    currency: 'TWD',
    orderId: 'order-1'
  },
  expireRegKey: { regKey: REG_KEY }
}

/**
 * The call context of an operation, as a middleware receives it, with a valid
 * input. There is no network behind its client.
 */
export function callContext(
  operation: OperationName,
  signal?: AbortSignal
): AnyCallContext {
  const rest = {
    options: signal === undefined ? {} : { signal },
    startedAt: new Date(Date.now() - 100),
    client: createLinePayClient({
      channelId: CHANNEL_ID,
      channelSecretKey: SECRET,
      env: 'sandbox'
    })
  }
  switch (operation) {
    case 'request':
      return { operation, input: INPUTS.request, ...rest }
    case 'confirm':
      return { operation, input: INPUTS.confirm, ...rest }
    case 'capture':
      return { operation, input: INPUTS.capture, ...rest }
    case 'void':
      return { operation, input: INPUTS.void, ...rest }
    case 'refund':
      return { operation, input: INPUTS.refund, ...rest }
    case 'paymentDetails':
      return { operation, input: INPUTS.paymentDetails, ...rest }
    case 'checkPaymentStatus':
      return { operation, input: INPUTS.checkPaymentStatus, ...rest }
    case 'checkRegKey':
      return { operation, input: INPUTS.checkRegKey, ...rest }
    case 'payPreapproved':
      return { operation, input: INPUTS.payPreapproved, ...rest }
    case 'expireRegKey':
      return { operation, input: INPUTS.expireRegKey, ...rest }
  }
}

/** The JSON text that LINE Pay sends when this operation succeeds. */
export const okTextFor = (operation: OperationName): string =>
  withBareIds(JSON.stringify(SAMPLES[operation]))

/** The response that LINE Pay gives when this operation succeeds. */
export const okFor = (operation: OperationName): Response =>
  raw(okTextFor(operation))

/** Which operation a request is for, from its method and path. */
const ROUTES: readonly (readonly [OperationName, string, RegExp])[] = [
  ['request', 'POST', /^\/v4\/payments\/request$/],
  ['confirm', 'POST', /^\/v4\/payments\/[^/]+\/confirm$/],
  ['capture', 'POST', /^\/v4\/payments\/authorizations\/[^/]+\/capture$/],
  ['void', 'POST', /^\/v4\/payments\/authorizations\/[^/]+\/void$/],
  ['refund', 'POST', /^\/v4\/payments\/[^/]+\/refund$/],
  ['paymentDetails', 'GET', /^\/v4\/payments$/],
  ['checkPaymentStatus', 'GET', /^\/v4\/payments\/requests\/[^/]+\/check$/],
  ['checkRegKey', 'GET', /^\/v4\/payments\/preapprovedPay\/[^/]+\/check$/],
  [
    'payPreapproved',
    'POST',
    /^\/v4\/payments\/preapprovedPay\/[^/]+\/payment$/
  ],
  ['expireRegKey', 'POST', /^\/v4\/payments\/preapprovedPay\/[^/]+\/expire$/]
]

export function operationOf(call: {
  url: string
  method: string
}): OperationName {
  const { pathname } = new URL(call.url)
  // A custom `baseUrl` may add a prefix in front of the path LINE Pay knows.
  const path = pathname.slice(Math.max(0, pathname.indexOf('/v4/')))
  for (const [operation, method, pattern] of ROUTES) {
    if (call.method === method && pattern.test(path)) return operation
  }
  throw new Error(`no operation answers ${call.method} ${pathname}`)
}

/** A step that answers every request with the success response of its operation. */
export const ok = (call: { url: string; method: string }): Response =>
  okFor(operationOf(call))

/** The error of the library that a promise rejects with. Anything else is rethrown. */
export async function failure(
  promise: Promise<unknown>
): Promise<AnyLinePayError> {
  try {
    await promise
  } catch (error) {
    if (!isLinePayError(error)) throw error
    return error
  }
  throw new Error('expected the call to fail')
}

/**
 * Make `JSON.parse` behave like an engine that calls the reviver without the
 * third argument, the source text of a number. Undo it with `vi.restoreAllMocks()`.
 */
export function withoutReviverSource(): void {
  const parse = JSON.parse.bind(JSON)
  vi.spyOn(JSON, 'parse').mockImplementation(
    (
      text: string,
      reviver?: (this: unknown, key: string, value: unknown) => unknown
    ): unknown =>
      parse(
        text,
        reviver === undefined
          ? undefined
          : function (this: unknown, key: string, value: unknown) {
              return reviver.call(this, key, value)
            }
      )
  )
}

/** The message of whatever was thrown. */
export const messageOf = (thrown: unknown): string =>
  thrown instanceof Error ? thrown.message : String(thrown)

/**
 * An object with the prototype `proto` (`null` for none) and the own properties
 * `own`. `Object.create` says `any`; this says what it made.
 */
export function inheriting(
  proto: object | null,
  own: Record<string, unknown> = {}
): Record<string, unknown> {
  const made: unknown = Object.create(proto)
  if (!isRecord(made)) throw new Error('Object.create did not make an object')
  return Object.assign(made, own)
}

/** Call `client.with` with arguments the types would refuse. It throws what `with` throws. */
export function withUntyped(client: LinePayClient, ...args: unknown[]): void {
  const method: unknown = Reflect.get(client, 'with')
  if (typeof method !== 'function') throw new Error('with is not a function')
  Reflect.apply(method, client, args)
}

/** Call a function with arguments the types would refuse. */
export function applyUntyped(
  fn: (...args: never[]) => unknown,
  args: readonly unknown[]
): unknown {
  const outcome: unknown = Reflect.apply(fn, undefined, args)
  return outcome
}

/**
 * Call an operation with an input or options the types would refuse: what a
 * caller in plain JavaScript can do, and what the checks are there for.
 */
export function untyped(
  client: LinePayClient,
  operation: OperationName,
  input: unknown,
  options?: unknown
): Promise<unknown> {
  const method: unknown = Reflect.get(client, operation)
  if (typeof method !== 'function') {
    throw new Error(`${operation} is not a method of the client`)
  }
  const outcome: unknown = Reflect.apply(method, client, [input, options])
  return Promise.resolve(outcome)
}

/** The system call that fails with each code, as Node.js reports it. */
const SYSCALLS: Readonly<Record<string, string>> = {
  ENOTFOUND: 'getaddrinfo',
  EAI_AGAIN: 'getaddrinfo',
  ECONNREFUSED: 'connect',
  ENETUNREACH: 'connect',
  EHOSTUNREACH: 'connect'
}

/** The error of one attempt to connect, or of a connection that broke. */
export function connectionError(code: string): Error {
  return Object.assign(new Error(code), {
    code,
    syscall: SYSCALLS[code] ?? 'read'
  })
}

/** What Node.js throws when a connection cannot be made, or breaks. */
export function fetchFailed(code: string): TypeError {
  return Object.assign(new TypeError('fetch failed'), {
    cause: connectionError(code)
  })
}

/** The library sends its headers as a plain object; anything else is a bug. */
function headersOf(headers: RequestInit['headers']): Record<string, string> {
  if (headers === undefined) return {}
  if (headers instanceof Headers || isArray(headers)) {
    throw new Error('the headers were not given as a plain object')
  }
  return Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [
      name,
      typeof value === 'string' ? value : value.join(', ')
    ])
  )
}

export interface RecordedCall {
  url: string
  method: string
  headers: Record<string, string>
  body: string | undefined
  signal: AbortSignal | undefined
}

export type Step =
  Response | Error | ((call: RecordedCall) => Response | Promise<Response>)

/**
 * A fetch that plays back the given steps in order (the last one repeats) and
 * records every call.
 */
export function scriptedFetch(...steps: Step[]) {
  const calls: RecordedCall[] = []
  const fetch = vi.fn<FetchImpl>((input, init) => {
    const call: RecordedCall = {
      url:
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.href
            : input.url,
      method: init?.method ?? 'GET',
      headers: headersOf(init?.headers),
      body: typeof init?.body === 'string' ? init.body : undefined,
      signal: init?.signal ?? undefined
    }
    calls.push(call)
    const step = steps[Math.min(calls.length - 1, steps.length - 1)]
    if (step === undefined) return Promise.resolve(ok(call))
    if (step instanceof Error) return Promise.reject(step)
    if (typeof step === 'function') return Promise.resolve(step(call))
    // A Response body can be read once; hand out a fresh copy every time.
    return Promise.resolve(step.clone())
  })
  return { fetch, calls }
}

/** Recompute the signature with node:crypto and compare it with the header. */
export function expectValidSignature(call: RecordedCall, secret = SECRET) {
  const url = new URL(call.url)
  const payload =
    call.method === 'GET' ? url.search.slice(1) : (call.body ?? '')
  const nonce = call.headers['X-LINE-Authorization-Nonce']
  expect(nonce).toMatch(/^[0-9a-f-]{36}$/)
  const expected = createHmac('sha256', secret)
    .update(secret + url.pathname + payload + nonce)
    .digest('base64')
  expect(call.headers['X-LINE-Authorization']).toBe(expected)
}
