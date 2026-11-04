# Web-standard handler

Next.js route handlers, Cloudflare Workers, Bun, Deno and Hono all use the standard Web `Request` and `Response`. Write the `confirmUrl` handler in that shape and it works across them:

<<< @/../examples/web-handler.ts#handler{ts}

`parseConfirmQuery` accepts `URLSearchParams` directly, so there is no string splitting to do.

## Next.js (App Router)

```ts
// app/line-pay/confirm/route.ts
import { createConfirmHandler } from '@/lib/payments'

const siteUrl = process.env.SITE_URL
if (siteUrl === undefined) throw new Error('SITE_URL is not set')

export const GET = createConfirmHandler(payments, siteUrl)
```

`payments` is what you build with `createPaymentService` in `lib/payments.ts`. A Server Action or another route handler does `startCheckout` and redirects to the URL it returns.

::: warning Serverless has no long-running background job
Platforms such as Vercel have no long-running process, so `setInterval` is not reliable. Use the scheduler of the platform (for example Vercel Cron) to call a protected route on a schedule that runs `payments.settlePending(...)`. **Orders must live in a database, not in memory.**
:::

## Cloudflare Workers

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/line-pay/confirm') return confirm(request)
    return new Response('Not found', { status: 404 })
  },
  // the background job runs as a Cron Trigger
  async scheduled() {
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })
  }
}
```

The library only uses `fetch`, Web Crypto and `AbortSignal`, and no `node:` module. This environment is not part of the tests, so verify in the sandbox before you deploy; above all whether `redirect: 'error'` is accepted, see the [FAQ](../guide/faq).

## AWS Lambda

The event of Lambda is not a `Request`. With a Function URL or API Gateway, turn the event into `URLSearchParams` and call `payments.confirmPayment(new URLSearchParams(event.rawQueryString))`; the rest is the same.
