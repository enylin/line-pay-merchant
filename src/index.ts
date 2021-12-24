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
import { captureWithClient } from './line-pay-api/capture'
import { HttpError, isHttpError } from './line-pay-api/error/http'
import {
  LinePayApiError,
  isLinePayApiError
} from './line-pay-api/error/line-pay-api'
import { TimeoutError, isTimeoutError } from './line-pay-api/error/timeout'
import { checkPaymentStatusWithClient } from './line-pay-api/check-payment-status'
import { payPreapprovedWithClient } from './line-pay-api/pay-preapproved'
import { checkRegKeyWithClient } from './line-pay-api/check-regkey'
import { expireRegKeyWithClient } from './line-pay-api/expire-regkey'

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
    capture: createPaymentApi('capture', captureWithClient, httpClient),
    refund: createPaymentApi('refund', refundWithClient, httpClient),
    paymentDetails: createPaymentApi(
      'paymentDetails',
      paymentDetailsWithClient,
      httpClient
    ),
    checkPaymentStatus: createPaymentApi(
      'checkPaymentStatus',
      checkPaymentStatusWithClient,
      httpClient
    ),
    checkRegKey: createPaymentApi(
      'checkRegKey',
      checkRegKeyWithClient,
      httpClient
    ),
    payPreapproved: createPaymentApi(
      'payPreapproved',
      payPreapprovedWithClient,
      httpClient
    ),
    expireRegKey: createPaymentApi(
      'expireRegKey',
      expireRegKeyWithClient,
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

export const error = {
  HttpError,
  isHttpError,
  LinePayApiError,
  isLinePayApiError,
  TimeoutError,
  isTimeoutError
}
