# line-pay-merchant

![NPM](https://img.shields.io/npm/l/line-pay-merchant)
![GitHub Workflow Status (branch)](https://img.shields.io/github/workflow/status/enylin/line-pay-merchant/ci/main)
![codecov](https://codecov.io/gh/enylin/line-pay-merchant/branch/main/graph/badge.svg)
![GitHub code size in bytes](https://img.shields.io/github/languages/code-size/enylin/line-pay-merchant)
![npm](https://img.shields.io/npm/dt/line-pay-merchant)
![npm](https://img.shields.io/npm/v/line-pay-merchant)

LINE Pay V3 Online APIs library for Node.js

## Introduction

LINE Pay Merchant is a JavaScript library for integrating LINE Pay Online APIs.
The goal of this library is to help developers build reliable [LINE Pay](https://pay.line.me) applications.
It handles tedious jobs to help developers focus on business logic and ideas that produce value.

This library implements HTTP API calls and generates authentication headers automatically;
provides [TypeScript](https://www.typescriptlang.org/) type definitions of LINE Pay API requests and responses, which can be helpful in finding errors at compile time;
and provides built-in handlers to deal with exceptions, including API timeouts and duplicate transaction requests.
For added flexibility, users can define custom request/response handlers.

## Features

- Auto-generated LINE Pay API V3 authentication header
- Built-in API request and response [handler](./guide/handlers)
- Fully customizable API request and response [handler](./guide/handlers)
- [TypeScript](http://typescript.net/) support
- Handles transaction ID parsing (see [Transaction ID](./guide/further-details.md#transaction-id))

## Installation

You can install the package from [NPM](https://www.npmjs.com/package/line-pay-merchant) with the following command:

```sh
npm install line-pay-merchant
```

## Quick Start

```js
import { createLinePayClient } from 'line-pay-merchant'

const linePayClient = createLinePayClient({
  channelId: '1479113123', // channel ID
  channelSecretKey: '1f021e50f28fb3f40b7a9c5e758b0a19', // channel secret key
  env: 'development' // env can be 'development' or 'production'
})

async function sendRequest() {
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

## Changelog

Please visit [Changelog](https://github.com/enylin/line-pay-merchant/blob/main/CHANGELOG.md).

## License

[MIT](https://opensource.org/licenses/MIT)

Copyright (c) 2020-present, Sean Lin
