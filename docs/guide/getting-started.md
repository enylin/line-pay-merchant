# Getting Started

## Create LINE Pay Sandbox Account

You may need Sandbox account to develop and test LINE Pay application. If you already have a Sandbox account, feel free to skip this step.

Channel ID and channel secret key are two important items used to authenticate the identity of merchants. Using production channel ID and channel secret key in development environment is inconvenient and dangerous.
Follow the steps below to create your Sandbox account and find your channel ID and channel secret key.

1. Apply for a Sandbox account in [Sandbox Creation menu](https://pay.line.me/tw/developers/techsupport/sandbox/creation?locale=en_US). Merchant ID and password will be sent to the email address provided in the application form.

1. Find your merchant ID and password in the email.

1. Log in to [Merchant Center](https://pay.line.me/tw/center/test/main?locale=en_US) with merchant ID and password.

1. Find your channel ID and channel secret key at [Manage Link Key Page](https://pay.line.me/tw/center/payment/interlockKey?locale=zh_TW) by following the [Channel ID & SK guide](https://pay.line.me/tw/developers/techsupport/sandbox/channel?locale=en_US).

You may now test the LINE Pay Online API with your new channel ID and channel secret key.

For more information, please visit the official [Test Flow Page](https://pay.line.me/tw/developers/techsupport/sandbox/testflow?locale=en_US).

## Installation

You can install the package from [NPM](https://www.npmjs.com/package/line-pay-merchant) or [YARN](https://yarnpkg.com/package/line-pay-merchant) with the following commands:

:::: code-group
::: code-group-item NPM
```sh:no-line-numbers
npm install line-pay-merchant
```
:::
::: code-group-item YARN
```sh:no-line-numbers
yarn add line-pay-merchant
```
:::
::::

Or build from source:

```sh:no-line-numbers
git clone https://github.com/enylin/line-pay-merchant
cd line-pay-merchant
npm install
npm run build
```

## Example

### LINE Pay Request API

Import `createLinePayClient` function from `line-pay-merchant`.
```js
import { createLinePayClient } from 'line-pay-merchant'
```

Create client with channel ID and channel secret key.
```js
const linePayClient = createLinePayClient({
  channelId: '1479113123', // your channel ID
  channelSecretKey: '1f021e50f28fb3f40b7a9c5e758b0a19', // your channel secret key
  env: 'development' // env can be 'development' or 'production'
})
```

Use the client created to call LINE Pay request API.
```js
async function request() {
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
