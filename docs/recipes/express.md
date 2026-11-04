# Express

先讀[範例總覽](./)，了解 `createPaymentService` 做了什麼。這一頁只處理 HTTP 的部分。

## 路由

<<< @/../examples/express.ts#routes{ts}

- `req.query` 直接交給 `confirmPayment`，由 `parseConfirmQuery` 檢查。Express 把重複的參數解析成陣列、巢狀的鍵解析成物件，這些都會被拒絕。
- Express 5 會把非同步 handler 的拒絕交給錯誤處理 middleware。Express 4 需要自己包（`express-async-errors` 或手動 `try/catch`）。
- `LinePayValidationError` 對應 400；其餘交給你原本的錯誤處理。
- `in-progress` 回 202：付款可能已經成功，只是還不知道。頁面可以自動重新整理，或用輪詢查訂單狀態。**不要告訴用戶付款失敗。**

## 組起來

<<< @/../examples/server.ts#wiring{ts}

最後一段是背景工作：每分鐘處理一次沒拿到答案的 `confirm`。詳見[背景對帳](./background-job)。

## 多個實例

可以放心地同時跑多個實例，也可以同時有多個背景工作：每一個轉換都是條件更新，只有一個會贏。
