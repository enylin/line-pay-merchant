import { afterEach, describe, expect, it, vi } from 'vitest'

import { BASE_URLS, MAX_TIMEOUT_MS, resolveConfig } from './config'
import { isLinePayValidationError } from './errors'
import { applyUntyped, messageOf, withoutReviverSource } from './test/helpers'

const valid = {
  channelId: '1234567890',
  channelSecretKey: 'secret',
  env: 'sandbox'
} as const

function issuesOf(config: unknown): string[] {
  try {
    applyUntyped(resolveConfig, [config])
  } catch (error) {
    if (!isLinePayValidationError(error)) throw error
    return error.issues.map(i => i.path)
  }
  throw new Error('expected the configuration to be rejected')
}

function messageOfRejected(config: unknown): string {
  try {
    applyUntyped(resolveConfig, [config])
  } catch (error) {
    return messageOf(error)
  }
  throw new Error('expected the configuration to be rejected')
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('resolveConfig: what it tells about a configuration it refuses', () => {
  it('calls it a configuration, not an input', () => {
    expect(messageOfRejected({ ...valid, env: 'staging' })).toBe(
      "Invalid configuration: env must be 'sandbox' or 'production'"
    )
    expect(messageOfRejected(null)).toBe(
      'Invalid configuration: config must be an object'
    )
  })

  it('names the paths relative to the configuration', () => {
    expect(
      issuesOf({ ...valid, timeouts: { refund: 0, nonsense: 5 } })
    ).toEqual(['timeouts.refund', 'timeouts.nonsense'])
  })

  it('calls the runtime that cannot read numbers whole a configuration problem too', () => {
    withoutReviverSource()
    try {
      expect(messageOfRejected(valid)).toMatch(
        /^Invalid configuration: runtime /
      )
    } finally {
      vi.restoreAllMocks()
    }
  })
})

describe('resolveConfig', () => {
  it('fills in the defaults', () => {
    const resolved = resolveConfig(valid)
    expect(resolved).toMatchObject({
      channelId: '1234567890',
      channelSecretKey: 'secret',
      baseUrl: 'https://sandbox-api-pay.line.me',
      timeout: undefined,
      merchantDeviceProfileId: undefined,
      merchantDeviceType: undefined,
      validate: true
    })
    expect(resolved.timeouts).toEqual({})
    expect(resolved.middleware).toHaveLength(1)
  })

  it('selects the host by environment', () => {
    expect(resolveConfig(valid).baseUrl).toBe(BASE_URLS.sandbox)
    expect(resolveConfig({ ...valid, env: 'production' }).baseUrl).toBe(
      'https://api-pay.line.me'
    )
  })

  it('accepts an empty middleware list', () => {
    expect(resolveConfig({ ...valid, middleware: [] }).middleware).toEqual([])
  })

  it('keeps the settings it is given', () => {
    const resolved = resolveConfig({
      ...valid,
      timeout: 5000,
      timeouts: { confirm: 1000 },
      merchantDeviceProfileId: 'pos-1',
      merchantDeviceType: 'POS',
      validate: false
    })
    expect(resolved).toMatchObject({
      timeout: 5000,
      timeouts: { confirm: 1000 },
      merchantDeviceProfileId: 'pos-1',
      merchantDeviceType: 'POS',
      validate: false
    })
  })

  it('freezes what it hands out', () => {
    const resolved = resolveConfig({ ...valid, timeouts: { confirm: 1000 } })
    expect(Object.isFrozen(resolved.timeouts)).toBe(true)
    expect(Object.isFrozen(resolved.middleware)).toBe(true)
  })

  it('reads the global fetch when it is called, not when the client is created', async () => {
    const resolved = resolveConfig(valid)
    const stub = vi.fn(() => Promise.resolve(new Response('{}')))
    vi.stubGlobal('fetch', stub)
    await resolved.fetch('https://example.com', {})
    expect(stub).toHaveBeenCalledTimes(1)
  })

  it('uses the fetch it is given', () => {
    const custom = vi.fn<typeof fetch>()
    expect(resolveConfig({ ...valid, fetch: custom }).fetch).toBe(custom)
  })
})

describe('resolveConfig: rejected settings', () => {
  it.each([undefined, null, 'config', 42])('rejects %j as a config', value => {
    expect(issuesOf(value)).toEqual(['config'])
  })

  it.each([42, null, {}, true, Symbol('id')])(
    'refuses a channel ID that is not a string (%s) without throwing on it',
    value => {
      expect(issuesOf({ ...valid, channelId: value })).toEqual(['channelId'])
    }
  )

  it('requires the channel ID and secret', () => {
    expect(issuesOf({ env: 'sandbox' })).toEqual([
      'channelId',
      'channelSecretKey'
    ])
    expect(
      issuesOf({ ...valid, channelId: '', channelSecretKey: ' '.repeat(0) })
    ).toEqual(['channelId', 'channelSecretKey'])
  })

  describe('values that are sent in a header, or that sign', () => {
    it.each([
      '123\r\nX-Evil: 1',
      '123\n',
      ' 123',
      '123 ',
      '１２３',
      '中文',
      'tab\there',
      '\u0000',
      '\u007f'
    ])('rejects the channel ID %j', value => {
      expect(issuesOf({ ...valid, channelId: value })).toEqual(['channelId'])
    })

    it.each([
      'device\r\nX-Evil: 1',
      'device\n',
      ' device',
      'device ',
      '裝置',
      'tab\tthere'
    ])('rejects the merchantDeviceProfileId %j', value => {
      expect(issuesOf({ ...valid, merchantDeviceProfileId: value })).toEqual([
        'merchantDeviceProfileId'
      ])
    })

    it.each([
      'secret\n',
      '\nsecret',
      ' secret',
      'secret ',
      'sec\u0000ret',
      'sec\tret',
      'sec\r\nret',
      // The edges of "control character": the last one before the space, and DEL.
      'sec\u001fret',
      'sec\u007fret'
    ])('rejects the secret %j', value => {
      expect(issuesOf({ ...valid, channelSecretKey: value })).toEqual([
        'channelSecretKey'
      ])
    })

    it.each(['a b', 'sec~ret', 'sec\u0080ret', 'sécret'])(
      'accepts the secret %j: only control characters and spaces at the ends are refused',
      value => {
        expect(
          resolveConfig({ ...valid, channelSecretKey: value }).channelSecretKey
        ).toBe(value)
      }
    )

    it('accepts ordinary values, and a space inside a device name', () => {
      const config = resolveConfig({
        ...valid,
        channelId: '1234567890',
        channelSecretKey: '0123456789abcdef0123456789abcdef',
        merchantDeviceProfileId: 'POS 1 / counter-2',
        merchantDeviceType: 'POS'
      })
      expect(config.merchantDeviceProfileId).toBe('POS 1 / counter-2')
    })

    it('does not put the secret into the message about it', () => {
      try {
        resolveConfig({ ...valid, channelSecretKey: 'super-secret-value\n' })
        expect.unreachable()
      } catch (error) {
        expect(messageOf(error)).not.toContain('super-secret-value')
      }
    })
  })

  it('says why an environment is wrong, and the rename only for development', () => {
    const message = (env: unknown) => {
      try {
        applyUntyped(resolveConfig, [{ ...valid, env }])
      } catch (error) {
        return messageOf(error)
      }
      return ''
    }
    expect(message('staging')).toContain("must be 'sandbox' or 'production'")
    expect(message('staging')).not.toContain('renamed')
    expect(message('Sandbox')).toContain("must be 'sandbox' or 'production'")
  })

  it('explains that development was renamed', () => {
    try {
      applyUntyped(resolveConfig, [{ ...valid, env: 'development' }])
      expect.unreachable()
    } catch (error) {
      expect(messageOf(error)).toContain(
        "'development' was renamed to 'sandbox'"
      )
    }
  })

  it('rejects an unknown environment', () => {
    expect(issuesOf({ ...valid, env: 'staging' })).toEqual(['env'])
    expect(issuesOf({ ...valid, env: undefined })).toEqual(['env'])
  })

  it.each([
    0,
    -1,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    MAX_TIMEOUT_MS + 1,
    '5000'
  ])('rejects a timeout of %j', value => {
    expect(issuesOf({ ...valid, timeout: value })).toEqual(['timeout'])
  })

  it('takes the whole range a timer can take, and not a millisecond more', () => {
    expect(resolveConfig({ ...valid, timeout: 1 }).timeout).toBe(1)
    expect(resolveConfig({ ...valid, timeout: MAX_TIMEOUT_MS }).timeout).toBe(
      2_147_483_647
    )
    expect(
      resolveConfig({ ...valid, timeouts: { confirm: MAX_TIMEOUT_MS } })
        .timeouts.confirm
    ).toBe(2_147_483_647)
    expect(MAX_TIMEOUT_MS).toBe(2_147_483_647)
    expect(issuesOf({ ...valid, timeout: MAX_TIMEOUT_MS + 1 })).toEqual([
      'timeout'
    ])
    expect(issuesOf({ ...valid, timeout: 0 })).toEqual(['timeout'])
    expect(issuesOf({ ...valid, timeout: Number.NaN })).toEqual(['timeout'])
    expect(
      issuesOf({ ...valid, timeouts: { confirm: MAX_TIMEOUT_MS + 1 } })
    ).toEqual(['timeouts.confirm'])
    expect(issuesOf({ ...valid, timeouts: { confirm: 0 } })).toEqual([
      'timeouts.confirm'
    ])
    expect(
      issuesOf({ ...valid, timeouts: { confirm: Number.POSITIVE_INFINITY } })
    ).toEqual(['timeouts.confirm'])
  })

  it('refuses timeouts that are null, or not a number', () => {
    expect(issuesOf({ ...valid, timeouts: null })).toEqual(['timeouts'])
    expect(issuesOf({ ...valid, timeouts: { confirm: '5000' } })).toEqual([
      'timeouts.confirm'
    ])
    expect(issuesOf({ ...valid, timeouts: { confirm: null } })).toEqual([
      'timeouts.confirm'
    ])
  })

  it.each([123, null, true, {}, ['x']])(
    'refuses a merchantDeviceProfileId that is not a string (%j)',
    value => {
      expect(issuesOf({ ...valid, merchantDeviceProfileId: value })).toEqual([
        'merchantDeviceProfileId'
      ])
    }
  )

  it('requires V4 device identity headers to be configured together', () => {
    expect(
      issuesOf({ ...valid, merchantDeviceProfileId: 'terminal-1' })
    ).toEqual(['merchantDeviceType'])
    expect(issuesOf({ ...valid, merchantDeviceType: 'POS' })).toEqual([
      'merchantDeviceProfileId'
    ])
    expect(
      resolveConfig({
        ...valid,
        merchantDeviceProfileId: 'terminal-1',
        merchantDeviceType: 'POS'
      }).merchantDeviceType
    ).toBe('POS')
  })

  it.each([' terminal', 'terminal ', '裝置', 'bad\nvalue', 1, null])(
    'rejects invalid merchantDeviceType %j',
    merchantDeviceType => {
      expect(issuesOf({ ...valid, merchantDeviceType })).toEqual([
        'merchantDeviceType'
      ])
    }
  )

  it('takes a device type of one character, and says that an empty one is empty', () => {
    const device = { ...valid, merchantDeviceProfileId: 'pos-1' }
    expect(
      resolveConfig({ ...device, merchantDeviceType: 'P' }).merchantDeviceType
    ).toBe('P')
    try {
      applyUntyped(resolveConfig, [{ ...device, merchantDeviceType: '' }])
      expect.unreachable('an empty device type was accepted')
    } catch (error) {
      if (!isLinePayValidationError(error)) throw error
      expect(error.issues).toEqual([
        { path: 'merchantDeviceType', message: 'must be a non-empty string' }
      ])
    }
  })

  it('says which of the two device settings is missing', () => {
    const missing = (config: object) => {
      try {
        applyUntyped(resolveConfig, [config])
      } catch (error) {
        if (!isLinePayValidationError(error)) throw error
        return error.issues
      }
      return expect.unreachable('the configuration was accepted')
    }
    expect(missing({ ...valid, merchantDeviceProfileId: 'pos-1' })).toEqual([
      {
        path: 'merchantDeviceType',
        message: 'is required with merchantDeviceProfileId'
      }
    ])
    expect(missing({ ...valid, merchantDeviceType: 'POS' })).toEqual([
      {
        path: 'merchantDeviceProfileId',
        message: 'is required with merchantDeviceType'
      }
    ])
  })

  it('checks the per-operation timeouts', () => {
    expect(
      issuesOf({
        ...valid,
        timeouts: { confirm: -5, bogus: 1000, refund: 1000 }
      })
    ).toEqual(['timeouts.confirm', 'timeouts.bogus'])
    expect(issuesOf({ ...valid, timeouts: 'x' })).toEqual(['timeouts'])
  })

  it('takes a device profile ID of one character, and says that an empty one is empty', () => {
    expect(
      resolveConfig({
        ...valid,
        merchantDeviceProfileId: 'a',
        merchantDeviceType: 'POS'
      }).merchantDeviceProfileId
    ).toBe('a')
    try {
      applyUntyped(resolveConfig, [{ ...valid, merchantDeviceProfileId: '' }])
      expect.unreachable()
    } catch (error) {
      expect(messageOf(error)).toContain(
        'merchantDeviceProfileId must be a non-empty string'
      )
    }
  })

  it('checks the other options', () => {
    expect(issuesOf({ ...valid, fetch: 'fetch' })).toEqual(['fetch'])
    expect(issuesOf({ ...valid, merchantDeviceProfileId: '' })).toEqual([
      'merchantDeviceProfileId'
    ])
    expect(issuesOf({ ...valid, validate: 'yes' })).toEqual(['validate'])
    expect(issuesOf({ ...valid, middleware: 'retry' })).toEqual(['middleware'])
    expect(issuesOf({ ...valid, middleware: [() => 1, 'x'] })).toEqual([
      'middleware'
    ])
  })

  it('reports every problem at once', () => {
    expect(issuesOf({ env: 'x', timeout: -1 })).toEqual([
      'channelId',
      'channelSecretKey',
      'env',
      'timeout'
    ])
  })
})

describe('resolveConfig: what it reads', () => {
  it('takes only what is on the object itself, not what Object.prototype gained', () => {
    // A bug elsewhere that pollutes the prototype must not decide where the
    // signed requests go.
    Reflect.set(Object.prototype, 'baseUrl', 'https://attacker.example')
    Reflect.set(Object.prototype, 'validate', false)
    Reflect.set(Object.prototype, 'timeout', 1)
    Reflect.set(Object.prototype, 'merchantDeviceProfileId', 'polluted')
    Reflect.set(Object.prototype, 'merchantDeviceType', 'polluted')
    Reflect.set(Object.prototype, 'middleware', [])
    try {
      const resolved = resolveConfig(valid)
      expect(resolved.baseUrl).toBe(BASE_URLS.sandbox)
      expect(resolved.validate).toBe(true)
      expect(resolved.timeout).toBeUndefined()
      expect(resolved.merchantDeviceProfileId).toBeUndefined()
      expect(resolved.merchantDeviceType).toBeUndefined()
      expect(resolved.middleware).toHaveLength(1)
    } finally {
      for (const key of [
        'baseUrl',
        'validate',
        'timeout',
        'merchantDeviceProfileId',
        'merchantDeviceType',
        'middleware'
      ]) {
        Reflect.deleteProperty(Object.prototype, key)
      }
    }
  })

  it('does not take a polluted fetch for the one that was meant', async () => {
    const polluted = vi.fn(() => Promise.resolve(new Response('{}')))
    Reflect.set(Object.prototype, 'fetch', polluted)
    try {
      const resolved = resolveConfig(valid)
      const stub = vi.fn(() => Promise.resolve(new Response('{}')))
      vi.stubGlobal('fetch', stub)
      await resolved.fetch('https://x.example')
      expect(stub).toHaveBeenCalledTimes(1)
      expect(polluted).not.toHaveBeenCalled()
    } finally {
      Reflect.deleteProperty(Object.prototype, 'fetch')
    }
  })

  it('reads the settings of an object that has them as its own, getters included', () => {
    const resolved = resolveConfig({
      get channelId() {
        return '1234567890'
      },
      channelSecretKey: 'secret',
      env: 'production'
    })
    expect(resolved.channelId).toBe('1234567890')
    expect(resolved.baseUrl).toBe(BASE_URLS.production)
  })

  it('does not see the settings a class keeps on its prototype', () => {
    // They are not on the object. Spread it to pass them on: `{ ...config }`.
    class Settings {
      channelSecretKey = 'secret'
      env = 'sandbox' as const
      get channelId() {
        return '1234567890'
      }
    }
    expect(issuesOf(new Settings())).toEqual(['channelId'])
    expect(resolveConfig({ ...new Settings(), channelId: '1' }).channelId).toBe(
      '1'
    )
  })

  it('refuses to make a client where JSON.parse does not give the source text', () => {
    // An engine that calls the reviver without the third argument.
    withoutReviverSource()
    try {
      expect(issuesOf(valid)).toEqual(['runtime'])
    } finally {
      vi.restoreAllMocks()
    }
    expect(() => resolveConfig(valid)).not.toThrow()
  })
})

describe('resolveConfig: baseUrl', () => {
  it('takes a long run of slashes in linear time', () => {
    const started = performance.now()
    const resolved = resolveConfig({
      ...valid,
      baseUrl: `https://proxy.example/${'/'.repeat(200_000)}`
    })
    expect(resolved.baseUrl).toBe('https://proxy.example')
    expect(performance.now() - started).toBeLessThan(500)
    expect(
      resolveConfig({
        ...valid,
        baseUrl: `https://proxy.example/a${'/'.repeat(200_000)}b${'/'.repeat(10)}`
      }).baseUrl
    ).toBe(`https://proxy.example/a${'/'.repeat(200_000)}b`)
  })

  const baseUrl = (value: string) =>
    resolveConfig({ ...valid, baseUrl: value }).baseUrl

  it('accepts https hosts and drops trailing slashes', () => {
    expect(baseUrl('https://proxy.example.com')).toBe(
      'https://proxy.example.com'
    )
    expect(baseUrl('https://proxy.example.com/')).toBe(
      'https://proxy.example.com'
    )
    expect(baseUrl('https://proxy.example.com/linepay//')).toBe(
      'https://proxy.example.com/linepay'
    )
  })

  it('allows plain http only for loopback addresses', () => {
    expect(baseUrl('http://localhost:3000')).toBe('http://localhost:3000')
    expect(baseUrl('http://127.0.0.1:8080')).toBe('http://127.0.0.1:8080')
    expect(issuesOf({ ...valid, baseUrl: 'http://proxy.example.com' })).toEqual(
      ['baseUrl']
    )
  })

  it('allows plain http for the IPv6 loopback address too', () => {
    expect(baseUrl('http://[::1]:3000')).toBe('http://[::1]:3000')
  })

  it.each(['ftp://localhost', 'ws://localhost', 'file://localhost/etc'])(
    'does not take %s for a loopback address that http may use',
    value => {
      expect(issuesOf({ ...valid, baseUrl: value })).toEqual(['baseUrl'])
    }
  )

  it('says that a base URL which is not a string must be one', () => {
    try {
      applyUntyped(resolveConfig, [{ ...valid, baseUrl: 42 }])
      expect.unreachable()
    } catch (error) {
      expect(messageOf(error)).toContain('baseUrl must be a string')
    }
  })

  it.each([
    'not a url',
    'ftp://example.com',
    'https://a.com/?x=1',
    'https://a.com/#top',
    'https://user:pass@proxy.example.com',
    'https://user@proxy.example.com',
    'https://:pass@proxy.example.com',
    42
  ])('rejects %j', value => {
    expect(issuesOf({ ...valid, baseUrl: value })).toEqual(['baseUrl'])
  })
})
