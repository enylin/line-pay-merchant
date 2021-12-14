# line-pay-merchant

LINE Pay V3 Online APIs library for Node.js

## Quick start

```
npm install line-pay-merchant
```

## Usage

### Basic example

Request:
```ts
import { createLinePayClient } from 'line-pay-merchant'

const linePayClient = createLinePayClient({
  channelId: '1479113123',
  channelSecretKey: '1f021e50f28fb3f40b7a9c5e758b0a19',
  env: 'development' // env can be 'development' or 'production'
})

const order = {
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

try {
  const res = await linePayClient.request.send({
    body: order
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

### Built-in handler

Request:
```ts
import { createLinePayClient, handler } from 'line-pay-merchant'

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
  console.log('e = ', e)
}
```


### Custom handler

Request:
```ts
const res = await linePayClient.refund
  .addHandler(async (req, next) => {
    console.log('before first handler')
    const result = await next(req)
    console.log('after first handler')
    return result
  })
  .addHandlers(
    async (req, next) => {
      console.log('before second handler')
      const result = await next(req)
      const result2 = await next(req)
      console.log('after second handler')
      return result
    },
    async (req, next) => {
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

## APIs

### Request

An API to request payment information to LINE Pay. User can change settings such as order information or various payment methods. Once the request is successful, a transaction ID is generated and with the ID, you can complete the payment or process refund.

```ts
send(req: RequestRequestConfig): Promise<ApiResponse<RequestResponseBody>>
```

Definitions:
- [RequestRequestConfig](src/line-pay-api/request.ts#L228)
- [RequestResponseBody](src/line-pay-api/request.ts#L221)

Example:
```ts
const order: RequestRequestBody = {
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
const res = await linePayClient.request.send({
  body: order
})
```

### Confirm

An API for the merchant to complete the payment when the user approves with the [ConfirmURL](https://pay.line.me/documents/online_v3_en.html?shell#confirmurl-spec) or [Check Payment Status API](https://pay.line.me/documents/online_v3_en.html?shell#check-payment-status-api). Status of a payment where authorization and purchase are separated because 'options.payment.capture' of the Request API is set as `false` will be in purchase standby (Authentication) even after it is completed. To complete the purchase, an additional purchase process is required through the [Capture API](https://pay.line.me/documents/online_v3_en.html?shell#capture-api).

```ts
send(req: ConfirmRequestConfig): Promise<ApiResponse<ConfirmResponseBody>>
```

Definitions:
- [ConfirmRequestConfig](src/line-pay-api/confirm.ts#L21)
- [ConfirmResponseBody](src/line-pay-api/confirm.ts#L134)

Example:
```ts
const res = await linePayClient.confirm
  .send({
    transactionId: '2021121300698360310',
    body: {
      currency: 'TWD',
      amount: 1000
    }
})
```

### Refund

An API to refund transactions that has been completed the payment (purchase). The transaction ID of LINE Pay user must be passed when refunded and partial refund is also possible.

```ts
send(req: RefundRequestConfig): Promise<ApiResponse<RefundResponseBody>>
```

Definitions:
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

### Payment Details

An API to check transaction history in LINE Pay. You can check histories of authorizations and payment completions. With fields setting, you can selectively check transaction information or order information as needed.

```ts
send(req: PaymentDetailsRequestConfig): Promise<ApiResponse<PaymentDetailsResponseBody>>
```

Definitions:
- [PaymentDetailsRequestConfig](src/line-pay-api/payment-details.ts#L27)
- [PaymentDetailsResponseBody](src/line-pay-api/payment-details.ts#L196)

Example:
```ts
const res = await linePayClient.paymentDetails
  .send({
    params: {
      transactionId: ['2021113000697335210'],
      orderId: ['20211209003'],
    }
})
```

## Further details

### TypeScript support

This library is written in TypeScript. Users can get type definitions without installing additional libraries.

### Transaction ID

JavaScript numbers are double-precision floating-point numbers.
LINE Pay Transaction ID is a number larger than the largest integer JavaScript can be precisely stored (which is 2^53, 9007199254740992).
This may cause the transaction ID received from LINE Pay APIs to be recognized incorrectly. For example, the transaction ID number 2021121300698360310 may be converted to 2021121300698360300 by default parser.
This library handles the behavior by converting the transaction ID number to string format before the default parser (`JSON.parse`) parses the response received from LINE Pay APIs.

## Resources

- [LINE Pay Online APIs](https://pay.line.me/tw/developers/apis/onlineApis?locale=en_US)
