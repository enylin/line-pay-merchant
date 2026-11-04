# NestJS

Read the [recipes overview](./) first. This page shows how to fit the same core into a NestJS module, controller and scheduler.

::: info The code on this page is a sketch
Installing NestJS in this project just for the documentation would be too heavy, so this code is **not** part of the type-check in CI. The core (`createPaymentService`) itself is checked and tested; the code below only connects it to NestJS.
:::

## Client and service

One provider creates the client, and another builds the `PaymentService`. Replace `OrderStore` with your data access layer (TypeORM, Prisma, …), and remember that `transition` must be a conditional update and that the columns of the transaction ID and the order ID are text (see [Two identifiers](../guide/payment-flow#two-identifiers)).

```ts
// line-pay.module.ts
import { Module } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createLinePayClient, type LinePayClient } from 'line-pay-merchant'

import { createPaymentService } from './payment-service'
import { ORDER_STORE, type OrderStore } from './order-store'

export const LINE_PAY = Symbol('LINE_PAY')
export const PAYMENTS = Symbol('PAYMENTS')

@Module({
  providers: [
    {
      provide: LINE_PAY,
      inject: [ConfigService],
      useFactory: (config: ConfigService): LinePayClient =>
        createLinePayClient({
          channelId: config.getOrThrow('LINE_PAY_CHANNEL_ID'),
          channelSecretKey: config.getOrThrow('LINE_PAY_CHANNEL_SECRET'),
          // 'sandbox' or 'production' and nothing else: the client refuses the rest
          // at start-up, so a typo cannot turn into a sandbox in production.
          env: config.getOrThrow<'sandbox' | 'production'>('LINE_PAY_ENV')
        })
    },
    {
      provide: PAYMENTS,
      inject: [LINE_PAY, ORDER_STORE, ConfigService],
      useFactory: (
        linePay: LinePayClient,
        orders: OrderStore,
        config: ConfigService
      ) =>
        createPaymentService({
          linePay,
          orders,
          siteUrl: config.getOrThrow('SITE_URL'),
          channelId: config.getOrThrow('LINE_PAY_CHANNEL_ID')
        })
    }
  ],
  exports: [PAYMENTS]
})
export class LinePayModule {}
```

## Controller

```ts
// payments.controller.ts
import {
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Redirect,
  Res
} from '@nestjs/common'
import type { Response } from 'express'

import { PAYMENTS } from './line-pay.module'
import type { PaymentService } from './payment-service'

@Controller()
export class PaymentsController {
  constructor(@Inject(PAYMENTS) private readonly payments: PaymentService) {}

  // Add what a shop needs here: a guard that signs the user in and checks that the
  // order is theirs, and CSRF protection (see the security guide).
  @Post('orders/:id/pay')
  @Redirect(undefined, 303)
  async pay(@Param('id') id: string) {
    return { url: await this.payments.startCheckout(id) }
  }

  @Get('line-pay/confirm')
  async confirm(@Query() query: Record<string, unknown>, @Res() res: Response) {
    const result = await this.payments.confirmPayment(query)

    switch (result.kind) {
      case 'paid':
        return res.redirect(
          303,
          `/orders/${encodeURIComponent(result.order.id)}`
        )
      case 'in-progress':
        return res
          .status(202)
          .send('We are confirming your payment. Please wait.')
      case 'declined':
      case 'retry':
        return res.redirect(
          303,
          `/orders/${encodeURIComponent(result.order.id)}?payment=failed`
        )
      case 'unknown-order':
        return res.sendStatus(404)
    }
  }
}
```

## Mapping errors

The `LinePayValidationError` thrown by `parseConfirmQuery` should be a 400, not a 500. Use an exception filter:

```ts
import { type ArgumentsHost, Catch, type ExceptionFilter } from '@nestjs/common'
import { LinePayValidationError } from 'line-pay-merchant'

@Catch(LinePayValidationError)
export class LinePayValidationFilter implements ExceptionFilter {
  catch(_error: LinePayValidationError, host: ArgumentsHost) {
    host.switchToHttp().getResponse().status(400).send('Bad request')
  }
}
```

`@Catch` uses `instanceof` internally. That is fine in a NestJS project where the package is loaded once; if your dependency chain may load both the ESM and the CommonJS copy, check with `isLinePayValidationError` inside the filter instead.

## Background job

With `@nestjs/schedule`:

```ts
import { Inject, Injectable } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'

@Injectable()
export class SettleJob {
  constructor(@Inject(PAYMENTS) private readonly payments: PaymentService) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async run() {
    await this.payments.settlePending({
      olderThanMs: 5 * 60_000,
      giveUpAfterMs: 60 * 60_000
    })
  }
}
```

Running several instances at the same time is fine; see [Background reconcile](./background-job).
