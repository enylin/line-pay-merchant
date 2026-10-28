# Testing

Testing your payment code does not need LINE Pay. The `fetch` of the client can be replaced, so you decide what LINE Pay "answers" call by call, including the hardest cases to test: timeouts and broken connections.

[`examples/payment-service.test.ts`](https://github.com/enylin/line-pay-merchant/blob/main/examples/payment-service.test.ts) is a complete example that runs in CI. The code below comes from it.

## Setup

<<< @/../examples/payment-service.test.ts#harness{ts}

A few points:

- `middleware: []` turns retrying off. A test wants to decide what LINE Pay answers on every call, and a background retry would eat the responses you prepared.
- A `Response` can be read only once, so every response is `clone()`d before it is handed out. That lets one canned response serve several tests.
- When LINE Pay fails it still answers HTTP 200, with a `returnCode` that is not `0000`. To test a refusal, answer with that.
- A canned **success** has to look like a real one: the library checks the fields of a response (the `info.transactionId` and `info.payInfo` of a confirm, for example) before it hands it to you. With fewer fields the call fails with `reason: 'unexpected-shape'`. `reservation`, `confirmation` and `capturedPayment` above are the smallest valid responses of their operations.

## Testing "unknown outcome"

This is the path most worth testing. Simulate "the connection broke after the request was sent" with the kind of error Node.js throws:

<<< @/../examples/payment-service.test.ts#unknown-outcome-test{ts}

The first response is a connection reset (the `outcome` is `'unknown'`), the second is the payment details that reconcile looks at. The same way you can test:

- reconcile does not find the payment → the user may try again;
- reconcile fails as well → the order stays `confirming` and a background job settles it later;
- the process died before sending → only the `ReconcileContext` saved earlier is left.

## Testing input checks

<<< @/../examples/payment-service.test.ts#forged-test{ts}

## Fixing the time

Reconcile and background jobs look at the time. Fake only `Date`, not the timers, because the time limit of a request needs a real timer:

```ts
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-27T00:00:00Z'))
```

## Testing in the sandbox

The test data of the library itself (the fake responses, the test vectors of the signature) is **written by us**, and part of it comes from the tests of 0.9: it shows that the behaviour is consistent and matches what we understand of LINE Pay, and it **cannot** show that it matches what V4 really does. Only the sandbox can.

The sandbox is good for checking that the library and LINE Pay really work together; it does not belong in every CI run: it is slow, and a user has to approve the payment by hand in LINE. Suggestions:

- unit tests with a fake `fetch` (as above) on every commit;
- sandbox tests in a manually triggered or scheduled job, with the keys in environment variables, skipped when the keys are missing;
- before every release, walk through the flow of [Getting started](./getting-started) by hand.

## Helpers for tests

The library exports the error classes and the type guards. To test your own error handling, you can build an error directly; the constructor of every class takes **one object**:

```ts
import {
  LinePayApiError,
  LinePayNetworkError,
  LinePayTimeoutError
} from 'line-pay-merchant'

// LINE Pay answered with a failing returnCode. The category and the outcome follow from the code, or you can tell them.
const refused = new LinePayApiError({
  body: { returnCode: '1106', returnMessage: 'rejected' },
  httpStatus: 200
})

// It failed before a connection existed: the request was provably not sent.
const unreachable = new LinePayNetworkError({
  reason: 'connection-refused',
  outcome: 'not-sent'
})

// A timeout: the outcome is unknown.
const slow = new LinePayTimeoutError({ timeoutMs: 20_000 })
```

The `outcome` values each class accepts are fixed in the types, and an impossible combination does not compile (a `LinePayHttpError` cannot be `not-sent`: if a response came, the request went out). `LinePayError` itself is abstract and cannot be constructed.

To test `reconcile`, though, the most reliable way is a real client against a fake `fetch`, because only the errors thrown by a client carry a `context` and a `meta`. You can add them yourself too: they are plain properties, and `error.context = { operation: 'confirm', startedAt: new Date(), … }` works.
