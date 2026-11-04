# Middleware

Middleware 是包住每一次呼叫的函式。重試、對帳、記錄、限流、指標，都可以寫成 middleware，不需要改動函式庫。

```ts
import type { Middleware } from 'line-pay-merchant'

const myMiddleware: Middleware = async (ctx, next) => {
  // 呼叫之前
  const result = await next() // 內層的 middleware，最後是真正的請求
  // 呼叫之後
  return result
}
```

## ctx 與 next

| `ctx`       | 說明                                                    |
| ----------- | ------------------------------------------------------- |
| `operation` | 操作名稱：`'request'`、`'confirm'`、…。                 |
| `input`     | 傳給操作的輸入。依 `operation` 縮窄型別（見下方範例）。 |
| `options`   | 這次呼叫的 `{ timeout, signal }`。                      |
| `startedAt` | 呼叫開始的時間。                                        |
| `client`    | 這次呼叫所屬的 client，帶著完整的 middleware 堆疊。     |

`next()` 回傳 `{ body, meta }`，或丟出 `LinePayError`。**可以呼叫多次**（重試就是這樣做的），但請記得：會動到錢的操作，結果未知時重送是危險的。

## 順序

先註冊的在最外層：

```ts
createLinePayClient({
  // ...
  middleware: [a, b, c]
})
// a 看到的是最終結果；c 最靠近真正的請求。
```

沒有指定 `middleware` 時，預設是 `[retryWhenNotSent()]`。傳 `[]` 就是完全不要。

`client.with(...)` 回傳**新的** client，把新的 middleware 加在既有堆疊的**內側**；原本的 client 不受影響：

```ts
const linePay = createLinePayClient(config) // [retryWhenNotSent()]
const reconciling = linePay.with(autoReconcile()) // [retryWhenNotSent(), autoReconcile()]
```

## 內建

### retryWhenNotSent

只在「**證明**重試是安全的」時才重試，使用指數退避與完全抖動（full jitter）：

- 請求確定沒送出（連線被拒、DNS 失敗、網路不可達，而且發生在**建立連線或解析名稱**的階段），**任何操作**都重試。連線已建立、甚至回應已經開始之後的失敗，即使錯誤碼相同（核心有時把這種斷線也報成 `ECONNREFUSED`），也只是結果未知。
- 唯讀操作（`paymentDetails`、`checkPaymentStatus`、`checkRegKey`），結果未知時（逾時、連線中斷、5xx、讀不懂的回應）也重試；LINE Pay 明確拒絕（`rejected`）與用戶自己中止不重試。例外：帶 `creditCardAuth` 的 `checkRegKey` 會在信用卡上做一次授權，不算唯讀，結果未知時不重試。
- 會動到錢的操作，結果未知時**絕不重試**。

| 選項          | 預設   | 說明                     |
| ------------- | ------ | ------------------------ |
| `maxAttempts` | `3`    | 總共嘗試幾次，含第一次。 |
| `baseDelayMs` | `200`  | 退避的起點（毫秒）。     |
| `maxDelayMs`  | `2000` | 單次等待的上限（毫秒）。 |

### autoReconcile

結果未知時自動查證，見[結果未知與對帳](./unknown-outcome#自動對帳-autoreconcile)。

## 自己寫

### 記錄每一次呼叫

<<< @/../examples/middleware.ts#logging{ts}

注意 `ctx.input` 會依 `ctx.operation` 縮窄型別，所以 `ctx.operation === 'confirm'` 之後可以直接讀 `transactionId`。

### 擋掉某個操作

<<< @/../examples/middleware.ts#guard{ts}

### 組合起來

<<< @/../examples/middleware.ts#compose{ts}

## 撰寫守則

- **預設只呼叫一次 `next()`。**要重複，先想清楚為什麼那樣安全。
- **不要吞掉 `LinePayError`。**要嘛處理並回傳結果，要嘛原樣丟出去。
- **不要修改 `ctx`。**它是唯讀的，而且同一個 `ctx` 會傳給所有 middleware。
- **交回的要是這個操作的結果。**回了別的操作的結果、或內容缺了欄位，client 會丟出 `LinePayMiddlewareError`（`outcome` 是 `'unknown'`：請求可能已經送出，錯誤帶著 `context`，可以對帳）。
- 對帳的查詢（`paymentDetails`）也會經過整個堆疊，所以你的記錄 middleware 會看到它們。
