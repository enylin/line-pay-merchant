import {
  refundWithClient,
  RefundRequestBody,
  RefundRequestConfig
} from './refund'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('refund', () => {
  const body: RefundRequestBody = {
    refundAmount: 100
  }

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const transactionId = '2021113000697317600'

    const req: RefundRequestConfig = {
      transactionId,
      body
    }

    refundWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/${transactionId}/refund`,
      body
    )

    expect(httpClient.post).toHaveBeenCalledTimes(1)
  })
})
