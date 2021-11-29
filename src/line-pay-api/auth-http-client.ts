import axios, { AxiosInstance } from 'axios'
import { LineMerchantConfig, QueryParams } from './type'
import hmacSHA256 from 'crypto-js/hmac-sha256'
import Base64 from 'crypto-js/enc-base64'
import { v4 as uuidv4 } from 'uuid'

export type AuthHttpClient = AxiosInstance

type RequestHeader = {
  'Content-Type': 'application/json'
  'X-LINE-ChannelId': string
  'X-LINE-MerchantDeviceProfileId'?: string
  'X-LINE-Authorization-Nonce': string
  'X-LINE-Authorization': string
}

export function createAuthHttpClient(
  merchantConfig: LineMerchantConfig
): AuthHttpClient {
  const PRODUCTION_URL = 'https://api-pay.line.me'
  const SANDBOX_URL = 'https://sandbox-api-pay.line.me'

  const BASE_URL =
    merchantConfig.env === 'production' ? PRODUCTION_URL : SANDBOX_URL

  // TODO: timeout
  const axiosInstance = axios.create({
    baseURL: BASE_URL
  })

  return createClientProxy(axiosInstance, merchantConfig)
}

function buildQueryString(params: QueryParams): string {
  return Object.entries(params)
    .map(p => p.map(encodeURIComponent).join('='))
    .join('&')
}

function encrypt(data: string, secretKey: string): string {
  const hmac = hmacSHA256(data, secretKey)
  return Base64.stringify(hmac)
}

function generateHeader(
  channelId: string,
  nonce: string,
  signature: string
): RequestHeader {
  return {
    'Content-Type': 'application/json',
    'X-LINE-ChannelId': channelId,
    'X-LINE-Authorization-Nonce': nonce,
    'X-LINE-Authorization': signature
  }
}

export function createClientProxy(
  client: AxiosInstance,
  merchantConfig: LineMerchantConfig
) {
  const handler: ProxyHandler<AxiosInstance> = {
    get: (target, prop, receiver) => {
      if (prop === 'get') {
        const f: typeof axios.get = (url, config?) => {
          const nonce = uuidv4()
          const queryString = buildQueryString({
            ...config?.params
          })

          const text = `${merchantConfig.channelSecretKey}${url}${queryString}${nonce}`
          const signature = encrypt(text, merchantConfig.channelSecretKey)

          const headers = generateHeader(
            merchantConfig.channelId,
            nonce,
            signature
          )

          return Reflect.get(
            target,
            prop,
            receiver
          )(url, { headers, ...config })
        }

        return f
      }

      if (prop === 'post') {
        const f: typeof axios.post = (url, data, config?) => {
          const nonce = uuidv4()
          const dataString = JSON.stringify(data)

          const text = `${merchantConfig.channelSecretKey}${url}${dataString}${nonce}`
          const signature = encrypt(text, merchantConfig.channelSecretKey)

          const headers = generateHeader(
            merchantConfig.channelId,
            nonce,
            signature
          )
          return Reflect.get(target, prop, receiver)(url, data, {
            headers,
            ...config
          })
        }

        return f
      }

      return Reflect.get(target, prop, receiver)
    }
  }
  return new Proxy(client, handler)
}
