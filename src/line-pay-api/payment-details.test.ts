import { FormatError, isFormatError } from './error/format'
import {
  PaymentDetailsRequestConfig,
  PaymentDetailsRequestParams,
  paymentDetailsWithClient
} from './payment-details'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('payment-details', () => {
  const transactionId = '2021113000697317600'

  const params: PaymentDetailsRequestParams = {
    transactionId: [transactionId]
  }

  it('should call httpClient.get', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: PaymentDetailsRequestConfig = {
      params
    }

    paymentDetailsWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith('/v3/payments', {
      ...req,
      timeout: 60000
    })

    expect(httpClient.get).toHaveBeenCalledTimes(1)
  })

  it('should replace default timeout with timeout in config', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.get.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req: PaymentDetailsRequestConfig = {
      params,
      timeout: 1000
    }

    paymentDetailsWithClient(httpClient)(req)

    expect(httpClient.get).toHaveBeenCalledWith('/v3/payments', {
      ...req,
      timeout: 1000
    })
  })

  it('should throw exception if params does not exist in request config', async () => {
    expect.assertions(1)

    const req = {} as PaymentDetailsRequestConfig

    try {
      await paymentDetailsWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"params" is required'))
      }
    }
  })

  it('should throw exception if both transactionId and orderId do not exist in params', async () => {
    expect.assertions(1)

    const req = {
      params: {}
    } as PaymentDetailsRequestConfig

    try {
      await paymentDetailsWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(
          new FormatError('transactionId or orderId is required')
        )
      }
    }
  })

  it('should throw exception if both transactionId and orderId have length 0', async () => {
    expect.assertions(1)

    const req = {
      params: {
        transactionId: [],
        orderId: []
      }
    } as PaymentDetailsRequestConfig

    try {
      await paymentDetailsWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(
          new FormatError('transactionId or orderId is required')
        )
      }
    }
  })
})
