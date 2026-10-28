# Configuration

<<< @/../examples/config.ts#options{ts}

## All options

| Option                    | Type                                     | Description                                                                                                                                                                                                                        |
| ------------------------- | ---------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `channelId`               | `string`                                 | The Channel ID. Required. It goes into a header, so printable ASCII only, with no spaces at either end.                                                                                                                            |
| `channelSecretKey`        | `string`                                 | The Channel Secret Key. Required. Keep it on the server. No surrounding whitespace.                                                                                                                                                |
| `env`                     | `'sandbox' \| 'production'`              | Required. Selects the host.                                                                                                                                                                                                        |
| `timeout`                 | `number`                                 | Time limit of one attempt in milliseconds (1 to 2147483647), for every operation without a more specific one.                                                                                                                      |
| `timeouts`                | `Partial<Record<OperationName, number>>` | Time limits per operation.                                                                                                                                                                                                         |
| `fetch`                   | `typeof fetch`                           | Replaces the global `fetch`: for a proxy, a fixed IP address, or tests. It **must not retry** requests on its own.                                                                                                                 |
| `baseUrl`                 | `string`                                 | Replaces the host that `env` selects. https (except localhost), without a user name or password. A path prefix is sent but **not signed**: use it only behind a proxy that removes the prefix before the request reaches LINE Pay. |
| `merchantDeviceProfileId` | `string`                                 | Sent as `X-LINE-MerchantDeviceProfileId`. Not an empty string; set it together with `merchantDeviceType`.                                                                                                                          |
| `merchantDeviceType`      | `string`                                 | Sent as `X-LINE-MerchantDeviceType`. Not an empty string; set it together with `merchantDeviceProfileId`.                                                                                                                          |
| `middleware`              | `Middleware[]`                           | Default `[retryWhenNotSent()]`. See [Middleware](./middleware).                                                                                                                                                                    |
| `validate`                | `boolean`                                | Check the input before sending it. `true` by default.                                                                                                                                                                              |

The configuration is checked when the client is created. A problem throws a `LinePayValidationError` at once, and its message names the field (it **never** prints the secret).

When you read the settings from the environment, an unset variable is `undefined`. The examples write `?? ''`, which makes it the empty string, instead of claiming with `!` that it is there: `createLinePayClient` refuses an empty `channelId` or `channelSecretKey` at start-up and names the field.

Only the properties of the object itself are read, not those of its prototype chain: even if a bug elsewhere pollutes `Object.prototype`, a polluted `baseUrl` does not send signed requests to another host. The values have to be own properties of the object (an object literal, the result of `JSON.parse`): a getter that lives on a prototype is not read, and `channelId` shows up empty and is refused. Also, the `JSON.parse` of the runtime has to hand the source text of a number to its reviver (V8 11.4, which is Node.js 22 and later); otherwise the 19-digit transaction IDs would be rounded without a word, so no client can be created there.

A value that goes into an HTTP header (`channelId`, `merchantDeviceProfileId`, `merchantDeviceType`) accepts printable ASCII only (spaces inside are fine, at either end they are not): a newline, a tab or any other control character is refused. The secret may hold no control character and no whitespace at either end. That is usually a stray newline pasted from a `.env` file or a password manager; failing at start-up is better than signing every request wrongly and silently.

Device identification is optional, but LINE Pay V4 requires both `merchantDeviceProfileId` and `merchantDeviceType` (a string sent via `X-LINE-MerchantDeviceType`). Providing only one rejects the client configuration.

## Timeouts

A timeout is the limit of **one attempt**. The order of precedence for a call is:

1. the `{ timeout }` of the call
2. `timeouts[operation]`
3. `timeout`
4. the default of the operation

| Operation | Default | Operation            | Default |
| --------- | ------- | -------------------- | ------- |
| `request` | 20 s    | `paymentDetails`     | 60 s    |
| `confirm` | 40 s    | `checkPaymentStatus` | 20 s    |
| `capture` | 60 s    | `checkRegKey`        | 20 s    |
| `void`    | 20 s    | `payPreapproved`     | 40 s    |
| `refund`  | 20 s    | `expireRegKey`       | 20 s    |

The defaults are the read timeouts LINE Pay recommends for each API (the V3 recommendations; to be confirmed for V4). A shorter timeout costs you more "unknown outcomes", so do not go below the defaults unless you have [reconcile](./unknown-outcome) in place.

To bound the time of the **whole call** (retries included), use an `AbortSignal`:

<<< @/../examples/config.ts#per-call{ts}

When the deadline passes after the request was sent, the result is "unknown" (`outcome: 'unknown'`), not a failure. `autoReconcile` looks the payment up with the same `signal`, so with the deadline gone it cannot: the error is thrown as it was, and you look it up later with `client.reconcile(error)` (see [Unknown outcomes and reconcile](./unknown-outcome#automatic-autoreconcile)).

## Proxies and fixed IP addresses

If your LINE Pay merchant settings require a fixed source IP address, or your network has to go through a proxy, there are two ways:

**1. Let the built-in `fetch` use the proxy.** On Node.js 24 and later (and 22.21 and later), the built-in `fetch` honours `HTTP_PROXY` / `HTTPS_PROXY` when the environment variable `NODE_USE_ENV_PROXY=1` is set. These variables must be set when the process **starts** (for example `NODE_USE_ENV_PROXY=1 HTTPS_PROXY=http://proxy:8080 node server.js`); assigning `process.env` in your code is too late. **Without** `NODE_USE_ENV_PROXY=1` the built-in `fetch` ignores these variables and connects directly; the axios of 0.9 honoured them by default, so a deployment that came from 0.9 and leaves through a proxy has to watch for this.

**2. Pass your own `fetch`.** The library sends requests only through `config.fetch`, so any compatible implementation works: for example the `fetch` of `undici` with its own `ProxyAgent` (passed as `{ dispatcher }`). Take the `fetch` and the dispatcher from the same version of `undici`: installing `undici` and calling `setGlobalDispatcher` to affect the `fetch` that is built into Node.js may not work when the major versions differ. The types of two versions of `undici` do not quite agree either, so TypeScript may want a small adapter. `baseUrl` can point at your forwarding host.

Either way the signature does not change: it covers the path and the content, not the host. The library **never follows redirects** (`redirect: 'error'`), because a custom authorization header must not be forwarded to another origin.

## Several merchants

A client belongs to one Channel ID and secret. To serve several merchants, create one client per merchant and cache it. A client is immutable, has no global state, and creating it does not connect to anything:

<<< @/../examples/config.ts#multi-tenant{ts}

## validate

`true` by default: the input is checked before it is sent, including whether the amounts of a `request` add up, the types of the fields, and whether there is a field the operation does not have (a misspelled `refundAmout`, an extra `customerEmail`). Set it to `false` to leave those checks to LINE Pay.

For a `request` the check of the fields goes all the way down into `redirectUrls`, `options` and `packages`, and the message says which object does not know the field. A field that LINE Pay adds later and this version does not list yet is refused there until the library catches up.

::: warning Some checks cannot be turned off

- Path parameters (`transactionId`, `regKey`): these values often come from the user's URL, and they are part of what is signed.
- The amount of a refund: no `refundAmount` means a **full refund**, and LINE Pay cannot know how much you meant to refund. So `refundAmount` is either a finite number above 0 or left out altogether; a field that is there with `undefined`, `NaN` or a string, or a misspelled name, is refused, also with `validate: false`.
- The input has to be plain data: an instance of a class, an object with a getter, a field that is not enumerable would lose fields in the copy without a word (a refund without `refundAmount` is a full refund), so it is refused, with the place it was found. To send data that lives in a class, build an object literal: `{ transactionId: x.transactionId, refundAmount: x.refundAmount }`.

:::

`validate` checks that an amount is a finite number above 0. It does **not** check the number of decimals of each currency (TWD has none, USD has two). An amount that does not fit is refused by LINE Pay; keep the precision of amounts right in your own code, and do not add prices up as floating-point numbers.
