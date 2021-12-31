import { FormatError, isFormatError } from './error/format'
import {
  requestWithClient,
  RequestRequestBody,
  RequestRequestConfig
} from './request'

const mockHttpClient = {
  get: jest.fn(),
  post: jest.fn()
}

describe('request', () => {
  const body: RequestRequestBody = {
    amount: 100,
    currency: 'TWD',
    orderId: 'orderId',
    packages: [
      {
        id: '0',
        amount: 123,
        products: [
          {
            id: 'productId',
            name: 'LINE',
            imageUrl:
              'https://upload.wikimedia.org/wikipedia/commons/2/2e/LINE_New_App_Icon_%282020-12%29.png',
            quantity: 2,
            price: 101
          }
        ]
      }
    ],
    redirectUrls: {
      confirmUrl: 'https://www.google.com',
      cancelUrl: 'https://www.google.com'
    }
  }

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req = {
      body
    }

    requestWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith('/v3/payments/request', body, {
      timeout: 20000
    })

    expect(httpClient.post).toHaveBeenCalledTimes(1)
  })

  it('should replace default timeout with timeout in config', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const req = {
      body,
      timeout: 1000
    }

    requestWithClient(httpClient)(req)

    expect(httpClient.post).toHaveBeenCalledWith('/v3/payments/request', body, {
      timeout: 1000
    })
  })
  it('should throw exception if body does not exist in request config', async () => {
    expect.assertions(1)

    const req = {} as RequestRequestConfig

    try {
      await requestWithClient(mockHttpClient)(req)
    } catch (e) {
      if (isFormatError(e)) {
        expect(e).toEqual(new FormatError('"body" is required'))
      }
    }
  })
})
