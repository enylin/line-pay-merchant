# Upgrading from 0.9 to 1.0

1.0 is a breaking release that does three things at once: it moves to LINE Pay **V4**, it has **zero runtime dependencies**, and it fixes several defects of 0.9 that caused wrong behaviour. Most calls only changed shape; the names are the same.

::: tip If you still use V3
1.0 supports V4 only. For V3, stay on 0.9.x: `npm install line-pay-merchant@0.9`.
:::

## The short list

| Change                                       | Effect                                                                                                                       |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **V4** only                                  | Paths, some fields and the responses differ; the [official documentation](https://developers-pay.line.me/) is the reference. |
| Node.js **22+**                              | 0.9 declared 10.12 to 17.                                                                                                    |
| Zero dependencies                            | axios, crypto-js and uuid are gone; the built-in `fetch` and Web Crypto are used.                                            |
| `env: 'development'` → `'sandbox'`           | The old value gives an error that names the new one.                                                                         |
| Call shape                                   | No more `.send({ body, params })`; one flat input object plus optional call settings.                                        |
| Returns `{ body, meta }`                     | `comments` became a typed `meta`.                                                                                            |
| handler → middleware                         | No longer mutable; **the order is reversed**; the built-in behaviour differs.                                                |
| Error classes renamed and given an `outcome` | Use the type guards, not `instanceof`.                                                                                       |
| `JPY` removed                                | LINE Pay Japan ended its service.                                                                                            |

## Step by step

### 1. Configuration

```ts
// 0.9
createLinePayClient({ channelId, channelSecretKey, env: 'development' })

// 1.0
createLinePayClient({ channelId, channelSecretKey, env: 'sandbox' })
```

New: `timeouts`, `fetch`, `baseUrl`, `merchantDeviceProfileId` and `merchantDeviceType` (set together), `middleware`, `validate`. See [Configuration](/en/guide/configuration). `timeout` existed in 0.9 but did nothing (see A3 below). The configuration is checked when the client is created.

### 2. Calls

A flat input object: path parameters and body or query fields side by side.

```ts
// 0.9
await client.request.send({
  body: { amount, currency, orderId, packages, redirectUrls }
})
await client.confirm.send({ transactionId, body: { amount, currency } })
await client.refund.send({ transactionId, body: { refundAmount: 20 } })
await client.paymentDetails.send({ params: { transactionId: ['…'] } })
await client.checkPaymentStatus.send({ transactionId, params: {} })

// 1.0
await client.request({ amount, currency, orderId, packages, redirectUrls })
await client.confirm({ transactionId, amount, currency })
await client.refund({ transactionId, refundAmount: 20 })
await client.paymentDetails({ transactionId: ['…'] })
await client.checkPaymentStatus({ transactionId })
```

The second argument holds the settings of this call: `{ timeout, signal }`. The names of the operations are the same as in 0.9.

### 3. The return value

```ts
// 0.9
const { body, comments } = await client.confirm.send(...)

// 1.0
const { body, meta } = await client.confirm(...)
// meta: { operation, startedAt, durationMs, attempts, httpStatus?, recovered? }
```

In 1.0 the type of `body` is checked, not assumed: the response is compared field by field with the type of the operation before it is returned. A response that lacks a field of its type (as can happen while you explore the V4 sandbox) is an `unexpected-shape` error with the outcome `unknown`, and the body as received is in `error.body`.

### 4. Handlers become middleware

| 0.9                                                            | 1.0                                                                                             |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `api.addHandler(fn)`                                           | `createLinePayClient({ middleware })`, or `client.with(fn)` (returns a new client)              |
| `createTimeoutRetryHandler()`                                  | `retryWhenNotSent()`, **on by default**, and it only retries when provably safe                 |
| `createPaymentDetailsRecoveryHandler(paymentDetailsToConfirm)` | `autoReconcile()`, or `client.reconcile(error)` by hand                                         |
| `paymentDetailsToRefund`                                       | `reconcile` is more careful with refunds: it never answers `not-applied` from the details alone |

```ts
// 0.9: attached on every call
const res = await linePayClient.confirm
  .addHandler(createTimeoutRetryHandler())
  .addHandler(createPaymentDetailsRecoveryHandler(paymentDetailsToConfirm))
  .send({ transactionId, body: { currency: 'TWD', amount: 1000 } })

// 1.0: decided once, when the client is created
const linePay = createLinePayClient(config).with(autoReconcile())
const { body, meta } = await linePay.confirm({
  transactionId,
  currency: 'TWD',
  amount: 1000
})
```

::: warning The order is reversed
0.9: the handler **added first** runs later (it is the inner one). 1.0: the middleware **registered first** is the **outermost**. If you wrote handlers yourself, check the order again.
:::

A handler you wrote has to become `(ctx, next) => …`; see [Middleware](/en/guide/middleware).

### 5. Errors

| 0.9                                             | 1.0                                                                                                                                                                                 |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LinePayApiError` / `isLinePayApiError`         | Same class names, but the properties were renamed: `statusCode` → `httpStatus`, `data` → `body`; adds `outcome`, `category`. **`error.data.returnCode` becomes `error.returnCode`** |
| `HttpError` / `isHttpError`                     | `LinePayHttpError` / `isLinePayHttpError`; the properties were renamed the same way: `statusCode` → `httpStatus`, `data` → `body`                                                   |
| `TimeoutError` / `isTimeoutError`               | `LinePayTimeoutError` / `isLinePayTimeoutError`                                                                                                                                     |
| a bare `SyntaxError`, a bare connection `Error` | `LinePayHttpError` (the body is not a LINE Pay response), `LinePayNetworkError`                                                                                                     |
| (none)                                          | `LinePayValidationError`, `LinePayAbortError`, `LinePayMiddlewareError`, and the common `LinePayError`                                                                              |

```ts
// 0.9
if (e instanceof TimeoutError) { … }

// 1.0
if (isLinePayTimeoutError(e)) { … }   // or look at e.outcome
```

The `name` of every error is the name of its class (in 0.9 all were `"Error"`), and they carry a `cause`. See [Errors and outcomes](/en/guide/errors).

### 6. Types

| 0.9                                                                                                                                                                               | 1.0                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `LineMerchantConfig`                                                                                                                                                              | `LinePayConfig`                                                                                                        |
| `RequestRequestBody` / `RequestResponseBody`                                                                                                                                      | `RequestPaymentInput` / `RequestPaymentResponse`                                                                       |
| `ConfirmRequestBody` / `ConfirmResponseBody`                                                                                                                                      | `ConfirmInput` (includes `transactionId`) / `ConfirmResponse`                                                          |
| `CaptureRequestBody` / `CaptureResponseBody`                                                                                                                                      | `CaptureInput` / `CaptureResponse`                                                                                     |
| `VoidRequestBody` / `VoidResponseBody`                                                                                                                                            | `VoidInput` / `VoidResponse`                                                                                           |
| `RefundRequestBody` / `RefundResponseBody`                                                                                                                                        | `RefundInput` / `RefundResponse`                                                                                       |
| `PaymentDetailsRequestParams` / `…ResponseBody`                                                                                                                                   | `PaymentDetailsInput` / `PaymentDetailsResponse`                                                                       |
| `CheckPaymentStatusRequestParams`                                                                                                                                                 | `CheckPaymentStatusInput`                                                                                              |
| `CheckRegKeyRequestParams`                                                                                                                                                        | `CheckRegKeyInput`                                                                                                     |
| `PayPreapprovedRequestBody` / `…ResponseBody`                                                                                                                                     | `PayPreapprovedInput` / `PayPreapprovedResponse`                                                                       |
| `ExpireRegKeyRequestBody` / `…ResponseBody`                                                                                                                                       | `ExpireRegKeyInput` / `ExpireRegKeyResponse`                                                                           |
| `Payment`, `Display`, `Extra`, `FamilyService`, `RequestOptions`, `RequestShipping` (the options of `request`)                                                                    | `PaymentOptions`, `DisplayOptions`, `ExtraOptions`, `FamilyServiceOptions`, `RequestPaymentOptions`, `ShippingOptions` |
| `Fields`, `Refund`, `Event` (payment details)                                                                                                                                     | `PaymentDetailsFields`, `RefundEntry`, `PromotionEvent`                                                                |
| `GeneralResponseBody`, `CheckPaymentStatusResponseBody`                                                                                                                           | `LinePayResponse`, `CheckPaymentStatusResponse`                                                                        |
| `ConfirmPayInfo`, `CapturePayInfo`, `PaymentDetailsPayInfo`; `ConfirmPackage`, `PaymentDetailsPackage`; `ConfirmShipping`, `PaymentDetailsShipping`, `CheckPaymentStatusShipping` | `PayInfo`; `ResponsePackage`; `SelectedShipping`                                                                       |
| `PaymentUrl` and the `*Info` types (`RequestInfo`, `ConfirmInfo`, …)                                                                                                              | Part of the response types: `RequestPaymentResponse['info']`, `ConfirmResponse['info']`, …                             |
| `*RequestConfig`, `ApiHandler`, `PaymentApi`, `HttpClient`, `HttpConfig`, `HttpResponse`, `QueryParams`, `EmptyObject`, `GeneralRequestConfig`                                    | Removed (internals of 0.9). Use `Middleware` and `LinePayClient`                                                       |

The aliases 0.9 added to avoid name clashes (`ConfirmPayInfo`, `CapturePayInfo`, …) are not needed any more: shared types exist once, for example `PayInfo`, `Product`, `Address`.

## What was fixed

0.9 had several defects that caused wrong behaviour. 1.0 fixes them, each with a regression test:

| ID  | The problem in 0.9                                                                                                                                                                                                                                                     | 1.0                                                                                                      |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A1  | `addHandler()` mutated a shared array. Registering a handler inside every request added one more copy each time, and every copy of the retry handler retried on its own, so the attempts multiplied (with the default 10 retries, 11 times more for every extra copy). | Clients are immutable; `with()` returns a new client.                                                    |
| A2  | After a refund timeout, `paymentDetailsToRefund` reported success whenever the original payment existed, using the **original** payment's ID and date and ignoring the `refundList`.                                                                                   | `reconcile` only reads the `refundList`; no match never gives `applied`, and never `not-applied` either. |
| A3  | `createLinePayClient({ timeout })` had no effect: every API passed its default explicitly and overrode it.                                                                                                                                                             | Order of precedence: call → `timeouts[op]` → `timeout` → default.                                        |
| A4  | `transactionId` and `regKey` went into the signed path as they were, so `../` could rewrite the path.                                                                                                                                                                  | Always validated and encoded.                                                                            |
| A5  | 502 with HTML, 200 with HTML and 200 with an empty body threw a bare `SyntaxError`; a refused connection threw a bare `Error`.                                                                                                                                         | All classified as `LinePay*Error`, with an `outcome`.                                                    |
| A6  | 19-digit numbers in fields such as `originalTransactionId` were parsed as numbers and lost their last digits.                                                                                                                                                          | Integers outside the safe range are strings in **every** field.                                          |

Also, retrying no longer confuses "provably not sent" with "sent, but the result is unknown". 0.9 retried up to 10 times with 5 seconds between attempts by default, so `confirm` could block for 490 seconds in the worst case, and the retry could be attached to a refund.

## Differences in behaviour (the easiest to miss)

| What                                  | 0.9                                                        | 1.0                                                                                                                                                                                                              |
| ------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A query parameter with several values | `transactionId=1%2C2` (joined with a comma, then encoded). | Repeated keys: `transactionId=1&transactionId=2`. Which of the two V4 accepts has to be verified (`TODO(v4-spec)`); after the upgrade, look up two values in the sandbox once.                                   |
| A `returnCode` that starts with `0`   | Every one was a success, for every API.                    | Only `0000` is a success. The others that start with `0` are **status codes**, returned as they are only by `checkPaymentStatus`; any other operation throws a `LinePayApiError` whose `outcome` is `'unknown'`. |
| Checking of the input                 | None; it was sent as it was.                               | `validate` is on by default: a bad input that 0.9 could send (amounts that do not add up, a field that does not exist) now throws a `LinePayValidationError` before it is sent.                                  |
| The form of the input                 | Any object.                                                | Plain data only: an instance of a class, or an object with a getter, is refused (see [Configuration](/en/guide/configuration#validate)).                                                                         |
| What the package exports              | Files inside the package could be imported deeply.         | Only the package root is exported (`exports`); a deep import fails.                                                                                                                                              |
| Proxies                               | axios honoured `HTTP_PROXY` / `HTTPS_PROXY` by default.    | The built-in `fetch` does **not**; set `NODE_USE_ENV_PROXY=1`, see [Configuration](/en/guide/configuration#proxies-and-fixed-ip-addresses).                                                                      |

## Checklist

1. [ ] Move to Node.js 22 or later.
2. [ ] `env: 'development'` → `'sandbox'`.
3. [ ] Change calls to flat input and read `{ body, meta }` (search for `.send(`).
4. [ ] Remove `addHandler`, `createTimeoutRetryHandler`, `createPaymentDetailsRecoveryHandler`; decide whether to use `autoReconcile()`.
5. [ ] Replace `instanceof` with the type guards (search for `instanceof HttpError`, `instanceof TimeoutError`).
6. [ ] Rename the types (see the table above).
7. [ ] Remove `JPY`.
8. [ ] Check every V4 field difference (against the official documentation).
9. [ ] Run the whole flow in the **sandbox**: request, confirm, refund, and a double confirm to check how duplicates are handled.
10. [ ] Add saving a `ReconcileContext` before `confirm` to your order flow (see [Background reconcile](/en/recipes/background-job)).
