import { paramsSerializer } from './auth-http-client'

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
})
