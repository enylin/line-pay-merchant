# Request API

## Overview

An API to request payment information to LINE Pay. User can change settings such as order information or various payment methods. Once the request is successful, a transaction ID is generated and with the ID, you can complete the payment or process refund.

- [`send`](#send)
- [`addHandler`](#addhandler)
- [`addHandlers`](#addhandlers)

## send

```js:no-line-numbers
send(requestRequestConfig)
```

Returns `Promise<ApiResponse<RequestResponseBody>>`

### Request Config

@[code{8-199} ts{157-185,187-192}](@/line-pay-api/request.ts)

### Response Body

@[code{203-240} ts{18-31,33-38}](@/line-pay-api/request.ts)

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
1106 | A header information error
1124 | An amount info error
1145 | Payment in process
1172 | A record of transaction with the same order number already exists.
1178 | Unsupported currency
1183 | The payment amount must be less than 0.
1194 | The merchant cannot use the preapproved payment.
2101 | A parameter error
2102 | A JSON data format error
9000 | An internal error

### Example

#### Request
```ts
const res = await linePayClient.request.send({
  body: {
    amount: 1000,
    currency: 'TWD',
    orderId: '20211209003',
    packages: [
      {
        id: 'c99abc79-3b29-4f40-8851-bc618ca57857',
        amount: 1000,
        products: [
          {
            name: 'Demo Product',
            quantity: 2,
            price: 500
          }
        ]
      }
    ],
    redirectUrls: {
      confirmUrl: 'https://example.com/confirmUrl',
      cancelUrl: 'https://example.com/cancelUrl'
    }
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
      "paymentUrl": {
        "web": "https://sandbox-web-pay.line.me/web/payment/wait?transactionReserveId=eVBISG5rQ09QL2JBVmJsdGdGN3RiUlBLaU0vMUtKWGEvVzhZS3o5NnBvSUlqZXdLdXk3Wlh0RXY2a0o3ZHp6Yw",
        "app": "line://pay/payment/eVBISG5rQ09QL2JBVmJsdGdGN3RiUlBLaU0vMUtKWGEvVzhZS3o5NnBvSUlqZXdLdXk3Wlh0RXY2a0o3ZHp6Yw"
      },
      "transactionId": "2021121600698709710",
      "paymentAccessToken": "656097936065"
    }
  },
  "comments": {}
}
```

## addHandler

```js:no-line-numbers
addHandler(handler)
```

Returns `RequestClient`

Example:
```js
client.addHandler(({ type, req, next, httpClient }) => {
  console.log(type) // request
  return next(req)
})
```

## addHandlers

```js:no-line-numbers
addHandlers(...handlers)
```

Returns `RequestClient`

Example:
```js
client.addHandlers(
  ({ req, next }) => next(req),
  ({ req, next }) => next(req),
  ({ req, next }) => next(req)
)
```
