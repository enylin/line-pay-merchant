---
layout: home

hero:
  name: line-pay-merchant
  text: A Node.js library for the LINE Pay Online API V4
  tagline: Zero runtime dependencies, fully typed. When the outcome of a payment is unknown, it says so and gives you a way to look it up, instead of calling it a failure.
  actions:
    - theme: brand
      text: Get started
      link: /en/guide/getting-started
    - theme: alt
      text: Unknown outcomes and reconcile
      link: /en/guide/unknown-outcome
    - theme: alt
      text: GitHub
      link: https://github.com/enylin/line-pay-merchant

features:
  - title: A timeout is not a failure
    details: When confirm times out, the customer may already have been charged. Every error carries an outcome that says whether the request left your process, and client.reconcile() looks the payment up and gives you an answer with evidence. It does not re-send a request that moves money after an unknown outcome.
  - title: Zero runtime dependencies
    details: Only the built-in fetch and Web Crypto of Node.js. No axios, no crypto-js, no uuid, so a large part of the supply-chain risk is gone. ESM and CommonJS, Node.js 22 or later.
  - title: Careful defaults
    details: Path parameters are always validated, redirects are never followed, 19-digit transaction IDs are not mangled by JavaScript numbers, and neither errors nor the client leak the secret or signatures into your logs.
  - title: Fully typed, composable middleware
    details: All ten operations have input and response types. Retrying, reconciling and logging are middleware. By default only calls that are provably safe are retried, which means requests that never left and reads whose outcome is unknown; the rest is up to you.
---

## Install

```sh
npm install line-pay-merchant
```

## In a few lines

<<< @/../examples/getting-started.ts#client{ts}

<<< @/../examples/reconcile.ts#basic{ts}

::: warning Pre-release
1.0 is in alpha. The official V4 reference was not available when this was written. The paths and fields follow LINE Pay's V3 API and what independent V4 clients and the 0.9 documentation agree on, and none of it has been run against the V4 sandbox yet; the open points are marked `TODO(v4-spec)` in the source. Before going live, run the whole flow in the sandbox, including a second `confirm` of the same transaction.
:::
