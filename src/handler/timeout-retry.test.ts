import { LinePayApiError, TimeoutError } from '..'
import { ApiResponse, RequestConfig, ResponseBody } from '../payment-api/type'
import { createTimeoutRetryHandler } from './timeout-retry'

const httpClient = {
  get: jest.fn(),
  post: jest.fn()
}

jest.useFakeTimers()

beforeEach(() => {
  jest.clearAllTimers()
})

describe('timeout-retry handler', () => {
  it('should not retry if "next" throws any exception other than Timeout Error', async () => {
    expect.assertions(2)
    const maxRetry = 20
    const retryTimeout = 1000

    const type = 'refund'
    const req: RequestConfig<typeof type> = {
      transactionId: 'transactionId',
      body: {
        refundAmount: 100
      }
    }
    const message = 'other error'
    const next = jest.fn(() => {
      throw new LinePayApiError(message, 200, {
        returnCode: '2000',
        returnMessage: 'message'
      })
    })

    const handler = createTimeoutRetryHandler(maxRetry, retryTimeout)

    const p = handler({ type, req, next, httpClient })

    jest.runAllTimers()
    expect(next).toBeCalledTimes(1)

    try {
      await p
    } catch (e) {
      expect(e).toBeInstanceOf(LinePayApiError)
    }
  })

  it('should retry every "retryTimeout" millisecond', async () => {
    expect.assertions(3)
    const maxRetry = 20
    const retryTimeout = 1000

    const type = 'refund'
    const req: RequestConfig<typeof type> = {
      transactionId: 'transactionId',
      body: {
        refundAmount: 100
      }
    }
    const message = 'timeout error'
    const next = jest.fn(() => {
      throw new TimeoutError(message)
    })

    const handler = createTimeoutRetryHandler(maxRetry, retryTimeout)

    const p = handler({ type, req, next, httpClient })

    const retryNumberOfTimes = 5
    jest.advanceTimersByTime(retryTimeout * retryNumberOfTimes)

    expect(next).toBeCalledTimes(retryNumberOfTimes + 1)

    jest.runAllTimers()

    try {
      await p
    } catch (e) {
      expect(e).toBeInstanceOf(TimeoutError)

      if (e instanceof TimeoutError) {
        expect(e.message).toBe(message)
      }
    }
  })

  it('should use default value for "retryTimeout" if no value is passed', async () => {
    expect.assertions(3)
    const maxRetry = 20
    const retryTimeout = 5000

    const type = 'refund'
    const req: RequestConfig<typeof type> = {
      transactionId: 'transactionId',
      body: {
        refundAmount: 100
      }
    }
    const message = 'timeout error'
    const next = jest.fn(() => {
      throw new TimeoutError(message)
    })

    const handler = createTimeoutRetryHandler(maxRetry)

    const p = handler({ type, req, next, httpClient })

    const retryNumberOfTimes = 5
    jest.advanceTimersByTime(retryTimeout * retryNumberOfTimes)

    expect(next).toBeCalledTimes(retryNumberOfTimes + 1)

    jest.runAllTimers()

    try {
      await p
    } catch (e) {
      expect(e).toBeInstanceOf(TimeoutError)

      if (e instanceof TimeoutError) {
        expect(e.message).toBe(message)
      }
    }
  })

  it('should retry "maxRetry" times if "next" throws Timeout Error every time', async () => {
    expect.assertions(3)
    const maxRetry = 20
    const retryTimeout = 1000

    const type = 'refund'
    const req: RequestConfig<typeof type> = {
      transactionId: 'transactionId',
      body: {
        refundAmount: 100
      }
    }
    const message = 'timeout error'
    const next = jest.fn(() => {
      throw new TimeoutError(message)
    })

    const handler = createTimeoutRetryHandler(maxRetry, retryTimeout)

    const p = handler({ type, req, next, httpClient })

    jest.runAllTimers()
    expect(next).toBeCalledTimes(maxRetry + 1)

    try {
      await p
    } catch (e) {
      expect(e).toBeInstanceOf(TimeoutError)

      if (e instanceof TimeoutError) {
        expect(e.message).toBe(message)
      }
    }
  })

  it('should use default value for "maxRetry" if no value is passed', async () => {
    expect.assertions(3)
    const maxRetry = 10

    const type = 'refund'
    const req: RequestConfig<typeof type> = {
      transactionId: 'transactionId',
      body: {
        refundAmount: 100
      }
    }
    const message = 'timeout error'
    const next = jest.fn(() => {
      throw new TimeoutError(message)
    })

    const handler = createTimeoutRetryHandler()

    const p = handler({ type, req, next, httpClient })

    jest.runAllTimers()
    expect(next).toBeCalledTimes(maxRetry + 1)

    try {
      await p
    } catch (e) {
      expect(e).toBeInstanceOf(TimeoutError)

      if (e instanceof TimeoutError) {
        expect(e.message).toBe(message)
      }
    }
  })
})

it('should retry n times if the nth "next" call throws error other than Timeout Error', async () => {
  expect.assertions(3)
  const maxRetry = 20
  const retryTimeout = 1000
  const retryNumberOfTimes = 1

  const type = 'refund'
  const req: RequestConfig<typeof type> = {
    transactionId: 'transactionId',
    body: {
      refundAmount: 100
    }
  }
  const message = 'API Error'

  const next = jest.fn()
  for (let i = 0; i < retryNumberOfTimes; i++) {
    next.mockImplementationOnce(() => {
      throw new TimeoutError('timeout error')
    })
  }
  next.mockImplementationOnce(() => {
    throw new LinePayApiError(message, 200, {
      returnCode: '2000',
      returnMessage: 'message'
    })
  })
  next.mockImplementationOnce(() => {
    throw new TimeoutError('timeout error')
  })

  const handler = createTimeoutRetryHandler(maxRetry, retryTimeout)

  const p = handler({ type, req, next, httpClient })

  jest.runAllTimers()
  expect(next).toBeCalledTimes(retryNumberOfTimes + 1)

  try {
    await p
  } catch (e) {
    expect(e).toBeInstanceOf(LinePayApiError)

    if (e instanceof LinePayApiError) {
      expect(e.message).toBe(message)
    }
  }
})

it('should retry n times if the nth "next" call does not throw exception', async () => {
  expect.assertions(2)
  const maxRetry = 20
  const retryTimeout = 1000
  const retryNumberOfTimes = 1

  const type = 'refund'
  const req: RequestConfig<typeof type> = {
    transactionId: 'transactionId',
    body: {
      refundAmount: 100
    }
  }
  const res: ApiResponse<ResponseBody<typeof type>> = {
    body: {
      returnCode: '0000',
      returnMessage: 'Success.',
      info: {
        refundTransactionId: '2021121600698710312',
        refundTransactionDate: '2021-12-16T00:50:15Z'
      }
    },
    comments: {}
  }

  const next = jest.fn()
  for (let i = 0; i < retryNumberOfTimes; i++) {
    next.mockImplementationOnce(() => {
      throw new TimeoutError('timeout error')
    })
  }

  next.mockResolvedValueOnce(res)
  next.mockImplementationOnce(() => {
    throw new TimeoutError('timeout error')
  })

  const handler = createTimeoutRetryHandler(maxRetry, retryTimeout)

  const p = handler({ type, req, next, httpClient })

  jest.runAllTimers()
  expect(next).toBeCalledTimes(retryNumberOfTimes + 1)

  expect(await p).toEqual(res)
})
