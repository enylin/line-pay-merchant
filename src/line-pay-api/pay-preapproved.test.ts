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

  it('should call httpClient.post', async () => {
    const httpClient = mockHttpClient

    mockHttpClient.post.mockReturnValueOnce(Promise.resolve({ data: {} }))

    const regKey = 'RK9D2BA19XTFQWC'

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
})
