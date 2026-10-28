# 付款流程

## 一般付款

```
  用戶的瀏覽器            你的伺服器                  LINE Pay
       │  結帳                │                          │
       │ ───────────────────► │  request                 │
       │                      │ ───────────────────────► │
       │                      │ ◄─────── paymentUrl ──── │
       │ ◄── 導向 paymentUrl ─│                          │
       │  在 LINE Pay 核准 ──────────────────────────────►│
       │ ◄── 導向 confirmUrl?transactionId=… ─────────────│
       │ ───────────────────► │  confirm                 │
       │                      │ ───────────────────────► │
       │                      │ ◄───────── 付款完成 ──── │
       │ ◄── 結果頁 ───────── │                          │
```

| 步驟 | 呼叫                | 誰發起     | 注意                                                    |
| ---- | ------------------- | ---------- | ------------------------------------------------------- |
| 1    | `request`           | 你的伺服器 | 只是預留，還沒扣款。把 `transactionId` 和訂單存在一起。 |
| 2    | （用戶在 LINE Pay） | 用戶       | 用戶可能核准、取消，或乾脆關掉頁面。                    |
| 3    | `confirm`           | 你的伺服器 | 真正扣款。會動到錢，結果未知時要**對帳**，不能重送。    |
| 4    | `paymentDetails`    | 你的伺服器 | 隨時可查；對帳也是靠它。                                |
| 5    | `refund`            | 你的伺服器 | 退款**不是冪等的**。結果未知時絕不能重送。              |

如果不想靠 `confirmUrl` 的導向，也可以用 `checkPaymentStatus` 輪詢用戶有沒有核准。結果放在 `returnCode`，而且**這裡的 `0000` 不是成功**：

| `returnCode` | 意思                                  |
| ------------ | ------------------------------------- |
| `0000`       | 用戶**還沒**核准。                    |
| `0110`       | 用戶核准了，可以呼叫 `confirm`。      |
| `0121`       | 用戶取消，或逾時（20 分鐘）。已終結。 |
| `0122`       | 付款失敗。已終結。                    |
| `0123`       | 付款完成。已終結。                    |

這是 V3 的語意，V4 尚待沙盒驗證。輪詢只用來決定**何時去 `confirm`**；把訂單標成已付款，要以 `confirm` 的結果（或[對帳](./unknown-outcome)）為準，不要只憑 `0000` 或輪詢的結果。

## 兩個編號

|          | `orderId`           | `transactionId`                        |
| -------- | ------------------- | -------------------------------------- |
| 誰產生   | 你                  | LINE Pay（`request` 的回應）           |
| 用途     | 對應你的訂單        | `confirm`、`refund`、`capture`、`void` |
| 形式     | 字串，最長 100 字元 | 最多 19 位數字，**一律當字串**         |
| 在網址上 | 有                  | 有                                     |

兩者都會出現在 `confirmUrl` 的查詢字串裡，而查詢字串是用戶的瀏覽器給你的。用 [`parseConfirmQuery()`](/api/functions/parseConfirmQuery) 解析，再用你資料庫裡的訂單去核對。

**存進資料庫時，兩個編號都用文字欄位**（`TEXT` 或 `VARCHAR`），不要用 `BIGINT` 或其他數字型別，也不要先 `Number()`、`parseInt()` 再存：

- `transactionId` 有 19 位數字，超過 JavaScript 能精確表示的整數（2^53）。`BIGINT` 本身存得下，但讀回來時，只要驅動程式或 ORM 把它變成 `number`（例如 `mysql2` 的預設設定），末幾位就會悄悄變成別的數字，而且不會有任何錯誤。變了的編號仍是 19 位數字，會通過函式庫的檢查，`refund` 就會對著另一筆交易（或不存在的交易）送出。
- `orderId` 是你自己給的文字，可能有前導零（`0012`）或英文字母；轉成數字就不是同一個編號了。
- 把[對帳用的 context](./unknown-outcome) 存成 JSON 是安全的，裡面的編號本來就是字串。比較編號時也用字串比較（`===`）。

## 不使用 Redirect URL 的付款

設定 `redirectUrls: { confirmUrlType: 'NONE' }` 可以省略 `confirmUrl` 與 `cancelUrl`，改透過 `checkPaymentStatus` 輪詢（間隔至少 1 秒）。得到 `0110` 才呼叫 `confirm`，不能將輪詢 `0000` 當作付款成功。

## 授權與請款

預設的 `confirm` 會同時授權並請款。若你的商家帳號有開通，在 `request` 時設 `options.payment.capture: false`，`confirm` 就只授權，之後再用 `capture` 請款，或在授權過期前用 `void` 作廢。

```ts
await linePay.request({
  // ...
  options: { payment: { capture: false } }
})
// confirm 之後付款狀態是 AUTHORIZATION
await linePay.capture({ transactionId, amount, currency: 'TWD' })
```

## 預先授權付款（regKey）

`request` 時設 `options.payment.payType: 'PREAPPROVED'`，用戶第一次核准後，`confirm` 的回應會帶一個 **`regKey`**。之後用 `payPreapproved` 就可以不經用戶核准直接扣款；`checkRegKey` 查狀態，`expireRegKey` 作廢。

::: warning regKey 只會出現一次
`regKey` 只在 `confirm` 的回應裡。拿到後立刻存起來，而且要加密存放，限制誰讀得到，別寫進日誌（見[安全性](./security)）。如果 `confirm` 逾時而你靠 `reconcile` 找回付款結果，付款明細裡**沒有** regKey，函式庫會在 `notes` 裡提醒你，這種情況需要人工處理。（回應是成功、卻不符合預期的樣子時，是 `unexpected-shape` 錯誤，收到的內容留在 `error.body`，`regKey` 若在裡面可以從那裡取。）
:::

## 沙盒與正式環境

| `env`          | 主機                              |
| -------------- | --------------------------------- |
| `'sandbox'`    | `https://sandbox-api-pay.line.me` |
| `'production'` | `https://api-pay.line.me`         |

兩者的 Channel ID 與 Secret 不同，不能混用。需要走代理或固定 IP 時，見[設定](./configuration)。
