# 常見問題

## 為什麼 `confirm` 逾時了，用戶卻被扣款？

因為「逾時」只代表你沒等到回應，不代表請求沒被處理。見[結果未知與對帳](./unknown-outcome)。

## 可以直接重試 `refund` 嗎？

不行。退款不是冪等的，重送可能退兩次。請先[對帳](./unknown-outcome#退款要特別小心)，或到商家後台確認。

## 為什麼 `transactionId` 是字串？

LINE Pay 的交易編號有 19 位，超過 JavaScript 數字能精確表示的整數（2^53 ≈ 9.007 × 10^15）。一般的 `JSON.parse` 會把 `2021121300698360310` 悄悄變成 `2021121300698360300`。這個函式庫在解析時把所有超出安全範圍的整數都變成字串，所以回應裡的編號永遠是對的；你傳進去的編號也必須是字串。存進資料庫時也一樣：用文字欄位，不要用 `BIGINT`（見[兩個編號](./payment-flow#兩個編號)）。

## 為什麼失敗的呼叫是 HTTP 200？

這是 LINE Pay 的設計：HTTP 層只表示「請求有被處理」，結果放在 `returnCode`。函式庫已經替你判斷，`returnCode` 表示失敗時會丟出 `LinePayApiError`。

## `request` 逾時了，可以再呼叫一次嗎？

`request` 只預留付款，不動到錢；用戶還沒拿到付款網址，所以不會有扣款。要重新發起時，請先查官方文件對重複 `orderId` 的處理，必要時換一個新的 `orderId`。

## 為什麼 `env: 'development'` 不能用了？

改名為 `'sandbox'`，和 LINE Pay 的用語一致。傳 `'development'` 會得到指出新名稱的錯誤訊息。

## 還支援 V3 嗎？

不支援。1.0 只支援 V4。V3 請留在 0.9.x。

## 支援哪些幣別？

型別目前列出 `TWD`、`USD`、`THB`。日本的 LINE Pay 已於 2025 年結束服務，所以 `JPY` 已移除。以官方文件為準。

## 可以用在 Cloudflare Workers、Deno、Bun 嗎？

函式庫本身只用 `fetch`、Web Crypto 與 `AbortSignal`，沒有任何 `node:` 模組，理論上可以。但目前只在 Node.js 22、24、26 上測試，Workers、Deno、Bun 上沒有跑過任何東西。

要在那裡確認一件事：每個請求都以 `redirect: 'error'` 送出，這樣簽過章的請求不會被轉送到別的主機。Cloudflare 的文件列出了這個值，但至少有一個專案回報 Workers 不接受它。執行環境若對它丟出錯誤，每次呼叫都會在送出之前失敗，而且是算作 `unknown` 的錯誤：方向是安全的，但沒有用。遇到這種情況，請傳入一個 `fetch`，改送 `redirect: 'manual'`，自己對 3xx 的回應丟出錯誤，保證才不會落空：

```ts
const noRedirects: typeof fetch = async (input, init) => {
  const response = await fetch(input, { ...init, redirect: 'manual' })
  if (response.status >= 300 && response.status < 400) {
    throw new TypeError('LINE Pay answered with a redirect')
  }
  return response
}
```

## 支援 CommonJS 嗎？

支援。同時提供 ESM 與 CommonJS。

## 我可以只用簽章，自己發請求嗎？

簽章不是獨立的公開 API。需要完全自訂傳輸時，傳入自己的 `fetch`（見[設定](./configuration)）；簽章仍由函式庫產生。

## 怎麼回報問題？

到 [GitHub Issues](https://github.com/enylin/line-pay-merchant/issues)。請附上函式庫版本、Node.js 版本，以及**去除金鑰**的錯誤內容（`JSON.stringify(error)` 輸出的是安全的白名單）。
