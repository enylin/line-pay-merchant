import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosResponse,
  AxiosResponseTransformer
} from 'axios'
import { GeneralResponseBody, LineMerchantConfig, QueryParams } from './type'
import hmacSHA256 from 'crypto-js/hmac-sha256'
import Base64 from 'crypto-js/enc-base64'
import { v4 as uuidv4 } from 'uuid'
import { TimeoutError } from './error/timeout'
import { HttpError } from './error/http'
import { LinePayApiError } from './error/line-pay-api'

export type AuthHttpClient = AxiosInstance

type RequestHeader = {
  'Content-Type': 'application/json'
  'X-LINE-ChannelId': string
  'X-LINE-MerchantDeviceProfileId'?: string
  'X-LINE-Authorization-Nonce': string
  'X-LINE-Authorization': string
}

/**
 * convert query object to query string
 *
 * @param params query string object
 * @returns query string
 */
export function paramsSerializer(params: QueryParams): string {
  return Object.entries(params)
    .map(p =>
      p
        .map(v => v.toString())
        .map(encodeURIComponent)
        .join('=')
    )
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

/**
 * Implement LINE Pay API GET Authentication specification
 * Signature = Base64(HMAC-SHA256(Your ChannelSecret, (Your ChannelSecret + URL Path + Query String + nonce)))\
 * Query String : A query string except ? (Example: Name1=Value1&Name2=Value2...)
 */
function handleGetRequest(
  merchantConfig: LineMerchantConfig,
  config: AxiosRequestConfig
): AxiosRequestConfig {
  const nonce = uuidv4()

  const queryString = paramsSerializer({ ...config.params })

  const text = `${merchantConfig.channelSecretKey}${config.url}${queryString}${nonce}`
  const signature = encrypt(text, merchantConfig.channelSecretKey)

  const headers = generateHeader(merchantConfig.channelId, nonce, signature)
  return {
    ...config,
    headers
  }
}

/**
 * Implement LINE Pay API POST Authentication specification
 * Signature = Base64(HMAC-SHA256(Your ChannelSecret, (Your ChannelSecret + URL Path + RequestBody + nonce)))
 */
function handlePostRequest(
  merchantConfig: LineMerchantConfig,
  config: AxiosRequestConfig
): AxiosRequestConfig {
  const nonce = uuidv4()
  const dataString = JSON.stringify(config.data)

  const text = `${merchantConfig.channelSecretKey}${config.url}${dataString}${nonce}`
  const signature = encrypt(text, merchantConfig.channelSecretKey)

  const headers = generateHeader(merchantConfig.channelId, nonce, signature)
  return {
    ...config,
    headers
  }
}

export function createAuthHttpClient(
  merchantConfig: LineMerchantConfig
): AuthHttpClient {
  const PRODUCTION_URL = 'https://api-pay.line.me'
  const SANDBOX_URL = 'https://sandbox-api-pay.line.me'

  const BASE_URL =
    merchantConfig.env === 'production' ? PRODUCTION_URL : SANDBOX_URL

  /**
   * JavaScript numbers are double-precision floating-point.
   * Transaction ID is larger than the largest integer JavaScript can be precisely stored (which is 2^53, 9007199254740992).
   * So we should convert the number to string.
   */
  const transformResponse: AxiosResponseTransformer = data =>
    typeof data !== 'string'
      ? data
      : JSON.parse(
          data
            .replace(/"transactionId":\s*(\d+)/g, '"transactionId":"$1"')
            .replace(
              /"refundTransactionId":\s*(\d+)/g,
              '"refundTransactionId":"$1"'
            )
        )

  const axiosInstance = axios.create({
    baseURL: BASE_URL,
    paramsSerializer,
    timeout: merchantConfig.timeout ?? 20000,
    transformResponse
  })

  // add auth headers
  axiosInstance.interceptors.request.use(config =>
    config.method === 'get'
      ? handleGetRequest(merchantConfig, config)
      : config.method === 'post'
      ? handlePostRequest(merchantConfig, config)
      : config
  )

  axiosInstance.interceptors.response.use(
    (res: AxiosResponse<GeneralResponseBody>) => {
      if (!res.data) {
        throw new Error('Empty result')
      }

      if (res.data.returnCode.length !== 4) {
        throw new Error('Length of returnCode should be 4')
      }

      if (!res.data.returnCode.startsWith('0')) {
        throw new LinePayApiError(res.data.returnMessage, res.status, res.data)
      }

      return res
    },
    err => {
      if (err.response !== undefined) {
        throw new HttpError(err.message, err.response.status, err.response.data)
      } else if (err.response === undefined && err.code === 'ECONNABORTED') {
        throw new TimeoutError(err.message)
      }
      throw err
    }
  )

  return axiosInstance
}
