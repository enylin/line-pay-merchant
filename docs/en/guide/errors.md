# Errors and outcomes

Every error the library throws on purpose is a subclass of `LinePayError` (`LinePayError` itself is abstract and cannot be constructed). Each one has:

| Property              | Description                                                                                                                                                                                                                                                                        |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                | A stable string such as `'LINE_PAY_API_ERROR'`, safe to branch on and to log. In the types, the `code` of each class is its own literal, so when you branch with `switch (error.code)` the compiler narrows `error` to that class (see [Branching on `code`](#branching-on-code)). |
| `outcome`             | **Whether the request took effect**: `'not-sent'`, `'unknown'` or `'rejected'`. The values each class can have are in its type (see the table below). Explained further down.                                                                                                      |
| `operation`           | Which operation it happened in, for example `'confirm'`.                                                                                                                                                                                                                           |
| `cause`               | The underlying error (for example the one `fetch` threw), if any. For a timeout it is the `TimeoutError` that aborted the `fetch`; for an abort it is the reason you gave the `AbortSignal`.                                                                                       |
| `meta`                | How the call went: `{ operation, startedAt, durationMs, attempts, httpStatus? }`, the same shape as `result.meta` of a call that worked (see [How the call went](#how-the-call-went)).                                                                                             |
| `context`             | What `reconcile` needs: the operation, when it started, transaction ID, amount, channel ID. No headers, signature or secret. **Not enumerable** (see [Logging errors](#logging-errors)).                                                                                           |
| `reconcileConclusion` | Only when [`autoReconcile`](./unknown-outcome) looked the call up and could not confirm that it took effect: `{ status, reason }`.                                                                                                                                                 |

`operation`, `meta`, `context` and `reconcileConclusion` are filled in by the client and the middleware **after** the error was made, and are absent before that. An error that comes before there is a call (invalid call options, an input that cannot be copied) has an `operation` and no `meta` or `context`.

## Error classes

| Class                    | `code`                      | `outcome`               | When                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------ | --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LinePayValidationError` | `LINE_PAY_VALIDATION_ERROR` | `not-sent`              | The input or the configuration is invalid. Nothing was sent. `issues` lists each field (how the path is written: see [Paths of the issues](#paths-of-the-issues)).                                                                                                                                                                                                                                                                                                                              |
| `LinePayApiError`        | `LINE_PAY_API_ERROR`        | `rejected` or `unknown` | LINE Pay answered and the `returnCode` says it failed (whatever the HTTP status).                                                                                                                                                                                                                                                                                                                                                                                                               |
| `LinePayHttpError`       | `LINE_PAY_HTTP_ERROR`       | `rejected` or `unknown` | The HTTP status is not 2xx and the body is not a LINE Pay response, or a 2xx body is not one (for example HTML from a proxy), or a 2xx body is a LINE Pay response but not the one the operation promises (a missing `info`, a field of the wrong type; `reason: 'unexpected-shape'`, the body as received is in `error.body`), or the body is larger than 8 MiB (`reason: 'body-too-large'`). Non-2xx HTTP statuses are `unknown`, even 4xx, because a gateway may have forwarded the request. |
| `LinePayNetworkError`    | `LINE_PAY_NETWORK_ERROR`    | `not-sent` or `unknown` | `fetch` failed before a response arrived.                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `LinePayTimeoutError`    | `LINE_PAY_TIMEOUT_ERROR`    | `unknown`               | The time limit passed before LINE Pay answered.                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `LinePayAbortError`      | `LINE_PAY_ABORT_ERROR`      | `not-sent` or `unknown` | The `AbortSignal` you passed fired.                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `LinePayMiddlewareError` | `LINE_PAY_MIDDLEWARE_ERROR` | `unknown`               | A middleware handed back something that is not the result of the operation (the result of another operation, say, or a body with fields missing). The request may have been sent and may have taken effect, hence `unknown`; the error carries the `context`, so it can be reconciled; it has no `meta`: the numbers on a result that is not what the operation promises are not facts about the call.                                                                                          |

Tell them apart with the type guards, not with `instanceof`:

```ts
import { isLinePayApiError, isLinePayTimeoutError } from 'line-pay-merchant'
```

::: tip Why not `instanceof`
A package that ships both ESM and CommonJS can be loaded twice in one process, and `instanceof` is `false` across the two copies. The type guards check a shared brand, which both copies recognise.
:::

## Branching on `code`

`isLinePayError(error)` narrows `error` to `AnyLinePayError`, the union of the seven classes above. When you branch with `switch (error.code)`, `error` is that class inside each `case`: its fields (`issues`, `returnCode`, `timeoutMs`, …) can be used directly, and `error.outcome` is only what that class can have. Do not write a `default`: when a class is added later, the compiler asks you to add the branch.

<<< @/../examples/errors.ts#code{ts}

## outcome: did the request take effect

This is the most important concept of the library. **The kind of failure decides whether you may try again.**

| `outcome`  | Meaning                                                                                                   | What to do                                                                                                                                                                                                   |
| ---------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not-sent` | The request **provably** did not leave (it failed before a connection existed, or the input was invalid). | Nothing moved. A request that failed before a connection existed can be sent again as it is (the default middleware retries the network-level ones); invalid input has to be fixed first, or it fails again. |     |
| `rejected` | LINE Pay received it and **refused** it.                                                                  | Read the `returnCode`; usually fix and resend, or tell the user. **Duplicate codes (`category: 'duplicate'`, see [below](#the-returncode-of-line-pay)) are the exception**: ask `needsReconcile()` first.    |
| `unknown`  | The request **may** have been processed, but no trustworthy response came back.                           | **Do not treat it as a failure and do not re-send it.** For operations that move money, [reconcile](./unknown-outcome).                                                                                      |

`outcome` exists on every `LinePayError`, so you can branch on it directly:

<<< @/../examples/errors.ts#outcome{ts}

## Handling errors

<<< @/../examples/errors.ts#branch{ts}

## Paths of the issues

The `path` of an entry of `issues` is written the same way whichever layer found the problem: the way the field is reached, for example `amount`, `packages[0].products[1].price`, `transactionId[2]`. The path of an input starts at the input object; when the input as a whole is the problem (not an object, cannot be copied) it is `input`.

- A problem with the call options (the second argument) is `options.timeout` or `options.signal`. The input of `request` has an `options` field of its own, whose paths look like `options.payment.capture`; the call options have only those two fields, so they cannot be mistaken for each other.
- A problem with a configuration (the configuration of `createLinePayClient`, the options of a middleware such as `retryWhenNotSent`, `client.with()`) starts at the configuration object: `channelId`, `timeouts.refund`, `maxAttempts`, `middleware[0]`; a runtime that does not qualify is `runtime`.
- The beginning of the message tells them apart too: `Invalid input for confirm:` (an input, when the operation is known), `Invalid input:`, `Invalid configuration:`.

## How the call went

When a call fails, `error.meta` tells how it failed, in the same shape as `result.meta` of a call that worked (see [`CallMeta`](/en/api/interfaces/CallMeta)):

- `attempts`: how many times the request was attempted, including attempts that never connected. When the retry middleware gives up, the error says the total it made; an input that was refused (before anything was sent) counts as one.
- `durationMs`: the total time from the start of the call to giving up, the waits between retries included.
- `httpStatus`: the HTTP status of the last response. Absent when there was none (a network error, a timeout, an abort, a refused input).

`error.meta.startedAt` and `error.context.startedAt` are the same moment.

## The returnCode of LINE Pay

LINE Pay (V3) answers **HTTP 200** even when something failed, and puts the result in `returnCode`; V4 is expected to do the same, but that has not been checked against the official reference. So:

- On a `LinePayApiError`, `returnCode` and `returnMessage` are what LINE Pay said, and `httpStatus` is the HTTP status.
- Even when the HTTP status is not 2xx, a body that is a LINE Pay response with a failing code is still a `LinePayApiError`, not a `LinePayHttpError`: that way a duplicate code (`category: 'duplicate'`) is not lost behind a status code. The `outcome` follows the status and the code: every non-2xx HTTP status is `'unknown'`, including 400, 408 and 429 from a proxy or gateway, because the request may already have reached LINE Pay. The `returnCode` remains available for diagnosis and reconciliation, but a non-2xx status alone does not prove a charge or refund never happened.
- `0000` is success; the one exception is `checkPaymentStatus`, where `0000` means the user has **not** authorized the payment yet (see the [payment flow](./payment-flow)). The other codes that start with `0` are **status codes**, which only `checkPaymentStatus` uses; they are returned as they are, not thrown. If any other operation receives one, the library cannot tell what became of the call, and throws a `LinePayApiError` with `outcome: 'unknown'` (so an operation that moves money can be reconciled).
- `1152`, `1165`, `1172` and `1198` are marked `category: 'duplicate'`: the request is a duplicate (the transaction exists, the payment is refunded already, the same call is being processed, …), and **the first one may have succeeded**. Their `outcome` is `'rejected'` (**this** call was refused), but for the operations that can be reconciled (`confirm`, `capture`, `void`, `refund`, `payPreapproved`) `needsReconcile()` is `true` for them, so when you handle an error ask `needsReconcile()` **first** and look at the `returnCode` second.
- `1145`, `1179`, `1199`, `1280`, `1999`, `2042`, `9000` and `1900`–`1909` are marked `category: 'unresolved'`: LINE Pay failed inside, is still working on the payment, or cannot handle it at the moment (often because of an earlier call). That is **not a refusal**: the `outcome` is `'unknown'`, `needsReconcile()` is `true` for the operations that can be reconciled, and reconcile looks it up. The list is partly historical and not a complete official V4 code table. V4 explicitly allows retry of 1999 for refund and void, but this SDK still checks the outcome before retrying; a code that is not on it is taken for a refusal (marked `TODO(v4-spec)` in the source).
- All other codes are `'unclassified'`. For the complete table, see the [official documentation](https://developers-pay.line.me/).

## Logging errors

- `JSON.stringify(error)`, `console.log(error)`, `console.error({ error })` and `util.inspect(error)` print a **whitelist** (the content of `toJSON()`, of type `LinePayErrorJSON`): the stack (if any) plus `name`, `code`, `message`, `outcome`, `operation`, `meta` (`startedAt` as an ISO 8601 string), `reconcileConclusion`, the HTTP status, `returnCode` and so on; a field that has no value is left out. They do **not** include the response body, headers, signatures or the secret, and not the `context` or the details of the `cause`.
- `error.body`, `error.bodyText` (`LinePayHttpError`, cut at 2 KB) and `error.context` are **not enumerable**. A logger that copies the properties of an error (the `err` serializer of pino, `{ ...error }`) does not pick them up, which matters because a response can hold a `regKey`, a masked card number or an address (a response that is not what the operation promises is kept whole in `error.body`), and the `context` holds the order and transaction IDs and the amount. Read them by name when you need them, after checking that they hold nothing you must not write down. To log an error, log `error.toJSON()`, or pick the fields you want.
- An error does not survive `structuredClone` or `postMessage`: the copy is a plain `Error` that keeps the name, the message, the stack and the cause, and loses its class and the other fields. To send one somewhere, send `error.toJSON()`.
- The message of the `cause` in that view has the path of any URL it names cut off, since the path of some calls holds a `regKey`.
- The client itself can be serialised safely: it only has methods and no secret.
