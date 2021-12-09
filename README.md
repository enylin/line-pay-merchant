# line-pay-merchant

## Quick start

```
npm install --save line-pay-merchant
```

## Usage

### Basic example

Request:
```ts
import { createLinePayClient } from 'line-pay-merchant'

const linePayClient = createLinePayClient({
  channelId: '1479113123',
  channelSecretKey: '1f021e50f28fb3f40b7a9c5e758b0a19',
  env: 'development'
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
      transactionId: 2021120900898162200,
      paymentAccessToken: '361925937255'
    }
  },
  comments: {}
}

```

### Handler

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
    transactionId: '2021120900898162200',
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

### Confirm

### Refund

### Payment Details

## Resources

- [LINE Pay Online APIs](https://pay.line.me/tw/developers/apis/onlineApis?locale=en_US)

## Roadmap

TODOs:
- Implement Capture API and add unit tests
- Implement Void API and add unit tests
- Implement Check Payment Status API and add unit tests
- Implement Check RegKey API and add unit tests
- Implement Pay Preapproved API and add unit tests
- Implement Expire RegKey API and add unit tests
- Provide default handlers
- Add more examples to README.md
