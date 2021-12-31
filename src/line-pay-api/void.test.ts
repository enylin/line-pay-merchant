import { FormatError, isFormatError } from './error/format'
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

  it('should replace default timeout with timeout in config', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const transactionId = '2021113000697317600'

    const req: VoidRequestConfig = {
      transactionId,
      body,
      timeout: 1000
    }

    voidWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/authorizations/${transactionId}/void`,
      body,
      {
        timeout: 1000
      }
    )
  })

  it('should throw exception if transactionId does not exist in request config', async () => {
    expect.assertions(1)

    const req = {} as VoidRequestConfig

    try {
      await voidWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"transactionId" is required'))
      }
    }
  })
})
