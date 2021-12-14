import {
  PaymentDetailsRequestConfig,
  PaymentDetailsRequestParams,
  paymentDetailsWithClient
} from './payment-details'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('payment-details', () => {
  const transactionId = '2021113000697317600'

  const params: PaymentDetailsRequestParams = {
    transactionId: [transactionId]
  }

  it('should call httpClient.get', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: PaymentDetailsRequestConfig = {
      params
    }

    paymentDetailsWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith('/v3/payments', req)

    expect(httpClient.get).toHaveBeenCalledTimes(1)
  })
})
