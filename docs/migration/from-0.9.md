# 從 0.9 升級到 1.0

1.0 是一次破壞性的改版，同時做了三件事：改用 LINE Pay **V4**、改成**零 runtime 依賴**，以及修正 0.9 的幾個會造成錯誤行為的缺陷。多數呼叫只是換了形狀，名稱沒變。

::: tip 如果你還在用 V3
1.0 只支援 V4。V3 請留在 0.9.x：`npm install line-pay-merchant@0.9`。
:::

## 先看這幾點

| 變更                               | 影響                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| 只支援 **V4**                      | 路徑、部分欄位與回應都不同；請以[官方文件](https://developers-pay.line.me/)為準。 |
| Node.js **22+**                    | 0.9 宣告支援 10.12 到 17。                                                        |
| 零依賴                             | 移除 axios、crypto-js、uuid；改用內建的 `fetch` 與 Web Crypto。                   |
| `env: 'development'` → `'sandbox'` | 舊值會得到指向新名稱的錯誤訊息。                                                  |
| 呼叫形狀                           | 不再有 `.send({ body, params })`；一個扁平的輸入物件加上可選的呼叫設定。          |
| 回傳 `{ body, meta }`              | `comments` 改為有型別的 `meta`。                                                  |
| handler → middleware               | 不再可變；**順序相反**；內建的行為也不同。                                        |
| 錯誤類別改名並加上 `outcome`       | 用型別守衛，不要用 `instanceof`。                                                 |
| 移除 `JPY`                         | LINE Pay Japan 已結束服務。                                                       |

## 逐步升級

### 1. 設定

```ts
// 0.9
createLinePayClient({ channelId, channelSecretKey, env: 'development' })

// 1.0
createLinePayClient({ channelId, channelSecretKey, env: 'sandbox' })
```

新增了 `timeouts`、`fetch`、`baseUrl`、`merchantDeviceProfileId`、`merchantDeviceType`（這兩個要一起設定）、`middleware`、`validate`，見[設定](/guide/configuration)。`timeout` 在 0.9 就有，但沒有作用（見下面的 A3）。設定會在建立時驗證。

### 2. 呼叫

扁平的輸入物件：路徑參數與 body、query 欄位放在一起。

```ts
// 0.9
await client.request.send({
  body: { amount, currency, orderId, packages, redirectUrls }
})
await client.confirm.send({ transactionId, body: { amount, currency } })
await client.refund.send({ transactionId, body: { refundAmount: 20 } })
await client.paymentDetails.send({ params: { transactionId: ['…'] } })
await client.checkPaymentStatus.send({ transactionId, params: {} })

// 1.0
await client.request({ amount, currency, orderId, packages, redirectUrls })
await client.confirm({ transactionId, amount, currency })
await client.refund({ transactionId, refundAmount: 20 })
await client.paymentDetails({ transactionId: ['…'] })
await client.checkPaymentStatus({ transactionId })
```

第二個參數是這次呼叫的設定：`{ timeout, signal }`。操作名稱與 0.9 相同。

### 3. 回傳值

```ts
// 0.9
const { body, comments } = await client.confirm.send(...)

// 1.0
const { body, meta } = await client.confirm(...)
// meta: { operation, startedAt, durationMs, attempts, httpStatus?, recovered? }
```

1.0 的 `body` 型別是檢查出來的，不是假設的：回應在回傳之前，會對照該操作的型別逐欄位檢查。缺少型別中某個欄位的回應（例如探索 V4 沙盒時可能遇到）是 `unexpected-shape` 錯誤，結果為 `unknown`，原始內容在 `error.body`。

### 4. Handler 換成 middleware

| 0.9                                                            | 1.0                                                                          |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `api.addHandler(fn)`                                           | `createLinePayClient({ middleware })`，或 `client.with(fn)`（回傳新 client） |
| `createTimeoutRetryHandler()`                                  | `retryWhenNotSent()`，**預設就啟用**，而且只在確定安全時才重試               |
| `createPaymentDetailsRecoveryHandler(paymentDetailsToConfirm)` | `autoReconcile()`，或手動 `client.reconcile(error)`                          |
| `paymentDetailsToRefund`                                       | `reconcile` 對退款更保守：光看付款明細，絕不回 `not-applied`                 |

```ts
// 0.9：每次呼叫都要掛
const res = await linePayClient.confirm
  .addHandler(createTimeoutRetryHandler())
  .addHandler(createPaymentDetailsRecoveryHandler(paymentDetailsToConfirm))
  .send({ transactionId, body: { currency: 'TWD', amount: 1000 } })

// 1.0：建立 client 時決定一次
const linePay = createLinePayClient(config).with(autoReconcile())
const { body, meta } = await linePay.confirm({
  transactionId,
  currency: 'TWD',
  amount: 1000
})
```

::: warning 順序相反
0.9：**先加入的**較晚執行（在內層）。1.0：**先註冊的**在**最外層**。自己寫過 handler 的人請重新檢查順序。
:::

自己寫的 handler 要改成 `(ctx, next) => …`，見 [Middleware](/guide/middleware)。

### 5. 錯誤

| 0.9                                     | 1.0                                                                                                                                               |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `LinePayApiError` / `isLinePayApiError` | 同名，但屬性改名：`statusCode` → `httpStatus`、`data` → `body`；新增 `outcome`、`category`。**`error.data.returnCode` 要改成 `error.returnCode`** |
| `HttpError` / `isHttpError`             | `LinePayHttpError` / `isLinePayHttpError`；屬性同樣改名：`statusCode` → `httpStatus`、`data` → `body`                                             |
| `TimeoutError` / `isTimeoutError`       | `LinePayTimeoutError` / `isLinePayTimeoutError`                                                                                                   |
| 裸的 `SyntaxError`、裸的連線 `Error`    | `LinePayHttpError`（內容不是 LINE Pay 的回應）、`LinePayNetworkError`                                                                             |
| （沒有）                                | `LinePayValidationError`、`LinePayAbortError`、`LinePayMiddlewareError`，以及共同的 `LinePayError`                                                |

```ts
// 0.9
if (e instanceof TimeoutError) { … }

// 1.0
if (isLinePayTimeoutError(e)) { … }   // 或看 e.outcome
```

所有錯誤的 `name` 都是各自的類別名稱（0.9 全是 `"Error"`），並帶有 `cause`。見[錯誤與結果](/guide/errors)。

### 6. 型別

| 0.9                                                                                                                                                                               | 1.0                                                                                                                    |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `LineMerchantConfig`                                                                                                                                                              | `LinePayConfig`                                                                                                        |
| `RequestRequestBody` / `RequestResponseBody`                                                                                                                                      | `RequestPaymentInput` / `RequestPaymentResponse`                                                                       |
| `ConfirmRequestBody` / `ConfirmResponseBody`                                                                                                                                      | `ConfirmInput`（含 `transactionId`）/ `ConfirmResponse`                                                                |
| `CaptureRequestBody` / `CaptureResponseBody`                                                                                                                                      | `CaptureInput` / `CaptureResponse`                                                                                     |
| `VoidRequestBody` / `VoidResponseBody`                                                                                                                                            | `VoidInput` / `VoidResponse`                                                                                           |
| `RefundRequestBody` / `RefundResponseBody`                                                                                                                                        | `RefundInput` / `RefundResponse`                                                                                       |
| `PaymentDetailsRequestParams` / `…ResponseBody`                                                                                                                                   | `PaymentDetailsInput` / `PaymentDetailsResponse`                                                                       |
| `CheckPaymentStatusRequestParams`                                                                                                                                                 | `CheckPaymentStatusInput`                                                                                              |
| `CheckRegKeyRequestParams`                                                                                                                                                        | `CheckRegKeyInput`                                                                                                     |
| `PayPreapprovedRequestBody` / `…ResponseBody`                                                                                                                                     | `PayPreapprovedInput` / `PayPreapprovedResponse`                                                                       |
| `ExpireRegKeyRequestBody` / `…ResponseBody`                                                                                                                                       | `ExpireRegKeyInput` / `ExpireRegKeyResponse`                                                                           |
| `Payment`、`Display`、`Extra`、`FamilyService`、`RequestOptions`、`RequestShipping`（`request` 的選項）                                                                           | `PaymentOptions`、`DisplayOptions`、`ExtraOptions`、`FamilyServiceOptions`、`RequestPaymentOptions`、`ShippingOptions` |
| `Fields`、`Refund`、`Event`（付款明細）                                                                                                                                           | `PaymentDetailsFields`、`RefundEntry`、`PromotionEvent`                                                                |
| `GeneralResponseBody`、`CheckPaymentStatusResponseBody`                                                                                                                           | `LinePayResponse`、`CheckPaymentStatusResponse`                                                                        |
| `ConfirmPayInfo`、`CapturePayInfo`、`PaymentDetailsPayInfo`；`ConfirmPackage`、`PaymentDetailsPackage`；`ConfirmShipping`、`PaymentDetailsShipping`、`CheckPaymentStatusShipping` | `PayInfo`；`ResponsePackage`；`SelectedShipping`                                                                       |
| `PaymentUrl` 與各個 `*Info`（`RequestInfo`、`ConfirmInfo`、…）                                                                                                                    | 回應型別的一部分：`RequestPaymentResponse['info']`、`ConfirmResponse['info']`…                                         |
| `*RequestConfig`、`ApiHandler`、`PaymentApi`、`HttpClient`、`HttpConfig`、`HttpResponse`、`QueryParams`、`EmptyObject`、`GeneralRequestConfig`                                    | 移除（0.9 的內部細節）。用 `Middleware`、`LinePayClient`                                                               |

0.9 為了避免撞名而加的別名（`ConfirmPayInfo`、`CapturePayInfo`…）不再需要：共用的型別只有一份，例如 `PayInfo`、`Product`、`Address`。

## 修正了哪些問題

0.9 有幾個會造成錯誤行為的缺陷，1.0 已經修正，並各有回歸測試：

| 編號 | 0.9 的問題                                                                                                                                                       | 1.0                                                                             |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| A1   | `addHandler()` 修改共用的陣列。在每次請求裡註冊 handler，清單每次多一份，而每一份重試 handler 都各自重試，次數於是相乘（預設重試 10 次，每多一份就多乘 11 倍）。 | client 不可變；`with()` 回傳新 client。                                         |
| A2   | `paymentDetailsToRefund` 在退款逾時後，只要原交易存在就回報成功，而且用的是**原交易**的編號與日期，完全不看 `refundList`。                                       | `reconcile` 只看 `refundList`，找不到絕不回 `applied`，也絕不回 `not-applied`。 |
| A3   | `createLinePayClient({ timeout })` 無效：每個 API 都明確傳預設值蓋掉了它。                                                                                       | 優先順序：呼叫 → `timeouts[op]` → `timeout` → 預設。                            |
| A4   | `transactionId`、`regKey` 原樣放進簽章過的路徑，`../` 可以改寫路徑。                                                                                             | 一律驗證與編碼。                                                                |
| A5   | 502 加 HTML、200 加 HTML、200 空內容丟出裸的 `SyntaxError`；連線被拒丟出裸的 `Error`。                                                                           | 全部分類成 `LinePay*Error`，並帶 `outcome`。                                    |
| A6   | `originalTransactionId` 等欄位的 19 位數字被當成數字，末幾位失真。                                                                                               | **任何**欄位的超出安全範圍的整數都是字串。                                      |

另外：重試不再把「確定沒送出」和「送出了但不知道結果」混為一談。0.9 預設最多重試 10 次、每次間隔 5 秒，`confirm` 最壞要卡 490 秒，而且可以掛在退款上。

## 行為上的差異（升級時最容易漏看）

| 項目                       | 0.9                                           | 1.0                                                                                                                                                         |
| -------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 多個值的查詢參數           | `transactionId=1%2C2`（逗號相連後再編碼）。   | 重複的鍵：`transactionId=1&transactionId=2`。V4 接受哪一種尚待驗證（`TODO(v4-spec)`），升級後請在沙盒用兩個值查一次。                                       |
| 以 `0` 開頭的 `returnCode` | 每一個都當成成功，對所有 API 都一樣。         | 只有 `0000` 是成功。其他以 `0` 開頭的是**狀態碼**，只有 `checkPaymentStatus` 會原樣回傳；其他操作收到時丟出 `outcome` 為 `'unknown'` 的 `LinePayApiError`。 |
| 輸入檢查                   | 不檢查，原樣送出。                            | `validate` 預設開啟，0.9 能送出的壞輸入（金額加不起來、不認得的欄位）現在會在送出前丟出 `LinePayValidationError`。                                          |
| 輸入的形式                 | 什麼物件都收。                                | 只收純資料：class 實例、帶 getter 的物件會被拒絕（見[設定](/guide/configuration#validate)）。                                                               |
| 套件的入口                 | 可以 deep import 套件裡的檔案。               | 只匯出套件根目錄（`exports`），deep import 會失敗。                                                                                                         |
| 代理                       | axios 預設遵守 `HTTP_PROXY` / `HTTPS_PROXY`。 | 內建的 `fetch` 預設**不會**；要設 `NODE_USE_ENV_PROXY=1`，見[設定](/guide/configuration#代理與固定-ip)。                                                    |

## 檢查清單

1. [ ] Node.js 升到 22 以上。
2. [ ] `env: 'development'` → `'sandbox'`。
3. [ ] 呼叫改成扁平輸入，回傳改讀 `{ body, meta }`（搜尋 `.send(`）。
4. [ ] 移除 `addHandler`、`createTimeoutRetryHandler`、`createPaymentDetailsRecoveryHandler`；決定要不要用 `autoReconcile()`。
5. [ ] `instanceof` 改成型別守衛（搜尋 `instanceof HttpError`、`instanceof TimeoutError`）。
6. [ ] 型別改名（見上表）。
7. [ ] 移除 `JPY`。
8. [ ] 確認所有 V4 的欄位差異（對照官方文件）。
9. [ ] 在**沙盒**走過完整流程：request、confirm、退款、以及用兩次 confirm 驗證重複的處理。
10. [ ] 把 `confirm` 前先存 `ReconcileContext` 的做法加進你的訂單流程（見[背景對帳](/recipes/background-job)）。
