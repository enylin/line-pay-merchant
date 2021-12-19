import {
  CheckPaymentStatusRequestConfig,
  CheckPaymentStatusRequestParams,
  checkPaymentStatusWithClient
} from './check-payment-status'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('check-payment-status', () => {
  const transactionId = '2021113000697317600'

  const params: CheckPaymentStatusRequestParams = {
    transactionId: transactionId
  }

  it('should call httpClient.get', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: CheckPaymentStatusRequestConfig = {
      params
    }

    checkPaymentStatusWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith(
      `/v3/payments/requests/${transactionId}/check`,
      {
        ...req,
        timeout: 20000
      }
    )

    expect(httpClient.get).toHaveBeenCalledTimes(1)
  })
})
