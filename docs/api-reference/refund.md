# Refund API

## Overview

An API to refund transactions that has been completed the payment (purchase). The transaction ID of LINE Pay user must be passed when refunded and partial refund is also possible.

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(refundRequestConfig)
```

Returns `Promise<ApiResponse<RefundResponseBody>>`

### Request Config

@[code{6-23} ts](@/line-pay-api/refund.ts)

### Response Body

@[code{26-42} ts](@/line-pay-api/refund.ts)

### Return Code

#### Success

Code | Description
:----:|:------------------------
0000 | Success


#### Error

Code | Description
:----:|:------------------------
1101 | A purchaser status error
1102 | A purchaser status error
1104 | Non-existing merchant
1105 | The merchant cannot use the LINE Pay.
1106 | A header information error
1124 | An account status error
1150 | Cannot find the transaction history
1155 | Number of a transaction type that cannot be refunded.
1163 | Unable to refund since refundable date is over.
1164 | Exceeded refundable amount.
1165 | A transaction already been refunded.
1179 | Unable to proceed the transaction.
1198 | The API call request has been duplicated.
1199 | An internal request error
9000 | An internal request

### Example

#### Request
```ts
const res = await linePayClient.refund
  .send({
    transactionId: '2021121300698360310',
    body: {
      refundAmount: 20
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
      "refundTransactionId": "2021121600698710312",
      "refundTransactionDate": "2021-12-16T00:50:15Z"
    }
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `RefundClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // refund
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `RefundClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
