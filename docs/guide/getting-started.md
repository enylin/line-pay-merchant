# 快速開始

這一頁帶你跑通第一筆**沙盒**付款：預留付款、讓用戶核准、確認。完整的、能直接上線改的版本在[範例](/recipes/)。

## 1. 取得沙盒憑證

開發與測試請用 LINE Pay 的沙盒，不要拿正式金鑰來試。

1. 到[官方沙盒頁面](https://developers-pay.line.me/sandbox)申請沙盒帳號。
2. 登入商家後台（Merchant Center）後，在「管理連動 Key」頁面找到 **Channel ID** 與 **Channel Secret Key**。

把它們放進環境變數，不要寫進程式碼，更不要提交到 Git：

```sh
export LINE_PAY_CHANNEL_ID=...
export LINE_PAY_CHANNEL_SECRET=...
```

## 2. 安裝

::: code-group

```sh [npm]
npm install line-pay-merchant
```

```sh [pnpm]
pnpm add line-pay-merchant
```

```sh [yarn]
yarn add line-pay-merchant
```

:::

需要 Node.js 22 以上。型別已經內含，不需要另外安裝 `@types`。

## 3. 建立 client

<<< @/../examples/getting-started.ts#client{ts}

- 建立 client 不會連線，也沒有全域狀態；一個行程建一個就夠，可以安全地共用。
- `env` 是 `'sandbox'` 或 `'production'`。（0.9 的 `'development'` 已更名為 `'sandbox'`。）
- 設定有問題（缺少金鑰、`env` 打錯）會**在建立時**就丟出 `LinePayValidationError`，不會等到第一次付款。

## 4. 預留付款：request

<<< @/../examples/getting-started.ts#request{ts}

- `amount` 必須等於所有 `packages[].amount`（加上手續費與運費）的總和，每個 package 的 `amount` 必須等於 `products` 的 `quantity × price` 總和。函式庫會在送出前檢查，算錯會直接丟 `LinePayValidationError`，不會浪費一次請求。
- `orderId` 是**你的**訂單編號，在你的系統裡必須唯一。
- `body.info.transactionId` 是 **LINE Pay 的**交易編號，之後 confirm、退款、對帳都靠它。它是 19 位數字，在這個函式庫裡永遠是**字串**；存進資料庫也請用文字欄位，不要用 `BIGINT`（見[兩個編號](./payment-flow#兩個編號)）。
- 把用戶導向 `body.info.paymentUrl.web`（網頁）或 `.app`（在手機上開啟 LINE Pay）。

## 5. 用戶核准後：confirm

用戶在 LINE Pay 核准後，LINE Pay 會把他導回你的 `confirmUrl`，並附上 `transactionId` 與 `orderId`：

```
https://shop.example/line-pay/confirm?transactionId=2026102700000000001&orderId=order-20261027-001
```

這時你要呼叫 `confirm` 完成扣款：

<<< @/../examples/getting-started.ts#confirm{ts}

::: danger 金額不能來自網址
`amount` 必須是**你資料庫裡那筆訂單的金額**。網址上的任何東西都是用戶的瀏覽器給的，用戶可以改。同樣地，網址上的 `transactionId` 也要先經過 `parseConfirmQuery()` 檢查，只允許 1 到 19 位數字。完整做法見[安全性](./security)。
:::

## 6. 看懂結果

每個呼叫都回傳 `{ body, meta }`：

| 欄位              | 說明                                                                         |
| ----------------- | ---------------------------------------------------------------------------- |
| `body`            | LINE Pay 的回應，原樣（超過 2^53 的整數會是字串）。                          |
| `meta.operation`  | 操作名稱，例如 `'confirm'`。                                                 |
| `meta.durationMs` | 總耗時，包含重試與等待。                                                     |
| `meta.attempts`   | 實際嘗試次數，包含根本沒連上的那幾次。                                       |
| `meta.httpStatus` | 最後一次回應的 HTTP 狀態碼。                                                 |
| `meta.recovered`  | 只有在 `reconcile` 推論出結果時才有。見[結果未知與對帳](./unknown-outcome)。 |

失敗時丟出的是 `LinePay*Error`，每一個都有 `code`、`outcome`，見[錯誤與結果](./errors)。

## 下一步

- 付款中間會發生什麼事 → [付款流程](./payment-flow)
- `confirm` 逾時怎麼辦 → [結果未知與對帳](./unknown-outcome)
- 一個完整、有訂單狀態機的流程 → [範例](/recipes/)
