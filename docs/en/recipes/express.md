# Express

Read the [recipes overview](./) first to see what `createPaymentService` does. This page only deals with HTTP.

## Routes

<<< @/../examples/express.ts#routes{ts}

- `req.query` goes straight to `confirmPayment`, which checks it with `parseConfirmQuery`. Express parses repeated parameters into arrays and nested keys into objects; both are refused.
- Express 5 passes the rejections of async handlers to the error-handling middleware. Express 4 needs a wrapper (`express-async-errors`, or a manual `try/catch`).
- A `LinePayValidationError` becomes a 400; the rest goes to your normal error handling.
- `in-progress` answers 202: the payment may already have succeeded, you just do not know yet. The page can refresh itself, or poll the order state. **Do not tell the user the payment failed.**

## Putting it together

<<< @/../examples/server.ts#wiring{ts}

The last part is the background job: once a minute it settles the `confirm` calls that never got an answer. See [Background reconcile](./background-job).

## Several instances

It is safe to run several instances, and several background jobs at the same time: every transition is a conditional update, and only one wins.
