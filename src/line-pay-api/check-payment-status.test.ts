import {
  CheckPaymentStatusRequestConfig,
  CheckPaymentStatusRequestParams,
  checkPaymentStatusWithClient
} from './check-payment-status'
import { FormatError, isFormatError } from './error/format'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('check-payment-status', () => {
  const transactionId = '2021113000697317600'

  const params: CheckPaymentStatusRequestParams = {}

  it('should call httpClient.get', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: CheckPaymentStatusRequestConfig = {
      transactionId: transactionId,
      params
    }

    checkPaymentStatusWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith(
      `/v3/payments/requests/${transactionId}/check`,
      {
        params,
        timeout: 20000
      }
    )

    expect(httpClient.get).toHaveBeenCalledTimes(1)
  })

  it('should replace default timeout with timeout in config', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: CheckPaymentStatusRequestConfig = {
      transactionId: transactionId,
      params,
      timeout: 1000
    }

    checkPaymentStatusWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith(
      `/v3/payments/requests/${transactionId}/check`,
      {
        params,
        timeout: 1000
      }
    )
  })

  it('should throw exception if transactionId does not exist in request config', async () => {
    expect.assertions(1)

    const req = {
      params
    } as CheckPaymentStatusRequestConfig

    try {
      await checkPaymentStatusWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"transactionId" is required'))
      }
    }
  })

  it('should throw exception if params does not exist in request config', async () => {
    expect.assertions(1)

    const req = {
      transactionId
    } as CheckPaymentStatusRequestConfig

    try {
      await checkPaymentStatusWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"params" is required'))
      }
    }
  })
})
