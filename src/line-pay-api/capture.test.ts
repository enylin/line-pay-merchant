import {
  captureWithClient,
  CaptureRequestBody,
  CaptureRequestConfig
} from './capture'
import { FormatError, isFormatError } from './error/format'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('capture', () => {
  const body: CaptureRequestBody = {
    amount: 100,
    currency: 'TWD'
  }

  const transactionId = '2021113000697317600'

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

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

  it('should replace default timeout with timeout in config', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: CaptureRequestConfig = {
      transactionId,
      body,
      timeout: 1000
    }

    captureWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/authorizations/${transactionId}/capture`,
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
    } as CaptureRequestConfig

    try {
      await captureWithClient(mockHttpClient)(req)
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
    } as CaptureRequestConfig

    try {
      await captureWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"body" is required'))
      }
    }
  })
})
