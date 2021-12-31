import {
  CheckRegKeyRequestConfig,
  CheckRegKeyRequestParams,
  checkRegKeyWithClient
} from './check-regkey'
import { FormatError, isFormatError } from './error/format'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('check-regkey', () => {
  const regKey = 'RK9D2BA19XTFQWC'

  const params: CheckRegKeyRequestParams = {}

  it('should call httpClient.get', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: CheckRegKeyRequestConfig = {
      regKey,
      params
    }

    checkRegKeyWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith(
      `/v3/payments/preapprovedPay/${regKey}/check`,
      {
        params,
        timeout: 20000
      }
    )

    expect(httpClient.get).toHaveBeenCalledTimes(1)
  })

  it('should replace default timeout with timeout in config', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: CheckRegKeyRequestConfig = {
      regKey,
      params,
      timeout: 1000
    }

    checkRegKeyWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith(
      `/v3/payments/preapprovedPay/${regKey}/check`,
      {
        params,
        timeout: 1000
      }
    )
  })

  it('should throw exception if regKey does not exist in request config', async () => {
    expect.assertions(1)

    const req = {} as CheckRegKeyRequestConfig

    try {
      await checkRegKeyWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"regKey" is required'))
      }
    }
  })
})
