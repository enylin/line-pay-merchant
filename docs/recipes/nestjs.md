# NestJS

先讀[範例總覽](./)。這一頁示範怎麼把同一個核心放進 NestJS 的模組、控制器與排程。

::: info 這一頁的程式碼是示意
為了文件而在專案裡安裝 NestJS 太重，所以這裡的程式碼**沒有**納入 CI 的型別檢查。核心（`createPaymentService`）本身有檢查與測試，下面只是把它接上 NestJS。
:::

## Client 與服務

用一個 provider 建立 client，再用一個 provider 組出 `PaymentService`。`OrderStore` 換成你的資料存取層（TypeORM、Prisma 等），記得 `transition` 要是條件更新，而且交易編號與訂單編號的欄位用文字型別（見[兩個編號](../guide/payment-flow#兩個編號)）。

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
          // 只能是 'sandbox' 或 'production'：client 在啟動時拒絕其他值，
          // 打錯字不會變成「正式環境連到沙盒」。
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

## 控制器

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

  // 商店需要的要自己補在這裡：確認用戶已登入、訂單是他的 guard，以及 CSRF 防護
  // （見安全性指南）。
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

## 錯誤對應

`parseConfirmQuery` 丟出的 `LinePayValidationError` 應該是 400，不是 500。用一個例外過濾器：

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

`@Catch` 內部用 `instanceof`。在同一個套件只被載入一次的 NestJS 專案裡這沒有問題；若你的相依套件鏈可能同時載入 ESM 與 CommonJS 兩份，改在過濾器裡用 `isLinePayValidationError`。

## 背景工作

用 `@nestjs/schedule`：

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

多個實例同時執行也沒問題，見[背景對帳](./background-job)。
