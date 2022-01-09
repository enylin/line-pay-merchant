# Void API

## Overview

An API to void payment data that are in authorization status. The API cancels authorization transaction after the payment is completed with the Confirm API. Only the transactions that are in authorization status(purchase standby status) can be cancelled and purchased transactions should be refunded with [Refund API](https://pay.line.me/documents/online_v3_en.html#refund-api).

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(voidRequestConfig)
```

Returns `Promise<ApiResponse<VoidResponseBody>>`

### Request Config

@[code{5-16} ts](@/line-pay-api/void.ts)

### Response Body

@[code{18-18} ts](@/line-pay-api/void.ts)

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
1106 | A header info error
1150 | Cannot find the transaction history
1155 | Wrong transaction number
1165 | A transaction has already been voided.
1170 | Balance of the member's account has been changed.
1198 | API call request has been duplicated.
1199 | An internal request error
1900 | A temporary error. Please try again later.
1902 | A temporary error. Please try again later.
1999 | The request information is different than the previous one.
9000 | An internal error

### Example

#### Request
```ts
const res = await linePayClient.void
  .send({
    transactionId: '2021121300698360310'
  })
```

#### Response
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "Success."
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `VoidClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // void
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `VoidClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
