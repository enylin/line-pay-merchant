import { createHmac } from 'node:crypto'
import type http from 'node:http'

import { afterEach, describe, expect, it } from 'vitest'

import { createLinePayClient } from './client'
import { at } from './test/at'
import { CHANNEL_ID, okTextFor, operationOf, SECRET } from './test/helpers'
import { closeServers, startServer } from './test/server'

/**
 * What a real HTTP server sees. The unit tests recompute the signature from the
 * strings the client passed to `fetch`; this checks it against the bytes that
 * actually went over a socket, which is what LINE Pay verifies.
 */
interface Seen {
  method: string
  rawUrl: string
  headers: http.IncomingHttpHeaders
  rawBody: Buffer
}

async function listen(seen: Seen[]) {
  const { port } = await startServer((req, res) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => chunks.push(chunk))
    req.on('end', () => {
      const method = req.method ?? ''
      const rawUrl = req.url ?? ''
      seen.push({
        method,
        rawUrl,
        headers: req.headers,
        rawBody: Buffer.concat(chunks)
      })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(
        okTextFor(
          operationOf({ url: new URL(rawUrl, 'http://x').href, method })
        )
      )
    })
  })
  return port
}

const clientFor = (port: number) =>
  createLinePayClient({
    channelId: CHANNEL_ID,
    channelSecretKey: SECRET,
    env: 'sandbox',
    baseUrl: `http://127.0.0.1:${port}`,
    middleware: []
  })

/** The signature LINE Pay computes from what it received. */
function expectedSignature(seen: Seen): string {
  const [path = '', query = ''] = seen.rawUrl.split('?')
  const payload = seen.method === 'GET' ? query : seen.rawBody.toString('utf8')
  const nonce = seen.headers['x-line-authorization-nonce']
  if (typeof nonce !== 'string') throw new Error('no nonce was sent')
  return createHmac('sha256', SECRET)
    .update(SECRET + path + payload + nonce)
    .digest('base64')
}

afterEach(closeServers)

describe('the signature against the bytes on the wire', () => {
  // Texts that JSON.stringify and URL encoding treat in different ways.
  const awkward = [
    'Tea',
    '珍珠奶茶 🧋',
    'quote " backslash \\ slash /',
    'line\nbreak\ttab',
    '   separators',
    'lone surrogate \ud800 end',
    '<script>&amp;</script>',
    "o'brien; DROP TABLE"
  ]

  it.each(awkward)('signs a POST body with %j in it', async name => {
    const seen: Seen[] = []
    const linePay = clientFor(await listen(seen))

    await linePay.request({
      amount: 100,
      currency: 'TWD',
      orderId: `order-${name}`,
      packages: [
        {
          id: 'p1',
          amount: 100,
          products: [{ name, quantity: 1, price: 100 }]
        }
      ],
      redirectUrls: {
        confirmUrl: 'https://shop.example/confirm',
        cancelUrl: 'https://shop.example/cancel'
      }
    })

    const request = at(seen, 0)
    expect(request.method).toBe('POST')
    expect(request.headers['x-line-authorization']).toBe(
      expectedSignature(request)
    )
    // JSON.stringify escapes a lone surrogate instead of letting it become
    // U+FFFD in the bytes, so what was signed is what the server can read back.
    expect(JSON.parse(request.rawBody.toString('utf8'))).toMatchObject({
      orderId: `order-${name}`
    })
  })

  it.each([
    ['a b&c=d+e%f/中文?#'],
    ['順序 1'],
    ['plain'],
    ['%2e%2e/../x'],
    ['emoji 🧋'],
    // The URL parser writes a quote as %27 and leaves ! ( ) * ~ alone. The
    // signature has to be made from what the server will receive.
    ["O'Brien-42"],
    ["''"],
    ['a!b(c)d*e~f'],
    ['"<>`{}|\\^[]']
  ])('signs a GET query with %j in it', async orderId => {
    const seen: Seen[] = []
    const linePay = clientFor(await listen(seen))

    await linePay.paymentDetails({ orderId: [orderId, 'second'] })

    const request = at(seen, 0)
    expect(request.method).toBe('GET')
    expect(request.headers['x-line-authorization']).toBe(
      expectedSignature(request)
    )
    // The server sees the same values after decoding.
    const parsed = new URL(request.rawUrl, 'http://x').searchParams
    expect(parsed.getAll('orderId')).toEqual([orderId, 'second'])
  })

  it('signs the path that the server sees, for every path parameter', async () => {
    const seen: Seen[] = []
    const linePay = clientFor(await listen(seen))

    await linePay.confirm({
      transactionId: '2021121300698360310',
      amount: 1,
      currency: 'TWD'
    })
    await linePay.checkRegKey({ regKey: 'RK9A2BA1937EQTO' })
    await linePay.refund({ transactionId: '2021121300698360310' })

    expect(seen.map(s => s.rawUrl.split('?')[0])).toEqual([
      '/v4/payments/2021121300698360310/confirm',
      '/v4/payments/preapprovedPay/RK9A2BA1937EQTO/check',
      '/v4/payments/2021121300698360310/refund'
    ])
    for (const request of seen) {
      expect(request.headers['x-line-authorization']).toBe(
        expectedSignature(request)
      )
    }
  })

  it('signs a POST without a body as the empty object it sends', async () => {
    const seen: Seen[] = []
    const linePay = clientFor(await listen(seen))

    await linePay.void({ transactionId: '2021121300698360310' })

    const request = at(seen, 0)
    expect(request.method).toBe('POST')
    expect(request.rawBody.toString('utf8')).toBe('{}')
    expect(request.headers['x-line-authorization']).toBe(
      expectedSignature(request)
    )
  })

  it('sends a GET without a query with no question mark, and signs the empty query', async () => {
    const seen: Seen[] = []
    const linePay = clientFor(await listen(seen))

    await linePay.checkRegKey({ regKey: 'RK9A2BA1937EQTO' })

    const request = at(seen, 0)
    expect(request.rawUrl).toBe(
      '/v4/payments/preapprovedPay/RK9A2BA1937EQTO/check'
    )
    expect(request.headers['x-line-authorization']).toBe(
      expectedSignature(request)
    )
  })

  it('sends no device profile header when none is set', async () => {
    const seen: Seen[] = []
    const linePay = clientFor(await listen(seen))

    await linePay.refund({ transactionId: '1' })

    expect(at(seen, 0).headers).not.toHaveProperty(
      'x-line-merchantdeviceprofileid'
    )
  })

  it('sends a fresh nonce, and so a fresh signature, with every request', async () => {
    const seen: Seen[] = []
    const linePay = clientFor(await listen(seen))

    for (let i = 0; i < 5; i++) {
      await linePay.paymentDetails({ transactionId: ['1'] })
    }

    const nonces = new Set(
      seen.map(s => s.headers['x-line-authorization-nonce'])
    )
    const signatures = new Set(seen.map(s => s.headers['x-line-authorization']))
    expect(nonces.size).toBe(5)
    expect(signatures.size).toBe(5)
  })

  it('sends the headers LINE Pay expects and no others of its own', async () => {
    const seen: Seen[] = []
    const linePay = createLinePayClient({
      channelId: CHANNEL_ID,
      channelSecretKey: SECRET,
      env: 'sandbox',
      baseUrl: `http://127.0.0.1:${await listen(seen)}`,
      merchantDeviceProfileId: 'device-1',
      merchantDeviceType: 'POS',
      middleware: []
    })

    await linePay.refund({ transactionId: '1' })

    const request = at(seen, 0)
    expect(request.headers['x-line-channelid']).toBe(CHANNEL_ID)
    expect(request.headers['x-line-merchantdeviceprofileid']).toBe('device-1')
    expect(request.headers['x-line-merchantdevicetype']).toBe('POS')
    expect(request.headers['content-type']).toBe('application/json')
    expect(JSON.stringify(request.headers)).not.toContain(SECRET)
  })
})
