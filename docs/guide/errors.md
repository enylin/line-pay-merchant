# 錯誤與結果

函式庫主動丟出的錯誤都是 `LinePayError` 的子類別（`LinePayError` 本身是抽象類別，不能直接建立）。每一個都有：

| 屬性                  | 說明                                                                                                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `code`                | 穩定的字串，例如 `'LINE_PAY_API_ERROR'`，可以放心拿來分支或記錄。每個類別的 `code` 在型別裡就是它自己那一個字面值，所以用 `switch (error.code)` 分支，編譯器會把 `error` 縮窄成對應的類別（見[依 `code` 分支](#依-code-分支)）。 |
| `outcome`             | **請求有沒有生效**：`'not-sent'`、`'unknown'` 或 `'rejected'`。每個類別可能出現的值也寫在型別裡（見下表）。說明見下方。                                                                                                          |
| `operation`           | 發生在哪個操作，例如 `'confirm'`。                                                                                                                                                                                               |
| `cause`               | 底層的錯誤（例如 `fetch` 丟出的），如果有的話。逾時的是 `fetch` 被中止時丟出的 `TimeoutError`；中止的是你給 `AbortSignal` 的原因。                                                                                               |
| `meta`                | 這次呼叫的經過：`{ operation, startedAt, durationMs, attempts, httpStatus? }`，和成功時 `result.meta` 同形（見[這次呼叫的經過](#這次呼叫的經過)）。                                                                              |
| `context`             | 給 `reconcile` 用的資料：操作、開始時間、交易編號、金額、Channel ID。不含標頭、簽章或金鑰。**不可列舉**（見[記錄錯誤時](#記錄錯誤時)）。                                                                                         |
| `reconcileConclusion` | 只有 [`autoReconcile`](./unknown-outcome) 查過、卻沒能確認「已生效」時才有：`{ status, reason }`。                                                                                                                               |

`operation`、`meta`、`context` 與 `reconcileConclusion` 是 client 和 middleware 在錯誤建立**之後**才補上的，補上之前這些屬性不存在。呼叫選項不合法、輸入複製不了這類還沒有「呼叫」的錯誤，只有 `operation`，沒有 `meta` 和 `context`。

## 錯誤類別

| 類別                     | `code`                      | `outcome`               | 何時                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LinePayValidationError` | `LINE_PAY_VALIDATION_ERROR` | `not-sent`              | 輸入或設定不合法。什麼都沒送出。`issues` 列出每個欄位的問題（路徑的寫法見[輸入問題的路徑](#輸入問題的路徑)）。                                                                                                                                                                                                                      |
| `LinePayApiError`        | `LINE_PAY_API_ERROR`        | `rejected` 或 `unknown` | LINE Pay 回應了，`returnCode` 表示失敗（HTTP 狀態不是 2xx 也一樣）。                                                                                                                                                                                                                                                                |
| `LinePayHttpError`       | `LINE_PAY_HTTP_ERROR`       | `rejected` 或 `unknown` | HTTP 狀態不是 2xx 而內容又不是 LINE Pay 的回應，或 2xx 的內容不是（例如代理回的 HTML），或 2xx 的內容是 LINE Pay 的回應、卻不是這個操作該有的樣子（缺少 `info`、欄位型別不對；`reason: 'unexpected-shape'`，原始內容在 `error.body`），或回應超過 8 MiB（`reason: 'body-too-large'`）。只有 4xx 是 `rejected`，其餘一律 `unknown`。 |
| `LinePayNetworkError`    | `LINE_PAY_NETWORK_ERROR`    | `not-sent` 或 `unknown` | `fetch` 在拿到回應之前就失敗了。                                                                                                                                                                                                                                                                                                    |
| `LinePayTimeoutError`    | `LINE_PAY_TIMEOUT_ERROR`    | `unknown`               | 超過時限，LINE Pay 還沒回答。                                                                                                                                                                                                                                                                                                       |
| `LinePayAbortError`      | `LINE_PAY_ABORT_ERROR`      | `not-sent` 或 `unknown` | 你傳入的 `AbortSignal` 被觸發。                                                                                                                                                                                                                                                                                                     |
| `LinePayMiddlewareError` | `LINE_PAY_MIDDLEWARE_ERROR` | `unknown`               | middleware 交回的東西不是這個操作的結果（例如拿別的操作的結果來回答，或內容缺了欄位）。請求可能已經送出、也可能已經生效，所以是 `unknown`；錯誤帶著 `context`，可以對帳；沒有 `meta`：一個不是該有樣子的結果，它上面的數字不是這次呼叫的事實。                                                                                      |

用型別守衛來分辨，不要用 `instanceof`：

```ts
import { isLinePayApiError, isLinePayTimeoutError } from 'line-pay-merchant'
```

::: tip 為什麼不用 `instanceof`
同一個套件可能因為 ESM 與 CommonJS 並存而被載入兩次，`instanceof` 在兩份之間會是 `false`。型別守衛檢查的是跨模組共用的標記，兩份都認得。
:::

## 依 `code` 分支

`isLinePayError(error)` 把 `error` 縮窄成 `AnyLinePayError`，也就是上表七個類別的聯集。用 `switch (error.code)` 分支時，每個 `case` 裡的 `error` 就是那個類別，它的欄位（`issues`、`returnCode`、`timeoutMs`……）可以直接用，`error.outcome` 也只剩那個類別可能有的值。不要寫 `default`：之後新增類別時，編譯器會要求你補上這一支。

<<< @/../examples/errors.ts#code{ts}

## outcome：請求有沒有生效

這是這個函式庫最重要的概念。**失敗的種類，決定你能不能再試一次。**

| `outcome`  | 意思                                                     | 你該怎麼做                                                                                                                                             |
| ---------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `not-sent` | 請求**確定**沒有送出（連線建立前就失敗，或輸入不合法）。 | 不會有錢被動到。連線建立前失敗的，原樣重試即可（預設的 middleware 會自動重試網路層的這一種）；輸入不合法的，先修正輸入，原樣重試只會再失敗。           |
| `rejected` | LINE Pay 收到並**拒絕**了。                              | 看 `returnCode`；通常修正後重送，或告知用戶。**重複代碼（`category: 'duplicate'`，見[下方](#line-pay-的-returncode)）例外**：先問 `needsReconcile()`。 |
| `unknown`  | 請求**可能**已經被處理，但沒有拿到可信的回應。           | **不要當成失敗，也不要重送。**會動到錢的操作請[對帳](./unknown-outcome)。                                                                              |

`outcome` 是所有 `LinePayError` 都有的屬性，可以直接拿來分支：

<<< @/../examples/errors.ts#outcome{ts}

## 處理錯誤的寫法

<<< @/../examples/errors.ts#branch{ts}

## 輸入問題的路徑

`LinePayValidationError` 的 `issues[].path` 不論是哪一層發現的問題，寫法都一樣：欄位怎麼取，路徑就怎麼寫，例如 `amount`、`packages[0].products[1].price`、`transactionId[2]`。輸入的路徑從輸入物件算起；整個輸入本身有問題（不是物件、複製不了）時是 `input`。

- 呼叫選項（第二個參數）的問題是 `options.timeout`、`options.signal`。`request` 的輸入自己也有 `options` 欄位，它的路徑長得像 `options.payment.capture`；呼叫選項只有那兩個欄位，所以不會混淆。
- 設定的問題（`createLinePayClient` 的設定、`retryWhenNotSent` 這類 middleware 的選項、`client.with()`）路徑從設定物件算起：`channelId`、`timeouts.refund`、`maxAttempts`、`middleware[0]`；執行環境不合格是 `runtime`。
- 訊息的開頭也分得出是哪一種：`Invalid input for confirm:`（輸入，知道是哪個操作時）、`Invalid input:`、`Invalid configuration:`。

## 這次呼叫的經過

呼叫失敗時，`error.meta` 說明它是怎麼失敗的，和成功時 `result.meta` 同形（見 [`CallMeta`](/api/interfaces/CallMeta)）：

- `attempts`：請求試了幾次，包含從頭到尾沒連上的。重試 middleware 放棄時，錯誤上寫的是它試過的總數；被拒絕的輸入（還沒送出）算一次。
- `durationMs`：從呼叫開始到放棄的總時間，含重試之間的等待。
- `httpStatus`：最後一次回應的 HTTP 狀態。沒有回應（網路錯誤、逾時、中止、輸入被拒）就沒有這個欄位。

`error.meta.startedAt` 和 `error.context.startedAt` 是同一個時間。

## LINE Pay 的 returnCode

LINE Pay（V3）即使在失敗時也回 **HTTP 200**，結果放在 `returnCode`；V4 預期也是如此，但還沒有對照官方規格驗證。所以：

- `LinePayApiError` 的 `returnCode` / `returnMessage` 就是 LINE Pay 說的原文，`httpStatus` 是 HTTP 狀態。
- 就算 HTTP 狀態不是 2xx，只要內容是 LINE Pay 格式的失敗回應，仍然是 `LinePayApiError`，不會被降級成 `LinePayHttpError`：這樣重複代碼（`category: 'duplicate'`）不會因為狀態碼而漏掉。`outcome` 依狀態與代碼決定：任何非 2xx HTTP 狀態都視為 `'unknown'`（包括代理或閘道回的 400、408、429），因為請求可能已經被轉給 LINE Pay。`returnCode` 仍保留作為診斷與對帳線索，但非 2xx 不能單獨證明付款或退款沒有生效。
- `0000` 是成功；唯一的例外是 `checkPaymentStatus`，在那裡 `0000` 的意思是用戶**還沒**核准（見[付款流程](./payment-flow)）。其他以 `0` 開頭的代碼是**狀態碼**，只有 `checkPaymentStatus` 會用到，會原樣回傳而不是丟出。其他操作如果收到這種代碼，函式庫無從判斷呼叫的結果，會丟出 `outcome` 為 `'unknown'` 的 `LinePayApiError`（會動到錢的操作於是可以對帳）。
- `1152`、`1165`、`1172`、`1198` 被標成 `category: 'duplicate'`：表示這個請求重複了（交易已存在、已經退款、相同的呼叫正在處理……），**第一次可能已經成功**。它們的 `outcome` 是 `'rejected'`（**這一次**呼叫被拒了），但對可對帳的操作（`confirm`、`capture`、`void`、`refund`、`payPreapproved`），`needsReconcile()` 對它們回傳 `true`，所以處理錯誤時要**先**問 `needsReconcile()`，再看 `returnCode`。
- `1145`、`1179`、`1199`、`1280`、`1999`、`2042`、`9000` 與 `1900`–`1909` 被標成 `category: 'unresolved'`：LINE Pay 內部出錯、還在處理這筆付款，或此刻無法處理它（常常正是先前那次呼叫的結果）。這**不是拒絕**：`outcome` 是 `'unknown'`，可對帳的操作 `needsReconcile()` 為 `true`，對帳也會去查。這份清單部分依照舊文件整理，並非完整的 V4 官方代碼表。官方 V4 明確允許退款與取消授權的 1999 重試，但本 SDK 仍採保守對帳後再決定是否重試；沒列到的代碼會被當成拒絕（標在原始碼的 `TODO(v4-spec)`）。
- 其餘代碼都是 `'unclassified'`。完整的代碼表請看[官方文件](https://developers-pay.line.me/)。

## 記錄錯誤時

- `JSON.stringify(error)`、`console.log(error)`、`console.error({ error })` 與 `util.inspect(error)` 輸出的是一份**白名單**（`toJSON()` 的內容，型別是 `LinePayErrorJSON`）：堆疊（如果有）加上 `name`、`code`、`message`、`outcome`、`operation`、`meta`（`startedAt` 是 ISO 8601 字串）、`reconcileConclusion`、HTTP 狀態、`returnCode` 等；沒有值的欄位直接省略。**不含**回應內容、標頭、簽章、金鑰，也不含 `context` 和 `cause` 的細節。
- `error.body`、`error.bodyText`（`LinePayHttpError`，已截到 2 KB）與 `error.context` **不可列舉**。會複製錯誤物件屬性的記錄工具（pino 的 `err` serializer、`{ ...error }`）不會把它們帶進去，這很重要：回應裡可能有 `regKey`、遮罩過的卡號或地址（不符該操作承諾的回應，會整個留在 `error.body`），`context` 則有訂單與交易編號、金額。需要時用名字自己取，並先確認裡面沒有不該寫下來的東西。要記錄錯誤，記 `error.toJSON()`，或自己挑欄位。
- 錯誤物件不能用 `structuredClone` 或 `postMessage` 傳：複製出來的是一個普通的 `Error`，只留下名稱、訊息、堆疊與 `cause`，類別和其他欄位都沒了。要傳到別處，傳 `error.toJSON()`。
- 上面那份輸出裡 `cause` 的訊息，若有提到網址，網址的路徑會被去掉，因為有些呼叫的路徑裡帶著 `regKey`。
- client 本身可以安全地序列化：它只有方法，沒有金鑰。
