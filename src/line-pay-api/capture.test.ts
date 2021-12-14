import {
  captureWithClient,
  CaptureRequestBody,
  CaptureRequestConfig
} from './capture'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('capture', () => {
  const body: CaptureRequestBody = {
    amount: 100,
    currency: 'TWD'
  }

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const transactionId = '2021113000697317600'

    const req: CaptureRequestConfig = {
      transactionId,
      body
    }

    captureWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/authorizations/${transactionId}/capture`,
      body,
      {
        timeout: 60000
      }
    )

    expect(httpClient.post).toHaveBeenCalledTimes(1)
  })
})
