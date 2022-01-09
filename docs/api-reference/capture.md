# Capture API

## Overview

Transactions that have set options.payment.capture as `false` when requesting the Request API payment will be put on hold when the payment is completed with the Confirm API. In order to finalize the payment, an additional purchase with Capture API is required.

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(captureRequestConfig)
```

Returns `Promise<ApiResponse<CaptureResponseBody>>`
### Request Config

@[code{6-49} ts](@/line-pay-api/capture.ts)

### Response Body

@[code{52-86} ts](@/line-pay-api/capture.ts)

### Return Code

#### Success

Code | Description
:----:|:------------------------
0000 | Success


#### Error

Code | Description
:----:|:------------------------
1104 | Non-existing merchant
1105 | The merchant cannot use the LINE Pay.
1106 | A header info error
1150 | Cannot find the transaction history
1155 | Wrong transaction number
1170 | Balance of the member's account has been changed.
1172 | A record of transaction with the same order number already exists.
1179 | Unable to proceed the transaction.
1183 | The payment amount should be greater than 0.
1184 | The payment amount exceeds requested amount.
1198 | Either API call has been duplicated or purchase API has been called while re-authorization was automatically processed (Repeat after several minutes).
1199 | Internal request error
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
const res = await linePayClient.capture
  .send({
    transactionId: '2021121300698360310',
    body: {
      currency: 'TWD',
      amount: 1000
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
      "transactionId": "2021121300698360310",
      "orderId": "20211216002",
      "payInfo": [{
        "method": "BALANCE",
        "amount": 900
      }, {
        "method": "DISCOUNT",
        "amount": 100
      }]
    }
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `CaptureClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // capture
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `CaptureClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
