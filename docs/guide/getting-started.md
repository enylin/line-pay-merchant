# Getting Started

## Create LINE Pay Sandbox account

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
```sh
# latest
npm install line-pay-merchant
```
:::
::: code-group-item YARN
```sh
# latest
yarn add line-pay-merchant
```
:::
::::
