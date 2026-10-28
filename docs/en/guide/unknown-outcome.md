# Unknown outcomes and reconcile

## The problem

You call `confirm`, wait 40 seconds, and it times out. Now:

- the request may never have reached LINE Pay, and nobody was charged; or
- it did arrive, LINE Pay charged the customer, and only the response was lost on the way back.

From your side the two cases look **exactly the same**. If you treat it as a failure, some customers are charged and see "payment failed". If you simply send it again, `confirm` is usually fine in V3 (LINE Pay refuses the second one as a duplicate; V4 has yet to be verified in the sandbox), but `refund` may refund twice.

So this library does not call it a failure. The `outcome` is `'unknown'`, and there is a method to **find out**.

## Reconcile: client.reconcile()

`reconcile` is simple: it asks `paymentDetails` whether the payment details show a trace of the call having taken effect, and answers one of three things. It **only reads**; it never re-sends the original request.

| `status`        | Meaning                                                             | What to do                                                                                                                                                                                                                                                                 |
| --------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applied`       | It took effect. `body` is rebuilt from the payment details.         | Treat it as a success. Log the `notes`.                                                                                                                                                                                                                                    |
| `not-applied`   | It did not take effect (as far as the payment details say **now**). | **One look is not enough.** Look a second time a few minutes later, and give the order back for another try only if both found nothing. A retry of `payPreapproved` must use the **same `orderId`** (LINE Pay refuses duplicates by it; a new `orderId` is a new payment). |
| `indeterminate` | The evidence does not settle it. `reason` says why.                 | **Do not guess.** Look again later, or check the Merchant Center.                                                                                                                                                                                                          |

<<< @/../examples/reconcile.ts#basic{ts}

`needsReconcile(error)` is `true` when all three hold:

1. the operation is one of `confirm`, `capture`, `void`, `refund`, `payPreapproved`;
2. the error has a `context` (the client attaches it);
3. the `outcome` is `'unknown'`, or LINE Pay answered a duplicate code (`category: 'duplicate'`, see [Errors and outcomes](./errors#the-returncode-of-line-pay)).

Other errors (invalid input, rejected, provably not sent) need no lookup, and `reconcile` answers them directly: a call that was never sent, or that LINE Pay refused, is `not-applied`, without another API call.

## How each operation is judged

| Operation        | What it looks up                        | `applied` when                                                                                                                                                                  | `not-applied` when                                                   | Otherwise                                                                                                                                                                                                                                   |
| ---------------- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `confirm`        | payment details by `transactionId`      | the payment exists, its status is `CAPTURE` or `AUTHORIZATION`, the currency is the same and the amounts of the payment methods add up to the amount of the confirm             | the payment is not in the payment details (conditions below)         | `indeterminate`                                                                                                                                                                                                                             |
| `capture`        | same                                    | the status is `CAPTURE` and the amount and currency match                                                                                                                       | the status is still `AUTHORIZATION`                                  | `indeterminate`                                                                                                                                                                                                                             |
| `void`           | same                                    | the status is `VOIDED_AUTHORIZATION`                                                                                                                                            | still `AUTHORIZATION`, already `CAPTURE`, or `EXPIRED_AUTHORIZATION` | `indeterminate`                                                                                                                                                                                                                             |
| `payPreapproved` | by `orderId`                            | exactly one payment carries this `orderId`, its status is `CAPTURE` or `AUTHORIZATION`, the amount and currency match, and it is dated **later than the second the call began** | no payment carries this `orderId` (conditions below)                 | `indeterminate` (several, voided or expired, amount differs, an older payment, an entry it cannot read)                                                                                                                                     |
| `refund`         | payment details of the original payment | the `refundList` has **exactly one** entry with the same amount (absolute value) made **later than the second the call began**, and none of that amount that it cannot read     | **never**                                                            | `indeterminate`. A refund that LINE Pay refused as a duplicate is **always** `indeterminate`, without a lookup: the refund that can be found was made by the call it duplicates, and counting it for this one would count one refund twice. |

**When `not-applied` is concluded.** "Not found" counts as evidence only if all three hold:

1. the payment details hold **no entry at all**. An entry that does not match (an ID that differs in a character, another order) makes it `indeterminate`: the payment of this call may be among what cannot be matched.
2. LINE Pay did not say the call is a duplicate (a code of `category: 'duplicate'`). If it says something exists and you cannot find it, you cannot say nothing happened.
3. the context carries a `channelId`. With the credentials of another channel nothing is found (see below).

If one is missing the answer is `indeterminate`, and the `reason` says which.

**`applied` and capturing.** The context of a `confirm` or `payPreapproved` does not say whether the call asked to capture (the default does). If the payment is only `AUTHORIZATION`, the `notes` of `applied` gain a reminder: an authorization that is never captured expires, so look at the payment again.

`request`, the read operations and `expireRegKey` are not reconciled: when `request` times out the user never got a payment URL, so no money moved, and reads can simply be repeated.

## Automatic: autoReconcile()

Writing the same `try/catch` everywhere is tedious and easy to forget. `autoReconcile()` wraps the flow as a middleware. It is **not the default**, because it turns an error into a success, so you opt in:

<<< @/../examples/reconcile.ts#auto{ts}

- When the lookup confirms that the call took effect, the call **returns** the inferred result, and `meta.recovered` says so:
  - `reason`: `'unknown-outcome'` (timeout, cut connection) or `'duplicate'` (LINE Pay answered a duplicate);
  - `cause`: the original error;
  - `notes`: what the evidence does not cover. **Read them.**
- Otherwise it **rethrows the original error**, with the conclusion in `error.reconcileConclusion` (`status` and `reason`). You get the original error plus the conclusion, never a rewritten error.
- It can be limited to some operations: `autoReconcile({ operations: ['confirm'] })`.
- Put it **inside** `retryWhenNotSent()` (`client.with(autoReconcile())` does exactly that), so that `meta.attempts` is counted right.
- **A deadline for the whole call leaves it no time to look.** The lookup uses the same `signal`: if you bound the whole call with `AbortSignal.timeout(8000)` and the request was already sent when the deadline passed, the `signal` has fired, the lookup is not made, the error is thrown as it was and its `reconcileConclusion` is `indeterminate` (the reason is the abort). Look it up later with `client.reconcile(error)` (without that `signal`), for example in a [background job](/en/recipes/background-job).

## The process dies before it hears back

The most dangerous case is not a timeout but **your process being killed while it waits**: a deploy, an out-of-memory kill, a crash. Then there is no error object to pass to `reconcile`.

The answer is to save a `ReconcileContext` **before** the call, and let a background job reconcile from it later:

<<< @/../examples/reconcile.ts#context{ts}

A `ReconcileContext` is a plain object (`operation`, `startedAt`, plus the transaction ID, amount and so on), so it can go into your database. Every field its operation needs must be there **and of the right type** (the transaction ID and the `orderId` are strings, amounts are numbers). If one is missing or wrong, `reconcile` answers `indeterminate`, says which, and **does not look anything up**. That is deliberate: an `orderId` that came back from a database as a number never equals the string LINE Pay reports, and "found nothing" would be read as "did not happen".

| Operation            | Needs                                 | Also uses                                       |
| -------------------- | ------------------------------------- | ----------------------------------------------- |
| `confirm`, `capture` | `transactionId`, `amount`, `currency` |                                                 |
| `void`               | `transactionId`                       |                                                 |
| `refund`             | `transactionId`                       | `refundAmount` (leave it out for a full refund) |
| `payPreapproved`     | `orderId`, `amount`, `currency`       |                                                 |

The `context` of every error also carries the `channelId` of your client. **Always put it on the contexts you save**: when a context belongs to another channel, `reconcile` refuses to look it up, and a context without a `channelId` never gets `not-applied`. Other credentials do not see the payment, and "not found" must not be taken for "did not happen". What you read back from JSON has a string or a number for `startedAt`, and `reconcile` accepts both: an ISO 8601 string with a time zone (`2026-10-27T00:00:00Z`) or **milliseconds** since the epoch (a number below `1e12` is most likely seconds and is refused); there is no need to turn it into a `Date` first. The details per operation are in the [API reference](/en/api/interfaces/ReconcileContext).

For the complete order state machine, the claim and the background job, see [Background reconcile](/en/recipes/background-job).

## Refunds need extra care

A refund is **not idempotent**: partial refunds can legitimately repeat, so LINE Pay cannot protect you from a duplicate. Therefore:

- Never wrap a refund in a retry loop of your own. The default middleware does not retry refunds either (unless the request provably never left).
- From the payment details alone, `reconcile` **never** answers `not-applied` for a refund. Not finding the refund in the payment details does not mean LINE Pay did not make it: it may still be processing. (A refund that provably never left, or that LINE Pay refused, is proved by the error itself and needs no lookup.)
- It answers `applied` only when exactly one matching refund exists; none or several give `indeterminate`. So does an entry in the refund list that it cannot read (a type it does not know, a time without a time zone) and that has the amount of this call, so that it **may be** this call's refund.
- **Queue the refunds of one payment.** Payment details timestamps may have only second precision. Same-second refund matches are `indeterminate`, but overlapping refunds of the same amount can still be confused even when they occur in different seconds. Lock or queue the refunds per payment, which accounting needs anyway.
- On `indeterminate`, check the Merchant Center, and only start a new refund once you have confirmed there is none.

## Limits

Reconcile is an **inference**, not a response from LINE Pay. Know where it ends:

- **The regKey cannot be recovered.** Only the `confirm` of a pre-approved payment returns a `regKey`; the payment details do not have it. In that case the `notes` of `applied` warn you, and a person has to handle it.
- **It cannot tell which call did it.** The payment details only tell you the state _now_. For example a `capture` that shows `CAPTURE` may have been captured by another call. The `notes` say so.
- **"Not found" means "not found now".** `not-applied` says the payment details do not show the payment **at this moment**, not that LINE Pay will never process it. The details can lag, so a lookup right after a timeout that finds nothing does not promise that nobody was charged. Therefore: do not give the order back after one look; look a second time a few minutes later. And once the order has been given back, keep a way for a late success to still mark it paid (see [Background reconcile](/en/recipes/background-job)). Comparing with the transaction report of the Merchant Center every day remains the last line of defence.
- **Clocks and same-second ambiguity.** Refunds and pre-approved payments are considered possible matches only when the recorded timestamp is in a **later whole second** than the call's start. A same-second match produces `indeterminate`, even if the payment actually succeeded, because LINE Pay timestamps may omit milliseconds and an earlier payment might look identical. Keep clocks synchronized with NTP. Even later-second matches are only inferences: concurrent calls for the same transaction and amount can still be confused. Queue refunds by transaction ID and verify uncertain results in the Merchant Center. Timestamps without a time zone and implausibly old `startedAt` values are never trusted.
- **No guessing at what it cannot read.** When the payment details do not have the expected shape (a missing field, a wrong type, an amount that is not a number, the same payment more than once, a type it does not know), `reconcile` answers `indeterminate` and `reason` says what could not be read. It does not throw because of it, and it never takes half an answer for the truth.
- **`1150` is read as "no such transaction".** The V3 sandbox answers `1150` for a transaction it does not find (observed, not documented), and `reconcile` takes that for an empty answer, not for a failed read: only then can `confirm` and `payPreapproved` get `not-applied`. Whether V4 does the same has to be verified (`TODO(v4-spec)`). If `1150` means something else in V4, `not-applied` may be wrong: before going live, look up a transaction that does not exist in the sandbox and see what comes back.
- **It assumes the payment details list only confirmed payments.** If V4 also lists payments that the user approved and nobody confirmed yet, the reconcile of a `confirm` could call an unconfirmed order `applied`. That assumption has to be verified in the V4 sandbox (`TODO(v4-spec)`).
- **Your `fetch` must not retry on its own.** "Provably not sent" rests on every call of `fetch` sending a request once. A custom `fetch`, or a global undici RetryAgent set up to retry POST, can send a call twice.
- **A custom `fetch` must also honour `redirect: 'error'` and `signal`.** The library asks for redirects to be refused, so that the signature never goes to another host, and it stops a call by aborting the `signal`. A `fetch` that follows redirects would send the signed request on, and one that ignores the `signal` can outlive the time limit.
- **`applied` says a payment exists, not that it is yours.** For a `confirm` it means: a payment with that `transactionId`, that amount and that currency has been confirmed. Which order that payment belongs to is something only your own records know, so take the `transactionId` from the order you stored it on, and compare `body.info.orderId` of the result with the order ID you sent to `request`.
- **Log it.** Write `meta.recovered` to your logs. It is part of the audit trail.

::: warning "Trying again is safe" needs to be verified in the sandbox
Retrying confirm, capture or void after `not-applied` (and after a second look, minutes later, found nothing too) depends on LINE Pay refusing a second call for the same transaction with a duplicate code (one of `category: 'duplicate'`). `payPreapproved` depends on the `orderId`: a retry **must use the same `orderId`**, because a new one is a new payment and, if the first call succeeds late, charges twice. That is the behaviour of V3 and it has not been verified for V4 yet. Before going live, confirm the same `transactionId` twice in the sandbox and check that the second call is refused instead of charging again.
:::

## Recommended approach

Make "in progress" an explicit state of your order state machine:

| Transition                                | Condition                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `created` → `awaiting-approval`           | `request` succeeded; store the `transactionId`.                                                                                                                                                                                                                                                                     |
| `awaiting-approval` → `awaiting-approval` | The user cancelled at LINE Pay, or closed the page, and pays again: `request` once more (with a new order ID) and store the new `transactionId`, with a conditional update on the `transactionId` you read, so that of two clicks only one reservation is kept. The old reservation is never confirmed and expires. |
| `awaiting-approval` → `confirming`        | The user is back at the `confirmUrl`. **Claim** with a conditional update; save the `ReconcileContext` and a random `claimId` in the same step.                                                                                                                                                                     |
| `confirming` → `paid`                     | `confirm` succeeded, or reconcile said `applied`. The payment is the fact: the order becomes `paid` whatever state it is in (`confirming`, `awaiting-approval`, `needs-attention`).                                                                                                                                 |
| `confirming` → `awaiting-approval`        | Provably did not take effect: rejected, not sent, or reconcile said `not-applied` on a **second look, minutes later**. Only the holder of this claim may give it back.                                                                                                                                              |
| `confirming` → (stays)                    | Reconcile said `indeterminate`, or `not-applied` for the **first** time. A background job looks again later.                                                                                                                                                                                                        |
| `confirming` → `needs-attention`          | Still unclear after a long time. A person checks the Merchant Center.                                                                                                                                                                                                                                               |

Claim with a conditional update (`UPDATE … WHERE status = 'awaiting-approval'`) so that of two requests arriving together only one can send `confirm`.
