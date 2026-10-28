# The payment flow

## A normal payment

```
  User's browser            Your server                  LINE Pay
       │  check out             │                          │
       │ ─────────────────────► │  request                 │
       │                        │ ───────────────────────► │
       │                        │ ◄─────── paymentUrl ──── │
       │ ◄── redirect to paymentUrl ─│                     │
       │  approve in LINE Pay ─────────────────────────────►│
       │ ◄── redirect to confirmUrl?transactionId=… ───────│
       │ ─────────────────────► │  confirm                 │
       │                        │ ───────────────────────► │
       │                        │ ◄───── payment done ──── │
       │ ◄── result page ────── │                          │
```

| Step | Call                   | Made by     | Notes                                                                       |
| ---- | ---------------------- | ----------- | --------------------------------------------------------------------------- |
| 1    | `request`              | your server | Only reserves; nobody is charged. Store the `transactionId` with the order. |
| 2    | (the user in LINE Pay) | the user    | They may approve, cancel, or just close the page.                           |
| 3    | `confirm`              | your server | Takes the money. If the outcome is unknown, **reconcile**; never re-send.   |
| 4    | `paymentDetails`       | your server | Can be called at any time; reconcile relies on it.                          |
| 5    | `refund`               | your server | A refund is **not idempotent**. Never re-send it after an unknown outcome.  |

If you do not want to depend on the redirect to the `confirmUrl`, `checkPaymentStatus` can poll whether the user approved. The result is in the `returnCode`, and **here `0000` is not a success**:

| `returnCode` | Meaning                                                 |
| ------------ | ------------------------------------------------------- |
| `0000`       | The user has **not** authorized it yet.                 |
| `0110`       | The user authorized it: `confirm` can be called.        |
| `0121`       | Canceled by the user, or timed out (20 minutes). Final. |
| `0122`       | Failed. Final.                                          |
| `0123`       | Completed. Final.                                       |

These are the V3 meanings; V4 has yet to be verified in the sandbox. Polling is only for deciding **when to `confirm`**; to mark an order paid, rely on the result of `confirm` (or on [reconcile](./unknown-outcome)), never on `0000` or on what polling said.

## Two identifiers

|            | `orderId`                 | `transactionId`                        |
| ---------- | ------------------------- | -------------------------------------- |
| Created by | you                       | LINE Pay (response of `request`)       |
| Used for   | matching your order       | `confirm`, `refund`, `capture`, `void` |
| Form       | string, at most 100 chars | up to 19 digits, **always a string**   |
| In the URL | yes                       | yes                                    |

Both appear in the query string of the `confirmUrl`, and the query string comes from the user's browser. Parse it with [`parseConfirmQuery()`](/en/api/functions/parseConfirmQuery) and check it against the order in your database.

**Store both IDs in your database as text** (`TEXT` or `VARCHAR`), not as `BIGINT` or another numeric type, and do not run them through `Number()` or `parseInt()` first:

- A `transactionId` has 19 digits, more than JavaScript can represent exactly (2^53). A `BIGINT` column can hold it, but as soon as the driver or ORM reads it back as a `number` (the default of `mysql2`, for one), the last digits silently become other digits, without an error. The changed ID still has 19 digits, so it passes the checks of the library, and a `refund` goes out for another payment (or for none).
- An `orderId` is text that you chose. It may have leading zeros (`0012`) or letters, and as a number it is not the same ID any more.
- Storing the [context for reconcile](./unknown-outcome) as JSON is safe: the IDs in it are strings. Compare IDs as strings too (`===`).

## Payments without redirect URLs

Set `redirectUrls: { confirmUrlType: 'NONE' }` to omit `confirmUrl` and `cancelUrl`. Poll `checkPaymentStatus` at intervals of at least one second. Only `0110` means the customer has completed authentication and you may call `confirm`. A polling `0000` is not payment success.

## Authorize, then capture

A plain `confirm` authorizes and captures in one step. If your merchant account has it enabled, set `options.payment.capture: false` in `request`; then `confirm` only authorizes, and you take the money later with `capture`, or release the authorization with `void` before it expires.

```ts
await linePay.request({
  // ...
  options: { payment: { capture: false } }
})
// after confirm the status of the payment is AUTHORIZATION
await linePay.capture({ transactionId, amount, currency: 'TWD' })
```

## Pre-approved payments (regKey)

Set `options.payment.payType: 'PREAPPROVED'` in `request`. After the user's first approval, the response of `confirm` carries a **`regKey`**. From then on `payPreapproved` charges without the user's approval; `checkRegKey` looks at its status and `expireRegKey` revokes it.

::: warning The regKey appears only once
The `regKey` is only in the response of `confirm`. Store it immediately, encrypted, with limited access and out of the logs (see [Security](./security)). If `confirm` times out and you recover the payment with `reconcile`, the payment details do **not** contain a regKey; the library warns in `notes`, and this case needs a person. (A response that is a success but not of the expected shape is an `unexpected-shape` error, and what was received stays in `error.body`; the `regKey` may be there.)
:::

## Sandbox and production

| `env`          | Host                              |
| -------------- | --------------------------------- |
| `'sandbox'`    | `https://sandbox-api-pay.line.me` |
| `'production'` | `https://api-pay.line.me`         |

The Channel IDs and secrets of the two are different and cannot be mixed. For proxies and fixed IP addresses, see [Configuration](./configuration).
