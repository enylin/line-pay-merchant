import { isLinePayValidationError } from 'line-pay-merchant'

import type { PaymentService } from './payment-service'

// #region handler
/**
 * The confirmUrl handler written against the Web `Request` and `Response`, so it
 * runs as a Next.js route handler, a Cloudflare Worker, in Bun, Deno or Hono.
 */
export function createConfirmHandler(
  payments: PaymentService,
  siteUrl: string
) {
  return async function GET(request: Request): Promise<Response> {
    const { searchParams } = new URL(request.url)

    try {
      const result = await payments.confirmPayment(searchParams)

      switch (result.kind) {
        case 'paid':
          return Response.redirect(
            `${siteUrl}/orders/${encodeURIComponent(result.order.id)}`,
            303
          )
        case 'in-progress':
          return new Response('We are confirming your payment. Please wait.', {
            status: 202
          })
        case 'declined':
        case 'retry':
          return Response.redirect(
            `${siteUrl}/orders/${encodeURIComponent(result.order.id)}?payment=failed`,
            303
          )
        case 'unknown-order':
          return new Response('Not found', { status: 404 })
      }
    } catch (error) {
      if (isLinePayValidationError(error)) {
        return new Response('Bad request', { status: 400 })
      }
      throw error
    }
  }
}
// #endregion handler
