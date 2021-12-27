import {
  CheckRegKeyRequestConfig,
  CheckRegKeyRequestParams,
  checkRegKeyWithClient
} from './check-regkey'

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
})
