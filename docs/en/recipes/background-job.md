# Background reconcile

An [unknown outcome](../guide/unknown-outcome) does not always happen while the user is still waiting. The response may be lost after the process was killed, and the user may have left the page long ago. So you need a background job that brings the orders that are "in progress" to a definite state.

## How

<<< @/../examples/payment-service.ts#sweep{ts}

`settlePending` finds the orders that have been in `confirming` for longer than `olderThanMs`, and reconciles them with the `pendingConfirm` (a `ReconcileContext`) saved earlier:

| Reconcile result | Next step of the order                                                                                                                                                                                                                        |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applied`        | → `paid` (whatever state the order is in: the payment is the fact).                                                                                                                                                                           |
| `not-applied`    | → `awaiting-approval`: this is the **second** look (the first was taken while the request was handled, and that one does not let go), and minutes later there is still nothing. If the user returns to the `confirmUrl` they can start again. |
| `indeterminate`  | Stays in `confirming` and is looked at again in the next round. Still unclear after `giveUpAfterMs` → `needs-attention`.                                                                                                                      |

One order that cannot be settled (say the database is briefly unreachable) does **not** hold up the others. `settlePending` goes through every order, and only then throws all the failures together as one `AggregateError`, so that the scheduler sees the error and can alert; the orders that were not settled come up again in the next round.

## How to run it

- On a long-running server, `setInterval` is enough (see [Express](./express)). Better is a separate worker or scheduler (cron, a queue) that is not tied to the process that serves HTTP.
- In a serverless environment, use the scheduler of the platform (see [Web-standard handler](./web-handler)).
- Run one at a time in a process (the example waits for the previous run), and several processes may run at the same time: every transition is a conditional update, so only one wins for an order, and the loser does nothing.

## Choosing the thresholds

- `olderThanMs`: longer than a request can take over `confirm` and the lookups after it. With the default time limits that is at most 40 seconds for `confirm`, then up to 3 × 60 seconds for the payment details, about 3.7 minutes in all, so **5 minutes** is recommended. Too short and the sweep competes with a request that is still going. With the `claimId` and `markPaid` nothing goes wrong when it does, but work is wasted, and the user may be told to "try again" for nothing.
- `giveUpAfterMs`: payment details sometimes appear late. Give them enough time, for example an hour, before handing over to a person.

## A success that comes late

`not-applied` says "the payment details do not show it **now**". The recipe guards against letting go on a missing payment in two ways: the request does **not** release the order when it sees `not-applied`, and the sweep takes a second look minutes later; and `markPaid` makes the order `paid` wherever it has been given back to, as soon as the payment details show the payment.

What is left is a payment that LINE Pay completes long after both looks found nothing, with the user never coming back. Only the transaction report of the Merchant Center shows that, so comparing the orders with the report **every day** is the last line of defence, and no library can do it for you.

## Someone has to look at needs-attention

This state means "the system cannot tell", not "failed". Please:

1. alert on this state (logs, notification or dashboard);
2. look the transaction up in the LINE Pay Merchant Center;
3. set the order to `paid` or `awaiting-approval` by hand, according to what you find.

## Refunds too

A refund **must not** be re-sent, which makes the saved record even more important:

<<< @/../examples/reconcile.ts#refund-record{ts}

The background job calls `linePay.reconcile(context)` on such a record:

- `applied`: exactly one matching refund was found; record it.
- `indeterminate`: **never re-send because of it.** Check the Merchant Center. For a refund, `reconcile` never answers `not-applied` from the payment details alone (see the [limits](../guide/unknown-outcome#refunds-need-extra-care)).

## Reading the context back from the database

A `ReconcileContext` can be stored as JSON. When you read it back, `startedAt` is a string, and `reconcile` takes it as it is (an ISO 8601 string with a time zone, or milliseconds since the epoch); there is no need to turn it into a `Date`:

```ts
await linePay.reconcile(saved)
```

When `startedAt` is missing or cannot be trusted (for example a string without a time zone), `reconcile` answers `indeterminate` and says why, instead of guessing.
