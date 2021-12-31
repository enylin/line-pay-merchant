import { FormatError, isFormatError } from './error/format'
import {
  expireRegKeyWithClient,
  ExpireRegKeyRequestBody,
  ExpireRegKeyRequestConfig
} from './expire-regkey'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('expireRegKey', () => {
  const body: ExpireRegKeyRequestBody = {}

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const regKey = 'RK9D2BA19XTFQWC'

    const req: ExpireRegKeyRequestConfig = {
      regKey,
      body
    }

    expireRegKeyWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/preapprovedPay/${regKey}/expire`,
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

    const regKey = 'RK9D2BA19XTFQWC'

    const req: ExpireRegKeyRequestConfig = {
      regKey,
      body,
      timeout: 1000
    }

    expireRegKeyWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/preapprovedPay/${regKey}/expire`,
      body,
      {
        timeout: 1000
      }
    )
  })

  it('should throw exception if regKey does not exist in request config', async () => {
    expect.assertions(1)

    const req = {} as ExpireRegKeyRequestConfig

    try {
      await expireRegKeyWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"regKey" is required'))
      }
    }
  })
})
