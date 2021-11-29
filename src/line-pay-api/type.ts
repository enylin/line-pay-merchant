export type QueryParams = Record<string, string | number | boolean>

export type Currency = 'USD' | 'JPY' | 'TWD' | 'THB'

export type LineMerchantConfig = {
  channelId: string
  channelSecretKey: string
  env: 'development' | 'production'
}
