import { LinePayApiError } from '../line-pay-api/error/line-pay-api'
import { RequestConfig } from '../payment-api/type'
import { createPaymentDetailsRecoveryHandler } from './payment-details-recovery'

describe('payment-details-recovery handler', () => {
  it('should call httpClient.post', async () => {
    expect.assertions(3)

    const details = {
      returnCode: '0000',
      returnMessage: 'message'
    }

    const httpClient = {
      get: jest
        .fn()
        .mockImplementation(() => Promise.resolve({ data: details })),
      post: jest.fn()
    }

    const converter = jest.fn()
    const predicate = jest.fn().mockImplementation(() => true)
    const handler = createPaymentDetailsRecoveryHandler(converter, predicate)

    const type = 'refund'
    const req: RequestConfig<typeof type> = {
      transactionId: 'transactionId',
      body: {
        refundAmount: 100
      }
    }
    const message = 'other error'
    const error = new LinePayApiError(message, 200, {
      returnCode: '2000',
      returnMessage: 'message'
    })
    const next = jest.fn(() => {
      throw error
    })

    const p = handler({ type, req, next, httpClient })

    expect(next).toBeCalledTimes(1)

    await p
    expect(converter).toBeCalledWith(req, details)
    expect(predicate).toBeCalledWith(error)
  })
})
