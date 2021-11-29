import { createApiClient } from './line-pay-api'
import { LineMerchantConfig } from './line-pay-api/type'

export function initializeMerchant(config: LineMerchantConfig) {
  const apiClient = createApiClient(config)
  return apiClient
}
