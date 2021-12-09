import {
  confirmWithClient,
  ConfirmRequestBody,
  ConfirmRequestConfig
} from './confirm'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('confirm', () => {
  const body: ConfirmRequestBody = {
    amount: 100,
    currency: 'TWD'
  }

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const transactionId = '2021113000697317600'

    const req: ConfirmRequestConfig = {
      transactionId,
      body
    }

    confirmWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/${transactionId}/confirm`,
      body
    )

    expect(httpClient.post).toHaveBeenCalledTimes(1)
  })
})
