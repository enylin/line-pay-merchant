# Getting started

This page takes you through a first **sandbox** payment: reserve it, let the user approve it, confirm it. The complete version you can adapt for production is in the [recipes](/en/recipes/).

## 1. Get sandbox credentials

Use the LINE Pay sandbox for development and tests, never your production keys.

1. Apply for a sandbox account on the [official sandbox page](https://developers-pay.line.me/sandbox).
2. Sign in to the Merchant Center and find your **Channel ID** and **Channel Secret Key** on the "Manage link key" page.

Put them in environment variables, not in the code, and certainly not in Git:

```sh
export LINE_PAY_CHANNEL_ID=...
export LINE_PAY_CHANNEL_SECRET=...
```

## 2. Install

::: code-group

```sh [npm]
npm install line-pay-merchant
```

```sh [pnpm]
pnpm add line-pay-merchant
```

```sh [yarn]
yarn add line-pay-merchant
```

:::

Node.js 22 or later is required. The types are included; there is no `@types` package to install.

## 3. Create a client

<<< @/../examples/getting-started.ts#client{ts}

- Creating a client does not connect to anything and keeps no global state. One per process is enough, and it can be shared safely.
- `env` is `'sandbox'` or `'production'`. (`'development'` of 0.9 was renamed to `'sandbox'`.)
- A bad configuration (a missing key, a mistyped `env`) throws a `LinePayValidationError` **when the client is created**, not at the first payment.

## 4. Reserve a payment: request

<<< @/../examples/getting-started.ts#request{ts}

- `amount` must equal the sum of all `packages[].amount` (plus fees and shipping), and the `amount` of each package must equal the sum of `quantity × price` of its products. The library checks this before sending and throws a `LinePayValidationError` for a wrong sum, so no request is wasted.
- `orderId` is **your** order number and must be unique in your system.
- `body.info.transactionId` is **LINE Pay's** transaction ID. Confirm, refund and reconcile all need it. It has 19 digits and in this library it is always a **string**; store it as text in your database too, not as `BIGINT` (see [Two identifiers](./payment-flow#two-identifiers)).
- Send the user to `body.info.paymentUrl.web` (the web page) or `.app` (opens LINE Pay on a phone).

## 5. After the user approves: confirm

After the user approves in LINE Pay, LINE Pay sends them back to your `confirmUrl` with a `transactionId` and an `orderId`:

```
https://shop.example/line-pay/confirm?transactionId=2026102700000000001&orderId=order-20261027-001
```

Now call `confirm` to take the money:

<<< @/../examples/getting-started.ts#confirm{ts}

::: danger The amount must not come from the URL
`amount` must be the amount of **the order in your database**. Everything in the URL comes from the user's browser, and the user can change it. The `transactionId` in the URL must also pass through `parseConfirmQuery()` first, which only allows 1 to 19 digits. The full approach is in [Security](./security).
:::

## 6. Reading the result

Every call returns `{ body, meta }`:

| Field             | Description                                                                                                 |
| ----------------- | ----------------------------------------------------------------------------------------------------------- |
| `body`            | The LINE Pay response as it was sent (integers beyond 2^53 are strings).                                    |
| `meta.operation`  | The name of the operation, for example `'confirm'`.                                                         |
| `meta.durationMs` | Total time, retries and waiting included.                                                                   |
| `meta.attempts`   | How many times the request was attempted, including attempts that never connected.                          |
| `meta.httpStatus` | The HTTP status of the last response.                                                                       |
| `meta.recovered`  | Present only when `reconcile` inferred the result. See [Unknown outcomes and reconcile](./unknown-outcome). |

A failure throws a `LinePay*Error`. Each has a `code` and an `outcome`; see [Errors and outcomes](./errors).

## Next

- What happens in between → [The payment flow](./payment-flow)
- What to do when `confirm` times out → [Unknown outcomes and reconcile](./unknown-outcome)
- A complete flow with an order state machine → [Recipes](/en/recipes/)
