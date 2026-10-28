# FAQ

## Why was the customer charged when `confirm` timed out?

Because a timeout only means you did not wait for a response; it does not mean the request was not processed. See [Unknown outcomes and reconcile](./unknown-outcome).

## May I simply retry `refund`?

No. A refund is not idempotent, and sending it again may refund twice. [Reconcile](./unknown-outcome#refunds-need-extra-care) first, or check the Merchant Center.

## Why is `transactionId` a string?

LINE Pay transaction IDs have 19 digits, more than JavaScript numbers can represent exactly (2^53 ≈ 9.007 × 10^15). A plain `JSON.parse` silently turns `2021121300698360310` into `2021121300698360300`. This library turns every integer outside the safe range into a string while parsing, so the IDs in a response are always right; the IDs you pass in must be strings too. The same goes for your database: use a text column, not `BIGINT` (see [Two identifiers](./payment-flow#two-identifiers)).

## Why is a failed call HTTP 200?

That is how LINE Pay is designed: the HTTP layer only says "the request was processed", and the result is in `returnCode`. The library already decides that for you, and throws a `LinePayApiError` when `returnCode` says it failed.

## `request` timed out. May I call it again?

`request` only reserves a payment and moves no money; the user has not received a payment URL, so nobody was charged. To start again, read the official documentation on how a repeated `orderId` is handled, and use a new `orderId` if needed.

## Why does `env: 'development'` no longer work?

It was renamed to `'sandbox'`, the term LINE Pay uses. Passing `'development'` gives an error message that names the new value.

## Is V3 still supported?

No. 1.0 supports V4 only. For V3, stay on 0.9.x.

## Which currencies are supported?

The types list `TWD`, `USD` and `THB` for now. LINE Pay Japan ended its service in 2025, so `JPY` was removed. The official documentation is the reference.

## Can I use it on Cloudflare Workers, Deno or Bun?

The library only uses `fetch`, Web Crypto and `AbortSignal`, and no `node:` module, so in theory yes. The CI runs the tests on Node.js 22, 24 and 26 only, and nothing has been run on Workers, Deno or Bun.

One thing to check there: every request is sent with `redirect: 'error'`, so that the signed request is never passed on to another host. The documentation of Cloudflare lists that value, but at least one project reports that Workers does not accept it. A runtime that throws for it makes every call fail before it is sent, and as an error that counts as `unknown`, which is the safe side, though of no use. In that case pass a `fetch` that sends `redirect: 'manual'` and throws on a 3xx answer itself, so that the guarantee stays:

```ts
const noRedirects: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    throw new TypeError('LINE Pay answered with a redirect')
  }
  return response
}
```

## Does it support CommonJS?

Yes. It ships both ESM and CommonJS.

## May I use only the signing and send the requests myself?

The signing is not a separate public API. If you need full control over the transport, pass your own `fetch` (see [Configuration](./configuration)); the library still signs.

## How do I report a problem?

On [GitHub Issues](https://github.com/enylin/line-pay-merchant/issues). Please include the library version, the Node.js version and the error **without any key** (`JSON.stringify(error)` prints a safe whitelist).
