import express, {
  type NextFunction,
  type Request,
  type Response
} from 'express'
import { isLinePayValidationError } from 'line-pay-merchant'

import type { PaymentService } from './payment-service'

// #region routes
// What this leaves out, and a shop needs: signing the user in and checking that the
// order is theirs, CSRF protection on the POST, and who may refund (see the security
// guide). It shows the part that is about LINE Pay.
export function createApp(payments: PaymentService) {
  const app = express()

  // The user pays an order: reserve it at LINE Pay and send them there.
  app.post('/orders/:id/pay', async (req, res) => {
    const paymentUrl = await payments.startCheckout(req.params.id)
    res.redirect(303, paymentUrl)
  })

  // LINE Pay sends the user back here with ?transactionId=...&orderId=...
  app.get('/line-pay/confirm', async (req, res) => {
    const result = await payments.confirmPayment(req.query)

    switch (result.kind) {
      case 'paid':
        res.redirect(303, `/orders/${encodeURIComponent(result.order.id)}`)
        break
      case 'in-progress':
        res.status(202).send('We are confirming your payment. Please wait.')
        break
      case 'declined':
      case 'retry':
        res.redirect(
          303,
          `/orders/${encodeURIComponent(result.order.id)}?payment=failed`
        )
        break
      case 'unknown-order':
        res.sendStatus(404)
        break
    }
  })

  app.get('/line-pay/cancel', (_req, res) => {
    res.redirect(303, '/cart')
  })

  // Express 5 passes the rejections of async handlers here.
  app.use(
    (error: unknown, _req: Request, res: Response, _next: NextFunction) => {
      if (isLinePayValidationError(error)) {
        res.status(400).send('Bad request')
        return
      }
      console.error(error)
      res.status(500).send('Something went wrong')
    }
  )

  return app
}
// #endregion routes
