import { createAuthHttpClient } from './line-pay-api/auth-http-client'
import { confirmWithClient } from './line-pay-api/confirm'
import { refundWithClient } from './line-pay-api/refund'
import { requestWithClient } from './line-pay-api/request'
import { LineMerchantConfig } from './line-pay-api/type'
import { LinePayClient } from './type'
import { createPaymentApi } from './payment-api/create'
import { paymentDetailsWithClient } from './line-pay-api/payment-details'
import {
  createPaymentDetailsRecoveryHandler,
  toConfirmResponse,
  toRefundResponse
} from './handler/payment-details-recovery'
import { createTimeoutRetryHandler } from './handler/timeout-retry'

/**
 * Create a client for LINE Pay API.
 *
 * @param config Configuration from the LINE Pay for the client
 * @returns LINE Pay client
 */
export function createLinePayClient(config: LineMerchantConfig): LinePayClient {
  const httpClient = createAuthHttpClient(config)

  return {
    request: createPaymentApi('request', requestWithClient, httpClient),
    confirm: createPaymentApi('confirm', confirmWithClient, httpClient),
    refund: createPaymentApi('refund', refundWithClient, httpClient),
    paymentDetails: createPaymentApi(
      'paymentDetails',
      paymentDetailsWithClient,
      httpClient
    )
  }
}

export const handler = {
  createPaymentDetailsRecoveryHandler,
  createTimeoutRetryHandler,
  toConfirmResponse,
  toRefundResponse
}
