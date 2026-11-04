# Web 標準 Handler

Next.js 的 Route Handler、Cloudflare Workers、Bun、Deno、Hono 都使用 Web 標準的 `Request` 與 `Response`。把 `confirmUrl` 的處理寫成這種形狀，就能在它們之間通用：

<<< @/../examples/web-handler.ts#handler{ts}

`parseConfirmQuery` 直接接受 `URLSearchParams`，所以不需要自己拆字串。

## Next.js（App Router）

```ts
// app/line-pay/confirm/route.ts
import { createConfirmHandler } from '@/lib/payments'

const siteUrl = process.env.SITE_URL
if (siteUrl === undefined) throw new Error('SITE_URL is not set')

export const GET = createConfirmHandler(payments, siteUrl)
```

`payments` 是你在 `lib/payments.ts` 用 `createPaymentService` 組出來的。Server Actions 或另一個 Route Handler 負責 `startCheckout`，回傳的網址再導向。

::: warning 無伺服器環境沒有常駐的背景工作
Vercel 等平台上沒有長時間執行的行程，`setInterval` 不可靠。請用平台的排程功能（例如 Vercel Cron）定時呼叫一個受保護的路由，由它執行 `payments.settlePending(...)`。**訂單必須存在資料庫，不能放記憶體。**
:::

## Cloudflare Workers

```ts
export default {
  async fetch(request: Request): Promise<Response> {
    const { pathname } = new URL(request.url)
    if (pathname === '/line-pay/confirm') return confirm(request)
    return new Response('Not found', { status: 404 })
  },
  // 背景工作用 Cron Trigger
  async scheduled() {
    await payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })
  }
}
```

函式庫只用 `fetch`、Web Crypto 與 `AbortSignal`，沒有 `node:` 模組。這個環境目前沒有納入測試，請在部署前於沙盒驗證；尤其是 `redirect: 'error'` 是否被接受，見[常見問題](../guide/faq)。

## AWS Lambda

Lambda 的事件格式不是 `Request`。用 Function URL 或 API Gateway 時，把事件轉成 `URLSearchParams` 再呼叫 `payments.confirmPayment(new URLSearchParams(event.rawQueryString))`，其餘相同。
