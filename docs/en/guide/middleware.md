# Middleware

A middleware is a function that wraps every call. Retrying, reconciling, logging, rate limiting and metrics can all be written as middleware, without changing the library.

```ts
import type { Middleware } from 'line-pay-merchant'

const myMiddleware: Middleware = async (ctx, next) => {
  // before the call
  const result = await next() // the inner middleware and, in the end, the request
  // after the call
  return result
}
```

## ctx and next

| `ctx`       | Description                                                                         |
| ----------- | ----------------------------------------------------------------------------------- |
| `operation` | The name of the operation: `'request'`, `'confirm'`, …                              |
| `input`     | The input passed to the operation. Its type is narrowed by `operation` (see below). |
| `options`   | The `{ timeout, signal }` of this call.                                             |
| `startedAt` | When the call began.                                                                |
| `client`    | The client the call was made on, with its complete middleware stack.                |

`next()` returns `{ body, meta }`, or throws a `LinePayError`. It **may be called more than once** (that is how a retry works), but remember that re-sending an operation that moves money after an unknown outcome is dangerous.

## Order

The one registered first is the outermost:

```ts
createLinePayClient({
  // ...
  middleware: [a, b, c]
})
// a sees the final result; c is closest to the actual request.
```

Without a `middleware` option the default is `[retryWhenNotSent()]`. Pass `[]` for none at all.

`client.with(...)` returns a **new** client with more middleware placed on the **inside** of the existing stack. The client it is called on does not change:

```ts
const linePay = createLinePayClient(config) // [retryWhenNotSent()]
const reconciling = linePay.with(autoReconcile()) // [retryWhenNotSent(), autoReconcile()]
```

## Built in

### retryWhenNotSent

Retries only when it is **provable** that repeating is safe, with capped exponential backoff and full jitter:

- A request that provably never left (connection refused, DNS failure, network unreachable, **while the connection or the name lookup is being made**) is retried for **every operation**. A failure after the connection existed, or the response had begun, is only an unknown outcome even with the same code (the kernel sometimes reports a dead connection as `ECONNREFUSED`).
- Read-only operations (`paymentDetails`, `checkPaymentStatus`, `checkRegKey`) are also retried after an unknown outcome (a timeout, a cut connection, a 5xx, a response that cannot be read); a refusal by LINE Pay (`rejected`) and an abort by the caller are not retried. The exception is `checkRegKey` with `creditCardAuth`, which places an authorization on the card: it is not a read, and is not repeated after an unknown outcome.
- An operation that moves money is **never retried** after an unknown outcome.

| Option        | Default | Description                                |
| ------------- | ------- | ------------------------------------------ |
| `maxAttempts` | `3`     | Attempts in total, the first one included. |
| `baseDelayMs` | `200`   | Start of the backoff in milliseconds.      |
| `maxDelayMs`  | `2000`  | Upper bound of one wait in milliseconds.   |

### autoReconcile

Looks the call up when the outcome is unknown. See [Unknown outcomes and reconcile](./unknown-outcome#automatic-autoreconcile).

## Writing your own

### Log every call

<<< @/../examples/middleware.ts#logging{ts}

Note that `ctx.input` is narrowed by `ctx.operation`, so after `ctx.operation === 'confirm'` you can read `transactionId` directly.

### Block an operation

<<< @/../examples/middleware.ts#guard{ts}

### Put them together

<<< @/../examples/middleware.ts#compose{ts}

## Rules of thumb

- **Call `next()` once by default.** If you repeat, be sure why that is safe.
- **Do not swallow a `LinePayError`.** Either handle it and return a result, or rethrow it as it is.
- **Do not modify `ctx`.** It is read-only, and the same `ctx` goes to every middleware.
- **Hand back the result of the operation that was called.** The result of another operation, or a body with fields missing, makes the client throw a `LinePayMiddlewareError` (`outcome: 'unknown'`: the request may have been sent, and the error carries the `context`, so it can be reconciled).
- The lookups of reconcile (`paymentDetails`) go through the whole stack too, so your logging middleware sees them.
