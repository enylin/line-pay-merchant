/**
 * LINE Pay request signature:
 *
 *   Base64( HMAC-SHA256( key = secret, message = secret + path + payload + nonce ) )
 *
 * - `path` is the API path without host and query, for example `/v4/payments/request`.
 * - `payload` is the query string (GET, without `?`) or the JSON body (POST),
 *   exactly as it is sent.
 *
 * Uses WebCrypto, so it works on Node.js, Bun, Deno and edge runtimes alike.
 */
export type Signer = (
  path: string,
  payload: string,
  nonce: string
) => Promise<string>

const encoder = new TextEncoder()

function toBase64(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

export function createSigner(channelSecretKey: string): Signer {
  // Import the key once per client, on the first signature.
  let cryptoKey: ReturnType<typeof crypto.subtle.importKey> | undefined

  const getKey = (): ReturnType<typeof crypto.subtle.importKey> => {
    if (cryptoKey === undefined) {
      const pending = crypto.subtle.importKey(
        'raw',
        encoder.encode(channelSecretKey),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      )
      // Do not cache a failure.
      pending.catch(() => {
        cryptoKey = undefined
      })
      cryptoKey = pending
    }
    return cryptoKey
  }

  return async (path, payload, nonce) => {
    const key = await getKey()
    const message = encoder.encode(channelSecretKey + path + payload + nonce)
    const mac = await crypto.subtle.sign('HMAC', key, message)
    return toBase64(new Uint8Array(mac))
  }
}

export interface AuthHeaderInput {
  readonly channelId: string
  readonly nonce: string
  readonly signature: string
  readonly merchantDeviceProfileId?: string | undefined
  readonly merchantDeviceType?: string | undefined
}

export function authHeaders(input: AuthHeaderInput): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-LINE-ChannelId': input.channelId,
    'X-LINE-Authorization-Nonce': input.nonce,
    'X-LINE-Authorization': input.signature
  }
  if (input.merchantDeviceProfileId !== undefined) {
    headers['X-LINE-MerchantDeviceProfileId'] = input.merchantDeviceProfileId
  }
  if (input.merchantDeviceType !== undefined) {
    headers['X-LINE-MerchantDeviceType'] = input.merchantDeviceType
  }
  return headers
}
