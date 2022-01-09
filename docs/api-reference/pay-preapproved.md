# Pay Preapproved API

## Overview

An automatic payment registration process is required using [Request API](https://pay.line.me/documents/online_v3_en.html#request-api) and [Confirm API](https://pay.line.me/documents/online_v3_en.html#confirm-api). With **RegKey** sent through the Confirm API, the payment can be processed without use approval.

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(payPreapprovedRequestConfig)
```

Returns `Promise<ApiResponse<PayPreapprovedResponseBody>>`

### Request Config

@[code{5-44} ts](@/line-pay-api/pay-preapproved.ts)

### Response Body

@[code{46-70} ts](@/line-pay-api/pay-preapproved.ts)

### Return Code

#### Success

Code | Description
:----:|:------------------------
0000 | Success


#### Error

Code | Description
:----:|:------------------------
1101 | Not a LINE Pay member
1102 | The member is unable to proceed the transaction.
1104 | Non-existing merchant
1105 | The merchant cannot use the LINE Pay.
1106 | A header info error
1110 | Unacceptable credit card
1124 | Amount info error (scale)
1141 | A payment account error
1142 | Low balance
1150 | Cannot find the transaction history
1152 | There is a history of transactions with the same transactionId.
1153 | The payment amount is different than the requested amount.
1159 | Payment request information is not found.
1169 | Must select a payment method and password authentication at the LINE Pay.
1170 | Balance of the member's account has been changed.
1172 | A record of transaction with the same order number already exists.
1180 | The payment has been expired.
1198 | API call request has been duplicated.
1199 | An internal request error
1280 | A temporary error occurred while processing the credit card payment.
1281 | A credit card payment error
1282 | A credit card authorization error
1283 | The payment was refused due to suspected fraud.
1284 | The credit card payment has temporarily stopped.
1285 | Missing credit card payment information
1286 | Wrong credit card payment information
1287 | The credit card has been expired
1288 | The credit card has low balance
1289 | Exceeded the credit card limit
1290 | Exceeded the limit of the credit card per payment
1291 | The card has been reported as a stolen card.
1292 | The card has been suspended.
1293 | A CVN input error
1294 | The card is listed on the blacklist.
1295 | A wrong credit card number
1296 | Unable to proceed the amount
1298 | The card has been declined.
9000 | An internal error
### Example

#### Request
```ts
const res = await linePayClient.payPreapproved.send({
  regKey: 'RK9A2BA1937EQTO',
  body: {
    productName: 'Demo Product',
    amount: 100,
    currency: 'TWD',
    orderId: '20211221001'
  }
})
```

#### Response
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "Success.",
    "info": {
      "transactionId": "2021123112345678910",
      "transactionDate": "2021-12-31T09:00:31Z"
    }
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `PayPreapprovedClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // payPreapproved
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `PayPreapprovedClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
