import {
  confirmWithClient,
  ConfirmRequestBody,
  ConfirmRequestConfig
} from './confirm'
import { FormatError, isFormatError } from './error/format'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('confirm', () => {
  const body: ConfirmRequestBody = {
    amount: 100,
    currency: 'TWD'
  }

  const transactionId = '2021113000697317600'

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: ConfirmRequestConfig = {
      transactionId,
      body
    }

    confirmWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/${transactionId}/confirm`,
      body,
      {
        timeout: 40000
      }
    )

    expect(httpClient.post).toHaveBeenCalledTimes(1)
  })

  it('should replace default timeout with timeout in config', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: ConfirmRequestConfig = {
      transactionId,
      body,
      timeout: 1000
    }

    confirmWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/${transactionId}/confirm`,
      body,
      {
        timeout: 1000
      }
    )
  })

  it('should throw exception if transactionId does not exist in request config', async () => {
    expect.assertions(1)

    const req = {
      body
    } as ConfirmRequestConfig

    try {
      await confirmWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"transactionId" is required'))
      }
    }
  })

  it('should throw exception if body does not exist in request config', async () => {
    expect.assertions(1)

    const req = {
      transactionId
    } as ConfirmRequestConfig

    try {
      await confirmWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"body" is required'))
      }
    }
  })
})
