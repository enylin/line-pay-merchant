# Payment Details API

## Overview

An API to check transaction history in LINE Pay. You can check histories of authorizations and payment completions. With fields setting, you can selectively check transaction information or order information as needed.

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(paymentDetailsRequestConfig)
```

Returns `Promise<ApiResponse<PaymentDetailsResponseBody>>`

### Request Config

@[code{7-34} ts](@/line-pay-api/payment-details.ts)

### Response Body

@[code{37-204} ts](@/line-pay-api/payment-details.ts)

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
1177 | Exceeded maximum viewable transactions (Max. 100)
9000 | An internal error

### Example

#### Request
```ts
const res = await linePayClient.paymentDetails
  .send({
    params: {
      transactionId: ['2021121600698709510']
    }
  })
```

#### Response
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "Success.",
    "info": [
      {
        "transactionId": "2021121600698709510",
        "transactionDate": "2021-12-16T00:27:40Z",
        "transactionType": "PAYMENT",
        "productName": "Demo Product",
        "currency": "TWD",
        "authorizationExpireDate": "2021-12-16T00:27:40Z",
        "payInfo": [
          {
            "method": "CREDIT_CARD",
            "amount": 1000
          }
        ],
        "refundList": [
          {
            "refundTransactionId": "2021121600698710312",
            "transactionType": "PARTIAL_REFUND",
            "refundAmount": -20,
            "refundTransactionDate": "2021-12-16T00:50:15Z"
          }
        ],
        "orderId": "20211216002",
        "payStatus": "CAPTURE",
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
    ]
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `PaymentDetailsClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // paymentDetails
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `PaymentDetailsClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
