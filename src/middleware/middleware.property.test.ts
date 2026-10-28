import { describe, expect, it } from 'vitest'

import { createLinePayClient } from '../client'
import type { AnyResult, LinePayClient, Middleware } from '../client-types'
import { isArray, isRecord } from '../core/guard'
import {
  isLinePayAbortError,
  isLinePayApiError,
  isLinePayError,
  isLinePayNetworkError,
  LinePayAbortError,
  type LinePayError,
  needsReconcile,
  type Outcome
} from '../errors'
import { operations } from '../operations/index'
import {
  isOperationName,
  isReconcilableOperation,
  OPERATION_NAMES,
  type OperationName
} from '../operations/names'
import { at } from '../test/at'
import {
  CHANNEL_ID,
  connectionError,
  fetchFailed,
  json,
  okFor,
  raw,
  SECRET,
  untyped
} from '../test/helpers'
import { createRandom, digits, type Random, seedOf } from '../test/random'
import { autoReconcile } from './auto-reconcile'
import { retryWhenNotSent } from './retry-when-not-sent'

/**
 * Random sequences of failures, across operations and middleware stacks, on one
 * client at a time. Every attempt that reaches the executor is recorded by a
 * probe placed innermost, every request by the fetch. Three invariants:
 *
 * 1. an operation that is not a read is never sent again after an attempt whose
 *    outcome was anything but a network "not-sent";
 * 2. `meta.attempts` equals the requests of the operation (lookups excluded);
 * 3. the outcome the caller sees is never less conservative than the outcome of
 *    the attempt that ended the call (not-sent < rejected < unknown).
 */

const STEPS = [
  'ok',
  'refused',
  'dns',
  'refused-all',
  'reset',
  'terminated',
  'mixed',
  'http500',
  'http502',
  'html200',
  'status0110',
  'http400',
  'http403',
  'api1106',
  'dup1172',
  'dup1198',
  'abort'
] as const
type Step = (typeof STEPS)[number]

const LOOKUPS = [
  'applied',
  'notfound',
  'authorized',
  'voided',
  'mismatch',
  'refused',
  'reset',
  'http502',
  'nosuch1150'
] as const
type Lookup = (typeof LOOKUPS)[number]

const RANK: Record<Outcome, number> = { 'not-sent': 0, rejected: 1, unknown: 2 }

/** The lookups that show a call took effect (docs: "How each operation is judged"). */
const APPLIED_BY: Partial<Record<OperationName, readonly Lookup[]>> = {
  confirm: ['applied', 'authorized'],
  capture: ['applied'],
  void: ['applied', 'voided'],
  refund: ['applied'],
  payPreapproved: ['applied', 'authorized']
}

const aggregate = (...codes: string[]) =>
  Object.assign(new TypeError('fetch failed'), {
    cause: Object.assign(new AggregateError([]), {
      errors: codes.map(connectionError)
    })
  })

/** What the transport and response classification must make of a step. */
function expectedOutcome(step: Step, operation: OperationName): Outcome | 'ok' {
  switch (step) {
    case 'ok':
      return 'ok'
    case 'refused':
    case 'dns':
    case 'refused-all':
      return 'not-sent'
    case 'status0110':
      return operation === 'checkPaymentStatus' ? 'ok' : 'unknown'
    case 'api1106':
    case 'dup1172':
    case 'dup1198':
      return 'rejected'
    default:
      return 'unknown'
  }
}

interface Entry {
  readonly lookup: boolean
  readonly error?: LinePayError
}

interface Plan {
  readonly index: number
  readonly op: OperationName
  readonly tx: string
  readonly orderId: string
  readonly regKey: string
  readonly refundAmount: number | undefined
  readonly input: unknown
  readonly steps: Step[]
  readonly lookups: Lookup[]
  readonly controller: AbortController | undefined
  readonly abortWhileWaiting: boolean
  usedSteps: Step[]
  lookupFetches: number
  entries: Entry[]
}

type StackKind =
  'none' | 'retry' | 'retry+auto' | 'auto' | 'auto+retry' | 'retry+retry'

interface Stack {
  readonly kind: StackKind
  readonly middleware: Middleware[]
  readonly maxRequests: number
  readonly hasAuto: boolean
  /** Stacks whose meta.attempts the documentation promises to count right. */
  readonly countsAttempts: boolean
}

function inputOf(
  op: OperationName,
  plan: {
    tx: string
    orderId: string
    regKey: string
    refundAmount: number | undefined
  }
): unknown {
  switch (op) {
    case 'request':
      return {
        amount: 100,
        currency: 'TWD',
        orderId: plan.orderId,
        packages: [
          {
            id: 'p1',
            amount: 100,
            products: [{ name: 'Tea', quantity: 1, price: 100 }]
          }
        ],
        redirectUrls: {
          confirmUrl: 'https://shop.example/c',
          cancelUrl: 'https://shop.example/x'
        }
      }
    case 'confirm':
    case 'capture':
      return { transactionId: plan.tx, amount: 100, currency: 'TWD' }
    case 'void':
    case 'checkPaymentStatus':
      return { transactionId: plan.tx }
    case 'refund':
      return plan.refundAmount === undefined
        ? { transactionId: plan.tx }
        : { transactionId: plan.tx, refundAmount: plan.refundAmount }
    case 'paymentDetails':
      return { transactionId: [plan.tx] }
    case 'checkRegKey':
    case 'expireRegKey':
      return { regKey: plan.regKey }
    case 'payPreapproved':
      return {
        regKey: plan.regKey,
        productName: 'Tea',
        amount: 100,
        currency: 'TWD',
        orderId: plan.orderId
      }
  }
}

function payment(plan: Plan, overrides: Record<string, unknown>) {
  return {
    transactionId: plan.tx,
    orderId: plan.orderId,
    transactionDate: new Date(Date.now() + 5000).toISOString(),
    transactionType: 'PAYMENT',
    payStatus: 'CAPTURE',
    productName: 'Tea',
    merchantName: 'Shop',
    currency: 'TWD',
    payInfo: [{ method: 'CREDIT_CARD', amount: 100 }],
    packages: [],
    ...overrides
  }
}

function lookupResponse(plan: Plan, lookup: Lookup): Promise<Response> {
  const details = (...info: unknown[]) =>
    Promise.resolve(json({ returnCode: '0000', returnMessage: 'OK', info }))
  switch (lookup) {
    case 'applied':
      if (plan.op === 'void')
        return details(payment(plan, { payStatus: 'VOIDED_AUTHORIZATION' }))
      if (plan.op === 'refund') {
        return details(
          payment(plan, {
            refundList: [
              {
                refundTransactionId: digits(createRandom(plan.index), 19),
                transactionType:
                  plan.refundAmount === undefined
                    ? 'PAYMENT_REFUND'
                    : 'PARTIAL_REFUND',
                refundAmount: -(plan.refundAmount ?? 100),
                refundTransactionDate: new Date(Date.now() + 5000).toISOString()
              }
            ]
          })
        )
      }
      return details(payment(plan, {}))
    case 'notfound':
      return details()
    case 'authorized':
      return details(payment(plan, { payStatus: 'AUTHORIZATION' }))
    case 'voided':
      return details(payment(plan, { payStatus: 'VOIDED_AUTHORIZATION' }))
    case 'mismatch':
      return details(
        payment(plan, { payInfo: [{ method: 'CREDIT_CARD', amount: 99 }] })
      )
    case 'refused':
      return Promise.reject(fetchFailed('ECONNREFUSED'))
    case 'reset':
      return Promise.reject(fetchFailed('ECONNRESET'))
    case 'http502':
      return Promise.resolve(raw('bad gateway', 502))
    case 'nosuch1150':
      return Promise.resolve(
        json({ returnCode: '1150', returnMessage: 'no such transaction' })
      )
  }
}

function stepResponse(
  plan: Plan,
  step: Step,
  signal: AbortSignal | undefined
): Promise<Response> {
  switch (step) {
    case 'ok':
      return Promise.resolve(okFor(plan.op))
    case 'refused':
      return Promise.reject(fetchFailed('ECONNREFUSED'))
    case 'dns':
      return Promise.reject(fetchFailed('ENOTFOUND'))
    case 'refused-all':
      return Promise.reject(aggregate('ECONNREFUSED', 'EHOSTUNREACH'))
    case 'reset':
      return Promise.reject(fetchFailed('ECONNRESET'))
    case 'terminated':
      return Promise.reject(
        Object.assign(new TypeError('terminated'), {
          cause: new Error('other side closed')
        })
      )
    case 'mixed':
      return Promise.reject(aggregate('ECONNREFUSED', 'ETIMEDOUT'))
    case 'http500':
      return Promise.resolve(raw('<html>500</html>', 500))
    case 'http502':
      return Promise.resolve(raw('bad gateway', 502))
    case 'html200':
      return Promise.resolve(raw('<html>login</html>'))
    case 'status0110':
      return Promise.resolve(
        json({ returnCode: '0110', returnMessage: 'processing' })
      )
    case 'http400':
      return Promise.resolve(raw('{"error":"bad"}', 400))
    case 'http403':
      return Promise.resolve(raw('', 403))
    case 'api1106':
      return Promise.resolve(
        json({ returnCode: '1106', returnMessage: 'header error' })
      )
    case 'dup1172':
      return Promise.resolve(
        json({ returnCode: '1172', returnMessage: 'duplicate' })
      )
    case 'dup1198':
      return Promise.resolve(
        json({ returnCode: '1198', returnMessage: 'in progress' })
      )
    case 'abort':
      plan.controller?.abort('the caller left')
      return Promise.reject(signal?.reason)
  }
}

function makeStack(
  random: Random,
  sleep: (ms: number, signal?: AbortSignal) => Promise<void>
): Stack {
  const retry = (maxAttempts: number) =>
    retryWhenNotSent({
      maxAttempts,
      baseDelayMs: 1,
      maxDelayMs: 1,
      random: () => 0.5,
      sleep
    })
  const k = random.int(1, 4)
  const kind = random.pick<StackKind>([
    'none',
    'retry',
    'retry',
    'retry+auto',
    'retry+auto',
    'retry+auto',
    'auto',
    'auto+retry',
    'retry+retry'
  ])
  switch (kind) {
    case 'none':
      return {
        kind,
        middleware: [],
        maxRequests: 1,
        hasAuto: false,
        countsAttempts: true
      }
    case 'retry':
      return {
        kind,
        middleware: [retry(k)],
        maxRequests: k,
        hasAuto: false,
        countsAttempts: true
      }
    case 'retry+auto':
      return {
        kind,
        middleware: [retry(k), autoReconcile()],
        maxRequests: k,
        hasAuto: true,
        countsAttempts: true
      }
    case 'auto':
      return {
        kind,
        middleware: [autoReconcile()],
        maxRequests: 1,
        hasAuto: true,
        countsAttempts: true
      }
    case 'auto+retry':
      return {
        kind,
        middleware: [autoReconcile(), retry(k)],
        maxRequests: k,
        hasAuto: true,
        countsAttempts: false
      }
    case 'retry+retry': {
      const k2 = random.int(1, 3)
      return {
        kind,
        middleware: [retry(k), retry(k2)],
        maxRequests: k * k2,
        hasAuto: false,
        countsAttempts: false
      }
    }
  }
}

function planOf(random: Random, index: number, used: Set<string>): Plan {
  const unique = (make: () => string) => {
    let value = make()
    while (used.has(value)) value = make()
    used.add(value)
    return value
  }
  const op = random.pick(OPERATION_NAMES)
  const tx = unique(() => `${random.int(1, 9)}${digits(random, 18)}`)
  const orderId = unique(() => `ord${digits(random, 12)}z`)
  const regKey = unique(() => `RK${digits(random, 12)}Z`)
  const refundAmount = random.bool(0.7) ? random.int(1, 99) : undefined
  const controller = random.bool(0.4) ? new AbortController() : undefined
  const steps: Step[] = []
  for (let n = random.int(1, 5); n > 0; n--) {
    // Bias towards the failures a retry has to tell apart.
    steps.push(
      random.bool(0.35)
        ? random.pick(['refused', 'dns', 'refused-all'] as const)
        : random.pick(STEPS)
    )
  }
  const lookups: Lookup[] = []
  for (let n = random.int(1, 3); n > 0; n--) lookups.push(random.pick(LOOKUPS))
  const base = { tx, orderId, regKey, refundAmount }
  return {
    index,
    op,
    ...base,
    input: inputOf(op, base),
    steps:
      controller === undefined
        ? steps.map(s => (s === 'abort' ? 'reset' : s))
        : steps,
    lookups,
    controller,
    abortWhileWaiting: controller !== undefined && random.bool(0.25),
    usedSteps: [],
    lookupFetches: 0,
    entries: []
  }
}

function tokensOf(value: unknown): string[] {
  const text = JSON.stringify(value) ?? ''
  return text.match(/[0-9]{19}|ord[0-9]{12}z|RK[0-9]{12}Z/g) ?? []
}

/** A client whose fetch and probe route every request and attempt to its plan. */
function harness(random: Random, plans: Plan[]) {
  const byToken = new Map<string, Plan>()
  for (const plan of plans)
    for (const token of [plan.tx, plan.orderId, plan.regKey])
      byToken.set(token, plan)
  const planFor = (text: string): Plan => {
    for (const token of tokensOf(text)) {
      const plan = byToken.get(token)
      if (plan !== undefined) return plan
    }
    throw new Error(`no plan for ${text}`)
  }
  const bySignal = new Map<AbortSignal, Plan>()
  for (const plan of plans)
    if (plan.controller) bySignal.set(plan.controller.signal, plan)

  // Mimics the default timer: an aborted signal ends the wait with a not-sent abort.
  const sleep = (_ms: number, signal?: AbortSignal): Promise<void> => {
    const plan = signal === undefined ? undefined : bySignal.get(signal)
    if (signal?.aborted !== true && plan?.abortWhileWaiting === true)
      plan.controller?.abort('gave up while waiting')
    return signal?.aborted === true
      ? Promise.reject(
          new LinePayAbortError({
            abortReason: signal.reason,
            outcome: 'not-sent'
          })
        )
      : Promise.resolve()
  }
  const stack = makeStack(random, sleep)

  const probe: Middleware = async (ctx, next) => {
    const plan = planFor(JSON.stringify(ctx.input))
    const lookup =
      ctx.operation === 'paymentDetails' && plan.op !== 'paymentDetails'
    try {
      const result = await next()
      plan.entries.push({ lookup })
      return result
    } catch (error) {
      if (!isLinePayError(error)) throw error
      plan.entries.push({ lookup, error })
      throw error
    }
  }

  const fetch: typeof globalThis.fetch = (input, init) => {
    const url = new URL(
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input.url
    )
    const body = typeof init?.body === 'string' ? init.body : ''
    const plan = planFor(decodeURIComponent(url.href) + body)
    if (
      init?.method === 'GET' &&
      url.pathname === '/v4/payments' &&
      plan.op !== 'paymentDetails'
    ) {
      const lookup = plan.lookups[plan.lookupFetches] ?? 'notfound'
      plan.lookupFetches += 1
      return lookupResponse(plan, lookup)
    }
    const step = plan.steps[plan.usedSteps.length] ?? 'ok'
    plan.usedSteps.push(step)
    return stepResponse(plan, step, init?.signal ?? undefined)
  }

  const client = createLinePayClient({
    channelId: CHANNEL_ID,
    channelSecretKey: SECRET,
    env: 'sandbox',
    fetch,
    middleware: [...stack.middleware, probe]
  })
  return { client, stack }
}

type Settled = { ok: AnyResult } | { error: unknown }

/** Whether this is the result of a call of `operation`: a body it accepts, and the meta of a call. */
function isResultOf(
  operation: OperationName,
  value: unknown
): value is AnyResult {
  if (!isRecord(value) || !isRecord(value.meta)) return false
  const { meta } = value
  const { recovered } = meta
  return (
    operations[operation].response(value.body) &&
    isOperationName(meta.operation) &&
    meta.startedAt instanceof Date &&
    typeof meta.durationMs === 'number' &&
    typeof meta.attempts === 'number' &&
    (meta.httpStatus === undefined || typeof meta.httpStatus === 'number') &&
    (recovered === undefined ||
      (isRecord(recovered) &&
        typeof recovered.reason === 'string' &&
        isLinePayError(recovered.cause) &&
        isArray(recovered.notes)))
  )
}

async function call(client: LinePayClient, plan: Plan): Promise<Settled> {
  const options = plan.controller ? { signal: plan.controller.signal } : {}
  try {
    // What `call` makes of the plan is one of the results of the library.
    const result = await untyped(client, plan.op, plan.input, options)
    if (!isResultOf(plan.op, result)) {
      throw new Error('a call answered with no result of its operation')
    }
    return { ok: result }
  } catch (error) {
    return { error }
  }
}

/** How often each interesting path ran, so that the generator cannot go vacuous unnoticed. */
const seen = new Map<string, number>()
const count = (what: string) => seen.set(what, (seen.get(what) ?? 0) + 1)

function check(
  plan: Plan,
  stack: Stack,
  settled: Settled,
  where: string
): void {
  count(`stack:${stack.kind}`)
  count(`op:${plan.op}`)
  if (plan.usedSteps.length > 1) count('repeated')
  if (plan.lookupFetches > 0) count('looked up')
  if ('ok' in settled && settled.ok.meta.recovered !== undefined)
    count('recovered')
  if (
    'error' in settled &&
    isLinePayError(settled.error) &&
    settled.error.reconcileConclusion !== undefined
  )
    count('concluded')
  if ('error' in settled && isLinePayAbortError(settled.error)) count('aborted')
  if (
    'error' in settled &&
    plan.entries.filter(e => !e.lookup).at(-1)?.error !== settled.error
  )
    count('interrupted')
  const own = plan.entries.filter(entry => !entry.lookup)
  const lookups = plan.entries.filter(entry => entry.lookup)
  const isRead = operations[plan.op].effect === 'read'
  const last = own.at(-1)
  expect(
    last,
    `${where}: the operation never reached the executor`
  ).toBeDefined()

  // Each request was classified as its step says.
  plan.usedSteps.forEach((step, i) => {
    const expected = expectedOutcome(step, plan.op)
    const entry = own[i]
    if (expected === 'ok')
      expect(
        entry?.error,
        `${where}: attempt ${i + 1} (${step})`
      ).toBeUndefined()
    else
      expect(
        entry?.error?.outcome,
        `${where}: attempt ${i + 1} (${step})`
      ).toBe(expected)
  })
  // Every attempt but possibly the last (refused before sending) made a request.
  expect(plan.usedSteps.length, where).toBeLessThanOrEqual(own.length)
  expect(plan.usedSteps.length, where).toBeGreaterThanOrEqual(own.length - 1)
  expect(
    own.length,
    `${where}: more attempts than the stack allows`
  ).toBeLessThanOrEqual(stack.maxRequests)

  // Invariant 1: only a provable "not sent" is ever repeated (and, for a read, an unknown).
  own.slice(0, -1).forEach((entry, i) => {
    const error = entry.error
    const what = `${where}: attempt ${i + 1} was repeated after ${error?.code}/${error?.outcome}`
    expect(error, what).toBeDefined()
    if (isRead) {
      expect(
        error?.outcome === 'not-sent'
          ? isLinePayNetworkError(error)
          : error?.outcome === 'unknown',
        what
      ).toBe(true)
      expect(isLinePayAbortError(error), what).toBe(false)
    } else {
      expect(
        isLinePayNetworkError(error) && error.outcome === 'not-sent',
        what
      ).toBe(true)
    }
  })

  // Lookups only when an attempt needed one, and only through autoReconcile. A
  // refund that LINE Pay refused as a duplicate is settled without a lookup: it is
  // never "applied" for the call that was refused.
  const looksUp = (error: LinePayError | undefined) =>
    error !== undefined &&
    needsReconcile(error) &&
    !(
      (plan.op === 'refund' || plan.op === 'payPreapproved') &&
      isLinePayApiError(error) &&
      error.category === 'duplicate'
    )
  const needed = own.some(entry => looksUp(entry.error))
  if (lookups.length > 0 || plan.lookupFetches > 0) {
    expect(
      stack.hasAuto && isReconcilableOperation(plan.op) && needed,
      `${where}: an unexpected lookup`
    ).toBe(true)
  }
  if (stack.hasAuto && looksUp(last?.error)) {
    expect(
      lookups.length,
      `${where}: autoReconcile did not look the call up`
    ).toBeGreaterThan(0)
  }

  // The lookup answer reconcile decided on: the last one that was fetched.
  const decisive =
    plan.lookupFetches > 0 ? plan.lookups[plan.lookupFetches - 1] : undefined
  const evidence =
    decisive !== undefined && (APPLIED_BY[plan.op] ?? []).includes(decisive)

  if ('ok' in settled) {
    const { meta, body } = settled.ok
    expect(body.returnCode, where).toMatch(/^0/)
    if (meta.recovered === undefined) {
      expect(
        last?.error,
        `${where}: a result after a failed last attempt`
      ).toBeUndefined()
    } else {
      expect(stack.hasAuto && isReconcilableOperation(plan.op), where).toBe(
        true
      )
      expect(meta.recovered.cause, where).toBe(last?.error)
      expect(needsReconcile(meta.recovered.cause), where).toBe(true)
      expect(
        evidence,
        `${where}: recovered on the lookup answer ${decisive}`
      ).toBe(true)
    }
    // Invariant 2: attempts = requests of the operation (fetch calls minus lookups).
    if (stack.countsAttempts) {
      expect(meta.attempts, `${where}: meta.attempts`).toBe(
        plan.usedSteps.length
      )
    }
    return
  }

  // Invariant 3: the error the caller gets is a library error at least as
  // conservative as what the last attempt said.
  const { error } = settled
  expect(
    isLinePayError(error),
    `${where}: a non-library error: ${String(error)}`
  ).toBe(true)
  if (!isLinePayError(error)) expect.unreachable(where)
  const thrown = error
  const lastError = last?.error
  if (lastError === undefined) {
    expect.unreachable(`${where}: an error after a successful last attempt`)
  }
  expect(
    RANK[thrown.outcome],
    `${where}: ${lastError.outcome} became ${thrown.outcome}`
  ).toBeGreaterThanOrEqual(RANK[lastError.outcome])
  if (!isRead && own.some(entry => entry.error?.outcome === 'unknown')) {
    expect(thrown.outcome, `${where}: an unknown outcome was lost`).toBe(
      'unknown'
    )
  }
  if (thrown !== lastError) {
    // Only an abort during the backoff makes a new error; it keeps what is known.
    expect(isLinePayAbortError(thrown), where).toBe(true)
    expect(thrown.context, where).toBe(lastError?.context)
    expect(thrown.operation, where).toBe(lastError?.operation)
  }
  if (thrown.reconcileConclusion !== undefined) {
    expect(stack.hasAuto && needsReconcile(thrown), where).toBe(true)
    expect(
      evidence,
      `${where}: not recovered although the lookup answered ${decisive}`
    ).toBe(false)
    if (plan.op === 'refund')
      expect(thrown.reconcileConclusion.status, where).not.toBe('not-applied')
  }
}

describe('middleware pipeline: property-based', () => {
  it('keeps the three invariants over random failure sequences, call after call on one client', async () => {
    seen.clear()
    const random = createRandom(seedOf(0x9_1fe))
    for (let scenario = 0; scenario < 250; scenario++) {
      const used = new Set<string>()
      const plans = Array.from({ length: random.int(1, 4) }, (_, i) =>
        planOf(random, i, used)
      )
      const { client, stack } = harness(random, plans)
      for (const plan of plans) {
        const settled = await call(client, plan)
        const where = `seed=${random.seed} scenario=${scenario} stack=${stack.kind} op=${plan.op} steps=${plan.steps.join(',')} lookups=${plan.lookups.join(',')} signal=${plan.controller !== undefined} abortWhileWaiting=${plan.abortWhileWaiting}`
        check(plan, stack, settled, where)
      }
    }
    // The generator reached every path that matters, more than a handful of times.
    for (const what of [
      'repeated',
      'looked up',
      'recovered',
      'concluded',
      'aborted',
      'interrupted',
      ...OPERATION_NAMES.map(op => `op:${op}`),
      ...(
        [
          'none',
          'retry',
          'retry+auto',
          'auto',
          'auto+retry',
          'retry+retry'
        ] as const
      ).map(kind => `stack:${kind}`)
    ]) {
      expect(
        seen.get(what) ?? 0,
        `${what} ran ${seen.get(what) ?? 0} times`
      ).toBeGreaterThanOrEqual(5)
    }
  })

  it('keeps them when the calls run at the same time', async () => {
    const random = createRandom(seedOf(0xc0_c1))
    for (let scenario = 0; scenario < 120; scenario++) {
      const used = new Set<string>()
      const plans = Array.from({ length: random.int(2, 6) }, (_, i) =>
        planOf(random, i, used)
      )
      const { client, stack } = harness(random, plans)
      const settled = await Promise.all(plans.map(plan => call(client, plan)))
      plans.forEach((plan, i) => {
        const where = `seed=${random.seed} scenario=${scenario} concurrent stack=${stack.kind} op=${plan.op} steps=${plan.steps.join(',')} lookups=${plan.lookups.join(',')}`
        check(plan, stack, at(settled, i), where)
      })
    }
  })
})
