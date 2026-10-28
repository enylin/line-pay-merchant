# 測試

測試你的付款程式，不需要連到 LINE Pay。client 的 `fetch` 可以替換，所以你可以逐次決定 LINE Pay「回答」什麼，包括最難測的：逾時與斷線。

[`examples/payment-service.test.ts`](https://github.com/enylin/line-pay-merchant/blob/main/examples/payment-service.test.ts) 是一份完整、會在 CI 執行的範例，下面的程式碼都出自它。

## 準備

<<< @/../examples/payment-service.test.ts#harness{ts}

幾個重點：

- `middleware: []` 關掉重試。測試要自己決定每次呼叫 LINE Pay 回答什麼，不希望背景重試吃掉你預先準備的回應。
- `Response` 只能讀一次，所以每次回應前先 `clone()`，同一個預設回應就能在多個測試共用。
- LINE Pay 失敗時仍回 HTTP 200，只是 `returnCode` 不是 `0000`；測試被拒絕的情況就回這樣的內容。
- 預先準備的**成功**回應必須長得像真的：函式庫會先檢查回應的欄位（例如 confirm 的 `info.transactionId`、`info.payInfo`），才把它交給你。欄位比真的少，呼叫會以 `reason: 'unexpected-shape'` 失敗。上面的 `reservation`、`confirmation`、`capturedPayment` 是各操作最小的合法回應。

## 測試「結果未知」

這是最值得測的路徑。用 Node.js 在連線中斷時丟出的那種錯誤，模擬「請求送出後連線斷了」：

<<< @/../examples/payment-service.test.ts#unknown-outcome-test{ts}

第一個回應是連線重置（`outcome` 為 `'unknown'`），第二個是對帳去查的付款明細。你可以用同樣的方式測：

- 對帳查不到付款 → 用戶可以重試；
- 對帳也失敗 → 訂單留在 `confirming`，由背景工作稍後處理；
- 行程在送出前就掛了 → 只靠事先存下的 `ReconcileContext`。

## 測試輸入檢查

<<< @/../examples/payment-service.test.ts#forged-test{ts}

## 固定時間

對帳與背景工作會看時間。只假造 `Date`，不要假造計時器，因為請求的逾時還需要真的計時器：

```ts
vi.useFakeTimers({ toFake: ['Date'] })
vi.setSystemTime(new Date('2026-10-27T00:00:00Z'))
```

## 在沙盒測試

函式庫自己的測試資料（假的回應、簽章的測試向量）是**我們自己寫的**，其中一部分沿用 0.9 的測試向量：它們證明的是行為前後一致、符合我們對 LINE Pay 的理解，**不能**證明符合 V4 的實際行為。那一點只有沙盒能驗證。

沙盒適合驗證「函式庫和 LINE Pay 真的接得起來」，不適合放進每次 CI：它很慢，而且需要用戶在 LINE 上手動核准。建議：

- 單元測試用假的 `fetch`（如上），每次提交都跑；
- 沙盒測試放在手動觸發或排程的工作，用環境變數提供金鑰，缺少金鑰時直接略過；
- 每個新版本上線前，手動走一次[快速開始](./getting-started)的流程。

## 測試用的工具

函式庫匯出了錯誤類別與型別守衛。要測你自己的錯誤處理，可以直接建立錯誤，每個類別的建構子都接**一個物件**：

```ts
import {
  LinePayApiError,
  LinePayNetworkError,
  LinePayTimeoutError
} from 'line-pay-merchant'

// LINE Pay 回了失敗的 returnCode。category 與 outcome 由代碼推出來，也可以自己指定。
const refused = new LinePayApiError({
  body: { returnCode: '1106', returnMessage: 'rejected' },
  httpStatus: 200
})

// 連線建立前就失敗：請求確定沒有送出。
const unreachable = new LinePayNetworkError({
  reason: 'connection-refused',
  outcome: 'not-sent'
})

// 逾時：結果未知。
const slow = new LinePayTimeoutError({ timeoutMs: 20_000 })
```

每個類別接受哪些 `outcome`，型別都寫死了，不可能的組合編譯不過（例如 `LinePayHttpError` 不能是 `not-sent`：有回應，就表示請求出去了）。`LinePayError` 本身是抽象類別，不能直接建立。

但要測 `reconcile`，最可靠的是讓真的 client 打到假的 `fetch`，因為只有 client 丟出的錯誤才帶有 `context` 和 `meta`。要自己補也行：它們是普通屬性，`error.context = { operation: 'confirm', startedAt: new Date(), … }` 就可以。
