# Recipes

These pages show a **complete** payment flow instead of loose snippets: reserve the payment, confirm it when the user comes back, reconcile when the outcome is unknown, and finish in a background job.

All recipes share one framework-independent core: [`examples/payment-service.ts`](https://github.com/enylin/line-pay-merchant/blob/main/examples/payment-service.ts). It depends only on the library and a very small `OrderStore` interface, so whether you use Express, Next.js, NestJS or something else, only the layer that turns results into HTTP responses changes. The core [has tests](../guide/testing) and is type-checked in CI; the Express and Web-standard handler examples are only type-checked, with no tests of their own; the code on the NestJS and Next.js pages is a sketch and is not checked.

## The states of an order

The payment flow is a state machine. Making "in progress" an explicit state is what lets it converge when the outcome is unknown:

| State               | Meaning                                                                   |
| ------------------- | ------------------------------------------------------------------------- |
| `created`           | The order exists and has not been sent to LINE Pay.                       |
| `awaiting-approval` | `request` was made; the user is approving in LINE Pay.                    |
| `confirming`        | `confirm` was sent and there is no answer yet (or the answer is unknown). |
| `paid`              | Paid.                                                                     |
| `needs-attention`   | Unclear for a long time; a person has to check the Merchant Center.       |

`OrderStore` needs one special method: `transition(id, when, to, patch)`. It must be an **atomic conditional update** (in SQL: `UPDATE … WHERE status = ANY($status) AND ($claimId IS NULL OR claim_id = $claimId)`). That is what lets only one of two simultaneous requests go on to `confirm`; the `claimId` is what stops a slow request from giving back the newer claim of another.

<<< @/../examples/shared/orders.ts{ts}

## What the core does

<<< @/../examples/payment-service.ts#start{ts}

<<< @/../examples/payment-service.ts#confirm{ts}

<<< @/../examples/payment-service.ts#failure{ts}

The points to note:

1. **Write it down, then send it.** The claim stores a `ReconcileContext` in the same step, so even if the process is killed before the answer arrives, there is something to reconcile from later.
2. **The amount comes from the order** (`claimed.total`), not from the URL.
3. **A failure takes one of three paths**: unknown outcome (even a reconcile that says `not-applied`) → the order stays `confirming`, and the background job looks once more later; provably did not take effect (never sent, refused) → give the order back to the user, and only the holder of the claim (`claimId`) may; not an error of this library → rethrow.
4. **The payment is the fact, but it has to be this order's.** `markPaid` makes the order `paid` whether it is `confirming`, `awaiting-approval` or `needs-attention`: the background job may already have given it back while the request was still looking. Before it does, it compares the `orderId` that LINE Pay reports with the `linePayOrderId` stored at `request`, and hands a mismatch to a person. Fulfilment (`onPaid`) runs once, in the process that made the order `paid`.
5. **The database write after a success is outside the `try`.** If it fails, the order stays `confirming`, and the background job discovers from the payment details that it was paid.
6. **Every `request` gets a new `orderId`.** After a timeout LINE Pay may have kept the ID, and asking again with the same one is refused as a duplicate (1172), so the order could never be paid. The other request of a double click is not sent to pay a transaction nobody recorded either. (That holds for `request` only: for `payPreapproved` it is the opposite, a retry must use the **same** `orderId`, because a new one is a new payment.)

## Pick your framework

- [Express](./express)
- [Web-standard handler](./web-handler): Next.js, Cloudflare Workers, Bun, Deno, Hono
- [NestJS](./nestjs)
- [Background reconcile](./background-job): the other half, and refunds
