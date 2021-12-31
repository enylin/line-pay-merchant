import { FormatError, isFormatError } from './error/format'
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

  const transactionId = '2021113000697317600'

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: RefundRequestConfig = {
      transactionId,
      body
    }

    refundWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/${transactionId}/refund`,
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

    const req: RefundRequestConfig = {
      transactionId,
      body,
      timeout: 1000
    }

    refundWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/${transactionId}/refund`,
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
    } as RefundRequestConfig

    try {
      await refundWithClient(mockHttpClient)(req)
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
    } as RefundRequestConfig

    try {
      await refundWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"body" is required'))
      }
    }
  })
})
