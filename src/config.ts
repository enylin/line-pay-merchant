import type { Middleware } from './client-types'
import { isArray } from './core/guard'
import { hasLosslessJson } from './core/json'
import { type FetchImpl } from './core/transport'
import { Checker } from './core/validate'
import { LinePayValidationError } from './errors'
import { retryWhenNotSent } from './middleware/retry-when-not-sent'
import { isOperationName, type OperationName } from './operations/names'

export type LinePayEnv = 'sandbox' | 'production'

export const BASE_URLS: Readonly<Record<LinePayEnv, string>> = {
  sandbox: 'https://sandbox-api-pay.line.me',
  production: 'https://api-pay.line.me'
}

/** `AbortSignal.timeout` and timers cannot take more than 2^31 - 1 milliseconds. */
export const MAX_TIMEOUT_MS = 2_147_483_647

/** What is wrong with a timeout that `isValidTimeout` refuses. */
export const TIMEOUT_MESSAGE = `must be a number of milliseconds between 1 and ${MAX_TIMEOUT_MS}`

export function isValidTimeout(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 1 &&
    value <= MAX_TIMEOUT_MS
  )
}

export interface LinePayConfig {
  /** The channel ID of the merchant (Merchant Center, "Manage link key"). */
  channelId: string
  /** The channel secret key. Keep it on the server. */
  channelSecretKey: string
  /** `sandbox` for testing, `production` for real payments. */
  env: LinePayEnv
  /**
   * Time limit of one attempt in milliseconds. It applies to every operation
   * without a more specific setting. Order of precedence: the `timeout` of the
   * call, `timeouts[operation]`, `timeout`, the default of the operation.
   */
  timeout?: number
  /** Time limits per operation. */
  timeouts?: Partial<Record<OperationName, number>>
  /** Replaces the global `fetch`: for a proxy, a fixed IP address, or tests. */
  fetch?: typeof fetch
  /**
   * Replaces the host that `env` selects, for example to go through a proxy with a
   * fixed IP address. It must use https, except for localhost.
   */
  baseUrl?: string
  /**
   * Sent as `X-LINE-MerchantDeviceProfileId`. Give it together with
   * `merchantDeviceType`: one without the other is refused.
   */
  merchantDeviceProfileId?: string
  /**
   * Sent as `X-LINE-MerchantDeviceType`. Give it together with
   * `merchantDeviceProfileId`: one without the other is refused.
   */
  merchantDeviceType?: string
  /**
   * Middleware of the client, outermost first. The default is
   * `[retryWhenNotSent()]`; pass `[]` for none.
   */
  middleware?: readonly Middleware[]
  /**
   * Check the input before sending it, including that amounts add up. `true` by
   * default. The checks of path parameters (`transactionId`, `regKey`) cannot be
   * turned off.
   */
  validate?: boolean
}

export interface ResolvedConfig {
  readonly channelId: string
  readonly channelSecretKey: string
  readonly baseUrl: string
  readonly timeout: number | undefined
  readonly timeouts: Readonly<Partial<Record<OperationName, number>>>
  readonly fetch: FetchImpl
  readonly merchantDeviceProfileId: string | undefined
  readonly merchantDeviceType: string | undefined
  readonly validate: boolean
  readonly middleware: readonly Middleware[]
}

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/** Printable ASCII, without a space at either end: safe as the value of a header. */
const HEADER_VALUE = /^[\x21-\x7e](?:[\x20-\x7e]*[\x21-\x7e])?$/
const HEADER_VALUE_MESSAGE =
  'must be printable ASCII without spaces at either end'
/** A line break, a tab, NUL or DEL anywhere in the text. */
const hasControlCharacter = (text: string): boolean =>
  Array.from(text).some(character => {
    const code = character.codePointAt(0) ?? 0
    return code < 0x20 || code === 0x7f
  })

function resolveBaseUrl(
  baseUrl: unknown,
  env: LinePayEnv | undefined,
  checker: Checker
): string {
  if (baseUrl === undefined) return env === undefined ? '' : BASE_URLS[env]
  if (typeof baseUrl !== 'string') {
    checker.fail('baseUrl', 'must be a string')
    return ''
  }
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    checker.fail('baseUrl', 'must be an absolute URL')
    return ''
  }
  if (
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && LOOPBACK.has(url.hostname))
  ) {
    checker.fail(
      'baseUrl',
      'must use https (http is only allowed for localhost)'
    )
  }
  if (url.search !== '' || url.hash !== '') {
    checker.fail('baseUrl', 'must not contain a query or a fragment')
  }
  if (url.username !== '' || url.password !== '') {
    // They would be dropped silently, and the proxy would see no credentials.
    checker.fail('baseUrl', 'must not contain a user name or a password')
  }
  return `${url.origin}${withoutTrailingSlashes(url.pathname)}`
}

/** A loop, not a regular expression: `/\/+$/` takes quadratic time on a long run of slashes. */
function withoutTrailingSlashes(path: string): string {
  let end = path.length
  while (end > 0 && path.charCodeAt(end - 1) === 47) end--
  return path.slice(0, end)
}

/** Validate a configuration and fill in the defaults. */
export function resolveConfig(given: LinePayConfig): ResolvedConfig {
  if (typeof given !== 'object' || given === null) {
    throw new LinePayValidationError({
      issues: [{ path: 'config', message: 'must be an object' }],
      subject: 'configuration'
    })
  }
  if (!hasLosslessJson()) {
    throw new LinePayValidationError({
      issues: [
        {
          path: 'runtime',
          message:
            'JSON.parse must hand the source text of a number to its reviver (V8 11.4, Node.js 22 or later), or the 19-digit transaction IDs of LINE Pay would be rounded'
        }
      ],
      subject: 'configuration'
    })
  }
  // Only what was put on the object itself is a setting. A property that
  // Object.prototype has gained through a bug somewhere else (prototype
  // pollution) is not: a polluted `baseUrl` would send every signed request to
  // another host.
  const config: LinePayConfig = { ...given }
  Object.setPrototypeOf(config, null)

  const checker = new Checker()
  checker.nonEmptyString('channelId', config.channelId)
  checker.nonEmptyString('channelSecretKey', config.channelSecretKey)
  // The channel ID goes into a header: anything but printable ASCII would make
  // `fetch` throw before it sends, and a line break could inject a header.
  if (typeof config.channelId === 'string' && config.channelId !== '') {
    if (!HEADER_VALUE.test(config.channelId)) {
      checker.fail('channelId', HEADER_VALUE_MESSAGE)
    }
  }
  // The secret is not sent, but a newline or a space that came with it from an
  // environment variable or a file makes every signature wrong.
  if (
    typeof config.channelSecretKey === 'string' &&
    config.channelSecretKey !== '' &&
    (hasControlCharacter(config.channelSecretKey) ||
      config.channelSecretKey !== config.channelSecretKey.trim())
  ) {
    checker.fail(
      'channelSecretKey',
      'must not contain control characters or spaces at either end (is there a line break from an environment variable or a file?)'
    )
  }

  const requestedEnv: unknown = config.env
  let env: LinePayEnv | undefined
  if (requestedEnv === 'sandbox' || requestedEnv === 'production') {
    env = requestedEnv
  } else if (requestedEnv === 'development') {
    checker.fail('env', "'development' was renamed to 'sandbox'")
  } else {
    checker.fail('env', "must be 'sandbox' or 'production'")
  }

  if (config.timeout !== undefined && !isValidTimeout(config.timeout)) {
    checker.fail('timeout', TIMEOUT_MESSAGE)
  }

  const timeouts: Partial<Record<OperationName, number>> = {}
  if (config.timeouts !== undefined) {
    if (typeof config.timeouts !== 'object' || config.timeouts === null) {
      checker.fail('timeouts', 'must be an object')
    } else {
      for (const [name, value] of Object.entries(config.timeouts)) {
        if (!isOperationName(name)) {
          checker.fail(`timeouts.${name}`, 'is not an operation name')
        } else if (!isValidTimeout(value)) {
          checker.fail(`timeouts.${name}`, TIMEOUT_MESSAGE)
        } else {
          timeouts[name] = value
        }
      }
    }
  }

  if (config.fetch !== undefined && typeof config.fetch !== 'function') {
    checker.fail('fetch', 'must be a function')
  }
  if (config.merchantDeviceProfileId !== undefined) {
    if (
      typeof config.merchantDeviceProfileId !== 'string' ||
      config.merchantDeviceProfileId.length === 0
    ) {
      checker.fail('merchantDeviceProfileId', 'must be a non-empty string')
    } else if (!HEADER_VALUE.test(config.merchantDeviceProfileId)) {
      checker.fail('merchantDeviceProfileId', HEADER_VALUE_MESSAGE)
    }
  }
  if (config.merchantDeviceType !== undefined) {
    if (
      typeof config.merchantDeviceType !== 'string' ||
      config.merchantDeviceType.length === 0
    ) {
      checker.fail('merchantDeviceType', 'must be a non-empty string')
    } else if (!HEADER_VALUE.test(config.merchantDeviceType)) {
      checker.fail('merchantDeviceType', HEADER_VALUE_MESSAGE)
    }
  }
  // LINE Pay V4 requires the two optional device headers together.
  if (
    typeof config.merchantDeviceProfileId === 'string' &&
    HEADER_VALUE.test(config.merchantDeviceProfileId) &&
    config.merchantDeviceType === undefined
  ) {
    checker.fail(
      'merchantDeviceType',
      'is required with merchantDeviceProfileId'
    )
  }
  if (
    typeof config.merchantDeviceType === 'string' &&
    HEADER_VALUE.test(config.merchantDeviceType) &&
    config.merchantDeviceProfileId === undefined
  ) {
    checker.fail(
      'merchantDeviceProfileId',
      'is required with merchantDeviceType'
    )
  }
  if (config.validate !== undefined && typeof config.validate !== 'boolean') {
    checker.fail('validate', 'must be a boolean')
  }
  if (
    config.middleware !== undefined &&
    (!isArray(config.middleware) ||
      config.middleware.some((m: unknown) => typeof m !== 'function'))
  ) {
    checker.fail('middleware', 'must be an array of functions')
  }

  const baseUrl = resolveBaseUrl(config.baseUrl, env, checker)
  checker.throwIfInvalid({ subject: 'configuration' })

  const userFetch = config.fetch
  const middleware: readonly Middleware[] = config.middleware ?? [
    retryWhenNotSent()
  ]
  return {
    channelId: config.channelId,
    channelSecretKey: config.channelSecretKey,
    baseUrl,
    timeout: config.timeout,
    timeouts: Object.freeze(timeouts),
    // Read the global at call time, so that tests can replace it.
    fetch: userFetch ?? ((input, init) => globalThis.fetch(input, init)),
    merchantDeviceProfileId: config.merchantDeviceProfileId,
    merchantDeviceType: config.merchantDeviceType,
    validate: config.validate ?? true,
    middleware: Object.freeze<Middleware[]>([...middleware])
  }
}
