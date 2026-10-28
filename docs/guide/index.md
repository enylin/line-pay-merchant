# 簡介

line-pay-merchant 是給 Node.js 後端用的 LINE Pay Online API **V4** 函式庫。它負責簽章、傳輸與型別，並且把「付款結果不確定」當成一等公民來處理。

::: warning 預覽版
1.0 目前是 alpha。撰寫時無法取得 V4 的官方參考文件。路徑與欄位依據 LINE Pay 的 V3 API，以及獨立的 V4 用戶端與 0.9 時代文件互相印證的部分整理，全部都還沒有對 V4 沙盒實測；待確認的項目都標在原始碼的 `TODO(v4-spec)`。正式上線前，請在沙盒走過完整流程，包括對同一筆交易連續 confirm 兩次。

V3 使用者請留在 0.9.x，見[遷移指南](/migration/from-0.9)。
:::

## 它解決什麼問題

**1. 你不用自己簽章。** 每個請求的 `X-LINE-Authorization` 都由函式庫產生（HMAC-SHA256，使用 Web Crypto），並且簽的是「實際送出的那串文字」，不會因為序列化方式不同而簽錯。

**2. 交易編號不會被吃掉。** LINE Pay 的交易編號是 19 位數字，超過 JavaScript 能精確表示的整數（2^53）。一般的 `JSON.parse` 會悄悄改掉末幾位。這個函式庫在解析時把所有超出安全範圍的整數變成字串，回應裡的 `transactionId` 永遠是對的。

**3. 「逾時」不是「失敗」。** 這是最重要的一點。當 `confirm` 逾時、連線被切斷，或 LINE Pay 回「重複」，你不知道錢到底有沒有扣。多數函式庫在這裡只會丟出一個通用錯誤，然後讓你自己猜。這個函式庫：

- 在每個錯誤上標明 `outcome`：`not-sent`（確定沒送出）、`unknown`（可能已處理）、`rejected`（被拒絕）。
- 預設只重試「證明安全」的呼叫：確定沒送出的請求（任何操作），以及結果未知的**唯讀**查詢；會動到錢的請求，結果未知時**不會重送**。
- 提供 `client.reconcile()`：查付款明細，回答 `applied`、`not-applied` 或 `indeterminate`，並且附上依據。

詳見[結果未知與對帳](./unknown-outcome)。

## 它不做什麼

- 不保存訂單、不排程、不處理頁面。這些屬於你的應用程式；[範例](/recipes/)示範怎麼和它們搭配。
- 不替你判斷金額。`confirm` 的金額必須來自你的資料庫，不是網址（見[安全性](./security)）。
- 不是 LINE Pay 的文件。每個欄位的意義請看[官方文件](https://developers-pay.line.me/)。

## 需求

- Node.js 22 或更新版本（也可用於 Bun、Deno、Cloudflare Workers 等具備 `fetch` 與 Web Crypto 的環境，但只有 Node.js 有經過測試）。
- 一組 LINE Pay 的 Channel ID 與 Channel Secret Key；開發請用[沙盒帳號](https://developers-pay.line.me/sandbox)。

## 文件導覽

| 想做的事               | 去哪裡                              |
| ---------------------- | ----------------------------------- |
| 跑通第一筆沙盒付款     | [快速開始](./getting-started)       |
| 了解 request / confirm | [付款流程](./payment-flow)          |
| 處理錯誤               | [錯誤與結果](./errors)              |
| 處理逾時與重複請求     | [結果未知與對帳](./unknown-outcome) |
| 加上記錄、重試、對帳   | [Middleware](./middleware)          |
| 調整逾時、代理、多商家 | [設定](./configuration)             |
| 上線前檢查             | [安全性](./security)                |
| 在你的程式裡寫測試     | [測試](./testing)                   |
| 照著做一個完整流程     | [範例](/recipes/)                   |
| 查每個型別與函式       | [API 參考](/api/)                   |
