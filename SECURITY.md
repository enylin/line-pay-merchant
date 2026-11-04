# Security policy

## Reporting a vulnerability

Please do **not** open a public issue for a security problem, and never post a channel secret key or a signature in an issue.

Report it privately with [GitHub's private vulnerability reporting](https://github.com/enylin/line-pay-merchant/security/advisories/new). Include the version of the library, the version of Node.js, and the steps to reproduce.

If that page does not offer a way to report (the feature is off for the repository), open an issue that says **only** that you have a security report, with no details and no keys, and ask for a private channel.

## Supported versions

| Version | Supported                                                                                                    |
| ------- | ------------------------------------------------------------------------------------------------------------ |
| 1.x     | yes, from the first stable release (the alphas are for testing)                                              |
| 0.9.x   | no fixes once 1.0 is released. It is the only version for LINE Pay V3 and stays on npm for those who need it |

0.9.x has a known flaw that will not be fixed there: the transaction ID is put into the request path as it is, so a value from a URL such as `../` can rewrite the signed path (the [migration guide](https://enylin.github.io/line-pay-merchant/en/migration/from-0.9) describes it). If you stay on 0.9, check that a `transactionId` is nothing but digits before you pass it on.

## Verifying a release

A release is published by the workflow `release.yaml` of `enylin/line-pay-merchant`, with npm trusted publishing, so no npm token exists and every version carries a provenance statement that names the repository, the workflow and the commit. After `npm install`, `npm audit signatures` checks the signatures and the provenance of what was installed. The package has no dependencies.

## What the library protects against

The protections of the library are described in the [security guide](https://enylin.github.io/line-pay-merchant/en/guide/security). The rest of a payment integration (where the amount comes from, how the confirm URL is made safe to call twice, what is done when the outcome is unknown) is the responsibility of the application.

## What the library assumes

- `Object.prototype` has not been polluted by another part of the application. The configuration is read from the object itself, which covers the most dangerous case (a polluted `baseUrl`), but the library is not a defence against prototype pollution.
- The `fetch` it is given sends one request per call. A `fetch` that retries on its own, or an undici retry agent that retries POST, voids the "provably not sent" rule.
- The `fetch` it is given honours `redirect: 'error'` and `signal`. One that follows redirects would send the signed request, with its signature header, on to another host; one that ignores `signal` can outlive the time limit of a call.
- The clock of the server is right (NTP). Reconcile of refunds and pre-approved payments compares times with LINE Pay's.
- The channel secret key is kept out of version control and out of the browser. Credentials that were published in the 0.9 documentation (a sandbox channel) should be considered public.
