import axios, { AxiosInstance, AxiosRequestConfig } from 'axios'
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

export function paramsSerializer(params: QueryParams): string {
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

function handleGetRequest(
  merchantConfig: LineMerchantConfig,
  config: AxiosRequestConfig
): AxiosRequestConfig {
  const nonce = uuidv4()
  const queryString = paramsSerializer({
    ...config?.params
  })

  const text = `${merchantConfig.channelSecretKey}${config.url}${queryString}${nonce}`
  const signature = encrypt(text, merchantConfig.channelSecretKey)

  const headers = generateHeader(merchantConfig.channelId, nonce, signature)
  return {
    ...config,
    headers
  }
}

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

  const axiosInstance = axios.create({
    baseURL: BASE_URL,
    paramsSerializer,
    timeout: merchantConfig.timeout || 20000
  })

  axiosInstance.interceptors.request.use(config =>
    config.method === 'get'
      ? handleGetRequest(merchantConfig, config)
      : config.method === 'post'
      ? handlePostRequest(merchantConfig, config)
      : config
  )

  axiosInstance.interceptors.response.use(
    res => {
      if (res.data.returnCode !== '0000') {
        throw {
          statusCode: res.status,
          data: res.data
        }
      }

      return res
    },
    err => {
      throw {
        statusCode: err.response.status,
        data: err.response.data
      }
    }
  )

  return axiosInstance
}
