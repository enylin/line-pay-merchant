import { FormatError, isFormatError } from './error/format'
import {
  payPreapprovedWithClient,
  PayPreapprovedRequestBody,
  PayPreapprovedRequestConfig
} from './pay-preapproved'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('payPreapproved', () => {
  const body: PayPreapprovedRequestBody = {
    productName: 'Demo Product',
    amount: 100,
    currency: 'TWD',
    orderId: '20211221001'
  }

  const regKey = 'RK9D2BA19XTFQWC'

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: PayPreapprovedRequestConfig = {
      regKey,
      body
    }

    payPreapprovedWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/preapprovedPay/${regKey}/payment`,
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

    const req: PayPreapprovedRequestConfig = {
      regKey,
      body,
      timeout: 1000
    }

    payPreapprovedWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith(
      `/v3/payments/preapprovedPay/${regKey}/payment`,
      body,
      {
        timeout: 1000
      }
    )
  })

  it('should throw exception if regKey does not exist in request config', async () => {
    expect.assertions(1)

    const req = {
      body
    } as PayPreapprovedRequestConfig

    try {
      await payPreapprovedWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"regKey" is required'))
      }
    }
  })

  it('should throw exception if body does not exist in request config', async () => {
    expect.assertions(1)

    const req = {
      regKey
    } as PayPreapprovedRequestConfig

    try {
      await payPreapprovedWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"body" is required'))
      }
    }
  })
})
