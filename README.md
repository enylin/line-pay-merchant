<!-- omit in toc -->
# line-pay-merchant

![NPM](https://img.shields.io/npm/l/line-pay-merchant)
![GitHub Workflow Status (branch)](https://img.shields.io/github/workflow/status/enylin/line-pay-merchant/ci/main)
[![codecov](https://codecov.io/gh/enylin/line-pay-merchant/branch/main/graph/badge.svg)](https://codecov.io/gh/enylin/line-pay-merchant)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/enylin/line-pay-merchant)
![npm](https://img.shields.io/npm/dt/line-pay-merchant)
![npm](https://img.shields.io/npm/v/line-pay-merchant)

LINE Pay V3 Online APIs library for Node.js

<!-- omit in toc -->
# Quick Start

```sh
npm install line-pay-merchant
```

<!-- omit in toc -->
## Basic Example

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
      orderId: '20211216003',
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

<!-- omit in toc -->
# Table of Contents

- [Features](#features)
- [Guide](#guide)
- [Documentation](#documentation)
- [Error Handling](#error-handling)
  - [Error](#error)
- [Resources](#resources)


# Features

- Auto-generated LINE Pay API V3 authentication header
- Built-in API request and response [handler]((https://enylin.github.io/line-pay-merchant/guide/handlers.html)
- Fully customizable API request and response [handler](https://enylin.github.io/line-pay-merchant/guide/handlers.html)
- [TypeScript](http://typescript.net/) support
- Handles transaction ID parsing (see [Transaction ID](https://enylin.github.io/line-pay-merchant/guide/further-details.html#transaction-id)

# Guide

Please visit [Guide](https://enylin.github.io/line-pay-merchant/guide/getting-started.html) for more details.

# Documentation

Please visit [LINE Pay Merchant](https://enylin.github.io/line-pay-merchant/) for more details.

# Error Handling

## Error

- FormatError: Request format incorrect
- HttpError: HTTP error (ex. 400, 403, 404, 500)
- TimeoutError: HTTP request timeout.
- LinePayError: LINE Pay API returns non-0000 return code.

# Resources

- [LINE Pay Online APIs](https://pay.line.me/tw/developers/apis/onlineApis?locale=en_US)
