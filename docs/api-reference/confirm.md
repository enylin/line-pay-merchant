# Confirm API

## Overview

An API for the merchant to complete the payment when the user approves with the [ConfirmURL](https://pay.line.me/documents/online_v3_en.html?shell#confirmurl-spec) or [Check Payment Status API](https://pay.line.me/documents/online_v3_en.html?shell#check-payment-status-api). Status of a payment where authorization and purchase are separated because 'options.payment.confirm' of the Request API is set as `false` will be in purchase standby (Authentication) even after it is completed. To complete the purchase, an additional purchase process is required through the [Confirm API](https://pay.line.me/documents/online_v3_en.html?shell#confirm-api).

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(confirmRequestConfig)
```

Returns `Promise<ApiResponse<ConfirmResponseBody>>`

### Request Config

@[code{7-32} ts](@/line-pay-api/confirm.ts)

### Response Body

@[code{35-142} ts{71-101,103-108}](@/line-pay-api/confirm.ts)

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
const res = await linePayClient.confirm
  .send({
    transactionId: '2021121600698709510',
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
      "transactionId": "2021121600698709510",
      "orderId": "20211216002",
      "payInfo": [
        {
          "method": "CREDIT_CARD",
          "amount": 1000,
        }
      ],
      "packages": [
        {
          "id": "c99abc79-3b29-4f40-8851-bc618ca57857",
          "amount": 1000,
          "userFeeAmount": 0,
          "products": [
            {
              "name": "Demo Product",
              "quantity": 2,
              "price": 500
            }
          ]
        }
      ]
    }
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `ConfirmClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // confirm
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `ConfirmClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
