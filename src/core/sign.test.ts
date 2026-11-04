import { createHmac } from 'node:crypto'

import { afterEach, describe, expect, it, vi } from 'vitest'

import { authHeaders, createSigner } from './sign'

const SECRET = 'channelSecretKey'
const NONCE = '00000000-0000-0000-0000-000000000000'

/** An independent implementation: node:crypto instead of WebCrypto. */
function reference(
  secret: string,
  path: string,
  payload: string,
  nonce: string
) {
  return createHmac('sha256', secret)
    .update(secret + path + payload + nonce)
    .digest('base64')
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('createSigner', () => {
  // The first two vectors are the ones the 0.9 tests used, which passed an absolute
  // URL as the path. They prove the new implementation signs exactly like 0.9.
  it.each([
    {
      name: 'GET (0.9 test vector)',
      path: 'https://sandbox-api-pay.line.me/v3/payments',
      payload: 'transactionId=2021113000697317600',
      signature: 'CcToW3HaslH44yvJNliuomtkwufd8aC048p3QXZPlj8='
    },
    {
      name: 'POST (0.9 test vector)',
      path: 'https://sandbox-api-pay.line.me/v3/payments',
      payload: '{"transactionId":"2021113000697317600"}',
      signature: 'En0nRkzzQpXrXo6OHNV+827g+rWIwUq5VTk/n9Jm5Ek='
    },
    {
      name: 'POST with a real path',
      path: '/v4/payments/request',
      payload: '{"amount":100,"currency":"TWD","orderId":"order-1"}',
      signature: 'k47xrEQ1RDByIgnVVlZ5S2SIh9bLIxcjE98irO3M4VQ='
    },
    {
      name: 'GET with a real path',
      path: '/v4/payments',
      payload: 'transactionId=2021113000697317600',
      signature: 'jSiR77vOSEp1g4Mgg3OzaFefj9jgxEekfGGADiQFyos='
    }
  ])(
    'matches the known signature: $name',
    async ({ path, payload, signature }) => {
      const sign = createSigner(SECRET)
      expect(await sign(path, payload, NONCE)).toBe(signature)
      expect(reference(SECRET, path, payload, NONCE)).toBe(signature)
    }
  )

  it('agrees with node:crypto for varied inputs', async () => {
    const secret = 'channel-secret-key-for-tests'
    const sign = createSigner(secret)
    const inputs: [string, string, string][] = [
      ['/v4/payments/request', '', 'nonce-1'],
      [
        '/v4/payments/2021121300698360310/confirm',
        '{"amount":1000,"currency":"TWD"}',
        'a'
      ],
      [
        '/v4/payments',
        'orderId=%E4%B8%AD%E6%96%87&orderId=x',
        crypto.randomUUID()
      ],
      [
        '/v4/payments/request',
        '{"name":"咖啡 ☕ \u{1F600}"}',
        crypto.randomUUID()
      ]
    ]
    for (const [path, payload, nonce] of inputs) {
      expect(await sign(path, payload, nonce)).toBe(
        reference(secret, path, payload, nonce)
      )
    }
  })

  it('imports the key once per signer', async () => {
    const spy = vi.spyOn(crypto.subtle, 'importKey')
    const sign = createSigner(SECRET)
    await Promise.all([
      sign('/a', '', '1'),
      sign('/b', '', '2'),
      sign('/c', '', '3')
    ])
    await sign('/d', '', '4')
    expect(spy).toHaveBeenCalledTimes(1)
  })

  it('does not cache a failed key import', async () => {
    const spy = vi
      .spyOn(crypto.subtle, 'importKey')
      .mockRejectedValueOnce(new Error('boom'))
    const sign = createSigner(SECRET)
    await expect(sign('/a', '', '1')).rejects.toThrow('boom')
    expect(await sign('/a', '', '1')).toBe(reference(SECRET, '/a', '', '1'))
    expect(spy).toHaveBeenCalledTimes(2)
  })
})

describe('authHeaders', () => {
  it('builds the four required headers', () => {
    expect(
      authHeaders({ channelId: '123', nonce: 'n', signature: 's' })
    ).toEqual({
      'Content-Type': 'application/json',
      'X-LINE-ChannelId': '123',
      'X-LINE-Authorization-Nonce': 'n',
      'X-LINE-Authorization': 's'
    })
  })

  it('adds the merchant device profile when configured', () => {
    expect(
      authHeaders({
        channelId: '123',
        nonce: 'n',
        signature: 's',
        merchantDeviceProfileId: 'pos-1',
        merchantDeviceType: 'POS'
      })
    ).toMatchObject({
      'X-LINE-MerchantDeviceProfileId': 'pos-1',
      'X-LINE-MerchantDeviceType': 'POS'
    })
  })
})
