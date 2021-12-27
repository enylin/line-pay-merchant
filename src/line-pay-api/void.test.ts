import { voidWithClient, VoidRequestBody, VoidRequestConfig } from './void'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('void', () => {
  const body: VoidRequestBody = {}

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const transactionId = '2021113000697317600'

    const req: VoidRequestConfig = {
      transactionId,
      body
    }

    voidWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/authorizations/${transactionId}/void`,
      body,
      {
        timeout: 20000
      }
    )

    expect(httpClient.post).toHaveBeenCalledTimes(1)
  })
})
