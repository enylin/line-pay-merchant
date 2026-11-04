---
layout: home

hero:
  name: line-pay-merchant
  text: LINE Pay Online API V4 的 Node.js 函式庫
  tagline: 零 runtime 依賴、完整型別。付款結果不確定的時候，它如實標成「未知」，並提供查證的方法，而不是當成失敗。
  actions:
    - theme: brand
      text: 快速開始
      link: /guide/getting-started
    - theme: alt
      text: 結果未知與對帳
      link: /guide/unknown-outcome
    - theme: alt
      text: GitHub
      link: https://github.com/enylin/line-pay-merchant

features:
  - title: 「逾時」不等於「失敗」
    details: confirm 逾時的當下，錢可能已經扣了。每個錯誤都帶著 outcome，告訴你請求有沒有送出；client.reconcile() 再去查付款明細，給你一個有憑據的答案。會動到錢的請求，結果未知時它不會替你重送。
  - title: 零 runtime 依賴
    details: 只用 Node.js 內建的 fetch 與 Web Crypto。沒有 axios、crypto-js、uuid，供應鏈風險就少一大塊。同時提供 ESM 與 CommonJS，需要 Node.js 22 以上。
  - title: 謹慎的預設值
    details: 路徑參數一律驗證、不跟隨轉址、19 位數的交易編號不會被 JavaScript 數字吃掉，錯誤物件與 client 都不會把金鑰或簽章帶進日誌。
  - title: 完整型別，可組合的 middleware
    details: 十個操作都有輸入與回應型別。重試、對帳、記錄都是 middleware，預設只重試「證明安全」的呼叫：確定沒送出的請求，以及結果未知的唯讀查詢；其餘由你決定。
---

## 安裝

```sh
npm install line-pay-merchant
```

## 十行看懂

<<< @/../examples/getting-started.ts#client{ts}

<<< @/../examples/reconcile.ts#basic{ts}

::: warning 預覽版
1.0 目前仍為 alpha。V4 Sandbox 已驗證付款請求、付款與退款明細、狀態查詢、退款，以及重複 confirm 的回應與對帳。一般付款流程也已在正式環境測試。預先授權、先授權後請款、買家已授權但尚未 confirm、混合支付及其他幣別等特殊情境仍需要額外權限或測試條件；尚未確認的部分保留 `TODO(v4-spec)`。
:::
