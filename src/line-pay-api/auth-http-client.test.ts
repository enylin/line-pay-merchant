import { createAuthHttpClient, paramsSerializer } from './auth-http-client'
import { LineMerchantConfig } from './type'
import MockAdapter from 'axios-mock-adapter'
import { isLinePayApiError, LinePayApiError } from './error/line-pay-api'
import { isTimeoutError, TimeoutError } from './error/timeout'
import { HttpError, isHttpError } from './error/http'

const mockedUuid = '00000000-0000-0000-0000-000000000000'
jest.mock('uuid', () => ({ v4: () => mockedUuid }))

describe('auth-http-client', () => {
  describe('paramsSerializer', () => {
    it('should convert query object with primitive value to query string', () => {
      const queryString = paramsSerializer({
        orderId: '20211216004',
        amount: 100,
        sandbox: false
      })

      expect(queryString).toBe('orderId=20211216004&amount=100&sandbox=false')
    })

    it('should convert query object with array of string value to query string', () => {
      const queryString = paramsSerializer({
        orderId: '20211216004',
        transactionId: ['2021113000697317600']
      })

      expect(queryString).toBe(
        'orderId=20211216004&transactionId=2021113000697317600'
      )
    })
  })

  describe('httpClient', () => {
    const merchantConfig: LineMerchantConfig = {
      channelId: 'channelId',
      channelSecretKey: 'channelSecretKey',
      env: 'development'
    }

    const url = 'https://sandbox-api-pay.line.me/v3/payments'

    const transactionId = '2021113000697317600'

    it('should send to production server if env is set to production', async () => {
      expect.assertions(1)

      const merchantConfig: LineMerchantConfig = {
        channelId: 'channelId',
        channelSecretKey: 'channelSecretKey',
        env: 'production'
      }

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)
      const mockResult = {
        returnCode: '0000',
        returnMessage: 'Success.'
      }

      mock.onPost(/.*/).reply(200, JSON.stringify(mockResult))

      const res = await httpClient.post(url)
      expect(res.config.baseURL).toBe('https://api-pay.line.me')
    })

    it('should send to sandbox server if env is set to development', async () => {
      expect.assertions(1)

      const merchantConfig: LineMerchantConfig = {
        channelId: 'channelId',
        channelSecretKey: 'channelSecretKey',
        env: 'development'
      }

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)
      const mockResult = {
        returnCode: '0000',
        returnMessage: 'Success.'
      }

      mock.onPost(/.*/).reply(200, JSON.stringify(mockResult))

      const res = await httpClient.post(url)
      expect(res.config.baseURL).toBe('https://sandbox-api-pay.line.me')
    })

    it('should throw exception if returnCode is not a 4-digit number', async () => {
      expect.assertions(1)

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)

      const mockResult = {
        returnCode: '000',
        returnMessage: 'Success.'
      }
      mock.onPost(/.*/).reply(200, JSON.stringify(mockResult))

      try {
        await httpClient.post(url)
      } catch (e) {
        expect(e).toEqual(new Error('Length of returnCode should be 4'))
      }
    })

    it('should throw exception if the result is empty', async () => {
      expect.assertions(1)

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)

      mock.onPost(/.*/).reply(200, undefined)

      try {
        await httpClient.post(url)
      } catch (e) {
        expect(e).toEqual(new Error('Empty result'))
      }
    })

    it('should throw exception if the result format is not JSON string', async () => {
      expect.assertions(1)

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)

      mock.onPost(/.*/).reply(200, 123)

      try {
        await httpClient.post(url)
      } catch (e) {
        expect(e instanceof Error).toBe(true)
      }
    })

    it('should throw exception if returnCode is not begin with 0', async () => {
      expect.assertions(3)

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)

      const mockResult = {
        returnCode: '2101',
        returnMessage: 'A parameter error'
      }
      const error = new LinePayApiError(
        mockResult.returnMessage,
        200,
        mockResult
      )
      mock.onPost(/.*/).reply(200, JSON.stringify(mockResult))

      try {
        await httpClient.post(url)
      } catch (e) {
        if (isLinePayApiError(e)) {
          expect(e).toEqual(error)
          expect(e.statusCode).toBe(error.statusCode)
          expect(e.data).toEqual(error.data)
        }
      }
    })

    it('should throw exception if an API times out', async () => {
      expect.assertions(1)

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)
      const error = new TimeoutError('timeout of 20000ms exceeded')
      mock.onPost(/.*/).timeout()

      try {
        await httpClient.post(url)
      } catch (e) {
        if (isTimeoutError(e)) {
          expect(e).toEqual(error)
        }
      }
    })

    it('should replace default timeout with timeout in config', async () => {
      expect.assertions(1)

      const merchantConfig: LineMerchantConfig = {
        channelId: 'channelId',
        channelSecretKey: 'channelSecretKey',
        timeout: 10000,
        env: 'development'
      }

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)
      const error = new TimeoutError('timeout of 10000ms exceeded')
      mock.onPost(/.*/).timeout()

      try {
        await httpClient.post(url)
      } catch (e) {
        if (isTimeoutError(e)) {
          expect(e).toEqual(error)
        }
      }
    })

    it('should throw exception if it encounters an HTTP error', async () => {
      expect.assertions(3)

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)
      const mockResult = {
        msg: 'some error message'
      }
      const error = new HttpError(
        'Request failed with status code 500',
        500,
        mockResult
      )

      mock.onPost(/.*/).reply(500, JSON.stringify(mockResult))

      try {
        await httpClient.post(url)
      } catch (e) {
        if (isHttpError(e)) {
          expect(e).toEqual(error)
          expect(e.statusCode).toBe(error.statusCode)
          expect(e.data).toEqual(error.data)
        }
      }
    })

    it('should throw exception if it encounters an network error', async () => {
      expect.assertions(1)

      const httpClient = createAuthHttpClient(merchantConfig)
      const mock = new MockAdapter(httpClient)
      const error = new Error('Network Error')
      mock.onPost(/.*/).networkError()

      try {
        await httpClient.post(url)
      } catch (e) {
        expect(e).toEqual(error)
      }
    })

    it('should convert all transactionIds in result to string', async () => {
      const testCases = [
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":2021113000697317610}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":"2021113000697317610"}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId": 2021113000697317610}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":"2021113000697317610"}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":2021113000697317610,"n2":123}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":"2021113000697317610","n2":123}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":2021113000697317610, "n2": 123}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":"2021113000697317610","n2":123}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":2021113000697317610, "n2": 123}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"transactionId":"2021113000697317610","n2":123}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","transactionId":2021113000697317610,"info":{"transactionId":2021113000697317610}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","transactionId":"2021113000697317610","info":{"transactionId":"2021113000697317610"}}'
          )
        }
      ]

      expect.assertions(testCases.length)

      await Promise.all(
        testCases.map(async ({ resultString, expected }) => {
          const httpClient = createAuthHttpClient(merchantConfig)
          const mock = new MockAdapter(httpClient)
          mock.onGet(/.*/).reply(200, resultString)

          const res = await httpClient.get(url)
          expect(res.data).toEqual(expected)
        })
      )
    })

    it('should convert all refundTransactionIds in result to string', async () => {
      const testCases = [
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":2021113000697317610}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":"2021113000697317610"}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId": 2021113000697317610}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":"2021113000697317610"}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":2021113000697317610,"n2":123}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":"2021113000697317610","n2":123}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":2021113000697317610, "n2": 123}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":"2021113000697317610","n2":123}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":2021113000697317610, "n2": 123}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","info":{"refundTransactionId":"2021113000697317610","n2":123}}'
          )
        },
        {
          resultString:
            '{"returnCode":"0000","returnMessage":"Success.","refundTransactionId":2021113000697317610,"info":{"refundTransactionId":2021113000697317610}}',
          expected: JSON.parse(
            '{"returnCode":"0000","returnMessage":"Success.","refundTransactionId":"2021113000697317610","info":{"refundTransactionId":"2021113000697317610"}}'
          )
        }
      ]

      expect.assertions(testCases.length)

      await Promise.all(
        testCases.map(async ({ resultString, expected }) => {
          const httpClient = createAuthHttpClient(merchantConfig)
          const mock = new MockAdapter(httpClient)
          mock.onGet(/.*/).reply(200, resultString)

          const res = await httpClient.get(url)
          expect(res.data).toEqual(expected)
        })
      )
    })

    describe('get()', () => {
      it('should return correct result', async () => {
        expect.assertions(1)

        const httpClient = createAuthHttpClient(merchantConfig)
        const mock = new MockAdapter(httpClient)

        const mockResult = {
          returnCode: '0000',
          returnMessage: 'Success.'
        }
        mock.onGet(/.*/).reply(200, JSON.stringify(mockResult))

        const res = await httpClient.get(url)

        expect(res.data).toEqual(mockResult)
      })

      it('should set correct headers', async () => {
        expect.assertions(1)

        const header = {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': merchantConfig.channelId,
          'X-LINE-Authorization-Nonce': mockedUuid,
          'X-LINE-Authorization': 'CcToW3HaslH44yvJNliuomtkwufd8aC048p3QXZPlj8='
        }

        const httpClient = createAuthHttpClient(merchantConfig)
        const mock = new MockAdapter(httpClient)

        const mockResult = {
          returnCode: '0000',
          returnMessage: 'Success.'
        }
        mock.onGet(/.*/).reply(200, JSON.stringify(mockResult))

        const res = await httpClient.get(url, {
          params: { transactionId }
        })

        expect(res.config.headers).toEqual(header)
      })
    })

    describe('post()', () => {
      it('should return correct result', async () => {
        expect.assertions(1)

        const httpClient = createAuthHttpClient(merchantConfig)
        const mock = new MockAdapter(httpClient)

        const mockResult = {
          returnCode: '0000',
          returnMessage: 'Success.'
        }
        mock.onPost(/.*/).reply(200, JSON.stringify(mockResult))

        const res = await httpClient.post(url)

        expect(res.data).toEqual(mockResult)
      })

      it('should set correct headers', async () => {
        expect.assertions(1)

        const header = {
          'Content-Type': 'application/json',
          'X-LINE-ChannelId': merchantConfig.channelId,
          'X-LINE-Authorization-Nonce': mockedUuid,
          'X-LINE-Authorization': 'En0nRkzzQpXrXo6OHNV+827g+rWIwUq5VTk/n9Jm5Ek='
        }

        const httpClient = createAuthHttpClient(merchantConfig)
        const mock = new MockAdapter(httpClient)

        const mockResult = {
          returnCode: '0000',
          returnMessage: 'Success.'
        }
        mock.onPost(/.*/).reply(200, JSON.stringify(mockResult))

        const res = await httpClient.post(url, {
          transactionId
        })

        expect(res.config.headers).toEqual(header)
      })
    })

    describe('put()', () => {
      it('should not set headers', async () => {
        expect.assertions(1)

        const header = {
          Accept: 'application/json, text/plain, */*',
          'Content-Type': 'application/json'
        }

        const httpClient = createAuthHttpClient(merchantConfig)
        const mock = new MockAdapter(httpClient)

        const mockResult = {
          returnCode: '0000',
          returnMessage: 'Success.'
        }
        mock.onPut(/.*/).reply(200, JSON.stringify(mockResult))

        const res = await httpClient.put(url, {
          transactionId
        })

        expect(res.config.headers).toEqual(header)
      })
    })
  })
})
