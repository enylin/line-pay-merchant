<!-- omit in toc -->
# line-pay-merchant

LINE Pay V3 Online APIs library for Node.js

<!-- omit in toc -->
# Quick start

```
npm install line-pay-merchant
```

<!-- omit in toc -->
## Basic example

Request:
```ts
import { createLinePayClient } from 'line-pay-merchant'

const linePayClient = createLinePayClient({
  channelId: '1479113123',
  channelSecretKey: '1f021e50f28fb3f40b7a9c5e758b0a19',
  env: 'development' // env can be 'development' or 'production'
})

try {
  const res = await linePayClient.request.send({
    body: {
      amount: 1000,
      currency: 'TWD',
      orderId: '20211209003',
      packages: [
        {
          id: 'c99abc79-3b29-4f40-8851-bc618ca57856',
          amount: 1000,
          products: [
            {
              name: 'Product Name',
              quantity: 2,
              price: 500
            }
          ]
        }
      ],
      redirectUrls: {
        confirmUrl: 'https://myshop.com/confirmUrl',
        cancelUrl: 'https://myshop.com/cancelUrl'
      }
    }
  })

  console.log(res)
} catch (e) {
  console.log('error', e)
}
```

Response:
```ts
{
  body: {
    returnCode: '0000',
    returnMessage: 'Success.',
    info: {
      paymentUrl: {
        web: 'https://sandbox-web-pay.line.me/web/payment/wait?transactionReserveId=MGG5dXZZaatkK3Y0NlFmTVVCdXVpTWtyYlp1SEhVQUwwRnkzRkhTTXBQRjZRV0pkUEFJbGhWdzNiU0M2ZlBFTA',
        app: 'line://pay/payment/MGY5dXZZaitkK3Y0NlFmTVVCdXVpTWtzYlp1SEhVQUwwRnkzRkhTTXBQRjZRV0pkUEFJcGhWdzNiU0M2ZlBFTA'
      },
      transactionId: '2021120900898162210',
      paymentAccessToken: '361925937255'
    }
  },
  comments: {}
}
```

<!-- omit in toc -->
# Table of Contents

- [Features](#features)
- [APIs](#apis)
  - [Request](#request)
  - [Confirm](#confirm)
  - [Capture](#capture)
  - [Refund](#refund)
  - [Payment Details](#payment-details)
  - [Check Payment Status](#check-payment-status)
- [Error handling](#error-handling)
  - [Error](#error)
  - [Handler](#handler)
    - [Built-in handler](#built-in-handler)
    - [Custom handler](#custom-handler)
- [Further details](#further-details)
  - [TypeScript support](#typescript-support)
  - [Transaction ID](#transaction-id)
- [Resources](#resources)


# Features

- Auto-generated LINE Pay API V3 authentication header
- Built-in API request and response [handler](#built-in-handler)
- Fully customizable API request and response [handler](#custom-handler)
- [TypeScript](http://typescript.net/) support
- Handles transaction ID parsing (see [Transaction ID](#transaction-id))

# APIs

## Request

An API to request payment information to LINE Pay. User can change settings such as order information or various payment methods. Once the request is successful, a transaction ID is generated and with the ID, you can complete the payment or process refund.

```ts
send(req: RequestRequestConfig): Promise<ApiResponse<RequestResponseBody>>
```

Type definitions:
- [RequestRequestConfig](src/line-pay-api/request.ts#L228)
- [RequestResponseBody](src/line-pay-api/request.ts#L221)

Example:

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

Response:
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

## Confirm

An API for the merchant to complete the payment when the user approves with the [ConfirmURL](https://pay.line.me/documents/online_v3_en.html?shell#confirmurl-spec) or [Check Payment Status API](https://pay.line.me/documents/online_v3_en.html?shell#check-payment-status-api). Status of a payment where authorization and purchase are separated because 'options.payment.capture' of the Request API is set as `false` will be in purchase standby (Authentication) even after it is completed. To complete the purchase, an additional purchase process is required through the [Capture API](https://pay.line.me/documents/online_v3_en.html?shell#capture-api).

```ts
send(req: ConfirmRequestConfig): Promise<ApiResponse<ConfirmResponseBody>>
```

Type definitions:
- [ConfirmRequestConfig](src/line-pay-api/confirm.ts#L21)
- [ConfirmResponseBody](src/line-pay-api/confirm.ts#L134)

Example:

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

Response:
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

## Capture

Transactions that have set options.payment.capture as `false` when requesting the Request API payment will be put on hold when the payment is completed with the Confirm API. In order to finalize the payment, an additional purchase with Capture API is required.

```ts
send(req: CaptureRequestConfig): Promise<ApiResponse<CaptureResponseBody>>
```

Type definitions:
- [CaptureRequestConfig](src/line-pay-api/capture.ts#L38)
- [CaptureResponseBody](src/line-pay-api/capture.ts#L78)

Example:

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

Response:
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "OK",
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

## Refund

An API to refund transactions that has been completed the payment (purchase). The transaction ID of LINE Pay user must be passed when refunded and partial refund is also possible.

```ts
send(req: RefundRequestConfig): Promise<ApiResponse<RefundResponseBody>>
```

Type definitions:
- [RefundRequestConfig](src/line-pay-api/refund.ts#L12)
- [RefundResponseBody](src/line-pay-api/refund.ts#L34)

Example:
```ts
const res = await linePayClient.refund
  .send({
    transactionId: '2021121300698360310',
    body: {
      refundAmount: 20
    }
})
```

Response:
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

## Payment Details

An API to check transaction history in LINE Pay. You can check histories of authorizations and payment completions. With fields setting, you can selectively check transaction information or order information as needed.

```ts
send(req: PaymentDetailsRequestConfig): Promise<ApiResponse<PaymentDetailsResponseBody>>
```

Type definitions:
- [PaymentDetailsRequestConfig](src/line-pay-api/payment-details.ts#L27)
- [PaymentDetailsResponseBody](src/line-pay-api/payment-details.ts#L196)

Example:
```ts
const res = await linePayClient.paymentDetails
  .send({
    params: {
      transactionId: ['2021121600698709510']
    }
})
```

Response:
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

## Check Payment Status

An API to check payment request status of LINE Pay. The merchant should regularly check user payment confirm status **without using the ConfirmURL** and decide if it is possible to complete the payment.

```ts
send(req: CheckPaymentStatusRequestConfig): Promise<ApiResponse<CheckPaymentStatusResponseBody>>
```

Type definitions:
- [CheckPaymentStatusRequestConfig](src/line-pay-api/payment-details.ts#L12)
- [CheckPaymentStatusResponseBody](src/line-pay-api/payment-details.ts#L37)

Example:
```ts
const res = await linePayClient.checkPaymentStatus
  .send({
    params: {
      transactionId: '2021121600698709510'
    }
})
```

Response:
```json
{
  "body": {
    "returnCode": "0000",
    "returnMessage": "reserved transaction."
  },
  "comments": {}
}
```

# Error handling

## Error

- FormatError: Request format incorrect
- HttpError: HTTP error (ex. 400, 403, 404, 500)
- TimeoutError: HTTP request timeout.
- LinePayError: LINE Pay API returns non-0000 return code.

## Handler

### Built-in handler

Request:
```ts
import { createLinePayClient, handler, error } from 'line-pay-merchant'

const linePayClient = createLinePayClient(config)

try {
  const res = await linePayClient.confirm
    .addHandlers(
      handler.createTimeoutRetryHandler(),
      handler.createPaymentDetailsRecoveryHandler(handler.toConfirmResponse)
    )
    .send({
      transactionId: '2021121300698360310',
      body: {
        currency: 'TWD',
        amount: 1000
      }
    })

  console.log('res = ', JSON.stringify(res, null, 2))
} catch (e) {
  if (e instanceof error.LinePayApiError) {
    console.log('LinePayApiError = ', e)
  } else if (e instanceof error.HttpError) {
    console.log('HttpError = ', e)
  } else if (e instanceof error.TimeoutError) {
    console.log('TimeoutError = ', e)
  }
}
```

### Custom handler

Request:
```ts
const res = await linePayClient.refund
  .addHandler(async ({ req, next }) => {
    console.log('before first handler')
    const result = await next(req)
    console.log('after first handler')
    return result
  })
  .addHandlers(
    async ({ req, next }) => {
      console.log('before second handler')
      const result = await next(req)
      const result2 = await next(req)
      console.log('after second handler')
      return result
    },
    async ({ req, next }) => {
      console.log('before third handler')
      const result = await next(req)
      console.log('after third handler')
      return result
    }
  )
  .send({
    transactionId: '2021120900898162210',
    body: {
      refundAmount: 20
    }
  })
```

Output:
```
before third handler
before second handler
before first handler
after first handler
before first handler
after first handler
after second handler
after third handler
```

# Further details

## TypeScript support

This library is written in TypeScript. Users can get type definitions without installing additional libraries.

## Transaction ID

JavaScript numbers are double-precision floating-point numbers.
LINE Pay Transaction ID is a number larger than the largest integer JavaScript can be precisely stored (which is 2^53, 9007199254740992).
This may cause the transaction ID received from LINE Pay APIs to be recognized incorrectly. For example, the transaction ID number 2021121300698360310 may be converted to 2021121300698360300 by default parser.
This library handles the behavior by converting the transaction ID number to string format before the default parser (`JSON.parse`) parses the response received from LINE Pay APIs.

# Resources

- [LINE Pay Online APIs](https://pay.line.me/tw/developers/apis/onlineApis?locale=en_US)
