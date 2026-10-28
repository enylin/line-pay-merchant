# line-pay-merchant

[![npm](https://img.shields.io/npm/v/line-pay-merchant)](https://www.npmjs.com/package/line-pay-merchant)
[![ci](https://img.shields.io/github/actions/workflow/status/enylin/line-pay-merchant/ci.yaml?branch=main&label=ci)](https://github.com/enylin/line-pay-merchant/actions/workflows/ci.yaml)
[![codecov](https://codecov.io/gh/enylin/line-pay-merchant/branch/main/graph/badge.svg)](https://codecov.io/gh/enylin/line-pay-merchant)
[![node](https://img.shields.io/node/v/line-pay-merchant)](https://nodejs.org)
[![license](https://img.shields.io/npm/l/line-pay-merchant)](./LICENSE)

[English](./README.md) · **繁體中文** · [文件](https://enylin.github.io/line-pay-merchant/)

**LINE Pay Online API V4** 的 Node.js 函式庫。零 runtime 依賴、完整型別，並且圍繞一個事實設計：付款結果不確定的時候，它如實標成「未知」，並提供查證的方法，而不是當成失敗。

> **非官方。**這是獨立的函式庫，不是 LINE Pay 製作、背書或支援的。「LINE」與「LINE Pay」是各自所有人的商標。

> **1.0 目前是 alpha。** 撰寫時無法取得 V4 的官方參考文件。路徑與欄位依據 LINE Pay 的 V3 API，以及獨立的 V4 用戶端與 0.9 時代文件互相印證的部分整理，全部都還沒有對 V4 沙盒實測；待確認的項目都標在原始碼的 `TODO(v4-spec)`。正式上線前，請在沙盒走過完整流程，包括對同一筆交易連續 confirm 兩次。還在用 V3？請留在 [0.9.x](https://www.npmjs.com/package/line-pay-merchant/v/0.9.0)：`npm install line-pay-merchant@0.9`。

## 為什麼用它

- **「逾時」不等於「失敗」。** `confirm` 逾時的當下，錢可能已經扣了。每個錯誤都帶著 `outcome`（`not-sent`、`unknown` 或 `rejected`），`client.reconcile()` 會查付款明細，回答 `applied`、`not-applied` 或 `indeterminate`，並附上依據。結果未知時，會動到錢的請求絕不重送。
- **零 runtime 依賴。** 只用內建的 `fetch` 與 Web Crypto。同時提供 ESM 與 CommonJS，需要 Node.js 22 以上。
- **謹慎的預設值。** 路徑參數一律驗證、不跟隨轉址、19 位數的交易編號不失真，錯誤物件不帶出金鑰或簽章。
- **完整型別，可組合的 middleware。** 重試、對帳、記錄都是 middleware。

## 安裝

```sh
npm install line-pay-merchant
```

## 使用

```ts
import { createLinePayClient, parseConfirmQuery } from 'line-pay-merchant'

const linePay = createLinePayClient({
  channelId: process.env.LINE_PAY_CHANNEL_ID ?? '',
  channelSecretKey: process.env.LINE_PAY_CHANNEL_SECRET ?? '',
  env: 'sandbox' // 正式付款用 'production'
})

// 1. 預留付款，再把用戶導向 body.info.paymentUrl.web
const { body } = await linePay.request({
  amount: 1000,
  currency: 'TWD',
  orderId: 'order-20261027-001',
  packages: [
    {
      id: 'package-1',
      amount: 1000,
      products: [{ name: 'Tea', quantity: 2, price: 500 }]
    }
  ],
  redirectUrls: {
    confirmUrl: 'https://shop.example/line-pay/confirm',
    cancelUrl: 'https://shop.example/line-pay/cancel'
  }
})

// 2. 用戶回到你的 confirmUrl：完成扣款。
//    金額是你訂單上的金額，絕不能來自網址。
const { transactionId } = parseConfirmQuery(req.query)
await linePay.confirm({ transactionId, amount: 1000, currency: 'TWD' })
```

### 結果未知的時候

```ts
import { needsReconcile } from 'line-pay-merchant'

try {
  await linePay.confirm({ transactionId, amount, currency: 'TWD' })
} catch (error) {
  if (!needsReconcile(error)) throw error

  // 逾時或斷線：付款可能已經成功。
  const result = await linePay.reconcile(error)
  if (result.status === 'applied') {
    // 依付款明細推論出來的，不是 LINE Pay 回的
  }
  // 'not-applied'：付款明細「現在」沒有這筆。不要憑一次查詢就決定：訂單先維持原狀，
  // 幾分鐘後再查一次（見範例）。到那時才適合再試一次，而它建立在 LINE Pay 會以重複
  // 拒絕第二次 confirm 之上，這一點要在 V4 沙盒驗證。
  // 'indeterminate'：不要猜，稍後再查。
}
```

也可以讓 client 代勞：`linePay.with(autoReconcile())`。包含訂單狀態機與背景工作的完整流程，在[範例](https://enylin.github.io/line-pay-merchant/recipes/)。

## 文件

- [快速開始](https://enylin.github.io/line-pay-merchant/guide/getting-started)
- [結果未知與對帳](https://enylin.github.io/line-pay-merchant/guide/unknown-outcome)
- [範例](https://enylin.github.io/line-pay-merchant/recipes/)：Express、Next.js 與其他 Web 標準環境、NestJS、背景工作
- [從 0.9 升級](https://enylin.github.io/line-pay-merchant/migration/from-0.9)
- [API 參考](https://enylin.github.io/line-pay-merchant/api/)

各欄位的意義請看 LINE Pay 的[官方文件](https://developers-pay.line.me/)。

## 參與開發

```sh
npm ci
npm run verify   # 型別、lint、含覆蓋率的測試、建置、套件檢查
npm run docs:dev # 文件站
```

Commit 遵循 [Conventional Commits](https://www.conventionalcommits.org/)。回報安全問題請見 [SECURITY.md](./SECURITY.md)。

**不使用型別斷言。**整個專案（函式庫、測試、範例）沒有 `x as T`、`<T>x` 與 `x!`（唯一的 `as` 是 `as const`），ESLint 會讓建置失敗。來自網路的資料靠檢查過它的型別守衛（`src/core/guard.ts`）取得型別；可能不存在的值就明確檢查；測試需要型別不允許的輸入時，用 `// @ts-expect-error`，或透過 `src/test/helpers.ts` 的 `untyped()`、`applyUntyped()` 傳入。原則是：絕不告訴編譯器一件沒有人檢查過的事。

**不使用 `any`。**函式庫、測試、範例與文件裡都沒有 `any`，發佈出去的型別宣告裡也沒有。ESLint 禁止這個關鍵字，也禁止不安全地使用函式庫給的 `any`（`JSON.parse`、`Array.isArray`；所以 `src/core/guard.ts` 有 `isArray`）；`npm run check:any` 則向編譯器問每個有名字的宣告是什麼型別，所以連「只是被推斷成」`any` 的（`ReadableStream<any>`、`any[]`）也會失敗。唯一不受第二項檢查的檔案是 `examples/express.ts`，因為 Express 的 handler 型別本身就寫了 `any`。

## 授權

[MIT](./LICENSE) © 2021-present Sean Lin
