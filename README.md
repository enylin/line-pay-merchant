# line-pay-merchant

[![npm](https://img.shields.io/npm/v/line-pay-merchant)](https://www.npmjs.com/package/line-pay-merchant)
[![ci](https://img.shields.io/github/actions/workflow/status/enylin/line-pay-merchant/ci.yaml?branch=main&label=ci)](https://github.com/enylin/line-pay-merchant/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/enylin/line-pay-merchant/branch/main/graph/badge.svg)](https://codecov.io/gh/enylin/line-pay-merchant)
[![node](https://img.shields.io/node/v/line-pay-merchant)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/line-pay-merchant)](./LICENSE)

**English** · [繁體中文](./README.zh-TW.md) · [Documentation](https://enylin.github.io/line-pay-merchant/en/)

A Node.js library for the **LINE Pay Online API V4**. Zero runtime dependencies, fully typed, and built around one fact: when the outcome of a payment is unknown, it says so and gives you a way to look it up, instead of calling it a failure.

> **Unofficial.** This is an independent library. It is not made, endorsed or supported by LINE Pay. "LINE" and "LINE Pay" are trademarks of their owners.

> **1.0 is in alpha.** The official V4 reference was not available when this was written. The paths and fields follow LINE Pay's V3 API and what independent V4 clients and the 0.9 documentation agree on, and none of it has been run against the V4 sandbox yet; the open points are marked `TODO(v4-spec)` in the source. Before going live, run the whole flow in the sandbox, including a second `confirm` of the same transaction. Using V3? Stay on [0.9.x](https://www.npmjs.com/package/line-pay-merchant/v/0.9.0): `npm install line-pay-merchant@0.9`.

## Why

- **A timeout is not a failure.** When `confirm` times out, the customer may already have been charged. Every error carries an `outcome` (`not-sent`, `unknown` or `rejected`), and `client.reconcile()` looks the payment up and answers `applied`, `not-applied` or `indeterminate`, with its evidence. Requests that move money are never re-sent after an unknown outcome.
- **Zero runtime dependencies.** Only the built-in `fetch` and Web Crypto. ESM and CommonJS, Node.js 22 or later.
- **Careful defaults.** Path parameters are always validated, redirects are never followed, 19-digit transaction IDs stay exact, and errors never carry the secret or signatures.
- **Typed, with composable middleware.** Retrying, reconciling and logging are middleware.

## Install

```sh
npm install line-pay-merchant
```

## Use

```ts
import { createLinePayClient, parseConfirmQuery } from 'line-pay-merchant'

const linePay = createLinePayClient({
  channelId: process.env.LINE_PAY_CHANNEL_ID ?? '',
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env: 'sandbox' // 'production' for real payments
})

// 1. Reserve the payment, then send the user to body.info.paymentUrl.web
const { body } = await linePay.request({
  amount: 1000,
  currency: 'TWD',
  orderId: 'order-20261027-001',
  packages: [
    {
      id: 'package-1',
      amount: 1000,
      products: [{ name: 'Tea', quantity: 2, price: 500 }]
    }
  ],
  redirectUrls: {
    confirmUrl: 'https://shop.example/line-pay/confirm',
    cancelUrl: 'https://shop.example/line-pay/cancel'
  }
})

// 2. The user comes back to your confirmUrl: take the money.
//    The amount is the one of your order, never one from the URL.
const { transactionId } = parseConfirmQuery(req.query)
await linePay.confirm({ transactionId, amount: 1000, currency: 'TWD' })
```

### When the outcome is unknown

```ts
import { needsReconcile } from 'line-pay-merchant'

try {
  await linePay.confirm({ transactionId, amount, currency: 'TWD' })
} catch (error) {
  if (!needsReconcile(error)) throw error

  // A timeout or a cut connection: the payment may have gone through.
  const result = await linePay.reconcile(error)
  if (result.status === 'applied') {
    // inferred from the payment details, not received from LINE Pay
  }
  // 'not-applied': not in the payment details *now*. Do not decide on one look: keep
  // the order as it is and look again a few minutes later (see the recipes). Only then
  // is another try reasonable, and it relies on LINE Pay refusing a second confirm as a
  // duplicate, which has to be checked in the V4 sandbox.
  // 'indeterminate': do not guess; look again later.
}
```

Or let the client do it: `linePay.with(autoReconcile())`. A complete flow with an order state machine and a background job is in the [recipes](https://enylin.github.io/line-pay-merchant/en/recipes/).

## Documentation

- [Getting started](https://enylin.github.io/line-pay-merchant/en/guide/getting-started)
- [Unknown outcomes and reconcile](https://enylin.github.io/line-pay-merchant/en/guide/unknown-outcome)
- [Recipes](https://enylin.github.io/line-pay-merchant/en/recipes/): Express, Next.js and other Web-standard runtimes, NestJS, background jobs
- [Upgrading from 0.9](https://enylin.github.io/line-pay-merchant/en/migration/from-0.9)
- [API reference](https://enylin.github.io/line-pay-merchant/en/api/)

For the meaning of the LINE Pay fields, see the [official documentation](https://developers-pay.line.me/).

## Contributing

```sh
npm ci
npm run verify   # types, lint, tests with coverage, build, package checks
npm run docs:dev # the documentation site
```

Commits follow [Conventional Commits](https://www.conventionalcommits.org/). To report a security problem, see [SECURITY.md](./SECURITY.md).

**No type assertions.** The code base has no `x as T`, no `<T>x` and no `x!` (`as const` is the only `as`), in the library, the tests and the examples; ESLint fails the build on them. A value from the network is given its type by a guard that checked it (`src/core/guard.ts`), a value that may be missing is checked, and a test that needs an input the types refuse says so with `// @ts-expect-error` or passes it through `untyped()` and `applyUntyped()` of `src/test/helpers.ts`. The point is that the compiler is never told something nobody checked.

**No `any`.** There is no `any` in the library, the tests, the examples or the documentation, and none in the declarations that are published. ESLint bans the keyword and the unsafe use of an `any` that a library hands out (`JSON.parse`, `Array.isArray`, which is why `src/core/guard.ts` has `isArray`); `npm run check:any` asks the compiler for the type of every declared name, so an `any` that is only inferred (`ReadableStream<any>`, `any[]`) fails too. The only file that is let off the second check is `examples/express.ts`, because the handlers of Express are typed with `any` by Express itself.

## License

[MIT](./LICENSE) © 2021-present Sean Lin
