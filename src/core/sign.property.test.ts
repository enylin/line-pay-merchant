import { createHmac } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { at } from '../test/at'
import {
  createRandom,
  HOSTILE_CHARS,
  type Random,
  seedOf
} from '../test/random'
import { createSigner } from './sign'

/** An independent implementation: node:crypto instead of WebCrypto. */
const reference = (
  secret: string,
  path: string,
  payload: string,
  nonce: string
) =>
  createHmac('sha256', secret)
    .update(secret + path + payload + nonce)
    .digest('base64')

const SECRET_CHARS = [
  ...'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
  ' ', // a secret may start or end with a space; nothing may trim it
  '\t',
  ...'+/=-_',
  'é',
  '中',
  '\u{1f511}'
]

function secret(random: Random): string {
  const core = random.string(SECRET_CHARS, 1, 64)
  // Leading and trailing whitespace on purpose, now and then.
  return (
    random.pick(['', '', ' ', '  ', '\t']) +
    core +
    random.pick(['', '', ' ', '\n'])
  )
}

function path(random: Random): string {
  return random.pick([
    '/v4/payments/request',
    '/v4/payments',
    `/v4/payments/${random.int(1, 9)}${random.string([...'0123456789'], 18, 18)}/confirm`,
    `/v4/payments/preapprovedPay/${random.string(SECRET_CHARS.slice(0, 62), 1, 15)}/payment`,
    '/' + random.string(HOSTILE_CHARS, 0, 12)
  ])
}

function payload(random: Random): string {
  if (random.bool(0.4)) {
    return JSON.stringify({
      amount: random.int(1, 100_000),
      currency: random.pick(['TWD', 'USD', 'THB']),
      orderId: random.string(HOSTILE_CHARS, 0, 20),
      note: random.string([...HOSTILE_CHARS, '\uD800'], 0, 10) // JSON.stringify escapes lone surrogates
    })
  }
  return random.string([...HOSTILE_CHARS, '\uD800', '\uDC00'], 0, 40) // raw lone surrogates too
}

function nonce(random: Random): string {
  const hex = [...'0123456789abcdef']
  return random.bool(0.7)
    ? `${random.string(hex, 8, 8)}-${random.string(hex, 4, 4)}-${random.string(hex, 4, 4)}-${random.string(hex, 4, 4)}-${random.string(hex, 12, 12)}`
    : random.string(HOSTILE_CHARS, 0, 10)
}

describe('createSigner: property-based', () => {
  it('agrees with node:crypto for random secrets, paths, payloads and nonces', async () => {
    const random = createRandom(seedOf(0x51_9e))
    for (let i = 0; i < 400; i++) {
      const input = {
        secret: secret(random),
        path: path(random),
        payload: payload(random),
        nonce: nonce(random)
      }
      const sign = createSigner(input.secret)
      const where = `seed=${random.seed} case=${i} input=${JSON.stringify(input)}`
      expect(await sign(input.path, input.payload, input.nonce), where).toBe(
        reference(input.secret, input.path, input.payload, input.nonce)
      )
    }
  })

  it('keeps agreeing when one signer signs many messages, concurrently', async () => {
    const random = createRandom(seedOf(0xc0c0))
    const key = secret(random)
    const sign = createSigner(key)
    const inputs = Array.from(
      { length: 100 },
      () => [path(random), payload(random), nonce(random)] as const
    )
    const signatures = await Promise.all(
      inputs.map(([p, b, n]) => sign(p, b, n))
    )
    signatures.forEach((signature, i) => {
      const [p, b, n] = at(inputs, i)
      expect(signature, `seed=${random.seed} case=${i}`).toBe(
        reference(key, p, b, n)
      )
    })
  })

  it('is a base64 HMAC-SHA256: 44 characters, sensitive to every input', async () => {
    const sign = createSigner(' secret with spaces ')
    const base = await sign('/v4/payments', 'a=1', 'n')
    expect(base).toMatch(/^[A-Za-z0-9+/]{43}=$/)
    expect(await sign('/v4/payments', 'a=1', 'm')).not.toBe(base)
    expect(await sign('/v4/payments', 'a=2', 'n')).not.toBe(base)
    expect(await sign('/v4/payment', 'a=1', 'n')).not.toBe(base)
    expect(
      await createSigner('secret with spaces')('/v4/payments', 'a=1', 'n')
    ).not.toBe(base)
  })
})
